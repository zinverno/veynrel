import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, getLanguage: () => "en", requestUrl: vi.fn(), parseLinktext: (s: string) => ({ path: s.split("#")[0] }) }));
import { requestUrl } from "obsidian";
import { buildMergePlan, mergeBlockFailure, mergeHints } from "./mergePlan";
import type { MergeChoice, MergeFailure, MergeIncoming } from "./mergePlan";
import { paragraphRanges } from "./changePlan";
import type { PlanNote } from "./changePlan";
import { ChangePlannerSession, readPlannerPair } from "./changePlannerSession";
import type { PlannerRead } from "./changePlannerSession";
import { readCachedIncoming } from "./pairSnapshot";
import { mergeFixture, mergeNote } from "../tests/mergeFixture";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const build = (f = mergeFixture(), choice = f.choice) => buildMergePlan(f.analysis, f.pair, choice);
const fail = (fn: () => unknown, reason: MergeFailure) => expect(fn).toThrow(expect.objectContaining({ reason }));
describe("deterministic read-only merge", () => {
  it.each([0, 1] as const)("user chooses canonical %s, unique content is copied verbatim; every source byte stays accounted for", canonical => {
    const f = mergeFixture(), side = canonical === 0 ? 1 : 0;
    const choice: MergeChoice = { ...f.choice, canonical, insertion: paragraphRanges(f.pair[canonical])[1],
      transfers: [{ range: paragraphRanges(f.pair[side])[1], contextReviewed: true }] };
    const p = build(f, choice), point = choice.insertion!.end;
    expect(p.canonical.path).toBe(f.pair[canonical].path); expect(p.secondary.path).toBe(f.pair[side].path);
    expect(p.canonical.after).toBe(p.canonical.before.slice(0, point) + "\n\n" + choice.transfers[0].range.text + p.canonical.before.slice(point));
    expect(p.secondary.content).toBe(f.pair[side].content); expect(p.retained.map(f => f.range.text).join("")).toBe(p.secondary.content);
    expect(p.retained.filter(f => f.copied).map(f => f.range)).toEqual(choice.transfers.map(t => t.range));
    expect(p.dependencies.every(d => d.incoming === null)).toBe(true); expect(p.secondary.unchanged).toBe(true);
    expect(JSON.parse(JSON.stringify(p))).toEqual(p); expect(JSON.stringify(p)).not.toContain('"file":');
    const again = build(f, choice); expect(again).toEqual(p);
    choice.transfers[0].range.text = "mutated UI"; f.analysis.result.recommendation.reason = "changed response";
    expect(p.transfers[0].range.text).not.toBe("mutated UI"); expect(p.provenance.recommendation.reason).not.toBe("changed response");
  });
  it("near-identical/shared is a hypothesis, never an automatic selection, deletion or canonical choice", () => {
    const f = mergeFixture(); Object.assign(f.pair[1], mergeNote(f.pair[1].path, f.pair[0].content.replace("explanation.", "explanation!")));
    f.analysis.pair = [{ ...f.pair[0] }, { ...f.pair[1] }];
    f.analysis.result.claims = f.analysis.result.claims.filter(c => c.kind === "shared");
    f.analysis.result.relation = "same_information"; f.analysis.result.explanation.evidence = ["shared"];
    f.analysis.result.recommendation.evidence = ["shared"]; f.analysis.result.alternatives = [];
    fail(() => build(f, { ...f.choice, canonical: null }), "confirmation"); fail(() => build(f, { ...f.choice, transfers: [] }), "confirmation");
    const p = build(f, { ...f.choice, transfers: [{ range: paragraphRanges(f.pair[1])[0], contextReviewed: true }] });
    expect(p.secondary.content).toBe(f.pair[1].content); expect(p.hints.map(h => h.kind)).toEqual(["shared", "shared"]);
  });
  it("copies only the chosen repeated occurrence, in source order with no replacement or paraphrase", () => {
    const f = mergeFixture(), ranges = paragraphRanges(f.pair[0]);
    const p = build(f, { ...f.choice, canonical: 1, insertion: paragraphRanges(f.pair[1])[0],
      transfers: [{ range: ranges[4], contextReviewed: true }, { range: ranges[1], contextReviewed: true }] });
    expect(p.transfers.map(t => t.range.start)).toEqual([ranges[1].start, ranges[4].start]);
    expect(p.retained.filter(x => x.copied).map(x => x.range.start)).not.toContain(ranges[3].start);
    expect(p.canonical.after).toContain(ranges[1].text + "\n\n" + ranges[4].text);
    fail(() => build(f, { ...f.choice, transfers: [f.choice.transfers[0], f.choice.transfers[0]] }), "range");
  });
  it.each([0, 1] as const)("contextual example in %s stays in its source; model quotes never become range boundaries", side => {
    const f = mergeFixture(), range = paragraphRanges(f.pair[side])[2];
    expect(mergeBlockFailure(f.pair[side], range, mergeHints(f.analysis.result, f.pair), side)).toBe("context");
    fail(() => build(f, { ...f.choice, canonical: side === 0 ? 1 : 0, insertion: paragraphRanges(f.pair[side === 0 ? 1 : 0])[0],
      transfers: [{ range, contextReviewed: true }] }), "context");
    const t = f.choice.transfers[0].range;
    fail(() => build(f, { ...f.choice, transfers: [{ range: { ...t, end: t.end - 1, text: t.text.slice(0, -1) }, contextReviewed: true }] }), "range");
  });
  it.each(["heading", "frontmatter", "code", "link", "embed", "block", "neighbor"])("refuses dependent %s blocks", kind => {
    const f = mergeFixture(), note = f.pair[1], s = note.cache!.sections![1], range = f.choice.transfers[0].range;
    if (kind === "heading") note.cache!.headings = [{ heading: "Different context", level: 2, position: note.cache!.sections![0].position }];
    if (kind === "frontmatter") note.cache!.frontmatterPosition = s.position;
    if (kind === "code") s.type = "code";
    if (kind === "link") note.cache!.links = [{ link: "Source", original: "[[Source]]", position: s.position }];
    if (kind === "embed") note.cache!.embeds = [{ link: "Source", original: "![[Source]]", position: s.position }];
    if (kind === "block") s.id = "reference";
    if (kind === "neighbor") note.cache!.sections![0].type = "code";
    expect(mergeBlockFailure(note, range, [], 1)).toBe(kind === "heading" || kind === "neighbor" ? kind : kind === "code" ? "range" : "protected");
    expect(() => build(f)).toThrow();
  });
  it("preserves canonical frontmatter, headings, links, embeds and attribution exactly", () => {
    const f = mergeFixture(), n = f.pair[0], tail = '\n# Heading\n\n[[Source]] ![[Example]]\n\nAuthor: Ada\n';
    Object.assign(n, mergeNote(n.path, '---\nauthor: Ada\n---\n\n' + n.content + tail));
    n.cache!.sections![0].type = "yaml"; n.cache!.frontmatterPosition = n.cache!.sections![0].position;
    f.analysis.pair = [{ ...n }, f.analysis.pair[1]]; f.choice.insertion = paragraphRanges(n)[0];
    n.cache!.frontmatter = { author: "Ada" }; n.references.push({ kind: "embed", original: "![[Example]]", target: "Example.md" });
    const p = build(f); expect(p.canonical.after.startsWith('---\nauthor: Ada\n---\n\n')).toBe(true);
    expect(p.canonical.after.endsWith(tail)).toBe(true); expect(p.dependencies[0].outgoing).toEqual(n.references);
    expect(p.dependencies[0].metadata!.frontmatter).toEqual({ author: "Ada" });
  });
  it.each(["conflict", "version_difference", "insufficient_context", "unrelated"])("refuses %s instead of automatically resolving it", kind => {
    const f = mergeFixture(); f.analysis.result.recommendation = { action: "manual_review", reason: "Review differences.", evidence: ["shared"] }; f.analysis.result.alternatives = [];
    if (kind === "conflict" || kind === "version_difference") {
      f.analysis.result.claims[0].kind = kind; f.analysis.result.relation = "conflicting";
    } else f.analysis.result.relation = kind as "insufficient_context" | "unrelated";
    fail(() => build(f), "conflict");
  });
  it("requires current analysis, identities, whole paragraphs and both explicit confirmations", () => {
    const f = mergeFixture(); fail(() => build(f, { ...f.choice, insertionConfirmed: false }), "confirmation");
    fail(() => build(f, { ...f.choice, transfers: [{ ...f.choice.transfers[0], contextReviewed: false }] }), "confirmation");
    f.pair[0].file.stat.ctime++; fail(() => build(f), "source");
    const g = mergeFixture(); g.analysis.result.claims[0].quoteA = "invented"; fail(() => build(g), "analysis");
    const h = mergeFixture(); h.pair[1].cache = null; fail(() => build(h), "metadata");
  });
  it("keeps original CRLF inside copied prose and uses canonical separators", () => {
    const f = mergeFixture(), n = mergeNote(f.pair[0].path, f.pair[0].content.replace(/\n/gu, "\r\n"));
    const secondary = mergeNote(f.pair[1].path, f.pair[1].content + "\nRepeated observation.\r\nMore author wording.\n");
    const pair = [n, secondary] as const, analysis = { ...f.analysis, pair }, range = paragraphRanges(secondary)[4];
    const p = buildMergePlan(analysis, pair, { ...f.choice, insertion: paragraphRanges(n)[0], transfers: [{ range, contextReviewed: true }] });
    expect(range.text).toBe("Repeated observation.\r\nMore author wording.");
    expect(p.insertion.edit.inserted).toBe("\r\n\r\n" + range.text); expect(p.secondary.content).toBe(secondary.content);
  });
});

function sessionFixture() {
  const f = mergeFixture(); let analysis: typeof f.analysis | undefined = f.analysis;
  const deps = { read: vi.fn(async (): Promise<PlannerRead> => f.read), analysis: () => analysis, incoming: vi.fn((): MergeIncoming => [null, null]) };
  const session = new ChangePlannerSession(deps);
  return { ...f, deps, session, changeAnalysis: (fresh: boolean) => { analysis = fresh ? { ...f.analysis } : undefined; } };
}
describe("merge lifecycle and IO boundary", () => {
  it("a deleted source during final read leaves no successful or partial plan", async () => {
    const f = sessionFixture(); await f.session.prepare();
    f.deps.read.mockResolvedValueOnce(f.read).mockRejectedValueOnce(Error("deleted"));
    await f.session.buildMerge(f.choice); expect(f.session.view.stage).toBe("error");
    expect(f.session.view.mergeError).toBe("source"); expect(f.session.view.mergePlan).toBeUndefined();
  });
  it("is passive, rereads before publication and has no executable single/multi plan", async () => {
    const f = sessionFixture(); expect(f.deps.read).not.toHaveBeenCalled(); expect(f.deps.incoming).not.toHaveBeenCalled();
    await f.session.prepare(); expect(f.deps.incoming).not.toHaveBeenCalled(); await f.session.buildMerge(f.choice);
    expect(f.deps.read).toHaveBeenCalledTimes(3); expect(f.deps.incoming).toHaveBeenCalledTimes(2); expect(f.session.view.mergePlan).toBeDefined();
    expect(f.session.view.plan).toBeUndefined(); expect(f.session.view.multiPlan).toBeUndefined();
    f.session.changeSelection(); expect(f.session.view.mergePlan).toBeUndefined(); f.session.cancel(); expect(f.session.view.stage).toBe("cancelled");
  });
  for (const side of [0, 1]) for (const phase of ["build", "publish"]) it.each(["content", "identity", "ctime", "mtime", "size", "path", "metadata", "resolver", "references", "incoming"])(
    `invalidates whole result on ${side} %s change before ${phase}`, async field => {
      const f = sessionFixture(); await f.session.prepare(); const note: PlanNote = { ...f.pair[side] };
      if (field === "content") note.content += " edit";
      if (field === "identity") note.file = { ...note.file };
      if (field === "ctime") note.created!++;
      if (field === "mtime") note.modified++;
      if (field === "size") note.bytes++;
      if (field === "path") note.path = "Moved.md";
      if (field === "metadata") note.cache = { ...note.cache, headings: [] };
      if (field === "references") note.references = [{ kind: "link", original: "[[Else]]", target: "Else.md" }];
      const next: PlannerRead = { pair: side === 0 ? [note, f.pair[1]] : [f.pair[0], note], linktexts: field === "resolver" ? ["", ""] : f.read.linktexts };
      if (field === "incoming") { f.deps.incoming.mockReturnValueOnce([null, null]).mockReturnValueOnce([{ items: ["New.md"], total: 1 }, null]); }
      else { if (phase === "publish") f.deps.read.mockResolvedValueOnce(f.read); f.deps.read.mockResolvedValueOnce(next); }
      await f.session.buildMerge(f.choice); expect(f.session.view.stage).toBe("stale"); expect(f.session.view.mergePlan).toBeUndefined();
    });
  it.each(["close", "cancel", "invalidate", "changeSelection", "analysis", "newAnalysis"] as const)("%s during final read prevents stale publication and duplicate build", async action => {
    const f = sessionFixture(); await f.session.prepare(); let done!: (r: PlannerRead) => void;
    f.deps.read.mockResolvedValueOnce(f.read).mockReturnValueOnce(new Promise(r => { done = r; }));
    const pending = f.session.buildMerge(f.choice); await Promise.resolve(); await f.session.buildMerge(f.choice);
    if (action === "analysis" || action === "newAnalysis") f.changeAnalysis(action === "newAnalysis"); else f.session[action]();
    done(f.read); await pending; expect(f.session.view.mergePlan).toBeUndefined(); expect(f.deps.read).toHaveBeenCalledTimes(3);
  });
  it("reads only saved selected Markdown and cached incoming paths; no editor buffers, scans, executor, journal or network", async () => {
    const f = mergeFixture(), fetch = vi.fn(), write = vi.fn(); vi.stubGlobal("fetch", fetch);
    const vault = { getFileByPath: vi.fn((path: string) => f.pair.find(n => n.path === path)?.file ?? null), read: vi.fn(async (file: PlanNote["file"]) => f.pair.find(n => n.file === file)!.content),
      getMarkdownFiles: vi.fn(), process: write, modify: write, create: write, adapter: { write, copy: write } };
    const getValue = vi.fn(() => "UNSAVED BUFFER"), app = { vault, workspace: { activeEditor: { editor: { getValue } } },
      metadataCache: { getFileCache: (file: PlanNote["file"]) => f.pair.find(n => n.file === file)?.cache,
        getFirstLinkpathDest: (p: string) => vault.getFileByPath(p + ".md"), resolvedLinks: { [f.pair[0].path]: { [f.pair[1].path]: 1 } } } };
    const session = new ChangePlannerSession({ analysis: () => f.analysis, read: () => readPlannerPair(app as never, [f.pair[0].path, f.pair[1].path]),
      incoming: () => [readCachedIncoming(app as never, f.pair[0].path) ?? null, readCachedIncoming(app as never, f.pair[1].path) ?? null] });
    await session.prepare(); await session.buildMerge(f.choice); const p = session.view.mergePlan!;
    expect(p.dependencies[1].incoming).toEqual({ items: [f.pair[0].path], total: 1 }); expect(p.canonical.before).toBe(f.pair[0].content);
    expect(vault.read).toHaveBeenCalledTimes(6); for (const mock of [write, fetch, requestUrl, getValue, vault.getMarkdownFiles]) expect(mock).not.toHaveBeenCalled();
  });
});
