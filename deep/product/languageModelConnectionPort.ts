import type { LanguageModelSettingsSnapshot } from "./languageModelSettingsPort";

/** The host delegates to the existing testConnection with a complete settings candidate. */
export interface LanguageModelConnectionPort {
  test(settings: LanguageModelSettingsSnapshot): Promise<void>;
}
