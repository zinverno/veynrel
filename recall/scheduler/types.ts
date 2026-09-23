export const RECALL_RATINGS = Object.freeze(["again", "hard", "good", "easy"] as const);
export type RecallRating = typeof RECALL_RATINGS[number];
export type RecallPhase = "learning" | "review" | "relearning";

/** Inventory lifecycle (active/retired) is independent of this memory state. Times are epoch milliseconds. */
export interface RecallSchedule {
  readonly algorithm: "fsrs-6";
  readonly policyVersion: 1;
  readonly phase: RecallPhase;
  readonly step?: number;
  readonly dueAt: number;
  readonly lastReviewAt?: number;
  readonly stability?: number;
  readonly difficulty?: number;
  readonly reviewCount: number;
  readonly lapseCount: number;
  readonly lastRating?: RecallRating;
}

export interface RecallRatingOutcome {
  readonly rating: RecallRating;
  readonly schedule: RecallSchedule;
  readonly intervalMs: number;
  readonly retrievabilityBefore?: number;
}
