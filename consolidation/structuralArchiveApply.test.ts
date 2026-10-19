import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", async () => {
  // eslint-disable-next-line import/no-extraneous-dependencies -- Existing local parser; native tests use Obsidian.
  const yaml = await import("js-yaml") as { load(s: string): unknown };
  return { TFile: class {}, MarkdownView: class {}, Modal: class {}, getLanguage: () => "en", requestUrl: vi.fn(),
    parseYaml: (s: string) => yaml.load(s), parseLinktext: (s: string) => ({ path: s.split("#")[0], subpath: s.includes("#") ? s.slice(s.indexOf("#")) : "" }) };
});
import { TFile } from "obsidian";
import { structuralArchiveFixture } from "../tests/structuralArchiveFixture";
import type { GroupReview } from "./groupApply";
import type { BundleReview } from "./bundleApply";
const executeParent = (f: Awaited<ReturnType<typeof structuralArchiveFixture>>, r: GroupReview | BundleReview) => r.record.operation === "copy_context_group"
  ? f.service.group!.execute(r as GroupReview) : f.service.bundle!.execute(r as BundleReview);
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe.each(["group", "bundle"] as const)("structural archive %s", kind => {
  it("restores both original documents through a receipt-bound secondary mtime exception", async () => {
    const f = await structuralArchiveFixture(kind), p = f.archivePlan;
    const beforeJournal = [...f.disk]; const review = await f.archive.review(p, () => true);
    expect([...f.disk]).toEqual(beforeJournal); expect(f.vault.process).not.toHaveBeenCalled();
    await f.archive.execute(review);
    expect(f.contents.get(p.secondary.path)).toBe(p.secondary.after); expect(f.contents.get(p.canonical.path)).toBe(p.canonical.content);
    await expect(f.parent.reviewUndo(f.parentId, () => true)).rejects.toThrow();
    const restarted = f.restart(); await restarted.structuralArchive!.execute(await restarted.structuralArchive!.reviewUndo(review.id, () => true));
    expect(f.contents.get(p.secondary.path)).toBe(p.secondary.before);
    expect(f.vault.getFileByPath(p.secondary.path)!.stat.mtime).not.toBe(p.secondary.modified);
    const again = f.restart(); expect((await again[kind]!.history())[0].canUndo).toBe(true);
    if (kind === "group") await again.group!.execute(await again.group!.reviewUndo(f.parentId, () => true));
    else await again.bundle!.execute(await again.bundle!.reviewUndo(f.parentId, () => true));
    expect([f.contents.get(p.canonical.path), f.contents.get(p.secondary.path)]).toEqual(f.original);
    expect((await again.structuralArchive!.history())[0].parentUndo).toBe("parent_unavailable");
    expect(f.vault.process.mock.calls.map(([file]) => file.path)).toEqual([p.secondary.path, p.secondary.path, p.canonical.path]);
  });
});

it.each([1, 2, 3] as const)("Group H%s exact cycle with Unicode/CRLF and reverse canonical side", async level => {
  const f = await structuralArchiveFixture("group", 1, true, level), r = await f.archive.review(f.archivePlan, () => true);
  await f.archive.execute(r); await f.archive.execute(await f.archive.reviewUndo(r.id, () => true));
  await f.service.group!.execute(await f.service.group!.reviewUndo(f.parentId, () => true));
  expect([f.contents.get(f.archivePlan.canonical.path), f.contents.get(f.archivePlan.secondary.path)]).toEqual(f.original);
});
it.each(["```js\nreturn 1;\n```", "- Один 🪶\n- Two 中文", "> Наблюдение é.\n> Second line."])("Bundle %s restores exact CRLF original", async core => {
  const f = await structuralArchiveFixture("bundle", 1, true, 3, core), r = await f.archive.review(f.archivePlan, () => true);
  await f.archive.execute(r); await f.archive.execute(await f.archive.reviewUndo(r.id, () => true));
  await f.service.bundle!.execute(await f.service.bundle!.reviewUndo(f.parentId, () => true));
  expect([f.contents.get(f.archivePlan.canonical.path), f.contents.get(f.archivePlan.secondary.path)]).toEqual(f.original);
});
describe.each(["group", "bundle"] as const)("%s refusal and recovery", kind => {
  it.each(["type", "id", "hash", "missing_parent", "parent_copies", "parent_torn", "parent_duplicate", "canonical", "secondary", "ctime", "metadata", "resolver", "incoming", "editor", "partition"])("refuses %s before any archive journal preparation", async failure => {
    const f = await structuralArchiveFixture(kind), p = JSON.parse(JSON.stringify(f.archivePlan)) as typeof f.archivePlan;
    const root = `${kind === "group" && "groupJournal" in f ? f.groupJournal.root : f.bundleJournal.root}/${f.parentId}`;
    const mark = [...f.disk.keys()].find(p => p.startsWith(root) && p.includes("mark-"))!;
    if (failure === "type") p.provenance.operation = kind === "group" ? "context_bundle_copy" : "copy_context_group";
    if (failure === "id") p.provenance.id = "0".repeat(64);
    if (failure === "hash") p.provenance.recordHash = "0".repeat(64);
    if (failure === "missing_parent") f.disk.delete(root + "/backup.json");
    if (failure === "parent_copies") f.disk.set(root + "/backup.json", f.disk.get(root + "/backup.json")!.replace('"createdAt":', '"unknown":0,"createdAt":'));
    if (failure === "parent_torn") f.disk.set(mark, "{");
    if (failure === "parent_duplicate") { const m = JSON.parse(f.disk.get(mark)!) as { attempt: string }; m.attempt = crypto.randomUUID(); f.disk.set(`${root}/mark-${m.attempt}.json`, JSON.stringify(m)); }
    if (failure === "canonical" || failure === "secondary") f.contents.set(p[failure].path, "changed");
    if (failure === "ctime") f.vault.getFileByPath(p.secondary.path)!.stat.ctime++;
    if (failure === "metadata") f.caches.set(f.vault.getFileByPath(p.secondary.path)!, null);
    if (failure === "resolver") f.app.metadataCache.getFirstLinkpathDest = () => null;
    if (failure === "incoming") f.app.metadataCache.resolvedLinks["New.md"] = { [p.secondary.path]: 1 };
    if (failure === "editor") f.editor();
    if (failure === "partition") p.partition.splice(0, 1);
    await expect(f.archive.review(p, () => true)).rejects.toThrow();
    expect(await f.structuralJournal.entries()).toEqual([]); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it.each(["backup", "record", "torn", "duplicate", "conflict", "missing_applied", "missing_intent", "missing_undone", "unknown", "parent", "mtime", "secondary", "canonical", "metadata", "incoming", "resolver", "editor"])("incomplete or changed chain (%s) never enables Parent Undo", async failure => {
    const f = await structuralArchiveFixture(kind), r = await f.archive.review(f.archivePlan, () => true);
    await f.archive.execute(r); await f.archive.execute(await f.archive.reviewUndo(r.id, () => true));
    const root = `${f.structuralJournal.root}/${r.id}`, marks = [...f.disk.keys()].filter(p => p.startsWith(root) && p.includes("mark-"));
    const mark = (state: string) => marks.find(p => (JSON.parse(f.disk.get(p)!) as { state: string }).state === state)!;
    if (failure === "backup" || failure === "record") f.disk.delete(root + `/${failure}.json`);
    if (failure === "torn") f.disk.set(mark("undone"), "{");
    if (failure === "duplicate" || failure === "conflict") { const m = JSON.parse(f.disk.get(mark("undone"))!) as { attempt: string; modified: number }; m.attempt = crypto.randomUUID(); if (failure === "conflict") m.modified++; f.disk.set(`${root}/mark-${m.attempt}.json`, JSON.stringify(m)); }
    if (failure.startsWith("missing_")) f.disk.delete(mark(failure === "missing_intent" ? "undo_intent" : failure.slice(8)));
    if (failure === "unknown") f.disk.set(`${root}/unknown.json`, "{}");
    if (failure === "parent") { const j = kind === "group" && "groupJournal" in f ? f.groupJournal : f.bundleJournal; f.disk.delete(`${j.root}/${f.parentId}/backup.json`); }
    if (failure === "mtime") f.vault.getFileByPath(f.archivePlan.secondary.path)!.stat.mtime++;
    if (failure === "secondary" || failure === "canonical") f.contents.set(f.archivePlan[failure].path, "changed");
    if (failure === "metadata") f.caches.set(f.vault.getFileByPath(f.archivePlan.secondary.path)!, null);
    if (failure === "incoming") f.app.metadataCache.resolvedLinks["new.md"] = { [f.archivePlan.secondary.path]: 1 };
    if (failure === "resolver") f.app.metadataCache.getFirstLinkpathDest = () => null;
    if (failure === "editor") f.editor(1);
    f.vault.process.mockClear(); const disk = [...f.disk], contents = [...f.contents];
    const restarted = f.restart(); expect((await restarted[kind]!.history())[0].canUndo).toBe(false);
    await expect(restarted[kind]!.reviewUndo(f.parentId, () => true)).rejects.toThrow();
    expect([...f.disk]).toEqual(disk); expect([...f.contents]).toEqual(contents); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it.each(["secondary", "canonical", "metadata", "incoming", "editor", "receipt"])("Archive Undo refuses changed %s", async failure => {
    const f = await structuralArchiveFixture(kind), r = await f.archive.review(f.archivePlan, () => true); await f.archive.execute(r);
    if (failure === "secondary" || failure === "canonical") f.contents.set(f.archivePlan[failure].path, "user edit");
    if (failure === "metadata") f.caches.set(f.vault.getFileByPath(f.archivePlan.secondary.path)!, null);
    if (failure === "incoming") f.app.metadataCache.resolvedLinks["new.md"] = { [f.archivePlan.secondary.path]: 1 };
    if (failure === "editor") f.editor(1);
    if (failure === "receipt") f.disk.set([...f.disk.keys()].find(p => p.includes(r.id) && p.includes("mark-"))!, "{");
    const before = [...f.contents]; await expect(f.archive.reviewUndo(r.id, () => true)).rejects.toThrow(); expect([...f.contents]).toEqual(before);
  });
  it("one-shot and competing tickets cannot replay Apply or Undo", async () => {
    const f = await structuralArchiveFixture(kind), a = await f.archive.review(f.archivePlan, () => true), b = await f.archive.review(f.archivePlan, () => true);
    await f.archive.execute(a); await expect(f.archive.execute(a)).rejects.toThrow("used"); await expect(f.archive.execute(b)).rejects.toThrow();
    const undo = await f.archive.reviewUndo(a.id, () => true); await f.archive.execute(undo);
    await expect(f.archive.execute(undo)).rejects.toThrow("used"); await expect(f.archive.reviewUndo(a.id, () => true)).rejects.toThrow();
    await expect(f.archive.review(f.archivePlan, () => true)).rejects.toThrow();
  });
});

import { checksum } from "./operationJournal";
import { validateStructuralArchiveRecord, structuralArchiveRecord } from "./structuralArchiveJournal";
import { structuralEvidence } from "./structuralArchiveEvidence";
import type { StructuralEnvironment } from "./structuralArchiveJournal";
it.each(["target_null", "target_unknown", "target_path", "incoming_count", "incoming_unknown", "outgoing_null", "consumer_duplicate", "yaml", "partition", "receipt"])("strict journal rejects rehashed %s evidence", async damage => {
  const f = await structuralArchiveFixture(), review = await f.archive.review(f.archivePlan, () => true), r = JSON.parse(JSON.stringify(review.record)) as typeof review.record;
  const e = JSON.parse(r.environment) as StructuralEnvironment;
  if (damage === "target_null") e.dependencies[0].targets = [null as never];
  if (damage === "target_unknown") e.dependencies[0].targets = [{ from: "A.md", kind: "link", original: "[[B]]", target: "B.md", subpath: "", extra: true } as never];
  if (damage === "target_path") e.dependencies[0].targets = [{ from: "../A.md", kind: "link", original: "[[B]]", target: "B.md", subpath: "" }];
  if (damage === "incoming_count") e.dependencies[0].incoming = [{ path: "A.md", count: -1, metadataAvailable: true, references: [] }];
  if (damage === "incoming_unknown") e.dependencies[0].incoming = [{ path: "A.md", count: 1, metadataAvailable: true, references: [{ kind: "link", target: r.plan.canonical.path, original: "[[C]]" }], extra: true } as never];
  if (damage === "outgoing_null") e.dependencies[0].outgoing = [null as never];
  if (damage === "consumer_duplicate") e.consumers = Array.from({ length: 2 }, () => ({ path: "C.md", created: 1, modified: 1, bytes: 1, metadata: {} }));
  r.plan.dependencies = e.dependencies; r.environment = structuralEvidence(e);
  if (damage === "yaml") { r.plan.edit.inserted = '---\nveynrel_archive_status: archived\n---\n'; r.plan.secondary.after = r.plan.edit.inserted + r.plan.secondary.before; r.hashes.after = await checksum(r.plan.secondary.after); r.hashes.edit = await checksum(JSON.stringify(r.plan.edit)); }
  if (damage === "partition") r.plan.partition.splice(0, 1);
  if (damage === "receipt") r.plan.provenance.receipt.modified++;
  r.id = await checksum(JSON.stringify({ ...r, id: "", createdAt: 0 })); await expect(validateStructuralArchiveRecord(r, r.id)).rejects.toThrow("storage");
});
const families = ["operations", "multi-operations", "merge-operations", "archive-operations", "bundle-operations", "group-operations", "empty-atom-operations", "structural-archive-operations"];
it.each(families)("eighth owner sees %s incidents after consent and after recovery copies", async family => {
  for (const afterCopy of [false, true]) {
    const f = await structuralArchiveFixture(), r = await f.archive.review(f.archivePlan, () => true);
    const root = `${f.vault.configDir}/plugins/ai-knowledge-hub/consolidation-${family}`;
    const incident = () => { f.folders.add(root); f.disk.set(root + "/unknown.json", "{}"); };
    if (afterCopy) { const copy = f.adapter.copy.getMockImplementation()!; f.adapter.copy.mockImplementationOnce(async (...args) => { await copy(...args); incident(); }); } else incident();
    await expect(f.archive.execute(r)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled();
  }
});
describe.each(["group", "bundle"] as const)("%s interrupted archive", kind => {
it.each(["before_prepare", "first_copy", "second_copy", "before_process", "after_process", "before_applied", "torn_applied", "undo_intent", "undo_after_process", "torn_undone"])("interruption at %s preserves evidence and never repairs on restart", async point => {
  const f = await structuralArchiveFixture(kind), apply = await f.archive.review(f.archivePlan, () => true);
  const undo = point.startsWith("undo") || point === "torn_undone";
  if (undo) await f.archive.execute(apply);
  const review = undo ? await f.archive.reviewUndo(apply.id, () => true) : apply;
  const root = `${f.structuralJournal.root}/${review.id}`;
  const write = f.adapter.write.getMockImplementation()!, copy = f.adapter.copy.getMockImplementation()!, process = f.vault.process.getMockImplementation()!;
  if (point === "before_prepare") f.archive.discard(review);
  if (["first_copy", "before_applied", "torn_applied", "undo_intent", "torn_undone"].includes(point)) f.adapter.write.mockImplementation(async (path, raw) => {
    const trigger = point === "first_copy" ? path === root + "/record.json" : path.includes(root + "/mark-") && (JSON.parse(raw) as { state: string }).state === (point === "undo_intent" ? "undo_intent" : point === "torn_undone" ? "undone" : "applied");
    if (trigger) { if (point !== "before_applied") await write(path, point.startsWith("torn_") ? raw.slice(0, 20) : raw); throw Error("interruption"); }
    await write(path, raw);
  });
  if (point === "second_copy") f.adapter.copy.mockImplementation(async (...args) => { await copy(...args); throw Error("interruption"); });
  if (["before_process", "after_process", "undo_after_process"].includes(point)) f.vault.process.mockImplementation(async (...args) => { if (point !== "before_process") await process(...args); throw Error("interruption"); });
  await expect(f.archive.execute(review)).rejects.toThrow();
  const before = [...f.contents], disk = [...f.disk], restarted = f.restart();
  await restarted.structuralArchive!.history(); const parent = (await restarted[kind]!.history())[0];
  expect(parent.canUndo).toBe(point === "before_prepare");
  expect([...f.contents]).toEqual(before); expect([...f.disk]).toEqual(disk);
  if (point !== "before_prepare") {
    await expect(restarted[kind]!.reviewUndo(f.parentId, () => true)).rejects.toThrow();
    await expect(restarted.structuralArchive!.reviewUndo(review.id, () => true)).rejects.toThrow();
  }
});
});
it("identity replacement with identical bytes and stats after review refuses both writes", async () => {
  const f = await structuralArchiveFixture(), r = await f.archive.review(f.archivePlan, () => true), note = f.pair[1];
  const old = note.file; note.file = Object.assign(new TFile(), old, { stat: { ...old.stat } }); f.caches.set(note.file, f.caches.get(old)!);
  await expect(f.archive.execute(r)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled();
});
it("callback exact-before refuses a stale source even when preflight reads match", async () => {
  const f = await structuralArchiveFixture(), r = await f.archive.review(f.archivePlan, () => true);
  f.vault.process.mockImplementationOnce(async (_file, cb) => cb("different callback Markdown"));
  await expect(f.archive.execute(r)).rejects.toThrow("write"); expect(f.contents.get(f.archivePlan.secondary.path)).toBe(f.archivePlan.secondary.before);
  expect((await f.structuralJournal.entries())[0].receipts).toHaveLength(0);
});
it("cancelled review and source changes after copies revoke consent", async () => {
  for (const change of ["cancel", "editor", "metadata", "source"]) {
    const f = await structuralArchiveFixture(); let current = true; const r = await f.archive.review(f.archivePlan, () => current), copy = f.adapter.copy.getMockImplementation()!;
    f.adapter.copy.mockImplementationOnce(async (...args) => { await copy(...args);
      if (change === "cancel") current = false;
      if (change === "editor") f.editor(1);
      if (change === "metadata") f.caches.set(f.pair[1].file, null);
      if (change === "source") f.contents.set(f.archivePlan.secondary.path, "late source");
    });
    await expect(f.archive.execute(r)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled();
  }
});


describe.each(["group", "bundle"] as const)("%s parent restoration boundary", kind => {
  it("incomplete archive blocks even original text AND historical mtime", async () => {
    const f = await structuralArchiveFixture(kind), r = await f.archive.review(f.archivePlan, () => true);
    await f.archive.execute(r); await f.archive.execute(await f.archive.reviewUndo(r.id, () => true));
    f.disk.delete([...f.disk.keys()].find(p => p.includes(r.id) && p.includes("mark-") && (JSON.parse(f.disk.get(p)!) as { state: string }).state === "undone")!);
    f.vault.getFileByPath(f.archivePlan.secondary.path)!.stat.mtime = f.archivePlan.secondary.modified;
    expect(f.contents.get(f.archivePlan.secondary.path)).toBe(f.archivePlan.secondary.before);
    await expect(f.parent.reviewUndo(f.parentId, () => true)).rejects.toThrow("archive_chain");
  });
  it("chain corruption after parent Undo intent blocks canonical write", async () => {
    const f = await structuralArchiveFixture(kind), r = await f.archive.review(f.archivePlan, () => true);
    await f.archive.execute(r); await f.archive.execute(await f.archive.reviewUndo(r.id, () => true));
    const undo = await f.parent.reviewUndo(f.parentId, () => true), write = f.adapter.write.getMockImplementation()!;
    f.vault.process.mockClear();
    f.adapter.write.mockImplementation(async (path, data) => {
      await write(path, data);
      if (path.includes(f.parentId) && path.includes("mark-") && (JSON.parse(data) as { state: string }).state === "undo_intent") f.disk.delete(`${f.structuralJournal.root}/${r.id}/backup.json`);
    });
    await expect(executeParent(f, undo)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled();
    expect(f.contents.get(f.archivePlan.canonical.path)).toBe(f.archivePlan.canonical.content);
  });
  it.each(families)("parent Undo keeps %s blockers after archive restoration", async family => {
    const f = await structuralArchiveFixture(kind), r = await f.archive.review(f.archivePlan, () => true);
    await f.archive.execute(r); await f.archive.execute(await f.archive.reviewUndo(r.id, () => true));
    const undo = await f.parent.reviewUndo(f.parentId, () => true), root = `${f.vault.configDir}/plugins/ai-knowledge-hub/consolidation-${family}`;
    f.folders.add(root); f.disk.set(root + "/unknown.json", "{}"); f.vault.process.mockClear();
    await expect(executeParent(f, undo)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled();
  });
});
it("multiple valid records claiming one parent block its otherwise complete chain", async () => {
  const f = await structuralArchiveFixture(), r = await f.archive.review(f.archivePlan, () => true);
  await f.archive.execute(r); await f.archive.execute(await f.archive.reviewUndo(r.id, () => true));
  const plan = JSON.parse(JSON.stringify(f.archivePlan)) as typeof f.archivePlan; plan.preservation[0].disposition = "represented";
  const second = await structuralArchiveRecord(plan, r.record.environment); expect(second.id).not.toBe(r.id); await f.structuralJournal.prepare(second);
  await expect(f.parent.reviewUndo(f.parentId, () => true)).rejects.toThrow("archive_chain");
});

import type { OperationRecord } from "./operationJournal";
import type { MultiRecord } from "./multiFileJournal";
describe.each(["group", "bundle"] as const)("%s intact pending reservations", kind => {
  it.each(["single", "multi"].flatMap(family => ["archive_review", "archive_consent", "parent_review", "parent_consent"].map(stage => [family, stage])))("prepared %s blocks %s with two valid copies", async (family, stage) => {
    const f = await structuralArchiveFixture(kind);
    const review = stage === "archive_review" ? undefined : await f.archive.review(f.archivePlan, () => true);
    if (stage.startsWith("parent")) { await f.archive.execute(review!); await f.archive.execute(await f.archive.reviewUndo(review!.id, () => true)); }
    const parent = stage === "parent_consent" ? await f.parent.reviewUndo(f.parentId, () => true) : undefined;
    const p = f.single, op: OperationRecord = { version: 1, operation: "add_link", state: "prepared", id: "", createdAt: 1,
      sourcePath: p.sourcePath, targetPath: p.targetPath, sourceCreated: 1, sourceModified: 2, targetCreated: 1, targetModified: 2,
      before: p.before, after: p.after, beforeHash: await checksum(p.before), afterHash: await checksum(p.after), targetHash: await checksum(p.target.content), selection: p.selection!, edit: p.edit! };
    if (family === "single") {
      op.id = await checksum(JSON.stringify({ ...op, id: "", createdAt: 0 })); await f.journal.prepare(op);
      expect((await f.journal.entries())[0]).toMatchObject({ damaged: false, marks: [], scope: "none" });
    } else {
      const files = await Promise.all(f.pair.map(async (n, i) => {
        const before = f.contents.get(n.path)!, text = before.split("\n")[2], start = before.indexOf(text), end = start + text.length;
        const edit = { start: end, end, removed: "", inserted: ` [[${f.pair[1 - i].path.slice(0, -3)}]]` }, after = before.slice(0, end) + edit.inserted + before.slice(end);
        return { path: n.path, created: n.created!, modified: n.modified, bytes: new TextEncoder().encode(before).length, before, after,
          beforeHash: await checksum(before), afterHash: await checksum(after), selection: { start, end, text }, edit };
      }));
      const multi: MultiRecord = { version: 2, operation: "add_reciprocal_links", state: "prepared", id: "", createdAt: 1, order: [0, 1], files: [files[0], files[1]] };
      multi.id = await checksum(JSON.stringify({ ...multi, createdAt: 0 })); await f.multiJournal.prepare(multi);
      expect((await f.multiJournal.entries())[0]).toMatchObject({ damaged: false, marks: [], scope: "none" });
    }
    f.vault.process.mockClear();
    await expect(stage === "archive_review" ? f.archive.review(f.archivePlan, () => true) : stage === "archive_consent" ? f.archive.execute(review!) :
      stage === "parent_review" ? f.parent.reviewUndo(f.parentId, () => true) : executeParent(f, parent!)).rejects.toThrow();
    expect(f.vault.process).not.toHaveBeenCalled();
  });
});
