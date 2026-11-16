import type { SemanticIndexRevision } from "./semanticHealthAnalysisPort";

export type SemanticNeighborhoodRevision = Readonly<SemanticIndexRevision>;
export interface SemanticNeighborhoodEvidence {
  readonly headingPath: readonly string[];
  readonly preview?: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly score: number;
}
export interface SemanticNeighborhoodNode {
  readonly id: string;
  readonly path: string;
  readonly basename: string;
  readonly role: "source" | "neighbor";
  readonly similarity?: number;
  readonly evidence: readonly SemanticNeighborhoodEvidence[];
}
export interface SemanticNeighborhoodMap {
  readonly revision: SemanticNeighborhoodRevision;
  readonly source: SemanticNeighborhoodNode;
  readonly neighbors: readonly SemanticNeighborhoodNode[];
  readonly edges: readonly Readonly<{ source: string; target: string; score: number }>[];
  readonly indexedNoteCount: number;
  readonly capturedAt: number;
}
export type SemanticNeighborhoodReason = "unavailable" | "absent" | "incompatible" | "source-removed" | "changed" | "invalid" | "failed";
export interface SemanticNeighborhoodProductSnapshot {
  readonly state: "idle" | "preparing" | "choosing" | "loading" | "ready" | "stale" | "unavailable" | "error";
  readonly busy: boolean;
  readonly indexedNoteCount: number;
  readonly sourcePath?: string;
  readonly map?: SemanticNeighborhoodMap;
  readonly reason?: SemanticNeighborhoodReason;
}
export interface SemanticSourceSearchResult {
  readonly paths: readonly string[];
  readonly total: number;
}
/** Session-only Discover exploration. No persistence, setup, or index mutation API. */
export interface SemanticNeighborhoodPort {
  createSession?(): SemanticNeighborhoodPort;
  cancel?(): void;
  getSnapshot(): SemanticNeighborhoodProductSnapshot;
  subscribe(listener: () => void): () => void;
  prepare(): Promise<void>;
  searchSources(query: string): SemanticSourceSearchResult;
  load(sourcePath: string): Promise<void>;
  refresh(): Promise<void>;
  chooseAnother(): void;
  dispose(): void;
}
