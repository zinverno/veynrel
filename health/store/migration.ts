import { reconciliationIsCurrent, reconciliationOwnerKey, scanSource } from "../domain/reconciliation";
import type { ReconciliationReceipts } from "../domain/reconciliation";
import type { ScanRun } from "../domain/scanRun";
import { cloneScanRun } from "../domain/scanRunValidation";
import type { FindingsSnapshot, FindingsSnapshotV1, ScanRunsSnapshot, ScanRunsSnapshotV1 } from "./types";

/** Both files are independently committed. Only synthesize associations their receipts prove. No I/O. */
export function migrateHealthReceipts(findings?: FindingsSnapshot | FindingsSnapshotV1, history?: ScanRunsSnapshot | ScanRunsSnapshotV1): {
  reconciliationReceipts: ReconciliationReceipts; runs: ScanRun[];
} {
  const reconciliationReceipts = findings?.version === 2 ? { ...findings.reconciliationReceipts } : {};
  const runs = history?.runs.map((run): ScanRun => {
    if ("reconciliationReceipts" in run) {
      // A v2 run durably records the actual batch, including successful partial scopes.
      if (findings?.version === 1 && run.completedAt === findings.updatedAt &&
          Object.values(run.reconciliationReceipts).every((receipt) => receipt === findings.updatedAt)) {
        Object.assign(reconciliationReceipts, run.reconciliationReceipts);
      }
      return cloneScanRun(run);
    }
    const migrated: ScanRun = cloneScanRun({ ...run, reconciliationReceipts: {} });
    // Legacy partial registries do not identify which analyzers actually reconciled.
    if (run.status !== "completed" || run.completedAt === undefined) return migrated;
    const completedAt = run.completedAt;
    const expected = Object.fromEntries(Object.keys(run.analyzerVersions).map((id) =>
      [reconciliationOwnerKey(scanSource(run.type), id), completedAt]));
    if (findings?.version === 1 && run.completedAt === findings.updatedAt) {
      Object.assign(reconciliationReceipts, expected);
      migrated.reconciliationReceipts = expected;
    } else if (findings?.version === 2 && reconciliationIsCurrent(expected, reconciliationReceipts)) {
      migrated.reconciliationReceipts = expected;
    }
    return migrated;
  }) ?? [];
  return { reconciliationReceipts, runs };
}
