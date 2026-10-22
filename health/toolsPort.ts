/** Existing workflow launchers and read-only saved-cluster availability. */
export interface VeynrelToolsPort {
  openAskVault(): void;
  openDeepAudit(): Promise<void>;
  generateMocs(): Promise<void>;
  savedMocClusterCount?(): Promise<number>;
  openBatchProcessing(): void;
  runLegacyVaultAudit(): Promise<void>;
  openTagTaxonomy(): void;
  openOperationHistory(): void;
}

export type VeynrelToolAction = Exclude<keyof VeynrelToolsPort, "savedMocClusterCount">;
