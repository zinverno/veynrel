import type { App } from "obsidian";
import { readSavedNote } from "../consolidation/savedNote";
import { obsidianSafeApplyPort } from "../consolidation/obsidianSafeApply";
import { SafeApplyError } from "../consolidation/operationJournal";
import { ensure, notePath, STUDIO_LIMITS, StudioError } from "./recipe";
import type { StudioNotePort, StudioSource } from "./ports";

export function studioInventory(app: App): readonly string[] {
  const config = `${app.vault.configDir}/`;
  return app.vault.getMarkdownFiles().map(f => f.path).filter(p => notePath(p) && !p.startsWith(config)).sort();
}
export function studioNotePort(app: App): StudioNotePort {
  const base = obsidianSafeApplyPort(app);
  const guard = (note: StudioSource) => {
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
      return { ...note, created };
    },
    guard,
    async process(note, before, after, check) {
      guard(note);
      await base.process(note, before, after, () => { check(); guard(note); });
    },
  };
}
