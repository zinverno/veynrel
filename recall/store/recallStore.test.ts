import { describe, expect, it, vi } from "vitest";
import { RecallStore } from "./recallStore";
import { RecallStorageBlockedError } from "./types";
import { candidate, gate, memoryStorage, request } from "../testSupport";
import type { RecallCard, RecallCardCandidate } from "../domain/card";
import { createInitialSchedule } from "../scheduler/fsrs6";

async function fixture() {
  const storage = memoryStorage();
  const store = new RecallStore(storage);
  await store.load();
  return { storage, store };
}

describe("Recall persist-first store", () => {
  it("constructs without IO, loads once without writes and treats missing as writable", async () => {
    const storage = memoryStorage(); const store = new RecallStore(storage);
    expect(storage.read).not.toHaveBeenCalled(); expect(storage.write).not.toHaveBeenCalled();
    expect(() => store.listCards()).toThrow("not initialized");
    expect(await store.load()).toEqual({ status: "missing", writable: true });
    await store.load(); expect(storage.read).toHaveBeenCalledTimes(1);
    expect(storage.write).not.toHaveBeenCalled(); expect(store.listCards()).toEqual([]);
  });

  it("creates, updates at one observation, retires absence and reactivates recurrence durably", async () => {
    const { store, storage } = await fixture(); const card = candidate(); const other = candidate("Other");
    expect(await store.reconcile(request([card, other]))).toEqual({ created: 2, updated: 0, retired: 0 });
    expect(store.getCard(card.id)).toEqual({ ...card, firstSeenAt: 100, lastSeenAt: 100, state: "active", schedule: createInitialSchedule(100) });
    expect(await store.reconcile(request([card], 200))).toEqual({ created: 0, updated: 1, retired: 1 });
    expect(store.getCard(other.id)).toMatchObject({ state: "retired", firstSeenAt: 100, lastSeenAt: 100 });
    expect(await store.reconcile(request([], 300))).toEqual({ created: 0, updated: 0, retired: 1 });
    expect(await store.reconcile(request([card], 400))).toEqual({ created: 0, updated: 1, retired: 0 });
    expect(store.getCard(card.id)).toMatchObject({ state: "active", firstSeenAt: 100, lastSeenAt: 400 });
    const restarted = new RecallStore(storage); expect(await restarted.load()).toEqual({ status: "loaded", writable: true });
    expect(restarted.listCards()).toEqual(store.listCards());
  });

  it("partial absence never retires, while still admitting new and updating seen cards", async () => {
    const { store } = await fixture(); const card = candidate(); await store.reconcile(request([card]));
    expect(await store.reconcile(request([candidate("New")], 200, false))).toEqual({ created: 1, updated: 0, retired: 0 });
    expect(store.getCard(card.id)).toMatchObject({ state: "active", lastSeenAt: 100 });
    await store.reconcile(request([card], 300, false));
    expect(store.getCard(card.id)).toMatchObject({ state: "active", lastSeenAt: 300 });
  });

  it("question/answer/path edits create new items and only a complete scan retires the old item", async () => {
    const { store } = await fixture(); await store.reconcile(request([candidate()]));
    const fresh = candidate("Edited", "Renamed.md");
    expect(await store.reconcile(request([fresh], 200))).toEqual({ created: 1, updated: 0, retired: 1 });
    expect(store.getCard(fresh.id)).toMatchObject({ firstSeenAt: 200, state: "active" });
    expect(store.getCard(candidate().id)?.state).toBe("retired");
  });

  it("keeps published cards/timestamps unchanged on failed writes and blocks potentially poisoned bytes", async () => {
    const { store, storage } = await fixture(); await store.reconcile(request([candidate()]));
    const cards = store.listCards(), bytes = storage.bytes();
    storage.write.mockRejectedValueOnce(new Error("PRIVATE filesystem exception"));
    await expect(store.reconcile(request([], 200))).rejects.toThrow("could not be saved");
    expect(store.listCards()).toEqual(cards); expect(store.getUpdatedAt()).toBe(100); expect(storage.bytes()).toBe(bytes);
    await expect(store.reconcile(request([], 300))).rejects.toBeInstanceOf(RecallStorageBlockedError);
    expect(storage.write).toHaveBeenCalledTimes(2);
  });

  it("publishes only after persistence and serializes concurrent reconciliations", async () => {
    const { store, storage } = await fixture(); const entered = gate(), hold = gate(); const write = storage.write;
    storage.write = vi.fn(async (raw) => { entered.release(); await hold.promise; await write(raw); });
    const first = store.reconcile(request([candidate()], 100));
    const second = store.reconcile(request([candidate("Two")], 200));
    await entered.promise;
    expect(store.listCards()).toEqual([]); expect(storage.write).toHaveBeenCalledTimes(1);
    hold.release(); await Promise.all([first, second]);
    expect(store.listCards({ state: "active" }).map((card) => card.question)).toEqual(["Two"]);
    expect(store.listCards({ state: "retired" })).toHaveLength(1);
  });

  it("copies request data before it enters the queue and copies all getter results", async () => {
    const { store } = await fixture(); const source = { ...candidate() }; const input = request([source]);
    const pending = store.reconcile(input); source.question = "Bad"; input.complete = false; input.observedAt = 900;
    await pending;
    const card = store.getCard(candidate().id)!;
    (card as { question: string }).question = "Tampered";
    const list = store.listCards(); (list[0] as { state: RecallCard["state"] }).state = "retired"; list.pop();
    const load = store.getLoadResult(); load.writable = false;
    expect(store.getCard(candidate().id)).toMatchObject({ question: "Q", lastSeenAt: 100, state: "active" });
    expect(store.getLoadResult().writable).toBe(true);
  });

  it("filters by path/state and returns deterministic order", async () => {
    const { store } = await fixture(); const a = candidate(), b = candidate("B", "B.md");
    await store.reconcile(request([b, a])); await store.reconcile(request([b], 200));
    expect(store.listCards({ state: "active", path: "B.md" })).toHaveLength(1);
    expect(store.listCards({ state: "retired", path: "A.md" })).toHaveLength(1);
    expect(store.listCards().map((card) => card.id)).toEqual([a.id, b.id].sort());
    expect(() => store.getCard("__proto__")).toThrow(); expect(() => store.listCards({ path: "../A.md" })).toThrow();
  });

  it("deduplicates direct candidates, and rejects stale/invalid input without writes", async () => {
    const { store, storage } = await fixture();
    expect(await store.reconcile(request([candidate(), candidate()]))).toEqual({ created: 1, updated: 0, retired: 0 });
    for (const input of [request([], 99), request([], NaN), request([{ ...candidate(), answer: "Changed without identity" }]),
      request([undefined as unknown as RecallCardCandidate])]) {
      await expect(store.reconcile(input)).rejects.toThrow();
    }
    expect(storage.write).toHaveBeenCalledTimes(1);
  });

  it("runs the guard inside the queue after validation and publishes nothing when it fails", async () => {
    const { store, storage } = await fixture(); await store.reconcile(request([candidate()]));
    const beforeCommit = vi.fn(async () => { throw new Error("stale"); });
    await expect(store.reconcile(request([], 200), { beforeCommit })).rejects.toThrow("stale");
    expect(beforeCommit).toHaveBeenCalledTimes(1); expect(store.getCard(candidate().id)?.state).toBe("active");
    expect(storage.write).toHaveBeenCalledTimes(1);
    await store.reconcile(request([], 300)); expect(store.getCard(candidate().id)?.state).toBe("retired");
  });

  it("cancels in the queue/guard with no write, but returns committed counts for cancellation during write", async () => {
    const { store, storage } = await fixture(); const abort = new AbortController();
    await expect(store.reconcile(request([candidate()]), { signal: abort.signal, beforeCommit: async () => { abort.abort(); } })).rejects.toMatchObject({ name: "AbortError" });
    expect(storage.write).not.toHaveBeenCalled(); expect(store.listCards()).toEqual([]);
    const late = new AbortController(); const write = storage.write;
    storage.write = vi.fn(async (raw) => { late.abort(); await write(raw); });
    expect(await store.reconcile(request([candidate()]), { signal: late.signal })).toEqual({ created: 1, updated: 0, retired: 0 });
    expect(store.listCards()).toHaveLength(1);
  });
});
