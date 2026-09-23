import { describe, expect, it, vi } from "vitest";
import { LOCAL_HEALTH_ANALYZERS } from "../analyzers/local/registry";
import { reconciliationIsCurrent } from "../domain/reconciliation";
import { findingIdFromFingerprint } from "../domain/identity";
import type { ScanRunV1 } from "../domain/scanRun";
import { HealthService } from "../services/healthService";
import type { HealthLocalVaultSource } from "../services/types";
import { serializeHealth } from "./codec";
import { FindingStore } from "./findingStore";
import { candidate, MemoryHealthStorage, scanRun } from "./testSupport";
import type { FindingsSnapshot, FindingsSnapshotV1, ScanRunsSnapshot, ScanRunsSnapshotV1 } from "./types";

const versions = Object.fromEntries(LOCAL_HEALTH_ANALYZERS.map((analyzer) => [analyzer.id, analyzer.version]));
const localReceipts = Object.fromEntries(Object.keys(versions).map((id) => [`local:${id}`, 200]));
function legacyRun(overrides: Partial<ScanRunV1> = {}): ScanRunV1 {
  const { reconciliationReceipts: _receipts, ...run } = scanRun({ analyzerVersions: versions });
  return { ...run, ...overrides };
}
async function load(findings: FindingsSnapshot | FindingsSnapshotV1, history: ScanRunsSnapshot | ScanRunsSnapshotV1) {
  const storage = new MemoryHealthStorage();
  storage.files.set("findings.json", serializeHealth(findings));
  storage.files.set("scan-runs.json", serializeHealth(history));
  const before = new Map(storage.files);
  const write = vi.spyOn(storage, "write");
  const source = { capture: vi.fn<HealthLocalVaultSource["capture"]>(), captureRevision: vi.fn<HealthLocalVaultSource["captureRevision"]>() };
  const store = new FindingStore(storage, () => 300);
  const service = new HealthService(store, source);
  expect(await service.initialize()).toEqual({ status: "ready", storage: { findings: "loaded", scanRuns: "loaded" }, findingsWritable: true, historyWritable: true });
  expect(write).not.toHaveBeenCalled();
  expect(storage.files).toEqual(before);
  expect(source.capture).not.toHaveBeenCalled();
  expect(source.captureRevision).not.toHaveBeenCalled();
  return { store, storage, service, write };
}
const v1Findings: FindingsSnapshotV1 = { version: 1, updatedAt: 200, findings: {} };
const v1History: ScanRunsSnapshotV1 = { version: 1, updatedAt: 200, runs: [legacyRun()] };

describe("read-only Health v1 migration", () => {
  it("synthesizes completed v1 trust only for the matching global commit", async () => {
    const f = await load(v1Findings, v1History);
    expect(f.store.getReconciliationReceipts()).toEqual(localReceipts);
    expect(f.store.listScanRuns()[0].reconciliationReceipts).toEqual(localReceipts);
    expect(f.service.getSnapshot()).toMatchObject({ lastLocalScanReconciled: true,
      dimensions: { structure: { state: "good", analysisComplete: true }, connections: { state: "good", analysisComplete: true } } });
  });

  it.each([199, 201])("does not guess the reason for legacy global mismatch %s", async (updatedAt) => {
    const f = await load({ ...v1Findings, updatedAt }, v1History);
    expect(f.store.getReconciliationReceipts()).toEqual({});
    expect(f.store.listScanRuns()[0].reconciliationReceipts).toEqual({});
    expect(f.service.getSnapshot()).toMatchObject({ lastLocalScanReconciled: false, dimensions: { connections: { state: "unknown" } } });
  });

  it.each(["partial", "failed", "running"] as const)("never synthesizes legacy %s receipts, even at a matching global timestamp", async (status) => {
    const f = await load(v1Findings, { ...v1History, runs: [legacyRun({ status, completedAt: status === "running" ? undefined : 200 })] });
    expect(f.store.listScanRuns()[0].reconciliationReceipts).toEqual({});
    expect(f.store.getReconciliationReceipts()).toEqual({});
    expect(f.service.getSnapshot().lastLocalScanReconciled).toBe(false);
  });

  it.each([["local", "local"], ["semantic", "semantic"], ["deep", "deep-ai"], ["recall", "recall"]] as const)("maps legacy scan type %s explicitly to %s", async (type, source) => {
    const f = await load(v1Findings, { ...v1History, runs: [legacyRun({ type, analyzerVersions: { a: "1" } })] });
    expect(f.store.getReconciliationReceipts()).toEqual({ [`${source}:a`]: 200 });
    expect(f.store.listScanRuns()[0].reconciliationReceipts).toEqual({ [`${source}:a`]: 200 });
  });

  it.each([{}, { orphans: "old" }] as Record<string, string>[])("does not let a migrated old/subset registry establish full absence: %j", async (analyzerVersions) => {
    const f = await load(v1Findings, { ...v1History, runs: [legacyRun({ analyzerVersions })] });
    expect(f.service.getSnapshot().dimensions.connections.state).toBe("unknown");
  });

  it.each(["findings", "history"] as const)("writes v2 only on the next real %s mutation and survives the intermediate mixed state", async (first) => {
    const f = await load(v1Findings, v1History);
    const reconcile = () => f.store.reconcile({ scope: { source: "semantic", analyzerIds: ["synthetic-semantic"] }, candidates: [], complete: true });
    const history = () => f.store.recordScanRun(scanRun({ id: "failed-later", status: "failed" }));
    await (first === "findings" ? reconcile() : history());
    expect(f.write).toHaveBeenCalledTimes(1);
    const firstFile = first === "findings" ? "findings.json" : "scan-runs.json";
    expect(JSON.parse(f.storage.files.get(firstFile)!) as { version: number }).toHaveProperty("version", 2);
    const reload = new FindingStore(f.storage); await reload.load();
    const previous = reload.listScanRuns().find((run) => run.id === "scan-1")!;
    expect(reconciliationIsCurrent(previous.reconciliationReceipts, reload.getReconciliationReceipts())).toBe(true);
    await (first === "findings" ? history() : reconcile());
    for (const raw of f.storage.files.values()) expect(JSON.parse(raw) as { version: number }).toHaveProperty("version", 2);
  });

  it.each(["dismiss", "snooze", "reopen"] as const)("preserves migrated trust when %s is the first v2 write and history remains v1", async (action) => {
    const item = candidate();
    const id = findingIdFromFingerprint(item.fingerprint);
    const f = await load({ ...v1Findings, findings: { [id]: { ...item, id, firstSeenAt: 100, lastSeenAt: 100, state: action === "reopen" ? "dismissed" : "open" } } }, v1History);
    if (action === "snooze") await f.store.snooze(id, 1000);
    else await f.store[action](id);
    expect(f.write).toHaveBeenCalledTimes(1);
    expect(f.storage.files.get("scan-runs.json")).toBe(serializeHealth(v1History));
    const reload = new FindingStore(f.storage); await reload.load();
    expect(reload.getFindingsUpdatedAt()).toBe(300);
    expect(reload.getReconciliationReceipts()).toEqual(localReceipts);
    expect(reconciliationIsCurrent(reload.listScanRuns()[0].reconciliationReceipts, reload.getReconciliationReceipts())).toBe(true);
  });

  it("uses all expected v2 owners to safely associate v1 history despite a newer unrelated global write", async () => {
    const f = await load({ version: 2, updatedAt: 300, findings: {}, reconciliationReceipts: { ...localReceipts, "semantic:x": 300 } }, v1History);
    expect(f.service.getSnapshot().lastLocalScanReconciled).toBe(true);
    expect(f.store.listScanRuns()[0].reconciliationReceipts).toEqual(localReceipts);
  });

  it.each(["missing", "newer", "empty", "partial"])("keeps unsafe v2 findings + v1 history conservative: %s", async (kind) => {
    const reconciliationReceipts = { ...localReceipts };
    if (kind === "missing") delete reconciliationReceipts["local:orphans"];
    if (kind === "newer") reconciliationReceipts["local:orphans"] = 300;
    const f = await load({ version: 2, updatedAt: 300, findings: {}, reconciliationReceipts: kind === "empty" ? {} : reconciliationReceipts },
      { ...v1History, runs: [legacyRun({ status: kind === "partial" ? "partial" : "completed" })] });
    expect(f.store.listScanRuns()[0].reconciliationReceipts).toEqual({});
    expect(f.service.getSnapshot().lastLocalScanReconciled).toBe(false);
  });

  it.each(["completed", "partial"] as const)("proves actual v2 %s receipts against the v1 global commit", async (status) => {
    const reconciliationReceipts = status === "partial" ? { "local:orphans": 200 } : localReceipts;
    const f = await load(v1Findings, { version: 2, updatedAt: 200, runs: [scanRun({ analyzerVersions: versions, reconciliationReceipts, status })] });
    expect(f.store.getReconciliationReceipts()).toEqual(reconciliationReceipts);
    expect(f.service.getSnapshot().lastLocalScanReconciled).toBe(true);
    expect(f.service.getSnapshot().dimensions.connections.analysisComplete).toBe(status === "completed");
  });

  it.each(["global-mismatch", "scope-mismatch", "completion-mismatch", "empty"])("cannot infer v2 history association from unsafe v1 findings: %s", async (kind) => {
    const reconciliationReceipts = kind === "empty" ? {} : { ...localReceipts, "local:orphans": kind === "scope-mismatch" ? 199 : 200 };
    const f = await load({ ...v1Findings, updatedAt: kind === "global-mismatch" ? 201 : 200 },
      { version: 2, updatedAt: 300, runs: [scanRun({ analyzerVersions: versions, reconciliationReceipts, completedAt: kind === "completion-mismatch" ? 201 : 200 })] });
    expect(f.store.getReconciliationReceipts()).toEqual({});
    expect(f.service.getSnapshot().lastLocalScanReconciled).toBe(false);
  });
});
