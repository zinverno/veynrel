import { isPublicOpenRouter, readOpenRouterEndpoints } from "../../api";
import type { LanguageModelSettingsSnapshot } from "../../deep/product/languageModelSettingsPort";
import { ensure, freeze, StudioError } from "../recipe";

type Connection = Pick<LanguageModelSettingsSnapshot, "provider" | "baseUrl" | "model">;
export interface StructuredEndpoint { endpoint: string; expiresAt: number }
const requiredParameters = ["structured_outputs", "response_format", "max_tokens", "temperature", "repetition_penalty", "frequency_penalty", "reasoning"];
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** Memory-only, bounded and lazy: opening Studio never discovers or refreshes endpoints. */
export class DiagramCapabilities {
  private readonly cache = new Map<string, StructuredEndpoint>();
  constructor(private readonly read: (connection: Connection) => Promise<unknown> = readOpenRouterEndpoints) {}
  async resolve(connection: Connection): Promise<StructuredEndpoint> {
    ensure(isPublicOpenRouter(connection), "capabilities");
    const cached = this.cache.get(connection.model);
    if (cached && Date.now() < cached.expiresAt) return cached;
    this.cache.delete(connection.model);
    let payload: unknown;
    try { payload = await this.read({ provider: connection.provider, baseUrl: connection.baseUrl, model: connection.model }); }
    catch { throw new StudioError("capabilities"); }
    ensure(record(payload) && record(payload.data) && payload.data.id === connection.model && Array.isArray(payload.data.endpoints) && payload.data.endpoints.length <= 256, "capabilities");
    const endpoints: unknown[] = payload.data.endpoints;
    ensure(endpoints.every(e => record(e) && typeof e.tag === "string" && e.tag.length <= 120 && /^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/u.test(e.tag) && Array.isArray(e.supported_parameters)), "capabilities");
    const compatible = (e: unknown): boolean => {
      if (!record(e) || typeof e.tag !== "string" || e.tag.length > 120 || !/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/u.test(e.tag)) return false;
      const parameters = e.supported_parameters;
      return (e.service_tier == null || e.service_tier === "default") && Array.isArray(parameters) && requiredParameters.every(p => parameters.includes(p));
    };
    const tags = endpoints.filter(compatible).map(e => (e as { tag: string }).tag).sort();
    // A routing slug also matches its variants/regions: every matching row must advertise support.
    const endpoint = tags.find(tag => endpoints.filter(e => record(e) && typeof e.tag === "string" && (e.tag === tag || e.tag.startsWith(`${tag}/`))).every(compatible));
    ensure(endpoint, "capabilities");
    const result = freeze({ endpoint, expiresAt: Date.now() + 5 * 60_000 });
    if (this.cache.size >= 8) this.cache.delete([...this.cache.keys()][0]);
    this.cache.set(connection.model, result); return result;
  }
}
