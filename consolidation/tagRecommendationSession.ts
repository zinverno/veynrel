import { buildChatBody } from "../api";
import { PROVIDER_PROFILES } from "../constants";
import { currentLanguage } from "../i18n";
import type { LanguageModelSettingsPort, LanguageModelSettingsSnapshot } from "../deep/product/languageModelSettingsPort";
import { validAnalysisSettings } from "../deep/product/validateLanguageModelSettings";
import { analyzeTags, prepareTagAnalysis } from "./tagAnalyzer";
import type { PreparedTagAnalysis } from "./tagAnalyzer";
import { TAG_LIMITS, TAG_OPTIONS, TagRecommendationError } from "./tagRecommendationContract";
import type { TagFailure, TagRecommendations } from "./tagRecommendationContract";
import type { SavedNote } from "./savedNote";
import type { TaxonomyProfilePort } from "./taxonomyProfile";
import type { TaxonomyInventory } from "./taxonomyScan";

export interface TagRecommendationDependencies {
  settings: Pick<LanguageModelSettingsPort, "get" | "subscribe">;
  profile: Pick<TaxonomyProfilePort, "get" | "subscribe">;
  inventory(): TaxonomyInventory | undefined;
  read(path: string): Promise<SavedNote>;
  complete(settings: LanguageModelSettingsSnapshot, system: string, user: string, signal: AbortSignal): Promise<string>;
}
export interface TagConsent { provider: string; model: string; endpoint: string; path: string; characters: number; tags: number; excluded: number; body: string; bytes: number }
export interface TagRecommendationView {
  stage: "idle" | "preparing" | "consent" | "running" | "result" | "error" | "stale" | "cancelled" | "dismissed";
  consent?: TagConsent;
  result?: TagRecommendations;
  error?: TagFailure;
}
function sameSource(a: SavedNote, b: SavedNote): boolean {
  return a.file === b.file && a.path === b.path && a.content === b.content && a.bytes === b.bytes && a.modified === b.modified;
}
export class TagRecommendationSession {
  view: TagRecommendationView = { stage: "idle" };
  path = "";
  hasDispatched = false;
  onChange: () => void = () => {};
  private generation = 0;
  private closed = false;
  private request?: AbortController;
  private prepared?: { note: SavedNote; analysis: PreparedTagAnalysis; settings: LanguageModelSettingsSnapshot; stamp: string };
  private readonly unsubscribe: (() => void)[];
  private observedStamp: string;
  constructor(private readonly deps: TagRecommendationDependencies) {
    this.observedStamp = this.settingsStamp();
    const changed = () => { const stamp = this.settingsStamp(); if (stamp !== this.observedStamp) { this.observedStamp = stamp; this.invalidate(); } };
    this.unsubscribe = [deps.settings.subscribe(changed), deps.profile.subscribe(changed)];
  }
  get busy(): boolean { return this.view.stage === "preparing" || this.view.stage === "running"; }
  select(path: string): void { if (this.closed || this.path === path) return; this.path = path; this.clear("idle"); }
  categoryName(id: string): string { return this.deps.profile.get()?.categories.find(category => category.id === id)?.name ?? id; }
  private settingsStamp(): string { return JSON.stringify([this.deps.settings.get(), this.deps.profile.get()]); }
  private stamp(): string { return JSON.stringify([this.deps.settings.get(), this.deps.profile.get(), this.deps.inventory()]); }
  private current(generation: number, stamp: string): boolean {
    if (this.closed || generation !== this.generation) return false;
    if (stamp !== this.stamp()) { this.invalidate(); return false; }
    return true;
  }
  private publish(view: TagRecommendationView): void { if (!this.closed) { this.view = view; this.onChange(); } }
  private clear(stage: TagRecommendationView["stage"]): void {
    this.generation++; this.request?.abort(); this.request = undefined; this.prepared = undefined; this.publish({ stage });
  }
  invalidate(): void { this.clear("stale"); }
  cancel(): void { this.clear("cancelled"); }
  dismiss(): void { this.clear("dismissed"); }
  close(): void { this.closed = true; this.clear("idle"); this.view = { stage: "idle" }; this.unsubscribe.forEach(fn => fn()); this.onChange = () => {}; }
  async prepare(): Promise<void> {
    if (this.closed || this.busy) return;
    const generation = ++this.generation, stamp = this.stamp(), settings = { ...this.deps.settings.get() };
    this.prepared = undefined; this.publish({ stage: "preparing" });
    try {
      const profile = this.deps.profile.get(), inventory = this.deps.inventory();
      if (!profile?.categories.length) throw new TagRecommendationError("profile");
      if (!inventory || inventory.state !== "complete" || inventory.unavailable > 0 || inventory.processed + inventory.excluded !== inventory.total) throw new TagRecommendationError("inventory");
      if (!validAnalysisSettings(settings)) throw new TagRecommendationError("configuration");
      if (inventory.tags.length > TAG_LIMITS.tags) throw new TagRecommendationError("tooLarge");
      const note = await this.deps.read(this.path);
      if (!this.current(generation, stamp)) return;
      const analysis = prepareTagAnalysis({ content: note.content, profile, tags: inventory.tags.map(item => item.tag) }, currentLanguage());
      const body = JSON.stringify(buildChatBody(settings, analysis.system, analysis.user, TAG_OPTIONS));
      const bytes = new TextEncoder().encode(body).byteLength;
      if (bytes > TAG_LIMITS.requestBytes) throw new TagRecommendationError("tooLarge");
      this.prepared = { note, analysis, settings, stamp };
      this.publish({ stage: "consent", consent: { provider: PROVIDER_PROFILES[settings.provider].label, model: settings.model,
        endpoint: `${settings.baseUrl}/chat/completions`, path: note.path, characters: note.content.length, tags: inventory.tags.length,
        excluded: inventory.excluded, body, bytes } });
    } catch (error) { if (this.current(generation, stamp)) this.fail(error); }
  }
  async confirm(): Promise<void> {
    if (this.closed || this.view.stage !== "consent" || !this.prepared) return;
    const prepared = this.prepared, generation = ++this.generation, request = new AbortController(); this.request = request;
    this.publish({ stage: "running" });
    try {
      if (!this.current(generation, prepared.stamp)) return;
      const before = await this.deps.read(this.path);
      if (!this.current(generation, prepared.stamp)) return;
      if (!sameSource(before, prepared.note)) { this.invalidate(); return; }
      this.hasDispatched = true;
      const result = await analyzeTags(prepared.analysis, (system, user) => this.deps.complete(prepared.settings, system, user, request.signal));
      if (!this.current(generation, prepared.stamp)) return;
      const after = await this.deps.read(this.path);
      if (!this.current(generation, prepared.stamp)) return;
      if (!sameSource(after, prepared.note)) { this.invalidate(); return; }
      this.prepared = undefined; this.publish({ stage: "result", result });
    } catch (error) { if (this.current(generation, prepared.stamp)) this.fail(error); }
    finally { if (this.request === request) this.request = undefined; }
  }
  private fail(error: unknown): void {
    this.prepared = undefined; this.publish({ stage: "error", error: error instanceof TagRecommendationError ? error.reason : "transport" });
  }
}
