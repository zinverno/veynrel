import type { Finding } from "./domain/finding";
import type { WorkspaceScope } from "./workspace/vaultScope";

/** Existing workflow launchers and read-only saved-cluster availability. */
export interface VeynrelToolsPort {
  openAskVault(): void;
  openAtomization(): void;
  openDeepAudit(): Promise<void>;
  generateMocs(): Promise<void>;
  savedMocClusterCount?(): Promise<number>;
  openBatchProcessing(): void;
  runLegacyVaultAudit(): Promise<void>;
  openTagTaxonomy(scope?: WorkspaceScope, findings?: readonly Finding[]): void;
  openOperationHistory(): void;
  openLocalTag?(): void;
  openLocalNoteRepair?(path: string): void;
}

export type VeynrelToolAction = Exclude<keyof VeynrelToolsPort, "savedMocClusterCount" | "openLocalTag" | "openLocalNoteRepair">;
