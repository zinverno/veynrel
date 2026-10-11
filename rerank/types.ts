import type { SemanticChunkMatch, SemanticDocumentResult } from "../semantic/types";

export interface RerankSettings {
  enabled: boolean;
  triggerMode: "manual" | "automatic";
  provider: "openrouter";
  model: string;
  apiKey: string;
}

export const DEFAULT_RERANK_SETTINGS: RerankSettings = {
  enabled: false, triggerMode: "manual", provider: "openrouter", model: "cohere/rerank-v3.5", apiKey: "",
};

export function mergeRerankSettings(stored?: Partial<RerankSettings> | null): RerankSettings {
  return {
    enabled: stored?.enabled === true,
    triggerMode: stored?.triggerMode === "manual" || stored?.triggerMode === "automatic"
      ? stored.triggerMode : stored?.enabled === true ? "automatic" : "manual",
    provider: "openrouter",
    model: typeof stored?.model === "string" ? stored.model : DEFAULT_RERANK_SETTINGS.model,
    apiKey: typeof stored?.apiKey === "string" ? stored.apiKey : "",
  };
}

export const RERANK_LIMITS = {
  candidates: 30, results: 10, queryCodePoints: 2000, fragmentCodePoints: 4000,
  payloadBytes: 128 * 1024, timeoutMs: 15_000, modelLength: 200,
} as const;

export interface RerankScore { index: number; relevanceScore: number }
export interface RerankProvider {
  rank(query: string, documents: readonly string[], signal: AbortSignal): Promise<RerankScore[]>;
}

export interface RefinedDocumentResult extends SemanticDocumentResult {
  rerankScore?: number;
  rerankMatch?: SemanticChunkMatch;
}

export interface RefinedSearchUpdate {
  results: RefinedDocumentResult[];
  stage: "semantic" | "refining" | "reranked" | "skipped" | "fallback";
  reason?: "disabled" | "configuration" | "insufficient" | "obsolete";
  /** Coverage of the candidate pool, before the local display limit. */
  evaluated?: number;
  candidates?: number;
  /** An in-memory capability; neither credentials nor the candidate pool enter the UI. */
  session?: ManualRerankSession;
}

export interface ManualRerankSession {
  id: number;
  configured: boolean;
  refine(): Promise<RefinedSearchUpdate>;
}

export interface PreparedRerankCandidate {
  document: SemanticDocumentResult;
  chunkId: string;
  match: SemanticChunkMatch;
  text: string;
  originalOrder: number;
}
