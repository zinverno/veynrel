import { isFinding } from "../domain/findingValidation";
import { isScanRun, isScanRunV1 } from "../domain/scanRunValidation";
import { isReconciliationReceipts } from "../domain/reconciliation";
import { compareStrings, hasOnlyKeys, isRecord, isTimestamp } from "../domain/validation";
import { HEALTH_SCHEMA_VERSION, MAX_SCAN_HISTORY } from "./types";
import type { FindingsSnapshot, FindingsSnapshotV1, HealthLoadStatus, ScanRunsSnapshot, ScanRunsSnapshotV1 } from "./types";
import type { ScanRun, ScanRunV1 } from "../domain/scanRun";

function findingsFields(value: Record<string, unknown>): boolean {
  return isTimestamp(value.updatedAt) && isRecord(value.findings) &&
    Object.entries(value.findings).every(([key, finding]) => isFinding(finding) && key === finding.id);
}

export function isFindingsSnapshot(value: unknown): value is FindingsSnapshot {
  if (!isRecord(value) || !isTimestamp(value.updatedAt)) return false;
  const updatedAt = value.updatedAt;
  return hasOnlyKeys(value, ["version", "updatedAt", "reconciliationReceipts", "findings"]) &&
    value.version === HEALTH_SCHEMA_VERSION && findingsFields(value) && isReconciliationReceipts(value.reconciliationReceipts) &&
    Object.values(value.reconciliationReceipts).every((receipt) => receipt <= updatedAt);
}

export function isFindingsSnapshotV1(value: unknown): value is FindingsSnapshotV1 {
  return isRecord(value) && hasOnlyKeys(value, ["version", "updatedAt", "findings"]) && value.version === 1 && findingsFields(value);
}

function scanHistoryFields(value: Record<string, unknown>, validate: (run: unknown) => run is ScanRunV1): boolean {
  return isTimestamp(value.updatedAt) && Array.isArray(value.runs) && value.runs.length <= MAX_SCAN_HISTORY &&
    Array.from(value.runs).every(validate) && new Set(value.runs.map((run: ScanRunV1) => run.id)).size === value.runs.length;
}

export function isScanRunsSnapshot(value: unknown): value is ScanRunsSnapshot {
  return isRecord(value) && hasOnlyKeys(value, ["version", "updatedAt", "runs"]) &&
    value.version === HEALTH_SCHEMA_VERSION && scanHistoryFields(value, isScanRun);
}

export function isScanRunsSnapshotV1(value: unknown): value is ScanRunsSnapshotV1 {
  return isRecord(value) && hasOnlyKeys(value, ["version", "updatedAt", "runs"]) &&
    value.version === 1 && scanHistoryFields(value, isScanRunV1);
}

export function isSupportedFindingsSnapshot(value: unknown): value is FindingsSnapshot | FindingsSnapshotV1 {
  return isFindingsSnapshot(value) || isFindingsSnapshotV1(value);
}

export function isSupportedScanRunsSnapshot(value: unknown): value is ScanRunsSnapshot | ScanRunsSnapshotV1 {
  return isScanRunsSnapshot(value) || isScanRunsSnapshotV1(value);
}

export function compareScanRuns(left: ScanRun, right: ScanRun): number {
  return right.startedAt - left.startedAt || compareStrings(left.id, right.id);
}

/** Sort all object keys, including evidence and analyzer versions; preserve ordered arrays. */
export function serializeHealth(value: FindingsSnapshot | ScanRunsSnapshot | FindingsSnapshotV1 | ScanRunsSnapshotV1): string {
  return JSON.stringify(value, (_key, item: unknown) => isRecord(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item, 2) + "\n";
}

export function decodeHealth<T>(raw: string | null, validate: (value: unknown) => value is T): { status: HealthLoadStatus; data?: T } {
  if (raw === null) return { status: "missing" };
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; } catch { return { status: "invalid" }; }
  if (isRecord(value) && "version" in value && value.version !== 1 && value.version !== HEALTH_SCHEMA_VERSION) return { status: "unsupported" };
  return validate(value) ? { status: "loaded", data: value } : { status: "invalid" };
}
