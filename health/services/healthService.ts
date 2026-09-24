import type { Finding } from "../domain/finding";
import { DEFAULT_VAULT_PROFILE } from "../domain/profile";
import type { VaultProfile } from "../domain/profile";
import type { ScanRun } from "../domain/scanRun";
import { cloneScanRun } from "../domain/scanRunValidation";
import { reconciliationIsCurrent } from "../domain/reconciliation";
import { isIdentifier, isTimestamp } from "../domain/validation";
import { FindingStore } from "../store/findingStore";
import type { FindingFilter, HealthLoadStatus } from "../store/types";
import { LocalScanCoordinator } from "../analyzers/local/localScanCoordinator";
import { isCancellation, LocalAnalysisCancelledError, throwIfAborted, withAbort } from "../analyzers/local/cancellation";
import type { HealthAnalyzer } from "../analyzers/types";
import type { LocalAnalysisContext, LocalScanAnalysis } from "../analyzers/local/types";
import { aggregateHealth } from "./healthAggregator";
import { selectRecommendation } from "./recommendationService";
import { LocalHealthFreshnessUnavailableError, LocalHealthStaleScanError, verifyLocalScanFreshness } from "./localScanFreshness";
import type { HealthInitializationResult, HealthLocalVaultSource, HealthSnapshot, LocalHealthScanOutcome, SemanticHealthScanOutcome } from "./types";
import { SEMANTIC_DUPLICATES_ANALYZER, SemanticHealthAnalysisError } from "../semanticHealthAnalysisPort";
import type { SemanticHealthAnalysisPort } from "../semanticHealthAnalysisPort";
import type { RecallHealthSnapshot } from "../recallHealthPort";
import { KNOWLEDGE_QUALITY_ANALYZER, DeepHealthAnalysisError } from "../deepHealthAnalysisPort";
import type { DeepHealthAnalysisPort, DeepKnowledgeConsent } from "../deepHealthAnalysisPort";
import type { DeepHealthScanOutcome } from "./types";

type HealthScanType = "local" | "semantic" | "deep";

export class HealthNotInitializedError extends Error {
  constructor() { super("Health is not initialized."); this.name = "HealthNotInitializedError"; }
}
export class HealthStorageUnavailableError extends Error {
  constructor() { super("Health findings storage requires recovery before scanning."); this.name = "HealthStorageUnavailableError"; }
}
export class HealthScanAlreadyRunningError extends Error {
  constructor() { super("A Health analysis is already running."); this.name = "HealthScanAlreadyRunningError"; }
}
export { HealthScanAlreadyRunningError as LocalHealthScanAlreadyRunningError };

export interface HealthServiceOptions {
  clock?: () => number;
  scanIdFactory?: () => string;
  analyzers?: readonly HealthAnalyzer<LocalAnalysisContext>[];
  semanticAnalysis?: SemanticHealthAnalysisPort;
  deepAnalysis?: DeepHealthAnalysisPort;
}

const writable = (status: HealthLoadStatus): boolean => status === "loaded" || status === "missing";

/** One service owns one store and one source/probe scope. Never construct a store per scan. */
export class HealthService {
  private readonly coordinator: LocalScanCoordinator;
  private readonly clock: () => number;
  private readonly scanIdFactory: (type: HealthScanType) => string;
  private initialization?: HealthInitializationResult;
  private initializing?: Promise<HealthInitializationResult>;
  private running?: HealthScanType;
  private readonly listeners = new Set<() => void>();
  private readonly lastAttempts: Partial<Record<HealthScanType, ScanRun>> = {};
  private lastObservation = -1;

  constructor(private readonly store: FindingStore, private readonly source: HealthLocalVaultSource, private readonly options: HealthServiceOptions = {}) {
    this.coordinator = new LocalScanCoordinator(source, options.analyzers);
    this.clock = options.clock ?? (() => Date.now());
    this.scanIdFactory = options.scanIdFactory ?? ((type) => `${type}-${crypto.randomUUID()}`);
  }

  async initialize(): Promise<HealthInitializationResult> {
    this.initializing ??= this.store.load().then((storage) => {
      const findingsWritable = writable(storage.findings);
      const historyWritable = writable(storage.scanRuns);
      this.initialization = { storage, findingsWritable, historyWritable,
        status: !findingsWritable ? "unavailable" : !historyWritable ? "degraded" : "ready" };
      return this.initialization;
    });
    const result = await this.initializing;
    return { ...result, storage: { ...result.storage } };
  }

  isLocalScanRunning(): boolean { return this.running === "local"; }
  isSemanticScanRunning(): boolean { return this.running === "semantic"; }
  isDeepScanRunning(): boolean { return this.running === "deep"; }
  isScanRunning(): boolean { return this.running !== undefined; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  getSnapshot(profile: VaultProfile = DEFAULT_VAULT_PROFILE, recall?: RecallHealthSnapshot): HealthSnapshot {
    const initialization = this.requireInitialized();
    const findings = this.store.list();
    const runs = this.store.listScanRuns();
    const scan = this.lastAttempts.local ?? runs.find((run) => run.type === "local");
    const semanticScan = this.lastAttempts.semantic ?? runs.find((run) => run.type === "semantic");
    const deepScan = this.lastAttempts.deep ?? runs.find((run) => run.type === "deep");
    const current = (run?: ScanRun): boolean => run !== undefined && (run.status === "completed" || run.status === "partial") &&
      reconciliationIsCurrent(run.reconciliationReceipts, this.store.getReconciliationReceipts());
    const reconciled = current(scan); const semanticReconciled = current(semanticScan);
    const deepReconciled = current(deepScan);
    return { ...aggregateHealth({ findings, lastLocalScan: scan, reconciled, lastSemanticScan: semanticScan, semanticReconciled,
      lastDeepScan: deepScan, deepReconciled, recall }),
      recall: recall ? { ...recall } : undefined,
      recommendation: selectRecommendation(findings, profile),
      lastLocalScan: scan ? cloneScanRun(scan) : undefined, lastLocalScanReconciled: reconciled, localScanRunning: this.isLocalScanRunning(),
      lastSemanticScan: semanticScan ? cloneScanRun(semanticScan) : undefined,
      lastSemanticScanReconciled: semanticReconciled, semanticScanRunning: this.isSemanticScanRunning(),
      lastDeepScan: deepScan ? cloneScanRun(deepScan) : undefined,
      lastDeepScanReconciled: deepReconciled, deepScanRunning: this.isDeepScanRunning(),
      initialization: { ...initialization, storage: { ...initialization.storage } },
    };
  }

  listFindings(filter?: FindingFilter): Finding[] { this.requireInitialized(); return this.store.list(filter); }
  getFinding(id: string): Finding | undefined { this.requireInitialized(); return this.store.get(id); }
  async dismissFinding(id: string): Promise<void> { this.requireInitialized(); await this.store.dismiss(id); this.notify(); }
  async snoozeFinding(id: string, until: number): Promise<void> { this.requireInitialized(); await this.store.snooze(id, until); this.notify(); }
  async reopenFinding(id: string): Promise<void> { this.requireInitialized(); await this.store.reopen(id); this.notify(); }

  runLocalScan(signal: AbortSignal): Promise<LocalHealthScanOutcome> { return this.runScan("local", signal); }
  runSemanticScan(signal: AbortSignal): Promise<SemanticHealthScanOutcome> { return this.runScan("semantic", signal); }
  runDeepScan(signal: AbortSignal, consent: DeepKnowledgeConsent): Promise<DeepHealthScanOutcome> { return this.runScan("deep", signal, consent); }

  private async runScan(type: HealthScanType, signal: AbortSignal, consent?: DeepKnowledgeConsent): Promise<LocalHealthScanOutcome> {
    const initialization = this.requireInitialized();
    if (this.running) throw new HealthScanAlreadyRunningError();
    throwIfAborted(signal);
    if (!initialization.findingsWritable) throw new HealthStorageUnavailableError();
    const id = this.scanIdFactory(type);
    if (!isIdentifier(id) || this.store.listScanRuns().some((run) => run.id === id) || Object.values(this.lastAttempts).some((run) => run.id === id)) {
      throw new Error("Invalid or duplicate Health scan identifier.");
    }
    // Avoid ambiguous 'new' counts when the clock repeats or moves backward.
    const startedAt = Math.max(this.now(), this.lastObservation + 1, (this.store.getFindingsUpdatedAt() ?? -1) + 1,
      this.store.listScanRuns().reduce((latest, run) => Math.max(latest, run.startedAt + 1), 0));
    if (!isTimestamp(startedAt)) throw new Error("Invalid Health scan observation time.");
    this.lastObservation = startedAt;
    const scan: ScanRun = { id, type, startedAt, notesSeen: 0, findingsCreated: 0, findingsUpdated: 0, findingsResolved: 0,
      analyzerVersions: {}, reconciliationReceipts: {}, status: "failed" };
    const outcome: LocalHealthScanOutcome = { scan, freshness: "not-checked", findingsCommitted: false, historyRecorded: false, diagnostics: [] };
    this.running = type;
    this.notify();
    try {
      if (type === "semantic") await this.reconcileSemanticAnalysis(outcome, signal);
      else if (type === "deep") await this.reconcileDeepAnalysis(outcome, signal, consent);
      else {
        let analysis: LocalScanAnalysis | undefined;
        try {
          analysis = await withAbort(this.coordinator.analyze(signal), signal);
          throwIfAborted(signal);
        } catch (error) {
          this.propagateCancellation(error, signal);
          outcome.diagnostics.push("analysis-failed");
        }
        if (analysis) await this.reconcileAnalysis(analysis, outcome, signal);
      }
      // Once findings are committed, finish recording truth even if cancellation arrives late.
      if (!outcome.findingsCommitted) {
        if (type === "deep" && signal.aborted) {
          if (!outcome.diagnostics.includes("deep-cancelled")) outcome.diagnostics.push("deep-cancelled");
        } else throwIfAborted(signal);
      }
      scan.completedAt ??= Math.max(startedAt, this.now());
      this.lastAttempts[type] = cloneScanRun(scan);
      try {
        await this.store.recordScanRun(scan);
        outcome.historyRecorded = true;
        this.notify();
      } catch {
        outcome.diagnostics.push("history-not-recorded");
      }
      return outcome;
    } finally {
      this.running = undefined;
      this.notify();
    }
  }

  private async reconcileDeepAnalysis(outcome: DeepHealthScanOutcome, signal: AbortSignal, consent?: DeepKnowledgeConsent): Promise<void> {
    const { scan } = outcome;
    scan.analyzerVersions = { [KNOWLEDGE_QUALITY_ANALYZER.id]: KNOWLEDGE_QUALITY_ANALYZER.version };
    let analyzed = false;
    try {
      const port = this.options.deepAnalysis;
      if (!port || !consent) throw new DeepHealthAnalysisError("deep-unavailable");
      // The Deep port bridges abort into MAP and retains the captured count on cancellation.
      const analysis = await port.analyzeKnowledge(signal, consent);
      scan.notesSeen = analysis.totalFiles;
      throwIfAborted(signal);
      if (analysis.totalFiles > 0 && analysis.analyzedFiles === 0) throw new DeepHealthAnalysisError("deep-analysis-failed");
      analyzed = true;
      const counts = await this.store.reconcileBatch([{
        scope: { source: "deep-ai", analyzerIds: [KNOWLEDGE_QUALITY_ANALYZER.id] },
        candidates: analysis.candidates, complete: analysis.complete, seenAt: scan.startedAt,
      }], { beforeCommit: async () => {
        await withAbort(port.verifyCurrent(analysis.revision, signal), signal);
        throwIfAborted(signal);
        outcome.freshness = "verified";
      } });
      outcome.findingsCommitted = true;
      scan.findingsCreated = counts.created; scan.findingsUpdated = counts.updated; scan.findingsResolved = counts.resolved;
      scan.completedAt = counts.updatedAt;
      scan.reconciliationReceipts = counts.reconciliationReceipts;
      scan.status = analysis.complete ? "completed" : "partial";
      if (!analysis.complete) outcome.diagnostics.push("deep-partial");
      this.lastAttempts.deep = cloneScanRun(scan);
      this.notify();
    } catch (error) {
      if (error instanceof DeepHealthAnalysisError) scan.notesSeen = error.totalFiles ?? scan.notesSeen;
      if (signal.aborted || isCancellation(error)) { outcome.diagnostics.push("deep-cancelled"); return; }
      if (error instanceof DeepHealthAnalysisError) {
        outcome.diagnostics.push(error.code);
        if (error.code === "deep-vault-changed" || error.code === "deep-config-changed") outcome.freshness = "stale";
      } else outcome.diagnostics.push(analyzed ? "deep-reconciliation-failed" : "deep-analysis-failed");
    }
  }

  private async reconcileSemanticAnalysis(outcome: SemanticHealthScanOutcome, signal: AbortSignal): Promise<void> {
    const { scan } = outcome;
    scan.analyzerVersions = { [SEMANTIC_DUPLICATES_ANALYZER.id]: SEMANTIC_DUPLICATES_ANALYZER.version };
    let analyzed = false;
    try {
      const port = this.options.semanticAnalysis;
      if (!port) throw new SemanticHealthAnalysisError("semantic-unavailable");
      const analysis = await withAbort(port.analyzeDuplicates(signal), signal);
      throwIfAborted(signal);
      analyzed = true;
      const counts = await this.store.reconcileBatch([{
        scope: { source: "semantic", analyzerIds: [SEMANTIC_DUPLICATES_ANALYZER.id] },
        candidates: analysis.candidates, complete: analysis.complete, seenAt: scan.startedAt,
      }], { beforeCommit: async () => {
        await withAbort(port.verifyCurrent(analysis.revision, signal), signal);
        throwIfAborted(signal);
        outcome.freshness = "verified";
      } });
      outcome.findingsCommitted = true;
      scan.findingsCreated = counts.created; scan.findingsUpdated = counts.updated; scan.findingsResolved = counts.resolved;
      scan.completedAt = counts.updatedAt;
      scan.reconciliationReceipts = counts.reconciliationReceipts;
      scan.status = analysis.complete ? "completed" : "partial";
      if (!analysis.complete) outcome.diagnostics.push("analysis-partial");
      this.lastAttempts.semantic = cloneScanRun(scan);
      this.notify();
    } catch (error) {
      this.propagateCancellation(error, signal);
      if (error instanceof SemanticHealthAnalysisError) {
        outcome.diagnostics.push(error.code);
        if (error.code === "semantic-index-changed") outcome.freshness = "stale";
      } else {
        outcome.diagnostics.push(analyzed ? "reconciliation-failed" : "semantic-analysis-failed");
      }
    }
  }

  private async reconcileAnalysis(analysis: LocalScanAnalysis, outcome: LocalHealthScanOutcome, signal: AbortSignal): Promise<void> {
    const { scan } = outcome;
    scan.notesSeen = analysis.notesSeen;
    scan.analyzerVersions = { ...analysis.analyzerVersions };
    const successful = analysis.results.filter((result) => result.successful);
    if (!successful.length) { outcome.diagnostics.push("analyzers-failed"); return; }
    try {
      const counts = await this.store.reconcileBatch(successful.map((result) => ({
        scope: { source: "local", analyzerIds: [result.analyzerId] }, candidates: result.candidates,
        complete: result.complete, seenAt: scan.startedAt,
      })), { beforeCommit: async () => {
        await verifyLocalScanFreshness(analysis.revision, this.source, signal);
        throwIfAborted(signal);
        outcome.freshness = "verified";
      } });
      outcome.findingsCommitted = true;
      scan.findingsCreated = counts.created; scan.findingsUpdated = counts.updated; scan.findingsResolved = counts.resolved;
      scan.completedAt = counts.updatedAt;
      scan.reconciliationReceipts = counts.reconciliationReceipts;
      scan.status = analysis.results.every((result) => result.successful && result.complete) ? "completed" : "partial";
      if (scan.status === "partial") outcome.diagnostics.push("analysis-partial");
      this.lastAttempts.local = cloneScanRun(scan);
      this.notify();
    } catch (error) {
      this.propagateCancellation(error, signal);
      if (error instanceof LocalHealthStaleScanError) {
        outcome.freshness = "stale"; scan.status = "partial";
        outcome.diagnostics.push("vault-changed-during-scan");
      } else if (error instanceof LocalHealthFreshnessUnavailableError) {
        outcome.freshness = "unknown";
        outcome.diagnostics.push("freshness-unavailable");
      } else { outcome.diagnostics.push("reconciliation-failed"); }
    }
  }

  private propagateCancellation(error: unknown, signal: AbortSignal): void {
    throwIfAborted(signal);
    if (isCancellation(error)) throw new LocalAnalysisCancelledError();
  }
  private requireInitialized(): HealthInitializationResult {
    if (!this.initialization) throw new HealthNotInitializedError();
    return this.initialization;
  }
  private now(): number {
    const time = this.clock();
    if (!isTimestamp(time)) throw new Error("Invalid Health service clock.");
    return time;
  }
  private notify(): void {
    for (const listener of [...this.listeners]) {
      // Subscriber exceptions must never turn a durable commit into an apparent scan failure.
      try { listener(); } catch { /* Subscribers own their error handling. */ }
    }
  }
}
