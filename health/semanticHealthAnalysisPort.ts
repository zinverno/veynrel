import type { FindingCandidate } from "./domain/finding";

/** Persisted ownership/version contract. Never rename to change presentation. */
export const SEMANTIC_DUPLICATES_ANALYZER = { id: "semantic-duplicates", version: "1" } as const;

/** In-session freshness token, never persisted. No endpoint, credentials or note content. */
export interface SemanticIndexRevision {
  vectorGeneration: number;
  vectorCount: number;
  dimensions: number;
  provider: string;
  model: string;
  configurationRevision: number;
  runtimeRevision: number;
}

export interface SemanticDuplicateAnalysis {
  revision: SemanticIndexRevision;
  candidates: FindingCandidate[];
  /** Complete only relative to the current compatible index and this analyzer. */
  complete: boolean;
}

export type SemanticHealthErrorCode = "semantic-unavailable" | "semantic-index-changed" | "semantic-analysis-failed";

/** Fixed safe code; never retain the underlying provider/storage exception. */
export class SemanticHealthAnalysisError extends Error {
  constructor(readonly code: SemanticHealthErrorCode) {
    super(code);
    this.name = "SemanticHealthAnalysisError";
  }
}

/** Health owns persistence; the injected adapter only analyzes the existing local index. */
export interface SemanticHealthAnalysisPort {
  analyzeDuplicates(signal: AbortSignal): Promise<SemanticDuplicateAnalysis>;
  verifyCurrent(revision: SemanticIndexRevision, signal: AbortSignal): Promise<void>;
}
