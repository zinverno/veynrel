import type { ScanRun, ScanRunV1 } from "./scanRun";
import { isReconciliationReceipts } from "./reconciliation";
import { hasOnlyKeys, isIdentifier, isOneOf, isRecord, isText, isTimestamp } from "./validation";

const SCAN_KEYS = ["id", "type", "startedAt", "completedAt", "notesSeen", "findingsCreated", "findingsUpdated", "findingsResolved", "analyzerVersions", "status"];

function scanFields(value: Record<string, unknown>): boolean {
  if (!isIdentifier(value.id) || !isOneOf(value.type, ["local", "semantic", "deep", "recall"]) ||
      !isOneOf(value.status, ["running", "completed", "partial", "failed"]) || !isTimestamp(value.startedAt)) return false;
  if (value.status === "running" ? value.completedAt !== undefined :
    !isTimestamp(value.completedAt) || value.completedAt < value.startedAt) return false;
  return [value.notesSeen, value.findingsCreated, value.findingsUpdated, value.findingsResolved].every(
    (count) => typeof count === "number" && Number.isSafeInteger(count) && count >= 0,
  ) && isRecord(value.analyzerVersions) && Object.entries(value.analyzerVersions).every(
    ([id, version]) => isIdentifier(id) && isText(version, 128) && version === version.trim(),
  );
}

export function isScanRunV1(value: unknown): value is ScanRunV1 {
  return isRecord(value) && hasOnlyKeys(value, SCAN_KEYS) && scanFields(value);
}

export function isScanRun(value: unknown): value is ScanRun {
  return isRecord(value) && hasOnlyKeys(value, [...SCAN_KEYS, "reconciliationReceipts"]) && scanFields(value) &&
    isReconciliationReceipts(value.reconciliationReceipts) &&
    ((value.status !== "running" && value.status !== "failed") || Object.keys(value.reconciliationReceipts).length === 0);
}

export function cloneScanRun(value: ScanRun): ScanRun {
  return { ...value, analyzerVersions: { ...value.analyzerVersions }, reconciliationReceipts: { ...value.reconciliationReceipts } };
}
