/** Product-only contract. Health has no dependency on the semantic engine or providers. */
export type SemanticSetupMode = "local" | "cloud" | "custom";
export type SemanticOperation = "connect" | "check" | "build" | "rebuild";

export interface SemanticIntelligenceSnapshot {
  enabled: boolean;
  state: "disabled" | "configured" | "ready" | "busy" | "incompatible" | "error";
  provider: "ollama" | "openrouter" | "openai-compatible";
  providerLabel: string;
  model: string;
  vectorCount: number;
  indexRequired: boolean;
  busy: boolean;
  operation?: SemanticOperation;
}

/** Transient form values only, never part of the snapshot or persisted route state. */
export interface SemanticSetupDraft {
  mode: SemanticSetupMode;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export type SemanticSetupResult =
  | { ok: true; dimensions: number }
  | { ok: false; reason: "invalid" | "connection" | "save" | "busy" };

export interface SemanticIntelligencePort {
  getSnapshot(): SemanticIntelligenceSnapshot;
  createDraft(mode: SemanticSetupMode): SemanticSetupDraft;
  connect(draft: SemanticSetupDraft): Promise<SemanticSetupResult>;
  checkCurrentSetup(): Promise<void>;
  buildIndex(): Promise<void>;
  rebuildIndex(): Promise<void>;
  openSearch(): void;
  subscribe(listener: () => void): () => void;
}
