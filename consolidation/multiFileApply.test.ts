import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, MarkdownView: class {}, getLanguage: () => "en", parseLinktext: (s: string) => ({ path: s.split("#")[0] }), requestUrl: vi.fn() }));
import { MarkdownView, requestUrl } from "obsidian";
import type { App, TFile, CachedMetadata } from "obsidian";
import { multiFileFixture } from "../tests/multiFileFixture";
import { buildMultiFilePlan } from "./multiFilePlan";
import { buildChangePlan } from "./changePlan";
import { OperationJournal, checksum } from "./operationJournal";
import { MultiFileJournal, multiRecord, validateMultiRecord } from "./multiFileJournal";
import { SafeApplyService } from "./safeApply";
import { obsidianSafeApplyPort } from "./obsidianSafeApply";
import { obsidianMultiFilePort } from "./obsidianMultiFileApply";

function setup() {
  vi.stubGlobal("window", { setTimeout });
  const f = multiFileFixture(), plan = buildMultiFilePlan(f.analysis, f.pair, f.choice, f.read.linktexts);
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
  const restart = () => new SafeApplyService(journal, port, { journal: multiJournal, port: native });
  const service = restart(), multi = service.multi!;
  const review = () => multi.review(plan, f.analysis, () => current);
  const single = buildChangePlan(f.analysis, f.pair, { operation: "add_link", source: 0, selection: f.choice.selections[0], confirmed: true }, f.read.linktexts[1]);
  return { ...f, plan, single, disk, contents, folders, adapter, vault, app, journal, multiJournal, port, native, caches, service, multi, review, restart,
    cancel: () => { current = false; },
    editor: (side = 0) => { const n = f.pair[side]; views = [{ view: Object.assign(new MarkdownView({} as never), { file: n.file, getViewData: () => n.content + " unsaved" }), getViewState: () => ({ state: { file: n.path } }) }]; },
  };
}
afterEach(() => vi.unstubAllGlobals());
const reason = (reason: string): unknown => expect.objectContaining({ reason });
async function apply(f: ReturnType<typeof setup>): Promise<import("./multiFileApply").MultiReview> { const r = await f.review(); await f.multi.execute(r); return r; }
function onMark(f: ReturnType<typeof setup>, name: string, action: (path: string, data: string) => Promise<void>) {
  f.adapter.write.mockImplementation(async (path, data) => { if (path.includes("/mark-") && (JSON.parse(data) as { state: string }).state === name) await action(path, data); else f.disk.set(path, data); });
}

describe("shared two-file executor", () => {
  it("requires consent, backs up both notes before process, applies once and undoes after restart", async () => {
    const f = setup(), r = await f.review(); expect(f.disk.size).toBe(0); expect(f.vault.process).not.toHaveBeenCalled();
    const process = f.vault.process.getMockImplementation()!;
    f.vault.process.mockImplementation(async (...args) => { const e = (await f.multiJournal.entries())[0]; expect(e.damaged).toBe(false); expect(e.record?.files).toHaveLength(2); return process(...args); });
    await f.multi.execute(r); expect(f.plan.files.map(n => f.contents.get(n.path))).toEqual(f.plan.files.map(n => n.after));
    expect((await f.journal.entries())).toEqual([]); expect((await f.multi.history())[0]).toMatchObject({ state: "applied", action: "undo", participants: ["after", "after"] });
    expect(f.vault.process).toHaveBeenCalledTimes(2); await expect(f.multi.execute(r)).rejects.toEqual(reason("used"));
    const entry = (await f.multiJournal.entries())[0]; expect(JSON.stringify(entry.record)).not.toMatch(/provider|model|apiKey/);
    const service = f.restart(), undo = await service.multi!.reviewUndo(r.id, () => true); await service.multi!.execute(undo);
    expect(f.plan.files.map(n => f.contents.get(n.path))).toEqual(f.plan.files.map(n => n.before));
    const [undone] = await f.restart().multi!.history(); expect(undone.state).toBe("undone"); expect(undone.action).toBeUndefined();
    await expect(service.multi!.execute(undo)).rejects.toEqual(reason("used")); await expect(service.multi!.reviewUndo(r.id, () => true)).rejects.toThrow();
    await expect(f.review()).rejects.toThrow(); expect(f.vault.modify).not.toHaveBeenCalled(); expect(f.vault.create).not.toHaveBeenCalled(); expect(requestUrl).not.toHaveBeenCalled();
  });
  it.each(["a", "b", "ctime", "path", "cache", "resolver", "editor", "cancel"])("refuses %s changes after review without Markdown or success markers", async kind => {
    const f = setup(), r = await f.review();
    if (kind === "a" || kind === "b") f.contents.set(f.pair[kind === "a" ? 0 : 1].path, "later user text");
    if (kind === "ctime") f.pair[1].file.stat.ctime++;
    if (kind === "path") f.pair[1].file.path = "moved.md";
    if (kind === "cache") f.caches.set(f.pair[1].file, null);
    if (kind === "resolver") f.app.metadataCache.getFirstLinkpathDest = () => null;
    if (kind === "editor") f.editor(1);
    if (kind === "cancel") f.cancel();
    await expect(f.multi.execute(r)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled(); expect(f.disk.size).toBe(0);
  });
  it.each([0, 1])("does not overwrite participant %s changed inside process callback", async side => {
    const f = setup(), process = f.vault.process.getMockImplementation()!, r = await f.review(); let call = 0;
    f.vault.process.mockImplementation(async (file, cb) => { if (call++ === side) f.contents.set(file.path, "fresh user text"); return process(file, cb); });
    await expect(f.multi.execute(r)).rejects.toThrow(); expect(f.contents.get(f.pair[side].path)).toBe("fresh user text");
    expect((await f.multi.history())[0].state).toBe("conflict");
  });
  it("ignores own inspector invalidation after first write, but never an external B edit", async () => {
    const f = setup(), process = f.vault.process.getMockImplementation()!;
    f.vault.process.mockImplementation(async (...args) => { const value = await process(...args); f.cancel(); return value; });
    await apply(f); expect((await f.multi.history())[0].state).toBe("applied");
    const g = setup(); onMark(g, "apply_a", async (p, data) => { g.disk.set(p, data); g.contents.set(g.pair[1].path, "subsequent B edit"); });
    await expect(apply(g)).rejects.toThrow(); expect(g.vault.process).toHaveBeenCalledTimes(1); expect(g.contents.get(g.pair[1].path)).toBe("subsequent B edit");
    const [row] = await g.multi.history(); expect(row.state).toBe("conflict"); await expect(g.multi.reviewUndo(row.id, () => true)).rejects.toThrow();
  });
  it.each(["multi-multi", "multi-single", "single-multi"])("shares one busy owner across %s execution", async kind => {
    const f = setup(), multi = await f.review(), second = await f.review(), single = (await f.service.review(f.single, f.analysis, () => true))!;
    let release!: () => void; const gate = new Promise<void>(r => { release = r; }), process = f.vault.process.getMockImplementation()!;
    f.vault.process.mockImplementationOnce(async (...args) => { await gate; return process(...args); });
    const pending = kind === "single-multi" ? f.service.apply(single) : f.multi.execute(multi);
    await vi.waitFor(() => expect(f.vault.process).toHaveBeenCalledTimes(1));
    await expect(kind === "multi-single" ? f.service.apply(single) : f.multi.execute(second)).rejects.toEqual(reason("busy"));
    release(); await pending; expect(f.vault.process).toHaveBeenCalledTimes(kind === "single-multi" ? 1 : 2);
  });
  it.each(["first_partial", "first_complete", "copy", "readback"])("backup failure %s starts no Markdown write and preserves evidence", async phase => {
    const f = setup(), r = await f.review();
    if (phase.startsWith("first")) f.adapter.write.mockImplementationOnce(async (p, data) => { f.disk.set(p, phase === "first_partial" ? "{" : data); throw Error("crash"); });
    if (phase === "copy") f.adapter.copy.mockRejectedValueOnce(Error("copy"));
    if (phase === "readback") f.adapter.copy.mockImplementationOnce(async (_from, to) => { f.disk.set(to, "{"); });
    await expect(f.multi.execute(r)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled();
    expect(f.disk.size).toBeGreaterThan(0); const count = f.disk.size; await f.restart().multi!.history(); expect(f.disk.size).toBe(count);
  });
  it.each([0, 1])("failure before file %s leaves prepared/partial actual state; partial compensation is explicit", async side => {
    const f = setup(), r = await f.review(), process = f.vault.process.getMockImplementation()!; let call = 0;
    f.vault.process.mockImplementation(async (...args) => { if (call++ === side) throw Error("IO"); return process(...args); });
    await expect(f.multi.execute(r)).rejects.toThrow(); const service = f.restart(), [row] = await service.multi!.history();
    expect(row.state).toBe(side ? "partial" : "prepared");
    if (side) {
      const undo = await service.multi!.reviewUndo(r.id, () => true); expect(undo.action).toBe("compensate");
      expect(f.contents.get(f.pair[0].path)).toBe(f.plan.files[0].after); await service.multi!.execute(undo);
      expect(f.contents.get(f.pair[0].path)).toBe(f.plan.files[0].before); expect((await service.multi!.history())[0].state).toBe("undone");
    }
    expect(f.contents.get(f.pair[1].path)).toBe(f.plan.files[1].before);
  });
  it.each(["apply_a", "apply_b", "applied"])("recovers after write but torn %s marker without auto-replay", async mark => {
    const f = setup(), r = await f.review(); onMark(f, mark, async p => { f.disk.set(p, "{partial"); throw Error("kill"); });
    await expect(f.multi.execute(r)).rejects.toThrow(); const calls = f.vault.process.mock.calls.length, writes = f.adapter.write.mock.calls.length;
    const service = f.restart(), [row] = await service.multi!.history(); expect(row.state).toBe(mark === "apply_a" ? "partial" : "applied"); expect(row.markerWarnings).toBe(true);
    expect(f.vault.process).toHaveBeenCalledTimes(calls); expect(f.adapter.write).toHaveBeenCalledTimes(writes);
    await service.multi!.execute(await service.multi!.reviewUndo(r.id, () => true)); expect((await service.multi!.history())[0].state).toBe("undone");
  });
  it.each(["undo_intent", "undo_b", "undo_a", "undone"])("interrupted full undo at %s is recoverable, never repeated automatically", async mark => {
    const f = setup(), r = await apply(f); onMark(f, mark, async p => { f.disk.set(p, "{partial"); throw Error("kill"); });
    await expect(f.multi.execute(await f.multi.reviewUndo(r.id, () => true))).rejects.toThrow();
    const service = f.restart(), [row] = await service.multi!.history();
    expect(row.state).toBe(mark === "undo_intent" ? "applied" : mark === "undo_b" ? "undo_partial" : "undone");
    f.adapter.write.mockImplementation(async (p, data) => { f.disk.set(p, data); });
    if (row.action) await service.multi!.execute(await service.multi!.reviewUndo(r.id, () => true));
    expect((await service.multi!.history())[0].state).toBe("undone");
  });
  it("preserves subsequent edits in either participant and refuses compensation/undo changed after consent", async () => {
    for (const partial of [false, true]) for (const side of [0, 1]) {
      const f = setup(); if (partial) onMark(f, "apply_a", async (p, data) => { f.disk.set(p, data); throw Error("kill"); });
      const r = await f.review(); await f.multi.execute(r).catch(() => {}); const undo = await f.multi.reviewUndo(r.id, () => true);
      f.contents.set(f.pair[side].path, "later edit stays"); const count = f.vault.process.mock.calls.length;
      await expect(f.multi.execute(undo)).rejects.toThrow(); expect(f.vault.process).toHaveBeenCalledTimes(count);
      expect(f.contents.get(f.pair[side].path)).toBe("later edit stays");
    }
  });
  it("compensation interruption has a durable undo intent and truthful state", async () => {
    const f = setup(), r = await f.review(); onMark(f, "apply_a", async (p, data) => { f.disk.set(p, data); throw Error("stop"); });
    await expect(f.multi.execute(r)).rejects.toThrow(); onMark(f, "undo_a", async p => { f.disk.set(p, "{"); throw Error("stop"); });
    await expect(f.multi.execute(await f.multi.reviewUndo(r.id, () => true))).rejects.toThrow();
    expect((await f.restart().multi!.history())[0]).toMatchObject({ state: "undone", recovered: true });
  });
  it("unknown v2 journal damage blocks single-file and multi-file work; old root stays valid", async () => {
    const f = setup(); f.folders.add(f.multiJournal.root); f.disk.set(f.multiJournal.root + "/unknown", "bad");
    await expect(f.review()).rejects.toEqual(reason("storage")); await expect(f.service.review(f.single, f.analysis, () => true)).rejects.toEqual(reason("storage"));
    expect(await f.journal.entries()).toEqual([]); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it.each(["global", "local", "independent", "new_before_b"])("honors legacy Journal Recovery blockers: %s", async scope => {
    const f = setup();
    const old = (await f.service.review(f.single, f.analysis, () => true))!;
    // Create an authentic legacy record through its existing service, but fail before Markdown.
    f.vault.process.mockRejectedValueOnce(Error("stop")); await expect(f.service.apply(old)).rejects.toThrow();
    const e = (await f.journal.entries())[0], record = e.record!;
    f.disk.delete(f.journal.root + "/" + record.id + "/backup.json");
    if (scope === "global") f.disk.set(f.journal.root + "/" + record.id + "/record.json", "{");
    if (scope === "independent" || scope === "new_before_b") {
      for (const p of [...f.disk.keys()]) if (p.startsWith(f.journal.root)) f.disk.delete(p);
      for (const p of [...f.folders]) if (p.startsWith(f.journal.root)) f.folders.delete(p);
      record.sourcePath = "Independent/A.md"; record.targetPath = "Independent/B.md";
      record.edit.inserted = " [[Independent/B]]"; record.after = record.before.slice(0, record.edit.start) + record.edit.inserted + record.before.slice(record.edit.end);
      record.afterHash = await checksum(record.after); record.id = await checksum(JSON.stringify({ ...record, id: "", createdAt: 0 }));
      await f.journal.prepare(record); f.disk.delete(`${f.journal.root}/${record.id}/backup.json`);
    }
    if (scope === "global" || scope === "local") await expect(f.review()).rejects.toEqual(reason("storage"));
    else if (scope === "independent") await apply(f);
    else {
      onMark(f, "apply_a", async (p, data) => { f.disk.set(p, data); f.disk.set(f.journal.root + "/unknown", "bad"); });
      await expect(apply(f)).rejects.toEqual(reason("storage")); expect(f.contents.get(f.pair[1].path)).toBe(f.plan.files[1].before);
    }
  });
  it("strictly rejects malformed backups, checksum/ID/path tampering, and conflicting valid copies", async () => {
    const f = setup(), r = await apply(f), raw = f.disk.get(`${f.multiJournal.root}/${r.id}/record.json`)!;
    for (const change of [(v: typeof r.record) => { v.files[0].before += "x"; }, (v: typeof r.record) => { v.files[0].path = "../private.md"; }, (v: typeof r.record) => { v.version = 1 as never; }]) {
      const v = JSON.parse(raw) as typeof r.record; change(v); await expect(validateMultiRecord(v, r.id)).rejects.toThrow();
    }
    const other = JSON.parse(raw) as typeof r.record; other.createdAt++; await validateMultiRecord(other, r.id);
    f.disk.set(`${f.multiJournal.root}/${r.id}/backup.json`, JSON.stringify(other));
    expect((await f.multiJournal.entries())[0]).toMatchObject({ damaged: true, scope: "global", record: undefined });
    await expect(f.multi.reviewUndo(r.id, () => true)).rejects.toThrow();
  });
  it.each(["cache", "user_edit", "unwritten_cache", "late_cache"])("handles native own-cache eviction without hiding %s", async kind => {
    const f = setup(), process = f.vault.process.getMockImplementation()!; let calls = 0;
    f.vault.process.mockImplementation(async (...args) => {
      const side = calls++;
      if (side === 1 && kind === "late_cache") f.caches.set(f.pair[0].file, null);
      const result = await process(...args);
      if (side === 0 && kind !== "late_cache") {
        f.caches.set(f.pair[kind === "unwritten_cache" ? 1 : 0].file, null);
        if (kind === "user_edit") f.contents.set(f.pair[1].path, "changed during cache rebuild");
        setTimeout(() => f.caches.set(f.pair[0].file, f.pair[0].cache), 40);
      }
      if (side === 1 && kind === "late_cache") f.caches.set(f.pair[0].file, f.pair[0].cache);
      return result;
    });
    if (kind === "cache" || kind === "late_cache") { await apply(f); expect((await f.multi.history())[0].state).toBe("applied"); }
    else { await expect(apply(f)).rejects.toThrow(); expect(f.vault.process).toHaveBeenCalledTimes(1); }
    if (kind === "user_edit") expect(f.contents.get(f.pair[1].path)).toBe("changed during cache rebuild");
  });
  it("an unresolved shared partial operation also blocks legacy Undo", async () => {
    const f = setup(), old = (await f.service.review(f.single, f.analysis, () => true))!;
    await f.service.apply(old); await f.multiJournal.prepare(await multiRecord(f.plan));
    await expect(f.service.reviewUndo(old.id, () => true)).rejects.toEqual(reason("storage"));
    expect(f.vault.process).toHaveBeenCalledTimes(1);
  });
  it("completed operations do not block new plans after user edits, but their own Undo is unavailable", async () => {
    const f = setup(), r = await apply(f);
    f.contents.set(f.pair[1].path, f.plan.files[1].before);
    expect((await f.multi.history())[0].state).toBe("conflict");
    await expect(f.multi.reviewUndo(r.id, () => true)).rejects.toThrow();
    await expect(f.multi.blockers(f.plan.participants)).resolves.toBeUndefined();
  });
  it("retains the legacy confirmed-resolution policy", async () => {
    const f = setup(), old = (await f.service.review(f.single, f.analysis, () => true))!;
    f.vault.process.mockRejectedValueOnce(Error("before write")); await expect(f.service.apply(old)).rejects.toThrow();
    f.disk.delete(`${f.journal.root}/${old.id}/backup.json`);
    await expect(f.review()).rejects.toEqual(reason("storage"));
    await f.service.resolve(await f.service.reviewResolution(old.id, () => true));
    await apply(f); expect((await f.multi.history())[0].state).toBe("applied");
  });
  it("a completed Undo followed by user edits is historical, not a new blocker or repeatable Undo", async () => {
    const f = setup(), r = await apply(f); await f.multi.execute(await f.multi.reviewUndo(r.id, () => true));
    f.contents.set(f.pair[0].path, "subsequent work"); const [row] = await f.multi.history();
    expect(row.state).toBe("conflict"); expect(row.action).toBeUndefined(); expect(row.blocking).toBe(false);
    await expect(f.multi.blockers(f.plan.participants)).resolves.toBeUndefined(); expect(f.contents.get(f.pair[0].path)).toBe("subsequent work");
  });
  it("a restored participant edited back to after cannot be silently undone again", async () => {
    const f = setup(), r = await apply(f); onMark(f, "undo_b", async (p, data) => { f.disk.set(p, data); throw Error("stop"); });
    await expect(f.multi.execute(await f.multi.reviewUndo(r.id, () => true))).rejects.toThrow();
    f.contents.set(f.pair[1].path, f.plan.files[1].after);
    expect((await f.restart().multi!.history())[0]).toMatchObject({ state: "conflict", blocking: true });
    await expect(f.multi.reviewUndo(r.id, () => true)).rejects.toThrow(); expect(f.contents.get(f.pair[1].path)).toBe(f.plan.files[1].after);
  });
  it("plugin disposal after A stops B but preserves the durable partial state", async () => {
    const f = setup(); onMark(f, "apply_a", async (p, data) => { f.disk.set(p, data); f.service.dispose(); });
    await expect(apply(f)).rejects.toThrow();
    expect(f.vault.process).toHaveBeenCalledTimes(1); expect((await f.restart().multi!.history())[0].state).toBe("partial");
  });
});
