import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, getLanguage: () => "en", requestUrl: vi.fn(), parseLinktext: (link: string) => ({ path: link.split("#")[0] }) }));
import { requestUrl } from "obsidian";
import { buildMultiFilePlan } from "./multiFilePlan";
import type { MultiFileChoice } from "./multiFilePlan";
import { ChangePlannerSession, readPlannerPair } from "./changePlannerSession";
import type { PlannerRead } from "./changePlannerSession";
import { paragraphRanges } from "./changePlan";
import type { PlanFailure, PlanNote } from "./changePlan";
import { multiFileFixture } from "../tests/multiFileFixture";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function build(f = multiFileFixture(), choice = f.choice) { return buildMultiFilePlan(f.analysis, f.pair, choice, f.read.linktexts); }
function fails(work: () => unknown, reason: PlanFailure, side?: number) { expect(work).toThrow(expect.objectContaining({ reason, ...(side === undefined ? {} : { side }) })); }

describe("one serializable reciprocal-link plan", () => {
  it("preserves both full sources, homonyms, Cyrillic, spaces and distinct explicit locations", () => {
    const f = multiFileFixture(), plan = build(f);
    expect(plan).toMatchObject({ version: 1, operation: "add_reciprocal_links", participants: f.pair.map(n => n.path) });
    expect(plan.files).toHaveLength(2); expect(plan.dependencies.map(d => d.to)).toEqual([f.pair[1].path, f.pair[0].path]);
    for (const side of [0, 1] as const) {
      const file = plan.files[side], point = f.choice.selections[side]!.end, token = `[[${f.read.linktexts[side === 0 ? 1 : 0]}]]`;
      expect(file).toMatchObject({ kind: "modify", path: f.pair[side].path, before: f.pair[side].content,
        identity: { created: 1, modified: 2, bytes: f.pair[side].bytes },
        edits: [{ start: point, end: point, removed: "", inserted: ` ${token}` }], userSelection: { confirmed: true } });
      expect(file.after).toBe(file.before.slice(0, point) + ` ${token}` + file.before.slice(point));
    }
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
    expect(JSON.stringify(plan)).not.toContain('"file":');
    f.choice.selections[0]!.text = "mutated"; f.pair[0].references.push({ kind: "link", original: "changed", target: "Other.md" });
    f.analysis.result.recommendation.evidence.push("changed");
    expect(plan.files[0].userSelection.range.text).not.toBe("mutated"); expect(plan.files[0].links.preserved).toEqual([]);
    expect(plan.provenance.recommendation.evidence).not.toContain("changed");
    expect(plan.provenance.userOperation).toBe("add_reciprocal_links");
  });
  it("chooses only the second identical paragraph, leaving the first occurrence intact", () => {
    const f = multiFileFixture(), repeated = paragraphRanges(f.pair[0]).filter(r => r.text === "Repeated paragraph.");
    const plan = build(f, { ...f.choice, selections: [repeated[1], f.choice.selections[1]] });
    expect(plan.files[0].after).toContain(`Repeated paragraph.\n\nRepeated paragraph. [[${f.read.linktexts[1]}]]`);
  });
  it.each([0, 1, 2])("rejects existing directed links on side(s) %s without returning a partial plan", side => {
    const f = multiFileFixture();
    for (const i of side === 2 ? [0, 1] as const : [side as 0 | 1]) f.pair[i].references.push({ kind: "link", original: "[[Same name]]", target: f.pair[i === 0 ? 1 : 0].path });
    fails(() => build(f), "existing", side === 2 ? 0 : side);
  });
  it.each([0, 1] as const)("requires side %s confirmation, exact range and resolved full-path link", side => {
    const f = multiFileFixture(), confirmations: [boolean, boolean] = [true, true]; confirmations[side] = false;
    fails(() => build(f, { ...f.choice, confirmed: confirmations }), "confirmation", side);
    f.choice.selections[side]!.text += "wrong"; fails(() => build(f), "range", side);
    const g = multiFileFixture(); g.read.linktexts = side === 0 ? [g.read.linktexts[0], ""] : ["", g.read.linktexts[1]];
    fails(() => build(g), "link", side);
  });
  it.each(["frontmatter", "code", "embed", "link", "block"])("rejects a protected %s region in either file", kind => {
    for (const side of [0, 1] as const) {
      const f = multiFileFixture(), range = f.choice.selections[side]!, position = { start: { offset: range.start, line: 0, col: 0 }, end: { offset: range.end, line: 0, col: 0 } };
      const cache = f.pair[side].cache!;
      if (kind === "code") cache.sections!.find(s => s.position.start.offset === range.start)!.type = "code";
      if (kind === "frontmatter") cache.frontmatterPosition = position;
      if (kind === "embed") cache.embeds = [{ original: "![[Other]]", link: "Other", position }];
      if (kind === "link") cache.links = [{ original: "[[Other]]", link: "Other", position }];
      if (kind === "block") cache.blocks = { id: { id: "id", position } };
      fails(() => build(f), kind === "code" ? "range" : "protected", side);
    }
  });
  it.each(["../Outside.md", "/Outside.md", "A/../Outside.md", "A\\B.md", ".obsidian/Private.md"])("rejects path %s even from an untrusted caller", path => {
    const f = multiFileFixture(); f.pair[0].path = path; fails(() => build(f), "source", 0);
  });
  it("refuses duplicate participants, missing cache, unsupported operations and stale identities", () => {
    const f = multiFileFixture(); fails(() => buildMultiFilePlan(f.analysis, [f.pair[0], f.pair[0]], f.choice, f.read.linktexts), "source");
    fails(() => build(f, { ...f.choice, operation: "create" } as unknown as MultiFileChoice), "recommendation");
    f.pair[1].cache = null; fails(() => build(f), "metadata", 0);
    const g = multiFileFixture(); g.pair[1].file.stat.ctime++; fails(() => build(g), "source", 1);
  });
});

function sessionFixture() {
  const f = multiFileFixture(); let analysis: typeof f.analysis | undefined = f.analysis;
  const deps = { analysis: () => analysis, read: vi.fn(async () => f.read) };
  const session = new ChangePlannerSession(deps);
  return { ...f, deps, session, invalidateAnalysis: () => { analysis = undefined; }, replaceAnalysis: () => { analysis = { ...f.analysis }; } };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
describe("whole-plan freshness and lifecycle", () => {
  it("is passive until requested, reads again before publishing, and never exposes a single-file subplan", async () => {
    const f = sessionFixture(), views: unknown[] = []; f.session.onChange = () => views.push(f.session.view);
    expect(f.deps.read).not.toHaveBeenCalled(); await f.session.prepare(); await f.session.buildMulti(f.choice);
    expect(f.deps.read).toHaveBeenCalledTimes(3); expect(f.session.view.stage).toBe("ready");
    expect(f.session.view.multiPlan?.files).toHaveLength(2); expect(views.every(v => !(v as { plan?: unknown }).plan)).toBe(true);
    f.session.changeSelection(); expect(f.session.view.multiPlan).toBeUndefined();
  });
  for (const side of [0, 1] as const) for (const phase of ["build", "publish"] as const) {
    it.each(["content", "path", "modified", "bytes", "file", "created", "cache", "references", "resolver"])(
      `rejects changed %s in ${side} before ${phase}`, async field => {
        const f = sessionFixture(); await f.session.prepare();
        const changed: PlanNote = { ...f.pair[side] };
        if (field === "content") changed.content += " edit";
        if (field === "path") changed.path = "Moved.md";
        if (field === "modified") changed.modified++;
        if (field === "bytes") changed.bytes++;
        if (field === "file") changed.file = { ...changed.file };
        if (field === "created") changed.created!++;
        if (field === "cache") changed.cache = null;
        if (field === "references") changed.references = [{ kind: "link", original: "[[Other]]", target: "Other.md" }];
        const next: PlannerRead = { pair: side === 0 ? [changed, f.pair[1]] : [f.pair[0], changed], linktexts: field === "resolver" ? ["", ""] : f.read.linktexts };
        if (phase === "publish") f.deps.read.mockResolvedValueOnce(f.read);
        f.deps.read.mockResolvedValueOnce(next);
        await f.session.buildMulti(f.choice); expect(f.session.view.stage).toBe("stale"); expect(f.session.view.multiPlan).toBeUndefined(); expect(f.session.view.plan).toBeUndefined();
      });
  }
  it.each(["close", "cancel", "invalidate", "changeSelection", "analysis", "newAnalysis"] as const)("%s during final verification prevents late publication and duplicate requests", async action => {
    const f = sessionFixture(); await f.session.prepare(); const d = deferred<PlannerRead>();
    f.deps.read.mockResolvedValueOnce(f.read).mockReturnValueOnce(d.promise);
    const pending = f.session.buildMulti(f.choice); await Promise.resolve(); await f.session.buildMulti(f.choice);
    expect(f.deps.read).toHaveBeenCalledTimes(3);
    if (action === "analysis") f.invalidateAnalysis(); else if (action === "newAnalysis") f.replaceAnalysis(); else f.session[action]();
    d.resolve(f.read); await pending; expect(f.session.view.multiPlan).toBeUndefined();
  });
  it("rejects missing/moved files, live identity changes and invalidated analysis at preparation", async () => {
    const f = sessionFixture(); await f.session.prepare(); f.deps.read.mockRejectedValueOnce(Error("missing")); await f.session.buildMulti(f.choice);
    expect(f.session.view).toMatchObject({ stage: "error", error: "source" }); expect(f.session.view.input).toBeUndefined();
    const g = sessionFixture(); await g.session.prepare(); g.pair[0].file.stat.ctime++; await g.session.buildMulti(g.choice); expect(g.session.view.stage).toBe("stale");
    const h = sessionFixture(); h.invalidateAnalysis(); await h.session.prepare(); expect(h.session.view.stage).toBe("stale"); expect(h.deps.read).not.toHaveBeenCalled();
  });
  it("resets after failure/cancel and snapshots confirmation at click instead of retaining mutable UI state", async () => {
    const f = sessionFixture(); await f.session.prepare(); const d = deferred<PlannerRead>(); f.deps.read.mockReturnValueOnce(d.promise);
    const pending = f.session.buildMulti(f.choice); f.choice.selections[0]!.text = "mutated UI"; d.resolve(f.read); await pending;
    expect(f.session.view.multiPlan?.files[0].userSelection.range.text).not.toBe("mutated UI");
    f.session.cancel(); await f.session.prepare(); await f.session.buildMulti(f.choice); expect(f.session.view.stage).toBe("error"); expect(f.session.view.multiPlan).toBeUndefined();
  });
  it("uses only selected paths and public metadata/link APIs, without writes, enumeration or transport", async () => {
    const f = multiFileFixture(), fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const vault = { getFileByPath: vi.fn((path: string) => f.pair.find(n => n.path === path)?.file ?? null),
      read: vi.fn(async (file: PlanNote["file"]) => f.pair.find(n => n.file === file)!.content),
      process: vi.fn(), modify: vi.fn(), create: vi.fn(), getMarkdownFiles: vi.fn(), adapter: { write: vi.fn(), copy: vi.fn() } };
    const metadataCache = { getFileCache: vi.fn((file: PlanNote["file"]) => f.pair.find(n => n.file === file)!.cache),
      getFirstLinkpathDest: vi.fn((path: string) => f.pair.find(n => n.path === path + ".md")?.file ?? null) };
    const session = new ChangePlannerSession({ analysis: () => f.analysis, read: () => readPlannerPair({ vault, metadataCache } as never, [f.pair[0].path, f.pair[1].path]) });
    await session.prepare(); await session.buildMulti(f.choice); expect(session.view.multiPlan?.files).toHaveLength(2); expect(vault.read).toHaveBeenCalledTimes(6);
    for (const mock of [fetch, requestUrl, vault.process, vault.modify, vault.create, vault.getMarkdownFiles, vault.adapter.write, vault.adapter.copy]) expect(mock).not.toHaveBeenCalled();
    metadataCache.getFirstLinkpathDest.mockReturnValue(null); await session.buildMulti(f.choice); expect(session.view.multiPlan).toBeUndefined();
  });
});
