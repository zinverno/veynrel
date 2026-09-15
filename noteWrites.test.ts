import { describe, expect, it, vi } from "vitest";
import type { TFile, Vault } from "obsidian";
import { backupAndReplaceNote, replaceNoteIfUnchanged } from "./noteWrites";

vi.mock("obsidian", () => ({ normalizePath: (path: string) => path }));

function fixture(path = "folder/note.md") {
  const file = { path } as TFile;
  const disk = new Map<string, string>([[path, "original"]]);
  const folders = new Set<string>();
  const adapter = {
    exists: vi.fn((key: string) => Promise.resolve(disk.has(key) || folders.has(key))),
    mkdir: vi.fn((key: string) => { folders.add(key); return Promise.resolve(); }),
    write: vi.fn((key: string, content: string) => { disk.set(key, content); return Promise.resolve(); }),
  };
  const vault = {
    adapter,
    getAbstractFileByPath: vi.fn(() => file),
    process: vi.fn<Vault["process"]>((target, transform) => Promise.resolve().then(() => {
        const next = transform(disk.get(target.path) ?? "");
        disk.set(target.path, next);
        return next;
    })),
  };
  return { file, disk, adapter, vault };
}

describe("AI note writes", () => {
  it("commits once and preserves separate backups for duplicate basenames", async () => {
    const a = fixture("a/note.md");
    const b = { path: "b/note.md" } as TFile;
    a.disk.set(b.path, "second original");
    await backupAndReplaceNote(a.vault, a.file, a.file.path, "original", "AI one", ".ai-backup-run");
    a.vault.getAbstractFileByPath.mockReturnValue(b);
    await backupAndReplaceNote(a.vault, b, b.path, "second original", "AI two", ".ai-backup-run");
    expect(a.disk.get(".ai-backup-run/a/note.md")).toBe("original");
    expect(a.disk.get(".ai-backup-run/b/note.md")).toBe("second original");
    expect(a.disk.get(a.file.path)).toBe("AI one");
    expect(a.disk.get(b.path)).toBe("AI two");
    expect(a.vault.process).toHaveBeenCalledTimes(2);
  });

  it.each(["edited", "renamed", "replaced"])("rejects a note %s during generation", async (change) => {
    const { vault, file, disk } = fixture();
    const originalPath = file.path;
    if (change === "edited") disk.set(originalPath, "human edit");
    if (change === "renamed") file.path = "moved.md";
    if (change === "replaced") vault.getAbstractFileByPath.mockReturnValue({ path: originalPath } as TFile);
    const before = new Map(disk);
    await expect(replaceNoteIfUnchanged(vault, file, originalPath, "original", "AI"))
      .rejects.toThrow("note changed");
    expect(disk).toEqual(before);
  });

  it.each(["collision", "disk error"])("does not change a note after backup %s", async (failure) => {
    const { vault, file, disk, adapter } = fixture();
    if (failure === "collision") disk.set(".ai-backup-run/folder/note.md", "older backup");
    else adapter.write.mockRejectedValueOnce(new Error("Disk full"));
    await expect(backupAndReplaceNote(vault, file, file.path, "original", "AI", ".ai-backup-run"))
      .rejects.toThrow();
    expect(vault.process).not.toHaveBeenCalled();
    expect(disk.get(file.path)).toBe("original");
    if (failure === "collision") expect(disk.get(".ai-backup-run/folder/note.md")).toBe("older backup");
  });
});
