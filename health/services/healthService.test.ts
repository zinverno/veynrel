import { describe, expect, it, vi } from "vitest";
import { HealthService, HealthNotInitializedError, HealthStorageUnavailableError, LocalHealthScanAlreadyRunningError } from "./healthService";
import { FindingStore } from "../store/findingStore";
import { candidate, MemoryHealthStorage } from "../store/testSupport";
import { findingIdFromFingerprint } from "../domain/identity";
import { isScanRun } from "../domain/scanRunValidation";
import { note, snapshot } from "../analyzers/local/testFixtures";
import { createLocalVaultRevision } from "../analyzers/local/localVaultRevision";
import { LOCAL_HEALTH_ANALYZERS } from "../analyzers/local/registry";
import type { AnalyzerResult, HealthAnalyzer } from "../analyzers/types";
import type { LocalAnalysisContext } from "../analyzers/local/types";
import type { HealthServiceOptions } from "./healthService";

const signal = () => new AbortController().signal;
function fixture(options: HealthServiceOptions = {}) {
  let time = 100;
  let sequence = 0;
  const storage = new MemoryHealthStorage();
  const store = new FindingStore(storage, () => time);
  const captured = snapshot([note("A.md")]);
  const source = { capture: vi.fn(async () => captured), captureRevision: vi.fn(async () => createLocalVaultRevision(captured.notes)) };
  const service = new HealthService(store, source, { clock: () => time, scanIdFactory: () => `scan-${++sequence}`, ...options });
  return { storage, store, source, service, captured, time: (value: number) => { time = value; },
    write: vi.spyOn(storage, "write") };
}
function analyzer(id: string, overrides: Partial<AnalyzerResult> = {}): HealthAnalyzer<LocalAnalysisContext> {
  return { id, version: "1", analyze: vi.fn(async () => ({ analyzerId: id, analyzerVersion: "1", successful: true, complete: true, candidates: [], diagnostics: [], ...overrides })) };
}
async function seed(store: FindingStore, id: string) {
  const item = candidate({ analyzerId: id });
  await store.reconcile({ scope: { source: "local", analyzerIds: [id] }, candidates: [item], complete: true, seenAt: 50 });
  return findingIdFromFingerprint(item.fingerprint);
}

describe("HealthService initialization and ownership", () => {
  it("loads once, reports missing storage as writable, and never scans or writes during initialization", async () => {
    const f = fixture(); const load = vi.spyOn(f.store, "load");
    expect(() => f.service.getSnapshot()).toThrow(HealthNotInitializedError);
    await expect(f.service.runLocalScan(signal())).rejects.toThrow(HealthNotInitializedError);
    const [first, second] = await Promise.all([f.service.initialize(), f.service.initialize()]);
    expect(first).toEqual({ status: "ready", storage: { findings: "missing", scanRuns: "missing" }, findingsWritable: true, historyWritable: true });
    first.storage.findings = "invalid";
    expect(second.storage.findings).toBe("missing");
    expect(load).toHaveBeenCalledTimes(1);
    expect(f.source.capture).not.toHaveBeenCalled(); expect(f.write).not.toHaveBeenCalled();
    expect(f.service.getSnapshot().dimensions.structure.state).toBe("unknown");
  });
  it.each(["invalid", "unsupported", "unavailable"])("rejects scans before analysis for %s findings storage", async (status) => {
    const f = fixture();
    if (status === "unavailable") vi.spyOn(f.storage, "read").mockRejectedValue(new Error("private"));
    else f.storage.files.set("findings.json", status === "invalid" ? "{" : '{"version":99}');
    const initialized = await f.service.initialize();
    expect(initialized.storage.findings).toBe(status);
    expect(initialized.status).toBe("unavailable");
    await expect(f.service.runLocalScan(signal())).rejects.toThrow(HealthStorageUnavailableError);
    expect(f.source.capture).not.toHaveBeenCalled(); expect(f.write).not.toHaveBeenCalled();
    expect(f.service.isLocalScanRunning()).toBe(false);
  });
  it.each(["invalid", "unavailable"])("allows findings commits with %s history while preserving damaged storage", async (status) => {
    const f = fixture();
    if (status === "invalid") f.storage.files.set("scan-runs.json", "{");
    else vi.spyOn(f.storage, "read").mockImplementation(async (file) => { if (file === "scan-runs.json") throw new Error("private"); return null; });
    expect((await f.service.initialize()).status).toBe("degraded");
    const outcome = await f.service.runLocalScan(signal());
    expect(outcome).toMatchObject({ findingsCommitted: true, historyRecorded: false, diagnostics: ["history-not-recorded"] });
    expect(f.write.mock.calls.map(([file]) => file)).toEqual(["findings.json"]);
    expect(f.storage.files.get("scan-runs.json")).toBe(status === "invalid" ? "{" : undefined);
  });
});

describe("local scan orchestration", () => {
  it("captures once, reconciles each successful analyzer in one write at one observation time, and records actual counters", async () => {
    const f = fixture(); await f.service.initialize();
    const batch = vi.spyOn(f.store, "reconcileBatch");
    const outcome = await f.service.runLocalScan(signal());
    expect(outcome).toMatchObject({ freshness: "verified", findingsCommitted: true, historyRecorded: true, scan: { status: "completed", startedAt: 100, findingsCreated: 1, findingsUpdated: 0, findingsResolved: 0 } });
    expect(isScanRun(outcome.scan)).toBe(true);
    expect(f.source.capture).toHaveBeenCalledTimes(1); expect(f.source.captureRevision).toHaveBeenCalledTimes(1);
    expect(batch).toHaveBeenCalledTimes(1);
    const requests = batch.mock.calls[0][0];
    expect(requests).toHaveLength(8);
    expect(requests.map((request) => request.scope.analyzerIds[0])).toEqual(LOCAL_HEALTH_ANALYZERS.map((item) => item.id));
    expect(requests.every((request) => request.scope.source === "local" && request.scope.analyzerIds.length === 1 && request.seenAt === 100 && request.complete)).toBe(true);
    expect(f.write.mock.calls.map(([file]) => file)).toEqual(["findings.json", "scan-runs.json"]);
    expect(f.service.listFindings()[0].firstSeenAt).toBe(100);
    expect(f.service.getSnapshot().newFindings).toBe(1);
    expect(f.service.isLocalScanRunning()).toBe(false);
    f.time(200);
    const second = await f.service.runLocalScan(signal());
    expect(second.scan).toMatchObject({ findingsCreated: 0, findingsUpdated: 1, findingsResolved: 0 });
    expect(f.service.getSnapshot().newFindings).toBe(0);
  });
  it("publishes partial positives, resolves only complete scopes, and leaves failed analyzers untouched", async () => {
    const fresh = candidate({ analyzerId: "partial", notePaths: ["New.md"] });
    const failed = analyzer("failed"); vi.spyOn(failed, "analyze").mockRejectedValue(new Error("private note text"));
    const f = fixture({ analyzers: [analyzer("complete"), analyzer("partial", { complete: false, candidates: [fresh] }), failed] });
    await f.service.initialize();
    const completeId = await seed(f.store, "complete"); const partialId = await seed(f.store, "partial"); const failedId = await seed(f.store, "failed");
    const batch = vi.spyOn(f.store, "reconcileBatch"); f.write.mockClear(); f.time(200);
    const outcome = await f.service.runLocalScan(signal());
    expect(outcome.scan).toMatchObject({ status: "partial", findingsCreated: 1, findingsResolved: 1, findingsUpdated: 0 });
    expect(f.store.get(completeId)?.state).toBe("resolved");
    expect(f.store.get(partialId)).toMatchObject({ state: "open", lastSeenAt: 50 });
    expect(f.store.get(failedId)).toMatchObject({ state: "open", lastSeenAt: 50 });
    expect(batch.mock.calls[0][0].map((request) => request.scope.analyzerIds[0])).toEqual(["complete", "partial"]);
    expect(f.write.mock.calls.filter(([file]) => file === "findings.json")).toHaveLength(1);
    expect(JSON.stringify(outcome)).not.toContain("private note text");
  });
  it("rejects stale results without publishing positives or resolving previous findings", async () => {
    const f = fixture({ analyzers: [analyzer("broken-links")] }); await f.service.initialize();
    const id = await seed(f.store, "broken-links"); f.write.mockClear();
    f.source.captureRevision.mockResolvedValue(createLocalVaultRevision([note("Changed.md")]));
    const before = f.storage.files.get("findings.json");
    const outcome = await f.service.runLocalScan(signal());
    expect(outcome).toMatchObject({ freshness: "stale", findingsCommitted: false, historyRecorded: true, diagnostics: ["vault-changed-during-scan"], scan: { status: "partial", findingsCreated: 0, findingsUpdated: 0, findingsResolved: 0 } });
    expect(f.store.get(id)?.state).toBe("open"); expect(f.storage.files.get("findings.json")).toBe(before);
    expect(f.service.getSnapshot().newFindings).toBe(0);
    expect(f.service.getSnapshot().dimensions.connections.state).toBe("unknown");
    expect(f.write.mock.calls.map(([file]) => file)).toEqual(["scan-runs.json"]);
  });
  it("does not publish stale positive candidates", async () => {
    const f = fixture(); await f.service.initialize();
    f.source.captureRevision.mockResolvedValue(createLocalVaultRevision([]));
    expect((await f.service.runLocalScan(signal())).freshness).toBe("stale");
    expect(f.service.listFindings()).toEqual([]);
  });
  it.each(["probe-throws", "probe-incomplete", "snapshot-incomplete"])("cannot reconcile unknown freshness: %s", async (kind) => {
    const f = fixture(); await f.service.initialize();
    if (kind === "probe-throws") f.source.captureRevision.mockRejectedValue(new Error("secret"));
    if (kind === "probe-incomplete") f.source.captureRevision.mockResolvedValue(createLocalVaultRevision(f.captured.notes, false));
    if (kind === "snapshot-incomplete") f.source.capture.mockResolvedValue(snapshot(f.captured.notes, { noteListComplete: false }));
    const outcome = await f.service.runLocalScan(signal());
    expect(outcome).toMatchObject({ freshness: "unknown", findingsCommitted: false, scan: { status: "failed", findingsCreated: 0 }, diagnostics: ["freshness-unavailable"] });
    expect(f.service.listFindings()).toEqual([]); expect(f.service.isLocalScanRunning()).toBe(false);
  });
  it("records snapshot capture failure safely", async () => {
    const f = fixture(); await f.service.initialize(); f.source.capture.mockRejectedValue(new Error("secret"));
    const outcome = await f.service.runLocalScan(signal());
    expect(outcome).toMatchObject({ findingsCommitted: false, historyRecorded: true, diagnostics: ["analysis-failed"], scan: { status: "failed" } });
    expect(f.service.isLocalScanRunning()).toBe(false);
  });
  it("records all-analyzer failure without reconciliation", async () => {
    const f = fixture({ analyzers: [analyzer("a", { successful: false, complete: false }), analyzer("b", { successful: false, complete: false })] });
    await f.service.initialize();
    expect(await f.service.runLocalScan(signal())).toMatchObject({ findingsCommitted: false, diagnostics: ["analyzers-failed"], scan: { status: "failed" } });
    expect(f.write.mock.calls.map(([file]) => file)).toEqual(["scan-runs.json"]);
  });
  it("leaves committed state unchanged and records zero counters if the findings write fails", async () => {
    const f = fixture(); await f.service.initialize(); const id = await seed(f.store, "orphans");
    const before = f.store.list(); f.write.mockRejectedValueOnce(new Error("secret disk error"));
    const outcome = await f.service.runLocalScan(signal());
    expect(outcome).toMatchObject({ findingsCommitted: false, historyRecorded: true, diagnostics: ["reconciliation-failed"], scan: { status: "failed", findingsCreated: 0, findingsUpdated: 0, findingsResolved: 0 } });
    expect(f.store.list()).toEqual(before); expect(f.store.get(id)?.state).toBe("open");
    expect(f.service.isLocalScanRunning()).toBe(false);
  });
  it("keeps findings when history fails and exposes conservative restart state instead of trusting older history", async () => {
    const f = fixture(); await f.service.initialize();
    await f.service.runLocalScan(signal());
    expect(f.service.getSnapshot().dimensions.connections.state).toBe("good");
    const write = f.write.getMockImplementation();
    f.write.mockImplementation(async (file, contents) => {
      if (file === "scan-runs.json") throw new Error("history unavailable");
      if (write) await write(file, contents); else f.storage.files.set(file, contents);
    });
    const outcome = await f.service.runLocalScan(signal());
    expect(outcome).toMatchObject({ findingsCommitted: true, historyRecorded: false, scan: { status: "completed", findingsUpdated: 1 }, diagnostics: ["history-not-recorded"] });
    expect(f.service.listFindings()[0].lastSeenAt).toBe(outcome.scan.startedAt);
    const restart = new HealthService(new FindingStore(f.storage), f.source); await restart.initialize();
    expect(restart.getSnapshot().dimensions.connections.state).toBe("unknown");
    expect(restart.getSnapshot().newFindings).toBe(0);
  });
  it("rejects overlapping scans immediately and becomes idle after the first finishes", async () => {
    const f = fixture(); await f.service.initialize();
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    f.source.capture.mockImplementation(async () => { await gate; return f.captured; });
    const pending = f.service.runLocalScan(signal());
    expect(f.service.isLocalScanRunning()).toBe(true);
    await expect(f.service.runLocalScan(signal())).rejects.toThrow(LocalHealthScanAlreadyRunningError);
    release(); await pending;
    expect(f.service.isLocalScanRunning()).toBe(false); expect(f.source.capture).toHaveBeenCalledTimes(1);
  });
  it("verifies freshness after queued writes rather than before waiting for them", async () => {
    const f = fixture(); await f.service.initialize(); const id = await seed(f.store, "broken-links");
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    f.write.mockImplementationOnce(async (file, text) => { await gate; f.storage.files.set(file, text); });
    const mutation = f.service.dismissFinding(id);
    const batch = vi.spyOn(f.store, "reconcileBatch");
    const pending = f.service.runLocalScan(signal());
    await vi.waitFor(() => expect(batch).toHaveBeenCalledTimes(1));
    expect(f.source.captureRevision).not.toHaveBeenCalled();
    f.source.captureRevision.mockResolvedValue(createLocalVaultRevision([]));
    release(); await mutation;
    expect(await pending).toMatchObject({ freshness: "stale", findingsCommitted: false });
    expect(f.service.listFindings()).toHaveLength(1);
    expect(f.service.getFinding(id)?.state).toBe("dismissed");
  });
  it("uses strictly increasing observations even with repeated/backward clocks", async () => {
    const f = fixture(); await f.service.initialize();
    const first = await f.service.runLocalScan(signal());
    f.time(50);
    const second = await f.service.runLocalScan(signal());
    expect(second.scan.startedAt).toBeGreaterThan(first.scan.startedAt);
    expect(f.service.getSnapshot().newFindings).toBe(0);
    expect(f.service.listFindings()[0].firstSeenAt).toBe(first.scan.startedAt);
  });
  it("forwards the profile to recommendation selection without altering findings", async () => {
    const structure = candidate({ analyzerId: "a", dimension: "structure", impact: "review" });
    const connections = candidate({ analyzerId: "a", dimension: "connections", impact: "review" });
    const f = fixture({ analyzers: [analyzer("a", { candidates: [structure, connections] })] });
    await f.service.initialize(); await f.service.runLocalScan(signal());
    expect(f.service.getSnapshot("work").recommendation?.findingId).toBe(findingIdFromFingerprint(structure.fingerprint));
    expect(f.service.getSnapshot("research").recommendation?.findingId).toBe(findingIdFromFingerprint(connections.fingerprint));
    expect(f.service.listFindings()).toHaveLength(2);
  });
});

describe("cancellation, subscribers and restart", () => {
  it.each(["before-capture", "during-analysis", "before-freshness", "waiting-freshness"])("cancels %s without findings/history writes", async (stage) => {
    const controller = new AbortController();
    const item = analyzer("a");
    const analyzeMock = vi.spyOn(item, "analyze");
    if (stage === "during-analysis") analyzeMock.mockImplementation(() => new Promise(() => {}));
    if (stage === "before-freshness") analyzeMock.mockImplementation(async () => {
      controller.abort(); return { analyzerId: "a", analyzerVersion: "1", successful: true, complete: true, candidates: [], diagnostics: [] };
    });
    const f = fixture({ analyzers: [item] }); await f.service.initialize();
    const listener = vi.fn(); f.service.subscribe(listener);
    if (stage === "waiting-freshness") f.source.captureRevision.mockImplementation(() => new Promise(() => {}));
    if (stage === "before-capture") controller.abort();
    const pending = f.service.runLocalScan(controller.signal);
    const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    if (stage === "during-analysis") { await vi.waitFor(() => expect(analyzeMock).toHaveBeenCalled()); controller.abort(); }
    if (stage === "waiting-freshness") { await vi.waitFor(() => expect(f.source.captureRevision).toHaveBeenCalled()); controller.abort(); }
    await assertion;
    expect(f.write).not.toHaveBeenCalled(); expect(f.service.isLocalScanRunning()).toBe(false);
    expect(f.service.getSnapshot().lastLocalScan).toBeUndefined();
    if (stage !== "before-capture") expect(listener).toHaveBeenCalledTimes(2);
  });
  it("treats abort after the findings commit point as too late to undo durable state", async () => {
    const controller = new AbortController(); const f = fixture(); await f.service.initialize();
    f.write.mockImplementation(async (file, text) => { f.storage.files.set(file, text); if (file === "findings.json") controller.abort(); });
    const outcome = await f.service.runLocalScan(controller.signal);
    expect(outcome).toMatchObject({ findingsCommitted: true, historyRecorded: true, scan: { status: "completed" } });
    expect(f.service.isLocalScanRunning()).toBe(false);
  });
  it("notifies running/commit/history/idle and durable transitions, isolates subscribers and returned objects", async () => {
    const f = fixture(); await f.service.initialize();
    const states: boolean[] = []; const listener = vi.fn(() => { states.push(f.service.isLocalScanRunning()); });
    const unsubscribe = f.service.subscribe(listener); f.service.subscribe(() => { throw new Error("listener failed"); });
    const outcome = await f.service.runLocalScan(signal());
    expect(states).toEqual([true, true, true, false]);
    const id = f.service.listFindings()[0].id;
    await f.service.dismissFinding(id); expect(f.service.getFinding(id)?.state).toBe("dismissed");
    await f.service.reopenFinding(id); await f.service.snoozeFinding(id, 1000);
    expect(listener).toHaveBeenCalledTimes(7);
    const snap = f.service.getSnapshot(); snap.dimensions.structure.state = "needs-attention";
    snap.lastLocalScan!.analyzerVersions.orphans = "mutated"; outcome.scan.status = "failed";
    f.service.listFindings()[0].title = "Mutated";
    expect(f.service.getSnapshot().lastLocalScan?.status).toBe("completed");
    expect(f.service.getSnapshot().lastLocalScan?.analyzerVersions.orphans).toBe("1");
    expect(f.service.getFinding(id)?.title).not.toBe("Mutated");
    unsubscribe(); await f.service.reopenFinding(id); expect(listener).toHaveBeenCalledTimes(7);
  });
  it.each([false, true])("restores conservative completed/partial aggregation after restart (partial=%s)", async (partial) => {
    const f = fixture(); await f.service.initialize();
    if (partial) f.source.capture.mockResolvedValue(snapshot([note("A.md", { linksAvailable: false })], { linksComplete: false }));
    const outcome = await f.service.runLocalScan(signal());
    expect(outcome.scan.status).toBe(partial ? "partial" : "completed");
    const restart = new HealthService(new FindingStore(f.storage), f.source); await restart.initialize();
    expect(restart.getSnapshot().dimensions.connections.state).toBe(partial ? "unknown" : "good");
  });
  it("cannot mistake a stale partial scan for a reconciled receipt after restart", async () => {
    const f = fixture(); await f.service.initialize(); await f.service.runLocalScan(signal());
    f.source.captureRevision.mockResolvedValue(createLocalVaultRevision([]));
    await f.service.runLocalScan(signal());
    const restart = new HealthService(new FindingStore(f.storage), f.source); await restart.initialize();
    expect(restart.getSnapshot().dimensions.connections.state).toBe("unknown");
    expect(restart.getSnapshot().newFindings).toBe(0);
  });
  it("rejects invalid/colliding scan IDs before capture and uses valid native IDs by default", async () => {
    const f = fixture({ scanIdFactory: () => "same-id" }); await f.service.initialize(); await f.service.runLocalScan(signal());
    await expect(f.service.runLocalScan(signal())).rejects.toThrow("duplicate");
    expect(f.source.capture).toHaveBeenCalledTimes(1);
    const invalid = fixture({ scanIdFactory: () => "BAD ID" }); await invalid.service.initialize();
    await expect(invalid.service.runLocalScan(signal())).rejects.toThrow("identifier");
    const native = new HealthService(new FindingStore(new MemoryHealthStorage()), f.source); await native.initialize();
    expect((await native.runLocalScan(signal())).scan.id).toMatch(/^local-[a-f0-9-]{36}$/u);
  });
});
