import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", async () => {
  // eslint-disable-next-line import/no-extraneous-dependencies -- Test double only; native acceptance uses Obsidian's parser.
  const yaml = await import("js-yaml") as { load(s: string): unknown };
  return { TFile: class {}, MarkdownView: class {}, parseYaml: (s: string) => yaml.load(s), getLanguage: () => "en", parseLinktext: (s: string) => ({ path: s.split("#")[0] }), requestUrl: vi.fn() };
});
import { requestUrl, TFile } from "obsidian";
import { archiveApplyFixture as setup } from "../tests/archiveApplyFixture";
import { checksum } from "./operationJournal";
import type { OperationRecord } from "./operationJournal";
import { multiRecord } from "./multiFileJournal";
import { validateArchiveRecord } from "./archiveJournal";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const reason = (reason: string): unknown => expect.objectContaining({ reason });
function preserved(f: Awaited<ReturnType<typeof setup>>, canonical = f.mergePlan.canonical.after) {
  expect(Buffer.from(f.contents.get(f.mergePlan.canonical.path)!)).toEqual(Buffer.from(canonical));
  expect(f.vault.process.mock.calls.every(([file]) => file.path === f.mergePlan.secondary.path)).toBe(true);
  for (const fn of [f.vault.modify, f.vault.create, f.vault.delete, f.vault.rename, requestUrl]) expect(fn).not.toHaveBeenCalled();
}
async function applied(f: Awaited<ReturnType<typeof setup>>) { const r = await f.review(); await f.archive.execute(r); return r; }
describe("Archive Apply and proven sequential Undo", () => {
  it.each([0, 1] as const)("canonical %s: literal YAML, Unicode/CRLF and full restart rollback chain", async side => {
    for (const prefix of ["", '---\n# user comment\ntags: [one, two]\nrelated: "[[Missing]]"\n---\n\n']) for (const crlf of [false, true]) {
      const f = await setup(side, prefix, crlf), parent = [...f.disk]; expect(f.plan).toBeDefined();
      const r = await f.review(); expect([...f.disk]).toEqual(parent); expect(f.vault.process).not.toHaveBeenCalled();
      await f.archive.execute(r); expect(f.contents.get(f.plan.secondary.path)).toBe(f.plan.secondary.after); preserved(f);
      expect([...f.disk].filter(([p]) => p.includes("consolidation-merge-operations"))).toEqual(parent);
      await expect(f.archive.execute(r)).rejects.toEqual(reason("used"));
      const restarted = f.restart();
      await expect(restarted.merge!.reviewUndo(f.mergeReview.id, () => true)).rejects.toEqual(reason("archive_active"));
      preserved(f); const undo = await restarted.archive!.reviewUndo(r.id, () => true); await restarted.archive!.execute(undo);
      expect(f.contents.get(f.plan.secondary.path)).toBe(f.plan.secondary.before); preserved(f);
      expect(f.vault.getFileByPath(f.plan.secondary.path)!.stat.mtime).not.toBe(f.plan.secondary.modified);
      const again = f.restart(); expect((await again.archive!.history())[0].parentUndo).toBe("merge_ready");
      await expect(again.archive!.reviewUndo(r.id, () => true)).rejects.toEqual(reason("conflict"));
      await expect(again.archive!.review(f.plan, () => true)).rejects.toThrow();
      f.vault.process.mockClear(); const mergeUndo = await again.merge!.reviewUndo(f.mergeReview.id, () => true); await again.merge!.execute(mergeUndo);
      expect(f.contents).toEqual(f.original); expect(f.vault.process.mock.calls.map(([file]) => file.path)).toEqual([f.plan.canonical.path]);
    }
  });
  it.each(["---\nveynrel_canonical: old\n---\n\n", "---\n'quoted key': value\n---\n\n"])("refuses conflicting or ambiguous YAML: %s", async prefix => {
    const f = await setup(0, prefix); expect(f.plan).toBeUndefined(); expect(f.session.view.stage).toBe("error"); preserved(f);
    expect(f.adapter.write).not.toHaveBeenCalled(); expect(f.adapter.copy).not.toHaveBeenCalled();
  });
  it.each(["canonical", "secondary"] as const)("rejects %s edits after consent and after archive", async side => {
    const f = await setup(), r = await f.review(); f.edit(f.plan[side].path, f.contents.get(f.plan[side].path)! + "\nUSER\n");
    await expect(f.archive.execute(r)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled();
    const g = await setup(), appliedReview = await applied(g); g.edit(g.plan[side].path, g.contents.get(g.plan[side].path)! + "\nUSER\n");
    const before = new Map(g.contents); await expect(g.restart().archive!.reviewUndo(appliedReview.id, () => true)).rejects.toThrow(); expect(g.contents).toEqual(before);
  });
  it.each([0, 1])("rejects affected editor %s before consent and dispatch", async side => {
    const f = await setup(), r = await f.review(); f.editor(side);
    await expect(f.archive.execute(r)).rejects.toEqual(reason("editor")); expect(f.vault.process).not.toHaveBeenCalled();
    await expect(f.review()).rejects.toEqual(reason("editor"));
  });
  it("checks the current callback before and never uses a public preview as write authority", async () => {
    const f = await setup(), r = await f.review(); r.record.plan.secondary.after = "UNTRUSTED";
    f.vault.process.mockImplementationOnce(async (_file, cb) => cb(f.plan.secondary.before + "external"));
    await expect(f.archive.execute(r)).rejects.toEqual(reason("write")); expect(f.contents.get(f.plan.secondary.path)).toBe(f.plan.secondary.before); preserved(f);
  });
  it.each(["record.json", "backup.json"])("rechecks parent %s after consent", async name => {
    const f = await setup(), r = await f.review(); f.disk.set(`${f.mergeJournal.root}/${f.mergeReview.id}/${name}`, "{partial");
    await expect(f.archive.execute(r)).rejects.toEqual(reason("archive_parent")); expect(f.vault.process).not.toHaveBeenCalled(); preserved(f);
  });
  it("revalidates archive structure even if a tampered record has fresh checksums", async () => {
    const f = await setup(), r = (await f.review()).record;
    for (const mutate of [(v: typeof r) => { v.plan.secondary.after += "\nEVIL"; }, (v: typeof r) => { v.plan.preservation.pop(); },
      (v: typeof r) => { v.plan.edit.inserted += "hidden: true\n"; }, (v: typeof r) => { v.plan.canonical.content = "different"; }]) {
      const v = structuredClone(r); mutate(v); v.afterHash = await checksum(v.plan.secondary.after); v.id = await checksum(JSON.stringify({ ...v, id: "", createdAt: 0 }));
      await expect(validateArchiveRecord(v, v.id)).rejects.toThrow();
    }
  });
});

describe("archive faults and shared exclusion", () => {
  it("an empty operation directory after a failed first write remains a global blocker", async () => {
    const f = await setup(), r = await f.review(); f.adapter.write.mockRejectedValueOnce(Error("interrupted before record"));
    await expect(f.archive.execute(r)).rejects.toEqual(reason("storage"));
    const folders = new Set(f.folders), restarted = f.restart(), rows = await restarted.archive!.history();
    expect(rows).toEqual([expect.objectContaining({ damaged: true, scope: "global", state: "conflict", canUndo: false })]);
    await expect(restarted.merge!.reviewUndo(f.mergeReview.id, () => true)).rejects.toThrow();
    expect(f.folders).toEqual(folders); expect(f.disk.has(`${f.archiveJournal.root}/${r.id}/record.json`)).toBe(false);
    expect(f.vault.process).not.toHaveBeenCalled(); preserved(f);
  });
  it("history reads each journal once and never lends its snapshot to later consent", async () => {
    const f = await setup(), r = await applied(f);
    const spies = [f.journal, f.multiJournal, f.mergeJournal, f.archiveJournal].map(j => vi.spyOn(j, "entries"));
    for (const service of [f.service.merge!, f.archive]) {
      spies.forEach(s => s.mockClear());
      await service.history();
      for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    }
    f.disk.set(`${f.mergeJournal.root}/${f.mergeReview.id}/backup.json`, "{torn");
    await expect(f.archive.reviewUndo(r.id, () => true)).rejects.toThrow();
    expect(f.contents.get(f.plan.secondary.path)).toBe(f.plan.secondary.after); preserved(f);
  });
  it.each(["before_backup", "first_copy", "both_copies", "before_process", "after_process", "applied_marker", "undo_intent", "undo_process", "undone_marker"])("restart after %s preserves every byte and never repairs automatically", async point => {
    const f = await setup(), undoFault = point.startsWith("undo"), r = undoFault ? await applied(f) : await f.review();
    const ticket = undoFault ? await f.archive.reviewUndo(r.id, () => true) : r;
    const prepare = f.archiveJournal.prepare.bind(f.archiveJournal), process = f.port.process.bind(f.port);
    if (point === "before_backup") vi.spyOn(f.archiveJournal, "prepare").mockRejectedValueOnce(Error("power loss"));
    if (point === "first_copy") f.adapter.copy.mockRejectedValueOnce(Error("power loss"));
    if (point === "both_copies") vi.spyOn(f.archiveJournal, "prepare").mockImplementationOnce(async record => { await prepare(record); throw Error("power loss"); });
    if (point === "before_process") vi.spyOn(f.port, "process").mockRejectedValueOnce(Error("power loss"));
    if (point === "after_process" || point === "undo_process") vi.spyOn(f.port, "process").mockImplementationOnce(async (...args) => { await process(...args); throw Error("power loss"); });
    if (["applied_marker", "undo_intent", "undone_marker"].includes(point)) f.adapter.write.mockImplementation(async (path, raw) => {
      const state = path.includes("/mark-") ? (JSON.parse(raw) as { state: string }).state : "";
      if (path.startsWith(f.archiveJournal.root) && state === (point === "applied_marker" ? "applied" : point === "undo_intent" ? "undo_intent" : "undone")) {
        f.disk.set(path, point === "undo_intent" ? raw : "{torn"); throw Error("power loss");
      }
      f.disk.set(path, raw);
    });
    await expect(f.archive.execute(ticket)).rejects.toThrow(); preserved(f);
    vi.restoreAllMocks(); f.adapter.write.mockImplementation(async (path, raw) => { f.disk.set(path, raw); });
    const before = new Map(f.contents), evidence = new Map(f.disk), restarted = f.restart(), rows = await restarted.archive!.history();
    expect(f.contents).toEqual(before); expect(f.disk).toEqual(evidence);
    const after = ["after_process", "applied_marker", "undo_intent"].includes(point);
    expect(f.contents.get(f.plan.secondary.path)).toBe(after ? f.plan.secondary.after : f.plan.secondary.before);
    if (point === "before_backup") expect(rows).toEqual([]);
    else {
      expect(rows[0].state).toBe(after ? "applied" : undoFault ? "undone" : "prepared");
      expect(rows[0].canUndo).toBe(point === "after_process" || point === "undo_intent");
      await expect(restarted.merge!.reviewUndo(f.mergeReview.id, () => true)).rejects.toThrow();
      expect(f.contents).toEqual(before);
      if (rows[0].canUndo) {
        await restarted.archive!.execute(await restarted.archive!.reviewUndo(r.id, () => true));
        expect(f.contents.get(f.plan.secondary.path)).toBe(f.plan.secondary.before);
        // A missing applied receipt is never fabricated during explicit recovery Undo.
        if (point === "after_process") await expect(restarted.merge!.reviewUndo(f.mergeReview.id, () => true)).rejects.toEqual(reason("archive_chain"));
        else expect((await restarted.merge!.reviewUndo(f.mergeReview.id, () => true)).action).toBe("undo");
      }
    }
    preserved(f);
  });
  it.each(["applied", "undo_intent", "undone"])("missing %s receipt never grants the parent mtime exception", async state => {
    const f = await setup(), r = await applied(f); await f.archive.execute(await f.archive.reviewUndo(r.id, () => true));
    for (const [path, raw] of f.disk) if (path.startsWith(f.archiveJournal.root) && path.includes("/mark-") && (JSON.parse(raw) as { state: string }).state === state) f.disk.delete(path);
    const before = new Map(f.contents); await expect(f.restart().merge!.reviewUndo(f.mergeReview.id, () => true)).rejects.toThrow(); expect(f.contents).toEqual(before); preserved(f);
  });
  it("same restored text with a later mtime does not inherit the narrow permission", async () => {
    const f = await setup(), r = await applied(f); await f.archive.execute(await f.archive.reviewUndo(r.id, () => true));
    f.edit(f.plan.secondary.path, f.plan.secondary.before);
    await expect(f.restart().merge!.reviewUndo(f.mergeReview.id, () => true)).rejects.toThrow(); preserved(f);
  });
  it.each(["single", "multi", "merge", "archive"])("new global %s incident after consent prevents dispatch", async kind => {
    const f = await setup(), r = await f.review();
    const j = kind === "single" ? f.journal : kind === "multi" ? f.multiJournal : kind === "merge" ? f.mergeJournal : f.archiveJournal;
    f.folders.add(j.root); f.disk.set(j.root + "/unknown.json", "{}");
    await expect(f.archive.execute(r)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled(); preserved(f);
  });
  it.each(["single", "multi", "merge", "archive"])("local %s corruption after backups prevents dispatch", async kind => {
    const f = await setup(), r = await f.review(), prepare = f.archiveJournal.prepare.bind(f.archiveJournal);
    vi.spyOn(f.archiveJournal, "prepare").mockImplementationOnce(async record => {
      await prepare(record);
      if (kind === "single") {
        const p = f.single, op: OperationRecord = { version: 1, operation: "add_link", state: "prepared", id: "", createdAt: 1,
          sourcePath: p.sourcePath, targetPath: p.targetPath, sourceCreated: 1, sourceModified: 2, targetCreated: 1, targetModified: 2,
          before: p.before, after: p.after, beforeHash: await checksum(p.before), afterHash: await checksum(p.after), targetHash: await checksum(p.target.content), selection: p.selection!, edit: p.edit! };
        op.id = await checksum(JSON.stringify({ ...op, id: "", createdAt: 0 })); await f.journal.prepare(op); f.disk.set(`${f.journal.root}/${op.id}/backup.json`, "bad");
      } else if (kind === "multi") {
        const op = await multiRecord(f.multi); await f.multiJournal.prepare(op); f.disk.set(`${f.multiJournal.root}/${op.id}/backup.json`, "bad");
      } else if (kind === "merge") f.disk.set(`${f.mergeJournal.root}/${f.mergeReview.id}/backup.json`, "bad");
      else f.disk.set(`${f.archiveJournal.root}/${r.id}/backup.json`, "bad");
    });
    await expect(f.archive.execute(r)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled(); preserved(f);
  });
  it("one shared owner excludes all review, Undo and resolution entry points during dispatch", async () => {
    const f = await setup(), first = await f.review(), second = await f.review();
    let release!: () => void, entered!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
    const process = f.port.process.bind(f.port); vi.spyOn(f.port, "process").mockImplementationOnce(async (...args) => { entered(); await pending; await process(...args); });
    const executing = f.archive.execute(first); await started;
    for (const run of [() => f.archive.execute(second), () => f.service.review(f.single, f.analysis, () => true),
      () => f.service.multi!.review(f.multi, f.analysis, () => true), () => f.service.merge!.review(f.mergePlan, f.analysis, () => true),
      () => f.service.reviewUndo("id", () => true), () => f.service.multi!.reviewUndo("id", () => true),
      () => f.service.merge!.reviewUndo(f.mergeReview.id, () => true), () => f.archive.reviewUndo(first.id, () => true),
      () => f.service.reviewResolution("id", () => true)]) await expect(run()).rejects.toEqual(reason("busy"));
    release(); await executing; expect(f.vault.process).toHaveBeenCalledTimes(1); preserved(f);
  });
  it("parent provenance and archive receipts are reread after native reads during Merge Undo", async () => {
    const f = await setup(), r = await applied(f); await f.archive.execute(await f.archive.reviewUndo(r.id, () => true));
    const ticket = await f.service.merge!.reviewUndo(f.mergeReview.id, () => true), read = f.port.read.bind(f.port);
    let damaged = false;
    vi.spyOn(f.port, "read").mockImplementation(async path => {
      const n = await read(path);
      if (!damaged) { damaged = true; f.disk.set(`${f.archiveJournal.root}/${r.id}/backup.json`, "{torn"); }
      return n;
    });
    const before = new Map(f.contents); await expect(f.service.merge!.execute(ticket)).rejects.toThrow(); expect(f.contents).toEqual(before); preserved(f);
  });
  it.each(["ctime", "mtime", "size", "identity", "path", "cache", "incoming"])("%s drift after archive consent prevents every write", async field => {
    const f = await setup(), r = await f.review(), file = f.vault.getFileByPath(f.plan.secondary.path)!;
    if (field === "ctime") file.stat.ctime++;
    if (field === "mtime") file.stat.mtime++;
    if (field === "size") file.stat.size++;
    if (field === "identity") vi.spyOn(f.vault, "getFileByPath").mockImplementation(p => p === f.plan.secondary.path ? Object.assign(new TFile(), file) : f.pair[0].file);
    if (field === "path") file.path = "Renamed.md";
    if (field === "cache") f.caches.set(file, { ...f.caches.get(file), headings: [] });
    if (field === "incoming") Object.assign(f.app.metadataCache, { resolvedLinks: {} });
    const before = new Map(f.contents); await expect(f.archive.execute(r)).rejects.toThrow(); expect(f.contents).toEqual(before); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it("public preview tampering cannot alter the private validated insertion", async () => {
    const f = await setup(), r = await f.review(); r.record.plan.secondary.after = "FORGED"; r.record.plan.edit.inserted = "hidden: true";
    await f.archive.execute(r); expect(f.contents.get(f.plan.secondary.path)).toBe(f.plan.secondary.after); preserved(f);
  });
  it("cancelled review and competing owner refuse before reserving journal data", async () => {
    const f = await setup(); let current = true; const r = await f.archive.review(f.plan, () => current); current = false;
    await expect(f.archive.execute(r)).rejects.toEqual(reason("cancelled")); expect(await f.archiveJournal.entries()).toEqual([]); preserved(f);
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
    const entries = f.journal.entries.bind(f.journal); vi.spyOn(f.journal, "entries").mockImplementationOnce(async () => { entered(); await held; return entries(); });
    const history = f.service.history(); await started; await expect(f.review()).rejects.toEqual(reason("busy")); release(); await history;
    expect(await f.archiveJournal.entries()).toEqual([]); preserved(f);
  });
  it.each(["parent", "archive", "canonical", "secondary"])("rechecks %s after persisting Undo intent", async fault => {
    const f = await setup(), r = await applied(f), undo = await f.archive.reviewUndo(r.id, () => true), mark = f.archiveJournal.mark.bind(f.archiveJournal);
    vi.spyOn(f.archiveJournal, "mark").mockImplementationOnce(async (...args) => {
      await mark(...args);
      if (fault === "parent") f.disk.set(`${f.mergeJournal.root}/${f.mergeReview.id}/backup.json`, "bad");
      if (fault === "archive") f.disk.set(`${f.archiveJournal.root}/${r.id}/backup.json`, "bad");
      if (fault === "canonical" || fault === "secondary") f.edit(f.plan[fault].path, f.contents.get(f.plan[fault].path)! + "\nUSER\n");
    });
    f.vault.process.mockClear(); await expect(f.archive.execute(undo)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled();
    expect(f.contents.get(f.plan.secondary.path)).toBe(f.plan.secondary.after + (fault === "secondary" ? "\nUSER\n" : ""));
  });
});
