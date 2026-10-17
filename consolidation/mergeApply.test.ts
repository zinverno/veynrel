import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, MarkdownView: class {}, getLanguage: () => "en", parseLinktext: (s: string) => ({ path: s.split("#")[0] }), requestUrl: vi.fn() }));
import { MarkdownView, requestUrl, TFile } from "obsidian";
import type { App, CachedMetadata } from "obsidian";
import { mergeFixture, mergeNote } from "../tests/mergeFixture";
import { buildMergePlan } from "./mergePlan";
import { buildMultiFilePlan } from "./multiFilePlan";
import { buildChangePlan, paragraphRanges } from "./changePlan";
import { OperationJournal, checksum, validateOperation } from "./operationJournal";
import { MultiFileJournal, validateMultiRecord } from "./multiFileJournal";
import { MergeJournal, mergeRecord, validateMergeRecord } from "./mergeJournal";
import { SafeApplyService } from "./safeApply";
import { obsidianSafeApplyPort } from "./obsidianSafeApply";
import { obsidianMultiFilePort } from "./obsidianMultiFileApply";
import { obsidianMergePort } from "./obsidianMergeApply";

function setup(canonical: 0 | 1 = 0, count = 1, crlf = false) {
  vi.stubGlobal("window", { setTimeout });
  const f = mergeFixture();
  if (crlf) for (const n of f.pair) Object.assign(n, mergeNote(n.path, n.content.replace(/\n/gu, "\r\n") + "\r\nUnicode: 👩🏽‍💻 é 中文.\r\nSecond line.\r\n"));
  f.analysis.pair = [{ ...f.pair[0] }, { ...f.pair[1] }];
  const secondary = canonical === 0 ? 1 : 0;
  f.choice.canonical = canonical; f.choice.insertion = paragraphRanges(f.pair[canonical])[0];
  f.choice.transfers = [paragraphRanges(f.pair[secondary])[1], ...(count > 1 ? [paragraphRanges(f.pair[secondary]).at(-1)!] : [])].map(range => ({ range, contextReviewed: true }));
  const plan = buildMergePlan(f.analysis, f.pair, f.choice);
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
    getFileByPath: (p: string) => f.pair.find(n => n.file.path === p && contents.has(p))?.file ?? null,
    read: vi.fn(async (file: TFile) => contents.get(file.path)!),
    process: vi.fn(async (file: TFile, cb: (s: string) => string) => {
      const content = cb(contents.get(file.path)!); contents.set(file.path, content); file.stat.mtime++; file.stat.size = new TextEncoder().encode(content).length;
      return content;
    }), modify: vi.fn(), create: vi.fn(), delete: vi.fn(), adapter,
  };
  const app = { vault, workspace: { iterateAllLeaves: (fn: (view: unknown) => void) => views.forEach(fn) },
    metadataCache: { getFileCache: (file: TFile) => caches.get(file), getFirstLinkpathDest: (p: string) => vault.getFileByPath(p + ".md") } } as unknown as App;
  const journal = new OperationJournal(adapter as never, ".obsidian", "ai-knowledge-hub"), multiJournal = new MultiFileJournal(adapter as never, ".obsidian", "ai-knowledge-hub");
  const port = obsidianSafeApplyPort(app), native = obsidianMultiFilePort(app, port);
  const mergeJournal = new MergeJournal(adapter as never, ".obsidian", "ai-knowledge-hub"), mergeNative = obsidianMergePort(app, port);
  const restart = () => new SafeApplyService(journal, port, { journal: multiJournal, port: native }, { journal: mergeJournal, port: mergeNative });
  const service = restart(), multi = service.multi!, merge = service.merge!;
  const review = () => merge.review(plan, f.analysis, () => current);
  const single = buildChangePlan(f.analysis, f.pair, { operation: "add_link", source: 0, selection: paragraphRanges(f.pair[0])[0], confirmed: true }, f.read.linktexts[1]);
  return { ...f, plan, single, disk, contents, folders, adapter, vault, app, journal, multiJournal, port, native, caches, service, multi, merge, mergeJournal, mergeNative, review, restart,
    cancel: () => { current = false; },
    editor: (side = 0) => { const n = f.pair[side]; views = [{ view: Object.assign(new MarkdownView({} as never), { file: n.file, getViewData: () => n.content + " unsaved" }), getViewState: () => ({ state: { file: n.path } }) }]; },
  };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const reason = (reason: string): unknown => expect.objectContaining({ reason });
async function apply(f: ReturnType<typeof setup>) { const r = await f.review(); await f.merge.execute(r); return r; }
function unchanged(f: ReturnType<typeof setup>) {
  expect(Buffer.from(f.contents.get(f.plan.secondary.path)!)).toEqual(Buffer.from(f.plan.secondary.content));
  expect(f.vault.process.mock.calls.every(([file]) => file.path === f.plan.canonical.path)).toBe(true);
  expect(f.vault.modify).not.toHaveBeenCalled(); expect(f.vault.create).not.toHaveBeenCalled(); expect(f.vault.delete).not.toHaveBeenCalled();
}
function onMark(f: ReturnType<typeof setup>, state: string, action: (p: string, data: string) => Promise<void>) {
  f.adapter.write.mockImplementation(async (p, data) => { if (p.includes("/mark-") && (JSON.parse(data) as { state: string }).state === state) await action(p, data); else f.disk.set(p, data); });
}

describe("copy-only merge executor", () => {
  it.each([0, 1] as const)("canonical %s: one and multiple literal Unicode/CRLF paragraphs, fresh consent and restart Undo", async canonical => {
    for (const count of [1, 2]) for (const crlf of [false, true]) {
      const f = setup(canonical, count, crlf), r = await f.review();
      expect(f.disk.size).toBe(0); expect(f.vault.process).not.toHaveBeenCalled();
      const process = f.vault.process.getMockImplementation()!;
      f.vault.process.mockImplementation(async (...args) => {
        const [entry] = await f.mergeJournal.entries(); expect(entry.damaged).toBe(false); expect(entry.record?.secondary.hash).toBe(await checksum(f.plan.secondary.content));
        expect([...f.disk.keys()].filter(p => p.endsWith("record.json") || p.endsWith("backup.json"))).toHaveLength(2); return process(...args);
      });
      await f.merge.execute(r); unchanged(f); expect(f.contents.get(f.plan.canonical.path)).toBe(f.plan.canonical.after);
      expect(f.vault.process).toHaveBeenCalledTimes(1); expect((await f.merge.history())[0]).toMatchObject({ state: "applied", canUndo: true });
      expect(await f.journal.entries()).toEqual([]); expect(await f.multiJournal.entries()).toEqual([]);
      await expect(f.merge.execute(r)).rejects.toEqual(reason("used"));
      const service = f.restart(), undo = await service.merge!.reviewUndo(r.id, () => true);
      expect(f.vault.process).toHaveBeenCalledTimes(1); await service.merge!.execute(undo); unchanged(f);
      expect(f.contents.get(f.plan.canonical.path)).toBe(f.plan.canonical.before); expect((await service.merge!.history())[0].state).toBe("undone");
      await expect(service.merge!.execute(undo)).rejects.toEqual(reason("used")); await expect(service.merge!.reviewUndo(r.id, () => true)).rejects.toThrow();
      await expect(f.review()).rejects.toThrow(); expect(requestUrl).not.toHaveBeenCalled();
    }
  });
  it("preserves canonical frontmatter, links and all text outside the selected insertion", async () => {
    const f = setup(), n = f.pair[0];
    Object.assign(n, mergeNote(n.path, '---\nauthor: Ada\n---\n\n' + n.content + '\n[[Source]] ![[Media]]\n'));
    n.cache!.sections![0].type = "yaml"; n.cache!.frontmatterPosition = n.cache!.sections![0].position;
    f.caches.set(n.file, n.cache); f.contents.set(n.path, n.content); f.analysis.pair = [{ ...n }, f.analysis.pair[1]];
    const plan = buildMergePlan(f.analysis, f.pair, { ...f.choice, insertion: paragraphRanges(n)[0] });
    await f.merge.execute(await f.merge.review(plan, f.analysis, () => true));
    expect(f.contents.get(n.path)).toBe(plan.canonical.after); expect(plan.canonical.after.startsWith('---\nauthor: Ada\n---\n')).toBe(true);
    expect(plan.canonical.after.endsWith('[[Source]] ![[Media]]\n')).toBe(true); unchanged(f);
  });
  it.each([0, 1])("refuses changed source %s at review, after consent and after backups", async side => {
    for (const phase of ["review", "consent", "backup"]) for (const kind of ["text", "ctime", "mtime", "size", "path", "identity", "metadata", "editor"]) {
      const f = setup(); const change = () => {
        const n = f.pair[side];
        if (kind === "text") f.contents.set(n.path, n.content + " later user text");
        if (kind === "ctime") n.file.stat.ctime++;
        if (kind === "mtime") n.file.stat.mtime++;
        if (kind === "size") n.file.stat.size++;
        if (kind === "path") n.file.path = "moved.md";
        if (kind === "identity") { n.file = Object.assign(new TFile(), n.file); f.caches.set(n.file, n.cache); }
        if (kind === "metadata") f.caches.set(n.file, { ...n.cache, headings: [] });
        if (kind === "editor") f.editor(side);
      };
      if (phase === "review") { change(); await expect(f.review()).rejects.toThrow(); }
      else {
        const r = await f.review();
        if (phase === "consent") change(); else { const copy = f.adapter.copy.getMockImplementation()!; f.adapter.copy.mockImplementationOnce(async (...args) => { await copy(...args); change(); }); }
        await expect(f.merge.execute(r)).rejects.toThrow();
      }
      expect(f.vault.process).not.toHaveBeenCalled();
      if (!(side === 1 && kind === "text")) unchanged(f);
    }
  });
  it.each(["frontmatter", "code", "link", "embed", "block", "heading", "context", "conflict"])("rebuild refuses newly protected %s regions without writes", async kind => {
    const f = setup(), r = await f.review(), n = f.pair[1], position = n.cache!.sections![1].position;
    if (kind === "frontmatter") n.cache!.frontmatterPosition = position;
    if (kind === "code") n.cache!.sections![1].type = "code";
    if (kind === "link") n.cache!.links = [{ link: "Other", original: "[[Other]]", position }];
    if (kind === "embed") n.cache!.embeds = [{ link: "Other", original: "![[Other]]", position }];
    if (kind === "block") n.cache!.sections![1].id = "id";
    if (kind === "heading") n.cache!.headings = [{ heading: "Title", level: 1, position: n.cache!.sections![0].position }];
    if (kind === "context") f.analysis.result.claims.find(c => c.id === "unique-b")!.kind = "context_b";
    if (kind === "conflict") f.analysis.result.claims[0].kind = "conflict";
    await expect(f.merge.execute(r)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled(); unchanged(f);
  });
  it.each(["first_partial", "first_complete", "copy", "readback", "first_damaged_after_copy"])("backup failure %s prevents Markdown and retains all evidence", async phase => {
    const f = setup(), r = await f.review();
    if (phase.startsWith("first_") && phase !== "first_damaged_after_copy") f.adapter.write.mockImplementationOnce(async (p, data) => { f.disk.set(p, phase === "first_partial" ? "{" : data); throw Error("crash"); });
    if (phase === "copy") f.adapter.copy.mockRejectedValueOnce(Error("copy"));
    if (phase === "readback") f.adapter.copy.mockImplementationOnce(async (_from, to) => { f.disk.set(to, "{"); });
    if (phase === "first_damaged_after_copy") f.adapter.copy.mockImplementationOnce(async (from, to) => { f.disk.set(to, f.disk.get(from)!); f.disk.set(from, "{"); });
    await expect(f.merge.execute(r)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled(); unchanged(f);
    const before = [...f.disk]; await f.restart().merge!.history(); expect([...f.disk]).toEqual(before);
  });
  it.each(["before_write", "after_write", "applied_marker", "undo_intent", "undo_write", "undone_marker"])("restart after %s infers actual canonical state, never auto-writes", async phase => {
    const f = setup(), r = await f.review();
    if (phase.startsWith("undo")) await f.merge.execute(r);
    if (phase === "before_write") f.vault.process.mockRejectedValueOnce(Error("kill"));
    if (phase === "after_write" || phase === "undo_write") {
      const fn = f.vault.process.getMockImplementation()!;
      f.vault.process.mockImplementationOnce(async (...args) => { await fn(...args); throw Error("kill"); });
    }
    if (["applied_marker", "undo_intent", "undone_marker"].includes(phase)) onMark(f, phase === "applied_marker" ? "applied" : phase === "undone_marker" ? "undone" : "undo_intent", async p => { f.disk.set(p, "{partial"); throw Error("kill"); });
    await expect(f.merge.execute(phase.startsWith("undo") ? await f.merge.reviewUndo(r.id, () => true) : r)).rejects.toThrow(); unchanged(f);
    const before = [...f.disk], count = f.vault.process.mock.calls.length, service = f.restart(), [row] = await service.merge!.history();
    expect([...f.disk]).toEqual(before); expect(f.vault.process).toHaveBeenCalledTimes(count);
    expect(row.canonicalState).toBe(["before_write", "undo_write", "undone_marker"].includes(phase) ? "before" : "after");
    if (phase === "after_write") { expect(row.canUndo).toBe(true); await service.merge!.execute(await service.merge!.reviewUndo(r.id, () => true)); expect(f.contents.get(f.plan.canonical.path)).toBe(f.plan.canonical.before); }
    if (phase.includes("marker") || phase === "undo_intent") { expect(row.damaged).toBe(true); expect(row.canUndo).toBe(false); }
    unchanged(f);
  });
  it.each([0, 1])("later edits of source %s block Undo before and after consent without overwriting user text", async side => {
    for (const phase of ["review", "consent", "intent"]) for (const text of [true, false]) {
      const f = setup(), r = await apply(f), service = f.restart();
      const change = () => { if (text) f.contents.set(f.pair[side].path, "USER TEXT"); f.pair[side].file.stat.mtime++; };
      if (phase === "review") { change(); await expect(service.merge!.reviewUndo(r.id, () => true)).rejects.toThrow(); }
      else { const undo = await service.merge!.reviewUndo(r.id, () => true); if (phase === "consent") change(); else onMark(f, "undo_intent", async (p, data) => { f.disk.set(p, data); change(); }); await expect(service.merge!.execute(undo)).rejects.toThrow(); }
      expect(f.vault.process).toHaveBeenCalledTimes(1); if (text) expect(f.contents.get(f.pair[side].path)).toBe("USER TEXT");
    }
  });
  it("compares exact before inside native process and never compensates a changed canonical", async () => {
    const f = setup(), r = await f.review(), fn = f.vault.process.getMockImplementation()!;
    f.vault.process.mockImplementationOnce(async (file, cb) => { f.contents.set(file.path, "callback user edit"); return fn(file, cb); });
    await expect(f.merge.execute(r)).rejects.toThrow(); expect(f.contents.get(f.plan.canonical.path)).toBe("callback user edit"); unchanged(f);
    expect((await f.merge.history())[0].state).toBe("conflict");
  });
  it("issued-write failure and failed read-back never mark success or modify secondary", async () => {
    const f = setup(), r = await f.review(), fn = f.vault.process.getMockImplementation()!;
    f.vault.process.mockImplementationOnce(async (...args) => { const result = await fn(...args); f.contents.set(f.plan.canonical.path, "different after IO"); return result; });
    await expect(f.merge.execute(r)).rejects.toEqual(reason("conflict")); expect((await f.mergeJournal.entries())[0].receipts).toEqual([]); unchanged(f);
  });
  it.each(["cancel", "discard", "dispose"])("%s revokes a consent ticket", async kind => {
    const f = setup(), r = await f.review(); if (kind === "cancel") f.cancel(); if (kind === "discard") f.merge.discard(r); if (kind === "dispose") f.service.dispose();
    await expect(f.merge.execute(r)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled(); unchanged(f);
  });
  it("finishes the issued write after its own event invalidates the UI", async () => {
    const f = setup(), fn = f.vault.process.getMockImplementation()!;
    f.vault.process.mockImplementationOnce(async (...args) => { const result = await fn(...args); f.cancel(); return result; });
    await apply(f); expect((await f.merge.history())[0].state).toBe("applied"); unchanged(f);
  });
});

describe("merge journal integrity and executor exclusion", () => {
  it.each(["merge-merge", "merge-single", "merge-multi", "single-merge", "multi-merge"])("one owner excludes %s competing windows", async kind => {
    const f = setup(), first = await f.review(), second = await f.review(), single = (await f.service.review(f.single, f.analysis, () => true))!;
    const mp = buildMultiFilePlan(f.analysis, f.pair, { operation: "add_reciprocal_links", selections: [paragraphRanges(f.pair[0])[0], paragraphRanges(f.pair[1])[0]], confirmed: [true, true] }, f.read.linktexts);
    const multi = await f.multi.review(mp, f.analysis, () => true);
    let release!: () => void; const gate = new Promise<void>(r => { release = r; }), fn = f.vault.process.getMockImplementation()!;
    f.vault.process.mockImplementationOnce(async (...args) => { await gate; return fn(...args); });
    const pending = kind.startsWith("single") ? f.service.apply(single) : kind.startsWith("multi") ? f.multi.execute(multi) : f.merge.execute(first);
    await vi.waitFor(() => expect(f.vault.process).toHaveBeenCalledTimes(1));
    await expect(kind.endsWith("single") ? f.service.apply(single) : kind.endsWith("multi") ? f.multi.execute(multi) : f.merge.execute(second)).rejects.toEqual(reason("busy"));
    release(); await pending;
    if (kind.startsWith("merge")) unchanged(f);
  });
  it("stable reservation survives restart, even if timestamps are restored after Undo", async () => {
    const f = setup(), r = await apply(f); await f.merge.execute(await f.merge.reviewUndo(r.id, () => true));
    f.pair[0].file.stat.mtime = f.plan.canonical.identity.modified;
    await expect(f.restart().merge!.review(f.plan, f.analysis, () => true)).rejects.toEqual(reason("used")); unchanged(f);
  });
  it.each(["single", "multi", "merge"])("%s global incident blocks Merge review, execution and Undo", async journal => {
    for (const phase of ["review", "apply", "undo_review", "undo", "undo_intent"]) {
      const f = setup(), applyTicket = phase === "review" ? null : await f.review();
      if (phase.startsWith("undo")) await f.merge.execute(applyTicket!);
      const undoTicket = ["undo", "undo_intent"].includes(phase) ? await f.merge.reviewUndo(applyTicket!.id, () => true) : null;
      const corrupt = () => {
        const root = journal === "single" ? f.journal.root : journal === "multi" ? f.multiJournal.root : f.mergeJournal.root;
        f.folders.add(root); f.disk.set(root + "/unknown.json", "{}");
      };
      if (phase === "undo_intent") onMark(f, "undo_intent", async (p, data) => { f.disk.set(p, data); corrupt(); }); else corrupt();
      await expect(phase === "review" ? f.review() : phase === "apply" ? f.merge.execute(applyTicket!) : phase === "undo_review" ? f.merge.reviewUndo(applyTicket!.id, () => true) : f.merge.execute(undoTicket!)).rejects.toThrow();
      expect(f.vault.process).toHaveBeenCalledTimes(phase.startsWith("undo") ? 1 : 0); unchanged(f);
    }
  });
  it("partial merge backup blocks the old single-file and multi-file executors on both participants", async () => {
    const f = setup(), r = await f.review(); f.adapter.copy.mockRejectedValueOnce(Error("backup")); await expect(f.merge.execute(r)).rejects.toThrow();
    await expect(f.service.review(f.single, f.analysis, () => true)).rejects.toEqual(reason("storage"));
    const mp = buildMultiFilePlan(f.analysis, f.pair, { operation: "add_reciprocal_links", selections: [paragraphRanges(f.pair[0])[0], paragraphRanges(f.pair[1])[0]], confirmed: [true, true] }, f.read.linktexts);
    await expect(f.multi.review(mp, f.analysis, () => true)).rejects.toEqual(reason("storage"));
    expect((await f.merge.history())[0]).toMatchObject({ damaged: true, scope: "local", canUndo: false }); unchanged(f);
  });
  it("intact unfinished multi-file operation blocks Merge and leaves both texts alone", async () => {
    const f = setup();
    const mp = buildMultiFilePlan(f.analysis, f.pair, { operation: "add_reciprocal_links", selections: [paragraphRanges(f.pair[0])[0], paragraphRanges(f.pair[1])[0]], confirmed: [true, true] }, f.read.linktexts);
    const m = await f.multi.review(mp, f.analysis, () => true); f.vault.process.mockRejectedValueOnce(Error("kill")); await expect(f.multi.execute(m)).rejects.toThrow();
    await expect(f.review()).rejects.toEqual(reason("storage")); unchanged(f);
  });
  it.each(["record", "backup", "both", "unknown", "folder", "receipt"])("damaged %s preserves evidence, actual content and refuses Undo", async kind => {
    const f = setup(), r = await apply(f), dir = f.mergeJournal.root + "/" + r.id;
    if (["record", "both"].includes(kind)) f.disk.set(dir + "/record.json", "{bad");
    if (["backup", "both"].includes(kind)) f.disk.set(dir + "/backup.json", "{bad");
    if (kind === "unknown") f.disk.set(dir + "/arbitrary.json", "{}");
    if (kind === "folder") f.folders.add(dir + "/unexpected");
    if (kind === "receipt") { const p = [...f.disk.keys()].find(p => p.includes("/mark-"))!; f.disk.set(p, "{torn"); }
    const original = [...f.disk], service = f.restart(); expect((await service.merge!.history())[0]).toMatchObject({ damaged: true, canUndo: false });
    await expect(service.merge!.reviewUndo(r.id, () => true)).rejects.toThrow(); expect([...f.disk]).toEqual(original); unchanged(f);
  });
  it("rejects forged records despite recomputed hashes, rejects old protocols, and keeps review authority private", async () => {
    const f = setup(), valid = await mergeRecord(f.plan);
    for (const mutate of [
      (r: typeof valid) => { r.operation = "add_link" as never; },
      (r: typeof valid) => { r.canonical.path = "../outside.md"; },
      (r: typeof valid) => { r.secondary.path = r.canonical.path; },
      (r: typeof valid) => { r.secondary.unchanged = false as never; },
      (r: typeof valid) => { r.secondary.bytes++; },
      (r: typeof valid) => { r.transfers[0].range.text = "fabricated"; },
      (r: typeof valid) => { r.insertion.confirmed = false as never; },
      (r: typeof valid) => { r.insertion.anchor.end--; },
      (r: typeof valid) => { r.insertion.edit.inserted = "REWRITTEN"; r.canonical.after = r.canonical.before.slice(0, r.insertion.edit.start) + "REWRITTEN" + r.canonical.before.slice(r.insertion.edit.end); },
      (r: typeof valid) => { Object.assign(r, { arbitrary: true }); },
    ]) {
      const r = structuredClone(valid); mutate(r); r.canonical.afterHash = await checksum(r.canonical.after); r.id = await checksum(JSON.stringify({ ...r, id: "", createdAt: 0 }));
      await expect(validateMergeRecord(r, r.id)).rejects.toThrow();
    }
    await expect(validateOperation(valid, valid.id)).rejects.toThrow(); await expect(validateMultiRecord(valid, valid.id)).rejects.toThrow();
    const review = await f.review(); review.record.canonical.after = "forged public preview"; await f.merge.execute(review);
    expect(f.contents.get(f.plan.canonical.path)).toBe(f.plan.canonical.after); unchanged(f);
  });
  it("checks incoming paths beyond the inspector's first hundred", async () => {
    const f = setup();
    const extra = Array.from({ length: 102 }, (_, i) => mergeNote(`Incoming${i}.md`, "Incoming."));
    const original = f.vault.getFileByPath;
    f.vault.getFileByPath = p => original(p) ?? extra.find(n => n.path === p)?.file ?? null;
    f.app.metadataCache.resolvedLinks = Object.fromEntries(extra.map(n => [n.path, { [f.pair[0].path]: 1 }]));
    const { readMergeIncoming } = await import("./obsidianMergeApply");
    const plan = buildMergePlan(f.analysis, f.pair, f.choice, readMergeIncoming(f.app, [f.pair[0].path, f.pair[1].path]));
    expect(plan.dependencies[0].incoming?.items).toHaveLength(102);
    const r = await f.merge.review(plan, f.analysis, () => true); delete f.app.metadataCache.resolvedLinks[extra[101].path];
    await expect(f.merge.execute(r)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled(); unchanged(f);
  });
  it.each(["apply", "undo"])("source editor opened inside %s process callback refuses the write", async action => {
    const f = setup(), r = await f.review(); if (action === "undo") await f.merge.execute(r);
    const ticket = action === "undo" ? await f.merge.reviewUndo(r.id, () => true) : r, fn = f.vault.process.getMockImplementation()!;
    f.vault.process.mockImplementationOnce(async (...args) => { f.editor(1); return fn(...args); });
    await expect(f.merge.execute(ticket)).rejects.toEqual(reason("write"));
    expect(f.contents.get(f.plan.canonical.path)).toBe(action === "undo" ? f.plan.canonical.after : f.plan.canonical.before); unchanged(f);
  });
});

describe("journal incidents during final source verification", () => {
  it.each(["apply", "undo", "review"])("%s rechecks all journal families after the final asynchronous native read", async action => {
    for (const family of ["single", "multi", "merge", "own_backup"]) {
      if (action === "review" && family === "own_backup") continue;
      const f = setup(), review = action === "review" ? null : await f.review();
      if (action === "undo") await f.merge.execute(review!);
      const ticket = action === "undo" ? await f.merge.reviewUndo(review!.id, () => true) : review;
      let calls = 0;
      const inject = () => {
        if (++calls === 2) {
          if (family === "own_backup") f.disk.set(f.mergeJournal.root + "/" + review!.id + "/backup.json", "{");
          else { const root = family === "single" ? f.journal.root : family === "multi" ? f.multiJournal.root : f.mergeJournal.root; f.folders.add(root); f.disk.set(root + "/unknown.json", "{}"); }
        }
      };
      if (action === "undo") {
        const original = f.mergeNative.undo.bind(f.mergeNative);
        vi.spyOn(f.mergeNative, "undo").mockImplementation(async (...args) => { const checked = await original(...args); inject(); return checked; });
      } else {
        const original = f.mergeNative.check.bind(f.mergeNative);
        vi.spyOn(f.mergeNative, "check").mockImplementation(async (...args) => { const checked = await original(...args); inject(); return checked; });
      }
      await expect(action === "review" ? f.review() : f.merge.execute(ticket!)).rejects.toEqual(reason("storage"));
      expect(f.vault.process).toHaveBeenCalledTimes(action === "undo" ? 1 : 0); unchanged(f);
    }
  });
});

it.each(["links", "frontmatterLinks"] as const)("re-resolves native %s at the process callback even when metadata is identical", async kind => {
  const f = setup(), n = f.pair[0], position = n.cache!.sections!.at(-1)!.position;
  if (kind === "links") n.cache!.links = [{ link: "Unresolved", original: "[label](Unresolved)", position }];
  else n.cache!.frontmatterLinks = [{ link: "Unresolved", original: "[[Unresolved]]", key: "related" }];
  const { readPlannerPair } = await import("./changePlannerSession");
  const read = await readPlannerPair(f.app, [f.pair[0].path, f.pair[1].path]);
  const plan = buildMergePlan(f.analysis, read.pair, f.choice), r = await f.merge.review(plan, f.analysis, () => true), process = f.vault.process.getMockImplementation()!;
  const resolve = f.app.metadataCache.getFirstLinkpathDest.bind(f.app.metadataCache);
  f.vault.process.mockImplementationOnce(async (...args) => { f.app.metadataCache.getFirstLinkpathDest = (p, source) => p === "Unresolved" ? f.pair[1].file : resolve(p, source); return process(...args); });
  await expect(f.merge.execute(r)).rejects.toEqual(reason("write")); expect(f.contents.get(plan.canonical.path)).toBe(plan.canonical.before); unchanged(f);
});
it("service recreation performs no startup journal IO or Markdown recovery", async () => {
  const f = setup(); await apply(f);
  for (const fn of [f.adapter.read, f.adapter.write, f.adapter.copy, f.adapter.list, f.vault.read, f.vault.process]) fn.mockClear();
  f.restart();
  for (const fn of [f.adapter.read, f.adapter.write, f.adapter.copy, f.adapter.list, f.vault.read, f.vault.process]) expect(fn).not.toHaveBeenCalled();
});

describe("read-only completed Merge Apply basis", () => {
  it("refuses canonical stat changes between initial receipt inspection and native read", async () => {
    const f = setup(), r = await apply(f), original = f.mergeNative.undo.bind(f.mergeNative);
    vi.spyOn(f.mergeNative, "undo").mockImplementationOnce(async (...args) => { f.pair[0].file.stat.mtime++; return original(...args); });
    await expect(f.merge.readApplied(r.id, () => true)).rejects.toThrow(); expect(f.vault.process).toHaveBeenCalledTimes(1); unchanged(f);
  });
  it.each(["backup", "undo_receipt"])("rejects underlying journal %s changes during provenance hashing", async fault => {
    const f = setup(), r = await apply(f), original = f.mergeNative.undo.bind(f.mergeNative);
    let armed = false;
    vi.spyOn(f.mergeNative, "undo").mockImplementationOnce(async (...args) => { const checked = await original(...args); armed = true; return checked; });
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => {
      if (armed) {
        armed = false;
        if (fault === "backup") f.disk.set(`${f.mergeJournal.root}/${r.id}/backup.json`, "{");
        else await f.mergeJournal.mark(r.record, "undo_intent", (await f.port.read(r.record.canonical.path))!);
      }
      return digest(...args);
    });
    await expect(f.merge.readApplied(r.id, () => true)).rejects.toThrow(); expect(f.vault.process).toHaveBeenCalledTimes(1); unchanged(f);
  });
  it("uses verified full journal copies after restart and never writes", async () => {
    const f = setup(), r = await apply(f), restarted = f.restart();
    for (const fn of [f.vault.process, f.vault.modify, f.adapter.write, f.adapter.copy, f.adapter.mkdir]) fn.mockClear();
    const basis = await restarted.merge!.readApplied(r.id, () => true);
    expect(basis.record).toEqual(r.record); expect(basis.notes.map(n => n.content)).toEqual([r.record.canonical.after, r.record.secondary.content]);
    for (const fn of [f.vault.process, f.vault.modify, f.adapter.write, f.adapter.copy, f.adapter.mkdir]) expect(fn).not.toHaveBeenCalled();
    f.disk.set(`${f.mergeJournal.root}/${r.id}/backup.json`, "{"); await expect(restarted.merge!.readApplied(r.id, () => true)).rejects.toThrow();
  });
  it.each(["single", "multi", "merge"])("rechecks %s journal conflict after asynchronous source verification", async family => {
    const f = setup(), r = await apply(f), before = [...f.disk], original = f.mergeNative.undo.bind(f.mergeNative);
    vi.spyOn(f.mergeNative, "undo").mockImplementationOnce(async (...args) => {
      const result = await original(...args), root = family === "single" ? f.journal.root : family === "multi" ? f.multiJournal.root : f.mergeJournal.root;
      f.folders.add(root); f.disk.set(root + "/unknown.json", "{}"); return result;
    });
    await expect(f.merge.readApplied(r.id, () => true)).rejects.toEqual(reason("storage"));
    expect(f.vault.process).toHaveBeenCalledTimes(1); expect([...f.disk].filter(([p]) => !p.endsWith("unknown.json"))).toEqual(before); unchanged(f);
  });
});
