import type { App, TAbstractFile } from "obsidian";
import { defaultLocalVaultScope } from "../analyzers/local/localVaultSource";
import { ObsidianLocalVaultSource } from "../analyzers/local/obsidianLocalVaultSource";
import { VaultTopologyController } from "./vaultTopologyController";

export function createObsidianVaultTopology(app: App): VaultTopologyController {
  const scope = defaultLocalVaultScope(app.vault.configDir);
  const relevant = (path: string): boolean => /\.md$/iu.test(path) && scope.includes(path);
  const changed = (file: TAbstractFile): void => { if (relevant(file.path)) controller.markStale(); };
  const vaultEvents = [app.vault.on("create", changed), app.vault.on("modify", changed), app.vault.on("delete", changed),
    app.vault.on("rename", (file, oldPath) => { if (relevant(oldPath) || relevant(file.path)) controller.markStale(); })];
  const metadataEvents = [app.metadataCache.on("changed", changed),
    // Resolution may change another note's incoming edges without modifying that note.
    app.metadataCache.on("resolved", () => controller.markStale())];
  const controller = new VaultTopologyController(new ObsidianLocalVaultSource(app), () => {
    for (const event of vaultEvents) app.vault.offref(event);
    for (const event of metadataEvents) app.metadataCache.offref(event);
  });
  return controller;
}
