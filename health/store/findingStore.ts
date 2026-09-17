import type { Finding, FindingCandidate } from "../domain/finding";
import { cloneCandidate, isFindingCandidate } from "../domain/findingValidation";
import { canonicalFindingPaths, findingIdFromFingerprint, isFindingId } from "../domain/identity";
import type { ScanRun } from "../domain/scanRun";
import { cloneScanRun, isScanRun } from "../domain/scanRunValidation";
import { compareStrings, isArrayOf, isIdentifier, isOneOf, isTimestamp } from "../domain/validation";
import { compareScanRuns, decodeHealth, isFindingsSnapshot, isScanRunsSnapshot, serializeHealth } from "./codec";
import { HEALTH_SCHEMA_VERSION, MAX_SCAN_HISTORY } from "./types";
import type { FindingFilter, HealthFile, HealthLoadResult, HealthLoadStatus, HealthStoragePort, ReconcileRequest, ReconcileResult } from "./types";

function matches<T extends string>(value: T, filter: T | readonly T[] | undefined): boolean {
  return filter === undefined || (typeof filter === "string" ? value === filter : filter.includes(value));
}

/** One instance per storage root. Reads return copies of the last successfully persisted state. */
export class FindingStore {
  private findings: Record<string, Finding> = {};
  private runs: ScanRun[] = [];
  private loadResult?: HealthLoadResult;
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly storage: HealthStoragePort, private readonly clock: () => number = () => Date.now()) {}

  load(): Promise<HealthLoadResult> {
    return this.enqueue(async () => {
      if (this.loadResult) return { ...this.loadResult };
      const findings = await this.read("findings.json", isFindingsSnapshot);
      const scans = await this.read("scan-runs.json", isScanRunsSnapshot);
      this.findings = findings.data?.findings ?? {};
      this.runs = scans.data?.runs.sort(compareScanRuns) ?? [];
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
    if (!request || !request.scope || !isOneOf(request.scope.source, ["local", "semantic", "deep-ai", "recall"]) ||
        !isArrayOf(request.scope.analyzerIds, isIdentifier) || request.scope.analyzerIds.length === 0 ||
        typeof request.complete !== "boolean" || !isArrayOf(request.candidates, isFindingCandidate)) {
      throw new Error("Invalid reconciliation request");
    }
    const scope = { source: request.scope.source, analyzerIds: [...request.scope.analyzerIds] };
    const candidates = request.candidates.map((candidate) => ({ ...cloneCandidate(candidate), notePaths: canonicalFindingPaths(candidate.notePaths) }));
    const complete = request.complete;
    const seenAt = request.seenAt ?? this.now();
    if (!isTimestamp(seenAt)) throw new Error("Invalid observation timestamp");
    return this.enqueue(async () => {
      this.requireWritable("findings");
      const now = this.now();
      const inScope = (finding: FindingCandidate): boolean => finding.source === scope.source && scope.analyzerIds.includes(finding.analyzerId);
      const next = { ...this.findings };
      const seen = new Set<string>();
      const result = { created: 0, updated: 0, resolved: 0 };
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
      await this.saveFindings(next);
      return result;
    });
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

  private async saveFindings(findings: Record<string, Finding>): Promise<void> {
    const snapshot = { version: HEALTH_SCHEMA_VERSION, updatedAt: this.now(), findings };
    if (!isFindingsSnapshot(snapshot)) throw new Error("Invalid findings snapshot");
    await this.storage.write("findings.json", serializeHealth(snapshot));
    this.findings = findings;
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
