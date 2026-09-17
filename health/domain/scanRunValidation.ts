import type { ScanRun } from "./scanRun";
import { hasOnlyKeys, isIdentifier, isOneOf, isRecord, isText, isTimestamp } from "./validation";

export function isScanRun(value: unknown): value is ScanRun {
  if (!isRecord(value) || !hasOnlyKeys(value, ["id", "type", "startedAt", "completedAt", "notesSeen", "findingsCreated", "findingsUpdated", "findingsResolved", "analyzerVersions", "status"]) ||
      !isIdentifier(value.id) || !isOneOf(value.type, ["local", "semantic", "deep", "recall"]) ||
      !isOneOf(value.status, ["running", "completed", "partial", "failed"]) || !isTimestamp(value.startedAt)) return false;
  if (value.status === "running" ? value.completedAt !== undefined :
    !isTimestamp(value.completedAt) || value.completedAt < value.startedAt) return false;
  return [value.notesSeen, value.findingsCreated, value.findingsUpdated, value.findingsResolved].every(
    (count) => typeof count === "number" && Number.isSafeInteger(count) && count >= 0,
  ) && isRecord(value.analyzerVersions) && Object.entries(value.analyzerVersions).every(
    ([id, version]) => isIdentifier(id) && isText(version, 128) && version === version.trim(),
  );
}

export function cloneScanRun(value: ScanRun): ScanRun {
  return { ...value, analyzerVersions: { ...value.analyzerVersions } };
}
