import type { LLMProvider } from "../../constants";

export interface LanguageModelSettingsSnapshot {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  temperature: number;
  topK: number;
}

export function languageModelSettingsSnapshot(settings: LanguageModelSettingsSnapshot): LanguageModelSettingsSnapshot {
  const { provider, apiKey, model, baseUrl, temperature, topK } = settings;
  return { provider, apiKey, model, baseUrl, temperature, topK };
}

/** Connection identity only. Tuning remains owned by Advanced Settings. */
export function sameLanguageModelConnection(a: LanguageModelSettingsSnapshot, b: LanguageModelSettingsSnapshot): boolean {
  return a.provider === b.provider && a.apiKey === b.apiKey && a.model === b.model && a.baseUrl === b.baseUrl;
}

export interface LanguageModelSettingsPort {
  get(): LanguageModelSettingsSnapshot;
  /** Persist the four connection fields; preserve current temperature/topK and all other settings. */
  update(next: LanguageModelSettingsSnapshot, expected?: LanguageModelSettingsSnapshot): Promise<LanguageModelSettingsSnapshot>;
  subscribe(listener: () => void): () => void;
}
