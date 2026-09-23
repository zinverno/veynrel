import type { FindingSource } from "./finding";
import { isFindingSource } from "./findingValidation";
import type { ScanType } from "./scanRun";
import { isIdentifier, isRecord, isTimestamp } from "./validation";

export type ReconciliationOwnerKey = string;
export type ReconciliationReceipts = Record<ReconciliationOwnerKey, number>;

/** Technical ownership only; analyzer identifiers cannot contain a colon. */
export function reconciliationOwnerKey(source: FindingSource, analyzerId: string): ReconciliationOwnerKey {
  if (!isFindingSource(source) || !isIdentifier(analyzerId)) throw new Error("Invalid reconciliation owner");
  return `${source}:${analyzerId}`;
}

export function parseReconciliationOwnerKey(value: unknown): { source: FindingSource; analyzerId: string } | undefined {
  if (typeof value !== "string" || value.length > 136) return undefined;
  const [source, analyzerId, extra] = value.split(":");
  return extra === undefined && isFindingSource(source) && isIdentifier(analyzerId) ? { source, analyzerId } : undefined;
}

export function isReconciliationOwnerKey(value: unknown): value is ReconciliationOwnerKey {
  return parseReconciliationOwnerKey(value) !== undefined;
}

export function isReconciliationReceipts(value: unknown): value is ReconciliationReceipts {
  return isRecord(value) && Object.entries(value).every(([key, receipt]) => isReconciliationOwnerKey(key) && isTimestamp(receipt));
}

/** Additional current owners are unrelated; an empty observation proves nothing. */
export function reconciliationIsCurrent(recorded: ReconciliationReceipts, current: ReconciliationReceipts): boolean {
  const entries = Object.entries(recorded);
  return entries.length > 0 && entries.every(([key, receipt]) => Object.prototype.hasOwnProperty.call(current, key) && current[key] === receipt);
}

export function scanSource(type: ScanType): FindingSource {
  const sources: Record<ScanType, FindingSource> = { local: "local", semantic: "semantic", deep: "deep-ai", recall: "recall" };
  return sources[type];
}
