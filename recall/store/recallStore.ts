import { compareStrings, isTimestamp } from "../../health/domain/validation";
import type { RecallCard, RecallCardCandidate } from "../domain/card";
import { copyRecallCard, MAX_RECALL_CARDS } from "../domain/card";
import { isRecallId, isRecallPath } from "../domain/identity";
import { isRecallCandidate } from "../domain/validation";
import { throwIfAborted } from "../cancellation";
import { createInitialSchedule, rateSchedule } from "../scheduler/fsrs6";
import type { RecallRating, RecallRatingOutcome } from "../scheduler/types";
import { decodeRecall, serializeRecall } from "./codec";
import { RECALL_SCHEMA_VERSION, RecallStorageBlockedError, RecallStorageWriteError } from "./types";
import type { RecallCardsSnapshot, RecallCardFilter, RecallCommitOptions, RecallLoadResult, RecallReconcileRequest,
  RecallReconcileResult, RecallStoragePort } from "./types";

/** One owner per storage root. Only successfully persisted snapshots become visible. */
export class RecallStore {
  private snapshot: RecallCardsSnapshot = { version: RECALL_SCHEMA_VERSION, updatedAt: 0, cards: {} };
  private loaded?: RecallLoadResult;
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly storage: RecallStoragePort) {}

  load(): Promise<RecallLoadResult> {
    return this.enqueue(async () => {
      if (this.loaded) return { ...this.loaded };
      let result: ReturnType<typeof decodeRecall>;
      try { result = decodeRecall(await this.storage.read()); }
      catch { result = { status: "unavailable" }; }
      if (result.data) this.snapshot = result.data;
      this.loaded = { status: result.status, writable: result.status === "loaded" || result.status === "missing" };
      return { ...this.loaded };
    });
  }

  getLoadResult(): RecallLoadResult {
    if (!this.loaded) throw new Error("Recall store is not initialized.");
    return { ...this.loaded };
  }

  getUpdatedAt(): number { this.getLoadResult(); return this.snapshot.updatedAt; }
  hasFullInventory(): boolean { this.getLoadResult(); return this.snapshot.inventoryCompletedAt !== undefined; }

  getCard(id: string): RecallCard | undefined {
    this.getLoadResult();
    if (!isRecallId(id)) throw new Error("Invalid Recall ID.");
    const card = this.snapshot.cards[id];
    return card ? copyRecallCard(card) : undefined;
  }

  /** Code-unit ID order, independent of locale or original Markdown line order. */
  listCards(filter: RecallCardFilter = {}): RecallCard[] {
    this.getLoadResult();
    if ((filter.state !== undefined && filter.state !== "active" && filter.state !== "retired") ||
        (filter.path !== undefined && !isRecallPath(filter.path))) throw new Error("Invalid Recall filter.");
    return Object.values(this.snapshot.cards).filter((card) => (filter.state === undefined || card.state === filter.state) &&
      (filter.path === undefined || card.path === filter.path)).sort((a, b) => compareStrings(a.id, b.id)).map(copyRecallCard);
  }

  reviewCard(id: string, rating: RecallRating, reviewedAt: number): Promise<RecallRatingOutcome> {
    return this.enqueue(async () => {
      this.requireWritable();
      const card = this.getCard(id);
      if (!card) throw new Error("Recall card does not exist.");
      if (card.state !== "active") throw new Error("Retired Recall cards cannot be reviewed.");
      // Compute inside the shared queue against the latest durable memory state, including double-review validation.
      const outcome = rateSchedule(card.schedule, rating, reviewedAt);
      const next: RecallCardsSnapshot = { ...this.snapshot, updatedAt: Math.max(this.snapshot.updatedAt, reviewedAt),
        cards: { ...this.snapshot.cards, [id]: { ...card, schedule: { ...outcome.schedule } } } };
      await this.persist(next);
      return outcome;
    });
  }

  async reconcile(request: RecallReconcileRequest, options: RecallCommitOptions = {}): Promise<RecallReconcileResult> {
    return this.reconcileCandidates(request, options, false);
  }

  /** Append-only observation: merge against the latest schedule even when queued behind a review. */
  async admit(candidates: readonly RecallCardCandidate[], observedAt: number, options: RecallCommitOptions = {}): Promise<RecallReconcileResult> {
    return this.reconcileCandidates({ candidates, observedAt, complete: false }, options, true);
  }

  private async reconcileCandidates(request: RecallReconcileRequest, options: RecallCommitOptions, admission: boolean): Promise<RecallReconcileResult> {
    if (!request || !Array.isArray(request.candidates) || request.candidates.length > MAX_RECALL_CARDS ||
        !Array.from(request.candidates).every(isRecallCandidate) || typeof request.complete !== "boolean" || !isTimestamp(request.observedAt)) {
      throw new Error("Invalid Recall reconciliation.");
    }
    const candidates = request.candidates.map((card: RecallCardCandidate) => ({ ...card }));
    const { complete, observedAt: requestedAt } = request;
    const { beforeCommit, signal } = options;
    return this.enqueue(async () => {
      this.requireWritable();
      throwIfAborted(signal);
      const observedAt = admission ? Math.max(requestedAt, this.snapshot.updatedAt) : requestedAt;
      if (observedAt < this.snapshot.updatedAt) throw new Error("Stale Recall observation.");
      const cards = { ...this.snapshot.cards };
      const seen = new Set<string>();
      const result = { created: 0, updated: 0, retired: 0 };
      for (const candidate of candidates) {
        const previous = cards[candidate.id];
        if (previous && previous.fingerprint !== candidate.fingerprint) throw new Error("Recall identity collision.");
        if (seen.has(candidate.id)) continue;
        seen.add(candidate.id);
        cards[candidate.id] = { ...candidate, state: "active", firstSeenAt: previous?.firstSeenAt ?? observedAt, lastSeenAt: observedAt,
          schedule: previous?.schedule ?? createInitialSchedule(observedAt) };
        if (previous) result.updated++;
        else result.created++;
      }
      if (complete) {
        for (const card of Object.values(cards)) {
          if (card.state === "active" && !seen.has(card.id)) { cards[card.id] = { ...card, state: "retired" }; result.retired++; }
        }
      }
      await this.persist({ ...this.snapshot, updatedAt: observedAt, cards,
        ...(complete ? { inventoryCompletedAt: observedAt } : {}) }, { beforeCommit, signal });
      return result;
    });
  }

  private requireWritable(): void {
    const load = this.getLoadResult();
    if (!load.writable) throw new RecallStorageBlockedError(load.status);
  }

  private async persist(next: RecallCardsSnapshot, options: RecallCommitOptions = {}): Promise<void> {
    const raw = serializeRecall(next);
    await options.beforeCommit?.();
    throwIfAborted(options.signal);
    try { await this.storage.write(raw); }
    catch {
      // A failed adapter write may have truncated bytes. Block this owner until metadata is reloaded by a new owner.
      this.loaded = { status: "unavailable", writable: false };
      throw new RecallStorageWriteError();
    }
    // The issued write cannot be rolled back by AbortSignal; publish committed truth even after late cancellation.
    this.snapshot = next;
    this.loaded = { status: "loaded", writable: true };
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}
