import { vi } from "vitest";
import { MarkdownView } from "obsidian";
import type { App, CachedMetadata, TFile } from "obsidian";
import { groupFixture, groupNote } from "./groupFixture";
import { buildGroupPlan } from "../consolidation/groupPlan";
import { buildChangePlan, paragraphRanges } from "../consolidation/changePlan";
import { OperationJournal } from "../consolidation/operationJournal";
import { MultiFileJournal } from "../consolidation/multiFileJournal";
import { MergeJournal } from "../consolidation/mergeJournal";
import { ArchiveJournal } from "../consolidation/archiveJournal";
import { contextGroups } from "../consolidation/groupStructure";
import { GroupJournal } from "../consolidation/groupJournal";
import { obsidianGroupPort } from "../consolidation/obsidianGroupApply";
import { BundleJournal } from "../consolidation/bundleJournal";
import { SafeApplyService } from "../consolidation/safeApply";
import { obsidianSafeApplyPort } from "../consolidation/obsidianSafeApply";
import { obsidianMultiFilePort } from "../consolidation/obsidianMultiFileApply";
import { obsidianMergePort } from "../consolidation/obsidianMergeApply";
import { obsidianArchivePort } from "../consolidation/obsidianArchiveApply";
import { obsidianBundlePort } from "../consolidation/obsidianBundleApply";
export function groupApplyFixture(canonical: 0 | 1 = 0, crlf = false, level: 1 | 2 | 3 = 3, input = groupFixture(canonical, crlf ? "\r\n" : "\n")) {
  vi.stubGlobal("window", { setTimeout });
  const f = input;
  f.choice.group = contextGroups(f.pair[1-canonical]).groups[level-1].range;
  const plan = buildGroupPlan(f.analysis, f.pair, f.choice, f.read.linktexts);
  const contents = new Map(f.pair.map(n => [n.path, n.content])), caches = new Map<TFile, CachedMetadata | null>(f.pair.map(n => [n.file, n.cache]));
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
  let views: unknown[] = [], current = true;
  const vault = {
    configDir: "SyntheticConfig",
    getFileByPath: (p: string) => f.pair.find(n => n.file.path === p && contents.has(p))?.file ?? null,
    read: vi.fn(async (file: TFile) => contents.get(file.path)!),
    process: vi.fn(async (file: TFile, cb: (s: string) => string) => {
      const content = cb(contents.get(file.path)!); contents.set(file.path, content); file.stat.mtime++; file.stat.size = new TextEncoder().encode(content).length;
      caches.set(file, groupNote(file.path, content).cache); return content;
    }), modify: vi.fn(), create: vi.fn(), delete: vi.fn(), adapter,
  };
  const app = { vault, workspace: { iterateAllLeaves: (fn: (view: unknown) => void) => views.forEach(fn) },
    metadataCache: { getFileCache: (file: TFile) => caches.get(file), getFirstLinkpathDest: (p: string) => vault.getFileByPath(p + ".md") } } as unknown as App;
  const journal = new OperationJournal(adapter as never, vault.configDir, "ai-knowledge-hub"), multiJournal = new MultiFileJournal(adapter as never, vault.configDir, "ai-knowledge-hub");
  const port = obsidianSafeApplyPort(app), native = obsidianMultiFilePort(app, port);
  const mergeJournal = new MergeJournal(adapter as never, vault.configDir, "ai-knowledge-hub"), mergeNative = obsidianMergePort(app, port);
  const archiveJournal = new ArchiveJournal(adapter as never, vault.configDir, "ai-knowledge-hub");
  const bundleJournal = new BundleJournal(adapter as never, vault.configDir, "ai-knowledge-hub"), bundleNative = obsidianBundlePort(app, port);
  const groupJournal = new GroupJournal(adapter as never, vault.configDir, "ai-knowledge-hub"), groupNative = obsidianGroupPort(app, port);
  const restart = () => new SafeApplyService(journal, port, { journal: multiJournal, port: native }, { journal: mergeJournal, port: mergeNative },
    { journal: archiveJournal, port: obsidianArchivePort(app, port) }, { journal: bundleJournal, port: bundleNative }, { journal: groupJournal, port: groupNative });
  const service = restart(), multi = service.multi!, merge = service.merge!, bundle = service.bundle!, group = service.group!;
  const review = () => group.review(plan, f.analysis, () => current);
  const single = buildChangePlan(f.analysis, f.pair, { operation: "add_link", source: 0, selection: paragraphRanges(f.pair[0])[0], confirmed: true }, f.read.linktexts[1]);
  return { ...f, plan, single, group, groupJournal, groupNative, bundle, bundleJournal, bundleNative, archiveJournal, disk, contents, folders, adapter, vault, app, journal, multiJournal, port, native, caches, service, multi, merge, mergeJournal, mergeNative, review, restart,
    cancel: () => { current = false; },
    editor: (side = 0) => { const n = f.pair[side]; views = [{ view: Object.assign(new MarkdownView({} as never), { file: n.file, getViewData: () => n.content + " unsaved" }), getViewState: () => ({ state: { file: n.path } }) }]; },
  };
}
