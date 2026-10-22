/** User decisions are not findings or Markdown-operation receipts. */
export interface DecisionNote { path: string; created: number; hash: string }
export interface ReviewDecision { id: string; notes: readonly [DecisionNote, DecisionNote] }
export interface ReviewDecisionsPort {
  readonly state: "loading" | "ready" | "error";
  list(): readonly ReviewDecision[];
  hasPaths(paths: readonly string[]): boolean;
  load(): Promise<void>;
  subscribe(listener: () => void): () => void;
  restore(id: string): Promise<void>;
}
