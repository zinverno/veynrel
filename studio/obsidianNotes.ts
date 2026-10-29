import { EditableFileView, MarkdownView } from "obsidian";
import type { App, FileView, View } from "obsidian";
import { readSavedNote } from "../consolidation/savedNote";
import { obsidianSafeApplyPort } from "../consolidation/obsidianSafeApply";
import { SafeApplyError } from "../consolidation/operationJournal";
import { ensure, notePath, STUDIO_LIMITS, StudioError } from "./recipe";
import type { StudioNotePort, StudioSource } from "./ports";

export function studioInventory(app: App): readonly string[] {
  const config = `${app.vault.configDir}/`;
  return app.vault.getMarkdownFiles().map(f => f.path).filter(p => notePath(p) && !p.startsWith(config)).sort();
}
function isReadOnlyInspector(view: View): boolean {
  // Observed core inspector types track a file without owning any editable buffer. Unknown views stay blocked.
  return ["backlink", "outgoing-link", "outline"].includes(view.getViewType()) && !(view instanceof EditableFileView) &&
    typeof (view as Partial<MarkdownView>).getViewData !== "function" && !(view as Partial<MarkdownView>).editor;
}
export function studioNotePort(app: App): StudioNotePort {
  const base = obsidianSafeApplyPort(app, isReadOnlyInspector);
  const writeGuard = (note: StudioSource) => {
    ensure(note.file.stat.ctime === note.created, "source");
    try { base.guard(note); } catch (e) { throw new StudioError(e instanceof SafeApplyError && e.reason === "editor" ? "editor" : "source"); }
  };
  return {
    async read(path) {
      if (!notePath(path) || path.startsWith(`${app.vault.configDir}/`)) return null;
      const file = app.vault.getFileByPath(path);
      // Before a model request, limit the read by stat; after Apply/Undo, larger appended notes must remain recoverable.
      if (!file || file.stat.size > (STUDIO_LIMITS.input + STUDIO_LIMITS.output + 2) * 4) return null;
      const created = file.stat.ctime, note = await readSavedNote(app, path);
      if (note.state !== "ready" || note.file !== file || file.stat.ctime !== created) return null;
      let content = note.content;
      // Native Vault.read strips UTF-8 BOM; Vault.process retains it. Recover only that proven byte difference.
      if (new TextEncoder().encode(content).length !== note.bytes) {
        try {
          const raw = await app.vault.readBinary(file);
          const exact = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(raw);
          if (raw.byteLength !== note.bytes || exact !== `\uFEFF${content}` || app.vault.getFileByPath(path) !== file ||
            file.stat.ctime !== created || file.stat.mtime !== note.modified || file.stat.size !== note.bytes) return null;
          content = exact;
        } catch { return null; }
      }
      return { ...note, content, created };
    },
    readGuard(note) {
      ensure(app.vault.getFileByPath(note.path) === note.file && note.file.path === note.path &&
        note.file.stat.ctime === note.created && note.file.stat.mtime === note.modified && note.file.stat.size === note.bytes, "source");
      try {
        app.workspace.iterateAllLeaves(leaf => {
          const path = leaf.getViewState().state?.file, file = (leaf.view as Partial<FileView>).file;
          if (path !== note.path && file !== note.file && file?.path !== note.path) return;
          if (isReadOnlyInspector(leaf.view)) return;
          // Reading tolerates queued saves only while every loaded buffer equals the fixed saved source.
          ensure(leaf.view instanceof MarkdownView && file === note.file, "read-editor");
          // Core Markdown buffers omit BOM and normalize CRLF; all other content must match exactly.
          const buffer = leaf.view.getViewData();
          ensure(buffer === note.content || buffer === note.content.replace(/^\uFEFF/u, "").replace(/\r\n/gu, "\n"), "unsaved");
        });
      } catch (e) { throw e instanceof StudioError ? e : new StudioError("read-editor"); }
    },
    writeGuard,
    async process(note, before, after, check) {
      writeGuard(note);
      await base.process(note, before, after, () => { check(); writeGuard(note); });
    },
  };
}
