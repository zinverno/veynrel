import { describe, expect, it, vi } from "vitest";
import { SemanticHealthAnalysisAdapter } from "./semanticHealthAnalysisAdapter";
import { SemanticHealthAnalysisError } from "../../health/semanticHealthAnalysisPort";
import { createFindingFingerprint } from "../../health/domain/identity";
import type { SemanticDuplicatePair, SemanticIndexState } from "../types";

const signal = () => new AbortController().signal;
const pair: SemanticDuplicatePair = { leftPath: "B.md", rightPath: "A.md", score: 0.971, leftMatches: [], rightMatches: [] };
const ready: SemanticIndexState = { kind: "ready", vectorCount: 8, vectorGeneration: 3, dimensions: 3,
  provider: "ollama", providerLabel: "Ollama", model: "test", configurationRevision: 0, runtimeRevision: 1 };
function fixture() {
  const engine = { getCachedIndexState: vi.fn(() => ({ ...ready })), findPotentialDuplicates: vi.fn(async () => [pair]) };
  return { engine, adapter: new SemanticHealthAnalysisAdapter(engine) };
}

describe("semantic Health duplicate adapter", () => {
  it("maps canonical paths, stable identity, review/high confidence, a safe action and score only", async () => {
    const f = fixture();
    const first = await f.adapter.analyzeDuplicates(signal());
    expect(first.candidates).toEqual([{
      source: "semantic", analyzerId: "semantic-duplicates", dimension: "connections", type: "semantic-duplicate",
      fingerprint: createFindingFingerprint({ source: "semantic", analyzerId: "semantic-duplicates", dimension: "connections", type: "semantic-duplicate", paths: ["A.md", "B.md"] }),
      impact: "review", confidence: "high", title: "Possible semantic duplicate", explanation: "These notes are unusually similar in meaning.",
      notePaths: ["A.md", "B.md"], evidence: [{ kind: "similarity-score", value: 0.971 }], actions: [{ kind: "open-note", path: "A.md" }],
    }]);
    f.engine.findPotentialDuplicates.mockResolvedValue([{ ...pair, leftPath: "A.md", rightPath: "B.md", score: 0.982 }]);
    expect((await f.adapter.analyzeDuplicates(signal())).candidates[0].fingerprint).toBe(first.candidates[0].fingerprint);
    expect(f.engine.findPotentialDuplicates).toHaveBeenCalledWith();
    expect(first.revision).toEqual({ vectorCount: 8, vectorGeneration: 3, dimensions: 3, provider: "ollama", model: "test", configurationRevision: 0, runtimeRevision: 1 });
  });

  it.each([NaN, Infinity, -Infinity, 1.01, -1.01])("rejects invalid score %s without clamping", async (score) => {
    const f = fixture(); f.engine.findPotentialDuplicates.mockResolvedValue([{ ...pair, score }]);
    await expect(f.adapter.analyzeDuplicates(signal())).rejects.toMatchObject({ code: "semantic-analysis-failed" });
  });
  it.each([-1, 0, 0.95, 1])("accepts finite score %s without introducing another threshold", async (score) => {
    const f = fixture(); f.engine.findPotentialDuplicates.mockResolvedValue([{ ...pair, score }]);
    expect((await f.adapter.analyzeDuplicates(signal())).candidates[0].evidence[0].value).toBe(score);
  });
  it.each(["../A.md", "/A.md", "A\\B.md", " A.md", "B.md"])("rejects invalid/same path %s", async (rightPath) => {
    const f = fixture(); f.engine.findPotentialDuplicates.mockResolvedValue([{ ...pair, rightPath }]);
    await expect(f.adapter.analyzeDuplicates(signal())).rejects.toMatchObject({ code: "semantic-analysis-failed" });
  });
  it("rejects duplicate identities and oversized results as a whole", async () => {
    const f = fixture(); f.engine.findPotentialDuplicates.mockResolvedValue([pair, { ...pair, leftPath: pair.rightPath, rightPath: pair.leftPath }]);
    await expect(f.adapter.analyzeDuplicates(signal())).rejects.toBeInstanceOf(SemanticHealthAnalysisError);
    f.engine.findPotentialDuplicates.mockResolvedValue(Array.from({ length: 101 }, (_, i) => ({ ...pair, leftPath: `${i}.md` })));
    await expect(f.adapter.analyzeDuplicates(signal())).rejects.toBeInstanceOf(SemanticHealthAnalysisError);
  });
  it.each(["disabled", "not-initialized", "initializing", "indexing", "incompatible", "error"] as const)("does not analyze %s", async (kind) => {
    const f = fixture(); f.engine.getCachedIndexState.mockReturnValue({ ...ready, kind });
    await expect(f.adapter.analyzeDuplicates(signal())).rejects.toMatchObject({ code: "semantic-unavailable" });
    expect(f.engine.findPotentialDuplicates).not.toHaveBeenCalled();
  });
  it.each([{ vectorCount: 0 }, { vectorCount: NaN }, { dimensions: 0 }, { vectorGeneration: -1 }, { runtimeRevision: NaN }, { model: "" }])("rejects empty/unprovable revision %j", async (change) => {
    const f = fixture(); f.engine.getCachedIndexState.mockReturnValue({ ...ready, ...change });
    await expect(f.adapter.analyzeDuplicates(signal())).rejects.toMatchObject({ code: "semantic-unavailable" });
    expect(f.engine.findPotentialDuplicates).not.toHaveBeenCalled();
  });
  it.each([
    { vectorGeneration: 4 }, { vectorCount: 9 }, { dimensions: 4 }, { provider: "openrouter" }, { model: "other" },
    { configurationRevision: 1 }, { runtimeRevision: 2 }, { kind: "indexing" }, { kind: "initializing" }, { kind: "disabled" },
    { kind: "incompatible" }, { kind: "error" }, { vectorCount: 0 },
  ] as Partial<SemanticIndexState>[])("rejects post-discovery change %j", async (change) => {
    const f = fixture(); f.engine.getCachedIndexState.mockReturnValueOnce(ready).mockReturnValue({ ...ready, ...change });
    await expect(f.adapter.analyzeDuplicates(signal())).rejects.toMatchObject({ code: "semantic-index-changed" });
  });
  it("sanitizes unknown failures and preserves cancellation", async () => {
    const f = fixture(); f.engine.findPotentialDuplicates.mockRejectedValue(new Error("private-key-response-stack"));
    await expect(f.adapter.analyzeDuplicates(signal())).rejects.toMatchObject({ message: "semantic-analysis-failed" });
    const abort = new AbortController(); abort.abort();
    await expect(f.adapter.analyzeDuplicates(abort.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(f.engine.findPotentialDuplicates).toHaveBeenCalledTimes(1);
  });
});
