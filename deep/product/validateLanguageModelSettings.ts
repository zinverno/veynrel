import { t as tr } from "../../i18n";
import { PROVIDER_PROFILES } from "../../constants";
import type { LanguageModelSettingsSnapshot } from "./languageModelSettingsPort";

/** Existing shared validation, kept independent of the Obsidian settings UI. */
export function validateLanguageModelSettings(settings: Pick<LanguageModelSettingsSnapshot, "provider" | "model" | "baseUrl" | "apiKey" | "temperature">): string | null {
  if (!settings.model.trim()) return tr("⚠️ Укажите название модели!");
  if (!settings.baseUrl.trim()) return tr("⚠️ Укажите Base URL!");
  if (settings.temperature < 0 || settings.temperature > 1) {
    return tr("⚠️ Temperature должен быть 0.0–1.0");
  }
  const profile = PROVIDER_PROFILES[settings.provider ?? "openrouter"];
  if (profile.requiresApiKey && !settings.apiKey.trim()) {
    return tr("⚠️ Введите API Key для {p}!", { p: profile.label });
  }
  return null;
}

/** Shared consent flows reject credential-bearing or non-HTTP destinations. */
export function validAnalysisSettings(settings: LanguageModelSettingsSnapshot): boolean {
  try {
    const url = new URL(settings.baseUrl);
    return Object.prototype.hasOwnProperty.call(PROVIDER_PROFILES, settings.provider) &&
      validateLanguageModelSettings(settings) === null && Number.isFinite(settings.temperature) &&
      ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash &&
      settings.baseUrl === settings.baseUrl.trim();
  } catch { return false; }
}
