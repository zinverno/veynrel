import { MarkdownView } from "obsidian";
import type { App, FileView } from "obsidian";
import { readSavedNote } from "./savedNote";
import type { SavedNote } from "./savedNote";
import { readPlannerPair } from "./changePlannerSession";
import { buildChangePlan } from "./changePlan";
import { OperationJournal, requireSafe } from "./operationJournal";
import { SafeApplyService } from "./safeApply";
import type { SafeApplyPort } from "./safeApply";
import { MultiFileJournal } from "./multiFileJournal";
import { obsidianMultiFilePort } from "./obsidianMultiFileApply";
import { MergeJournal } from "./mergeJournal";
import { obsidianMergePort } from "./obsidianMergeApply";
import { BundleJournal } from "./bundleJournal";
import { obsidianBundlePort } from "./obsidianBundleApply";
import { ArchiveJournal } from "./archiveJournal";
import { obsidianArchivePort } from "./obsidianArchiveApply";

/** Only public APIs. No locks exist for pending editor saves: v1 requires affected views to be closed. */
export function guardSavedEditors(app: App, notes: readonly SavedNote[]): void {
  app.workspace.iterateAllLeaves(leaf => {
    const state = leaf.getViewState();
    const path = state.state?.file;
    const loadedFile = (leaf.view as Partial<FileView>).file;
    const note = notes.find(item => item.path === path || loadedFile === item.file || loadedFile?.path === item.path);
    if (!note) return;
    // Inspect the public buffer, but even an equal buffer can have a queued save. Fail closed.
    requireSafe(leaf.view instanceof MarkdownView && leaf.view.getViewData() === note.content, "editor");
    requireSafe(false, "editor");
  });
}
export function obsidianSafeApplyPort(app: App): SafeApplyPort {
  const identity = (note: SavedNote) => {
    requireSafe(app.vault.getFileByPath(note.path) === note.file && note.file.path === note.path &&
      note.file.stat.mtime === note.modified && note.file.stat.size === note.bytes, "stale");
  };
  const guard = (note: SavedNote) => { identity(note); guardSavedEditors(app, [note]); };
  return {
    async check(plan, analysis) {
      const read = await readPlannerPair(app, [analysis.pair[0].path, analysis.pair[1].path]);
      const side = plan.sourcePath === read.pair[0].path ? 0 : 1;
      const rebuilt = buildChangePlan(analysis, read.pair, { operation: plan.operation, source: side, selection: plan.selection, confirmed: true }, read.linktexts[side === 0 ? 1 : 0]);
      requireSafe(rebuilt.before === plan.before && rebuilt.after === plan.after && rebuilt.source.file === plan.source.file && rebuilt.target.file === plan.target.file &&
        JSON.stringify(rebuilt.edit) === JSON.stringify(plan.edit) && JSON.stringify(rebuilt.affectedLinks) === JSON.stringify(plan.affectedLinks), "stale");
      const check = () => {
        for (const note of read.pair) {
          identity(note);
          requireSafe(JSON.stringify(app.metadataCache.getFileCache(note.file)) === JSON.stringify(note.cache), "stale");
        }
        requireSafe(app.metadataCache.getFirstLinkpathDest(plan.targetPath.slice(0, -3), plan.sourcePath) === plan.target.file, "stale");
        guardSavedEditors(app, read.pair);
      };
      check(); return check;
    },
    async read(path) { const result = await readSavedNote(app, path); return result.state === "ready" ? result : null; },
    guard,
    async process(note, before, after, check) {
      guard(note);
      await app.vault.process(note.file, current => {
        check(); guard(note); requireSafe(current === before, "conflict"); return after;
      });
    },
  };
}
export function createSafeApplyService(app: App, pluginId: string): SafeApplyService {
  const port = obsidianSafeApplyPort(app);
  return new SafeApplyService(new OperationJournal(app.vault.adapter, app.vault.configDir, pluginId), port, {
    journal: new MultiFileJournal(app.vault.adapter, app.vault.configDir, pluginId), port: obsidianMultiFilePort(app, port),
  }, {
    journal: new MergeJournal(app.vault.adapter, app.vault.configDir, pluginId), port: obsidianMergePort(app, port),
  }, {
    journal: new ArchiveJournal(app.vault.adapter, app.vault.configDir, pluginId), port: obsidianArchivePort(app, port),
  }, {
    journal: new BundleJournal(app.vault.adapter, app.vault.configDir, pluginId), port: obsidianBundlePort(app, port),
  });
}
