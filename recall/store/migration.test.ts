import { describe, expect, it, vi } from "vitest";
import { candidate, memoryStorage, request, signal } from "../testSupport";
import { createInitialSchedule, rateSchedule } from "../scheduler/fsrs6";
import type { RecallSchedule } from "../scheduler/types";
import type { RecallCardsSnapshot } from "./types";
import { decodeRecall, isRecallSnapshot, serializeRecall } from "./codec";
import { RecallStore } from "./recallStore";
import { RecallService } from "../services/recallService";
import { ObsidianRecallSource } from "../source/obsidianRecallSource";

function v1() {
  const active = candidate(), retired = candidate("Old");
  return { version: 1, updatedAt: 100, cards: {
    [active.id]: { ...active, firstSeenAt: 40, lastSeenAt: 100, state: "active" },
    [retired.id]: { ...retired, firstSeenAt: 20, lastSeenAt: 80, state: "retired" },
  } };
}

function snapshot(): RecallCardsSnapshot {
  const card = candidate();
  return { version: 3, updatedAt: 100, cards: { [card.id]: { ...card, firstSeenAt: 40, lastSeenAt: 100,
    state: "active", schedule: rateSchedule(createInitialSchedule(40), "easy", 50).schedule } } };
}

describe("Recall v1 to v3 read-only migration", () => {
  it.each(["review", "inventory", "targeted"])("loads original v1 cards without IO beyond metadata; next %s writes v3", async (mutation) => {
    const raw = JSON.stringify(v1()), storage = memoryStorage(raw), store = new RecallStore(storage);
    expect(await store.load()).toEqual({ status: "loaded", writable: true });
    expect(storage.read).toHaveBeenCalledTimes(1); expect(storage.write).not.toHaveBeenCalled(); expect(storage.bytes()).toBe(raw);
    expect(decodeRecall(raw).data).toMatchObject({ version: 3 });
    expect(decodeRecall(raw).data).not.toHaveProperty("inventoryCompletedAt"); expect(store.hasFullInventory()).toBe(false);
    for (const original of Object.values(v1().cards)) {
      expect(store.getCard(original.id)).toEqual({ ...original, schedule: createInitialSchedule(original.firstSeenAt) });
    }
    if (mutation === "review") await store.reviewCard(candidate().id, "good", 200);
    else if (mutation === "targeted") await store.admit([candidate()], 200);
    else await store.reconcile(request([candidate()], 200));
    expect(JSON.parse(storage.bytes()!) as unknown).toMatchObject({ version: 3 });
    expect(store.hasFullInventory()).toBe(mutation === "inventory");
    const restarted = new RecallStore(storage); expect(await restarted.load()).toEqual({ status: "loaded", writable: true });
    expect(restarted.listCards()).toEqual(store.listCards());
    expect(store.getCard(candidate("Old").id)?.schedule).toEqual(createInitialSchedule(20));
  });

  it("initializes the service with metadata only and makes migrated active cards due", async () => {
    const storage = memoryStorage(JSON.stringify(v1())), vault = { configDir: ".private", getMarkdownFiles: vi.fn(() => []), getFileByPath: vi.fn(), read: vi.fn() };
    const service = new RecallService(storage, new ObsidianRecallSource(vault));
    await service.initialize();
    expect(service.listDue(100).map((card) => card.id)).toEqual([candidate().id]);
    expect(service.getSummary(100)).toEqual({ active: 1, due: 1, new: 1, learning: 1, review: 0, relearning: 0 });
    expect(vault.getMarkdownFiles).not.toHaveBeenCalled(); expect(vault.read).not.toHaveBeenCalled(); expect(storage.write).not.toHaveBeenCalled();
  });

  it("keeps strict v1 validation instead of repairing malformed legacy cards", () => {
    const legacy = v1();
    for (const change of [{ lastSeenAt: 101 }, { firstSeenAt: -1 }, { id: "wrong" }, { schedule: {} }, { state: "review" }]) {
      expect(decodeRecall(JSON.stringify({ ...legacy, cards: { [candidate().id]: { ...legacy.cards[candidate().id], ...change } } })).status).toBe("invalid");
    }
    expect(decodeRecall('{"version":1,"updatedAt":100,"cards":{}}')).toEqual({ status: "loaded", data: { version: 3, updatedAt: 100, cards: {} } });
    expect(decodeRecall(JSON.stringify({ ...legacy, extra: true })).status).toBe("invalid");
    expect(decodeRecall(JSON.stringify({ ...legacy, inventoryCompletedAt: 100 })).status).toBe("invalid");
  });
});

describe.each([2, 3])("Recall v%s scheduler validation and poisoning", (version) => {
  it.each([
    { stability: NaN }, { stability: Infinity }, { stability: 0 }, { stability: 0.0009 }, { stability: "1" },
    { difficulty: NaN }, { difficulty: Infinity }, { difficulty: 0.99 }, { difficulty: 10.01 },
    { phase: "new" }, { phase: "retired" }, { step: 0 }, { phase: "learning", step: -1 },
    { phase: "learning", step: 2 }, { phase: "learning", step: 0.5 }, { phase: "relearning", step: 1 },
    { phase: "relearning", step: 0 }, { lastRating: "fail" }, { lastRating: 3 }, { lastRating: undefined },
    { reviewCount: -1 }, { reviewCount: 1.5 }, { reviewCount: Number.MAX_SAFE_INTEGER + 1 },
    { lapseCount: -1 }, { lapseCount: 1 }, { lapseCount: 0.5 },
    { dueAt: NaN }, { dueAt: Infinity }, { dueAt: -1 }, { dueAt: 50 }, { dueAt: 0.5 },
    { lastReviewAt: NaN }, { lastReviewAt: Infinity }, { lastReviewAt: -1 }, { lastReviewAt: 101 },
    { lastReviewAt: undefined }, { stability: undefined }, { difficulty: undefined },
    { algorithm: "" }, { algorithm: null }, { policyVersion: 0 }, { policyVersion: 1.5 }, { policyVersion: "1" }, { extra: true },
  ])("rejects corrupt scheduling fields %j without coercion", (change) => {
    const data = snapshot(), id = candidate().id;
    data.cards[id] = { ...data.cards[id], schedule: { ...data.cards[id].schedule, ...change } as RecallSchedule };
    expect(isRecallSnapshot(data)).toBe(false);
    expect(() => serializeRecall(data)).toThrow();
    expect(decodeRecall(JSON.stringify({ ...data, version })).status).toBe("invalid");
  });

  it("rejects inconsistent unreviewed memory, due time and learning steps", () => {
    const data = snapshot(), id = candidate().id;
    for (const change of [{ stability: 1 }, { difficulty: 1 }, { lastReviewAt: 50 }, { lastRating: "again" },
      { dueAt: 41 }, { phase: "review", step: undefined }, { step: 1 }, { lapseCount: 1 }]) {
      data.cards[id] = { ...data.cards[id], schedule: { ...createInitialSchedule(40), ...change } as RecallSchedule };
      expect(decodeRecall(JSON.stringify({ ...data, version })).status).toBe("invalid");
    }
  });

  it.each([{ algorithm: "fsrs-7" }, { policyVersion: 2 }, { policyVersion: 99 }])("write-blocks unsupported scheduler %j and preserves exact bytes", async (change) => {
    const data = snapshot(), id = candidate().id;
    const raw = JSON.stringify({ ...data, version, cards: { [id]: { ...data.cards[id], schedule: { ...data.cards[id].schedule, ...change } } } });
    const storage = memoryStorage(raw), vault = { configDir: ".private", getMarkdownFiles: vi.fn(() => []), getFileByPath: vi.fn(), read: vi.fn() };
    const service = new RecallService(storage, new ObsidianRecallSource(vault));
    expect(await service.initialize()).toEqual({ status: "unsupported", writable: false });
    await expect(service.reviewCard(id, "good", 200)).rejects.toThrow("write-blocked");
    await expect(service.scan(signal())).rejects.toThrow("write-blocked");
    await expect(service.refreshNote("A.md")).rejects.toThrow("write-blocked");
    expect(storage.bytes()).toBe(raw); expect(storage.write).not.toHaveBeenCalled(); expect(vault.read).not.toHaveBeenCalled();
  });
});
