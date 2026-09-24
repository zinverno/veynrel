import type { CompanionSettings } from "../../companionSync/types";

/** Internal configuration identity; never included in product snapshots or evidence. */
export function companionConfigurationSignature(settings: CompanionSettings): string {
  return JSON.stringify([settings.enabled, settings.endpoint, settings.token, settings.timeoutMs, settings.vaultId]);
}

/** Uses AIHubSettings.companion and the plugin's existing serialized save queue. */
export type CompanionSettingsUpdate = Pick<CompanionSettings, "enabled"> & Partial<Pick<CompanionSettings, "endpoint" | "token">>;

export interface CompanionSettingsPort {
  get(): CompanionSettings;
  update(next: CompanionSettingsUpdate, expected?: CompanionSettings): Promise<CompanionSettings>;
  subscribe(listener: () => void): () => void;
}
