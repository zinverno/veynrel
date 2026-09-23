import { testEmbeddingConnection, validateEmbeddingSettings } from "../../embeddings/factory";
import { EMBEDDING_PROVIDER_PROFILES } from "../../embeddings/types";
import type { EmbeddingProviderId, EmbeddingSettings } from "../../embeddings/types";
import type { SemanticIntelligencePort, SemanticIntelligenceSnapshot, SemanticOperation,
  SemanticSetupDraft, SemanticSetupMode, SemanticSetupResult } from "../../health/semanticIntelligencePort";
import type { SemanticStatus } from "../types";
import type { SemanticSettingsPort } from "./semanticSettingsPort";

/** Structural subset keeps product tests independent of the Obsidian plugin host. */
interface SemanticEngine {
  getSemanticStatus(): SemanticStatus;
  refreshSemanticStatus(): Promise<SemanticStatus>;
  indexVault(): Promise<void>;
  rebuildIndex(): Promise<void>;
  openSearch(): void;
  openSimilarNotes(): void;
  openPotentialDuplicates(): void;
}

const PROVIDERS: Record<SemanticSetupMode, EmbeddingProviderId> = {
  local: "ollama", cloud: "openrouter", custom: "openai-compatible",
};

/** Only explicit actions perform I/O. No vault, index, Companion or settings cache here. */
export class SemanticIntelligenceController implements SemanticIntelligencePort {
  private operation?: SemanticOperation;
  private failed = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly settings: SemanticSettingsPort, private readonly engine: SemanticEngine) {}

  getSnapshot(): SemanticIntelligenceSnapshot {
    const settings = this.settings.get();
    const status = this.engine.getSemanticStatus();
    const busy = Boolean(this.operation) || status.kind === "indexing" || status.kind === "initializing";
    const state = busy ? "busy" : !settings.enabled ? "disabled" : this.failed ? "error"
      : status.kind === "incompatible" || status.kind === "error" ? status.kind
      : status.kind === "ready" && status.vectorCount > 0 ? "ready" : "configured";
    return { enabled: settings.enabled, state, provider: settings.embeddingProvider,
      providerLabel: EMBEDDING_PROVIDER_PROFILES[settings.embeddingProvider].label,
      model: settings.embeddingModel, vectorCount: status.vectorCount,
      indexRequired: status.kind === "ready" && status.vectorCount === 0, busy, operation: this.operation };
  }

  createDraft(mode: SemanticSetupMode): SemanticSetupDraft {
    const settings = this.settings.get();
    const provider = PROVIDERS[mode];
    const profile = EMBEDDING_PROVIDER_PROFILES[provider];
    const custom = mode === "custom" && settings.embeddingProvider === provider;
    return { mode, baseUrl: custom ? settings.embeddingBaseUrl : profile.defaultBaseUrl,
      model: custom ? settings.embeddingModel : profile.defaultModel,
      apiKey: mode === "cloud" ? settings.openRouterApiKey : mode === "custom" ? settings.openAICompatibleApiKey : "" };
  }

  async connect(draft: SemanticSetupDraft): Promise<SemanticSetupResult> {
    if (this.getSnapshot().busy) return { ok: false, reason: "busy" };
    // Copy before any await: further typing cannot change the tested candidate.
    const input = { ...draft };
    return await this.run("connect", async (): Promise<SemanticSetupResult> => {
      const provider = PROVIDERS[input.mode];
      if (!provider) return { ok: false, reason: "invalid" };
      const profile = EMBEDDING_PROVIDER_PROFILES[provider];
      const previous = this.settings.get();
      const candidate: EmbeddingSettings = { ...previous, enabled: true, embeddingProvider: provider,
        embeddingBaseUrl: input.mode === "custom" ? input.baseUrl.trim() : profile.defaultBaseUrl,
        embeddingModel: input.mode === "custom" ? input.model.trim() : profile.defaultModel };
      if (input.mode === "cloud") candidate.openRouterApiKey = input.apiKey.trim();
      if (input.mode === "custom") candidate.openAICompatibleApiKey = input.apiKey.trim();
      if (validateEmbeddingSettings(candidate)) return { ok: false, reason: "invalid" };
      let dimensions: number;
      try { ({ dimensions } = await testEmbeddingConnection(candidate)); }
      catch { return { ok: false, reason: "connection" }; }
      try { await this.settings.update(candidate, previous); }
      catch { return { ok: false, reason: "save" }; }
      // Inspect compatibility only; never build, clear or rebuild as part of connection.
      try { await this.engine.refreshSemanticStatus(); }
      catch { this.failed = true; }
      return { ok: true, dimensions };
    }) ?? { ok: false, reason: "connection" };
  }

  async checkCurrentSetup(): Promise<void> { await this.run("check", () => this.engine.refreshSemanticStatus()); }
  async buildIndex(): Promise<void> {
    if (this.getSnapshot().state !== "configured") return;
    await this.run("build", () => this.engine.indexVault());
  }
  async rebuildIndex(): Promise<void> {
    if (this.getSnapshot().state !== "incompatible") return;
    await this.run("rebuild", () => this.engine.rebuildIndex());
  }
  openSearch(): void { if (this.getSnapshot().state === "ready") this.engine.openSearch(); }
  openSimilarNotes(): void { if (this.getSnapshot().state === "ready") this.engine.openSimilarNotes(); }
  openPotentialDuplicates(): void { if (this.getSnapshot().state === "ready") this.engine.openPotentialDuplicates(); }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private async run<T>(operation: SemanticOperation, action: () => Promise<T>): Promise<T | undefined> {
    if (this.getSnapshot().busy) return undefined;
    this.operation = operation; this.failed = false; this.emit();
    try { return await action(); }
    catch { this.failed = true; return undefined; }
    finally { this.operation = undefined; this.emit(); }
  }
  private emit(): void {
    for (const listener of this.listeners) {
      try { listener(); } catch { /* A detached view cannot break a committed operation. */ }
    }
  }
}
