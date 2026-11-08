import type { App, MarkdownView } from "obsidian";
import { RecallService } from "../services/recallService";
import { ObsidianRecallSource } from "../source/obsidianRecallSource";
import { ObsidianRecallStorage } from "../store/obsidianRecallStorage";
import { RecallProductController } from "./recallProductController";
import { RecallRecovery } from "./recallRecovery";

/** Registration constructs no service and performs no IO. A replacement owner is made only after retry/recovery. */
export function createObsidianRecallProduct(app: App, pluginId: string, openNote: (path: string) => Promise<boolean>, parseYaml?: (yaml: string) => unknown): RecallProductController {
  const product = new RecallProductController(() => new RecallService(
    new ObsidianRecallStorage(app.vault.adapter, app.vault.configDir, pluginId), new ObsidianRecallSource(app.vault, (path, content) => app.workspace.getLeavesOfType("markdown").every(leaf =>
      leaf.view.getViewType() !== "markdown" || (leaf.view as MarkdownView).file?.path !== path || (leaf.view as MarkdownView).editor.getValue() === content), parseYaml)),
  new RecallRecovery(app.vault.adapter, app.vault.configDir, pluginId), openNote);
  const timers = new Map<string, number>();
  const changed = (path: string) => {
    // Only a previously opened Recall owner observes edits; no vault scan or model work.
    if (product.getSnapshot().loadState !== "ready") return;
    product.sourceChanged(path);
    window.clearTimeout(timers.get(path));
    timers.set(path, window.setTimeout(() => { timers.delete(path); void product.refreshNote(path); }, 350));
  };
  const refs = [app.vault.on("create", file => { if (file.path.endsWith(".md")) changed(file.path); }), app.vault.on("modify", file => { if (file.path.endsWith(".md")) changed(file.path); }),
    app.vault.on("delete", file => { if (file.path.endsWith(".md")) changed(file.path); }),
    app.vault.on("rename", (file, oldPath) => { if (file.path.endsWith(".md") && oldPath.endsWith(".md")) {
      window.clearTimeout(timers.get(oldPath)); timers.delete(oldPath); void product.renameNote(oldPath, file.path).then(() => changed(file.path));
    } })];
  const editor = app.workspace.on("editor-change", (_editor, info) => { if (info.file) product.sourceChanged(info.file.path); });
  product.addCleanup(() => { refs.forEach(ref => app.vault.offref(ref)); app.workspace.offref(editor); timers.forEach(timer => window.clearTimeout(timer)); });
  return product;
}
