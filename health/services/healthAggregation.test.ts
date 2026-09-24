import { describe, expect, it } from "vitest";
import type { Finding, FindingState, HealthDimension } from "../domain/finding";
import type { VaultProfile } from "../domain/profile";
import { findingIdFromFingerprint } from "../domain/identity";
import { candidate, scanRun } from "../store/testSupport";
import { LOCAL_HEALTH_ANALYZERS } from "../analyzers/local/registry";
import { aggregateHealth } from "./healthAggregator";
import { selectRecommendation } from "./recommendationService";

function finding(overrides: Partial<Finding> = {}): Finding {
  const item = candidate(overrides);
  return { ...item, id: findingIdFromFingerprint(item.fingerprint), state: "open", firstSeenAt: 100, lastSeenAt: 100, ...overrides };
}
const completed = scanRun({ analyzerVersions: Object.fromEntries(LOCAL_HEALTH_ANALYZERS.map((analyzer) => [analyzer.id, analyzer.version])) });

describe("Health aggregation", () => {
  const deep = scanRun({ type: "deep", analyzerVersions: { "knowledge-quality": "1" }, notesSeen: 3,
    reconciliationReceipts: { "deep-ai:knowledge-quality": 200 } });
  it.each([
    [undefined, false, false, "unknown", "not-enabled", false],
    [deep, true, false, "good", "deep", true],
    [deep, true, true, "review-recommended", "deep", true],
    [{ ...deep, status: "partial" as const }, true, false, "unknown", "deep", false],
    [{ ...deep, status: "partial" as const }, true, true, "review-recommended", "deep", false],
    [{ ...deep, notesSeen: 0 }, true, false, "unknown", "deep", true],
    [{ ...deep, status: "failed" as const }, true, false, "unknown", "not-enabled", false],
    [deep, false, false, "unknown", "not-enabled", false],
    [deep, false, true, "review-recommended", "not-enabled", false],
    [{ ...deep, analyzerVersions: { "knowledge-quality": "old" } }, true, false, "unknown", "not-enabled", false],
    [{ ...deep, reconciliationReceipts: {} }, true, false, "unknown", "not-enabled", false],
  ] as const)("Knowledge coverage %j trusted %s positive %s", (lastDeepScan, deepReconciled, positive, state, analysisDepth, analysisComplete) => {
    const item = finding({ source: "deep-ai", dimension: "knowledge", analyzerId: "knowledge-quality", type: "knowledge-draft", impact: "review", confidence: "medium" });
    const baseline = aggregateHealth({ findings: [], reconciled: true, lastLocalScan: completed });
    const result = aggregateHealth({ findings: positive ? [item] : [], reconciled: true, lastLocalScan: completed, lastDeepScan, deepReconciled });
    expect(result.dimensions.knowledge).toMatchObject({ state, analysisDepth, analysisComplete, openFindings: positive ? 1 : 0 });
    for (const dimension of ["structure", "connections", "recall"] as const) expect(result.dimensions[dimension]).toEqual(baseline.dimensions[dimension]);
    expect(result.openFindings).toBe(positive ? 1 : 0);
    if (positive) expect(selectRecommendation([item])?.findingId).toBe(item.id);
  });
  const semantic = scanRun({ type: "semantic", analyzerVersions: { "semantic-duplicates": "1" },
    reconciliationReceipts: { "semantic:semantic-duplicates": 200 } });
  it.each([
    [undefined, false, "basic", true, "good"],
    [semantic, true, "semantic", true, "good"],
    [{ ...semantic, status: "partial" as const }, true, "semantic", false, "unknown"],
    [semantic, false, "basic", true, "good"],
    [{ ...semantic, status: "failed" as const }, true, "basic", true, "good"],
    [{ ...semantic, reconciliationReceipts: {} }, true, "basic", true, "good"],
    [{ ...semantic, analyzerVersions: { "semantic-duplicates": "older" } }, true, "basic", true, "good"],
  ] as const)("combines semantic coverage conservatively (%j, trusted %s)", (lastSemanticScan, semanticReconciled, depth, complete, state) => {
    const result = aggregateHealth({ findings: [], lastLocalScan: completed, reconciled: true, lastSemanticScan, semanticReconciled });
    expect(result.dimensions.connections).toMatchObject({ analysisDepth: depth, analysisComplete: complete, state });
    expect(result.dimensions.structure).toMatchObject({ analysisDepth: "basic", analysisComplete: true, state: "good" });
    expect(result.dimensions.recall.analysisDepth).toBe("not-enabled");
    expect(result.dimensions.knowledge.analysisDepth).toBe("not-enabled");
  });
  it("semantic coverage alone cannot prove complete Connections; open review still drives state", () => {
    const input = { findings: [], reconciled: false, lastSemanticScan: semantic, semanticReconciled: true };
    expect(aggregateHealth(input).dimensions.connections).toMatchObject({ analysisDepth: "semantic", analysisComplete: false, state: "unknown" });
    expect(aggregateHealth({ ...input, findings: [finding({ source: "semantic", dimension: "connections", impact: "review", confidence: "high" })] })
      .dimensions.connections).toMatchObject({ analysisDepth: "semantic", state: "review-recommended", openFindings: 1 });
  });
  it.each([
    { impact: "attention", status: "completed", state: "needs-attention" },
    { impact: "review", status: "completed", state: "review-recommended" },
    { impact: "info", status: "completed", state: "good" },
    { impact: "attention", status: "partial", state: "needs-attention" },
    { impact: "review", status: "partial", state: "review-recommended" },
    { impact: "info", status: "partial", state: "unknown" },
  ] as const)("$impact during $status -> $state", ({ impact, status, state }) => {
    const result = aggregateHealth({ findings: [finding({ impact })], lastLocalScan: { ...completed, status }, reconciled: true });
    expect(result.dimensions.structure.state).toBe(state);
    expect(result.dimensions.structure.analysisDepth).toBe("basic");
    expect(result.dimensions.structure.analysisComplete).toBe(status === "completed");
    expect(result.dimensions.recall).toMatchObject({ state: "unknown", analysisDepth: "not-enabled", analysisComplete: false });
    expect(result.dimensions.knowledge.state).toBe("unknown");
  });
  it.each(["dismissed", "snoozed", "resolved"] as FindingState[])("ignores %s findings in immediate health", (state) => {
    const result = aggregateHealth({ findings: [finding({ state })], lastLocalScan: completed, reconciled: true });
    expect(result.openFindings).toBe(0);
    expect(result.dimensions.structure.state).toBe("good");
    expect(result.dimensions.structure.attentionFindings).toBe(0);
  });
  it("requires completed, reconciled, current full coverage to establish absence", () => {
    expect(aggregateHealth({ findings: [], lastLocalScan: completed, reconciled: true }).dimensions.structure.state).toBe("good");
    for (const scan of [undefined, { ...completed, status: "partial" as const }, { ...completed, status: "failed" as const }, scanRun(),
      { ...completed, analyzerVersions: { ...completed.analyzerVersions, orphans: "older" } }]) {
      expect(aggregateHealth({ findings: [], lastLocalScan: scan, reconciled: true }).dimensions.structure.state).toBe("unknown");
    }
    expect(aggregateHealth({ findings: [], lastLocalScan: completed, reconciled: false }).dimensions.structure.state).toBe("unknown");
  });
  it("derives new open local findings from the latest reconciled observation only", () => {
    const findings = [finding(), finding({ firstSeenAt: 50 }), finding({ source: "semantic" }), finding({ state: "dismissed" }), finding({ lastSeenAt: 200 })];
    expect(aggregateHealth({ findings, lastLocalScan: completed, reconciled: true }).newFindings).toBe(1);
    expect(aggregateHealth({ findings, lastLocalScan: completed, reconciled: false }).newFindings).toBe(0);
    expect(aggregateHealth({ findings, lastLocalScan: { ...completed, status: "partial" }, reconciled: true }).newFindings).toBe(1);
  });
});

describe("deterministic recommendation", () => {
  it.each([
    ["learning", "recall"], ["research", "connections"], ["work", "structure"], ["personal", "connections"],
  ] as [VaultProfile, HealthDimension][])("ranks profile %s first toward %s at otherwise equal priority", (profile, expected) => {
    const findings = (["structure", "connections", "recall", "knowledge"] as const).map((dimension) => finding({ dimension }));
    const selected = selectRecommendation(findings, profile);
    expect(selected?.findingId).toBe(findings.find((item) => item.dimension === expected)?.id);
    expect(selectRecommendation([...findings].reverse(), profile)).toEqual(selected);
  });
  it("ranks impact before confidence, confidence before profile, then recency and code-unit ID", () => {
    const important = finding({ dimension: "structure", impact: "attention", confidence: "medium" });
    const relevant = finding({ dimension: "recall", impact: "review", confidence: "deterministic" });
    expect(selectRecommendation([relevant, important], "learning")?.findingId).toBe(important.id);
    const certain = finding({ dimension: "structure", impact: "review", confidence: "deterministic" });
    expect(selectRecommendation([{ ...relevant, confidence: "high" }, certain], "learning")?.findingId).toBe(certain.id);
    const recent = finding({ notePaths: ["Recent.md"], lastSeenAt: 200 });
    expect(selectRecommendation([finding(), recent])?.findingId).toBe(recent.id);
    const ties = [finding({ notePaths: ["A.md"] }), finding({ notePaths: ["B.md"] })];
    expect(selectRecommendation(ties)?.findingId).toBe(ties.map((item) => item.id).sort()[0]);
  });
  it("selects only exposed actions on open findings and returns an owned copy", () => {
    expect(selectRecommendation([finding({ state: "snoozed" }), finding({ state: "dismissed" }), finding({ state: "resolved" }), finding({ actions: [] })])).toBeUndefined();
    const item = finding();
    const recommendation = selectRecommendation([item])!;
    expect(recommendation.action).toEqual(item.actions[0]);
    recommendation.action.path = "Mutated.md";
    expect(item.actions[0].path).toBe("Notes/A.md");
  });
});
