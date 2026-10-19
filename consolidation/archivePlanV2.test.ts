import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", async () => {
  // eslint-disable-next-line import/no-extraneous-dependencies -- Existing test parser; native acceptance uses Obsidian.
  const yaml = await import("js-yaml") as { load(s: string): unknown };
  return { TFile: class {}, MarkdownView: class {}, Modal: class {}, getLanguage: () => "en", requestUrl: vi.fn(),
    parseYaml: (s: string) => yaml.load(s), parseLinktext: (s: string) => ({ path: s.split("#")[0], subpath: s.includes("#") ? s.slice(s.indexOf("#")) : "" }) };
});
import { requestUrl, parseYaml, TFile } from "obsidian";
import type { CachedMetadata } from "obsidian";
import { groupApplyFixture } from "../tests/groupApplyFixture";
import { bundleApplyFixture } from "../tests/bundleApplyFixture";
import { groupFixture, groupNote } from "../tests/groupFixture";
import { archivePartition, archiveReviewParts } from "./archivePlanV2";
import type { ArchiveChoiceV2 } from "./archivePlanV2";
import { ArchiveSessionV2 } from "./archiveSessionV2";
import { readArchiveBasisV2, readArchiveDependenciesV2 } from "./obsidianArchiveV2";
import { readPlannerPair } from "./changePlannerSession";
import { buildChangePlan, paragraphRanges } from "./changePlan";
import { archiveMark } from "./archivePlan";
import { checksum } from "./operationJournal";
import { archiveApplyFixture } from "../tests/archiveApplyFixture";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
async function setup(kind: "group" | "bundle", side: 0 | 1 = 0, crlf = false, level: 1 | 2 | 3 = 3, core?: string, completed = true) {
  const f = kind === "group" ? groupApplyFixture(side, crlf, level) : bundleApplyFixture(core, side, crlf);
  const operation = kind === "group" ? "copy_context_group" : "context_bundle_copy";
  let id: string;
  if ("group" in f) {
    const review = await f.review(); id = review.id;
    if (completed) await f.group.execute(review); else await f.groupJournal.prepare(review.record);
  } else {
    const review = await f.review(); id = review.id;
    if (completed) await f.bundle.execute(review); else await f.bundleJournal.prepare(review.record);
  }
  const journal = "group" in f ? f.groupJournal : f.bundleJournal;
  const read = vi.fn(() => readArchiveBasisV2(f.app, f.service, operation, id, () => true));
  const session = new ArchiveSessionV2(read);
  const choice = (): ArchiveChoiceV2 => ({ status: "archived", limitationsReviewed: true, unknownDependenciesAccepted: true,
    dispositions: archiveReviewParts(archivePartition(session.view.input!.record, session.view.input!.notes[1])).map(p => ({ range: p.range, disposition: "retained" })) });
  const snapshot = () => JSON.stringify({ disk: [...f.disk], contents: [...f.contents], stats: f.pair.map(n => n.file.stat) });
  const before = snapshot();
  for (const fn of [f.vault.process, f.adapter.write, f.adapter.copy, f.adapter.mkdir, requestUrl]) vi.mocked(fn).mockClear();
  const unchanged = () => {
    expect(snapshot()).toBe(before);
    for (const fn of [f.vault.process, f.vault.modify, f.vault.create, f.vault.delete, f.adapter.write, f.adapter.copy, f.adapter.mkdir, requestUrl]) expect(fn).not.toHaveBeenCalled();
  };
  return { ...f, id, operation, journalV2: journal, read, session, choice, unchanged };
}

describe.each(["group", "bundle"] as const)("%s completed archive basis", kind => {
  it.each([0, 1] as const)("side %s, Unicode and CRLF preserve every source character without writes", async side => {
    for (const crlf of [false, true]) {
      const f = await setup(kind, side, crlf); await f.session.prepare(); expect(f.session.view.stage).toBe("choosing");
      await f.session.build(f.choice()); expect(f.session.view.stage).toBe("ready"); const p = f.session.view.plan!;
      expect(p.version).toBe(2); expect(p.provenance.operation).toBe(f.operation); expect(p.provenance.id).toBe(f.id);
      expect(p.partition.map(p => p.range.text).join("")).toBe(f.plan.secondary.content);
      expect(p.partition.every((p, i, parts) => p.range.start === (parts[i - 1]?.range.end ?? 0))).toBe(true);
      expect(p.secondary.after.replace(p.edit.inserted, "")).toBe(p.secondary.before);
      expect(p.secondary.after).toContain(crlf ? "archived\r\n" : "archived\n");
      expect(p.confirmation.semanticCompletenessProven).toBe(false); expect(clone(p)).toEqual(p);
      await expect(f.service.archive!.review(p as never, () => true)).rejects.toThrow();
      f.unchanged();
    }
  });
  it.each(["prepared", "missing_applied", "backup", "damaged_receipt", "copies", "undo_intent", "undone", "receipt_conflict", "canonical", "secondary", "canonical_mtime", "secondary_mtime", "ctime", "cache", "resolver", "editor", "pending_single"])("refuses %s", async failure => {
    const f = await setup(kind, 0, false, 3, undefined, failure !== "prepared"), root = `${f.journalV2.root}/${f.id}`;
    const receipt = [...f.disk.keys()].find(p => p.startsWith(root) && p.includes("/mark-"));
    if (failure === "missing_applied") f.disk.delete(receipt!);
    if (failure === "backup") f.disk.delete(root + "/backup.json");
    if (failure === "damaged_receipt") f.disk.set(receipt!, "{");
    if (failure === "copies") { const r = JSON.parse(f.disk.get(root + "/backup.json")!) as { createdAt: number }; r.createdAt++; f.disk.set(root + "/backup.json", JSON.stringify(r)); }
    if (failure === "undo_intent") { const r = JSON.parse(f.disk.get(receipt!)!) as { state: string }; r.state = "undo_intent"; f.disk.set(receipt!, JSON.stringify(r)); }
    if (failure === "undone") {
      if ("group" in f) await f.group.execute(await f.group.reviewUndo(f.id, () => true)); else await f.bundle.execute(await f.bundle.reviewUndo(f.id, () => true));
    }
    if (failure === "receipt_conflict") { const r = JSON.parse(f.disk.get(receipt!)!) as { attempt: string; modified: number }; r.attempt = crypto.randomUUID(); r.modified++; f.disk.set(root + `/mark-${r.attempt}.json`, JSON.stringify(r)); }
    if (failure === "canonical" || failure === "secondary") { const p = f.plan[failure].path; f.contents.set(p, f.contents.get(p) + "later"); }
    if (failure.endsWith("mtime")) f.pair[failure.startsWith("canonical") ? 0 : 1].file.stat.mtime++;
    if (failure === "ctime") f.pair[1].file.stat.ctime++;
    if (failure === "cache") f.caches.set(f.pair[1].file, null);
    if (failure === "resolver") f.app.metadataCache.getFirstLinkpathDest = () => null;
    if (failure === "editor") f.editor();
    if (failure === "pending_single") { const review = await f.service.review(f.single, f.analysis, () => true).catch(() => null); if (review) f.service.discard(review); vi.spyOn(f.journal, "entries").mockResolvedValue([{ id: "pending", damaged: false, scope: "none", marks: [], record: { sourcePath: f.plan.secondary.path, targetPath: f.plan.canonical.path } } as never]); }
    await f.session.prepare(); expect(f.session.view.stage).toBe("error"); expect(f.session.view.plan).toBeUndefined();
  });
  it("a later independently applied operation is not a receipt chain", async () => {
    const f = await setup(kind), read = await readPlannerPair(f.app, [f.pair[0].path, f.pair[1].path]), analysis = { ...f.analysis, pair: read.pair };
    const plan = buildChangePlan(analysis, read.pair, { operation: "add_link", source: 0, selection: paragraphRanges(read.pair[0])[0], confirmed: true }, read.linktexts[1]);
    await f.service.apply((await f.service.review(plan, analysis, () => true))!);
    expect((await f.journalV2.entries())[0].receipts[0].state).toBe("applied");
    await f.session.prepare(); expect(f.session.view.stage).toBe("error");
  });
  it("requires an independent unknown-dependency choice and all dispositions", async () => {
    const f = await setup(kind); await f.session.prepare(); const choice = f.choice(); choice.unknownDependenciesAccepted = false;
    await f.session.build(choice); expect(f.session.view.error).toBe("review"); expect(f.session.view.plan).toBeUndefined();
    if (kind === "group") {
      const consolidate = f.choice(); consolidate.dispositions[0].disposition = "consolidate";
      await f.session.build(consolidate); expect(f.session.view.error).toBe("consolidate");
      const missing = f.choice(); missing.dispositions.pop(); await f.session.build(missing); expect(f.session.view.error).toBe("review");
    }
    f.unchanged();
  });
  it.each(["cancel", "close", "invalidate", "changeSelection"] as const)("%s drops late prepare/build results", async action => {
    for (const preparing of [true, false]) {
      const f = await setup(kind); await f.session.prepare(); const input = await f.read(), choice = f.choice();
      let release!: (v: typeof input) => void;
      f.read.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
      const task = preparing ? f.session.prepare() : f.session.build(choice);
      f.session[action](); release(input); await task; expect(f.session.view.plan).toBeUndefined(); f.unchanged();
    }
  });
  it.each(["identity", "metadata", "journal", "dependencies", "source"])("%s changes during final read revoke the plan", async change => {
    const f = await setup(kind); await f.session.prepare(); const read = f.read.getMockImplementation()!; let calls = 0;
    f.read.mockImplementation(async () => {
      const input = await read(); if (++calls === 2) {
        if (change === "identity") input.notes[0].file.stat.ctime++;
        if (change === "metadata") f.caches.set(input.notes[1].file, null);
        if (change === "journal") input.entry = { ...input.entry, receipts: [...input.entry.receipts, { ...input.entry.receipts[0] }] };
        if (change === "dependencies") input.dependencies = [];
        if (change === "source") input.record = { ...input.record, id: "changed" };
      } return input;
    });
    await f.session.build(f.choice()); expect(f.session.view.stage).toBe("stale"); expect(f.session.view.plan).toBeUndefined();
  });
  it("journal tampering during dependency reads refuses the basis", async () => {
    const f = await setup(kind), original = f.vault.read.getMockImplementation()!; let changed = false;
    f.vault.read.mockImplementation(async file => { const content = await original(file); if (!changed) { changed = true; f.disk.set(`${f.journalV2.root}/${f.id}/backup.json`, "{"); } return content; });
    await expect(f.read()).rejects.toThrow();
  });
});

it.each([1, 2, 3] as const)("H%s includes all ancestor headings and introductions, and retained siblings", async level => {
  const input = groupFixture(); const s = input.pair[1], content = s.content.replace("## Practice\n\n", "## Practice\n\nAncestor introduction 🪶.\n\n");
  const source = groupNote(s.path, content); input.pair = [input.pair[0], source]; input.analysis.pair = input.pair;
  const f = groupApplyFixture(0, false, level, input), review = await f.review(); await f.group.execute(review);
  const read = await readArchiveBasisV2(f.app, f.service, "copy_context_group", review.id, () => true), parts = archivePartition(read.record, read.notes[1]);
  expect(parts.map(p => p.range.text).join("")).toBe(content);
  for (const text of ["# Source guide", "Shared scoped fact.", "## Practice", "Ancestor introduction 🪶.", "### Trial"]) expect(parts.some(p => p.copied && p.range.text.includes(text))).toBe(true);
  if (level > 1) expect(archiveReviewParts(parts).some(p => p.range.text === "## Other")).toBe(true);
});
it.each(["```js\nreturn 1;\n```", "- Один 🪶\n- Two 中文", "> Наблюдение é.\n> Second line."])("Bundle context is confirmed, copied and fully partitioned: %s", async core => {
  const f = await setup("bundle", 1, true, 3, core); await f.session.prepare(); await f.session.build(f.choice());
  const p = f.session.view.plan!; expect(p).toBeDefined(); expect(p.preservation).toEqual([]);
  expect(p.partition.some(part => part.copied && part.range.text.includes("following example"))).toBe(true);
  expect(p.partition.some(part => part.copied && part.range.text.includes("does not establish"))).toBe(true); f.unchanged();
});
it.each(["gap", "overlap", "boundary", "text", "sections", "heading"])("rejects %s in structural preservation evidence", async failure => {
  const f = await setup("group"), read = await f.read(), r = clone(read.record);
  if (r.operation !== "copy_context_group") throw Error("group");
  if (failure === "gap") r.plan.group.retained = [];
  if (failure === "overlap") r.plan.group.copied.push(r.plan.group.copied[0]);
  if (failure === "boundary") r.plan.group.copied[0].start = -1;
  if (failure === "text") r.plan.group.copied[0].text += "changed";
  const note = { ...read.notes[1], cache: clone(read.notes[1].cache) };
  if (failure === "sections") note.cache!.sections!.splice(0, 1);
  if (failure === "heading") note.cache!.headings![0].level = 3;
  expect(() => archivePartition(r, note)).toThrow("basis");
});
it.each(["group", "bundle"] as const)("even rehashed %s journals cannot omit or overlap ranges", async kind => {
  const f = await setup(kind), r = clone((await f.read()).record);
  if (r.operation === "copy_context_group") r.plan.group.copied.push(r.plan.group.copied[0]); else r.plan.bundle.blocks.pop();
  r.id = await checksum(JSON.stringify({ ...r, id: "", createdAt: 0 }));
  const root = `${f.journalV2.root}/${r.id}`; f.folders.add(root); for (const name of ["record.json", "backup.json"]) f.disk.set(`${root}/${name}`, JSON.stringify(r));
  expect((await f.journalV2.entries()).find(e => e.id === r.id)?.damaged).toBe(true);
});
it("shows known backlinks, embeds, properties, subpaths, missing consumers and count mismatches", async () => {
  const f = await setup("group"), read = await f.read(), target = f.plan.secondary.path;
  const consumer = groupNote("Consumer.md", "[[1/Note#Trial]] ![[1/Note#^block]]");
  consumer.cache!.links = [{ link: "1/Note#Trial", original: "[[1/Note#Trial]]", position: consumer.cache!.sections![0].position }];
  consumer.cache!.embeds = [{ link: "1/Note#^block", original: "![[1/Note#^block]]", position: consumer.cache!.sections![0].position }];
  consumer.cache!.frontmatterLinks = [{ link: "1/Note", original: "[[1/Note]]", key: "related" }];
  const get = f.vault.getFileByPath; f.vault.getFileByPath = p => p === consumer.path ? consumer.file : get(p); f.caches.set(consumer.file, consumer.cache);
  f.app.metadataCache.resolvedLinks = { "Consumer.md": { [target]: 4 }, "Missing.md": { [target]: 1 } };
  const d = readArchiveDependenciesV2(f.app, read.notes).dependencies[1];
  expect(d.incoming).toHaveLength(2); expect(d.targets.map(r => r.kind)).toEqual(["link", "embed", "property"]);
  expect(d.targets.map(r => r.subpath)).toEqual(["#Trial", "#^block", ""]);
  expect(d.issues).toEqual(expect.arrayContaining(["consumer_metadata_missing", "incoming_count_mismatch", "external_consumers_unverified"]));
});
it.each(["tags: [unclosed", "veynrel_archive_status: active", "Veynrel: true"])("shared YAML insertion refuses %s", yaml => {
  const text = `---\n${yaml}\n---\nBody`, n = groupNote("S.md", text), end = text.indexOf("\n---", 4) + 4;
  n.cache!.frontmatterPosition = { start: { offset: 0, line: 0, col: 0 }, end: { offset: end, line: 2, col: 3 } };
  try { n.cache!.frontmatter = parseYaml(yaml) as CachedMetadata["frontmatter"]; } catch { n.cache!.frontmatter = {}; }
  expect(() => archiveMark(n, "C.md")).toThrow();
});
it("Merge v1 remains compatible with its completed-parent planner and executor", async () => {
  const f = await archiveApplyFixture();
  expect(f.plan.version).toBe(1); expect(f.plan.provenance.operation).toBe("merge_knowledge_copy");
  await f.archive.execute(await f.review());
});

it("two completed Group operations over the same pair prove only the latest exact after", async () => {
  const f = groupApplyFixture(), first = await f.review(); await f.group.execute(first);
  const read = await readPlannerPair(f.app, [f.pair[0].path, f.pair[1].path]), analysis = { ...f.analysis, pair: read.pair };
  analysis.result = { ...analysis.result, claims: [{ ...analysis.result.claims[0], quoteA: "An existing observation.", quoteB: "An unselected observation." }] };
  const { buildGroupPlan } = await import("./groupPlan");
  const next = buildGroupPlan(analysis, read.pair, { ...f.choice, insertion: read.pair[0].content.length }, read.linktexts);
  const second = await f.group.review(next, analysis, () => true); await f.group.execute(second);
  expect((await f.groupJournal.entries()).every(e => !e.damaged && e.receipts[0].state === "applied")).toBe(true);
  await expect(f.service.readArchiveParent("copy_context_group", first.id, () => true)).rejects.toThrow();
  const current = await f.service.readArchiveParent("copy_context_group", second.id, () => true);
  expect(current.record.id).toBe(second.id); expect(current.notes[0].content).toBe(next.canonical.after);
});
it.each(["single", "multi", "merge", "archive", "bundle", "group"])("%s global journal damage prevents structural archive planning", async family => {
  const f = await setup("group");
  const root = family === "single" ? f.journal.root : family === "multi" ? f.multiJournal.root : family === "merge" ? f.mergeJournal.root :
    family === "archive" ? f.archiveJournal.root : family === "bundle" ? f.bundleJournal.root : f.journalV2.root;
  f.folders.add(root); f.disk.set(root + "/unknown.json", "{}");
  await expect(f.read()).rejects.toThrow();
});
it("an intact pending Multi-file operation on a participant blocks planning", async () => {
  const f = await setup("group");
  vi.spyOn(f.multiJournal, "entries").mockResolvedValue([{ id: "pending", damaged: false, scope: "none", marks: [], record: { files: [{ path: f.plan.canonical.path }] } } as never]);
  await expect(f.read()).rejects.toThrow();
});
it.each(["```js\nunterminated", "- Retained list", "> Retained quotation"])("retained Group rich syntax is refused explicitly until structurally supported: %s", async extra => {
  const fixture = groupFixture(), text = fixture.pair[1].content + "\n" + extra + "\n";
  fixture.pair = [fixture.pair[0], groupNote(fixture.pair[1].path, text)]; fixture.analysis.pair = fixture.pair;
  const f = groupApplyFixture(0, false, 3, fixture), review = await f.review(); await f.group.execute(review);
  await expect(readArchiveBasisV2(f.app, f.service, "copy_context_group", review.id, () => true)).rejects.toThrow("basis");
});

it("a replaced TFile with identical path, text and stat revokes the in-memory source identity", async () => {
  const f = await setup("group"); await f.session.prepare();
  const original = f.pair[1].file, replacement = Object.assign(new TFile(), original, { stat: { ...original.stat } });
  f.pair[1].file = replacement; f.caches.set(replacement, f.caches.get(original)!);
  await f.session.build(f.choice()); expect(f.session.view.plan).toBeUndefined(); expect(f.session.view.stage).toBe("stale");
});
