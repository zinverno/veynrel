import { describe, expect, it, vi } from "vitest";
import { FindingStore } from "./findingStore";
import { candidate, MemoryHealthStorage, scanRun } from "./testSupport";
import { MAX_SCAN_HISTORY } from "./types";
import type { FindingsSnapshot } from "./types";
import { isFindingsSnapshot, isScanRunsSnapshot } from "./codec";
import { isFindingCandidate } from "../domain/findingValidation";
import { isScanRun } from "../domain/scanRunValidation";
import type { FindingCandidate } from "../domain/finding";

const scope = { source: "local", analyzerIds: ["broken-links"] } as const;

async function populated() {
  const storage = new MemoryHealthStorage();
  const store = new FindingStore(storage, () => 200);
  await store.load();
  await store.reconcile({ scope, candidates: [candidate()], complete: true, seenAt: 100 });
  await store.recordScanRun(scanRun());
  return { storage, store };
}

function snapshot(raw: string): FindingsSnapshot {
  const value: unknown = JSON.parse(raw);
  if (!isFindingsSnapshot(value)) throw new Error("Invalid test snapshot");
  return value;
}

describe("Health persistence", () => {
  it("round trips validated findings and scans without load-time writes", async () => {
    const f = await populated();
    const write = vi.spyOn(f.storage, "write");
    const store = new FindingStore(f.storage);
    expect(await store.load()).toEqual({ findings: "loaded", scanRuns: "loaded" });
    expect(store.list()).toEqual(f.store.list());
    expect(store.listScanRuns()).toEqual(f.store.listScanRuns());
    expect(write).not.toHaveBeenCalled();
    expect(snapshot(f.storage.files.get("findings.json")!).updatedAt).toBe(200);
  });

  it("treats missing storage as writable empty state", async () => {
    const storage = new MemoryHealthStorage();
    const store = new FindingStore(storage, () => 100);
    expect(await store.load()).toEqual({ findings: "missing", scanRuns: "missing" });
    expect(store.list()).toEqual([]);
    expect(store.listScanRuns()).toEqual([]);
    expect(storage.files.size).toBe(0);
    await store.reconcile({ scope, candidates: [candidate()], complete: true });
    expect(storage.files.has("findings.json")).toBe(true);
  });

  it.each([
    ["{", "invalid"], ["null", "invalid"], ["[]", "invalid"], ['{"version":2,"findings":{}}', "unsupported"],
    ['{"version":1,"updatedAt":100,"findings":[]}', "invalid"],
    ['{"version":1,"updatedAt":100,"findings":{"bad":{}}}', "invalid"],
    ['{"version":1,"updatedAt":-1,"findings":{}}', "invalid"],
  ])("loads %s safely without overwriting the original (%s)", async (raw, status) => {
    const storage = new MemoryHealthStorage();
    storage.files.set("findings.json", raw);
    const store = new FindingStore(storage, () => 100);
    expect(await store.load()).toEqual({ findings: status, scanRuns: "missing" });
    expect(store.list()).toEqual([]);
    await expect(store.reconcile({ scope, candidates: [], complete: true })).rejects.toThrow("write-blocked");
    expect(storage.files.get("findings.json")).toBe(raw);
    await store.recordScanRun(scanRun());
    expect(store.listScanRuns()).toHaveLength(1);
  });

  it("does not salvage or silently repair invalid entries or mismatched map IDs", async () => {
    const f = await populated();
    const valid = snapshot(f.storage.files.get("findings.json")!);
    const finding = Object.values(valid.findings)[0];
    for (const findings of [{ ...valid.findings, broken: { state: "open" } }, { wrong: finding }]) {
      const raw = JSON.stringify({ ...valid, findings });
      f.storage.files.set("findings.json", raw);
      const store = new FindingStore(f.storage);
      expect((await store.load()).findings).toBe("invalid");
      expect(store.list()).toEqual([]);
      expect(f.storage.files.get("findings.json")).toBe(raw);
    }
  });

  it("reports unreadable storage separately and blocks writes", async () => {
    const storage = new MemoryHealthStorage();
    vi.spyOn(storage, "read").mockRejectedValue(new Error("Permission denied"));
    const store = new FindingStore(storage);
    expect(await store.load()).toEqual({ findings: "unavailable", scanRuns: "unavailable" });
    expect(store.list()).toEqual([]);
    await expect(store.recordScanRun(scanRun())).rejects.toThrow("write-blocked");
  });

  it("rejects corrupt/unsupported scan storage independently", async () => {
    for (const [raw, status] of [["{", "invalid"], ['{"version":9}', "unsupported"], ['{"version":1,"updatedAt":0,"runs":[{}]}', "invalid"]]) {
      const storage = new MemoryHealthStorage();
      storage.files.set("scan-runs.json", raw);
      const store = new FindingStore(storage, () => 100);
      expect((await store.load()).scanRuns).toBe(status);
      await expect(store.recordScanRun(scanRun())).rejects.toThrow("write-blocked");
      await store.reconcile({ scope, candidates: [candidate()], complete: true });
      expect(storage.files.get("scan-runs.json")).toBe(raw);
    }
  });

  it("retains the newest 50 runs by startedAt DESC, id ASC, including after reload", async () => {
    const storage = new MemoryHealthStorage();
    const store = new FindingStore(storage, () => 1000);
    await store.load();
    for (let i = MAX_SCAN_HISTORY + 5; i >= 0; i--) {
      await store.recordScanRun(scanRun({ id: `scan-${i.toString().padStart(3, "0")}`, startedAt: i, completedAt: 200 }));
    }
    await store.recordScanRun(scanRun({ id: "scan-a", startedAt: 55 }));
    await store.recordScanRun(scanRun({ id: "scan-b", startedAt: 55 }));
    const runs = store.listScanRuns();
    expect(runs).toHaveLength(MAX_SCAN_HISTORY);
    expect(runs.slice(0, 3).map((run) => run.id)).toEqual(["scan-055", "scan-a", "scan-b"]);
    expect(runs.some((run) => run.id === "scan-000")).toBe(false);
    const reload = new FindingStore(storage);
    await reload.load();
    expect(reload.listScanRuns()).toEqual(runs);
  });

  it("upserts scan progress without duplicate history and protects scan identity", async () => {
    const storage = new MemoryHealthStorage();
    const store = new FindingStore(storage, () => 200);
    await store.load();
    await store.recordScanRun(scanRun({ status: "running", completedAt: undefined }));
    await store.recordScanRun(scanRun({ notesSeen: 3 }));
    expect(store.listScanRuns()).toHaveLength(1);
    expect(store.listScanRuns()[0]).toMatchObject({ status: "completed", notesSeen: 3 });
    await expect(store.recordScanRun(scanRun({ notesSeen: 3, startedAt: 101 }))).rejects.toThrow("identity");
    await expect(store.recordScanRun(scanRun({ notesSeen: 3, type: "deep" }))).rejects.toThrow("identity");
    await expect(store.recordScanRun(scanRun({ notesSeen: 1 }))).rejects.toThrow("backward");
    await expect(store.recordScanRun(scanRun({ status: "running", completedAt: undefined }))).rejects.toThrow("backward");
  });

  it("serializes deterministically across input/object-key/path order", async () => {
    const left = await populated();
    const right = await populated();
    const a = candidate({ notePaths: ["B.md", "A.md"], evidence: [{ kind: "fact", value: true, label: "Fact" }] });
    const b = candidate({ notePaths: ["C.md"] });
    await left.store.reconcile({ scope, candidates: [a, b], complete: true });
    await right.store.reconcile({ scope, candidates: [b, { ...a, notePaths: ["A.md", "B.md", "A.md"], evidence: [{ label: "Fact", value: true, kind: "fact" }] }], complete: true });
    expect(left.storage.files.get("findings.json")).toBe(right.storage.files.get("findings.json"));
    await left.store.recordScanRun(scanRun({ analyzerVersions: { z: "2", a: "1" } }));
    await right.store.recordScanRun(scanRun({ analyzerVersions: { a: "1", z: "2" } }));
    expect(left.storage.files.get("scan-runs.json")).toBe(right.storage.files.get("scan-runs.json"));
  });

  it("serializes concurrent scan records and keeps committed history when saving fails", async () => {
    const f = await populated();
    await Promise.all([
      f.store.recordScanRun(scanRun({ id: "scan-2" })),
      f.store.recordScanRun(scanRun({ id: "scan-3" })),
    ]);
    vi.spyOn(f.storage, "write").mockRejectedValueOnce(new Error("Disk full"));
    await expect(f.store.recordScanRun(scanRun({ id: "failed-write" }))).rejects.toThrow("Disk full");
    expect(f.store.listScanRuns().map((run) => run.id)).toEqual(["scan-1", "scan-2", "scan-3"]);
    const reload = new FindingStore(f.storage);
    await reload.load();
    expect(reload.listScanRuns()).toEqual(f.store.listScanRuns());
  });
});

describe("untrusted domain validation", () => {
  it.each([
    { fingerprint: "" }, { analyzerId: "" }, { type: "invalid type" }, { source: "provider" }, { dimension: "wrong" },
    { confidence: "low" }, { impact: 5 }, { title: "" }, { explanation: "x".repeat(2001) },
    { notePaths: ["../escape.md"] }, { notePaths: "A.md" }, { notePaths: [null] },
    { evidence: null }, { evidence: [{ kind: "fact", value: Infinity }] },
    { evidence: [{ kind: "fact", value: {} }] }, { evidence: [{ kind: "fact", snippet: "x".repeat(501) }] },
    { evidence: [{ kind: "fact", path: "/absolute" }] }, { evidence: [{ kind: "fact", body: "Full body" }] },
    { actions: [{ kind: "open-note", path: "C:/file.md" }] }, { actions: [{ kind: "open-note", execute: () => undefined }] },
    { state: "open" }, { id: "injected" }, { firstSeenAt: 0 }, { body: "Full note body" },
  ])("rejects malformed or lifecycle-bearing candidate %j", async (override) => {
    const bad = { ...candidate(), ...override };
    expect(isFindingCandidate(bad)).toBe(false);
    const storage = new MemoryHealthStorage();
    const store = new FindingStore(storage);
    await store.load();
    await expect(store.reconcile({ scope, candidates: [bad as FindingCandidate], complete: true })).rejects.toThrow();
    expect(storage.files.size).toBe(0);
  });

  it("validates persisted identity, timestamp ordering, enums and snooze state", async () => {
    const f = await populated();
    const valid = snapshot(f.storage.files.get("findings.json")!);
    const item = Object.values(valid.findings)[0];
    for (const override of [{ id: "bad" }, { fingerprint: "changed" }, { firstSeenAt: 101 }, { lastSeenAt: NaN }, { state: "bad" },
      { snoozedUntil: 500 }, { state: "snoozed" }, { state: "snoozed", snoozedUntil: Infinity }]) {
      expect(isFindingsSnapshot({ ...valid, findings: { [item.id]: { ...item, ...override } } })).toBe(false);
    }
  });

  it.each([
    { id: "" }, { type: "deep-ai" }, { status: "bad" }, { startedAt: Infinity }, { startedAt: -1 },
    { completedAt: 99 }, { completedAt: undefined }, { status: "running" }, { notesSeen: -1 }, { notesSeen: 0.1 },
    { findingsCreated: NaN }, { findingsUpdated: Infinity }, { findingsResolved: -1 },
    { analyzerVersions: [] }, { analyzerVersions: { "": "1" } }, { analyzerVersions: { valid: 1 } }, { analyzerVersions: { valid: "" } },
  ])("rejects invalid scan shape %j", (override) => {
    expect(isScanRun({ ...scanRun(), ...override })).toBe(false);
  });

  it("validates all scan statuses, bounded history and duplicate IDs", () => {
    for (const status of ["completed", "partial", "failed"] as const) expect(isScanRun(scanRun({ status }))).toBe(true);
    expect(isScanRun(scanRun({ status: "running", completedAt: undefined }))).toBe(true);
    expect(isScanRunsSnapshot({ version: 1, updatedAt: 200, runs: [scanRun(), scanRun()] })).toBe(false);
    expect(isScanRunsSnapshot({ version: 1, updatedAt: 200, runs: Array.from({ length: 51 }, (_, i) => scanRun({ id: `run-${i}` })) })).toBe(false);
  });
});
