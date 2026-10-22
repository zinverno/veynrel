/** Captured read-only participation, used only by the standalone connection queue. */
export type Participation = "allow" | "exclude" | "unknown";
export interface ConnectionSelection {
  readonly revision: string;
  document(path: string): Participation;
  pair(left: string, right: string): Participation;
  unknown(path: string): boolean;
}
export interface ConnectionSelectionSource {
  capture(): ConnectionSelection | undefined;
  subscribe(listener: () => void): () => void;
}
export interface ConnectionSelectionSummary {
  readonly revision: string;
  readonly eligibleNoteCount: number;
  readonly excludedNoteCount: number;
  readonly unknownNoteCount: number;
  /** Disjoint counts of all eligible unordered pairs BEFORE top-K, not suppressed recommendations. */
  readonly excludedPairCount: number;
  readonly unknownPairCount: number;
}
