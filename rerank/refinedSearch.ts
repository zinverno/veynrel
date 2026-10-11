import type { SemanticDocumentResult } from "../semantic/types";
import { payloadFits, rerankConfigured } from "./openRouterRerank";
import { RERANK_LIMITS } from "./types";
import type { PreparedRerankCandidate, RefinedSearchUpdate, RerankProvider, RerankSettings } from "./types";

export interface RefinedSearchOptions {
  query: string;
  settings: RerankSettings;
  signal: AbortSignal;
  search(limit: number): Promise<SemanticDocumentResult[]>;
  prepare(results: readonly SemanticDocumentResult[]): Promise<PreparedRerankCandidate[]>;
  /** A synchronous metadata-only scope/existence check, also used on fallback. */
  allowed(path: string): boolean;
  isCurrent(): boolean;
  provider: RerankProvider;
  publish: (update: RefinedSearchUpdate) => void;
}

/** One semantic search; no provider failure can swallow a base-search failure. */
export async function refinedSearch(options: RefinedSearchOptions): Promise<RefinedSearchUpdate> {
  const { settings } = options;
  const original = await options.search(settings.enabled ? RERANK_LIMITS.candidates : RERANK_LIMITS.results);
  return refineCandidates({ ...options, original, allowed: path => options.allowed(path) });
}

/** Refines a saved pool without searching or requesting another query embedding. */
export async function refineCandidates(options: Omit<RefinedSearchOptions, "search"> & {
  original: SemanticDocumentResult[];
}): Promise<RefinedSearchUpdate> {
  const { query, settings, signal, provider, publish, original } = options;
  const eligible = () => original.filter(item => options.allowed(item.path));
  const fallback = (stage: "fallback" | "skipped", reason?: RefinedSearchUpdate["reason"]): RefinedSearchUpdate =>
    ({ results: eligible().slice(0, RERANK_LIMITS.results), stage, reason });
  if (!settings.enabled) return { results: original, stage: "skipped", reason: "disabled" };
  if (!options.isCurrent() || signal.aborted) return fallback("skipped", "obsolete");
  publish({ results: eligible().slice(0, RERANK_LIMITS.results), stage: "semantic" });
  if (!rerankConfigured(settings)) return fallback("skipped", "configuration");
  publish({ results: eligible().slice(0, RERANK_LIMITS.results), stage: "refining" });
  try {
    const prepared = await options.prepare(eligible());
    if (!options.isCurrent() || signal.aborted) return fallback("skipped", "obsolete");
    const sent: PreparedRerankCandidate[] = [];
    const texts: string[] = [];
    for (const candidate of prepared) {
      if (sent.length >= RERANK_LIMITS.candidates) break;
      if (!options.allowed(candidate.document.path)) continue;
      if (!payloadFits(settings.model, query, [...texts, candidate.text])) continue;
      sent.push(candidate); texts.push(candidate.text);
    }
    if (sent.length < 2) return fallback("skipped", "insufficient");
    if (!options.isCurrent() || signal.aborted) return fallback("skipped", "obsolete");
    const scores = await provider.rank(query, texts, signal);
    if (!options.isCurrent() || signal.aborted || sent.some(item => !options.allowed(item.document.path))) {
      return fallback("skipped", "obsolete");
    }
    const ranked = scores.map(score => ({ ...sent[score.index], score: score.relevanceScore }))
      .sort((a, b) => b.score - a.score || a.originalOrder - b.originalOrder);
    const scoredPaths = new Set(sent.map(item => item.document.path));
    return {
      results: [...ranked.map(item => ({ ...item.document, rerankScore: item.score, rerankMatch: item.match })),
        ...eligible().filter(item => !scoredPaths.has(item.path))].slice(0, RERANK_LIMITS.results),
      stage: "reranked", evaluated: sent.length, candidates: eligible().length,
    };
  } catch {
    return fallback(options.isCurrent() && !signal.aborted ? "fallback" : "skipped",
      options.isCurrent() && !signal.aborted ? undefined : "obsolete");
  }
}
