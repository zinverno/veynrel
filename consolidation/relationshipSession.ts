import type { App } from "obsidian";
import { ApiRequestError, buildChatBody } from "../api";
import type { CallOptions } from "../api";
import { PROVIDER_PROFILES } from "../constants";
import { currentLanguage } from "../i18n";
import type { LanguageModelSettingsPort, LanguageModelSettingsSnapshot } from "../deep/product/languageModelSettingsPort";
import { validAnalysisSettings } from "../deep/product/validateLanguageModelSettings";
import { readSavedNote, sameSavedNote } from "./savedNote";
import type { SavedNote } from "./savedNote";
import { RelationshipError, RELATIONSHIP_SINGLE_SCHEMA } from "./relationshipContract";
import { prepareEvidenceCatalog, evidenceRequest, validateEvidenceResponse } from "./relationshipEvidence";
import type { EvidenceCatalog } from "./relationshipEvidence";
import type { EvidenceDiagnostic } from "./relationshipDiagnostics";
import type { RelationshipFailure, RelationshipResult } from "./relationshipContract";
import { RELATIONSHIP_LIMITS, relationshipOptions, relationshipPrompt } from "./relationshipPrompt";
import { relationshipReport } from "./relationshipReport";
import type { RelationshipAttempt } from "./relationshipReport";

export type RelationshipPair = readonly [SavedNote, SavedNote];
export interface RelationshipAnalysis { pair: RelationshipPair; result: RelationshipResult; provider: string; model: string }
export interface RelationshipConsent {
  provider: string;
  model: string;
  endpoint: string;
  paths: readonly [string, string];
  characters: readonly [number, number];
  body: string;
  bytes: number;
  maxTokens: number;
  reasoning: "disabled" | "low" | "provider";
  evidence?: { fragments: number; uncoveredCharacters: readonly number[] };
}
export interface RelationshipView {
  stage: "idle" | "preparing" | "consent" | "running" | "result" | "error" | "stale" | "cancelled" | "dismissed";
  consent?: RelationshipConsent;
  result?: RelationshipResult;
  error?: RelationshipFailure;
  httpStatus?: number;
  diagnostics?: readonly EvidenceDiagnostic[];
}
export interface RelationshipDependencies {
  settings: Pick<LanguageModelSettingsPort, "get" | "subscribe">;
  read(): Promise<RelationshipPair>;
  complete(settings: LanguageModelSettingsSnapshot, system: string, user: string, signal: AbortSignal, options: Readonly<CallOptions>): Promise<string>;
}

export async function readRelationshipPair(app: App, paths: readonly [string, string]): Promise<RelationshipPair> {
  if (paths[0] === paths[1]) throw new RelationshipError("source");
  const [a, b] = await Promise.all(paths.map(path => readSavedNote(app, path)));
  if (a.state !== "ready" || b.state !== "ready") throw new RelationshipError("source");
  return [a, b];
}
function samePair(a: RelationshipPair, b: RelationshipPair): boolean {
  return a.every((note, i) => sameSavedNote(note, b[i]));
}

/** Ephemeral consent/result; one request per confirmation, no retries or persistence. */
export class RelationshipSession {
  view: RelationshipView = { stage: "idle" };
  onChange: () => void = () => {};
  private analysis?: RelationshipAnalysis;
  private attempt?: RelationshipAttempt;
  get errorReport(): ReturnType<typeof relationshipReport> | undefined {
    return this.view.stage === "error" ? relationshipReport(this.view, this.attempt) : undefined;
  }
  private generation = 0;
  private closed = false;
  private request?: AbortController;
  private prepared?: { pair: RelationshipPair; catalog: EvidenceCatalog; settings: LanguageModelSettingsSnapshot; system: string; user: string; options: Readonly<CallOptions> };
  private readonly unsubscribe: () => void;
  private settingsStamp: string;
  constructor(private readonly deps: RelationshipDependencies) {
    this.settingsStamp = this.stamp();
    this.unsubscribe = deps.settings.subscribe(() => {
      if (this.settingsStamp !== this.stamp()) { this.settingsStamp = this.stamp(); this.invalidate(); }
    });
  }
  get analysisSource(): RelationshipAnalysis | undefined {
    if (this.settingsStamp !== this.stamp()) this.invalidate();
    return this.view.stage === "result" ? this.analysis : undefined;
  }
  get busy(): boolean { return this.view.stage === "preparing" || this.view.stage === "running"; }
  private stamp(): string { return JSON.stringify(this.deps.settings.get()); }
  private current(generation: number, stamp: string): boolean {
    if (this.closed || generation !== this.generation) return false;
    if (stamp !== this.stamp()) { this.invalidate(); return false; }
    return true;
  }
  private publish(view: RelationshipView): void { if (!this.closed) { this.view = view; this.onChange(); } }
  private clear(stage: "stale" | "cancelled" | "dismissed"): void {
    this.attempt = undefined;
    this.generation++; this.request?.abort(); this.request = undefined; this.prepared = undefined; this.analysis = undefined;
    this.publish({ stage });
  }
  invalidate(): void { this.clear("stale"); }
  cancel(): void { this.clear("cancelled"); }
  dismiss(): void { this.clear("dismissed"); }
  close(): void {
    this.closed = true; this.clear("cancelled"); this.view = { stage: "idle" };
    this.unsubscribe(); this.onChange = () => {};
  }
  async prepare(): Promise<void> {
    if (this.closed || this.busy) return;
    const generation = ++this.generation, settings = { ...this.deps.settings.get() }, stamp = JSON.stringify(settings);
    this.prepared = undefined; this.analysis = undefined; this.settingsStamp = stamp;
    this.attempt = { provider: settings.provider, model: settings.model, dispatched: false, completed: false };
    this.publish({ stage: "preparing" });
    try {
      if (!validAnalysisSettings(settings)) throw new RelationshipError("configuration");
      const pair = await this.deps.read();
      if (!this.current(generation, stamp)) return;
      const characters: [number, number] = [pair[0].content.length, pair[1].content.length];
      if (characters.some(n => n > RELATIONSHIP_LIMITS.noteCharacters) || characters[0] + characters[1] > RELATIONSHIP_LIMITS.pairCharacters) throw new RelationshipError("tooLarge");
      const catalog = prepareEvidenceCatalog(pair);
      const system = relationshipPrompt(currentLanguage()), user = evidenceRequest(catalog);
      const options = relationshipOptions(settings);
      const body = JSON.stringify(buildChatBody(settings, system, user, options));
      const bytes = new TextEncoder().encode(body).byteLength;
      if (bytes > RELATIONSHIP_LIMITS.requestBytes) throw new RelationshipError("tooLarge");
      this.prepared = { pair: catalog.pair, catalog, settings: Object.freeze(settings), system, user, options };
      this.publish({ stage: "consent", consent: { provider: PROVIDER_PROFILES[settings.provider].label, model: settings.model,
        endpoint: `${settings.baseUrl}/chat/completions`, paths: [pair[0].path, pair[1].path], characters, body, bytes,
        maxTokens: options.maxTokens!, reasoning: options.reasoning ? "enabled" in options.reasoning ? "disabled" : "low" : "provider",
        evidence: { fragments: catalog.fragments.length, uncoveredCharacters: catalog.uncoveredCharacters } } });
    } catch (error) { if (this.current(generation, stamp)) this.fail(error); }
  }
  async confirm(): Promise<void> {
    if (this.closed || this.view.stage !== "consent" || !this.prepared || this.busy) return;
    const prepared = this.prepared, stamp = JSON.stringify(prepared.settings), generation = ++this.generation;
    const request = new AbortController(); this.request = request;
    this.publish({ stage: "running" });
    try {
      const before = await this.deps.read();
      if (!this.current(generation, stamp)) return;
      if (!samePair(prepared.pair, before)) { this.invalidate(); return; }
      this.attempt!.dispatched = true;
      const raw = await this.deps.complete(prepared.settings, prepared.system, prepared.user, request.signal, prepared.options);
      if (!this.current(generation, stamp)) return;
      this.attempt!.completed = true;
      const after = await this.deps.read();
      if (!this.current(generation, stamp)) return;
      if (!samePair(prepared.pair, after)) { this.invalidate(); return; }
      const result = validateEvidenceResponse(raw, prepared.catalog, after, RELATIONSHIP_SINGLE_SCHEMA);
      this.prepared = undefined;
      this.analysis = { pair: after, result, provider: PROVIDER_PROFILES[prepared.settings.provider].label, model: prepared.settings.model };
      this.publish({ stage: "result", result });
    } catch (error) { if (this.current(generation, stamp)) this.fail(error); }
    finally { if (this.request === request) this.request = undefined; }
  }
  private fail(error: unknown): void {
    this.prepared = undefined; this.analysis = undefined;
    const reason = error instanceof RelationshipError || error instanceof ApiRequestError ? error.reason
      : error instanceof Error && error.name === "TimeoutError" ? "timeout"
      : error instanceof Error && error.name === "AbortError" ? "aborted" : "transport";
    const status = error instanceof ApiRequestError ? error.status : undefined;
    this.publish({ stage: "error", error: reason,
      ...(error instanceof RelationshipError && error.diagnostics.length ? { diagnostics: error.diagnostics } : {}),
      ...(Number.isInteger(status) && status! >= 100 && status! <= 599 ? { httpStatus: status } : {}) });
  }
}
