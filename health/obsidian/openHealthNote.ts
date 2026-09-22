import { TFile } from "obsidian";
import type { App } from "obsidian";
import { isVaultPath } from "../domain/validation";
import { defaultLocalVaultScope } from "../analyzers/local/localVaultSource";

export function resolveHealthNote(app: App, path: string | undefined): TFile | undefined {
  if (!isVaultPath(path) || !defaultLocalVaultScope(app.vault.configDir).includes(path)) return undefined;
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile && file.extension.toLowerCase() === "md" ? file : undefined;
}

/** Navigation only. Resolve again at click time; never dispatch persisted FindingAction kinds. */
export async function openHealthNote(app: App, path: string | undefined): Promise<boolean> {
  try {
    const file = resolveHealthNote(app, path);
    if (!file) return false;
    await app.workspace.getLeaf("tab").openFile(file);
    return true;
  } catch { return false; }
}
