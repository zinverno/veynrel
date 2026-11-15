import { vi } from "vitest";
import { TFile } from "obsidian";
import type { App, CachedMetadata } from "obsidian";
import { createSafeApplyService, obsidianSafeApplyPort } from "../consolidation/obsidianSafeApply";
import { ObsidianLocalNote } from "../consolidation/obsidianLocalNote";
import type { LocalRules } from "../consolidation/obsidianLocalNote";
import { localBytes, tagRanges } from "../consolidation/localNotePlan";
export function localNoteFixture() {
  const contents = new Map([["Source.md", "A simple paragraph.\r\n\r\n[[Missing]] and [[Missing]]\r\n"], ["Folder/Target.md", "Target.\r\n"]]);
  const files = new Map([...contents].map(([path, content]) => [path, Object.assign(new TFile(), { path, basename: path.slice(0, -3), extension: "md", stat: { ctime: 1, mtime: 2, size: localBytes(content) } })]));
  const caches = new Map<TFile, CachedMetadata>();
  const pos = (offset: number) => ({ offset, line: 0, col: offset });
  const cache = (path: string) => {
    const content = contents.get(path)!, sections: NonNullable<CachedMetadata["sections"]> = [];
    for (const m of content.matchAll(/[^\r\n]+/gu)) sections.push({ type: "paragraph", position: { start: pos(m.index!), end: pos(m.index! + m[0].length) } });
    const links = [...content.matchAll(/\[\[([^\]]+)\]\]/gu)].map(m => ({ original: m[0], link: m[1], position: { start: pos(m.index!), end: pos(m.index! + m[0].length) } }));
    caches.set(files.get(path)!, { sections, links });
  };
  for (const path of files.keys()) cache(path);
  const disk = new Map<string, string>(), folders = new Set<string>();
  const adapter = {
    exists: vi.fn(async (p: string) => disk.has(p) || folders.has(p)),
    stat: vi.fn(async (p: string) => disk.has(p) ? { type: "file", size: disk.get(p)!.length } : folders.has(p) ? { type: "folder", size: 0 } : null),
    read: vi.fn(async (p: string) => { if (!disk.has(p)) throw Error("missing"); return disk.get(p)!; }),
    write: vi.fn(async (p: string, data: string) => { disk.set(p, data); }),
    copy: vi.fn(async (from: string, to: string) => { if (disk.has(to)) throw Error("exists"); disk.set(to, disk.get(from)!); }),
    mkdir: vi.fn(async (p: string) => { folders.add(p); }),
    list: vi.fn(async (p: string) => ({ files: [...disk.keys()].filter(s => s.slice(0, s.lastIndexOf("/")) === p), folders: [...folders].filter(s => s.slice(0, s.lastIndexOf("/")) === p) })),
  };
  let views: unknown[] = [], rules: LocalRules = { profile: null, registryPath: null };
  const vault = {
    configDir: "SyntheticConfig", adapter,
    getFileByPath: (p: string) => files.get(p) ?? null,
    getMarkdownFiles: () => [...files.values()],
    read: vi.fn(async (file: TFile) => contents.get(file.path)!),
    process: vi.fn(async (file: TFile, cb: (s: string) => string) => {
      const content = cb(contents.get(file.path)!); contents.set(file.path, content); file.stat.mtime++; file.stat.size = localBytes(content); cache(file.path); return content;
    }), modify: vi.fn(), create: vi.fn(), delete: vi.fn(),
  };
  const app = { vault, workspace: { iterateAllLeaves: (fn: (view: unknown) => void) => views.forEach(fn) },
    metadataCache: { getFileCache: (file: TFile) => caches.get(file) ?? null,
      getFirstLinkpathDest: (p: string) => files.get(p + ".md") ?? null } } as unknown as App;
  const getRules = () => rules;
  const port = obsidianSafeApplyPort(app), native = new ObsidianLocalNote(app, port, getRules);
  const restart = () => createSafeApplyService(app, "ai-knowledge-hub", () => rules.registryPath ? [rules.registryPath] : [], getRules);
  const service = restart();
  const plan = async (kind: "add_inline_tag" | "repair_wikilink" = "add_inline_tag", tag = "topic/rare") => {
    const p = await native.prepare("Source.md");
    return native.plan(p, kind === "add_inline_tag" ? { kind, tag, range: tagRanges(p.source, p.metadata)[0] } :
      { kind, range: native.unresolved(p)[1], target: await native.target("Folder/Target.md") });
  };
  return { app, vault, contents, files, caches, cache, disk, folders, adapter, service, restart, native, port, plan,
    setRules: (r: LocalRules) => { rules = r; },
    editor: () => { const file = files.get("Source.md")!; views = [{ view: { file }, getViewState: () => ({ state: { file: file.path } }) }]; },
    edit: (path: string, content: string) => { contents.set(path, content); const f = files.get(path)!; f.stat.mtime++; f.stat.size = localBytes(content); cache(path); },
  };
}
