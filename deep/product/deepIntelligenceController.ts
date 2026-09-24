import { validateLanguageModelSettings } from "./validateLanguageModelSettings";
import { PROVIDER_PROFILES } from "../../constants";
import type { DeepIntelligencePort, DeepIntelligenceSnapshot, DeepOperation, DeepProvider,
  DeepProviderOption, DeepSetupDraft, DeepSetupResult } from "../../health/deepIntelligencePort";
import type { LanguageModelConnectionPort } from "./languageModelConnectionPort";
import type { LanguageModelSettingsPort, LanguageModelSettingsSnapshot } from "./languageModelSettingsPort";
import { sameLanguageModelConnection } from "./languageModelSettingsPort";

/** Plugin-lifetime owner. Construction, snapshots and drafts perform no I/O. */
export class DeepIntelligenceController implements DeepIntelligencePort {
  private operation?: DeepOperation;
  private tested?: { signature: string; ok: boolean };
  private readonly listeners = new Set<() => void>();
  private readonly draftOrigins = new WeakMap<DeepSetupDraft, LanguageModelSettingsSnapshot>();
  private readonly unsubscribe: () => void;

  constructor(private readonly settings: LanguageModelSettingsPort, private readonly connection: LanguageModelConnectionPort) {
    this.unsubscribe = settings.subscribe(() => {
      if (this.tested?.signature !== this.signature(settings.get())) this.tested = undefined;
      this.emit();
    });
  }

  getSnapshot(): DeepIntelligenceSnapshot {
    const current = this.settings.get();
    const tested = this.tested?.signature === this.signature(current) ? this.tested : undefined;
    const busy = Boolean(this.operation);
    return { state: busy ? "busy" : !this.valid(current) ? "unconfigured" : tested ? tested.ok ? "ready" : "error" : "configured",
      provider: current.provider, providerLabel: PROVIDER_PROFILES[current.provider]?.label ?? "",
      model: current.model, busy, operation: this.operation };
  }

  getProviders(): DeepProviderOption[] {
    return (["ollama", "openrouter", "openai", "groq", "custom"] as const).map((id) => {
      const { label, requiresApiKey } = PROVIDER_PROFILES[id];
      return { id, label, requiresApiKey };
    });
  }

  createDraft(provider: DeepProvider): DeepSetupDraft {
    const current = this.settings.get();
    const profile = PROVIDER_PROFILES[provider];
    const same = current.provider === provider;
    const draft = { provider, baseUrl: same ? current.baseUrl : profile.defaultBaseUrl,
      model: same ? current.model : profile.defaultModel, apiKey: same ? current.apiKey : "" };
    this.draftOrigins.set(draft, current);
    return draft;
  }

  async connect(draft: DeepSetupDraft): Promise<DeepSetupResult> {
    if (this.operation) return { ok: false, reason: "busy" };
    const input = { ...draft };
    const previous = this.settings.get();
    const origin = this.draftOrigins.get(draft);
    if (origin && !sameLanguageModelConnection(origin, previous)) return { ok: false, reason: "save" };
    const candidate = { ...previous, provider: input.provider, baseUrl: input.baseUrl.trim(),
      model: input.model.trim(), apiKey: input.apiKey.trim() };
    if (!this.valid(candidate)) return { ok: false, reason: "invalid" };
    this.operation = "connect"; this.emit();
    try {
      try { await this.connection.test({ ...candidate }); }
      catch {
        if (sameLanguageModelConnection(candidate, this.settings.get())) this.tested = { signature: this.signature(candidate), ok: false };
        return { ok: false, reason: "connection" };
      }
      try {
        const saved = await this.settings.update(candidate, previous);
        if (!sameLanguageModelConnection(candidate, saved)) return { ok: false, reason: "save" };
        this.tested = { signature: this.signature(candidate), ok: true };
      } catch { return { ok: false, reason: "save" }; }
      return { ok: true };
    } finally { this.operation = undefined; this.emit(); }
  }

  async checkCurrentSetup(): Promise<DeepSetupResult> {
    if (this.operation) return { ok: false, reason: "busy" };
    const candidate = this.settings.get();
    if (!this.valid(candidate)) return { ok: false, reason: "invalid" };
    this.operation = "check"; this.emit();
    try {
      await this.connection.test({ ...candidate });
      this.tested = { signature: this.signature(candidate), ok: true };
      return { ok: true };
    } catch {
      this.tested = { signature: this.signature(candidate), ok: false };
      return { ok: false, reason: "connection" };
    } finally { this.operation = undefined; this.emit(); }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  dispose(): void { this.unsubscribe(); this.listeners.clear(); }

  private valid(settings: LanguageModelSettingsSnapshot): boolean {
    return Object.prototype.hasOwnProperty.call(PROVIDER_PROFILES, settings.provider) && validateLanguageModelSettings(settings) === null;
  }
  private signature(settings: LanguageModelSettingsSnapshot): string {
    return JSON.stringify([settings.provider, settings.baseUrl, settings.model, settings.apiKey]);
  }
  private emit(): void {
    for (const listener of this.listeners) {
      try { listener(); } catch { /* View failures cannot change an operation's outcome. */ }
    }
  }
}
