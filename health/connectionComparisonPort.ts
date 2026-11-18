import type { LocalVaultRevision } from "./analyzers/local/localVaultRevision";
import type { SemanticIndexRevision } from "./semanticHealthAnalysisPort";

export type MarkdownLinkDirection = "left-to-right" | "right-to-left" | "reciprocal";
export type ConnectionComparisonCategory = "candidate" | "aligned" | "explicit-only";
export type CandidateRankClass = "mutual-top-3" | "mutual-top-5" | "one-sided-top-5";
export interface ConnectionComparisonPair {
  readonly id: string;
  readonly leftPath: string;
  readonly rightPath: string;
  readonly leftBasename: string;
  readonly rightBasename: string;
  readonly category: ConnectionComparisonCategory;
  readonly semantic?: Readonly<{
    score: number; mutualTopK: boolean; leftRank?: number; rightRank?: number;
    rankClass: CandidateRankClass;
    /** Canonical paths from the existing top-five intersection, excluding both endpoints. */
    sharedNeighborPaths: readonly string[];
  }>;
  readonly markdown?: Readonly<{ direction: MarkdownLinkDirection }>;
}
export interface ConnectionComparisonSnapshot {
  readonly semanticRevision: Readonly<SemanticIndexRevision>;
  readonly topologyRevision: LocalVaultRevision;
  readonly capturedAt: number;
  readonly semanticMappedNoteCount: number;
  readonly topologyNoteCount: number;
  readonly comparableNoteCount: number;
  readonly semanticNotesMissingTopologyCount: number;
  readonly semanticNotesUnavailableLinksCount: number;
  readonly semanticPairCount: number;
  readonly candidateCount: number;
  readonly alignedCount: number;
  readonly explicitOnlyCount: number;
  readonly unclassifiedSemanticPairCount: number;
  /** Canonical explicit pairs, not directed edges. */
  readonly explicitOutsideSemanticMapCount: number;
  readonly unclassifiedExplicitPairCount: number;
  readonly pairs: readonly ConnectionComparisonPair[];
}
export interface ConnectionComparisonProductSnapshot {
  readonly state: "idle" | "loading" | "ready" | "stale" | "unavailable" | "error";
  readonly comparison?: ConnectionComparisonSnapshot;
  readonly reason?: "semantic-stale" | "topology-stale" | "semantic-unavailable" | "topology-unavailable" | "changed" | "invalid";
}
/** Explicit, read-only composition of two published maps. Session memory only. */
export interface ConnectionComparisonPort {
  getSnapshot(): ConnectionComparisonProductSnapshot;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  refresh(): Promise<void>;
  cancel?(): void;
  dispose(): void;
}
