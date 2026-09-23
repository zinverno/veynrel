import type { Finding, HealthDimension } from "../domain/finding";
import type { HealthState, AnalysisDepth } from "../domain/healthState";
import type { Recommendation } from "../domain/recommendation";
import type { ScanRun } from "../domain/scanRun";
import type { HealthLoadResult } from "../store/types";
import type { LocalVaultSource } from "../analyzers/local/localVaultSource";
import type { LocalVaultFreshnessProbe } from "../analyzers/local/localVaultRevision";
import type { SemanticHealthErrorCode } from "../semanticHealthAnalysisPort";
import type { RecallHealthSnapshot } from "../recallHealthPort";

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
  recall?: RecallHealthSnapshot;
  recommendation?: Recommendation;
  openFindings: number;
  newFindings: number;
  lastLocalScan?: ScanRun;
  /** Matching analyzer scope receipts, including partial scans. Not separately persisted. */
  lastLocalScanReconciled: boolean;
  localScanRunning: boolean;
  lastSemanticScan?: ScanRun;
  lastSemanticScanReconciled: boolean;
  semanticScanRunning: boolean;
  initialization: HealthInitializationResult;
}

export type HealthScanDiagnosticCode = "analysis-failed" | "analyzers-failed" | "analysis-partial" |
  "vault-changed-during-scan" | "freshness-unavailable" | "reconciliation-failed" | "history-not-recorded" | SemanticHealthErrorCode;

export interface LocalHealthScanOutcome {
  scan: ScanRun;
  freshness: "verified" | "stale" | "unknown" | "not-checked";
  findingsCommitted: boolean;
  historyRecorded: boolean;
  /** Fixed technical codes only; no exception text or note contents. */
  diagnostics: HealthScanDiagnosticCode[];
}

export type SemanticHealthScanOutcome = LocalHealthScanOutcome;

export interface HealthAggregationInput {
  findings: readonly Finding[];
  recall?: RecallHealthSnapshot;
  lastLocalScan?: ScanRun;
  /** True only when the scan's nonempty scope receipts match the current store. */
  reconciled: boolean;
  lastSemanticScan?: ScanRun;
  semanticReconciled?: boolean;
}
