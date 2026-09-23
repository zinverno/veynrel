import type { Finding, FindingCandidate } from "../domain/finding";
import { cloneCandidate, isFindingCandidate, isFindingSource } from "../domain/findingValidation";
import { canonicalFindingPaths, findingIdFromFingerprint, isFindingId } from "../domain/identity";
import type { ScanRun } from "../domain/scanRun";
import { cloneScanRun, isScanRun } from "../domain/scanRunValidation";
import { reconciliationOwnerKey } from "../domain/reconciliation";
import type { ReconciliationOwnerKey, ReconciliationReceipts } from "../domain/reconciliation";
import { compareStrings, isArrayOf, isIdentifier, isTimestamp } from "../domain/validation";
import { compareScanRuns, decodeHealth, isFindingsSnapshot, isSupportedFindingsSnapshot, isSupportedScanRunsSnapshot, serializeHealth } from "./codec";
import { migrateHealthReceipts } from "./migration";
import { HEALTH_SCHEMA_VERSION, MAX_SCAN_HISTORY } from "./types";
import type { FindingFilter, HealthFile, HealthLoadResult, HealthLoadStatus, HealthStoragePort, ReconcileRequest, ReconcileResult, BatchReconcileResult, ReconcileBatchOptions } from "./types";

function matches<T extends string>(value: T, filter: T | readonly T[] | undefined): boolean {
  return filter === undefined || (typeof filter === "string" ? value === filter : filter.includes(value));
}

/** One instance per storage root. Reads return copies of the last successfully persisted state. */
export class FindingStore {
  private findings: Record<string, Finding> = {};
  private runs: ScanRun[] = [];
  private findingsUpdatedAt?: number;
  private reconciliationReceipts: ReconciliationReceipts = {};
  private loadResult?: HealthLoadResult;
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly storage: HealthStoragePort, private readonly clock: () => number = () => Date.now()) {}

  load(): Promise<HealthLoadResult> {
    return this.enqueue(async () => {
      if (this.loadResult) return { ...this.loadResult };
      const findings = await this.read("findings.json", isSupportedFindingsSnapshot);
      const scans = await this.read("scan-runs.json", isSupportedScanRunsSnapshot);
      const migrated = migrateHealthReceipts(findings.data, scans.data);
      this.findings = findings.data?.findings ?? {};
      this.findingsUpdatedAt = findings.data?.updatedAt;
      this.reconciliationReceipts = migrated.reconciliationReceipts;
      this.runs = migrated.runs.sort(compareScanRuns);
      this.loadResult = { findings: findings.status, scanRuns: scans.status };
      return { ...this.loadResult };
    });
  }

  get(id: string): Finding | undefined {
    this.requireLoaded();
    this.validateId(id);
    const finding = this.findings[id];
    return finding ? cloneCandidate(finding) : undefined;
  }

  /** Stable order: lastSeenAt descending, then ID ascending (code-unit order, not locale). */
  list(filter: FindingFilter = {}): Finding[] {
    this.requireLoaded();
    return Object.values(this.findings).filter((finding) =>
      matches(finding.state, filter.state) && matches(finding.dimension, filter.dimension) && matches(finding.source, filter.source),
    ).sort((left, right) => right.lastSeenAt - left.lastSeenAt || compareStrings(left.id, right.id)).map(cloneCandidate);
  }

  async reconcile(request: ReconcileRequest): Promise<ReconcileResult> {
    const { created, updated, resolved } = await this.reconcileBatch([request]);
    return { created, updated, resolved };
  }

  /** Disjoint scopes, canonical order, one write; publish nothing on validation/guard/write failure. */
  async reconcileBatch(requests: readonly ReconcileRequest[], options: ReconcileBatchOptions = {}): Promise<BatchReconcileResult> {
    if (!Array.isArray(requests)) throw new Error("Invalid reconciliation batch");
    const prepared = Array.from(requests, (request: ReconcileRequest) => this.prepareReconciliation(request));
    const owners = new Set<ReconciliationOwnerKey>();
    for (const request of prepared) {
      for (const analyzerId of request.scope.analyzerIds) {
        const owner = reconciliationOwnerKey(request.scope.source, analyzerId);
        if (owners.has(owner)) throw new Error("Conflicting reconciliation scopes");
        owners.add(owner);
      }
    }
    prepared.sort((a, b) => compareStrings(a.scope.source, b.scope.source) ||
      compareStrings(JSON.stringify(a.scope.analyzerIds), JSON.stringify(b.scope.analyzerIds)));
    const beforeCommit = options.beforeCommit;
    return this.enqueue(async () => {
      this.requireWritable("findings");
      const result: BatchReconcileResult = { created: 0, updated: 0, resolved: 0, reconciliationReceipts: {} };
      if (!prepared.length) return result;
      const next = { ...this.findings };
      const now = this.now();
      for (const request of prepared) {
        const counts = this.applyReconciliation(next, request, now);
        result.created += counts.created;
        result.updated += counts.updated;
        result.resolved += counts.resolved;
      }
      await beforeCommit?.();
      result.updatedAt = await this.saveFindings(next, prepared.reduce((latest, request) => Math.max(latest, request.seenAt), 0), owners);
      result.reconciliationReceipts = Object.fromEntries([...owners].map((owner) => [owner, this.reconciliationReceipts[owner]]));
      return result;
    });
  }

  getFindingsUpdatedAt(): number | undefined {
    this.requireLoaded();
    return this.findingsUpdatedAt;
  }

  getReconciliationReceipts(): ReconciliationReceipts {
    this.requireLoaded();
    return { ...this.reconciliationReceipts };
  }

  private prepareReconciliation(request: ReconcileRequest): ReconcileRequest & { seenAt: number } {
    if (!request || !request.scope || !isFindingSource(request.scope.source) ||
        !isArrayOf(request.scope.analyzerIds, isIdentifier) || request.scope.analyzerIds.length === 0 ||
        typeof request.complete !== "boolean" || !isArrayOf(request.candidates, isFindingCandidate)) {
      throw new Error("Invalid reconciliation request");
    }
    const scope = { source: request.scope.source, analyzerIds: [...request.scope.analyzerIds] };
    const candidates = request.candidates.map((candidate) => ({ ...cloneCandidate(candidate), notePaths: canonicalFindingPaths(candidate.notePaths) }));
    const complete = request.complete;
    const seenAt = request.seenAt ?? this.now();
    if (!isTimestamp(seenAt)) throw new Error("Invalid observation timestamp");
    return { scope: { ...scope, analyzerIds: scope.analyzerIds.sort(compareStrings) }, candidates, complete, seenAt };
  }

  private applyReconciliation(next: Record<string, Finding>, request: ReconcileRequest & { seenAt: number }, now: number): ReconcileResult {
    const { scope, candidates, complete, seenAt } = request;
    const result = { created: 0, updated: 0, resolved: 0 };
    const inScope = (finding: FindingCandidate): boolean => finding.source === scope.source && scope.analyzerIds.includes(finding.analyzerId);
    const seen = new Set<string>();
    for (const finding of Object.values(next)) {
      if (inScope(finding) && finding.lastSeenAt > seenAt) throw new Error("Stale reconciliation timestamp");
    }
    for (const candidate of candidates) {
      if (!inScope(candidate)) throw new Error("Candidate outside reconciliation scope");
      const id = findingIdFromFingerprint(candidate.fingerprint);
      if (seen.has(id)) throw new Error("Duplicate candidate identity");
      seen.add(id);
      const previous = next[id];
      if (previous && (previous.fingerprint !== candidate.fingerprint || previous.source !== candidate.source ||
          previous.analyzerId !== candidate.analyzerId || previous.type !== candidate.type || previous.dimension !== candidate.dimension)) {
        throw new Error("Finding identity collision or ownership change");
      }
      const finding: Finding = { ...candidate, id, state: previous?.state ?? "open", firstSeenAt: previous?.firstSeenAt ?? seenAt, lastSeenAt: seenAt };
      if (previous?.state === "snoozed" && previous.snoozedUntil !== undefined && now < previous.snoozedUntil) {
        finding.snoozedUntil = previous.snoozedUntil;
      } else if (finding.state === "snoozed" || finding.state === "resolved") {
        finding.state = "open";
      }
      next[id] = finding;
      if (previous) result.updated++;
      else result.created++;
    }
    if (complete) {
      for (const finding of Object.values(next)) {
        // Dismissal is durable user intent. Absence resolves open AND snoozed findings.
        if (inScope(finding) && !seen.has(finding.id) && (finding.state === "open" || finding.state === "snoozed")) {
          const resolved = { ...finding, state: "resolved" as const };
          delete resolved.snoozedUntil;
          next[finding.id] = resolved;
          result.resolved++;
        }
      }
    }
    return result;
  }

  dismiss(id: string): Promise<void> {
    return this.transition(id, "dismissed");
  }

  snooze(id: string, until: number): Promise<void> {
    return this.transition(id, "snoozed", until);
  }

  reopen(id: string): Promise<void> {
    return this.transition(id, "open");
  }

  listScanRuns(): ScanRun[] {
    this.requireLoaded();
    return this.runs.map(cloneScanRun);
  }

  /** Upsert a scan record; execution and the association with reconcile results belong to callers. */
  async recordScanRun(run: ScanRun): Promise<void> {
    if (!isScanRun(run)) throw new Error("Invalid scan run");
    const copy = cloneScanRun(run);
    return this.enqueue(async () => {
      this.requireWritable("scanRuns");
      const previous = this.runs.find((item) => item.id === copy.id);
      if (previous && (previous.startedAt !== copy.startedAt || previous.type !== copy.type ||
          (previous.status !== "running" && copy.status !== previous.status) ||
          (previous.status !== "running" && (Object.keys(previous.reconciliationReceipts).length !== Object.keys(copy.reconciliationReceipts).length ||
            Object.entries(previous.reconciliationReceipts).some(([owner, receipt]) => copy.reconciliationReceipts[owner] !== receipt))) ||
          copy.notesSeen < previous.notesSeen || copy.findingsCreated < previous.findingsCreated ||
          copy.findingsUpdated < previous.findingsUpdated || copy.findingsResolved < previous.findingsResolved)) {
        throw new Error("Scan identity or progress cannot move backward");
      }
      const runs = [...this.runs.filter((item) => item.id !== copy.id), copy].sort(compareScanRuns).slice(0, MAX_SCAN_HISTORY);
      const snapshot = { version: HEALTH_SCHEMA_VERSION, updatedAt: this.now(), runs };
      await this.storage.write("scan-runs.json", serializeHealth(snapshot));
      this.runs = runs;
    });
  }

  private transition(id: string, state: "open" | "dismissed" | "snoozed", until?: number): Promise<void> {
    return this.enqueue(async () => {
      this.requireWritable("findings");
      this.validateId(id);
      const previous = this.findings[id];
      if (!previous) throw new Error("Finding not found");
      if (state === "snoozed" && (!isTimestamp(until) || until <= this.now())) throw new Error("Snooze deadline must be in the future");
      const next = { ...previous, state };
      delete next.snoozedUntil;
      if (state === "snoozed") next.snoozedUntil = until;
      await this.saveFindings({ ...this.findings, [id]: next });
    });
  }

  private async saveFindings(findings: Record<string, Finding>, observedAt = 0, owners: ReadonlySet<ReconciliationOwnerKey> = new Set()): Promise<number> {
    // The global marker advances even for lifecycle-only writes and backward clocks.
    const updatedAt = Math.max(this.now(), observedAt, (this.findingsUpdatedAt ?? -1) + 1);
    const reconciliationReceipts = { ...this.reconciliationReceipts };
    for (const owner of owners) reconciliationReceipts[owner] = updatedAt;
    const snapshot = { version: HEALTH_SCHEMA_VERSION, updatedAt, reconciliationReceipts, findings };
    if (!isFindingsSnapshot(snapshot)) throw new Error("Invalid findings snapshot");
    await this.storage.write("findings.json", serializeHealth(snapshot));
    this.findings = findings;
    this.findingsUpdatedAt = updatedAt;
    this.reconciliationReceipts = reconciliationReceipts;
    return updatedAt;
  }

  private async read<T>(file: HealthFile, validate: (value: unknown) => value is T): Promise<{ status: HealthLoadStatus; data?: T }> {
    try { return decodeHealth(await this.storage.read(file), validate); }
    catch { return { status: "unavailable" }; }
  }

  private requireLoaded(): HealthLoadResult {
    if (!this.loadResult) throw new Error("Health store is not loaded");
    return this.loadResult;
  }

  private requireWritable(file: keyof HealthLoadResult): void {
    const status = this.requireLoaded()[file];
    if (status !== "loaded" && status !== "missing") throw new Error(`Health storage is write-blocked: ${file} (${status})`);
  }

  private validateId(id: string): void {
    if (!isFindingId(id)) throw new Error("Invalid finding ID");
  }

  private now(): number {
    const time = this.clock();
    if (!isTimestamp(time)) throw new Error("Invalid health clock");
    return time;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}
