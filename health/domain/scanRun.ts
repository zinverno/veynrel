export type ScanType = "local" | "semantic" | "deep" | "recall";
export type ScanStatus = "running" | "completed" | "partial" | "failed";

export interface ScanRun {
  id: string;
  type: ScanType;
  startedAt: number;
  completedAt?: number;
  notesSeen: number;
  findingsCreated: number;
  findingsUpdated: number;
  findingsResolved: number;
  analyzerVersions: Record<string, string>;
  status: ScanStatus;
}
