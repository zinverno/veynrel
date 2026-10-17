import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", async () => {
  // eslint-disable-next-line import/no-extraneous-dependencies -- Existing lint dependency is only a test double; native acceptance uses Obsidian's parser.
  const yaml = await import("js-yaml") as { load(s: string): unknown };
  return { TFile: class {}, MarkdownView: class {}, parseYaml: (s: string) => yaml.load(s), getLanguage: () => "en", parseLinktext: (s: string) => ({ path: s.split("#")[0] }), requestUrl: vi.fn() };
});
import { parseYaml, requestUrl, TFile } from "obsidian";
import type { App, CachedMetadata } from "obsidian";
import { mergeFixture, mergeNote } from "../tests/mergeFixture";
import { paragraphRanges } from "./changePlan";
import { buildMergePlan } from "./mergePlan";
import { mergeRecord } from "./mergeJournal";
import type { MergeEntry, MergeJournal } from "./mergeJournal";
import { MergeApply } from "./mergeApply";
import { obsidianMergePort } from "./obsidianMergeApply";
import { obsidianSafeApplyPort } from "./obsidianSafeApply";
import { archiveFragments, archiveMark } from "./archivePlan";
import type { ArchiveChoice } from "./archivePlan";
import { readArchiveBasis } from "./obsidianArchive";
import { ArchiveSession } from "./archiveSession";
import type { ArchiveRead } from "./archiveSession";

async function fixture(canonical: 0 | 1 = 0, prefix = "", crlf = false) {
  const f = mergeFixture(), side = canonical === 0 ? 1 : 0;
  for (const [i, n] of f.pair.entries()) {
    let text = (i === side ? prefix : "") + n.content;
    if (crlf) text = text.replace(/\n/gu, "\r\n") + "\r\nUnicode 👩🏽‍💻 é 中文.\r\n";
    Object.assign(n, mergeNote(n.path, text));
    if (i === side && prefix) {
      const end = n.content.indexOf("---", 3) + 3;
      n.cache!.sections![0].type = "yaml";
      n.cache!.frontmatterPosition = { start: { offset: 0, line: 0, col: 0 }, end: { offset: end, line: 2, col: 3 } };
      n.cache!.frontmatter = parseYaml(n.content.slice(crlf ? 5 : 4, end - 3)) as Record<string, unknown>;
    }
  }
  f.analysis.pair = f.pair.map(n => ({ ...n })) as unknown as typeof f.pair;
  const plan = buildMergePlan(f.analysis, f.pair, { ...f.choice, canonical, insertion: paragraphRanges(f.pair[canonical])[0],
    transfers: [{ range: paragraphRanges(f.pair[side])[1], contextReviewed: true }] });
  const record = await mergeRecord(plan), c = f.pair[canonical];
  c.content = plan.canonical.after; c.modified++; c.bytes = new TextEncoder().encode(c.content).length;
  c.file.stat.mtime = c.modified; c.file.stat.size = c.bytes; c.cache = mergeNote(c.path, c.content).cache;
  const entry: MergeEntry = { id: record.id, record, damaged: false, scope: "none", issues: [], receipts: [{ state: "applied", modified: c.modified, bytes: c.bytes }] };
  const journal = { entries: vi.fn(async () => [entry]), prepare: vi.fn(), mark: vi.fn() };
  const notes = [c, f.pair[side]] as const;
  const files = new Map(notes.map(n => [n.path, n.file])), caches = new Map(notes.map(n => [n.file, n.cache]));
  const vault = { getFileByPath: (p: string) => files.get(p) ?? null,
    read: vi.fn(async (file: TFile) => notes.find(n => n.path === file.path)!.content), process: vi.fn(), modify: vi.fn(), create: vi.fn(), delete: vi.fn(), rename: vi.fn(), adapter: { write: vi.fn() } };
  const app = { vault, workspace: { iterateAllLeaves: () => {} }, metadataCache: { resolvedLinks: {} as Record<string, Record<string, number>>,
    getFileCache: (file: TFile) => caches.get(file), getFirstLinkpathDest: (p: string) => vault.getFileByPath(p + ".md") } } as unknown as App;
  const port = obsidianSafeApplyPort(app), owner = { exclusive: async <T>(run: () => Promise<T>) => run(), blockers: vi.fn(async () => {}), active: (current: () => boolean) => { if (!current()) throw Error("closed"); } };
  const merge = new MergeApply(journal as unknown as MergeJournal, port, obsidianMergePort(app, port), owner);
  const read = vi.fn(() => readArchiveBasis(app, merge, record.id, () => true)), session = new ArchiveSession(read);
  const choice = (): ArchiveChoice => ({ status: "archived", dispositions: archiveFragments(record, notes[1]).map(f => ({ range: f.range, disposition: "retained" })), limitationsReviewed: true });
  const unchanged = () => {
    for (const fn of [vault.process, vault.modify, vault.create, vault.delete, vault.rename, vault.adapter.write, journal.prepare, journal.mark, requestUrl]) expect(fn).not.toHaveBeenCalled();
    expect(vault.read.mock.calls.every(([file]) => notes.some(n => n.file === file || n.path === file.path))).toBe(true);
  };
  return { ...f, app, vault, journal, entry, record, notes, files, caches, owner, read, session, choice, unchanged };
}

describe("archive eligibility and exact soft mark planning", () => {
  it.each([0, 1] as const)("canonical %s: journal-backed preservation, exact text and no writes or extra completion", async side => {
    for (const crlf of [false, true]) for (const prefix of ["", '---\n# Keep formatting\ntags: [one, two]\nrelated: "[[Missing]]"\n---\n\n']) {
      const f = await fixture(side, prefix, crlf); await f.session.prepare(); expect(f.session.view.stage).toBe("choosing");
      await f.session.build(f.choice()); expect(f.session.view.stage).toBe("ready"); const p = f.session.view.plan!;
      expect(p.secondary.before).toBe(f.record.secondary.content); expect(p.canonical.content).toBe(f.record.canonical.after);
      expect(p.secondary.after.slice(0, p.edit.start) + p.secondary.after.slice(p.edit.start + p.edit.inserted.length)).toBe(p.secondary.before);
      expect(p.secondary.after).toContain(crlf ? "veynrel_archive_status: archived\r\nveynrel_canonical:" : "veynrel_archive_status: archived\nveynrel_canonical:");
      expect(JSON.parse(JSON.stringify(p))).toEqual(p); expect(p.provenance.id).toBe(f.record.id); expect(p.provenance.receipt).toEqual(f.entry.receipts[0]);
      expect(p.preservation.some(p => /example|attribution|closing/u.test(p.range.text))).toBe(true); expect(p.limitations).toContain("semantic_review_unavailable");
      const covered = [...p.preservation.map(p => p.range), ...p.copied.map(t => t.range)];
      for (let i = 0; i < p.secondary.before.length; i++) if (p.secondary.before[i].trim()) expect(covered.some(r => r.start <= i && r.end > i)).toBe(true);
      expect(f.read).toHaveBeenCalledTimes(4); f.unchanged();
    }
  });
  it.each(["prepared", "recovered", "undo_intent", "undone", "damaged", "missing", "receipt", "blocked"])("refuses %s Merge Apply basis", async kind => {
    const f = await fixture();
    if (kind === "prepared") { f.entry.receipts = []; f.notes[0].content = f.record.canonical.before; }
    if (kind === "recovered") f.entry.receipts = [];
    if (kind === "undo_intent" || kind === "undone") f.entry.receipts.push({ ...f.entry.receipts[0], state: kind });
    if (kind === "damaged") f.entry.damaged = true;
    if (kind === "missing") f.journal.entries.mockResolvedValue([]);
    if (kind === "receipt") f.entry.receipts[0].modified++;
    if (kind === "blocked") f.owner.blockers.mockRejectedValue(Error("journal conflict"));
    await f.session.prepare(); expect(f.session.view).toMatchObject({ stage: "error", error: "basis" }); f.unchanged();
  });
  it.each([0, 1])("refuses changed note %s before review, building and publication", async side => {
    for (const kind of ["content", "ctime", "mtime", "size", "path", "identity", "cache"]) for (const phase of ["review", "build", "publish"]) {
      const f = await fixture();
      const change = () => {
        const n = f.notes[side];
        if (kind === "content") n.content += " user edit";
        if (kind === "ctime") n.file.stat.ctime++;
        if (kind === "mtime") n.file.stat.mtime++;
        if (kind === "size") n.file.stat.size++;
        if (kind === "path") n.file.path = "Moved.md";
        if (kind === "identity") { const next = Object.assign(new TFile(), n.file); if (phase === "review") next.stat = { ...next.stat, ctime: next.stat.ctime + 1 }; f.files.set(n.path, next); f.caches.set(next, n.cache); }
        if (kind === "cache") f.caches.set(n.file, null);
      };
      if (phase === "review") { change(); await f.session.prepare(); }
      else {
        await f.session.prepare();
        if (phase === "build") change();
        else { const original = f.read.getMockImplementation()!; let count = 0; f.read.mockImplementation(async () => { if (++count === 2) change(); return original(); }); }
        await f.session.build(f.choice());
      }
      expect(f.session.view.plan).toBeUndefined(); expect(["error", "stale"], `${kind}/${phase}`).toContain(f.session.view.stage); f.unchanged();
    }
  });
  it("requires every fragment; further consolidation blocks, selection change revokes the plan", async () => {
    const f = await fixture(); await f.session.prepare();
    for (const mutate of [(c: ArchiveChoice) => { c.dispositions.pop(); }, (c: ArchiveChoice) => { c.dispositions[0].range.text += "x"; },
      (c: ArchiveChoice) => { c.limitationsReviewed = false; }, (c: ArchiveChoice) => { c.status = null; },
      (c: ArchiveChoice) => { c.dispositions[0].disposition = "consolidate"; }]) {
      const c = f.choice(); mutate(c); await f.session.build(c); expect(f.session.view.plan).toBeUndefined(); expect(f.session.view.stage).toBe("error");
    }
    const c = f.choice(); c.dispositions[0].disposition = "represented"; await f.session.build(c); expect(f.session.view.plan?.preservation[0].disposition).toBe("represented");
    f.session.changeSelection(); expect(f.session.view.plan).toBeUndefined(); await f.session.build(f.choice()); expect(f.session.view.stage).toBe("ready"); f.unchanged();
  });
  it("shows known incoming links, embeds and property links without reading consumer Markdown", async () => {
    const f = await fixture(), consumer = mergeNote("Consumer.md", "never read"); f.files.set(consumer.path, consumer.file);
    const position = consumer.cache!.sections![0].position, target = f.notes[1].path.slice(0, -3);
    const ref = { link: target, original: `[[${target}]]`, position };
    f.caches.set(consumer.file, { links: [ref], embeds: [{ ...ref, original: `![[${target}]]` }], frontmatterLinks: [{ key: "related", link: target, original: ref.original }] });
    f.app.metadataCache.resolvedLinks[consumer.path] = { [f.notes[1].path]: 3 };
    f.notes[1].cache!.frontmatterLinks = [{ key: "related", link: "Missing", original: "[[Missing]]" }];
    await f.session.prepare(); await f.session.build(f.choice());
    expect(f.session.view.plan?.dependencies[1]).toMatchObject({ incoming: [{ path: "Consumer.md", count: 3, references: [{ kind: "link" }, { kind: "embed" }, { kind: "property" }] }], outgoing: [{ kind: "property", target: null }] });
    f.caches.set(consumer.file, { headings: [] }); await f.session.build(f.choice()); expect(f.session.view.stage).toBe("stale"); f.unchanged();
  });
  it("unknown cache dependencies remain unknown, and missing section entries never omit remaining text", async () => {
    const f = await fixture(); (f.app.metadataCache as unknown as { resolvedLinks: unknown }).resolvedLinks = undefined;
    f.notes[1].cache!.sections = [];
    await f.session.prepare(); await f.session.build(f.choice()); expect(f.session.view.plan?.dependencies.every(d => d.incoming === null)).toBe(true);
    expect(f.session.view.plan!.preservation.map(f => f.range.text).join("")).toContain("attribution"); f.unchanged();
  });
  it.each(["cancel", "invalidate", "close", "changeSelection"] as const)("%s prevents delayed publication without writes", async action => {
    const f = await fixture(); await f.session.prepare(); let done!: (r: ArchiveRead) => void; const input = await f.read();
    f.read.mockImplementationOnce(() => new Promise(resolve => { done = resolve; })); const building = f.session.build(f.choice());
    f.session[action](); done(input); await building; expect(f.session.view.plan).toBeUndefined(); f.unchanged();
  });
  it.each(["mtime", "entry", "dependencies"])("catches %s change during final journal/source reads", async kind => {
    const f = await fixture(); await f.session.prepare(); const original = f.read.getMockImplementation()!; let count = 0;
    f.read.mockImplementation(async () => {
      const read = await original();
      if (++count === 2) {
        if (kind === "mtime") f.notes[0].file.stat.mtime++;
        if (kind === "entry") read.entry = { ...read.entry, receipts: [...read.entry.receipts, { ...read.entry.receipts[0] }] };
        if (kind === "dependencies") read.dependencies = [];
      }
      return read;
    });
    await f.session.build(f.choice()); expect(f.session.view.stage).toBe("stale"); f.unchanged();
  });
});

describe("targeted frontmatter insertion refuses ambiguity", () => {
  function note(yaml: string) {
    const text = `---\n${yaml}\n---\n\nBODY [[Link]] ![[Embed]] 👩🏽‍💻\n`, n = mergeNote("S.md", text), end = text.indexOf("\n---", 4) + 4;
    n.cache!.frontmatterPosition = { start: { offset: 0, line: 0, col: 0 }, end: { offset: end, line: 1, col: 3 } };
    try { n.cache!.frontmatter = parseYaml(yaml) as CachedMetadata["frontmatter"]; } catch { n.cache!.frontmatter = {}; } return n;
  }
  it.each(["veynrel: { archive_status: archived }", "Veynrel: true", "veynrel_archive_status: archived"])("refuses conflicting property %s", yaml => {
    expect(() => archiveMark(note(yaml), "Canonical.md")).toThrow("properties");
  });
  it.each(["tags: [unclosed", "x: one\nx: two", "a: &a value\nb: *a", "'quoted key': value", "[one, two]", "a: !custom value", "a:\tvalue", "%YAML 1.2"])("refuses ambiguous or unsupported YAML: %s", yaml => {
    expect(() => archiveMark(note(yaml), "Canonical.md")).toThrow("frontmatter");
  });
  it("preserves comments, nested mappings, lists and block scalar formatting", () => {
    const n = note("# note\ntags:\n  - one\n  - two\ncustom:\n  nested: 'value'\nsummary: |\n  Exact multiline text.\n  Still retained.");
    const edit = archiveMark(n, "Folder/Канон.md"); expect(n.content.slice(edit.start)).toBe("---\n\nBODY [[Link]] ![[Embed]] 👩🏽‍💻\n");
    const after = n.content.slice(0, edit.start) + edit.inserted + n.content.slice(edit.start);
    expect(after.replace(edit.inserted, "")).toBe(n.content);
  });
  it("refuses missing delimiters, BOM, mismatched cache and unsafe canonical links", () => {
    for (const text of ["---\nx: y", "--- \nx: y\n---\n", "\uFEFFBody"]) expect(() => archiveMark(mergeNote("S.md", text), "C.md")).toThrow("frontmatter");
    const n = note("x: y"); n.cache!.frontmatter = { x: "changed" }; expect(() => archiveMark(n, "C.md")).toThrow("frontmatter");
    for (const path of ["C#x.md", "C|x.md", "C[x].md", "C\nx.md"]) expect(() => archiveMark(mergeNote("S.md", "body"), path)).toThrow("link");
  });
});
