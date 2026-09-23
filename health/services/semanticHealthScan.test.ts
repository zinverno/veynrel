import { describe, expect, it, vi } from "vitest";
import { HealthService, HealthScanAlreadyRunningError } from "./healthService";
import { FindingStore } from "../store/findingStore";
import { MemoryHealthStorage } from "../store/testSupport";
import { snapshot } from "../analyzers/local/testFixtures";
import { createLocalVaultRevision } from "../analyzers/local/localVaultRevision";
import { SemanticHealthAnalysisAdapter } from "../../semantic/health/semanticHealthAnalysisAdapter";
import type { SemanticDuplicatePair, SemanticIndexState } from "../../semantic/types";

const signal = () => new AbortController().signal;
const pair = (leftPath = "A.md", rightPath = "B.md"): SemanticDuplicatePair => ({ leftPath, rightPath, score: 0.973, leftMatches: [], rightMatches: [] });
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}
function fixture() {
  let sequence = 0;
  const storage = new MemoryHealthStorage();
  const state: SemanticIndexState = { kind: "ready", vectorCount: 8, vectorGeneration: 3, dimensions: 3,
    provider: "ollama", providerLabel: "Ollama", model: "test", configurationRevision: 0, runtimeRevision: 1 };
  const engine = { getCachedIndexState: vi.fn(() => ({ ...state })), findPotentialDuplicates: vi.fn(async () => [pair()]) };
  const adapter = new SemanticHealthAnalysisAdapter(engine);
  const source = { capture: vi.fn(async () => snapshot([])), captureRevision: vi.fn(async () => createLocalVaultRevision([])) };
  const create = () => {
    const store = new FindingStore(storage, () => 100);
    const service = new HealthService(store, source, { semanticAnalysis: adapter, clock: () => 100, scanIdFactory: () => `scan-${++sequence}` });
    return { store, service };
  };
  return { ...create(), create, storage, state, engine, adapter, source };
}

describe("semantic Health scan persistence", () => {
  it.each([0, 1, 99, 100])("persists %s results with truthful completeness, notesSeen and scope receipts", async (count) => {
    const f = fixture(); await f.service.initialize();
    f.engine.findPotentialDuplicates.mockResolvedValue(Array.from({ length: count }, (_, i) => pair(`${i}.md`, "Z.md")));
    const outcome = await f.service.runSemanticScan(signal());
    expect(outcome).toMatchObject({ findingsCommitted: true, historyRecorded: true, freshness: "verified",
      scan: { type: "semantic", notesSeen: 0, findingsCreated: count, status: count === 100 ? "partial" : "completed", analyzerVersions: { "semantic-duplicates": "1" } } });
    expect(outcome.scan.reconciliationReceipts).toEqual(f.store.getReconciliationReceipts());
    expect(Object.keys(outcome.scan.reconciliationReceipts)).toEqual(["semantic:semantic-duplicates"]);
    expect(f.store.listScanRuns()).toEqual([outcome.scan]);
    expect(f.engine.getCachedIndexState).toHaveBeenCalledTimes(3);
    expect(f.source.capture).not.toHaveBeenCalled(); expect(f.source.captureRevision).not.toHaveBeenCalled();
  });

  it("persists only paths and score, even when discovery includes previews, content and vectors", async () => {
    const f = fixture(); await f.service.initialize();
    const match = { preview: "PRIVATE_PREVIEW", content: "PRIVATE_CONTENT", vector: [0.1234, 0.5678] };
    f.engine.findPotentialDuplicates.mockResolvedValue([{ ...pair(), leftMatches: [match], rightMatches: [match] }] as unknown as SemanticDuplicatePair[]);
    await f.service.runSemanticScan(signal());
    const bytes = f.storage.files.get("findings.json")!;
    expect(bytes).not.toMatch(/PRIVATE|preview|content|vector|matches|configuration|model|provider/iu);
    expect(f.store.list()[0].evidence).toEqual([{ kind: "similarity-score", value: 0.973 }]);
    expect(f.service.getSnapshot().recommendation?.findingId).toBe(f.store.list()[0].id);
    expect(f.service.getSnapshot().newFindings).toBe(0);
  });

  it("keeps dismissal durable on repeat, and Dismiss/Snooze/Reopen preserve receipts through restart", async () => {
    const f = fixture(); await f.service.initialize(); await f.service.runSemanticScan(signal());
    const original = f.store.list()[0]; const receipt = f.store.getReconciliationReceipts();
    await f.service.dismissFinding(original.id);
    expect(f.store.getReconciliationReceipts()).toEqual(receipt);
    await f.service.runSemanticScan(signal());
    expect(f.store.get(original.id)?.state).toBe("dismissed");
    expect(f.store.getReconciliationReceipts()["semantic:semantic-duplicates"]).toBeGreaterThan(receipt["semantic:semantic-duplicates"]);
    for (const action of ["reopen", "snooze", "reopen", "dismiss"] as const) {
      const before = f.store.getReconciliationReceipts();
      if (action === "snooze") await f.service.snoozeFinding(original.id, 10000);
      else if (action === "reopen") await f.service.reopenFinding(original.id);
      else await f.service.dismissFinding(original.id);
      const restarted = f.create(); await restarted.service.initialize();
      expect(restarted.store.getReconciliationReceipts()).toEqual(before);
      expect(restarted.service.getSnapshot().lastSemanticScanReconciled).toBe(true);
      expect(restarted.store.get(original.id)?.state).toBe(action === "snooze" ? "snoozed" : action === "dismiss" ? "dismissed" : "open");
    }
  });

  it.each(["open", "snoozed"] as const)("exactly 100 absent pairs never resolve an old %s Finding; fewer than 100 resolve and recurrence preserves identity", async (state) => {
    const f = fixture(); await f.service.initialize(); await f.service.runSemanticScan(signal());
    const original = f.store.list()[0];
    if (state === "snoozed") await f.service.snoozeFinding(original.id, 10000);
    const otherPairs = Array.from({ length: 100 }, (_, i) => pair(`Other${i}.md`, "Z.md"));
    f.engine.findPotentialDuplicates.mockResolvedValue(otherPairs);
    const limited = await f.service.runSemanticScan(signal());
    expect(limited.scan.status).toBe("partial"); expect(limited.scan.findingsResolved).toBe(0);
    expect(f.store.get(original.id)?.state).toBe(state);
    f.engine.findPotentialDuplicates.mockResolvedValue(otherPairs.slice(0, 3));
    await f.service.runSemanticScan(signal()); expect(f.store.get(original.id)?.state).toBe("resolved");
    f.engine.findPotentialDuplicates.mockResolvedValue([pair("B.md", "A.md")]);
    await f.service.runSemanticScan(signal());
    expect(f.store.get(original.id)).toMatchObject({ id: original.id, fingerprint: original.fingerprint, firstSeenAt: original.firstSeenAt, state: "open" });
  });

  it.each([{ vectorGeneration: 4 }, { vectorCount: 9 }, { dimensions: 4 }, { provider: "openrouter" }, { model: "changed" },
    { configurationRevision: 1 }, { runtimeRevision: 2 }, { kind: "indexing" }, { kind: "initializing" }, { kind: "incompatible" },
    { kind: "error" }, { kind: "disabled" }] as Partial<SemanticIndexState>[])("checks %j inside the actual queued beforeCommit guard", async (change) => {
    const f = fixture(); await f.service.initialize(); await f.service.runSemanticScan(signal());
    const before = f.storage.files.get("findings.json"); const previous = f.store.list();
    // Occupy the actual store queue without changing Findings, then let analysis finish.
    const hold = gate(); const entered = gate(); const write = f.storage.write.bind(f.storage);
    vi.spyOn(f.storage, "write").mockImplementationOnce(async (file, contents) => { entered.release(); await hold.promise; await write(file, contents); });
    const blockingWrite = f.store.recordScanRun(f.store.listScanRuns()[0]); await entered.promise;
    f.engine.findPotentialDuplicates.mockResolvedValue([pair("New.md", "Pair.md")]);
    const analyzed = gate(); const analyze = f.adapter.analyzeDuplicates.bind(f.adapter);
    vi.spyOn(f.adapter, "analyzeDuplicates").mockImplementation(async (abort) => { const result = await analyze(abort); analyzed.release(); return result; });
    const pending = f.service.runSemanticScan(signal()); await analyzed.promise;
    Object.assign(f.state, change); hold.release(); await blockingWrite;
    const outcome = await pending;
    expect(outcome).toMatchObject({ findingsCommitted: false, historyRecorded: true, freshness: "stale",
      scan: { status: "failed", findingsCreated: 0, findingsResolved: 0, reconciliationReceipts: {} } });
    expect(f.storage.files.get("findings.json")).toBe(before); expect(f.store.list()).toEqual(previous);
    expect(f.service.getSnapshot().dimensions.connections.analysisDepth).not.toBe("semantic");
  });

  it("keeps Local and Semantic associations independent across reconciliation, lifecycle and restart", async () => {
    const f = fixture(); await f.service.initialize();
    await f.service.runLocalScan(signal()); const local = f.service.getSnapshot().lastLocalScan!;
    await f.service.runSemanticScan(signal()); const semantic = f.service.getSnapshot().lastSemanticScan!;
    const restarted = f.create(); await restarted.service.initialize();
    expect(restarted.service.getSnapshot()).toMatchObject({ lastLocalScanReconciled: true, lastSemanticScanReconciled: true,
      dimensions: { structure: { state: "good", analysisDepth: "basic", analysisComplete: true },
        connections: { state: "review-recommended", analysisDepth: "semantic", analysisComplete: true } } });
    await restarted.service.runLocalScan(signal());
    expect(restarted.service.getSnapshot().lastSemanticScan).toEqual(semantic);
    expect(restarted.service.getSnapshot().lastSemanticScanReconciled).toBe(true);
    const localAgain = restarted.service.getSnapshot().lastLocalScan!;
    await restarted.service.runSemanticScan(signal());
    const again = f.create(); await again.service.initialize();
    expect(again.service.getSnapshot().lastLocalScan).toEqual(localAgain);
    expect(again.service.getSnapshot().lastLocalScanReconciled).toBe(true);
    expect(again.service.getSnapshot().lastSemanticScanReconciled).toBe(true);
    expect(localAgain.reconciliationReceipts).not.toEqual(local.reconciliationReceipts);
  });

  it("history failure keeps committed Findings/receipts and Local trust; older semantic history cannot borrow the new receipt", async () => {
    const f = fixture(); await f.service.initialize(); await f.service.runLocalScan(signal()); await f.service.runSemanticScan(signal());
    const old = f.service.getSnapshot().lastSemanticScan!;
    const write = f.storage.write.bind(f.storage);
    vi.spyOn(f.storage, "write").mockImplementation(async (file, contents) => {
      if (file === "scan-runs.json") throw new Error("private history failure");
      await write(file, contents);
    });
    f.engine.findPotentialDuplicates.mockResolvedValue([pair("New.md", "Pair.md")]);
    const outcome = await f.service.runSemanticScan(signal());
    expect(outcome).toMatchObject({ findingsCommitted: true, historyRecorded: false, diagnostics: ["history-not-recorded"], scan: { status: "completed" } });
    expect(f.service.getSnapshot().lastSemanticScanReconciled).toBe(true);
    const restarted = f.create(); await restarted.service.initialize();
    expect(restarted.store.list()).toEqual(f.store.list());
    expect(restarted.service.getSnapshot()).toMatchObject({ lastSemanticScan: old, lastSemanticScanReconciled: false, lastLocalScanReconciled: true,
      dimensions: { structure: { state: "good", analysisDepth: "basic", analysisComplete: true } } });
  });

  it("serializes Local/Semantic analysis without queuing extra scan clicks", async () => {
    const f = fixture(); await f.service.initialize(); const hold = gate();
    f.engine.findPotentialDuplicates.mockImplementationOnce(async () => { await hold.promise; return []; });
    const pending = f.service.runSemanticScan(signal());
    expect(f.service.getSnapshot()).toMatchObject({ semanticScanRunning: true, localScanRunning: false });
    await expect(f.service.runSemanticScan(signal())).rejects.toBeInstanceOf(HealthScanAlreadyRunningError);
    await expect(f.service.runLocalScan(signal())).rejects.toBeInstanceOf(HealthScanAlreadyRunningError);
    hold.release(); await pending;
    const localHold = gate(); f.source.capture.mockImplementationOnce(async () => { await localHold.promise; return snapshot([]); });
    const local = f.service.runLocalScan(signal());
    await expect(f.service.runSemanticScan(signal())).rejects.toBeInstanceOf(HealthScanAlreadyRunningError);
    localHold.release(); await local;
    expect(f.service.isScanRunning()).toBe(false);
  });

  it("cancels pending discovery without Findings or terminal history writes", async () => {
    const f = fixture(); await f.service.initialize(); await f.service.runSemanticScan(signal());
    const before = new Map(f.storage.files); const hold = gate();
    f.engine.findPotentialDuplicates.mockImplementationOnce(async () => { await hold.promise; return []; });
    const abort = new AbortController(); const pending = f.service.runSemanticScan(abort.signal); abort.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" }); hold.release();
    expect(f.storage.files).toEqual(before); expect(f.service.isScanRunning()).toBe(false);
  });

  it("records committed truth when cancellation arrives during the durable Finding write", async () => {
    const f = fixture(); await f.service.initialize(); const abort = new AbortController();
    const write = f.storage.write.bind(f.storage);
    vi.spyOn(f.storage, "write").mockImplementation(async (file, contents) => {
      if (file === "findings.json") abort.abort();
      await write(file, contents);
    });
    expect(await f.service.runSemanticScan(abort.signal)).toMatchObject({ findingsCommitted: true, historyRecorded: true, scan: { status: "completed" } });
  });

  it("cancels after analysis inside the final queued guard without changing either Health file", async () => {
    const f = fixture(); await f.service.initialize(); await f.service.runSemanticScan(signal());
    const before = new Map(f.storage.files); const abort = new AbortController();
    const verify = f.adapter.verifyCurrent.bind(f.adapter); let checks = 0;
    vi.spyOn(f.adapter, "verifyCurrent").mockImplementation(async (revision, signal) => {
      if (++checks === 2) abort.abort(); // First post-discovery, then actual store beforeCommit.
      await verify(revision, signal);
    });
    f.engine.findPotentialDuplicates.mockResolvedValue([]);
    await expect(f.service.runSemanticScan(abort.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(checks).toBe(2); expect(f.storage.files).toEqual(before);
  });

  it("reports safe unavailable/analysis/write failures without publishing or resolving", async () => {
    const f = fixture(); await f.service.initialize(); await f.service.runSemanticScan(signal());
    const before = f.storage.files.get("findings.json");
    f.state.kind = "disabled";
    expect(await f.service.runSemanticScan(signal())).toMatchObject({ findingsCommitted: false, scan: { status: "failed" }, diagnostics: ["semantic-unavailable"] });
    f.state.kind = "ready"; f.engine.findPotentialDuplicates.mockRejectedValueOnce(new Error("private-provider-response"));
    expect(await f.service.runSemanticScan(signal())).toMatchObject({ findingsCommitted: false, diagnostics: ["semantic-analysis-failed"] });
    const write = f.storage.write.bind(f.storage);
    vi.spyOn(f.storage, "write").mockImplementation(async (file, contents) => { if (file === "findings.json") throw new Error("private-write-error"); await write(file, contents); });
    expect(await f.service.runSemanticScan(signal())).toMatchObject({ findingsCommitted: false, diagnostics: ["reconciliation-failed"] });
    expect(f.storage.files.get("findings.json")).toBe(before);
  });
});
