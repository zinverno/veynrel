import type { Finding, FindingCandidate, FindingSource, FindingState, HealthDimension } from "../domain/finding";
import type { ScanRun, ScanRunV1 } from "../domain/scanRun";
import type { ReconciliationReceipts } from "../domain/reconciliation";

export const HEALTH_SCHEMA_VERSION = 2 as const;
export const MAX_SCAN_HISTORY = 50;
export type HealthFile = "findings.json" | "scan-runs.json";

/** Null means missing; read failures must throw. One store owns each storage root. */
export interface HealthStoragePort {
  read(file: HealthFile): Promise<string | null>;
  write(file: HealthFile, contents: string): Promise<void>;
}

export interface FindingsSnapshot {
  version: typeof HEALTH_SCHEMA_VERSION;
  /** Latest durable file write, including user lifecycle transitions. */
  updatedAt: number;
  reconciliationReceipts: ReconciliationReceipts;
  findings: Record<string, Finding>;
}

export interface ScanRunsSnapshot {
  version: typeof HEALTH_SCHEMA_VERSION;
  updatedAt: number;
  runs: ScanRun[];
}

export type FindingsSnapshotV1 = Omit<FindingsSnapshot, "version" | "reconciliationReceipts"> & { version: 1 };
export type ScanRunsSnapshotV1 = Omit<ScanRunsSnapshot, "version" | "runs"> & { version: 1; runs: ScanRunV1[] };

export type HealthLoadStatus = "loaded" | "missing" | "invalid" | "unsupported" | "unavailable";
export interface HealthLoadResult {
  findings: HealthLoadStatus;
  scanRuns: HealthLoadStatus;
}

export interface ReconciliationScope {
  source: FindingSource;
  analyzerIds: readonly string[];
}

export interface ReconcileRequest {
  scope: ReconciliationScope;
  candidates: readonly FindingCandidate[];
  /** True only for successful, complete coverage of all paths for every selected analyzer. */
  complete: boolean;
  seenAt?: number;
}

export interface ReconcileResult {
  created: number;
  updated: number;
  resolved: number;
}

export interface BatchReconcileResult extends ReconcileResult {
  /** Global write marker, present only when a findings write committed. */
  updatedAt?: number;
  /** Actual committed owners only; empty when no write occurred. */
  reconciliationReceipts: ReconciliationReceipts;
}

export interface ReconcileBatchOptions {
  /** Runs inside the write queue after validation. Must not enqueue store mutations. */
  beforeCommit?: () => Promise<void>;
}

export interface FindingFilter {
  state?: FindingState | readonly FindingState[];
  dimension?: HealthDimension | readonly HealthDimension[];
  source?: FindingSource | readonly FindingSource[];
}
