import { describe, expect, it } from "vitest";
import { decodeRecall, serializeRecall } from "./codec";
import type { RecallCardsSnapshot } from "./types";
import { RecallStore } from "./recallStore";
import { candidate, memoryStorage, request } from "../testSupport";
import { createInitialSchedule } from "../scheduler/fsrs6";

function snapshot(): RecallCardsSnapshot {
  const card = candidate();
  return { version: 2, updatedAt: 100, cards: { [card.id]: { ...card, firstSeenAt: 50, lastSeenAt: 100, state: "active", schedule: createInitialSchedule(50) } } };
}

describe("Recall v2 codec and poisoning", () => {
  it("validates the additive full-inventory marker without inventing evidence in legacy metadata", async () => {
    const legacy = snapshot(), storage = memoryStorage(serializeRecall(legacy)), store = new RecallStore(storage);
    await store.load(); expect(store.hasFullInventory()).toBe(false); expect(storage.write).not.toHaveBeenCalled();
    const marked = { ...legacy, inventoryCompletedAt: 100 };
    expect(decodeRecall(serializeRecall(marked))).toEqual({ status: "loaded", data: marked });
    for (const inventoryCompletedAt of [-1, 101, 0.5, "100", null]) {
      expect(decodeRecall(JSON.stringify({ ...legacy, inventoryCompletedAt })).status).toBe("invalid");
    }
  });

  it("round trips with canonical object-key order and final newline", () => {
    const one = snapshot(); const card = candidate("Other"); one.cards[card.id] = { ...card, firstSeenAt: 100, lastSeenAt: 100, state: "retired", schedule: createInitialSchedule(100) };
    const two = { cards: Object.fromEntries(Object.entries(one.cards).reverse().map(([key, value]) =>
      [key, Object.fromEntries(Object.entries(value).reverse())])), updatedAt: 100, version: 2 } as unknown as RecallCardsSnapshot;
    expect(serializeRecall(one)).toBe(serializeRecall(two));
    expect(serializeRecall(one).endsWith("\n")).toBe(true);
    expect(decodeRecall(serializeRecall(one))).toEqual({ status: "loaded", data: one });
  });

  it.each(["{", "[]", "null", "{}", '{"version":"1"}', '{"version":0}', '{"version":1.5}'])("classifies malformed bytes %j as invalid", (raw) => {
    expect(decodeRecall(raw)).toEqual({ status: "invalid" });
  });

  it.each([3, 99])("refuses unknown future version %s without coercion", (version) => {
    expect(decodeRecall(JSON.stringify({ ...snapshot(), version }))).toEqual({ status: "unsupported" });
  });

  it.each([{ id: "recall-0000000000000000" }, { fingerprint: "v2:unknown" }, { path: "../A.md" }, { question: "" },
    { answer: "A".repeat(8001) }, { question: " Q " }, { answer: "line\nline" }, { question: "changed" }, { state: "learning" },
    { firstSeenAt: -1 }, { lastSeenAt: 49 }, { lastSeenAt: 101 }, { firstSeenAt: 1.5 }, { difficulty: 1 }, { extra: true }])("rejects malformed card %j", (change) => {
    const data = snapshot(); data.cards[candidate().id] = { ...data.cards[candidate().id], ...change } as unknown as RecallCardsSnapshot["cards"][string];
    expect(decodeRecall(JSON.stringify(data)).status).toBe("invalid");
  });

  it("rejects mismatched/unsafe object keys and extra snapshot fields", () => {
    const data = snapshot();
    expect(decodeRecall(JSON.stringify({ ...data, extra: true })).status).toBe("invalid");
    expect(decodeRecall(JSON.stringify({ ...data, updatedAt: -1 })).status).toBe("invalid");
    expect(decodeRecall(JSON.stringify({ ...data, cards: { wrong: Object.values(data.cards)[0] } })).status).toBe("invalid");
    expect(decodeRecall('{"version":1,"updatedAt":100,"cards":{"__proto__":{}}}').status).toBe("invalid");
  });

  it.each([["{", "invalid"], ['{"version":99}', "unsupported"]])("preserves poisoned storage %j byte-for-byte and write-blocks the store", async (raw, status) => {
    const storage = memoryStorage(raw); const store = new RecallStore(storage);
    expect(await store.load()).toEqual({ status, writable: false });
    await expect(store.reconcile(request([candidate()]))).rejects.toThrow("write-blocked");
    expect(storage.bytes()).toBe(raw); expect(storage.write).not.toHaveBeenCalled();
  });

  it("marks read errors unavailable without resetting storage", async () => {
    const storage = memoryStorage("PRIVATE"); storage.read.mockRejectedValueOnce(new Error("PRIVATE"));
    const store = new RecallStore(storage); expect(await store.load()).toEqual({ status: "unavailable", writable: false });
    await expect(store.reconcile(request([]))).rejects.toThrow("write-blocked"); expect(storage.bytes()).toBe("PRIVATE");
  });
});
