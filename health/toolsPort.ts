import type { Finding } from "./domain/finding";
import type { WorkspaceScope } from "./workspace/vaultScope";

/** Existing workflow launchers and read-only saved-cluster availability. */
export interface VeynrelToolsPort {
  openAskVault(): void;
  openAtomization(path?: string): void;
  openLocalLink?(paths: readonly [string, string]): void;
  openStudioNote?(path: string): void;
  openSettings?(): void;
  openDeepAudit(): Promise<void>;
  generateMocs(): Promise<void>;
  savedMocClusterCount?(): Promise<number>;
  openBatchProcessing(): void;
  runLegacyVaultAudit(): Promise<void>;
  openTagTaxonomy(scope?: WorkspaceScope, findings?: readonly Finding[]): void;
  openOperationHistory(): void;
  openLocalTag?(path?: string): void;
  openLocalNoteRepair?(path: string): void;
}

export type VeynrelToolAction = Exclude<keyof VeynrelToolsPort, "savedMocClusterCount" | "openLocalTag" | "openLocalNoteRepair" | "openLocalLink" | "openStudioNote" | "openSettings">;
