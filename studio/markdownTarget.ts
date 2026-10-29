import { TFolder } from "obsidian";
import type { App } from "obsidian";
import { atomKey, validateAtomizationPath } from "../consolidation/atomizationPlan";
import { ensure, StudioError } from "./recipe";
import type { StudioSource } from "./ports";

export interface CreatedMarkdown { content: string; created: number; modified: number; bytes: number }
export interface MarkdownTargetPort {
  paths(): readonly string[];
  sourceLink(source: StudioSource, target: string): string;
  check(source: string, target: string): Promise<void>;
  create(source: string, target: string, content: string, guard: () => void): Promise<void>;
  read(target: string): Promise<CreatedMarkdown | null>;
  open(target: string): Promise<void>;
}
export const parentPath = (path: string): string => path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
export function suggestedTarget(source: string, occupied: readonly string[]): string {
  const stem = source.slice(0, -3), keys = new Set(occupied.map(atomKey));
  for (let i = 1; i <= 999; i++) {
    const path = `${stem} — Studio${i === 1 ? "" : ` ${i}`}.md`;
    if (!keys.has(atomKey(path))) return path;
  }
  throw new StudioError("target");
}
export function markdownTargetPort(app: App): MarkdownTargetPort {
  const sync = (source: string, target: string) => {
    try { validateAtomizationPath(target, app.vault.configDir); } catch { throw new StudioError("target"); }
    ensure(parentPath(source) === parentPath(target) && atomKey(source) !== atomKey(target), "target");
    const parent = app.vault.getAbstractFileByPath(parentPath(target) || "/");
    ensure(parent instanceof TFolder && !app.vault.getAbstractFileByPath(target), "target");
    ensure(!app.vault.getAllLoadedFiles().some(f => atomKey(f.path) === atomKey(target)), "target");
  };
  const check = async (source: string, target: string) => {
    sync(source, target);
    const parts = target.split("/");
    for (let i = 0; i < parts.length; i++) {
      const parent = parts.slice(0, i).join("/"), prefix = parts.slice(0, i + 1).join("/"), last = i === parts.length - 1;
      const list = await app.vault.adapter.list(parent);
      ensure(![...list.files, ...list.folders].some(p => atomKey(p) === atomKey(prefix) && (last || p !== prefix)), "target");
      if (!last) ensure((await app.vault.adapter.stat(prefix))?.type === "folder", "target");
    }
    ensure(!await app.vault.adapter.exists(target), "target"); sync(source, target);
  };
  return {
    paths: () => app.vault.getAllLoadedFiles().map(f => f.path),
    sourceLink(source, target) {
      ensure(!/[[\]#^|%\r\n]/u.test(source.path) && app.vault.getFileByPath(source.path) === source.file &&
        app.metadataCache.getFirstLinkpathDest(source.path, target) === source.file, "target");
      return `Source / Источник: [[${source.path}]]`;
    },
    check,
    async create(source, target, content, guard) {
      await check(source, target); guard(); sync(source, target);
      // Vault.create is create-only. This is not an OS-level exclusive-create or cross-process transaction.
      const file = await app.vault.create(target, content); ensure(file.path === target, "target");
    },
    async read(target) {
      try { validateAtomizationPath(target, app.vault.configDir); } catch { throw new StudioError("target"); }
      const file = app.vault.getFileByPath(target);
      if (!file) { ensure(!await app.vault.adapter.exists(target), "target"); return null; }
      const { ctime, mtime, size } = file.stat; ensure(size <= 80_000 * 4, "size");
      const content = await app.vault.read(file);
      ensure(app.vault.getFileByPath(target) === file && file.path === target && file.stat.ctime === ctime && file.stat.mtime === mtime && file.stat.size === size, "conflict");
      return { content, created: ctime, modified: mtime, bytes: size };
    },
    async open(target) {
      try { validateAtomizationPath(target, app.vault.configDir); } catch { throw new StudioError("target"); }
      const file = app.vault.getFileByPath(target); ensure(file, "source");
      const leaf = app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: "markdown", active: true, state: { file: file.path, mode: "source", source: true } });
      await app.workspace.revealLeaf(leaf);
    },
  };
}
