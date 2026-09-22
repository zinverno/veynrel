import type { Finding, HealthDimension } from "../domain/finding";
import type { HealthState, AnalysisDepth } from "../domain/healthState";
import type { Recommendation } from "../domain/recommendation";
import type { ScanRun } from "../domain/scanRun";
import type { HealthLoadResult } from "../store/types";
import type { LocalVaultSource } from "../analyzers/local/localVaultSource";
import type { LocalVaultFreshnessProbe } from "../analyzers/local/localVaultRevision";

/** One configured object supplies BOTH capture methods with identical, stable scope policy. */
export interface HealthLocalVaultSource extends LocalVaultSource, LocalVaultFreshnessProbe {}

export interface HealthInitializationResult {
  status: "ready" | "degraded" | "unavailable";
  storage: HealthLoadResult;
  findingsWritable: boolean;
  historyWritable: boolean;
}

export interface DimensionHealth {
  state: HealthState;
  analysisDepth: AnalysisDepth;
  openFindings: number;
  attentionFindings: number;
  reviewFindings: number;
  analysisComplete: boolean;
}

export interface HealthSnapshot {
  dimensions: Record<HealthDimension, DimensionHealth>;
  recommendation?: Recommendation;
  openFindings: number;
  newFindings: number;
  lastLocalScan?: ScanRun;
  /** Existing backend receipt check, including partial scans. Not separately persisted. */
  lastLocalScanReconciled: boolean;
  localScanRunning: boolean;
  initialization: HealthInitializationResult;
}

export type HealthScanDiagnosticCode = "analysis-failed" | "analyzers-failed" | "analysis-partial" |
  "vault-changed-during-scan" | "freshness-unavailable" | "reconciliation-failed" | "history-not-recorded";

export interface LocalHealthScanOutcome {
  scan: ScanRun;
  freshness: "verified" | "stale" | "unknown" | "not-checked";
  findingsCommitted: boolean;
  historyRecorded: boolean;
  /** Fixed technical codes only; no exception text or note contents. */
  diagnostics: HealthScanDiagnosticCode[];
}

export interface HealthAggregationInput {
  findings: readonly Finding[];
  lastLocalScan?: ScanRun;
  /** True only for a matching durable receipt or a known in-session reconciliation. */
  reconciled: boolean;
}
