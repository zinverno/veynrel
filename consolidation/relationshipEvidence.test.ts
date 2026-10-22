import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {} }));
import type { TFile } from "obsidian";
import { prepareEvidenceCatalog, evidenceRequest, validateEvidenceResponse, EVIDENCE_LIMITS } from "./relationshipEvidence";
import { RelationshipError, validateRelationshipResponse } from "./relationshipContract";
import { diagnoseRelationshipEvidence } from "./relationshipDiagnostics";
import { relationshipPrompt } from "./relationshipPrompt";
import type { RelationshipPair } from "./relationshipSession";
import { relationshipWireFixture } from "../tests/relationshipWireFixture";
import fixture from "../tests/fixtures/merge-planner.json";

const pair = (a = fixture.a, b = fixture.b): RelationshipPair => [a, b].map((content, i) => ({ path: `${i}/Same.md`, file: {} as TFile, content, modified: 1, bytes: content.length })) as unknown as RelationshipPair;
const setup = () => {
  const sources = pair(), catalog = prepareEvidenceCatalog(sources), user = JSON.stringify({ ...JSON.parse(evidenceRequest(catalog)), schema: "veynrel.relationship.refs.v1" });
  const wire = relationshipWireFixture(fixture.response, user);
  return { sources, catalog, wire, validate: () => validateEvidenceResponse(JSON.stringify(wire), catalog, sources) };
};
function failure(fn: () => unknown): RelationshipError {
  try { fn(); } catch (e) { expect(e).toBeInstanceOf(RelationshipError); return e as RelationshipError; }
  throw Error("Expected fail-closed rejection");
}

describe("unchanged strict quote rules with non-authoritative diagnostics", () => {
  it("malformed object fields cannot turn diagnostics into a coercion error", () => {
    const r = structuredClone(fixture.response); Object.assign(r.claims[0], { kind: { toString: null } });
    expect(failure(() => validateRelationshipResponse(JSON.stringify(r), fixture.a, fixture.b)).reason).toBe("invalidResponse");
  });
  it.each(["case", "punctuation", "markdown", "absent", "repeated"])("rejects %s without repair", variant => {
    const r = structuredClone(fixture.response); let a = fixture.a;
    if (variant === "case") r.claims[0].quoteA = r.claims[0].quoteA!.toLowerCase();
    if (variant === "punctuation") r.claims[0].quoteA = r.claims[0].quoteA!.replace(".", "!");
    if (variant === "markdown") a = a.replace("cache", "**cache**");
    if (variant === "absent") r.claims[0].quoteA = "Not in either source.";
    if (variant === "repeated") a += r.claims[0].quoteA;
    const raw = JSON.stringify(r), e = failure(() => validateRelationshipResponse(raw, a, fixture.b));
    expect(e.reason).toBe("unverifiedEvidence");
    expect(e.diagnostics).toContainEqual({ field: "claims[0].quoteA", claimId: "shared", side: "A", matches: variant === "repeated" ? 2 : 0, code: variant === "repeated" ? "quote_ambiguous" : "quote_not_found" });
    expect(JSON.stringify(r)).toBe(raw);
  });
  it("reports quote, ID and independent atomization errors together, without a result", () => {
    const r = structuredClone(fixture.response);
    r.claims[1].quoteA = r.claims[1].quoteA!.toLowerCase();
    r.alternatives = [{ action: "consider_atomize", reason: "A distinct detail", evidence: ["unique-a"] }];
    r.explanation.evidence = ["missing", "missing"];
    const issues = diagnoseRelationshipEvidence(JSON.stringify(r), fixture.a, fixture.b);
    expect(issues.map(i => i.code)).toEqual(["quote_not_found", "evidence_unknown", "evidence_duplicate", "missing_standalone_evidence"]);
    expect(JSON.stringify(issues)).not.toMatch(/Eviction|cache|Markdown|Same.md/);
  });
  it("exact quotes plus unique_a still cannot justify consider_atomize", () => {
    const r = structuredClone(fixture.response);
    r.alternatives = [{ action: "consider_atomize", reason: "An independent idea is not proven", evidence: ["unique-a"] }];
    const e = failure(() => validateRelationshipResponse(JSON.stringify(r), fixture.a, fixture.b));
    expect(e.reason).toBe("inconsistent");
    expect(e.diagnostics).toEqual([{ field: "alternatives[0]", code: "missing_standalone_evidence" }]);
    expect(r.claims[1].kind).toBe("unique_a");
  });
  it("checks Cyrillic case exactly", () => {
    const r = structuredClone(fixture.response); r.claims[2].quoteB = r.claims[2].quoteB!.replace("Срок", "срок");
    expect(failure(() => validateRelationshipResponse(JSON.stringify(r), fixture.a, fixture.b)).diagnostics[0].code).toBe("quote_not_found");
  });
});

describe("catalogue before consent and explicit reference wire schema", () => {
  it("resolves current IDs to unchanged quotes and keeps the original internal contract", () => {
    const f = setup(); expect(f.validate()).toEqual(fixture.response);
    expect(validateRelationshipResponse(JSON.stringify(f.validate()), fixture.a, fixture.b)).toEqual(fixture.response);
    expect(Object.isFrozen(f.catalog.fragments)).toBe(true); expect(Object.isFrozen(f.catalog.pair[0])).toBe(true);
    expect(f.catalog.fragments.every(Object.isFrozen)).toBe(true);
  });
  it.each(["unknown", "wrong-side", "other-catalog", "offset", "legacy", "extra-field", "version"])("rejects %s without schema fallback", variant => {
    const f = setup();
    if (variant === "unknown") f.wire.claims[0].evidenceA = "invented";
    if (variant === "wrong-side") f.wire.claims[0].evidenceA = f.wire.claims[0].evidenceB;
    if (variant === "other-catalog") f.wire.claims[0].evidenceA = prepareEvidenceCatalog(f.sources).fragments[0].id;
    if (variant === "offset") Object.assign(f.wire.claims[0], { evidenceA: { start: 0, end: 10 } });
    if (variant === "extra-field") Object.assign(f.wire.claims[0], { quoteA: fixture.response.claims[0].quoteA });
    if (variant === "version") f.wire.schema = "other-version";
    const e = failure(variant === "legacy" ? () => validateEvidenceResponse(JSON.stringify(fixture.response), f.catalog, f.sources) : f.validate);
    expect(e.reason).toBe(["legacy", "extra-field", "version"].includes(variant) ? "invalidResponse" : "unverifiedEvidence");
    if (variant === "wrong-side") expect(e.diagnostics[0].code).toBe("reference_side_mismatch");
  });
  it.each(["content", "path", "modified", "bytes", "file"] as const)("rejects changed snapshot %s", key => {
    const f = setup();
    const changed = { ...f.sources[0], [key]: key === "file" ? {} : key === "modified" || key === "bytes" ? 999 : "changed" };
    expect(failure(() => validateEvidenceResponse(JSON.stringify(f.wire), f.catalog, [changed, f.sources[1]])).diagnostics).toEqual([{ field: "catalog", code: "catalog_stale" }]);
  });
  it("does not discard invalid alternatives or relabel unique evidence", () => {
    const f = setup(); Object.assign(f.wire, { alternatives: [{ action: "consider_atomize", reason: "Not established", evidence: ["unique-a"] }] });
    const raw = JSON.stringify(f.wire), e = failure(f.validate);
    expect(e.reason).toBe("inconsistent"); expect(e.diagnostics[0].code).toBe("missing_standalone_evidence");
    expect(JSON.stringify(f.wire)).toBe(raw);
  });
  it("widens repeated snippets before generation, keeping exact native slices", () => {
    const sources = pair("First context.\r\n\r\nПовтор.\r\n\r\nSecond context.\r\n\r\nПовтор.\r\n\r\nEnd.", "Second source.");
    const c = prepareEvidenceCatalog(sources), entries = c.fragments.filter(f => f.side === "A" && f.text.includes("Повтор."));
    expect(entries.length).toBeGreaterThan(0); expect(entries.every(f => f.text !== "Повтор.")).toBe(true);
    for (const f of c.fragments) {
      const s = sources[f.side === "A" ? 0 : 1].content;
      expect(f.text).toBe(s.slice(f.start, f.end)); expect(s.indexOf(f.text)).toBe(f.start); expect(s.indexOf(f.text, f.start + 1)).toBe(-1);
    }
  });
  it.each(["\n", "\r\n"])("preserves Unicode, Cyrillic and formatted Markdown with %j", newline => {
    const a = `---${newline}tags: [тест]${newline}---${newline}${newline}**Ёж 🦔**: не удалять.${newline}> вопрос::ответ${newline}${"я".repeat(599)}😀конец`;
    const sources = pair(a, a.replace("конец", "другое")), c = prepareEvidenceCatalog(sources);
    expect((JSON.parse(evidenceRequest(c)) as { A: string }).A).toBe(a); expect(c.uncoveredCharacters).toEqual([0, 0]);
    for (const f of c.fragments) {
      const source = sources[f.side === "A" ? 0 : 1].content;
      expect(f.text).toBe(source.slice(f.start, f.end));
      expect(f.text).not.toMatch(/^[\udc00-\udfff]|[\ud800-\udbff]$/u);
      expect(f.text.length).toBeLessThanOrEqual(1200);
    }
  });
  it("reports bounded partial coverage without cutting the full notes", () => {
    const a = "x".repeat(10000), b = Array.from({ length: 300 }, (_, i) => `Line ${i}`).join("\n");
    const c = prepareEvidenceCatalog(pair(a, b));
    expect(c.fragments.filter(f => f.side === "A")).toHaveLength(0);
    expect(c.fragments.filter(f => f.side === "B")).toHaveLength(EVIDENCE_LIMITS.fragmentsPerSide);
    expect(c.uncoveredCharacters[0]).toBe(10000); expect(c.uncoveredCharacters[1]).toBeGreaterThan(0);
    expect(JSON.parse(evidenceRequest(c))).toMatchObject({ A: a, B: b });
  });
  it("requests one supported thought and forbids alternatives in v2", () => {
    for (const lang of ["en", "ru"] as const) {
      const prompt = relationshipPrompt(lang);
      expect(prompt).toContain("The alternatives field is forbidden"); expect(prompt).toContain("unique_a/unique_b are NOT standalone evidence");
      expect(prompt).toContain("One substantive, supportable thought per claim"); expect(prompt).not.toContain('"quoteA"');
      expect(prompt).toContain("explanation.evidence, recommendation.evidence contain ONLY IDs declared in your own claims[].id");
      expect(prompt).toContain("Catalogue fragment IDs are permitted ONLY in claims[*].evidenceA and claims[*].evidenceB");
      expect(prompt).toContain("Do not put a fragment ID in explanation.evidence even if that fragment supports the explanation");
    }
  });
});
