import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {} }));
import fixtures from "../tests/fixtures/atomization-v1.json";
import { atomizationFixture } from "../tests/atomizationFixture";
import { atomizationCandidates, AtomizationError, buildAtomizationPlan, validateAtomizationPlan } from "./atomizationPlan";
const build = (f: ReturnType<typeof atomizationFixture>) => buildAtomizationPlan(f.analysis, f.pair, f.choice, f.observation);

describe("AtomizationPlan independent verified copy contract", () => {
  it.each(fixtures.cases.filter(c => c.accepted))("$id copies exact boundaries/context and keeps the full source", c => {
    const f = atomizationFixture(c.text), plan = build(f);
    expect(plan.selected.kind).toBe(c.accepted);
    expect(plan.source.markdown).toBe(c.text); expect(plan.source.remaining).toBe(c.text);
    for (const r of [...plan.context, plan.selected.range]) {
      expect(c.text.slice(r.start, r.end)).toBe(r.text); expect(plan.destination.markdown).toContain(r.text);
    }
    if (c.id === "h3" || c.id === "unicode-crlf") expect(plan.context.length).toBeGreaterThan(0);
    if (c.id === "unicode-crlf") expect(plan.additions.separator).toBe("\r\n\r\n");
    expect(plan.destination.markdown).toBe([plan.additions.title, ...plan.context.map(r => r.text), plan.selected.range.text, plan.additions.source].join(plan.additions.separator));
    expect(validateAtomizationPlan(JSON.parse(JSON.stringify(plan)), f.analysis, f.pair, f.choice, f.observation)).toEqual(plan);
    expect(plan.provenance.origin).toBe("manual_review");
  });
  it.each(fixtures.cases.filter(c => c.refused))("$id refuses protected/unattributed content", c => {
    const f = atomizationFixture(c.text); expect(atomizationCandidates(f.pair[0]).every(c => c.failure)).toBe(true); expect(() => build(f)).toThrow(AtomizationError);
  });
  it("does not extract an arbitrary paragraph below a heading", () => {
    const f = atomizationFixture(fixtures.cases.find(c => c.id === "dependent")!.text);
    expect(atomizationCandidates(f.pair[0]).filter(c => c.kind === "paragraph").every(c => c.failure === "context")).toBe(true);
  });
  it("does not accept partial ranges or LLM quote boundaries", () => {
    const f = atomizationFixture(); f.choice.range = { start: 2, end: 10, text: f.pair[0].content.slice(2, 10) };
    expect(() => build(f)).toThrow("range");
  });
  it.each(["conflicting", "insufficient_context"] as const)("refuses %s even with manual confirmation", relation => {
    const f = atomizationFixture(fixtures.cases.find(c => c.id === "versions")!.text); f.analysis.result.relation = relation;
    if (relation === "conflicting") f.analysis.result.claims = [{ id: "c", kind: "version_difference", text: "Unverified versions.", quoteA: f.pair[0].content, quoteB: f.pair[1].content }];
    expect(() => build(f)).toThrow("semantic");
  });
  it("known context claims cannot be overridden by user confirmations", () => {
    const f = atomizationFixture(); f.analysis.result.claims = [{ id: "c", kind: "context_a", text: "Requires other context.", quoteA: f.pair[0].content, quoteB: null }];
    expect(() => build(f)).toThrow("context");
  });
  it("a standalone quote is only a hint and still requires user context review", () => {
    const f = atomizationFixture(); f.analysis.result.claims = [{ id: "c", kind: "standalone_a", text: "Potential unit.", quoteA: "blue envelope", quoteB: null }];
    f.analysis.result.recommendation = { action: "consider_atomize", reason: "Review whole paragraph.", evidence: ["c"] };
    f.choice.manualConfirmed = false; const p = build(f); expect(p.selected.range.text).toBe(f.pair[0].content); expect(p.provenance.hintIds).toEqual(["c"]);
    f.choice.contextConfirmed = false; expect(() => build(f)).toThrow("confirmation");
  });
  it.each(["unitConfirmed", "contextConfirmed", "manualConfirmed", "titleConfirmed", "sourceConfirmed", "dependenciesReviewed"] as const)("requires explicit %s", key => {
    const f = atomizationFixture(); f.choice[key] = false; expect(() => build(f)).toThrow(AtomizationError);
  });
  it.each(fixtures.refusedPaths)("refuses unsafe path %s", path => {
    const f = atomizationFixture(); f.choice.path = f.observation.path = path; expect(() => build(f)).toThrow("path");
  });
  it.each(["Atoms/Trial observation.md", "Other/TRIAL OBSERVATION.md", "Other/Ｔrial observation.md", "Other/Trial observation.pdf"])("refuses occupied path/basename %s", path => {
    const f = atomizationFixture(); f.observation.inventory.push({ path, identity: 7, folder: false }); expect(() => build(f)).toThrow("occupied");
  });
  it.each(["absent", "parentExists", "metadataComplete"] as const)("fails closed on %s", key => {
    const f = atomizationFixture(); f.observation[key] = false; expect(() => build(f)).toThrow(AtomizationError);
  });
  it("refuses existing-link conflicts and an unresolved source link", () => {
    const f = atomizationFixture(); f.observation.linkConflicts = ["Other.md"]; expect(() => build(f)).toThrow("link");
    f.observation.linkConflicts = []; f.observation.sourceLink = "Wrong"; expect(() => build(f)).toThrow("link");
  });
  it.each(["title", "source", "selected", "context", "remaining", "metadata", "dependencies", "analysis", "identity", "mtime", "path", "extra"])("invalidates changed %s", kind => {
    const f = atomizationFixture(), plan = build(f);
    switch (kind) {
      case "title": plan.additions.title = "New"; break;
      case "source": plan.source.markdown += "new"; break;
      case "selected": plan.selected.range.end--; break;
      case "context": plan.context.push(plan.selected.range); break;
      case "remaining": plan.source.remaining = ""; break;
      case "metadata": f.pair[0].cache!.tags = []; break;
      case "dependencies": f.observation.dependencies.unresolved = { "Other.md": { Unknown: 1 } }; break;
      case "analysis": f.analysis.result.limitations.push("Changed"); break;
      case "identity": f.pair[0].file = { ...f.pair[0].file }; break;
      case "mtime": f.pair[0].file.stat.mtime++; break;
      case "path": f.choice.path = f.observation.path = "Atoms/Other.md"; break;
      case "extra": Object.assign(plan, { apply: true }); break;
    }
    expect(() => validateAtomizationPlan(plan, f.analysis, f.pair, f.choice, f.observation)).toThrow(AtomizationError);
  });
  it("missing or stale MetadataCache cannot authorize a plan", () => {
    const f = atomizationFixture(); f.pair[0].cache = null; expect(() => build(f)).toThrow("metadata");
    const g = atomizationFixture(); g.pair[0].cache!.sections![0].position.end.offset--; expect(() => build(g)).toThrow("metadata");
  });
  it("serialized v1 evidence cannot rebind session identity to reconstructed TFiles", () => {
    const original = atomizationFixture(), saved: unknown = JSON.parse(JSON.stringify(build(original)));
    const reopened = atomizationFixture();
    expect(reopened.pair[0].file.stat).toEqual(original.pair[0].file.stat);
    expect(reopened.pair[0].content).toBe(original.pair[0].content);
    expect(() => validateAtomizationPlan(saved, reopened.analysis, reopened.pair, reopened.choice, reopened.observation)).toThrow(AtomizationError);
  });
  it("a title cannot inject Markdown or line breaks", () => {
    const f = atomizationFixture(); f.choice.title = "Title\ninvented fact"; expect(() => build(f)).toThrow("confirmation");
    f.choice.title = "[[hidden link]]"; expect(() => build(f)).toThrow("confirmation");
  });
});

it("refuses a quotation hidden inside an otherwise simple heading branch", () => {
  const f = atomizationFixture('# Trial\n\n“The sample remains valid.”');
  expect(atomizationCandidates(f.pair[0]).every(c => c.failure)).toBe(true);
});
it("rejects normalized hidden directories and extra confirmation fields", () => {
  const f = atomizationFixture(); f.choice.path = f.observation.path = "．hidden/Atom.md"; expect(() => build(f)).toThrow("path");
  const g = atomizationFixture(); Object.assign(g.choice, { skipReview: true }); expect(() => build(g)).toThrow("confirmation");
});
