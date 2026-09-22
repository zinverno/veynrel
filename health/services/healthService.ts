import type { Finding } from "../domain/finding";
import { DEFAULT_VAULT_PROFILE } from "../domain/profile";
import type { VaultProfile } from "../domain/profile";
import type { ScanRun } from "../domain/scanRun";
import { cloneScanRun } from "../domain/scanRunValidation";
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
import type { HealthInitializationResult, HealthLocalVaultSource, HealthSnapshot, LocalHealthScanOutcome } from "./types";

export class HealthNotInitializedError extends Error {
  constructor() { super("Health is not initialized."); this.name = "HealthNotInitializedError"; }
}
export class HealthStorageUnavailableError extends Error {
  constructor() { super("Health findings storage requires recovery before scanning."); this.name = "HealthStorageUnavailableError"; }
}
export class LocalHealthScanAlreadyRunningError extends Error {
  constructor() { super("A local Health scan is already running."); this.name = "LocalHealthScanAlreadyRunningError"; }
}

export interface HealthServiceOptions {
  clock?: () => number;
  scanIdFactory?: () => string;
  analyzers?: readonly HealthAnalyzer<LocalAnalysisContext>[];
}

const writable = (status: HealthLoadStatus): boolean => status === "loaded" || status === "missing";

/** One service owns one store and one source/probe scope. Never construct a store per scan. */
export class HealthService {
  private readonly coordinator: LocalScanCoordinator;
  private readonly clock: () => number;
  private readonly scanIdFactory: () => string;
  private initialization?: HealthInitializationResult;
  private initializing?: Promise<HealthInitializationResult>;
  private running = false;
  private readonly listeners = new Set<() => void>();
  private lastAttempt?: { scan: ScanRun; reconciled: boolean };
  private lastObservation = -1;

  constructor(private readonly store: FindingStore, private readonly source: HealthLocalVaultSource, options: HealthServiceOptions = {}) {
    this.coordinator = new LocalScanCoordinator(source, options.analyzers);
    this.clock = options.clock ?? (() => Date.now());
    this.scanIdFactory = options.scanIdFactory ?? (() => `local-${crypto.randomUUID()}`);
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

  isLocalScanRunning(): boolean { return this.running; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  getSnapshot(profile: VaultProfile = DEFAULT_VAULT_PROFILE): HealthSnapshot {
    const initialization = this.requireInitialized();
    const findings = this.store.list();
    const scan = this.lastAttempt?.scan ?? this.store.listScanRuns().find((run) => run.type === "local");
    const reconciled = this.lastAttempt?.reconciled ?? (scan !== undefined &&
      (scan.status === "completed" || scan.status === "partial") && scan.completedAt === this.store.getFindingsUpdatedAt());
    return { ...aggregateHealth({ findings, lastLocalScan: scan, reconciled }), recommendation: selectRecommendation(findings, profile),
      lastLocalScan: scan ? cloneScanRun(scan) : undefined, lastLocalScanReconciled: reconciled, localScanRunning: this.running,
      initialization: { ...initialization, storage: { ...initialization.storage } },
    };
  }

  listFindings(filter?: FindingFilter): Finding[] { this.requireInitialized(); return this.store.list(filter); }
  getFinding(id: string): Finding | undefined { this.requireInitialized(); return this.store.get(id); }
  async dismissFinding(id: string): Promise<void> { this.requireInitialized(); await this.store.dismiss(id); this.notify(); }
  async snoozeFinding(id: string, until: number): Promise<void> { this.requireInitialized(); await this.store.snooze(id, until); this.notify(); }
  async reopenFinding(id: string): Promise<void> { this.requireInitialized(); await this.store.reopen(id); this.notify(); }

  async runLocalScan(signal: AbortSignal): Promise<LocalHealthScanOutcome> {
    const initialization = this.requireInitialized();
    if (this.running) throw new LocalHealthScanAlreadyRunningError();
    throwIfAborted(signal);
    if (!initialization.findingsWritable) throw new HealthStorageUnavailableError();
    const id = this.scanIdFactory();
    if (!isIdentifier(id) || this.store.listScanRuns().some((run) => run.id === id) || this.lastAttempt?.scan.id === id) {
      throw new Error("Invalid or duplicate local scan identifier.");
    }
    // Avoid ambiguous 'new' counts when the clock repeats or moves backward.
    const startedAt = Math.max(this.now(), this.lastObservation + 1, (this.store.getFindingsUpdatedAt() ?? -1) + 1,
      this.store.listScanRuns().reduce((latest, run) => Math.max(latest, run.startedAt + 1), 0));
    if (!isTimestamp(startedAt)) throw new Error("Invalid local scan observation time.");
    this.lastObservation = startedAt;
    const scan: ScanRun = { id, type: "local", startedAt, notesSeen: 0, findingsCreated: 0, findingsUpdated: 0, findingsResolved: 0,
      analyzerVersions: {}, status: "failed" };
    const outcome: LocalHealthScanOutcome = { scan, freshness: "not-checked", findingsCommitted: false, historyRecorded: false, diagnostics: [] };
    this.running = true;
    this.notify();
    try {
      let analysis: LocalScanAnalysis | undefined;
      try {
        analysis = await withAbort(this.coordinator.analyze(signal), signal);
        throwIfAborted(signal);
      } catch (error) {
        this.propagateCancellation(error, signal);
        outcome.diagnostics.push("analysis-failed");
      }
      if (analysis) await this.reconcileAnalysis(analysis, outcome, signal);
      // Once findings are committed, finish recording truth even if cancellation arrives late.
      if (!outcome.findingsCommitted) throwIfAborted(signal);
      scan.completedAt ??= Math.max(startedAt, this.now());
      this.lastAttempt = { scan: cloneScanRun(scan), reconciled: outcome.findingsCommitted };
      try {
        await this.store.recordScanRun(scan);
        outcome.historyRecorded = true;
        this.notify();
      } catch {
        outcome.diagnostics.push("history-not-recorded");
      }
      return outcome;
    } finally {
      this.running = false;
      this.notify();
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
      scan.status = analysis.results.every((result) => result.successful && result.complete) ? "completed" : "partial";
      if (scan.status === "partial") outcome.diagnostics.push("analysis-partial");
      this.lastAttempt = { scan: cloneScanRun(scan), reconciled: true };
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
