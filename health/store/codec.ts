import { isFinding } from "../domain/findingValidation";
import { isScanRun } from "../domain/scanRunValidation";
import { compareStrings, hasOnlyKeys, isRecord, isTimestamp } from "../domain/validation";
import { HEALTH_SCHEMA_VERSION, MAX_SCAN_HISTORY } from "./types";
import type { FindingsSnapshot, HealthLoadStatus, ScanRunsSnapshot } from "./types";
import type { ScanRun } from "../domain/scanRun";

export function isFindingsSnapshot(value: unknown): value is FindingsSnapshot {
  return isRecord(value) && hasOnlyKeys(value, ["version", "updatedAt", "findings"]) &&
    value.version === HEALTH_SCHEMA_VERSION && isTimestamp(value.updatedAt) && isRecord(value.findings) &&
    Object.entries(value.findings).every(([key, finding]) => isFinding(finding) && key === finding.id);
}

export function isScanRunsSnapshot(value: unknown): value is ScanRunsSnapshot {
  return isRecord(value) && hasOnlyKeys(value, ["version", "updatedAt", "runs"]) &&
    value.version === HEALTH_SCHEMA_VERSION && isTimestamp(value.updatedAt) && Array.isArray(value.runs) &&
    value.runs.length <= MAX_SCAN_HISTORY && Array.from(value.runs).every(isScanRun) &&
    new Set(value.runs.map((run: ScanRun) => run.id)).size === value.runs.length;
}

export function compareScanRuns(left: ScanRun, right: ScanRun): number {
  return right.startedAt - left.startedAt || compareStrings(left.id, right.id);
}

/** Sort all object keys, including evidence and analyzer versions; preserve ordered arrays. */
export function serializeHealth(value: FindingsSnapshot | ScanRunsSnapshot): string {
  return JSON.stringify(value, (_key, item: unknown) => isRecord(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item, 2) + "\n";
}

export function decodeHealth<T>(raw: string | null, validate: (value: unknown) => value is T): { status: HealthLoadStatus; data?: T } {
  if (raw === null) return { status: "missing" };
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; } catch { return { status: "invalid" }; }
  if (isRecord(value) && "version" in value && value.version !== HEALTH_SCHEMA_VERSION) return { status: "unsupported" };
  return validate(value) ? { status: "loaded", data: value } : { status: "invalid" };
}
