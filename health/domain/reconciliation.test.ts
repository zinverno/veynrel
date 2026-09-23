import { describe, expect, it } from "vitest";
import { isReconciliationOwnerKey, isReconciliationReceipts, parseReconciliationOwnerKey, reconciliationIsCurrent, reconciliationOwnerKey, scanSource } from "./reconciliation";

describe("reconciliation ownership", () => {
  it.each(["local", "semantic", "deep-ai", "recall"] as const)("round trips technical ownership for %s", (source) => {
    const analyzerId = "analyzer-1.v2_test";
    const key = reconciliationOwnerKey(source, analyzerId);
    expect(key).toBe(`${source}:${analyzerId}`);
    expect(parseReconciliationOwnerKey(key)).toEqual({ source, analyzerId });
    expect(isReconciliationOwnerKey(key)).toBe(true);
  });

  it.each([null, 1, "local", "local:", ":a", "unknown:a", "deep:a", "local:a:b", "local:a:", "Local:a", "local:A", "local:a b", "local:../a", "local:a\n", `local:${"a".repeat(129)}`])("rejects malformed owner %j", (key) => {
    expect(isReconciliationOwnerKey(key)).toBe(false);
    expect(parseReconciliationOwnerKey(key)).toBeUndefined();
  });

  it("validates identifiers when constructing keys and preserves their full existing bound", () => {
    expect(() => reconciliationOwnerKey("local", "a:b")).toThrow("owner");
    expect(() => reconciliationOwnerKey("local", "")).toThrow("owner");
    expect(isReconciliationOwnerKey(reconciliationOwnerKey("deep-ai", "a".repeat(128)))).toBe(true);
    expect(["local", "semantic", "deep", "recall"].map((type) => scanSource(type as Parameters<typeof scanSource>[0])))
      .toEqual(["local", "semantic", "deep-ai", "recall"]);
  });

  it.each([null, [], new Map(), new Date(), Object.create({ "local:a": 100 }) as unknown, { "local:a": -1 },
    { "local:a": NaN }, { "local:a": Infinity }, { "local:a": 1.5 }, { "local:a": "100" },
    { "local:a": 8_640_000_000_000_001 }, { "local:a:b": 100 }, { "__proto__": null, invalid: 100 }])("rejects untrusted receipt map %j", (value) => {
    expect(isReconciliationReceipts(value)).toBe(false);
  });

  it("accepts empty and plain receipt maps, including zero and null prototypes", () => {
    expect(isReconciliationReceipts({})).toBe(true);
    expect(isReconciliationReceipts({ "local:a": 0, "semantic:b": 8_640_000_000_000_000 })).toBe(true);
    expect(isReconciliationReceipts(Object.assign(Object.create(null) as object, { "local:a": 100 }))).toBe(true);
  });

  it("requires nonempty exact scope matches, ignoring additional current owners", () => {
    const recorded = { "local:a": 100, "local:b": 100 };
    expect(reconciliationIsCurrent({}, recorded)).toBe(false);
    expect(reconciliationIsCurrent(recorded, { ...recorded, "semantic:x": 200 })).toBe(true);
    expect(reconciliationIsCurrent(recorded, { "local:a": 150, "local:b": 100 })).toBe(false);
    expect(reconciliationIsCurrent(recorded, { "local:a": 100 })).toBe(false);
    expect(reconciliationIsCurrent(recorded, { "semantic:a": 100, "local:b": 100 })).toBe(false);
    expect(reconciliationIsCurrent(recorded, {})).toBe(false);
  });
});
