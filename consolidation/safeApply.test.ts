import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, MarkdownView: class {}, parseLinktext: (s: string) => ({ path: s.split("#")[0] }), getLanguage: () => "en" }));
import { TFile, MarkdownView } from "obsidian";
import type { App, CachedMetadata } from "obsidian";
import { buildChangePlan, paragraphRanges } from "./changePlan";
import type { PlanPair, PlanNote } from "./changePlan";
import { validateRelationshipResponse } from "./relationshipContract";
import type { RelationshipAnalysis } from "./relationshipSession";
import fixture from "../tests/fixtures/change-planner.json";
import { OperationJournal, checksum, validateOperation } from "./operationJournal";
import { SafeApplyService } from "./safeApply";
import { obsidianSafeApplyPort } from "./obsidianSafeApply";

function setup(operation: "add_link" | "replace_with_embed" | "no_change" = "add_link") {
  const contents = new Map<string, string>(), caches = new Map<TFile, CachedMetadata>();
  function note(path: string, content: string): PlanNote {
    const file = Object.assign(new TFile(), { path, stat: { ctime: 1, mtime: 2, size: content.length } });
    const cache = { sections: content.trimEnd().split("\n\n").map(text => {
      const offset = content.indexOf(text); return { type: "paragraph", position: { start: { offset, line: 0, col: 0 }, end: { offset: offset + text.length, line: 0, col: 0 } } };
    }) };
    contents.set(path, content); caches.set(file, cache);
    return { file, path, content, modified: 2, bytes: content.length, cache, references: [] };
  }
  const pair: PlanPair = [note("one/Same.md", fixture.a), note("two/Same.md", fixture.b)];
  const analysis: RelationshipAnalysis = { pair, provider: "fake", model: "synthetic", result: validateRelationshipResponse(JSON.stringify(fixture.response), fixture.a, fixture.b) };
  const plan = buildChangePlan(analysis, pair, { operation, source: 0, selection: paragraphRanges(pair[0])[0], confirmed: true }, "two/Same");
  const disk = new Map<string, string>(), folders = new Set<string>();
  const adapter = {
    exists: vi.fn(async (path: string) => disk.has(path) || folders.has(path)),
    stat: vi.fn(async (path: string) => disk.has(path) ? { type: "file", size: disk.get(path)!.length } : folders.has(path) ? { type: "folder", size: 0 } : null),
    read: vi.fn(async (path: string) => { if (!disk.has(path)) throw Error("missing"); return disk.get(path)!; }),
    write: vi.fn(async (path: string, data: string) => { disk.set(path, data); }),
    copy: vi.fn(async (from: string, to: string) => { if (disk.has(to)) throw Error("exists"); disk.set(to, disk.get(from)!); }),
    mkdir: vi.fn(async (path: string) => { folders.add(path); }),
    list: vi.fn(async (path: string) => ({ files: [...disk.keys()].filter(p => p.slice(0, p.lastIndexOf("/")) === path), folders: [...folders].filter(p => p.slice(0, p.lastIndexOf("/")) === path) })),
  };
  let leaves: unknown[] = [];
  const vault = {
    getFileByPath: (path: string) => pair.find(note => note.file.path === path && contents.has(path))?.file ?? null,
    read: vi.fn(async (file: TFile) => contents.get(file.path)!),
    process: vi.fn(async (file: TFile, fn: (s: string) => string) => {
      const data = fn(contents.get(file.path)!); contents.set(file.path, data); file.stat.mtime++; file.stat.size = data.length; return data;
    }),
    modify: vi.fn(), create: vi.fn(), delete: vi.fn(), adapter,
  };
  const app = { vault, workspace: { iterateAllLeaves: (fn: (leaf: unknown) => void) => leaves.forEach(fn) },
    metadataCache: { getFileCache: (file: TFile) => caches.get(file), getFirstLinkpathDest: (path: string) => vault.getFileByPath(`${path}.md`) } } as unknown as App;
  const journal = new OperationJournal(adapter as never, ".obsidian", "ai-knowledge-hub");
  const port = obsidianSafeApplyPort(app), service = new SafeApplyService(journal, port);
  let current = true;
  const review = () => service.review(plan, analysis, () => current);
  return { pair, plan, analysis, contents, disk, adapter, journal, service, port, vault, caches, app, review,
    cancel: () => { current = false; }, restart: () => new SafeApplyService(new OperationJournal(adapter as never, ".obsidian", "ai-knowledge-hub"), obsidianSafeApplyPort(app)),
    editor: (text: string, native = true, savedState = true) => { const view = Object.assign(native ? new MarkdownView({} as never) : {}, { file: pair[0].file, getViewData: () => text }); leaves = [{ view, getViewState: () => ({ type: "markdown", state: savedState ? { file: pair[0].path } : {} }) }]; },
  };
}
async function apply(f: ReturnType<typeof setup>) { const review = (await f.review())!; await f.service.apply(review); return review; }
const reason = (s: string): unknown => expect.objectContaining({ reason: s });

describe("single-file guarded apply and persistent recovery", () => {
  it.each(["add_link", "replace_with_embed"] as const)("applies %s once with homonym-safe paths, verified copies and preserved context", async operation => {
    const f = setup(operation); const review = await f.review(); expect(f.disk.size).toBe(0); expect(f.vault.process).not.toHaveBeenCalled();
    await f.service.apply(review!); expect(f.contents.get(f.plan.sourcePath)).toBe(f.plan.after); expect(f.contents.get(f.plan.targetPath)).toBe(fixture.b);
    expect(f.plan.after).toContain("In our classroom experiment");
    expect(f.vault.process).toHaveBeenCalledTimes(1); expect(f.adapter.copy).toHaveBeenCalledTimes(1);
    const [entry] = await f.journal.entries(); expect(entry.damaged).toBe(false); expect(entry.marks).toEqual(["applied"]);
    expect(entry.record!.beforeHash).toBe(await checksum(f.plan.before));
    expect(JSON.stringify(entry.record)).not.toContain('"provider"'); expect(JSON.stringify(entry.record)).not.toContain('"model"');
    await expect(f.service.apply(review!)).rejects.toEqual(reason("used"));
    expect((await f.restart().history())[0]).toMatchObject({ state: "applied", canUndo: true });
    expect(f.vault.modify).not.toHaveBeenCalled(); expect(f.vault.create).not.toHaveBeenCalled(); expect(f.vault.delete).not.toHaveBeenCalled();
  });
  it("no_change performs no journal, note or network work", async () => {
    const f = setup("no_change"); expect(await f.review()).toBeNull(); expect(f.adapter.exists).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it("two windows cannot apply the same plan twice", async () => {
    const f = setup(), a = (await f.review())!, b = (await f.review())!;
    const results = await Promise.allSettled([f.service.apply(a), f.service.apply(b)]);
    expect(results.map(r => r.status)).toEqual(["fulfilled", "rejected"]); expect(f.vault.process).toHaveBeenCalledTimes(1);
  });
  it.each(["source", "target", "moved", "deleted", "cache", "resolution", "settings"])("rejects %s changes after review", async changed => {
    const f = setup(), review = (await f.review())!;
    if (changed === "source") f.contents.set(f.plan.sourcePath, "user text");
    if (changed === "target") f.contents.set(f.plan.targetPath, "new target");
    if (changed === "moved") f.pair[1].file.path = "moved.md";
    if (changed === "deleted") f.contents.delete(f.plan.targetPath);
    if (changed === "cache") f.caches.set(f.pair[0].file, { sections: [] });
    if (changed === "resolution") f.app.metadataCache.getFirstLinkpathDest = () => null;
    if (changed === "settings") f.cancel();
    await expect(f.service.apply(review)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it.each(["dirty", "equal", "unknown"])("refuses %s open editor because a queued save cannot be locked", async kind => {
    const f = setup(); f.editor(kind === "dirty" ? "unsaved" : f.plan.before, kind !== "unknown");
    await expect(f.review()).rejects.toEqual(reason("editor")); expect(f.disk.size).toBe(0);
  });
  it.each(["write", "copy", "readback"])("a failed backup %s prevents Markdown writes", async fail => {
    const f = setup(), review = (await f.review())!;
    if (fail === "write") f.adapter.write.mockImplementationOnce(async (p) => { f.disk.set(p, "partial"); throw Error("disk"); });
    if (fail === "copy") f.adapter.copy.mockRejectedValueOnce(Error("disk"));
    if (fail === "readback") f.adapter.read.mockResolvedValueOnce("wrong bytes");
    await expect(f.service.apply(review)).rejects.toEqual(reason("storage")); expect(f.vault.process).not.toHaveBeenCalled(); expect(f.contents.get(f.plan.sourcePath)).toBe(f.plan.before);
  });
  it("crash after prepared, before process never reapplies", async () => {
    const f = setup(), review = (await f.review())!;
    f.vault.process.mockRejectedValueOnce(Error("crash before write")); await expect(f.service.apply(review)).rejects.toEqual(reason("write"));
    const service = f.restart(); expect((await service.history())[0]).toMatchObject({ state: "prepared", canUndo: false });
    await expect(service.review(f.plan, f.analysis, () => true)).rejects.toEqual(reason("used")); expect(f.contents.get(f.plan.sourcePath)).toBe(f.plan.before);
  });
  it("crash after process, before applied reconciles to applied and can undo after restart", async () => {
    const f = setup(), review = (await f.review())!;
    const write = f.adapter.write.getMockImplementation()!;
    f.adapter.write.mockImplementation(async (path, raw) => { if (path.endsWith("/applied.json")) throw Error("power off"); await write(path, raw); });
    await expect(f.service.apply(review)).rejects.toEqual(reason("storage"));
    const service = f.restart(), row = (await service.history())[0]; expect(row).toMatchObject({ state: "applied", recovered: true, canUndo: true });
    await service.undo(await service.reviewUndo(row.id, () => true)); expect(f.contents.get(f.plan.sourcePath)).toBe(f.plan.before);
    expect((await f.restart().history())[0].state).toBe("undone");
  });
  it("exact undo is guarded, persistent and cannot be repeated", async () => {
    const f = setup(), review = await apply(f), service = f.restart();
    const undo = await service.reviewUndo(review.id, () => true); await service.undo(undo);
    expect(f.contents.get(f.plan.sourcePath)).toBe(f.plan.before); expect((await service.history())[0].state).toBe("undone");
    await expect(service.undo(undo)).rejects.toEqual(reason("used")); await expect(service.reviewUndo(review.id, () => true)).rejects.toEqual(reason("conflict")); expect(f.vault.process).toHaveBeenCalledTimes(2);
  });
  it("user edits after apply remain untouched and the full backup is available", async () => {
    const f = setup(), review = await apply(f); f.contents.set(f.plan.sourcePath, f.plan.after + "\nUSER");
    const service = f.restart(), row = (await service.history())[0]; expect(row).toMatchObject({ state: "conflict", canUndo: false }); expect(row.record!.before).toBe(f.plan.before);
    await expect(service.reviewUndo(review.id, () => true)).rejects.toEqual(reason("conflict")); expect(f.contents.get(f.plan.sourcePath)).toContain("USER");
  });
  it("user changes after undo confirmation cannot be overwritten", async () => {
    const f = setup(), review = await apply(f), undo = await f.service.reviewUndo(review.id, () => true);
    f.contents.set(f.plan.sourcePath, "later text"); await expect(f.service.undo(undo)).rejects.toEqual(reason("conflict")); expect(f.contents.get(f.plan.sourcePath)).toBe("later text");
  });
  it.each(["before", "after"])("undo failure %s write is recovered from actual content", async point => {
    const f = setup(), review = await apply(f), undo = await f.service.reviewUndo(review.id, () => true);
    const process = f.vault.process.getMockImplementation()!;
    f.vault.process.mockImplementationOnce(async (file, fn) => { if (point === "after") await process(file, fn); throw Error("crash"); });
    await expect(f.service.undo(undo)).rejects.toEqual(reason("write"));
    const row = (await f.restart().history())[0]; expect(row.state).toBe(point === "after" ? "undone" : "applied"); expect(row.recovered).toBe(true);
  });
  it("partial Markdown failure preserves backup and reports conflict", async () => {
    const f = setup(), review = (await f.review())!;
    f.vault.process.mockImplementationOnce(async () => { f.contents.set(f.plan.sourcePath, "partial"); throw Error("disk"); });
    await expect(f.service.apply(review)).rejects.toThrow(); const row = (await f.restart().history())[0]; expect(row.state).toBe("conflict"); expect(row.record!.before).toBe(f.plan.before);
  });
  it("cancels before callback but finishes journal once writing started", async () => {
    const f = setup(), review = (await f.review())!;
    const process = f.vault.process.getMockImplementation()!;
    f.vault.process.mockImplementationOnce(async (file, fn) => { f.cancel(); return process(file, fn); });
    await expect(f.service.apply(review)).rejects.toThrow(); expect(f.contents.get(f.plan.sourcePath)).toBe(f.plan.before);
    const g = setup(), next = (await g.review())!, write = g.vault.process.getMockImplementation()!;
    g.vault.process.mockImplementationOnce(async (file, fn) => { const result = await write(file, fn); g.cancel(); return result; });
    await g.service.apply(next); expect((await g.restart().history())[0].state).toBe("applied");
  });
  it("callback compares exact current text and target identity even after the final reread", async () => {
    for (const target of [false, true]) {
      const f = setup(), review = (await f.review())!, process = f.vault.process.getMockImplementation()!;
      f.vault.process.mockImplementationOnce(async (file, fn) => { if (target) f.pair[1].file.path = "moved.md"; else f.contents.set(file.path, "new text"); return process(file, fn); });
      await expect(f.service.apply(review)).rejects.toThrow(); expect(f.contents.get(f.plan.sourcePath)).toBe(target ? f.plan.before : "new text");
    }
  });
  it.each(["record", "marker", "both"])("damaged %s is preserved, never interpreted as safe", async damage => {
    const f = setup(), review = await apply(f); const prefix = `${f.journal.root}/${review.id}/`;
    if (damage !== "marker") f.disk.set(prefix + "record.json", "{partial");
    if (damage === "both") f.disk.set(prefix + "backup.json", "broken");
    if (damage === "marker") f.disk.set(prefix + "applied.json", "{partial");
    const service = f.restart(), row = (await service.history())[0]; expect(row).toMatchObject({ damaged: true, state: "conflict", canUndo: false });
    if (damage !== "both") expect(row.record!.before).toBe(f.plan.before);
    await expect(service.reviewUndo(review.id, () => true)).rejects.toThrow(); expect(f.disk.get(prefix + (damage === "marker" ? "applied.json" : "record.json"))).toBe("{partial");
  });
  it("rejects corrupt hashes, extra keys and paths outside the vault", async () => {
    const f = setup(); await apply(f); const r = (await f.journal.entries())[0].record!;
    for (const patch of [{ before: "forged" }, { sourcePath: "../secret.md" }, { targetPath: "/secret.md" }, { secret: "not allowed" }, { edit: { ...r.edit, inserted: "arbitrary" } }]) {
      await expect(validateOperation({ ...r, ...patch }, r.id)).rejects.toThrow();
    }
  });
  it("invalidates after backup IO and never writes a changed source", async () => {
    const f = setup(), review = (await f.review())!, copy = f.adapter.copy.getMockImplementation()!;
    f.adapter.copy.mockImplementationOnce(async (from, to) => { await copy(from, to); f.contents.set(f.plan.sourcePath, "user changed during backup"); });
    await expect(f.service.apply(review)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled();
    expect((await f.restart().history())[0]).toMatchObject({ state: "conflict", canUndo: false });
    expect(f.contents.get(f.plan.sourcePath)).toBe("user changed during backup");
  });
  it.each(["undo_pending", "undone"])("failed %s marker never hides the actual undo outcome", async state => {
    const f = setup(), review = await apply(f), undo = await f.service.reviewUndo(review.id, () => true);
    const write = f.adapter.write.getMockImplementation()!;
    f.adapter.write.mockImplementation(async (path, raw) => { if (path.endsWith(`/${state}.json`)) throw Error("disk"); await write(path, raw); });
    await expect(f.service.undo(undo)).rejects.toEqual(reason("storage"));
    const row = (await f.restart().history())[0]; expect(row.state).toBe(state === "undone" ? "undone" : "applied");
    expect(f.contents.get(f.plan.sourcePath)).toBe(state === "undone" ? f.plan.before : f.plan.after);
  });
  it("incomplete backup remains a conflict and blocks subsequent new applies", async () => {
    const f = setup(), review = (await f.review())!; f.adapter.copy.mockRejectedValueOnce(Error("disk"));
    await expect(f.service.apply(review)).rejects.toThrow();
    const service = f.restart(), row = (await service.history())[0]; expect(row).toMatchObject({ damaged: true, state: "conflict", canUndo: false });
    expect(row.record!.before).toBe(f.plan.before); await expect(service.review(f.plan, f.analysis, () => true)).rejects.toEqual(reason("storage"));
  });
  it("plugin disposal revokes unused consents without journal or Markdown IO", async () => {
    const f = setup(), review = (await f.review())!; f.service.dispose(); await expect(f.service.apply(review)).rejects.toThrow();
    expect(f.disk.size).toBe(0); expect(f.vault.process).not.toHaveBeenCalled();
  });

  it("refuses a custom FileView whose serialized state omits its loaded source", async () => {
    const f = setup(); f.editor("unknown custom editor", false, false);
    await expect(f.review()).rejects.toEqual(reason("editor")); expect(f.disk.size).toBe(0);
  });

});
