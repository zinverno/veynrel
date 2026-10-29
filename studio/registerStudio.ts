import { Notice, TFolder } from "obsidian";
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
import { StudioOperations } from "./operations";
import { ExcalidrawAdapter } from "./diagram/adapter";
import { DiagramJournal } from "./diagram/journal";
import { DiagramWorkflow } from "./diagram/workflow";
import { StudioMarkdownCreate } from "./markdownCreate";
import { MarkdownCreateJournal } from "./markdownCreateJournal";
import { markdownTargetPort } from "./markdownTarget";

export interface StudioWorkspace { registry: RecipeRegistry; runner: RecipeRunner; writer: StudioApply; creator: StudioMarkdownCreate; diagrams: DiagramWorkflow; operations: StudioOperations; community: CommunityCatalog; installer: CommunityInstaller; inventory(): readonly string[]; folders(): readonly string[]; connection(): { provider: string; model: string; baseUrl: string } }
const studioTitle = "Veynrel Studio";
export function registerStudio(plugin: Plugin, settings: LanguageModelSettingsPort): StudioWorkspace {
  const storage = new StudioStorage(plugin.app.vault.adapter, plugin.app.vault.configDir, plugin.manifest.id);
  const operations = new StudioOperations(), notes = studioNotePort(plugin.app), writer = new StudioApply(new StudioJournal(storage), notes, operations);
  const creator = new StudioMarkdownCreate(new MarkdownCreateJournal(storage), markdownTargetPort(plugin.app), notes, operations);
  const port = { notes, inventory: () => studioInventory(plugin.app), settings, complete: callOpenRouter };
  const registry = new RecipeRegistry(storage);
  const owner: StudioWorkspace = { registry, writer, creator, operations, diagrams: new DiagramWorkflow(port, new ExcalidrawAdapter(plugin.app), new DiagramJournal(storage), operations),
    community: new CommunityCatalog(storage, communityTransport), installer: new CommunityInstaller(storage, registry), inventory: port.inventory, folders: () => plugin.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder && !f.path.split("/").some(p => p.startsWith("."))).map(f => f.path),
    connection: () => { const { provider, model, baseUrl } = settings.get(); return { provider, model, baseUrl }; },
    runner: new RecipeRunner(port, writer, creator) };
  plugin.registerView(STUDIO_VIEW_TYPE, leaf => new VeynrelStudioView(leaf, owner));
  let opening: Promise<void> | undefined;
  const open = () => opening ??= (async () => {
    const leaf = plugin.app.workspace.getLeavesOfType(STUDIO_VIEW_TYPE)[0] ?? plugin.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: STUDIO_VIEW_TYPE, active: true }); await plugin.app.workspace.revealLeaf(leaf);
  })().catch(() => { new Notice(l("Could not open Veynrel Studio", "Не удалось открыть Veynrel Studio")); }).finally(() => { opening = undefined; });
  plugin.addCommand({ id: "veynrel-open-studio", name: l("Open Veynrel Studio", "Открыть Veynrel Studio"), callback: open });
  plugin.addRibbonIcon("wand-sparkles", studioTitle, open);
  plugin.register(() => { owner.diagrams.dispose(); owner.runner.dispose(); operations.dispose(); for (const leaf of plugin.app.workspace.getLeavesOfType(STUDIO_VIEW_TYPE)) leaf.detach(); });
  return owner;
}
