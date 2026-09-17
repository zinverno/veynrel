import { describe, expect, it } from "vitest";
import { brokenLinksAnalyzer } from "./brokenLinksAnalyzer";
import { orphanAnalyzer } from "./orphanAnalyzer";
import { noIncomingLinksAnalyzer } from "./noIncomingLinksAnalyzer";
import { noOutgoingLinksAnalyzer } from "./noOutgoingLinksAnalyzer";
import { noteShapeAnalyzer } from "./noteShapeAnalyzer";
import { createLocalAnalysisContext } from "./localNoteGraph";
import { note, snapshot } from "./testFixtures";
import { isFindingCandidate } from "../../domain/findingValidation";
import { createFindingFingerprint } from "../../domain/identity";
import { meaningfulCharacterCount, noteBody } from "./content";

const signal = (): AbortSignal => new AbortController().signal;
const graphNotes = () => [
  note("A.md", { resolvedOutgoing: ["B.md", "B.md"] }), note("B.md", { resolvedOutgoing: ["C.md"] }), note("C.md"),
  note("D.md", { resolvedOutgoing: ["D.md"], unresolvedLinks: [{ target: "Missing", count: 1 }] }),
  note("E.md", { resolvedOutgoing: ["F.md"] }), note("F.md", { resolvedOutgoing: ["E.md"] }),
];

describe("broken links", () => {
  it("aggregates repeated technical targets and uses the domain fingerprint helper", async () => {
    const context = await createLocalAnalysisContext(snapshot([note("A.md", { unresolvedLinks: [{ target: "Missing#Heading", count: 2 }, { target: "Other", count: 1 }, { target: "Missing#Heading", count: 3 }] })]), signal());
    const result = await brokenLinksAnalyzer.analyze(context, signal());
    expect(result).toMatchObject({ successful: true, complete: true, analyzerId: "broken-links", analyzerVersion: "1" });
    expect(result.candidates).toHaveLength(2);
    const item = result.candidates.find((candidate) => candidate.evidence.some((entry) => entry.value === "Missing#Heading"))!;
    expect(item.evidence).toContainEqual({ kind: "occurrence-count", value: 5 });
    expect(item.fingerprint).toBe(createFindingFingerprint({ source: "local", analyzerId: "broken-links", dimension: "structure", type: "broken-link", paths: ["A.md"], key: "Missing#Heading" }));
    expect(item.notePaths).toEqual(["A.md"]);
    expect(item.actions).toEqual([{ kind: "open-note", path: "A.md" }]);
    expect(result.candidates.every(isFindingCandidate)).toBe(true);
  });

  it("emits only known positives with partial metadata and no finding for resolved edges", async () => {
    const context = await createLocalAnalysisContext(snapshot([
      note("A.md", { resolvedOutgoing: ["B.md", "image.png"], unresolvedLinks: [{ target: "Known missing", count: 1 }] }),
      note("B.md", { linksAvailable: false, unresolvedLinks: [{ target: "Untrustworthy", count: 1 }] }),
    ]), signal());
    const result = await brokenLinksAnalyzer.analyze(context, signal());
    expect(result.complete).toBe(false);
    expect(result.successful).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].evidence).toContainEqual({ kind: "target", value: "Known missing" });
  });

  it("bounds long target evidence without truncating identity or treating it as a path", async () => {
    const target = "../Not a canonical vault path/" + "x".repeat(900);
    const context = await createLocalAnalysisContext(snapshot([note("A.md", { unresolvedLinks: [{ target, count: 1 }] })]), signal());
    const { candidates } = await brokenLinksAnalyzer.analyze(context, signal());
    expect(isFindingCandidate(candidates[0])).toBe(true);
    expect(candidates[0].fingerprint).toContain(target);
    expect(candidates[0].evidence).toContainEqual({ kind: "target-truncated", value: true });
    expect(candidates[0].evidence.find((item) => item.kind === "target")?.value).toHaveLength(500);
  });
});

describe("shared graph degrees", () => {
  it("classifies orphans/incoming/outgoing mutually exclusively and ignores repeated/self edges", async () => {
    const context = await createLocalAnalysisContext(snapshot(graphNotes()), signal());
    expect(context.graph.outgoing["A.md"]).toEqual(["B.md"]);
    expect(context.graph.outgoing["D.md"]).toEqual([]);
    expect(context.graph.incoming["D.md"]).toEqual([]);
    const [orphans, incoming, outgoing] = await Promise.all([
      orphanAnalyzer.analyze(context, signal()), noIncomingLinksAnalyzer.analyze(context, signal()), noOutgoingLinksAnalyzer.analyze(context, signal()),
    ]);
    expect(orphans.candidates.map((item) => item.notePaths)).toEqual([["D.md"]]);
    expect(incoming.candidates.map((item) => item.notePaths)).toEqual([["A.md"]]);
    expect(outgoing.candidates.map((item) => item.notePaths)).toEqual([["C.md"]]);
    expect(outgoing.candidates[0].evidence).toContainEqual({ kind: "incoming-count-complete", value: true });
    expect(incoming.candidates[0].evidence).toContainEqual({ kind: "outgoing-count", value: 1 });
  });

  it("suppresses global absence claims with missing source metadata, but retains safe no-outgoing positives", async () => {
    const notes = [...graphNotes(), note("Unknown.md", { linksAvailable: false })];
    const context = await createLocalAnalysisContext(snapshot(notes), signal());
    for (const analyzer of [orphanAnalyzer, noIncomingLinksAnalyzer]) {
      expect(await analyzer.analyze(context, signal())).toMatchObject({ candidates: [], successful: true, complete: false });
    }
    const outgoing = await noOutgoingLinksAnalyzer.analyze(context, signal());
    expect(outgoing.complete).toBe(false);
    expect(outgoing.candidates[0].evidence).toContainEqual({ kind: "incoming-count-complete", value: false });
    expect(outgoing.candidates.map((item) => item.notePaths)).toEqual([["C.md"]]);
  });

  it("does not assert no-outgoing for unavailable own metadata or an incomplete note list", async () => {
    const context = await createLocalAnalysisContext(snapshot([note("A.md", { resolvedOutgoing: ["B.md"] }), note("B.md", { linksAvailable: false })]), signal());
    expect((await noOutgoingLinksAnalyzer.analyze(context, signal())).candidates).toEqual([]);
    const partialList = await createLocalAnalysisContext(snapshot(graphNotes(), { noteListComplete: false }), signal());
    expect((await noOutgoingLinksAnalyzer.analyze(partialList, signal())).candidates).toEqual([]);
  });

  it("honors explicit incomplete coverage even when every captured note is available", async () => {
    const context = await createLocalAnalysisContext(snapshot(graphNotes(), { linksComplete: false }), signal());
    expect((await orphanAnalyzer.analyze(context, signal())).complete).toBe(false);
    expect((await orphanAnalyzer.analyze(context, signal())).candidates).toEqual([]);
  });
});

describe("note shape", () => {
  it.each([
    ["", "empty-note", 0], [" \n\t", "empty-note", 0], ["---\ntitle: Metadata alone\n---\n", "empty-note", 0],
    ["\uFEFF---\r\ntitle: Metadata\r\n---\r\n", "empty-note", 0], ["# Tiny", "near-empty-note", 4],
    ["a".repeat(31), "near-empty-note", 31], ["я".repeat(31), "near-empty-note", 31], ["😀✨💡", "empty-note", 0],
  ])("classifies %j using body Unicode letters/numbers", async (content, type, count) => {
    const context = await createLocalAnalysisContext(snapshot([note("A.md", { content })]), signal());
    const result = await noteShapeAnalyzer.analyze(context, signal());
    expect(result.candidates[0]).toMatchObject({ type, impact: count === 0 ? "review" : "info", evidence: [{ kind: "meaningful-character-count", value: count }] });
    expect(isFindingCandidate(result.candidates[0])).toBe(true);
    expect(result.candidates[0].evidence).toHaveLength(1);
  });

  it("treats 32+ meaningful characters as neither empty nor near-empty", async () => {
    for (const content of ["a".repeat(32), "я".repeat(32), "字".repeat(32), "12345678".repeat(4)]) {
      const context = await createLocalAnalysisContext(snapshot([note("A.md", { content })]), signal());
      expect((await noteShapeAnalyzer.analyze(context, signal())).candidates).toEqual([]);
    }
  });

  it("does not strip malformed/nonleading frontmatter and counts combining marks conservatively", () => {
    expect(noteBody("---\ntitle: Unclosed")).toBe("---\ntitle: Unclosed");
    expect(noteBody("body\n---\ntitle: Not frontmatter\n---")).toContain("title");
    expect(noteBody("---\n---\nbody")).toBe("body");
    expect(meaningfulCharacterCount("e\u0301é１２字")).toBe(5);
  });

  it("skips unreadable content, retains known findings and marks partial", async () => {
    const context = await createLocalAnalysisContext(snapshot([note("A.md", { content: "" }), note("B.md", { content: undefined, contentAvailable: false })]), signal());
    const result = await noteShapeAnalyzer.analyze(context, signal());
    expect(result).toMatchObject({ successful: true, complete: false });
    expect(result.candidates.map((item) => item.notePaths)).toEqual([["A.md"]]);
    const partial = await createLocalAnalysisContext(snapshot([note("A.md", { content: "" })], { contentComplete: false }), signal());
    expect((await noteShapeAnalyzer.analyze(partial, signal())).complete).toBe(false);
  });
});
