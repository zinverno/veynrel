import { TFile } from "obsidian";
import type { App } from "obsidian";
import { isCanonicalMarkdownPath } from "../chunking/reconstructChunks";

export interface SavedNote {
  path: string;
  file: TFile;
  content: string;
  bytes: number;
  modified: number;
}

/** Selected saved Markdown only; file identity and stat must survive the read. */
export async function readSavedNote(app: App, path: string): Promise<
  ({ state: "ready" } & SavedNote) | { path: string; state: "missing" | "changed" | "error" }
> {
  if (!isCanonicalMarkdownPath(path)) return { path, state: "missing" };
  try {
    const file = app.vault.getFileByPath(path);
    if (!(file instanceof TFile) || file.path !== path) return { path, state: "missing" };
    const { mtime, size } = file.stat;
    const content = await app.vault.read(file);
    if (app.vault.getFileByPath(path) !== file || file.path !== path || file.stat.mtime !== mtime || file.stat.size !== size) {
      return { path, state: "changed" };
    }
    return { state: "ready", path, file, content, bytes: size, modified: mtime };
  } catch { return { path, state: "error" }; }
}
