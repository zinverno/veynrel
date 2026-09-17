import type { Finding, FindingCandidate, FindingSource, FindingState, HealthDimension } from "../domain/finding";
import type { ScanRun } from "../domain/scanRun";

export const HEALTH_SCHEMA_VERSION = 1 as const;
export const MAX_SCAN_HISTORY = 50;
export type HealthFile = "findings.json" | "scan-runs.json";

/** Null means missing; read failures must throw. One store owns each storage root. */
export interface HealthStoragePort {
  read(file: HealthFile): Promise<string | null>;
  write(file: HealthFile, contents: string): Promise<void>;
}

export interface FindingsSnapshot {
  version: typeof HEALTH_SCHEMA_VERSION;
  updatedAt: number;
  findings: Record<string, Finding>;
}

export interface ScanRunsSnapshot {
  version: typeof HEALTH_SCHEMA_VERSION;
  updatedAt: number;
  runs: ScanRun[];
}

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

export interface FindingFilter {
  state?: FindingState | readonly FindingState[];
  dimension?: HealthDimension | readonly HealthDimension[];
  source?: FindingSource | readonly FindingSource[];
}
