import { afterEach, describe, expect, it, vi } from "vitest";
import { exactDuplicatesAnalyzer } from "./exactDuplicatesAnalyzer";
import { duplicateTitlesAnalyzer } from "./duplicateTitlesAnalyzer";
import { graphComponentsAnalyzer } from "./graphComponentsAnalyzer";
import { createLocalAnalysisContext } from "./localNoteGraph";
import { note, snapshot } from "./testFixtures";
import { isFindingCandidate } from "../../domain/findingValidation";
import * as contentHelpers from "./content";
import type { LocalNoteSnapshot } from "./types";

const body = "A sufficiently detailed piece of knowledge with more than thirty two letters.\nSecond line.";
const signal = (): AbortSignal => new AbortController().signal;
async function duplicates(notes: LocalNoteSnapshot[]) {
  return exactDuplicatesAnalyzer.analyze(await createLocalAnalysisContext(snapshot(notes), signal()), signal());
}
function chain(prefix: string, count: number): LocalNoteSnapshot[] {
  return Array.from({ length: count }, (_, i) => note(`${prefix}/${i.toString().padStart(3, "0")}.md`, {
    resolvedOutgoing: i + 1 < count ? [`${prefix}/${(i + 1).toString().padStart(3, "0")}.md`] : [],
  }));
}
async function components(notes: LocalNoteSnapshot[]) {
  return graphComponentsAnalyzer.analyze(await createLocalAnalysisContext(snapshot(notes), signal()), signal());
}
afterEach(() => vi.restoreAllMocks());

describe("exact duplicates", () => {
  it.each([body, body.replace(/\n/g, "\r\n"), body.replace(/\n/g, "\r"), `\uFEFF${body}`, ` \n${body}\n\t`])("groups normalized equivalent %j", async (content) => {
    const result = await duplicates([note("A.md", { content: body }), note("B.md", { content })]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].notePaths).toEqual(["A.md", "B.md"]);
    expect(result).toMatchObject({ successful: true, complete: true });
  });

  it("produces one group for three notes and preserves content-pattern identity as membership grows", async () => {
    const a = await duplicates([note("B.md", { content: body }), note("A.md", { content: body })]);
    const b = await duplicates([note("C.md", { content: body }), note("A.md", { content: body }), note("B.md", { content: body })]);
    expect(b.candidates).toHaveLength(1);
    expect(b.candidates[0].fingerprint).toBe(a.candidates[0].fingerprint);
    expect(b.candidates[0].evidence).toContainEqual({ kind: "member-count", value: 3 });
    expect(b.candidates[0].fingerprint).not.toContain(body);
    expect(b.candidates[0].fingerprint).not.toContain("A.md");
    expect(JSON.stringify(b.candidates[0])).not.toContain(body);
    expect(await duplicates([note("A.md", { content: body }), note("B.md", { content: body })])).toEqual(a);
  });

  it.each([body.replace("detailed piece", "detailed  piece"), body.toUpperCase(), `# ${body}`, `---\nstatus: new\n---\n${body}`])("keeps internal whitespace, case, Markdown and metadata differences distinct", async (content) => {
    expect((await duplicates([note("A.md", { content: body }), note("B.md", { content })])).candidates).toEqual([]);
  });

  it("does not remove differing frontmatter before exact comparison", async () => {
    const a = `---\nstatus: one\n---\n${body}`;
    const b = `---\nstatus: two\n---\n${body}`;
    expect((await duplicates([note("A.md", { content: a }), note("B.md", { content: b })])).candidates).toEqual([]);
  });

  it.each(["", " \n\t", "a".repeat(31), "😀😀", `---\ndescription: ${body}\n---`])("ignores empty/near-empty duplicate bodies %j", async (content) => {
    expect((await duplicates([note("A.md", { content }), note("B.md", { content })])).candidates).toEqual([]);
  });

  it("includes the 32-character boundary and supports Unicode", async () => {
    const result = await duplicates([note("A.md", { content: "я".repeat(32) }), note("B.md", { content: "я".repeat(32) })]);
    expect(result.candidates).toHaveLength(1);
  });

  it("caps representatives at 100 while retaining full group size and full-content identity", async () => {
    const notes = Array.from({ length: 105 }, (_, i) => note(`${i.toString().padStart(3, "0")}.md`, { content: body })).reverse();
    const item = (await duplicates(notes)).candidates[0];
    expect(item.notePaths).toHaveLength(100);
    expect(item.notePaths[0]).toBe("000.md");
    expect(item.notePaths[99]).toBe("099.md");
    expect(item.evidence).toContainEqual({ kind: "member-count", value: 105 });
    expect(item.evidence).toContainEqual({ kind: "represented-path-count", value: 100 });
    expect(isFindingCandidate(item)).toBe(true);
  });

  it("verifies actual normalized equality within colliding hash buckets", async () => {
    vi.spyOn(contentHelpers, "duplicateBucketKey").mockReturnValue("forced-collision");
    const other = body.replace("knowledge", "different");
    const result = await duplicates([
      note("A.md", { content: body }), note("B.md", { content: body }),
      note("C.md", { content: other }), note("D.md", { content: other }),
    ]);
    expect(result.candidates.map((item) => item.notePaths).sort()).toEqual([["A.md", "B.md"], ["C.md", "D.md"]]);
    expect(new Set(result.candidates.map((item) => item.fingerprint)).size).toBe(2);
  });

  it("retains proven groups with incomplete content and ignores unavailable values", async () => {
    const result = await duplicates([note("A.md", { content: body }), note("B.md", { content: body }), note("C.md", { content: body, contentAvailable: false })]);
    expect(result).toMatchObject({ successful: true, complete: false });
    expect(result.candidates[0].notePaths).toEqual(["A.md", "B.md"]);
  });
});

describe("duplicate titles", () => {
  it("groups exact basenames, keeps case variants separate, and uses membership-independent identity", async () => {
    const run = async (paths: string[]) => duplicateTitlesAnalyzer.analyze(await createLocalAnalysisContext(snapshot(paths.map((path) => note(path))), signal()), signal());
    const first = await run(["B/Foo.md", "A/Foo.md", "foo.md", "Unique.md"]);
    const next = await run(["C/Foo.md", "B/Foo.md", "A/Foo.md", "foo.md"]);
    expect(first.candidates).toHaveLength(1);
    expect(next.candidates).toHaveLength(1);
    expect(next.candidates[0].fingerprint).toBe(first.candidates[0].fingerprint);
    expect(next.candidates[0].evidence).toContainEqual({ kind: "member-count", value: 3 });
    expect(first.candidates[0].notePaths).toEqual(["A/Foo.md", "B/Foo.md"]);
    expect((await run(["Foo.md", "foo.md"])).candidates).toEqual([]);
  });

  it("depends only on note-list completeness", async () => {
    const notes = [note("A/Foo.md", { contentAvailable: false, content: undefined, linksAvailable: false }), note("B/Foo.md")];
    const context = await createLocalAnalysisContext(snapshot(notes, { linksComplete: false, contentComplete: false }), signal());
    expect((await duplicateTitlesAnalyzer.analyze(context, signal())).complete).toBe(true);
    const partial = await createLocalAnalysisContext(snapshot(notes, { noteListComplete: false }), signal());
    const result = await duplicateTitlesAnalyzer.analyze(partial, signal());
    expect(result.complete).toBe(false);
    expect(result.candidates).toHaveLength(1);
  });

  it("bounds representatives and very long basename evidence", async () => {
    const basename = "F".repeat(600);
    const notes = Array.from({ length: 102 }, (_, i) => note(`${i.toString().padStart(3, "0")}/${basename}.md`)).reverse();
    const result = await duplicateTitlesAnalyzer.analyze(await createLocalAnalysisContext(snapshot(notes), signal()), signal());
    const item = result.candidates[0];
    expect(item.notePaths).toHaveLength(100);
    expect(item.notePaths[0]).toBe(`000/${basename}.md`);
    expect(item.evidence).toContainEqual({ kind: "member-count", value: 102 });
    expect(item.evidence).toContainEqual({ kind: "represented-path-count", value: 100 });
    expect(item.evidence).toContainEqual({ kind: "basename-truncated", value: true });
    expect(isFindingCandidate(item)).toBe(true);
  });
});

describe("graph components", () => {
  it("treats directed links as undirected connectivity and reports only nonprimary multi-note islands", async () => {
    const notes = [...chain("Primary", 4), ...chain("Island", 3), note("H.md", { resolvedOutgoing: ["H.md"] })];
    const result = await components(notes);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].notePaths).toEqual(["Island/000.md", "Island/001.md", "Island/002.md"]);
    expect(result.candidates[0].evidence).toEqual([{ kind: "component-size", value: 3 }, { kind: "represented-path-count", value: 3 }, { kind: "primary-component-size", value: 4 }]);
    expect(result.candidates[0].fingerprint).not.toContain("Island/");
    expect(await components([...notes].reverse())).toEqual(result);
  });

  it("chooses the primary by size then first path; repeated edges do not affect it", async () => {
    const result = await components([
      note("A.md", { resolvedOutgoing: ["B.md", "B.md", "A.md"] }), note("B.md"),
      note("X.md"), note("Y.md", { resolvedOutgoing: ["X.md"] }),
    ]);
    expect(result.candidates.map((item) => item.notePaths)).toEqual([["X.md", "Y.md"]]);
  });

  it("has no island when only one multi-note component or only singletons exist", async () => {
    expect((await components([...chain("One", 3), note("Singleton.md")])).candidates).toEqual([]);
    expect((await components([note("A.md"), note("B.md")])).candidates).toEqual([]);
    expect((await components([])).candidates).toEqual([]);
  });

  it("suppresses all component findings with incomplete metadata", async () => {
    const context = await createLocalAnalysisContext(snapshot([...chain("One", 3), ...chain("Two", 2), note("Unknown.md", { linksAvailable: false })]), signal());
    expect(await graphComponentsAnalyzer.analyze(context, signal())).toMatchObject({ successful: true, candidates: [], complete: false });
  });

  it("reports accurate size and bounded representatives for large islands", async () => {
    const result = await components([...chain("Primary", 103), ...chain("Island", 101)]);
    const item = result.candidates[0];
    expect(item.notePaths).toHaveLength(100);
    expect(item.notePaths[99]).toBe("Island/099.md");
    expect(item.evidence).toEqual([{ kind: "component-size", value: 101 }, { kind: "represented-path-count", value: 100 }, { kind: "primary-component-size", value: 103 }]);
    expect(isFindingCandidate(item)).toBe(true);
    const changed = await components([...chain("Primary", 103), ...chain("Island", 102)]);
    expect(changed.candidates[0].fingerprint).not.toBe(item.fingerprint);
  });
});
