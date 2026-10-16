import type { App } from "obsidian";
import { buildChatBody } from "../api";
import { PROVIDER_PROFILES } from "../constants";
import { currentLanguage } from "../i18n";
import type { LanguageModelSettingsPort, LanguageModelSettingsSnapshot } from "../deep/product/languageModelSettingsPort";
import { validAnalysisSettings } from "../deep/product/validateLanguageModelSettings";
import { readSavedNote } from "./savedNote";
import type { SavedNote } from "./savedNote";
import { RelationshipError, validateRelationshipResponse } from "./relationshipContract";
import type { RelationshipFailure, RelationshipResult } from "./relationshipContract";
import { RELATIONSHIP_LIMITS, RELATIONSHIP_OPTIONS, relationshipPrompt } from "./relationshipPrompt";

export type RelationshipPair = readonly [SavedNote, SavedNote];
export interface RelationshipConsent {
  provider: string;
  model: string;
  endpoint: string;
  paths: readonly [string, string];
  characters: readonly [number, number];
  body: string;
  bytes: number;
}
export interface RelationshipView {
  stage: "idle" | "preparing" | "consent" | "running" | "result" | "error" | "stale" | "cancelled" | "dismissed";
  consent?: RelationshipConsent;
  result?: RelationshipResult;
  error?: RelationshipFailure;
}
export interface RelationshipDependencies {
  settings: Pick<LanguageModelSettingsPort, "get" | "subscribe">;
  read(): Promise<RelationshipPair>;
  complete(settings: LanguageModelSettingsSnapshot, system: string, user: string, signal: AbortSignal): Promise<string>;
}

export async function readRelationshipPair(app: App, paths: readonly [string, string]): Promise<RelationshipPair> {
  if (paths[0] === paths[1]) throw new RelationshipError("source");
  const [a, b] = await Promise.all(paths.map(path => readSavedNote(app, path)));
  if (a.state !== "ready" || b.state !== "ready") throw new RelationshipError("source");
  return [a, b];
}
function samePair(a: RelationshipPair, b: RelationshipPair): boolean {
  return a.every((note, i) => note.path === b[i].path && note.file === b[i].file && note.content === b[i].content &&
    note.modified === b[i].modified && note.bytes === b[i].bytes);
}

/** Ephemeral consent/result; one request per confirmation, no retries or persistence. */
export class RelationshipSession {
  view: RelationshipView = { stage: "idle" };
  onChange: () => void = () => {};
  private generation = 0;
  private closed = false;
  private request?: AbortController;
  private prepared?: { pair: RelationshipPair; settings: LanguageModelSettingsSnapshot; system: string; user: string };
  private readonly unsubscribe: () => void;
  private settingsStamp: string;
  constructor(private readonly deps: RelationshipDependencies) {
    this.settingsStamp = this.stamp();
    this.unsubscribe = deps.settings.subscribe(() => {
      if (this.settingsStamp !== this.stamp()) { this.settingsStamp = this.stamp(); this.invalidate(); }
    });
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
    this.generation++; this.request?.abort(); this.request = undefined; this.prepared = undefined;
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
    this.prepared = undefined;
    this.publish({ stage: "preparing" });
    try {
      if (!validAnalysisSettings(settings)) throw new RelationshipError("configuration");
      const pair = await this.deps.read();
      if (!this.current(generation, stamp)) return;
      const characters: [number, number] = [pair[0].content.length, pair[1].content.length];
      if (characters.some(n => n > RELATIONSHIP_LIMITS.noteCharacters) || characters[0] + characters[1] > RELATIONSHIP_LIMITS.pairCharacters) throw new RelationshipError("tooLarge");
      const system = relationshipPrompt(currentLanguage()), user = JSON.stringify({ A: pair[0].content, B: pair[1].content });
      const body = JSON.stringify(buildChatBody(settings, system, user, RELATIONSHIP_OPTIONS));
      const bytes = new TextEncoder().encode(body).byteLength;
      if (bytes > RELATIONSHIP_LIMITS.requestBytes) throw new RelationshipError("tooLarge");
      this.prepared = { pair, settings, system, user };
      this.publish({ stage: "consent", consent: { provider: PROVIDER_PROFILES[settings.provider].label, model: settings.model,
        endpoint: `${settings.baseUrl}/chat/completions`, paths: [pair[0].path, pair[1].path], characters, body, bytes } });
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
      const raw = await this.deps.complete(prepared.settings, prepared.system, prepared.user, request.signal);
      if (!this.current(generation, stamp)) return;
      const after = await this.deps.read();
      if (!this.current(generation, stamp)) return;
      if (!samePair(prepared.pair, after)) { this.invalidate(); return; }
      const result = validateRelationshipResponse(raw, after[0].content, after[1].content);
      this.prepared = undefined;
      this.publish({ stage: "result", result });
    } catch (error) { if (this.current(generation, stamp)) this.fail(error); }
    finally { if (this.request === request) this.request = undefined; }
  }
  private fail(error: unknown): void {
    this.prepared = undefined;
    this.publish({ stage: "error", error: error instanceof RelationshipError ? error.reason : "transport" });
  }
}
