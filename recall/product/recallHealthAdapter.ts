import type { RecallHealthPort, RecallHealthSnapshot } from "../../health/recallHealthPort";
import type { RecallProductPort } from "./types";

/** Projects the same plugin owner used by Recall UI; no separate reader, cache or scheduling policy. */
export class RecallHealthAdapter implements RecallHealthPort {
  constructor(private readonly product: RecallProductPort) {}

  initialize(): Promise<void> { return this.product.initialize(); }
  subscribe(listener: () => void): () => void { return this.product.subscribe(listener); }
  getSnapshot(): RecallHealthSnapshot {
    const snapshot = this.product.getSnapshot();
    const { loadState, firstRun } = snapshot;
    const summary = snapshot.globalSummary ?? snapshot.summary, nextDueAt = snapshot.globalSummary ? snapshot.globalNextDueAt : snapshot.nextDueAt;
    return { loadState, firstRun, active: summary?.active ?? 0, due: summary?.due ?? 0, new: summary?.new ?? 0,
      ...(nextDueAt === undefined ? {} : { nextDueAt }) };
  }
}
