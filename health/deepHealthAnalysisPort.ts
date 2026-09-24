import type { FindingCandidate } from "./domain/finding";

/** Persisted compatibility surface, independent of product copy and model choice. */
export const KNOWLEDGE_QUALITY_ANALYZER = { id: "knowledge-quality", version: "1" } as const;

/** Opaque in-session token. Never contains settings, credentials or note content. */
export interface DeepKnowledgeRevision { readonly token: string }

/** Transient content-sharing consent, bound to the committed configuration shown to the user. */
export interface DeepKnowledgeConsent { configurationRevision: number; providerKind: "local" | "cloud" | "custom" }

export interface DeepKnowledgeAnalysis {
  revision: DeepKnowledgeRevision;
  candidates: FindingCandidate[];
  totalFiles: number;
  analyzedFiles: number;
  complete: boolean;
}

export type DeepHealthErrorCode = "deep-unavailable" | "deep-analysis-failed" | "deep-partial" |
  "deep-vault-changed" | "deep-config-changed" | "deep-reconciliation-failed" | "deep-cancelled";

export class DeepHealthAnalysisError extends Error {
  constructor(readonly code: DeepHealthErrorCode, readonly totalFiles?: number) {
    super(code); this.name = code === "deep-cancelled" ? "AbortError" : "DeepHealthAnalysisError";
  }
}

/** The adapter analyzes; HealthService alone reconciles and records history. */
export interface DeepHealthAnalysisPort {
  /** Metadata only: no note enumeration, reads, provider calls or persistence. */
  getConsent(): DeepKnowledgeConsent | undefined;
  /** Must settle promptly on abort, preserving captured totalFiles in a safe error. */
  analyzeKnowledge(signal: AbortSignal, consent: DeepKnowledgeConsent): Promise<DeepKnowledgeAnalysis>;
  verifyCurrent(revision: DeepKnowledgeRevision, signal: AbortSignal): Promise<void>;
}
