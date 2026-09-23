/** Scheduling state of tracked active cards, not proof of Markdown inventory coverage/freshness. */
export interface RecallHealthSnapshot {
  readonly loadState: "uninitialized" | "loading" | "ready" | "invalid" | "unsupported" | "unavailable";
  readonly firstRun: boolean;
  readonly active: number;
  readonly due: number;
  readonly new: number;
  readonly nextDueAt?: number;
}

/** Passive metadata only. Inventory, reviews and recovery belong to the Recall workspace. */
export interface RecallHealthPort {
  initialize(): Promise<void>;
  getSnapshot(): RecallHealthSnapshot;
  subscribe(listener: () => void): () => void;
}
