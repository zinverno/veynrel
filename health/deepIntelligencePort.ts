/** Product contract only: no credentials, endpoints or transport details in snapshots. */
export type DeepProvider = "openrouter" | "ollama" | "openai" | "groq" | "custom";
export type DeepOperation = "connect" | "check";
export type DeepIntelligenceState = "unconfigured" | "configured" | "ready" | "busy" | "error";

export interface DeepIntelligenceSnapshot {
  state: DeepIntelligenceState;
  provider: DeepProvider;
  providerLabel: string;
  model: string;
  busy: boolean;
  operation?: DeepOperation;
}

export interface DeepProviderOption {
  id: DeepProvider;
  label: string;
  requiresApiKey: boolean;
}

/** Transient editing values; never included in Health state or a public snapshot. */
export interface DeepSetupDraft {
  provider: DeepProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export type DeepSetupResult = { ok: true } | { ok: false; reason: "invalid" | "connection" | "save" | "busy" };

export interface DeepIntelligencePort {
  getSnapshot(): DeepIntelligenceSnapshot;
  getProviders(): DeepProviderOption[];
  createDraft(provider: DeepProvider): DeepSetupDraft;
  connect(draft: DeepSetupDraft): Promise<DeepSetupResult>;
  checkCurrentSetup(): Promise<DeepSetupResult>;
  subscribe(listener: () => void): () => void;
}
