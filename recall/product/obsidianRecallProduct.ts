import type { App } from "obsidian";
import { RecallService } from "../services/recallService";
import { ObsidianRecallSource } from "../source/obsidianRecallSource";
import { ObsidianRecallStorage } from "../store/obsidianRecallStorage";
import { RecallProductController } from "./recallProductController";
import { RecallRecovery } from "./recallRecovery";

/** Registration constructs no service and performs no IO. A replacement owner is made only after retry/recovery. */
export function createObsidianRecallProduct(app: App, pluginId: string, openNote: (path: string) => Promise<boolean>): RecallProductController {
  return new RecallProductController(() => new RecallService(
    new ObsidianRecallStorage(app.vault.adapter, app.vault.configDir, pluginId), new ObsidianRecallSource(app.vault)),
  new RecallRecovery(app.vault.adapter, app.vault.configDir, pluginId), openNote);
}
