import { describe, expect, it, vi } from "vitest";
import { RecallStore } from "./recallStore";
import { candidate, gate, memoryStorage, request } from "../testSupport";
import { createInitialSchedule, previewRatings } from "../scheduler/fsrs6";
import { RECALL_RATINGS } from "../scheduler/types";
import type { RecallRating } from "../scheduler/types";

async function fixture() {
  const storage = memoryStorage(), store = new RecallStore(storage);
  await store.load(); await store.reconcile(request([candidate()]));
  return { store, storage, id: candidate().id };
}

describe("Recall persist-first reviews", () => {
  it("queues targeted admission behind a review, preserves its exact schedule and never retires other notes", async () => {
    const { store, storage, id } = await fixture(), entered = gate(), hold = gate(), write = storage.write;
    storage.write = vi.fn(async (raw) => { entered.release(); await hold.promise; await write(raw); });
    const pendingReview = store.reviewCard(id, "easy", 200); await entered.promise;
    // Read completed before the queued review published. Merge against durable latest state.
    const pendingImport = store.admit([candidate(), candidate("New"), candidate("Other", "Other.md")], 100);
    hold.release(); const reviewed = await pendingReview; await pendingImport;
    expect(store.getCard(id)?.schedule).toEqual(reviewed.schedule);
    expect(store.getUpdatedAt()).toBe(200); expect(store.listCards({ state: "active" })).toHaveLength(3);
    await store.admit([candidate("New")], 300); expect(store.listCards({ state: "active" })).toHaveLength(3);
  });

  it.each(RECALL_RATINGS)("commits %s exactly as previewed and reloads durable memory", async (rating) => {
    const { store, storage, id } = await fixture();
    const preview = previewRatings(store.getCard(id)!.schedule, 200)[rating];
    expect(await store.reviewCard(id, rating, 200)).toEqual(preview);
    expect(store.getCard(id)).toMatchObject({ schedule: preview.schedule, firstSeenAt: 100, lastSeenAt: 100 });
    const restarted = new RecallStore(storage); await restarted.load();
    expect(restarted.getCard(id)).toEqual(store.getCard(id));
    expect(storage.write).toHaveBeenCalledTimes(2);
  });

  it("publishes no optimistic schedule while a write is in flight", async () => {
    const { store, storage, id } = await fixture(), entered = gate(), hold = gate();
    const before = store.getCard(id), write = storage.write;
    storage.write = vi.fn(async (raw) => { entered.release(); await hold.promise; await write(raw); });
    const pending = store.reviewCard(id, "easy", 200);
    await entered.promise; expect(store.getCard(id)).toEqual(before); expect(store.getUpdatedAt()).toBe(100);
    hold.release(); const outcome = await pending;
    expect(store.getCard(id)?.schedule).toEqual(outcome.schedule); expect(store.getUpdatedAt()).toBe(200);
  });

  it("keeps every scheduler field unchanged on failed review persistence and poisons the owner", async () => {
    const { store, storage, id } = await fixture(); await store.reviewCard(id, "easy", 200);
    const before = store.getCard(id), bytes = storage.bytes();
    storage.write.mockRejectedValueOnce(new Error("PRIVATE"));
    await expect(store.reviewCard(id, "again", 300)).rejects.toThrow("could not be saved");
    expect(store.getCard(id)).toEqual(before); expect(storage.bytes()).toBe(bytes); expect(store.getUpdatedAt()).toBe(200);
    await expect(store.reviewCard(id, "good", 400)).rejects.toThrow("write-blocked");
    await expect(store.reconcile(request([], 500))).rejects.toThrow("write-blocked");
    expect(storage.write).toHaveBeenCalledTimes(3);
  });

  it("rejects concurrent double commits and stale timestamps without another write", async () => {
    const { store, storage, id } = await fixture();
    const results = await Promise.allSettled([store.reviewCard(id, "good", 200), store.reviewCard(id, "easy", 200)]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    await expect(store.reviewCard(id, "again", 199)).rejects.toThrow("Stale");
    expect(store.getCard(id)?.schedule).toMatchObject({ reviewCount: 1, lastRating: "good", lastReviewAt: 200 });
    expect(storage.write).toHaveBeenCalledTimes(2);
    // Explicit early reviews remain allowed, with the next operation observing the preceding commit.
    await Promise.all([store.reviewCard(id, "good", 201), store.reviewCard(id, "again", 202)]);
    expect(store.getCard(id)?.schedule).toMatchObject({ reviewCount: 3, lapseCount: 1, phase: "relearning" });
  });

  it("validates ID, existence, rating and time before writing", async () => {
    const { store, storage, id } = await fixture(); const before = store.listCards();
    for (const [cardId, rating, at] of [["__proto__", "good", 200], ["recall-0000000000000000", "good", 200],
      [id, "perfect", 200], [id, 3, 200], [id, "good", NaN], [id, "good", -1], [id, "good", 200.5]] as const) {
      await expect(store.reviewCard(cardId, rating as RecallRating, at)).rejects.toThrow();
    }
    expect(store.listCards()).toEqual(before); expect(storage.write).toHaveBeenCalledTimes(1);
  });

  it("preserves memory through observation, retirement, recurrence and content/path replacement", async () => {
    const { store, storage, id } = await fixture(); await store.reviewCard(id, "easy", 200);
    const schedule = store.getCard(id)!.schedule;
    await store.reconcile(request([candidate()], 300)); expect(store.getCard(id)?.schedule).toEqual(schedule);
    await store.reconcile(request([], 400)); expect(store.getCard(id)).toMatchObject({ state: "retired", schedule });
    const bytes = storage.bytes(), writes = storage.write.mock.calls.length;
    await expect(store.reviewCard(id, "good", 500)).rejects.toThrow("Retired");
    expect(storage.bytes()).toBe(bytes); expect(storage.write).toHaveBeenCalledTimes(writes);
    await store.reconcile(request([candidate()], 600)); expect(store.getCard(id)).toMatchObject({ state: "active", schedule });
    await store.reviewCard(id, "hard", 700);
    const edited = candidate("Edited", "Renamed.md"); await store.reconcile(request([edited], 800));
    expect(store.getCard(edited.id)?.schedule).toEqual(createInitialSchedule(800));
    expect(store.getCard(id)).toMatchObject({ state: "retired", schedule: { reviewCount: 2, lastReviewAt: 700 } });
  });

  it("merges an inventory queued behind a review against the latest schedule", async () => {
    const { store, storage, id } = await fixture(), entered = gate(), hold = gate(), write = storage.write;
    storage.write = vi.fn(async (raw) => { entered.release(); await hold.promise; await write(raw); });
    const review = store.reviewCard(id, "easy", 200); await entered.promise;
    const scan = store.reconcile(request([candidate()], 300));
    hold.release(); const outcome = await review; await scan;
    expect(store.getCard(id)).toMatchObject({ lastSeenAt: 300, schedule: outcome.schedule });
  });

  it("copies nested schedules in getters and committed results", async () => {
    const { store, storage, id } = await fixture();
    const outcome = await store.reviewCard(id, "good", 200), bytes = storage.bytes(), before = store.getCard(id);
    Object.assign(outcome.schedule, { dueAt: 0, reviewCount: 90 });
    Object.assign(store.getCard(id)!.schedule, { difficulty: 10 });
    Object.assign(store.listCards()[0].schedule, { stability: 999 });
    expect(store.getCard(id)).toEqual(before); expect(storage.bytes()).toBe(bytes);
  });
});
