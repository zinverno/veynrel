import { isTimestamp } from "../../health/domain/validation";
import { throwIfAborted } from "../cancellation";
import { RecallDiagnostics } from "../diagnostics";
import type { RecallCardCandidate, RecallDiagnostic } from "../domain/card";
import { isRecallCandidate } from "../domain/validation";
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

/** Dormant until explicitly constructed/initialized by a future consumer. Exactly one private store. */
export class RecallService {
  private readonly store: RecallStore;
  private running = false;

  constructor(storage: RecallStoragePort, private readonly source: RecallSource, private readonly clock: () => number = () => Date.now()) {
    this.store = new RecallStore(storage);
  }

  initialize(): Promise<RecallLoadResult> { return this.store.load(); }
  listCards(filter?: RecallCardFilter) { return this.store.listCards(filter); }
  getCard(id: string) { return this.store.getCard(id); }

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
