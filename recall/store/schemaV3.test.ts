import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { candidate, memoryStorage, request } from "../testSupport";
import { cardsPath, productFixture } from "../product/testSupport";
import { createInitialSchedule, rateSchedule } from "../scheduler/fsrs6";
import { decodeRecall, isRecallSnapshot } from "./codec";
import { RecallStore } from "./recallStore";
import type { RecallCardsSnapshot } from "./types";

function legacyV2(coverage: boolean) {
  const active = candidate(), retired = candidate("Retired"), learning = candidate("Learning");
  const reviewed = rateSchedule(createInitialSchedule(10), "easy", 20).schedule;
  return { version: 2, updatedAt: 100, ...(coverage ? { inventoryCompletedAt: 80 } : {}), cards: {
    [active.id]: { ...active, firstSeenAt: 10, lastSeenAt: 100, state: "active", schedule: reviewed },
    [retired.id]: { ...retired, firstSeenAt: 10, lastSeenAt: 90, state: "retired",
      schedule: rateSchedule(reviewed, "again", 30).schedule },
    [learning.id]: { ...learning, firstSeenAt: 40, lastSeenAt: 100, state: "active", schedule: createInitialSchedule(40) },
  } };
}

describe.each([false, true])("v2 → v3 migration (inventory evidence: %s)", (coverage) => {
  it("loads the exact legacy shape into v3 without writing or changing cards, schedules or coverage", async () => {
    const legacy = legacyV2(coverage), raw = JSON.stringify(legacy), decoded = decodeRecall(raw);
    expect(decoded).toEqual({ status: "loaded", data: { ...legacy, version: 3 } });
    expect(isRecallSnapshot(legacy)).toBe(false); expect(isRecallSnapshot(decoded.data)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(decoded.data!, "inventoryCompletedAt")).toBe(coverage);
    const f = productFixture(raw); await f.product.initialize();
    expect(f.product.getSnapshot()).toMatchObject({ loadState: "ready", canRecover: false, firstRun: false, inventoryEstablished: coverage });
    for (const card of Object.values(legacy.cards)) {
      expect(f.service().getCard(card.id)).toEqual(card);
      expect(JSON.stringify(f.service().getCard(card.id)!.schedule)).toBe(JSON.stringify(card.schedule));
    }
    expect(f.adapter.write).not.toHaveBeenCalled(); expect(f.files.get(cardsPath)).toBe(raw);
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
  });

  it.each(["review", "targeted", "full", "partial"])("persists v3 only on the next %s mutation with the correct coverage", async (mutation) => {
    const legacy = legacyV2(coverage), raw = JSON.stringify(legacy), storage = memoryStorage(raw), store = new RecallStore(storage);
    await store.load(); expect(storage.write).not.toHaveBeenCalled(); expect(storage.bytes()).toBe(raw);
    if (mutation === "review") await store.reviewCard(candidate().id, "good", 200);
    else if (mutation === "targeted") await store.admit([candidate(), candidate("New")], 200);
    else await store.reconcile(request([candidate()], 200, mutation === "full"));
    const saved = JSON.parse(storage.bytes()!) as RecallCardsSnapshot;
    expect(storage.write).toHaveBeenCalledTimes(1); expect(saved.version).toBe(3);
    expect(saved.inventoryCompletedAt).toBe(mutation === "full" ? 200 : legacy.inventoryCompletedAt);
    expect(Object.prototype.hasOwnProperty.call(saved, "inventoryCompletedAt")).toBe(coverage || mutation === "full");
    for (const card of Object.values(legacy.cards)) {
      const schedule = mutation === "review" && card.id === candidate().id ? rateSchedule(card.schedule, "good", 200).schedule : card.schedule;
      expect(saved.cards[card.id].schedule).toEqual(schedule);
      expect(saved.cards[card.id].firstSeenAt).toBe(card.firstSeenAt);
    }
    const restarted = new RecallStore(storage); await restarted.load();
    expect(restarted.hasFullInventory()).toBe(coverage || mutation === "full");
    expect(restarted.listCards()).toEqual(store.listCards()); expect(storage.write).toHaveBeenCalledTimes(1);
  });
});

describe.each([2, 3])("strict v%s coverage validation", (version) => {
  it.each([-1, 101, 0.5, "80", null, Infinity])("blocks malformed inventory marker %j without changing bytes", async (inventoryCompletedAt) => {
    const raw = JSON.stringify({ ...legacyV2(true), version, inventoryCompletedAt });
    const storage = memoryStorage(raw), store = new RecallStore(storage);
    expect(await store.load()).toEqual({ status: "invalid", writable: false });
    await expect(store.admit([candidate()], 200)).rejects.toThrow("write-blocked");
    expect(storage.write).not.toHaveBeenCalled(); expect(storage.bytes()).toBe(raw);
  });

  it.each([false, true])("rejects unknown snapshot fields with coverage %s", (coverage) => {
    expect(decodeRecall(JSON.stringify({ ...legacyV2(coverage), version, futureField: true }))).toEqual({ status: "invalid" });
  });

  it.each([0, 100])("accepts the inclusive marker boundary %s without altering it", (inventoryCompletedAt) => {
    const data = { ...legacyV2(true), version, inventoryCompletedAt };
    expect(decodeRecall(JSON.stringify(data))).toEqual({ status: "loaded", data: { ...data, version: 3 } });
  });
});

describe("durable v3 coverage and merged PR #44 regression", () => {
  it.each([false, true])("retains inventoryEstablished=%s through mutation and restart", async (full) => {
    const f = productFixture(); await f.product.initialize();
    if (full) await f.product.refreshCards(); else await f.product.refreshNote("A.md");
    const first = JSON.parse(f.files.get(cardsPath)!) as RecallCardsSnapshot;
    expect(first.version).toBe(3); expect(f.product.getSnapshot().inventoryEstablished).toBe(full);
    f.time(200); f.product.startSession(); f.product.revealAnswer(); await f.product.rate("again"); f.product.endSession();
    f.time(300); expect(await f.product.refreshNote("A.md")).toBe("updated");
    const saved = JSON.parse(f.files.get(cardsPath)!) as RecallCardsSnapshot;
    expect(saved.inventoryCompletedAt).toBe(full ? 100 : undefined);
    expect(Object.prototype.hasOwnProperty.call(saved, "inventoryCompletedAt")).toBe(full);
    const restarted = productFixture(f.files.get(cardsPath)); await restarted.product.initialize();
    expect(restarted.product.getSnapshot()).toMatchObject({ loadState: "ready", inventoryEstablished: full, canRecover: false });
    expect(restarted.service().listCards()).toEqual(f.service().listCards());
    expect(restarted.adapter.write).not.toHaveBeenCalled();
  });

  it("loads the actual synthetic PR #44 native file without recovery and preserves all seven cards on its first v3 write", async () => {
    // Exact bytes saved by PR #44's isolated native smoke (build 89d8966, merged as 89d10ad).
    const raw = readFileSync(new URL("./fixtures/pr44-v2-cards.json", import.meta.url), "utf8");
    const legacy = JSON.parse(raw) as Omit<RecallCardsSnapshot, "version"> & { version: 2 };
    expect(legacy.version).toBe(2); expect(legacy.inventoryCompletedAt).toBe(1790261296211);
    expect(Object.keys(legacy.cards)).toHaveLength(7);
    const f = productFixture(raw); f.time(legacy.updatedAt + 100); await f.product.initialize();
    expect(f.product.getSnapshot()).toMatchObject({ loadState: "ready", canRecover: false, confirmingRecovery: false, inventoryEstablished: true });
    expect(f.adapter.write).not.toHaveBeenCalled(); expect(f.files.get(cardsPath)).toBe(raw);
    for (const card of Object.values(legacy.cards)) expect(f.service().getCard(card.id)).toEqual(card);
    expect(await f.product.refreshNote("A.md")).toBe("updated");
    const saved = JSON.parse(f.files.get(cardsPath)!) as RecallCardsSnapshot;
    expect(saved.version).toBe(3); expect(saved.inventoryCompletedAt).toBe(legacy.inventoryCompletedAt);
    for (const card of Object.values(legacy.cards)) expect(saved.cards[card.id]).toEqual(card);
    expect(f.adapter.write).toHaveBeenCalledTimes(1);
  });

  it.each([4, 99])("keeps future storage version %s unsupported and byte-identical", async (version) => {
    const raw = JSON.stringify({ ...legacyV2(true), version }), storage = memoryStorage(raw), store = new RecallStore(storage);
    expect(await store.load()).toEqual({ status: "unsupported", writable: false });
    await expect(store.reviewCard(candidate().id, "good", 200)).rejects.toThrow("write-blocked");
    await expect(store.admit([candidate()], 200)).rejects.toThrow("write-blocked");
    await expect(store.reconcile(request([candidate()], 200))).rejects.toThrow("write-blocked");
    expect(storage.write).not.toHaveBeenCalled(); expect(storage.bytes()).toBe(raw);
  });
});
