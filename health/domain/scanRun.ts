import type { ReconciliationReceipts } from "./reconciliation";

export type ScanType = "local" | "semantic" | "deep" | "recall";
export type ScanStatus = "running" | "completed" | "partial" | "failed";

export interface ScanRun {
  id: string;
  type: ScanType;
  startedAt: number;
  /** Logical completion/commit time; scope receipts establish coverage association. */
  completedAt?: number;
  notesSeen: number;
  findingsCreated: number;
  findingsUpdated: number;
  findingsResolved: number;
  analyzerVersions: Record<string, string>;
  /** Only scopes that participated in this run's committed reconciliation. */
  reconciliationReceipts: ReconciliationReceipts;
  status: ScanStatus;
}

export type ScanRunV1 = Omit<ScanRun, "reconciliationReceipts">;
