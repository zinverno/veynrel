/** Safe engine output. No vectors or stored chunk text cross this boundary. */
export const GLOBAL_SEMANTIC_NEIGHBORS = 5;
export const GLOBAL_SEMANTIC_DOCUMENT_CAP = 500;
export interface GlobalSemanticNeighbor { readonly path: string; readonly score: number }
export interface SemanticFocusAnalysis { readonly path: string; readonly scores: readonly GlobalSemanticNeighbor[] }
export interface GlobalSemanticDocument {
  readonly path: string;
  readonly coreSimilarity: number;
  /** Undefined mean for a singleton, never a fabricated self-similarity. */
  readonly semanticConnectedness: number | null;
  readonly neighbors: readonly GlobalSemanticNeighbor[];
}
export interface GlobalSemanticRelationship {
  readonly left: string;
  readonly right: string;
  readonly score: number;
  readonly mutual: boolean;
}
export interface GlobalSemanticProgress { readonly completedPairs: number; readonly totalPairs: number }
export interface GlobalSemanticOptions {
  /** Exact canonical paths from the selected metadata scope, before pairwise analysis. */
  readonly paths?: readonly string[];
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: GlobalSemanticProgress) => void;
}
export type GlobalSemanticAnalysis = {
  readonly indexedNoteCount: number;
  readonly mappedNoteCount: number;
} & ({ readonly state: "ready"; readonly nodes: readonly GlobalSemanticDocument[]; readonly edges: readonly GlobalSemanticRelationship[] }
  | { readonly state: "too-large" | "core-unavailable" });
