import { Notice } from "obsidian";
import type { Plugin } from "obsidian";
import { callOpenRouter } from "../api";
import type { LanguageModelSettingsPort } from "../deep/product/languageModelSettingsPort";
import { StudioStorage } from "./storage";
import { RecipeRegistry } from "./registry";
import { RecipeRunner } from "./runner";
import { StudioApply } from "./apply";
import { StudioJournal } from "./journal";
import { studioInventory, studioNotePort } from "./obsidianNotes";
import { STUDIO_VIEW_TYPE, VeynrelStudioView } from "./view";
import { l } from "./messages";
import { CommunityCatalog } from "./community/catalog";
import { CommunityInstaller } from "./community/install";
import { communityTransport } from "./community/transport";

export interface StudioWorkspace { registry: RecipeRegistry; runner: RecipeRunner; writer: StudioApply; community: CommunityCatalog; installer: CommunityInstaller; inventory(): readonly string[] }
const studioTitle = "Veynrel Studio";
export function registerStudio(plugin: Plugin, settings: LanguageModelSettingsPort): StudioWorkspace {
  const storage = new StudioStorage(plugin.app.vault.adapter, plugin.app.vault.configDir, plugin.manifest.id);
  const notes = studioNotePort(plugin.app), writer = new StudioApply(new StudioJournal(storage), notes);
  const registry = new RecipeRegistry(storage);
  const owner: StudioWorkspace = { registry, writer, community: new CommunityCatalog(storage, communityTransport), installer: new CommunityInstaller(storage, registry), inventory: () => studioInventory(plugin.app),
    runner: new RecipeRunner({ notes, inventory: () => studioInventory(plugin.app), settings, complete: callOpenRouter }, writer) };
  plugin.registerView(STUDIO_VIEW_TYPE, leaf => new VeynrelStudioView(leaf, owner));
  let opening: Promise<void> | undefined;
  const open = () => opening ??= (async () => {
    const leaf = plugin.app.workspace.getLeavesOfType(STUDIO_VIEW_TYPE)[0] ?? plugin.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: STUDIO_VIEW_TYPE, active: true }); await plugin.app.workspace.revealLeaf(leaf);
  })().catch(() => { new Notice(l("Could not open Veynrel Studio", "Не удалось открыть Veynrel Studio")); }).finally(() => { opening = undefined; });
  plugin.addCommand({ id: "veynrel-open-studio", name: l("Open Veynrel Studio", "Открыть Veynrel Studio"), callback: open });
  plugin.addRibbonIcon("wand-sparkles", studioTitle, open);
  plugin.register(() => { owner.runner.dispose(); for (const leaf of plugin.app.workspace.getLeavesOfType(STUDIO_VIEW_TYPE)) leaf.detach(); });
  return owner;
}
