import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ getLanguage: () => "en", requestUrl: vi.fn(), TFile: class {} }));
import { requestUrl } from "obsidian";
import { callOpenRouter } from "../api";
import { RelationshipSession } from "./relationshipSession";
import type { RelationshipPair } from "./relationshipSession";
import { prepareEvidenceCatalog, evidenceRequest, validateEvidenceResponse } from "./relationshipEvidence";
import { RelationshipError, RELATIONSHIP_SINGLE_SCHEMA, RELATIONSHIP_WIRE_SCHEMA } from "./relationshipContract";
import { relationshipReport } from "./relationshipReport";
import { relationshipWireFixture, relationshipFixtureUser } from "../tests/relationshipWireFixture";
import fixture from "../tests/fixtures/merge-planner.json";

const sources = [fixture.a, fixture.b].map((content, i) => ({ path: `private-name-${i}.md`, content, file: {}, modified: 1, bytes: content.length })) as unknown as RelationshipPair;
const settings = { provider: "openrouter" as const, model: "deepseek/deepseek-v4-flash-0731", baseUrl: "https://example.test/v1?secret=private", apiKey: "secret-key", temperature: 0, topK: 5 };
const failure = (fn: () => unknown) => { try { fn(); } catch (e) { expect(e).toBeInstanceOf(RelationshipError); return e as RelationshipError; } throw Error("Expected rejection"); };

describe("final review wire contracts (synthetic, not the unavailable personal response)", () => {
  it("legacy alternatives[0] action_relation_mismatch remains rejected without changing the answer", () => {
    const catalog = prepareEvidenceCatalog(sources);
    const request = JSON.stringify({ ...JSON.parse(evidenceRequest(catalog)), schema: RELATIONSHIP_WIRE_SCHEMA });
    const response = relationshipWireFixture(fixture.response, request);
    response.relation = "related_distinct"; response.recommendation.action = "add_link";
    response.alternatives = [{ action: "consider_merge", reason: "Unsupported alternative", evidence: ["shared"] }];
    const raw = JSON.stringify(response), error = failure(() => validateEvidenceResponse(raw, catalog, sources));
    expect(error.reason).toBe("inconsistent");
    expect(error.diagnostics).toContainEqual({ field: "alternatives[0]", code: "action_relation_mismatch", relation: "related_distinct", action: "consider_merge" });
    expect(JSON.stringify(response)).toBe(raw);
  });
  it.each(["valid", "alternatives", "extra", "unknown-id", "bad-primary", "old-schema"])("new product builder → HTTP parser → binding → strict validator: %s", async variant => {
    vi.stubGlobal("window", { setTimeout, clearTimeout }); vi.mocked(requestUrl).mockReset();
    const session = new RelationshipSession({ settings: { get: () => ({ ...settings, baseUrl: "https://example.test/v1" }), subscribe: () => () => {} }, read: async () => sources,
      complete: (s, system, user, signal, options) => callOpenRouter(s, system, user, { ...options, signal }) });
    await session.prepare(); const consent = session.view.consent!.body, user = relationshipFixtureUser(consent);
    expect((JSON.parse(user) as { schema: string }).schema).toBe(RELATIONSHIP_SINGLE_SCHEMA);
    const response = relationshipWireFixture(fixture.response, user);
    expect(response).not.toHaveProperty("alternatives");
    if (variant === "alternatives") Object.assign(response, { alternatives: [] });
    if (variant === "extra") Object.assign(response, { repair: "ignored?" });
    if (variant === "unknown-id") response.claims[0].evidenceA = "missing";
    if (variant === "bad-primary") response.relation = "related_distinct"; // primary merge is incompatible
    if (variant === "old-schema") Object.assign(response, { schema: RELATIONSHIP_WIRE_SCHEMA, alternatives: [] });
    const raw = JSON.stringify(response);
    vi.mocked(requestUrl).mockResolvedValue({ status: 200, text: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: raw } }] }) } as never);
    await session.confirm(); await session.confirm();
    expect(requestUrl).toHaveBeenCalledOnce(); const sent = vi.mocked(requestUrl).mock.calls[0][0]; expect(typeof sent).toBe("object"); expect(typeof sent === "object" && sent.body).toBe(consent);
    if (variant === "valid") { expect(session.view.stage).toBe("result"); expect(session.view.result?.alternatives).toEqual([]); }
    else {
      expect(session.view.stage).toBe("error"); expect(session.analysisSource).toBeUndefined();
      expect(session.errorReport).toMatchObject({ dispatchAttempted: true, finishReason: "stop" });
      expect(JSON.stringify(session.errorReport)).not.toMatch(/private-name|secret-key|secret=|cache keeps|raw/);
    }
    if (variant === "bad-primary") expect(session.errorReport?.issues).toContainEqual({ field: "recommendation", code: "action_relation_mismatch", relation: "related_distinct", action: "consider_merge" });
    expect(JSON.stringify(response)).toBe(raw); session.close(); vi.unstubAllGlobals();
  });
  it("allowlist excludes arbitrary diagnostics and unknown enum text, rather than trying to redact them", () => {
    const report = relationshipReport({ stage: "error", error: "inconsistent", diagnostics: [{ field: "private/note.md", code: "action_relation_mismatch", claimId: "private-secret", relation: "secret-key" as never, action: "https://private.test?key=x" as never, receivedType: "Bearer secret", matches: NaN }] },
      { provider: "https://secret.test", model: "https://secret.test?key=x", dispatched: true, completed: false });
    expect(JSON.stringify(report)).not.toMatch(/private|secret|Bearer|https|claimId/);
    expect(report.issues).toEqual([{ field: "unknown", code: "action_relation_mismatch" }]);
    expect(report.finishReason).toBe("unknown");
  });
});
