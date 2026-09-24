/** Explicit launchers only. Workflows remain owned by the plugin and their existing modals. */
export interface VeynrelToolsPort {
  openAskVault(): void;
  openDeepAudit(): Promise<void>;
  generateMocs(): Promise<void>;
  openBatchProcessing(): void;
  runLegacyVaultAudit(): Promise<void>;
}

export type VeynrelToolAction = keyof VeynrelToolsPort;
