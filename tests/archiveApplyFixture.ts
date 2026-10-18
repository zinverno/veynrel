import { vi } from "vitest";
import { MarkdownView, parseYaml } from "obsidian";
import type { App, TFile, CachedMetadata } from "obsidian";
import { mergeFixture, mergeNote } from "./mergeFixture";
import { buildMergePlan } from "../consolidation/mergePlan";
import { paragraphRanges, buildChangePlan } from "../consolidation/changePlan";
import { buildMultiFilePlan } from "../consolidation/multiFilePlan";
import { OperationJournal } from "../consolidation/operationJournal";
import { MultiFileJournal } from "../consolidation/multiFileJournal";
import { MergeJournal } from "../consolidation/mergeJournal";
import { ArchiveJournal } from "../consolidation/archiveJournal";
import { SafeApplyService } from "../consolidation/safeApply";
import { obsidianSafeApplyPort } from "../consolidation/obsidianSafeApply";
import { obsidianMultiFilePort } from "../consolidation/obsidianMultiFileApply";
import { obsidianMergePort } from "../consolidation/obsidianMergeApply";
import { obsidianArchivePort } from "../consolidation/obsidianArchiveApply";
import { readArchiveBasis } from "../consolidation/obsidianArchive";
import { ArchiveSession } from "../consolidation/archiveSession";
import { archiveFragments } from "../consolidation/archivePlan";

export async function archiveApplyFixture(side: 0 | 1 = 0, prefix = "", crlf = false) {
  vi.stubGlobal("window", { setTimeout });
  const f = mergeFixture(), secondary = side === 0 ? 1 : 0;
  const cache = (path: string, text: string) => {
    const c = mergeNote(path, text).cache!;
    if (text.startsWith("---\n") || text.startsWith("---\r\n")) {
      const start = text.indexOf("\n") + 1, end = text.indexOf("---", start);
      c.sections![0].type = "yaml"; c.frontmatter = parseYaml(text.slice(start, end)) as Record<string, unknown>;
      c.frontmatterPosition = { start: { offset: 0, line: 0, col: 0 }, end: { offset: end + 3, line: text.slice(0, end).split("\n").length - 1, col: 3 } };
    }
    return c;
  };
  for (const [i, n] of f.pair.entries()) {
    let text = (i === secondary ? prefix : "") + n.content + "\nUnicode 👩🏽‍💻 é 中文.\n";
    if (crlf) text = text.replace(/\n/gu, "\r\n");
    Object.assign(n, mergeNote(n.path, text)); n.cache = cache(n.path, text);
  }
  f.analysis.pair = f.pair.map(n => ({ ...n })) as unknown as typeof f.pair;
  const plan = buildMergePlan(f.analysis, f.pair, { ...f.choice, canonical: side, insertion: paragraphRanges(f.pair[side])[0],
    transfers: [{ range: paragraphRanges(f.pair[secondary])[1], contextReviewed: true }] });
  const single = buildChangePlan(f.analysis, f.pair, { operation: "add_link", source: 0, selection: paragraphRanges(f.pair[0])[0], confirmed: true }, f.read.linktexts[1]);
  const multi = buildMultiFilePlan(f.analysis, f.pair, { operation: "add_reciprocal_links", selections: [paragraphRanges(f.pair[0])[0], paragraphRanges(f.pair[1])[0]], confirmed: [true, true] }, f.read.linktexts);
  const contents = new Map(f.pair.map(n => [n.path, n.content])), caches = new Map<TFile, CachedMetadata | null>(f.pair.map(n => [n.file, n.cache]));
  const original = new Map(contents), disk = new Map<string, string>(), folders = new Set<string>();
  const adapter = {
    exists: vi.fn(async (p: string) => disk.has(p) || folders.has(p)),
    stat: vi.fn(async (p: string) => disk.has(p) ? { type: "file", size: new TextEncoder().encode(disk.get(p)).length } : folders.has(p) ? { type: "folder", size: 0 } : null),
    read: vi.fn(async (p: string) => { if (!disk.has(p)) throw Error("missing"); return disk.get(p)!; }),
    write: vi.fn(async (p: string, data: string) => { disk.set(p, data); }),
    copy: vi.fn(async (from: string, to: string) => { if (disk.has(to)) throw Error("exists"); disk.set(to, disk.get(from)!); }),
    mkdir: vi.fn(async (p: string) => { folders.add(p); }),
    list: vi.fn(async (p: string) => ({ files: [...disk.keys()].filter(s => s.slice(0, s.lastIndexOf("/")) === p), folders: [...folders].filter(s => s.slice(0, s.lastIndexOf("/")) === p) })),
  };
  let views: unknown[] = [];
  const vault = {
    configDir: "CustomConfig",
    getFileByPath: (p: string) => f.pair.find(n => n.file.path === p && contents.has(p))?.file ?? null,
    read: vi.fn(async (file: TFile) => contents.get(file.path)!),
    process: vi.fn(async (file: TFile, cb: (s: string) => string) => {
      const content = cb(contents.get(file.path)!); contents.set(file.path, content); file.stat.mtime++; file.stat.size = new TextEncoder().encode(content).length;
      caches.set(file, cache(file.path, content)); return content;
    }), modify: vi.fn(), create: vi.fn(), delete: vi.fn(), rename: vi.fn(), adapter,
  };
  const app = { vault, workspace: { iterateAllLeaves: (fn: (view: unknown) => void) => views.forEach(fn) }, metadataCache: {
    getFileCache: (file: TFile) => caches.get(file), getFirstLinkpathDest: (p: string) => vault.getFileByPath(p + ".md"),
  } } as unknown as App;
  const journal = new OperationJournal(adapter as never, vault.configDir, "ai-knowledge-hub"), multiJournal = new MultiFileJournal(adapter as never, vault.configDir, "ai-knowledge-hub");
  const mergeJournal = new MergeJournal(adapter as never, vault.configDir, "ai-knowledge-hub"), archiveJournal = new ArchiveJournal(adapter as never, vault.configDir, "ai-knowledge-hub");
  const port = obsidianSafeApplyPort(app), native = obsidianArchivePort(app, port);
  const restart = () => new SafeApplyService(journal, port, { journal: multiJournal, port: obsidianMultiFilePort(app, port) },
    { journal: mergeJournal, port: obsidianMergePort(app, port) }, { journal: archiveJournal, port: native });
  const service = restart(), mergeReview = await service.merge!.review(plan, f.analysis, () => true); await service.merge!.execute(mergeReview);
  const session = new ArchiveSession(() => readArchiveBasis(app, service.merge!, mergeReview.id, () => true));
  await session.prepare();
  if (session.view.input) await session.build({ status: "archived", limitationsReviewed: true,
    dispositions: archiveFragments(mergeReview.record, session.view.input.notes[1]).map(fragment => ({ range: fragment.range, disposition: "retained" })) });
  vault.process.mockClear(); adapter.write.mockClear(); adapter.copy.mockClear();
  const archive = service.archive!;
  return { ...f, original, app, vault, contents, disk, folders, adapter, caches, journal, multiJournal, mergeJournal, archiveJournal, port, native,
    service, archive, restart, mergeReview, mergePlan: plan, plan: session.view.plan!, session, single, multi,
    review: () => archive.review(session.view.plan!, () => true),
    edit: (path: string, text: string) => { const file = vault.getFileByPath(path)!; contents.set(path, text); file.stat.mtime++; file.stat.size = new TextEncoder().encode(text).length; caches.set(file, cache(path, text)); },
    editor: (index: number) => { const n = f.pair[index]; views = [{ view: Object.assign(new MarkdownView({} as never), { file: n.file, getViewData: () => contents.get(n.path) }), getViewState: () => ({ state: { file: n.path } }) }]; },
  };
}
