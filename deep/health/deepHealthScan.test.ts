import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callOpenRouter } from "../../api";
import { deepFixture, gate } from "../testSupport";
import { HealthService, HealthScanAlreadyRunningError } from "../../health/services/healthService";
import { FindingStore } from "../../health/store/findingStore";
import { MemoryHealthStorage } from "../../health/store/testSupport";
import { snapshot } from "../../health/analyzers/local/testFixtures";
import { createLocalVaultRevision } from "../../health/analyzers/local/localVaultRevision";
import { SemanticHealthAnalysisAdapter } from "../../semantic/health/semanticHealthAnalysisAdapter";

vi.mock("obsidian", () => ({ Modal: class {}, Notice: class {}, PluginSettingTab: class {}, getLanguage: () => "en" }));
vi.mock("../../api", () => ({ callOpenRouter: vi.fn() }));
beforeEach(() => {
  vi.stubGlobal("window", { setTimeout: (fn: () => void) => setTimeout(fn, 0), clearTimeout });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(callOpenRouter).mockReset().mockImplementation(async (_settings, _system, user) => JSON.stringify(
    [...user.matchAll(/^PATH: (.+)$/gmu)].map((match) => ({ path: match[1], quality: "draft", keyIdeas: "PRIVATE_IDEA", entities: ["PRIVATE_ENTITY"] }))));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const signal = () => new AbortController().signal;

function fixture() {
  const f = deepFixture(); const storage = new MemoryHealthStorage(); let seq = 0;
  const source = { capture: vi.fn(async () => snapshot([])), captureRevision: vi.fn(async () => createLocalVaultRevision([])) };
  const semanticEngine = { getCachedIndexState: vi.fn(() => ({ kind: "ready" as const, vectorCount: 2, vectorGeneration: 1, dimensions: 3,
    provider: "ollama" as const, providerLabel: "Ollama", model: "embedding", configurationRevision: 1, runtimeRevision: 1 })), findPotentialDuplicates: vi.fn(async () => []) };
  const semantic = new SemanticHealthAnalysisAdapter(semanticEngine);
  const create = () => {
    const store = new FindingStore(storage, () => 100);
    const service = new HealthService(store, source, { deepAnalysis: f.adapter, semanticAnalysis: semantic, clock: () => 100, scanIdFactory: () => `deep-test-${++seq}` });
    return { store, service };
  };
  return { ...f, ...create(), create, storage, source, semanticEngine };
}

describe("Deep Knowledge Health reconciliation", () => {
  it("records current Deep analyzer, actual notesSeen and committed owner receipt; persists no content or configuration", async () => {
    const f = fixture(); await f.service.initialize(); const result = await f.service.runDeepScan(signal(), f.adapter.getConsent()!);
    expect(result).toMatchObject({ findingsCommitted: true, historyRecorded: true, freshness: "verified", diagnostics: [],
      scan: { type: "deep", notesSeen: 3, findingsCreated: 3, status: "completed", analyzerVersions: { "knowledge-quality": "1" } } });
    expect(result.scan.reconciliationReceipts).toEqual(f.store.getReconciliationReceipts());
    expect(Object.keys(result.scan.reconciliationReceipts)).toEqual(["deep-ai:knowledge-quality"]);
    expect([...f.storage.files.keys()].sort()).toEqual(["findings.json", "scan-runs.json"]);
    expect([...f.storage.files.values()].join()).not.toMatch(/PRIVATE|SENTINEL|keyIdeas|mainIdea|keyPoints|entities|suggestedTags|suggestedLinks|model-a|localhost|payload|prompt|token/iu);
    expect(f.service.getSnapshot().dimensions.knowledge).toMatchObject({ state: "review-recommended", analysisDepth: "deep", analysisComplete: true });
    expect(f.source.capture).not.toHaveBeenCalled(); expect(f.semanticEngine.findPotentialDuplicates).not.toHaveBeenCalled();
  });

  it("dismissal survives rerun, receipts advance, improvement resolves open/snoozed notes, and recurrence retains identity", async () => {
    const f = fixture(); await f.service.initialize(); await f.service.runDeepScan(signal(), f.adapter.getConsent()!);
    const original = f.store.list().find((item) => item.notePaths[0] === "A.md")!;
    const receipt = f.store.getReconciliationReceipts();
    await f.service.dismissFinding(original.id); await f.service.runDeepScan(signal(), f.adapter.getConsent()!);
    expect(f.store.get(original.id)?.state).toBe("dismissed");
    expect(f.store.getReconciliationReceipts()["deep-ai:knowledge-quality"]).toBeGreaterThan(receipt["deep-ai:knowledge-quality"]);
    await f.service.reopenFinding(original.id); await f.service.snoozeFinding(original.id, 10000);
    vi.mocked(callOpenRouter).mockImplementation(async (_settings, _system, user) => JSON.stringify(
      [...user.matchAll(/^PATH: (.+)$/gmu)].map((match) => ({ path: match[1], quality: "developed" }))));
    await f.service.runDeepScan(signal(), f.adapter.getConsent()!); expect(f.store.get(original.id)?.state).toBe("resolved");
    vi.mocked(callOpenRouter).mockResolvedValueOnce('[{"path":"A.md","quality":"draft"}]');
    await f.service.runDeepScan(signal(), f.adapter.getConsent()!);
    expect(f.store.get(original.id)).toMatchObject({ id: original.id, fingerprint: original.fingerprint, firstSeenAt: original.firstSeenAt, state: "open" });
  });

  it("partial absence from a failed batch cannot resolve an old draft; valid clean results still commit partial coverage", async () => {
    const f = fixture(); await f.service.initialize(); await f.service.runDeepScan(signal(), f.adapter.getConsent()!);
    const prior = f.store.list();
    vi.mocked(callOpenRouter).mockImplementation(async (_settings, _system, user) => {
      if (user.includes("PATH: A.md")) throw new Error("PRIVATE_PROVIDER_BODY");
      return JSON.stringify([...user.matchAll(/^PATH: (.+)$/gmu)].map((match) => ({ path: match[1], quality: "polished" })));
    });
    const result = await f.service.runDeepScan(signal(), f.adapter.getConsent()!);
    expect(result).toMatchObject({ findingsCommitted: true, diagnostics: ["deep-partial"], scan: { status: "partial", notesSeen: 3, findingsResolved: 0 } });
    expect(f.store.list()).toEqual(prior);
    expect(f.service.getSnapshot().dimensions.knowledge).toMatchObject({ state: "review-recommended", analysisComplete: false, analysisDepth: "deep" });
  });

  it.each(["invalid-json", "malformed", "empty", "provider-failure"])("all failure (%s) never reconciles or advances a receipt", async (mode) => {
    const f = fixture(); await f.service.initialize(); await f.service.runDeepScan(signal(), f.adapter.getConsent()!);
    const bytes = f.storage.files.get("findings.json"); const receipt = f.store.getReconciliationReceipts();
    if (mode === "provider-failure") vi.mocked(callOpenRouter).mockRejectedValue(new Error("PRIVATE_BODY"));
    else vi.mocked(callOpenRouter).mockResolvedValue(mode === "invalid-json" ? "not-json PRIVATE_BODY" : mode === "empty" ? "[]" : '[{"path":"A.md","quality":"unknown"}]');
    const result = await f.service.runDeepScan(signal(), f.adapter.getConsent()!);
    expect(result).toMatchObject({ findingsCommitted: false, scan: { status: "failed", notesSeen: 3, reconciliationReceipts: {} }, diagnostics: ["deep-analysis-failed"] });
    expect(f.storage.files.get("findings.json")).toBe(bytes); expect(f.store.getReconciliationReceipts()).toEqual(receipt);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });

  it("empty scope completes neutrally, unavailable analysis fails safely", async () => {
    const f = fixture(); f.files.length = 0; await f.service.initialize();
    expect((await f.service.runDeepScan(signal(), f.adapter.getConsent()!)).scan).toMatchObject({ notesSeen: 0, status: "completed" });
    expect(f.service.getSnapshot().dimensions.knowledge).toMatchObject({ state: "unknown", analysisComplete: true, analysisDepth: "deep" });
    expect(callOpenRouter).not.toHaveBeenCalled();
    const service = new HealthService(f.store, f.source); await service.initialize();
    expect(await service.runDeepScan(signal(), f.adapter.getConsent()!)).toMatchObject({ findingsCommitted: false, scan: { status: "failed" }, diagnostics: ["deep-unavailable"] });
  });

  it.each(["vault", "config"])("rechecks %s freshness inside the actual queued beforeCommit guard", async (kind) => {
    const f = fixture(); await f.service.initialize(); await f.service.runDeepScan(signal(), f.adapter.getConsent()!);
    const before = f.storage.files.get("findings.json"); const receipt = f.store.getReconciliationReceipts();
    const hold = gate(); const entered = gate(); const write = f.storage.write.bind(f.storage);
    vi.spyOn(f.storage, "write").mockImplementationOnce(async (file, bytes) => { entered.release(); await hold.promise; await write(file, bytes); });
    const blocking = f.store.recordScanRun(f.store.listScanRuns()[0]); await entered.promise;
    const analyzed = gate(); const analyze = f.adapter.analyzeKnowledge.bind(f.adapter);
    vi.spyOn(f.adapter, "analyzeKnowledge").mockImplementation(async (abort, consent) => { const result = await analyze(abort, consent); analyzed.release(); return result; });
    const pending = f.service.runDeepScan(signal(), f.adapter.getConsent()!); await analyzed.promise;
    if (kind === "vault") f.files[0].stat.size++;
    else { f.config.settings.model = "model-b"; f.config.revision++; }
    hold.release(); await blocking;
    expect(await pending).toMatchObject({ findingsCommitted: false, freshness: "stale", scan: { status: "failed", reconciliationReceipts: {} }, diagnostics: [`deep-${kind}-changed`] });
    expect(f.storage.files.get("findings.json")).toBe(before); expect(f.store.getReconciliationReceipts()).toEqual(receipt);
    if (kind === "config") expect(f.config.settings.model).toBe("model-b");
  });

  it("one service excludes Local, Semantic and Deep overlap", async () => {
    const f = fixture(); await f.service.initialize(); const hold = gate<string>(); vi.mocked(callOpenRouter).mockReturnValueOnce(hold.promise);
    const pending = f.service.runDeepScan(signal(), f.adapter.getConsent()!); await vi.waitFor(() => expect(callOpenRouter).toHaveBeenCalledTimes(1));
    for (const run of [() => f.service.runLocalScan(signal()), () => f.service.runSemanticScan(signal()), () => f.service.runDeepScan(signal(), f.adapter.getConsent()!)]) {
      await expect(run()).rejects.toBeInstanceOf(HealthScanAlreadyRunningError);
    }
    hold.release('[{"path":"A.md","quality":"draft"}]'); await pending; expect(f.service.isScanRunning()).toBe(false);
  });

  it("cancellation during provider work preserves Findings and cannot persist completed/partial history", async () => {
    const f = fixture(); await f.service.initialize(); await f.service.runDeepScan(signal(), f.adapter.getConsent()!);
    const before = f.storage.files.get("findings.json"); const history = f.store.listScanRuns();
    const hold = gate<string>(); vi.mocked(callOpenRouter).mockClear().mockReturnValueOnce(hold.promise);
    const abort = new AbortController(); const pending = f.service.runDeepScan(abort.signal, f.adapter.getConsent()!);
    await vi.waitFor(() => expect(callOpenRouter).toHaveBeenCalledTimes(1)); abort.abort();
    expect(await pending).toMatchObject({ findingsCommitted: false, scan: { status: "failed", notesSeen: 3 }, diagnostics: ["deep-cancelled"] });
    hold.release('[{"path":"A.md","quality":"draft"}]');
    expect(f.storage.files.get("findings.json")).toBe(before);
    expect(f.store.listScanRuns().filter((run) => run.status !== "failed")).toEqual(history);
  });

  it("Local/Semantic/Deep receipts survive each source rerun, lifecycle writes and restart without provider or note work", async () => {
    const f = fixture(); await f.service.initialize();
    await f.service.runLocalScan(signal()); await f.service.runSemanticScan(signal()); await f.service.runDeepScan(signal(), f.adapter.getConsent()!);
    for (const run of [() => f.service.runLocalScan(signal()), () => f.service.runSemanticScan(signal()), () => f.service.runDeepScan(signal(), f.adapter.getConsent()!)]) {
      await run(); const before = f.store.getReconciliationReceipts(); const original = f.store.list()[0];
      for (const transition of [() => f.service.dismissFinding(original.id), () => f.service.reopenFinding(original.id),
        () => f.service.snoozeFinding(original.id, 10000), () => f.service.reopenFinding(original.id)]) {
        await transition(); expect(f.store.getReconciliationReceipts()).toEqual(before);
        vi.mocked(callOpenRouter).mockClear(); f.vault.getMarkdownFiles.mockClear(); f.vault.cachedRead.mockClear();
        const restarted = f.create(); await restarted.service.initialize();
        expect(restarted.service.getSnapshot()).toMatchObject({ lastLocalScanReconciled: true, lastSemanticScanReconciled: true, lastDeepScanReconciled: true });
        expect(callOpenRouter).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled(); expect(f.vault.cachedRead).not.toHaveBeenCalled();
      }
    }
  });

  it("history failure retains committed Deep findings, but restart cannot borrow the receipt from an older Deep run", async () => {
    const f = fixture(); await f.service.initialize();
    await f.service.runLocalScan(signal()); await f.service.runSemanticScan(signal()); await f.service.runDeepScan(signal(), f.adapter.getConsent()!);
    const receipts = f.store.getReconciliationReceipts(); const write = f.storage.write.bind(f.storage);
    vi.spyOn(f.storage, "write").mockImplementation(async (file, bytes) => { if (file === "scan-runs.json") throw new Error("PRIVATE_DISK"); await write(file, bytes); });
    const result = await f.service.runDeepScan(signal(), f.adapter.getConsent()!);
    expect(result).toMatchObject({ findingsCommitted: true, historyRecorded: false, diagnostics: ["history-not-recorded"] });
    expect(f.store.getReconciliationReceipts()["deep-ai:knowledge-quality"]).toBeGreaterThan(receipts["deep-ai:knowledge-quality"]);
    const restarted = f.create(); await restarted.service.initialize();
    expect(restarted.service.getSnapshot()).toMatchObject({ lastLocalScanReconciled: true, lastSemanticScanReconciled: true, lastDeepScanReconciled: false });
    expect(restarted.service.getSnapshot().dimensions.knowledge).toMatchObject({ state: "review-recommended", analysisComplete: false });
  });

  it("reconciliation failure never publishes results and late cancellation preserves durable commit truth", async () => {
    const f = fixture(); await f.service.initialize();
    const write = f.storage.write.bind(f.storage);
    const persist = vi.spyOn(f.storage, "write").mockRejectedValueOnce(new Error("PRIVATE_STORAGE"));
    expect(await f.service.runDeepScan(signal(), f.adapter.getConsent()!)).toMatchObject({ findingsCommitted: false, diagnostics: ["deep-reconciliation-failed"] });
    expect(f.store.list()).toEqual([]);
    const abort = new AbortController();
    persist.mockImplementation(async (file, bytes) => { await write(file, bytes); if (file === "findings.json") abort.abort(); });
    expect(await f.service.runDeepScan(abort.signal, f.adapter.getConsent()!)).toMatchObject({ findingsCommitted: true, historyRecorded: true, scan: { status: "completed" } });
  });
});
