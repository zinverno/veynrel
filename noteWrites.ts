import { normalizePath } from "obsidian";
import type { DataAdapter, TFile, Vault } from "obsidian";

export class NoteWriteConflictError extends Error {
  constructor() { super("The note changed while AI was running. No changes were saved; run the action again."); }
}

/** Commit AI output only if the note still has the exact input sent to the model. */
export async function replaceNoteIfUnchanged(
  vault: Pick<Vault, "process" | "getAbstractFileByPath">,
  file: TFile,
  originalPath: string,
  original: string,
  replacement: string,
): Promise<void> {
  if (file.path !== originalPath || vault.getAbstractFileByPath(originalPath) !== file) throw new NoteWriteConflictError();
  await vault.process(file, (current) => {
    if (file.path !== originalPath || vault.getAbstractFileByPath(originalPath) !== file || current !== original) {
      throw new NoteWriteConflictError();
    }
    return replacement;
  });
}

/** Preserve relative paths so equally named notes never share a backup. */
export async function backupAndReplaceNote(
  vault: Pick<Vault, "process" | "getAbstractFileByPath"> & {
    adapter: Pick<DataAdapter, "exists" | "mkdir" | "write">;
  },
  file: TFile,
  originalPath: string,
  original: string,
  replacement: string,
  backupFolder: string,
): Promise<void> {
  const backupPath = normalizePath(`${backupFolder}/${originalPath}`);
  // Hidden backups are not visible to Vault's file cache; use its adapter.
  let parent = "";
  for (const segment of backupPath.split("/").slice(0, -1)) {
    parent = parent ? `${parent}/${segment}` : segment;
    if (!(await vault.adapter.exists(parent))) await vault.adapter.mkdir(parent);
  }
  // A failed backup must stop the write, including collisions and disk errors.
  if (await vault.adapter.exists(backupPath)) throw new Error("A backup already exists; no note was changed.");
  await vault.adapter.write(backupPath, original);
  await replaceNoteIfUnchanged(vault, file, originalPath, original, replacement);
}
