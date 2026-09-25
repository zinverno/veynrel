import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
vi.mock("obsidian", () => ({ getLanguage: () => "en" }));
import { dateLocale, setLanguage } from "../../i18n";
import { healthDashboardModel } from "./healthDashboardModel";
import type { HealthControllerState } from "../obsidian/healthPluginController";
import { DEFAULT_HEALTH_PREFERENCES } from "../preferences";
import { scanRun } from "../store/testSupport";
import { aggregateHealth } from "../services/healthAggregator";
import { LOCAL_HEALTH_ANALYZERS } from "../analyzers/local/registry";

function fixture(): HealthControllerState & { snapshot: NonNullable<HealthControllerState["snapshot"]> } {
  const local = scanRun({ notesSeen: 312, findingsCreated: 8, findingsUpdated: 14, findingsResolved: 3,
    completedAt: 1790362080000, analyzerVersions: Object.fromEntries(LOCAL_HEALTH_ANALYZERS.map((a) => [a.id, a.version])) });
  return { busy: false, recovering: false, savingPreferences: false, preferencesError: false,
    preferences: { ...DEFAULT_HEALTH_PREFERENCES, onboardingCompleted: true }, snapshot: {
      ...aggregateHealth({ findings: [], lastLocalScan: local, reconciled: true }),
      lastLocalScan: local, lastLocalScanReconciled: true, localScanRunning: false, semanticScanRunning: false,
      deepScanRunning: false, lastSemanticScanReconciled: false, lastDeepScanReconciled: false,
      initialization: { status: "ready", storage: { findings: "loaded", scanRuns: "loaded" }, findingsWritable: true, historyWritable: true },
    } };
}
beforeEach(() => setLanguage("en"));

describe("Vault Pulse is discrete current Health, independently of counts and coverage", () => {
  it.each(["localScanRunning", "semanticScanRunning", "deepScanRunning"] as const)("prioritizes %s above attention and review", (key) => {
    const f = fixture(); f.snapshot[key] = true;
    f.snapshot.dimensions.structure.state = "needs-attention";
    f.snapshot.dimensions.connections.state = "review-recommended";
    expect(healthDashboardModel(f).pulse).toMatchObject({ state: "scanning", coverage: "complete" });
  });
  it("uses attention then review then trusted good; optional disabled dimensions are neutral", () => {
    const f = fixture(); expect(healthDashboardModel(f).pulse.state).toBe("good");
    f.snapshot.dimensions.connections.state = "review-recommended";
    expect(healthDashboardModel(f).pulse.state).toBe("review");
    f.snapshot.dimensions.structure.state = "needs-attention";
    const before = healthDashboardModel(f).pulse;
    f.snapshot.openFindings = 10000;
    expect(healthDashboardModel(f).pulse).toMatchObject({ state: before.state, coverage: before.coverage });
  });
  it("unknown associations, incomplete dimensions and missing state never imply healthy absence", () => {
    const f = fixture(); f.snapshot.lastLocalScanReconciled = false;
    expect(healthDashboardModel(f).pulse).toMatchObject({ state: "unknown", coverage: "unknown", lastCheckedAt: undefined });
    f.snapshot.lastLocalScanReconciled = true; f.snapshot.dimensions.structure.analysisComplete = false;
    expect(healthDashboardModel(f).pulse).toMatchObject({ state: "unknown", coverage: "mixed" });
    expect(healthDashboardModel({ ...f, snapshot: undefined }).pulse).toMatchObject({ state: "unknown", coverage: "unknown" });
  });
  it("derives all four coverage states separately from severity", () => {
    const f = fixture(); f.snapshot.dimensions.structure.state = "needs-attention";
    expect(healthDashboardModel(f).pulse).toMatchObject({ state: "attention", coverage: "complete" });
    f.snapshot.dimensions.connections.analysisComplete = false;
    expect(healthDashboardModel(f).pulse).toMatchObject({ state: "attention", coverage: "mixed" });
    f.snapshot.dimensions.structure.analysisComplete = false; f.snapshot.lastLocalScan!.status = "partial";
    expect(healthDashboardModel(f).pulse).toMatchObject({ state: "attention", coverage: "limited" });
    f.snapshot.lastLocalScanReconciled = false;
    expect(healthDashboardModel(f).pulse).toMatchObject({ state: "attention", coverage: "unknown" });
  });
  it.each(["failed", "partial", "stale"] as const)("a %s latest attempt cannot reuse previous Good", (kind) => {
    const f = fixture(); f.outcome = { scan: scanRun({ status: kind === "stale" ? "completed" : kind }),
      freshness: kind === "stale" ? "stale" : "verified", findingsCommitted: kind === "partial", historyRecorded: true, diagnostics: [] };
    expect(healthDashboardModel(f).pulse).toMatchObject({ state: "unknown", coverage: "limited" });
  });
  it("treats Recall recovery as unknown and does not turn mutations or recovery into scans", () => {
    const f = fixture(); f.busy = true; f.mutatingFindingId = "finding-1";
    expect(healthDashboardModel(f).pulse.state).toBe("good");
    f.recovering = true; expect(healthDashboardModel(f).pulse.state).not.toBe("scanning");
    f.snapshot.recall = { active: 0, due: 0, new: 0, firstRun: false, loadState: "invalid" };
    expect(healthDashboardModel(f).pulse.state).toBe("unknown");
  });
  it("requires independent Semantic and Deep associations and uses only committed scan times", () => {
    const f = fixture(); f.snapshot.dimensions.connections.analysisDepth = "semantic";
    f.snapshot.lastSemanticScan = scanRun({ type: "semantic", completedAt: 1790362100000 });
    expect(healthDashboardModel(f).pulse.coverage).toBe("mixed");
    expect(healthDashboardModel(f).pulse.lastCheckedAt).toBe(f.snapshot.lastLocalScan!.completedAt);
    f.snapshot.lastSemanticScanReconciled = true;
    expect(healthDashboardModel(f).pulse).toMatchObject({ state: "good", coverage: "complete", lastCheckedAt: 1790362100000 });
    f.snapshot.dimensions.knowledge = { state: "good", analysisDepth: "deep", analysisComplete: true, openFindings: 0, attentionFindings: 0, reviewFindings: 0 };
    f.snapshot.lastDeepScan = scanRun({ type: "deep" });
    expect(healthDashboardModel(f).pulse.state).toBe("unknown");
    f.snapshot.lastDeepScanReconciled = true; expect(healthDashboardModel(f).pulse.state).toBe("good");
  });
});

describe("real dashboard measurements", () => {
  it("keeps exact 78/1/0/7 counts and proportional impact segments in fixed area order", () => {
    const f = fixture();
    Object.assign(f.snapshot.dimensions.structure, { openFindings: 78, attentionFindings: 50, reviewFindings: 20 });
    Object.assign(f.snapshot.dimensions.connections, { openFindings: 1, reviewFindings: 1 });
    Object.assign(f.snapshot.dimensions.knowledge, { openFindings: 7, reviewFindings: 7 });
    const areas = healthDashboardModel(f).findingsBreakdown;
    expect(areas.map((a) => a.id)).toEqual(["structure", "connections", "recall", "knowledge"]);
    expect(areas.map((a) => [a.total, a.attention, a.review, a.info])).toEqual([[78, 50, 20, 8], [1, 0, 1, 0], [0, 0, 0, 0], [7, 0, 7, 0]]);
    expect(areas.map((a) => a.ratio)).toEqual([1, 1 / 78, 0, 7 / 78]);
    expect(areas[0].segments.map((s) => s.ratio)).toEqual([50 / 78, 20 / 78, 8 / 78]);
    expect(areas[1].ratio).toBeLessThan(areas[0].ratio);
    expect(areas[2].segments.every((s) => s.ratio === 0)).toBe(true);
    f.snapshot.dimensions.structure.openFindings = 1;
    expect(healthDashboardModel(f).findingsBreakdown[0].info).toBe(0);
  });
  it("zero findings do not divide by zero or imply established coverage", () => {
    const f = fixture(); f.snapshot.lastLocalScanReconciled = false;
    const model = healthDashboardModel(f);
    expect(model.findingsBreakdown.every((a) => a.ratio === 0 && a.info === 0)).toBe(true);
    expect(model.pulse).toMatchObject({ findingsLabel: "No open findings", coverage: "unknown" });
  });
  it.each(["en", "ru"] as const)("presents actual Recall, Knowledge and last check in %s", (language) => {
    setLanguage(language); const f = fixture(); const nextDueAt = 1790362200000;
    f.snapshot.recall = { loadState: "ready", firstRun: false, active: 143, due: 12, new: 4, nextDueAt };
    f.snapshot.lastDeepScan = scanRun({ type: "deep", notesSeen: 148 }); f.snapshot.lastDeepScanReconciled = true;
    Object.assign(f.snapshot.dimensions.knowledge, { analysisDepth: "deep", openFindings: 7, reviewFindings: 7, analysisComplete: true });
    const model = healthDashboardModel(f);
    expect(model.recall.metrics.map((m) => m.value)).toEqual([12, 143, 4]);
    expect(model.recall.detail).toContain(new Intl.DateTimeFormat(dateLocale(), { dateStyle: "medium", timeStyle: "short" }).format(nextDueAt));
    expect(model.knowledge.metrics.map((m) => m.value)).toEqual([148, 7]);
    expect(model.knowledge.detail).toBe(language === "en" ? "Deep analysis · Complete" : "Глубокий анализ · Полный охват");
    expect(model.localScan.metrics.map((m) => m.value)).toEqual([312, 8, 14, 3]);
    f.snapshot.lastLocalScan!.status = "partial";
    expect(healthDashboardModel(f).localScan.detail).toContain(language === "en" ? "limited coverage" : "ограниченный охват");
    expect(JSON.stringify(model)).not.toMatch(/@dashboard\.|retention|workload|polished|developed/iu);
  });
  it("has useful empty panels and never promotes an unassociated Deep count", () => {
    const f = fixture(); f.snapshot.lastLocalScan = undefined;
    f.snapshot.lastDeepScan = scanRun({ type: "deep", notesSeen: 148 });
    const m = healthDashboardModel(f);
    expect(m.localScan).toMatchObject({ metrics: [], detail: "No completed check yet" });
    expect(m.recall).toMatchObject({ metrics: [], detail: "Recall not enabled" });
    expect(m.knowledge).toMatchObject({ metrics: [], detail: "Knowledge has not been checked yet" });
  });
});

describe("dashboard presentation boundaries", () => {
  const files = ["healthDashboardModel", "renderVaultPulse", "renderHealthInsights", "healthHomeViewModel", "renderHealthHome"];
  it("introduces no score, scheduler, persistence, provider or animation loop", () => {
    for (const file of files) {
      const source = readFileSync(`health/ui/${file}.ts`, "utf8");
      expect(source).not.toMatch(/\b(?:healthScore|vaultScore|percentageHealth|bpm|wellness|severityScore|setInterval|setTimeout|requestAnimationFrame|ResizeObserver|fetch|requestUrl|localStorage)\b/iu);
      expect(source).not.toMatch(/\b(?:vault|adapter|store)\s*\.|\b(?:runLocalScan|runDeepScan|refreshCards|rateSchedule)\s*\(/u);
    }
    const pulse = healthDashboardModel(fixture()).pulse;
    expect(Object.entries(pulse).filter(([, v]) => typeof v === "number").map(([k]) => k)).toEqual(["openFindings", "lastCheckedAt"]);
    const svg = readFileSync("health/ui/renderVaultPulse.ts", "utf8");
    expect(svg).not.toMatch(/foreignObject|innerHTML|https?:|canvas|createElementNS/u);
    expect(svg).toContain('"aria-hidden": "true"');
  });
  it("uses theme tokens, honors reduced motion, and gives every row a stable action", () => {
    const css = readFileSync("styles.css", "utf8").split("/* Health visual dashboard:")[1];
    expect(css).toContain("var(--interactive-accent)");
    expect(css).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/iu);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none;[\s\S]*stroke-dasharray: none;/u);
    expect(readFileSync("health/ui/renderHealthInsights.ts", "utf8")).toContain('`area-${area.id}`');
  });
  it("shares a slow continuous cadence across established states, with distinct scanning and static unknown", () => {
    const css = readFileSync("styles.css", "utf8").split("@media (prefers-reduced-motion: reduce)")[0];
    const normal = css.match(/\.veynrel-vault-pulse:is\(([^)]+)\)\s+\.veynrel-vault-pulse-accent\s*\{([^}]+)\}/u)!;
    expect([...normal[1].matchAll(/data-pulse-state="([^"]+)"/gu)].map((match) => match[1])).toEqual(["good", "review", "attention"]);
    expect(normal[2]).toContain("animation: veynrel-vault-pulse-sweep 7s linear infinite;");
    expect(normal[2]).toContain("stroke-dasharray: 10 90;");
    expect(normal[2]).toContain("opacity: 0.65;");
    const scanning = css.match(/\[data-pulse-state="scanning"\]\s+\.veynrel-vault-pulse-accent\s*\{([^}]+)\}/u)![1];
    expect(scanning).toContain("animation: veynrel-vault-pulse-sweep 4s linear infinite;");
    expect(scanning).toContain("stroke-dasharray: 16 84;");
    const unknown = css.match(/\[data-pulse-state="unknown"\]\s+\.veynrel-vault-pulse-accent\s*\{([^}]+)\}/u)![1];
    expect(unknown).toContain("animation: none;");
    expect(unknown).toContain("display: none;");
  });
  it("disables both continuous sweeps for every state under reduced motion", () => {
    const css = readFileSync("styles.css", "utf8").split("@media (prefers-reduced-motion: reduce)")[1];
    // The state-agnostic attribute selector matches all five states with the same
    // specificity as the normal/scanning rules, and appears after both of them.
    const rule = css.match(/\.veynrel-vault-pulse\[data-pulse-state\]\s+\.veynrel-vault-pulse-accent\s*\{([^}]+)\}/u)![1];
    expect(rule).toContain("animation: none;");
    expect(rule).toContain("stroke-dasharray: none;");
    expect(rule).toContain("opacity: 1;");
  });
});
