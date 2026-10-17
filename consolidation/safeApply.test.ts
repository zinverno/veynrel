import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, MarkdownView: class {}, parseLinktext: (s: string) => ({ path: s.split("#")[0] }), getLanguage: () => "en" }));
import { TFile, MarkdownView } from "obsidian";
import type { App, CachedMetadata } from "obsidian";
import { buildChangePlan, paragraphRanges } from "./changePlan";
import type { PlanPair, PlanNote } from "./changePlan";
import { validateRelationshipResponse } from "./relationshipContract";
import type { RelationshipAnalysis } from "./relationshipSession";
import fixture from "../tests/fixtures/change-planner.json";
import { OperationJournal, SafeApplyError, checksum, validateOperation } from "./operationJournal";
import type { OperationRecord, ResolutionRecord } from "./operationJournal";
import { SafeApplyService } from "./safeApply";
import { obsidianSafeApplyPort } from "./obsidianSafeApply";

function setup(operation: "add_link" | "replace_with_embed" | "no_change" = "add_link", prefix = "") {
  const contents = new Map<string, string>(), caches = new Map<TFile, CachedMetadata>();
  function note(path: string, content: string): PlanNote {
    const file = Object.assign(new TFile(), { path, stat: { ctime: 1, mtime: 2, size: content.length } });
    const cache = { sections: content.trimEnd().split("\n\n").map(text => {
      const offset = content.indexOf(text); return { type: "paragraph", position: { start: { offset, line: 0, col: 0 }, end: { offset: offset + text.length, line: 0, col: 0 } } };
    }) };
    contents.set(path, content); caches.set(file, cache);
    return { file, path, content, modified: 2, bytes: content.length, cache, references: [] };
  }
  const pair: PlanPair = [note(`${prefix}one/Same.md`, fixture.a), note(`${prefix}two/Same.md`, fixture.b)];
  const analysis: RelationshipAnalysis = { pair, provider: "fake", model: "synthetic", result: validateRelationshipResponse(JSON.stringify(fixture.response), fixture.a, fixture.b) };
  const plan = buildChangePlan(analysis, pair, { operation, source: 0, selection: paragraphRanges(pair[0])[0], confirmed: true }, `${prefix}two/Same`);
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
  return { pair, plan, analysis, contents, disk, folders, adapter, journal, service, port, vault, caches, app, review,
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

async function incident(state: "before" | "after" = "after") {
  const f = setup();
  const review = (await f.review())!;
  if (state === "before") {
    f.adapter.copy.mockRejectedValueOnce(Error("interrupted copy"));
    await expect(f.service.apply(review)).rejects.toThrow();
  } else {
    await f.service.apply(review); f.disk.delete(`${f.journal.root}/${review.id}/backup.json`);
  }
  f.vault.process.mockClear();
  return { ...f, id: review.id, dir: `${f.journal.root}/${review.id}` };
}

describe("journal diagnostics and scoped blockers", () => {
  it.each(["before", "after"] as const)("missing second copy with exact %s can be reviewed, never implicitly repaired", async state => {
    const f = await incident(state), original = new Map(f.disk);
    const row = (await f.restart().history())[0];
    expect(row).toMatchObject({ scope: "local", sourceState: state, canResolve: true, canUndo: false, state: "conflict" });
    expect(row.issues).toContainEqual({ file: "backup.json", code: "missing" });
    await f.service.reviewResolution(f.id, () => true);
    expect(f.disk).toEqual(original); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it.each(["missing", "json", "hash", "id", "path", "unreadable"])("diagnoses first-copy %s and retains the valid second copy", async kind => {
    const f = setup(), review = await apply(f), path = `${f.journal.root}/${review.id}/record.json`;
    const r = JSON.parse(f.disk.get(path)!) as OperationRecord;
    if (kind === "missing") f.disk.delete(path);
    if (kind === "json") f.disk.set(path, '{"version":');
    if (kind === "hash") f.disk.set(path, JSON.stringify({ ...r, beforeHash: "0".repeat(64) }));
    if (kind === "id") f.disk.set(path, JSON.stringify({ ...r, id: "0".repeat(64) }));
    if (kind === "path") f.disk.set(path, JSON.stringify({ ...r, sourcePath: "../private.md" }));
    if (kind === "unreadable") {
      const read = f.adapter.read.getMockImplementation()!;
      f.adapter.read.mockImplementation(async p => { if (p === path) throw Error("private raw error"); return read(p); });
    }
    const row = (await f.restart().history())[0];
    const code = { missing: "missing", json: "invalid_json", hash: "integrity", id: "integrity", path: "invalid_record", unreadable: "unreadable" }[kind];
    expect(row.issues).toContainEqual({ file: "record.json", code });
    expect(row.scope).toBe("local"); expect(row.record!.sourcePath).toBe("one/Same.md");
    expect(row.canResolve).toBe(kind !== "unreadable"); expect(JSON.stringify(row)).not.toContain("private raw error");
  });
  it.each(["both invalid", "disagreement"])("%s keeps a global block and cannot be confirmed", async mode => {
    const f = setup(), review = await apply(f), dir = `${f.journal.root}/${review.id}`;
    if (mode === "both invalid") for (const name of ["record.json", "backup.json"]) f.disk.set(`${dir}/${name}`, "{");
    else {
      const copy = JSON.parse(f.disk.get(`${dir}/backup.json`)!) as OperationRecord; copy.createdAt++;
      await validateOperation(copy, review.id); f.disk.set(`${dir}/backup.json`, JSON.stringify(copy));
    }
    const row = (await f.service.history())[0]; expect(row.scope).toBe("global"); expect(row.canResolve).toBe(false);
    const g = setup("add_link", "independent/");
    await expect(new SafeApplyService(f.journal, g.port).review(g.plan, g.analysis, () => true)).rejects.toEqual(reason("storage"));
    await expect(f.service.reviewResolution(review.id, () => true)).rejects.toEqual(reason("conflict"));
  });
  it.each(["applied", "undo_pending", "undone"])("partial %s marker is an incident, not a successful event", async mark => {
    const f = setup(), review = await apply(f); f.disk.set(`${f.journal.root}/${review.id}/${mark}.json`, '{"version":1');
    const row = (await f.restart().history())[0];
    expect(row).toMatchObject({ scope: "local", state: "conflict", sourceState: "after", canResolve: true, canUndo: false });
    expect(row.issues).toContainEqual({ file: `${mark}.json`, code: "invalid_marker" });
    expect(row.marks).not.toContain(mark);
  });
  it("allows a real independent apply but blocks either affected path", async () => {
    const f = await incident("before"), g = setup("add_link", "independent/");
    const service = new SafeApplyService(f.journal, g.port);
    await service.apply((await service.review(g.plan, g.analysis, () => true))!);
    expect(g.contents.get(g.plan.sourcePath)).toBe(g.plan.after);
    await expect(f.review()).rejects.toEqual(reason("storage"));
    const reverse = buildChangePlan(f.analysis, f.pair, { operation: "add_link", source: 1, selection: paragraphRanges(f.pair[1])[0], confirmed: true }, "one/Same");
    await expect(f.service.review(reverse, f.analysis, () => true)).rejects.toEqual(reason("storage"));
  });
  it.each(["root file", "bad directory", "nested directory", "unknown file", "root unreadable"])("keeps other history visible with %s", async kind => {
    const f = setup(), review = await apply(f), dir = `${f.journal.root}/${review.id}`;
    if (kind === "root file") f.disk.set(`${f.journal.root}/unexpected.json`, "unknown");
    if (kind === "bad directory") f.folders.add(`${f.journal.root}/../unsafe`);
    if (kind === "nested directory") f.folders.add(`${dir}/nested`);
    if (kind === "unknown file") f.disk.set(`${dir}/unknown.json`, "private");
    if (kind === "root unreadable") f.adapter.list.mockRejectedValueOnce(Error("private failure"));
    // The fake adapter lists direct children; represent a malformed name without traversing it.
    if (kind === "bad directory") f.folders.add(`${f.journal.root}/bad-id`);
    const rows = await f.service.history();
    if (kind !== "root unreadable") expect(rows.some(r => r.id === review.id && r.record)).toBe(true);
    const incidentRow = rows.find(r => r.damaged)!;
    expect(incidentRow.scope).toBe(kind === "unknown file" || kind === "nested directory" ? "local" : "global");
    expect(incidentRow.canResolve).toBe(false);
    expect(f.vault.read.mock.calls.every(([file]) => file.path === "one/Same.md" || file.path === "two/Same.md")).toBe(true);
  });
  it.each(["changed", "deleted", "moved", "ctime", "editor"])("refuses resolution with %s source", async kind => {
    const f = await incident();
    if (kind === "changed") f.contents.set(f.plan.sourcePath, "user additions");
    if (kind === "deleted") f.contents.delete(f.plan.sourcePath);
    if (kind === "moved") f.pair[0].file.path = "moved.md";
    if (kind === "ctime") f.pair[0].file.stat.ctime++;
    if (kind === "editor") f.editor(f.plan.after);
    const row = (await f.restart().history())[0]; expect(row.canResolve).toBe(false);
    expect(row.sourceState).toBe(({ changed: "different", deleted: "missing", moved: "missing", ctime: "identity", editor: "after" })[kind]);
    await expect(f.service.reviewResolution(f.id, () => true)).rejects.toEqual(reason("conflict"));
    expect(f.vault.process).not.toHaveBeenCalled();
  });
});

describe("append-only incident resolution", () => {
  it.each(["before", "after"] as const)("explicit resolution of %s survives restart, preserves every original byte, never enables Undo or replay", async state => {
    const f = await incident(state), original = new Map(f.disk);
    const review = await f.service.reviewResolution(f.id, () => true);
    expect(f.disk).toEqual(original);
    await f.service.resolve(review);
    for (const [path, raw] of original) expect(f.disk.get(path)).toBe(raw);
    expect(f.disk.size).toBe(original.size + 2); expect(f.disk.has(`${f.dir}/backup.json`)).toBe(false);
    const service = f.restart(), row = (await service.history())[0];
    expect(row).toMatchObject({ state: "resolved", damaged: true, canUndo: false, canResolve: false });
    expect(row.resolution!.source.state).toBe(state);
    expect(row.resolution!.evidenceHash).toBe(row.evidenceHash);
    expect(f.vault.process).not.toHaveBeenCalled(); expect(f.vault.modify).not.toHaveBeenCalled();
    await expect(service.reviewUndo(f.id, () => true)).rejects.toThrow();
    await expect(service.reviewResolution(f.id, () => true)).rejects.toThrow();
    await expect(f.service.resolve(review)).rejects.toEqual(reason("used"));
    if (state === "before") await expect(service.review(f.plan, f.analysis, () => true)).rejects.toEqual(reason("used"));
    // A later user edit does not revoke a historical acknowledgement or become an Undo target.
    f.contents.set(f.plan.sourcePath, "later text");
    expect((await service.history())[0]).toMatchObject({ state: "resolved", sourceState: "different", canUndo: false });
  });
  it("no fabricated ticket can bypass separate confirmation", async () => {
    const f = await incident(), original = new Map(f.disk);
    await expect(f.service.resolve({ row: (await f.service.history())[0] })).rejects.toEqual(reason("used"));
    expect(f.disk).toEqual(original); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it.each(["source", "ctime", "journal", "close"])("invalidates %s change between preview and confirmation", async kind => {
    const f = await incident(); let active = true;
    const review = await f.service.reviewResolution(f.id, () => active), original = new Map(f.disk);
    if (kind === "source") f.contents.set(f.plan.sourcePath, "user text");
    if (kind === "ctime") f.pair[0].file.stat.ctime++;
    if (kind === "journal") f.disk.set(`${f.dir}/applied.json`, "changed");
    if (kind === "close") active = false;
    await expect(f.service.resolve(review)).rejects.toThrow();
    expect(f.disk.size).toBe(original.size); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it.each(["source", "journal", "close"])("rechecks %s after intent is written, before committing", async kind => {
    const f = await incident(); let active = true;
    const review = await f.service.reviewResolution(f.id, () => active), write = f.adapter.write.getMockImplementation()!;
    f.adapter.write.mockImplementationOnce(async (path, raw) => {
      await write(path, raw);
      if (kind === "source") f.contents.set(f.plan.sourcePath, "user text during IO");
      if (kind === "journal") f.disk.set(`${f.dir}/applied.json`, "torn");
      if (kind === "close") active = false;
    });
    await expect(f.service.resolve(review)).rejects.toThrow();
    expect([...f.disk.keys()].some(p => p.endsWith(".commit.json"))).toBe(false);
    expect((await f.restart().history())[0].state).toBe("conflict"); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it.each(["intent partial", "commit partial", "intent complete"])("a killed %s attempt never unblocks; a new unique attempt succeeds without deleting it", async point => {
    const f = await incident(), review = await f.service.reviewResolution(f.id, () => true), write = f.adapter.write.getMockImplementation()!;
    f.adapter.write.mockImplementation(async (path, raw) => {
      if (point === "commit partial" ? path.endsWith(".commit.json") : path.includes("/resolution-")) {
        f.disk.set(path, point === "intent complete" ? raw : raw.slice(0, 30)); throw Error("SIGKILL boundary");
      }
      await write(path, raw);
    });
    await expect(f.service.resolve(review)).rejects.toEqual(reason("storage"));
    const failed = new Map(f.disk), service = f.restart();
    expect((await service.history())[0]).toMatchObject({ state: "conflict", scope: "local", canResolve: true });
    f.adapter.write.mockImplementation(write);
    await service.resolve(await service.reviewResolution(f.id, () => true));
    expect((await f.restart().history())[0]).toMatchObject({ state: "resolved", canUndo: false });
    for (const [path, raw] of failed) expect(f.disk.get(path)).toBe(raw);
    expect(f.vault.process).not.toHaveBeenCalled();
  });
  it("a complete committed decision recovers even if readback/acknowledgement was interrupted", async () => {
    const f = await incident(), review = await f.service.reviewResolution(f.id, () => true), read = f.adapter.read.getMockImplementation()!;
    f.adapter.read.mockImplementation(async path => { if (path.endsWith(".commit.json")) throw Error("stopped before acknowledgement"); return read(path); });
    await expect(f.service.resolve(review)).rejects.toEqual(reason("storage"));
    f.adapter.read.mockImplementation(read);
    expect((await f.restart().history())[0]).toMatchObject({ state: "resolved", canUndo: false });
    expect(f.vault.process).not.toHaveBeenCalled();
  });
  it("a changed original invalidates its old waiver and never re-enables Undo", async () => {
    const f = await incident(); await f.service.resolve(await f.service.reviewResolution(f.id, () => true));
    f.disk.set(`${f.dir}/backup.json`, f.disk.get(`${f.dir}/record.json`)!);
    const row = (await f.restart().history())[0];
    expect(row).toMatchObject({ state: "conflict", scope: "local", canUndo: false });
    expect(row.issues.some(i => i.code === "resolution_stale")).toBe(true);
  });
  it("two windows and a late callback cannot commit twice", async () => {
    const f = await incident(), a = await f.service.reviewResolution(f.id, () => true), b = await f.service.reviewResolution(f.id, () => true);
    const results = await Promise.allSettled([f.service.resolve(a), f.service.resolve(b)]);
    expect(results.map(r => r.status)).toEqual(["fulfilled", "rejected"]);
    expect([...f.disk.keys()].filter(p => p.endsWith(".commit.json"))).toHaveLength(1);
  });
});

describe("resolution evidence integrity boundary", () => {
  it.each(["operationId", "recordHash", "source path", "source ctime", "source hash", "unknown field", "decision", "evidence hash"])("rejects a %s forgery even with a recomputed commit hash", async field => {
    const f = await incident(); await f.service.resolve(await f.service.reviewResolution(f.id, () => true));
    const path = [...f.disk.keys()].find(p => p.includes("/resolution-") && !p.endsWith(".commit.json"))!;
    const receipt = JSON.parse(f.disk.get(path)!) as Omit<ResolutionRecord, "decision"> & { decision: string; ignoreEverything?: boolean };
    if (field === "operationId") receipt.operationId = "0".repeat(64);
    if (field === "recordHash") receipt.recordHash = "0".repeat(64);
    if (field === "source path") receipt.source.path = "../secret.md";
    if (field === "source ctime") receipt.source.created++;
    if (field === "source hash") receipt.source.hash = "0".repeat(64);
    if (field === "unknown field") receipt.ignoreEverything = true;
    if (field === "decision") receipt.decision = "force_undo";
    if (field === "evidence hash") receipt.evidenceHash = "0".repeat(64);
    const raw = JSON.stringify(receipt); f.disk.set(path, raw);
    const commitPath = path.slice(0, -5) + ".commit.json", commit = JSON.parse(f.disk.get(commitPath)!) as { sha256: string };
    commit.sha256 = await checksum(raw); f.disk.set(commitPath, JSON.stringify(commit));
    const row = (await f.restart().history())[0];
    expect(row).toMatchObject({ state: "conflict", canUndo: false }); expect(row.resolution).toBeUndefined();
    expect(f.vault.process).not.toHaveBeenCalled();
  });
  it("does not follow a malformed adapter listing outside the operation directory", async () => {
    const f = await incident(), list = f.adapter.list.getMockImplementation()!;
    const outside = "x".repeat(f.dir.length + 1) + "resolution-11111111-1111-4111-8111-111111111111.json";
    f.adapter.list.mockImplementation(async path => path === f.dir ? { files: [outside], folders: [] } : list(path));
    f.adapter.read.mockClear(); const row = (await f.service.history())[0];
    expect(row.canResolve).toBe(false); expect(f.adapter.read.mock.calls.some(([p]) => p === outside)).toBe(false);
  });
  it("a new root incident stays global even after resolving a known operation", async () => {
    const f = await incident(); f.disk.set(`${f.journal.root}/unknown`, "untrusted");
    await f.service.resolve(await f.service.reviewResolution(f.id, () => true));
    const g = setup("add_link", "elsewhere/");
    await expect(new SafeApplyService(f.journal, g.port).review(g.plan, g.analysis, () => true)).rejects.toEqual(reason("storage"));
    expect((await f.service.history()).some(r => r.state === "resolved")).toBe(true);
  });
});

describe("fresh source observations", () => {
  it("a guard identity failure is not reported as a verified source or an editor conflict", async () => {
    const f = await incident(); vi.spyOn(f.port, "guard").mockImplementation(() => { throw new SafeApplyError("stale"); });
    const row = (await f.service.history())[0];
    expect(row).toMatchObject({ sourceState: "identity", editorBlocked: false, canResolve: false });
  });
  it("changing from before to after between the diagnostic read and review invalidates the preview", async () => {
    const f = await incident("before"), read = f.port.read.bind(f.port); let count = 0;
    vi.spyOn(f.port, "read").mockImplementation(async path => {
      if (++count === 2) f.contents.set(f.plan.sourcePath, f.plan.after);
      return read(path);
    });
    await expect(f.service.reviewResolution(f.id, () => true)).rejects.toEqual(reason("conflict"));
    expect([...f.disk.keys()].some(p => p.includes("resolution-"))).toBe(false);
  });
});

// A different, strictly valid historical operation with a missing recovery copy.
async function undoIncident(f: ReturnType<typeof setup>, record: OperationRecord, sourcePath = record.sourcePath, targetPath = record.targetPath) {
  const damaged = { ...record, sourcePath, targetPath, sourceModified: record.sourceModified + 100,
    selection: { ...record.selection }, edit: { ...record.edit, inserted: ` [[${targetPath.slice(0, -3)}]]` } };
  damaged.after = damaged.before.slice(0, damaged.edit.start) + damaged.edit.inserted + damaged.before.slice(damaged.edit.end);
  damaged.afterHash = await checksum(damaged.after);
  damaged.id = await checksum(JSON.stringify({ ...damaged, id: "", createdAt: 0 }));
  await f.journal.prepare(damaged);
  f.disk.delete(`${f.journal.root}/${damaged.id}/backup.json`);
  return damaged.id;
}

describe("Undo shares Apply's journal blockers", () => {
  async function applied() {
    const f = setup(), review = await apply(f), record = (await f.journal.entries())[0].record!;
    f.vault.process.mockClear();
    return { ...f, id: review.id, record, pending: `${f.journal.root}/${review.id}/undo_pending.json`, undone: `${f.journal.root}/${review.id}/undone.json` };
  }
  function untouched(f: Awaited<ReturnType<typeof applied>>, original: Map<string, string>) {
    expect(f.contents.get(f.plan.sourcePath)).toBe(f.plan.after);
    expect(f.vault.process).not.toHaveBeenCalled(); expect(f.disk).toEqual(original);
    expect(f.disk.has(f.pending)).toBe(false); expect(f.disk.has(f.undone)).toBe(false);
  }
  it.each(["root", "unknown operation"])("global %s damage refuses Undo review without writes", async kind => {
    const f = await applied();
    if (kind === "root") f.disk.set(`${f.journal.root}/unknown.json`, "{");
    else {
      const dir = `${f.journal.root}/${"0".repeat(64)}`; f.folders.add(dir); f.disk.set(`${dir}/record.json`, "{");
    }
    const original = new Map(f.disk);
    await expect(f.service.reviewUndo(f.id, () => true)).rejects.toEqual(reason("storage")); untouched(f, original);
  });
  it.each([["source", "source"], ["source", "target"], ["target", "source"], ["target", "target"]] as const)(
    "incident %s matching Undo %s blocks review", async (incidentSide, undoSide) => {
      const f = await applied(), path = undoSide === "source" ? f.record.sourcePath : f.record.targetPath;
      await undoIncident(f, f.record, incidentSide === "source" ? path : "Other/Source.md", incidentSide === "target" ? path : "Other/Target.md");
      const original = new Map(f.disk);
      await expect(f.service.reviewUndo(f.id, () => true)).rejects.toEqual(reason("storage")); untouched(f, original);
    });
  it("an independent incident allows exact Undo and still prevents a second Undo", async () => {
    const f = await applied(); await undoIncident(f, f.record, "Other/Source.md", "Other/Target.md");
    const review = await f.service.reviewUndo(f.id, () => true); await f.service.undo(review);
    expect(f.contents.get(f.plan.sourcePath)).toBe(f.plan.before); expect(f.vault.process).toHaveBeenCalledOnce();
    expect((await f.restart().history()).find(r => r.id === f.id)?.state).toBe("undone");
    await expect(f.service.undo(review)).rejects.toEqual(reason("used"));
    await expect(f.service.reviewUndo(f.id, () => true)).rejects.toEqual(reason("conflict"));
  });
  it.each(["global", "source", "target"])("a new %s incident after preview refuses before undo_pending", async scope => {
    const f = await applied(), review = await f.service.reviewUndo(f.id, () => true);
    if (scope === "global") f.disk.set(`${f.journal.root}/unknown`, "{");
    else await undoIncident(f, f.record, scope === "source" ? f.record.sourcePath : "Other/Source.md", scope === "target" ? f.record.targetPath : "Other/Target.md");
    const original = new Map(f.disk);
    await expect(f.service.undo(review)).rejects.toEqual(reason("storage")); untouched(f, original);
    await expect(f.service.undo(review)).rejects.toEqual(reason("used"));
  });
  it("a new incident during undo_pending IO prevents Markdown processing, retaining only the truthful intent", async () => {
    const f = await applied(), review = await f.service.reviewUndo(f.id, () => true), write = f.adapter.write.getMockImplementation()!;
    f.adapter.write.mockImplementation(async (path, raw) => { await write(path, raw); if (path === f.pending) f.disk.set(`${f.journal.root}/unknown`, "{"); });
    await expect(f.service.undo(review)).rejects.toEqual(reason("storage"));
    expect(f.disk.has(f.pending)).toBe(true); expect(f.disk.has(f.undone)).toBe(false);
    expect(f.contents.get(f.plan.sourcePath)).toBe(f.plan.after); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it("a committed resolution permits the other operation's Undo after restart, never the damaged operation's Undo", async () => {
    const f = await applied(), incidentId = await undoIncident(f, f.record);
    await f.service.resolve(await f.service.reviewResolution(incidentId, () => true));
    const service = f.restart(), original = new Map(f.disk);
    await service.undo(await service.reviewUndo(f.id, () => true));
    expect(f.contents.get(f.plan.sourcePath)).toBe(f.plan.before); expect(f.vault.process).toHaveBeenCalledOnce();
    for (const [path, raw] of original) expect(f.disk.get(path)).toBe(raw);
    await expect(service.reviewUndo(incidentId, () => true)).rejects.toEqual(reason("conflict"));
  });
  it("a previously resolved incident whose evidence changed blocks a pending Undo again", async () => {
    const f = await applied(), incidentId = await undoIncident(f, f.record);
    await f.service.resolve(await f.service.reviewResolution(incidentId, () => true));
    const review = await f.service.reviewUndo(f.id, () => true);
    f.disk.set(`${f.journal.root}/${incidentId}/backup.json`, "{different");
    const original = new Map(f.disk);
    await expect(f.service.undo(review)).rejects.toEqual(reason("storage")); untouched(f, original);
  });
  it.each(["editor", "closed", "ctime"])("%s during blocker IO refuses before undo intent", async changed => {
    const f = await applied(); let active = true;
    const review = await f.service.reviewUndo(f.id, () => active), entries = f.journal.entries.bind(f.journal); let reads = 0;
    vi.spyOn(f.journal, "entries").mockImplementation(async () => {
      const result = await entries();
      if (++reads === 2) {
        if (changed === "editor") f.editor(f.plan.after);
        else if (changed === "ctime") f.pair[0].file.stat.ctime++;
        else active = false;
      }
      return result;
    });
    const original = new Map(f.disk);
    await expect(f.service.undo(review)).rejects.toEqual(reason(changed === "editor" ? "editor" : changed === "ctime" ? "conflict" : "cancelled")); untouched(f, original);
  });
});
