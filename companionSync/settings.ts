import type { CompanionSettings } from "./types";
import { CompanionClientError } from "./errors";

export const DEFAULT_COMPANION_SETTINGS: Readonly<CompanionSettings> = {
  enabled: false,
  endpoint: "http://127.0.0.1:27124",
  token: "",
  timeoutMs: 5_000,
  vaultId: "",
};

export type StoredCompanionSettings = Partial<CompanionSettings>;

export function isVaultId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

export function createVaultId(): string {
  if (typeof window.crypto?.randomUUID !== "function") {
    throw new Error("A secure UUID generator is required for Companion vault identity.");
  }
  return window.crypto.randomUUID();
}

export function mergeCompanionSettings(
  stored?: StoredCompanionSettings | null,
  generateVaultId: () => string = createVaultId,
): CompanionSettings {
  return {
    enabled: stored?.enabled === true,
    endpoint: typeof stored?.endpoint === "string" && stored.endpoint.trim()
      ? stored.endpoint.trim()
      : DEFAULT_COMPANION_SETTINGS.endpoint,
    token: typeof stored?.token === "string" ? stored.token.trim() : "",
    timeoutMs: typeof stored?.timeoutMs === "number" && Number.isSafeInteger(stored.timeoutMs) && stored.timeoutMs >= 500 && stored.timeoutMs <= 60_000
      ? stored.timeoutMs
      : DEFAULT_COMPANION_SETTINGS.timeoutMs,
    vaultId: isVaultId(stored?.vaultId) ? stored.vaultId.toLowerCase() : generateVaultId(),
  };
}

export function isLocalCompanionEndpoint(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/u.test(hostname);
  } catch {
    return false;
  }
}

export function companionEndpoint(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CompanionClientError("CONFIGURATION_ERROR");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.search || url.hash) {
    throw new CompanionClientError("CONFIGURATION_ERROR");
  }
  if (!isLocalCompanionEndpoint(url.toString()) && url.protocol !== "https:") {
    throw new CompanionClientError("CONFIGURATION_ERROR");
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString().replace(/\/$/u, "");
}

/** The same validation used by the existing HTTP client; no network or credentials in errors. */
export function validateCompanionSettings(settings: CompanionSettings): string {
  const baseUrl = companionEndpoint(settings.endpoint);
  if (!settings.token.trim() || !Number.isSafeInteger(settings.timeoutMs) || settings.timeoutMs < 500) {
    throw new CompanionClientError("CONFIGURATION_ERROR");
  }
  return baseUrl;
}
