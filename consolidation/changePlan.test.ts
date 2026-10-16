import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, getLanguage: () => "en", requestUrl: vi.fn(), parseLinktext: (link: string) => ({ path: link.split("#")[0] }) }));
import { requestUrl } from "obsidian";
import type { CachedMetadata, TFile } from "obsidian";
import fixture from "../tests/fixtures/change-planner.json";
import { validateRelationshipResponse } from "./relationshipContract";
import type { RelationshipAnalysis } from "./relationshipSession";
import { buildChangePlan, paragraphRanges } from "./changePlan";
import type { PlanNote, PlanPair, PlanChoice, PlanFailure } from "./changePlan";
import { ChangePlannerSession, readPlannerPair } from "./changePlannerSession";
import type { PlannerRead } from "./changePlannerSession";

function position(start: number, end: number) { return { start: { offset: start, line: 0, col: 0 }, end: { offset: end, line: 0, col: 0 } }; }
function note(path: string, content: string): PlanNote {
  let offset = 0;
  const sections = content.trimEnd().split(/\r?\n\r?\n/u).map(text => {
    const start = content.indexOf(text, offset); offset = start + text.length;
    return { type: "paragraph", position: position(start, offset) };
  });
  return { path, content, file: {} as TFile, modified: 1, bytes: content.length, cache: { sections }, references: [] };
}
function setup() {
  const pair: PlanPair = [note("one/Same.md", fixture.a), note("two/Same.md", fixture.b)];
  const analysis: RelationshipAnalysis = { pair, result: validateRelationshipResponse(JSON.stringify(fixture.response), fixture.a, fixture.b), provider: "Fake", model: "synthetic" };
  const choice: PlanChoice = { operation: "replace_with_embed", source: 0, selection: paragraphRanges(pair[0])[0], confirmed: true };
  return { pair, analysis, choice, build: (selection = choice) => buildChangePlan(analysis, pair, selection, pair[selection.source === 0 ? 1 : 0].path.slice(0, -3)) };
}
function fails(fn: () => unknown, reason: PlanFailure) { expect(fn).toThrow(expect.objectContaining({ reason })); }

describe("read-only Markdown plan contract", () => {
  it.each([0, 1] as const)("adds a normal resolved-path link from side %s, preserving the full source", side => {
    const f = setup(), selected = paragraphRanges(f.pair[side])[0];
    const plan = f.build({ operation: "add_link", source: side, selection: selected, confirmed: true });
    expect(plan.sourcePath).toBe(side === 0 ? "one/Same.md" : "two/Same.md");
    expect(plan.targetPath).toBe(side === 0 ? "two/Same.md" : "one/Same.md");
    expect(plan.edit).toEqual({ start: selected.end, end: selected.end, removed: "", inserted: ` [[${plan.targetPath.slice(0, -3)}]]` });
    expect(plan.after).toBe(plan.before.slice(0, selected.end) + plan.edit!.inserted + plan.before.slice(selected.end));
  });
  it("replaces only the explicitly chosen paragraph, keeping the contextual example and later text verbatim", () => {
    const f = setup(), plan = f.build();
    expect(plan.after).toBe("![[two/Same]]\n\nIn our classroom experiment, students compare two expiry settings.\n\nA final observation stays here.\n");
    expect(plan.edit?.removed).toBe(fixture.response.claims[0].quoteA);
    expect(plan.selection).toEqual(f.choice.selection); expect(plan.sourceHash).toHaveLength(16);
    expect(plan.provenance.recommendation.action).toBe("consider_embed_b_in_a");
  });
  it("protects a unique contextual example even when it shares a paragraph with the shared quote", () => {
    const f = setup(); f.pair[0].content = fixture.a.replace("\n\n", "\n");
    f.pair[0].cache = note("", f.pair[0].content).cache;
    f.choice.selection = paragraphRanges(f.pair[0])[0]; fails(() => f.build(), "protected");
  });
  it("does not treat a model quote as deletion bounds or require both quote sides for context", () => {
    const f = setup(); f.choice.selection = { start: 0, end: 5, text: "Cache" };
    fails(() => f.build(), "range"); f.choice.selection = paragraphRanges(f.pair[0])[1]; fails(() => f.build(), "evidence");
    expect(f.analysis.result.claims[1].quoteB).toBeNull();
  });
  it("uses the selected occurrence when identical text occurs repeatedly, without a global replacement", () => {
    const f = setup(); f.pair[0].content = "Repeated text.\n\nRepeated text.\n"; f.pair[0].cache = note("", f.pair[0].content).cache;
    const plan = f.build({ operation: "add_link", source: 0, selection: paragraphRanges(f.pair[0])[1], confirmed: true });
    expect(plan.after).toBe("Repeated text.\n\nRepeated text. [[two/Same]]\n");
  });
  it("preserves CRLF, accepts different directories and never adds a new heading or link section", () => {
    const f = setup(); f.pair[0].content = "First paragraph.\r\n\r\nSecond paragraph.\r\n"; f.pair[0].cache = note("", f.pair[0].content).cache;
    expect(f.build({ operation: "add_link", source: 0, selection: paragraphRanges(f.pair[0])[0], confirmed: true }).after)
      .toBe("First paragraph. [[two/Same]]\r\n\r\nSecond paragraph.\r\n");
  });
  it.each(["link", "embed", "property"] as const)("refuses an existing %s to the target", kind => {
    const f = setup(); f.pair[0].references.push({ kind, original: "[[two/Same#section]]", target: f.pair[1].path }); fails(() => f.build(), "existing");
  });
  it("requires the recommended embed direction and renewed explicit range confirmation", () => {
    const f = setup(); fails(() => f.build({ ...f.choice, source: 1, selection: paragraphRanges(f.pair[1])[0] }), "recommendation");
    fails(() => f.build({ ...f.choice, confirmed: false }), "confirmation");
    fails(() => f.build({ ...f.choice, selection: null }), "confirmation");
    f.analysis.result.recommendation.action = "consider_embed_a_in_b";
    expect(f.build({ ...f.choice, source: 1, selection: paragraphRanges(f.pair[1])[0] }).after).toBe("![[one/Same]]\n");
  });
  it.each(["yaml", "code", "heading", "list", "table", "html", "callout", "unknown"])("refuses a range within a native %s block", type => {
    const f = setup(); f.pair[0].cache!.sections![0].type = type; fails(() => f.build(), "range");
  });
  it.each(["[source](https://example.test)", "![[Note]]", "`code`", "text ^block", "<script>alert(1)</script>", "$$formula$$", "line\\", "plain\n    indented", "#tag", "---", "===", "%%hidden%%"])("refuses ambiguous markup %s even with stale paragraph metadata", text => {
    const f = setup(); f.pair[0].content = text; f.pair[0].cache = note("", text).cache;
    fails(() => f.build({ operation: "add_link", source: 0, selection: paragraphRanges(f.pair[0])[0], confirmed: true }), "protected");
  });
  it("rejects frontmatter, block IDs, links and embeds intersecting a claimed paragraph", () => {
    for (const cache of [{ frontmatterPosition: position(0, 5) }, { blocks: { id: { id: "id", position: position(0, 5) } } },
      { embeds: [{ link: "X", original: "X", position: position(0, 5) }] }]) {
      const f = setup(); Object.assign(f.pair[0].cache!, cache); fails(() => f.build(), "protected");
    }
  });
  it("rejects obvious embed cycles and refuses unchecked transitive dependencies", () => {
    const f = setup(); f.pair[1].references = [{ kind: "embed", original: "![[one/Same]]", target: f.pair[0].path }]; fails(() => f.build(), "cycle");
    f.pair[1].references[0].target = "Third.md"; fails(() => f.build(), "dependencies");
    f.pair[1].references = []; f.pair[1].content += "\n![[one/Same]]"; fails(() => f.build(), "dependencies");
  });
  it("rejects unavailable metadata and unsafe target tokens", () => {
    const f = setup(); fails(() => buildChangePlan(f.analysis, f.pair, f.choice, "Ambiguous#name"), "link");
    f.pair[0].cache = null; fails(() => f.build(), "metadata");
  });
  it("supports a real no-change plan without a diff or metadata", () => {
    const f = setup(); f.pair[0].cache = null;
    const plan = f.build({ operation: "no_change", source: 0, selection: null, confirmed: false });
    expect(plan.before).toBe(plan.after); expect(plan.edit).toBeNull(); expect(plan.affectedLinks.added).toBeNull();
  });
});

function sessionFixture() {
  const f = setup(); let analysis: RelationshipAnalysis | undefined = f.analysis;
  const read: PlannerRead = { pair: f.pair, linktexts: ["one/Same", "two/Same"] };
  const deps = { analysis: () => analysis, read: vi.fn(async () => read) };
  const session = new ChangePlannerSession(deps);
  return { ...f, deps, session, read, invalidateAnalysis: () => { analysis = undefined; } };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
describe("local planning freshness and lifecycle", () => {
  it("opens without reads or network; preparation and building reread only on explicit actions", async () => {
    const f = sessionFixture(); expect(f.deps.read).not.toHaveBeenCalled(); await f.session.build(f.choice); expect(f.deps.read).not.toHaveBeenCalled();
    await f.session.prepare(); await f.session.build(f.choice); expect(f.deps.read).toHaveBeenCalledTimes(2); expect(f.session.view.stage).toBe("ready");
    expect(requestUrl).not.toHaveBeenCalled(); f.session.changeSelection(); expect(f.session.view.plan).toBeUndefined();
  });
  it.each(["content", "path", "modified", "bytes", "file"] as const)("rejects changed %s before preparing or building, even without events", async key => {
    const f = sessionFixture(); await f.session.prepare();
    const changed = { ...f.pair[0], [key]: key === "file" ? {} : key === "modified" || key === "bytes" ? 2 : "changed" };
    f.deps.read.mockResolvedValue({ ...f.read, pair: [changed, f.pair[1]] });
    await f.session.build(f.choice); expect(f.session.view.stage).toBe("stale"); expect(f.session.view.plan).toBeUndefined();
    await f.session.prepare(); expect(f.session.view.stage).toBe("stale");
  });
  it.each(["cache", "references", "linktexts"])("rejects a changed %s snapshot", async key => {
    const f = sessionFixture(); await f.session.prepare();
    const next = { ...f.read, pair: [{ ...f.pair[0] }, f.pair[1]] as PlanPair };
    if (key === "cache") next.pair[0].cache = null;
    if (key === "references") next.pair[0].references = [{ kind: "embed", original: "X", target: "X.md" }];
    if (key === "linktexts") next.linktexts = ["new", "two/Same"];
    f.deps.read.mockResolvedValue(next); await f.session.build(f.choice); expect(f.session.view.stage).toBe("stale");
  });
  it.each(["close", "cancel", "invalidate"] as const)("%s blocks late UI publication and double clicks", async action => {
    const f = sessionFixture(); await f.session.prepare(); const d = deferred<PlannerRead>(); f.deps.read.mockReturnValue(d.promise);
    const pending = f.session.build(f.choice); await f.session.build(f.choice); expect(f.deps.read).toHaveBeenCalledTimes(2);
    f.session[action](); d.resolve(f.read); await pending; expect(f.session.view.plan).toBeUndefined();
  });
  it("clears a completed plan on metadata events, allows reopen, and refuses a changed analysis/settings", async () => {
    const f = sessionFixture(); await f.session.prepare(); await f.session.build(f.choice); f.session.invalidate(); expect(f.session.view.plan).toBeUndefined();
    await f.session.prepare(); f.invalidateAnalysis(); await f.session.build(f.choice); expect(f.session.view.stage).toBe("stale");
    const g = sessionFixture(); await g.session.prepare(); g.session.cancel(); await g.session.prepare(); await g.session.build(g.choice); expect(g.session.view.stage).toBe("ready");
  });
  it("withholds plans when a selected target is deleted or moved during the read", async () => {
    const f = sessionFixture(); await f.session.prepare(); f.deps.read.mockRejectedValue(new Error("missing target"));
    await f.session.build(f.choice); expect(f.session.view).toMatchObject({ stage: "error", error: "source" }); expect(f.session.view.plan).toBeUndefined(); expect(f.session.view.input).toBeUndefined();
  });
});

describe("native adapter boundaries", () => {
  it("reads only the selected full paths and resolves native links, without writes or network", async () => {
    const { TFile } = await import("obsidian"); const files = ["one/Same.md", "two/Same.md"].map(path => Object.assign(new TFile(), { path, stat: { mtime: 1, size: 5 } }));
    const vault = { getFileByPath: vi.fn((path: string) => files.find(file => file.path === path)), read: vi.fn(async () => "Plain"), modify: vi.fn(), create: vi.fn(), delete: vi.fn() };
    const cache: CachedMetadata = { sections: [{ type: "paragraph", position: position(0, 5) }], links: [{ link: "two/Same#Heading", original: "[[two/Same#Heading]]", position: position(0, 5) }] };
    const metadataCache = { getFileCache: vi.fn(() => cache), getFirstLinkpathDest: vi.fn((path: string) => files.find(file => file.path === `${path}.md`) ?? null) };
    const result = await readPlannerPair({ vault, metadataCache } as never, [files[0].path, files[1].path]);
    expect(vault.read.mock.calls).toHaveLength(2); expect(result.linktexts).toEqual(["one/Same", "two/Same"]);
    expect(result.pair[0].references[0].target).toBe("two/Same.md"); expect(result.pair[0].cache).not.toBe(cache);
    expect(vault.modify).not.toHaveBeenCalled(); expect(vault.create).not.toHaveBeenCalled(); expect(vault.delete).not.toHaveBeenCalled(); expect(requestUrl).not.toHaveBeenCalled();
    metadataCache.getFirstLinkpathDest.mockReturnValue(null); expect((await readPlannerPair({ vault, metadataCache } as never, [files[0].path, files[1].path])).linktexts).toEqual(["", ""]);
    vault.read.mockImplementation(async () => { files[0].stat.mtime++; return "Plain"; });
    await expect(readPlannerPair({ vault, metadataCache } as never, [files[0].path, files[1].path])).rejects.toThrow();
    files[1].path = "moved.md"; await expect(readPlannerPair({ vault, metadataCache } as never, ["one/Same.md", "two/Same.md"])).rejects.toThrow();
  });
});
