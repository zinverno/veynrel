import { compareStrings, isTimestamp } from "../../health/domain/validation";
import { throwIfAborted } from "../cancellation";
import { RecallDiagnostics } from "../diagnostics";
import type { RecallCardCandidate, RecallDiagnostic } from "../domain/card";
import { MAX_RECALL_CARDS } from "../domain/card";
import { isRecallCandidate } from "../domain/validation";
import { getRetrievability, previewRatings } from "../scheduler/fsrs6";
import type { RecallRating } from "../scheduler/types";
import type { RecallCoverage, RecallSource } from "../source/types";
import { RecallStore } from "../store/recallStore";
import { RecallStorageBlockedError } from "../store/types";
import type { RecallCardFilter, RecallLoadResult, RecallStoragePort } from "../store/types";

export interface RecallInventoryResult {
  observedAt: number;
  cardsSeen: number;
  created: number;
  updated: number;
  retired: number;
  complete: boolean;
  committed: boolean;
  freshness: "verified" | "stale" | "unavailable";
  coverage: RecallCoverage;
  diagnostics: readonly RecallDiagnostic[];
  diagnosticsTruncated: number;
}
export class RecallScanAlreadyRunningError extends Error {
  constructor() { super("A Recall inventory is already running."); }
}
class RecallFreshnessError extends Error {
  constructor(readonly code: "stale-inventory" | "inventory-unavailable") { super(code); }
}

/** Explicit metadata initialization and inventory only. Exactly one private store. */
export class RecallService {
  private readonly store: RecallStore;
  private running = false;

  constructor(storage: RecallStoragePort, private readonly source: RecallSource, private readonly clock: () => number = () => Date.now()) {
    this.store = new RecallStore(storage);
  }

  initialize(): Promise<RecallLoadResult> { return this.store.load(); }
  getLoadResult(): RecallLoadResult { return this.store.getLoadResult(); }
  listCards(filter?: RecallCardFilter) { return this.store.listCards(filter); }
  getCard(id: string) { return this.store.getCard(id); }

  getNextDueAt(): number | undefined {
    const cards = this.store.listCards({ state: "active" });
    return cards.length ? cards.reduce((earliest, card) => Math.min(earliest, card.schedule.dueAt), Infinity) : undefined;
  }

  /** No daily limits yet. The inventory/storage bound also bounds an unpaginated queue. */
  listDue(at: number, limit = MAX_RECALL_CARDS) {
    this.validateQueryTime(at);
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_RECALL_CARDS) throw new Error("Invalid Recall queue limit.");
    return this.store.listCards({ state: "active" }).filter((card) => card.schedule.dueAt <= at)
      .sort((a, b) => a.schedule.dueAt - b.schedule.dueAt || compareStrings(a.id, b.id)).slice(0, limit);
  }

  previewCard(id: string, at: number) {
    const card = this.requireCard(id);
    if (card.state !== "active") throw new Error("Retired Recall cards cannot be reviewed.");
    return previewRatings(card.schedule, at);
  }

  reviewCard(id: string, rating: RecallRating, reviewedAt: number) { return this.store.reviewCard(id, rating, reviewedAt); }

  getRetrievability(id: string, at: number) { return getRetrievability(this.requireCard(id).schedule, at); }

  /** New is a subset of Learning; phase counts include all active cards in that phase. */
  getSummary(at: number) {
    this.validateQueryTime(at);
    const summary = { active: 0, due: 0, new: 0, learning: 0, review: 0, relearning: 0 };
    for (const card of this.store.listCards({ state: "active" })) {
      summary.active++;
      summary[card.schedule.phase]++;
      if (card.schedule.reviewCount === 0) summary.new++;
      if (card.schedule.dueAt <= at) summary.due++;
    }
    return summary;
  }

  private requireCard(id: string) {
    const card = this.store.getCard(id);
    if (!card) throw new Error("Recall card does not exist.");
    return card;
  }

  private validateQueryTime(at: number): void {
    if (!isTimestamp(at)) throw new Error("Invalid Recall query time.");
  }

  async scan(signal: AbortSignal): Promise<RecallInventoryResult> {
    if (this.running) throw new RecallScanAlreadyRunningError();
    throwIfAborted(signal);
    const load = this.store.getLoadResult();
    if (!load.writable) throw new RecallStorageBlockedError(load.status);
    const now = this.clock();
    if (!isTimestamp(now)) throw new Error("Invalid Recall observation time.");
    // One observation for the entire run; preserve timestamp ordering across backward clocks/restarts.
    const observedAt = Math.max(now, this.store.getUpdatedAt());
    this.running = true;
    try {
      const inventory = await this.source.capture(signal);
      throwIfAborted(signal);
      const diagnostics = new RecallDiagnostics();
      diagnostics.merge(inventory);
      const candidates = new Map<string, RecallCardCandidate>();
      for (const card of inventory.cards) {
        if (!isRecallCandidate(card)) throw new Error("Invalid Recall inventory candidate.");
        if (candidates.has(card.fingerprint)) diagnostics.add("duplicate-card", card.path);
        else candidates.set(card.fingerprint, card);
      }
      const outcome: RecallInventoryResult = { observedAt, cardsSeen: candidates.size, created: 0, updated: 0, retired: 0,
        complete: inventory.complete, committed: false, freshness: "verified", coverage: { ...inventory.coverage }, ...diagnostics.result() };
      try {
        const counts = await this.store.reconcile({ candidates: [...candidates.values()], complete: inventory.complete, observedAt }, {
          signal, beforeCommit: async () => {
            let revision: string;
            try { revision = await this.source.captureRevision(signal); }
            catch { throwIfAborted(signal); throw new RecallFreshnessError("inventory-unavailable"); }
            throwIfAborted(signal);
            if (revision !== inventory.revision) throw new RecallFreshnessError("stale-inventory");
          },
        });
        return { ...outcome, ...counts, committed: true };
      } catch (error) {
        if (!(error instanceof RecallFreshnessError)) throw error;
        diagnostics.add(error.code);
        return { ...outcome, complete: false, freshness: error.code === "stale-inventory" ? "stale" : "unavailable", ...diagnostics.result() };
      }
    } finally { this.running = false; }
  }
}
