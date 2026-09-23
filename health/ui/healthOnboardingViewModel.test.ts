import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ getLanguage: () => "en" }));
import { setLanguage } from "../../i18n";
import { DEFAULT_HEALTH_PREFERENCES } from "../preferences";
import type { HealthControllerState } from "../obsidian/healthPluginController";
import type { HealthSnapshot } from "../services/types";
import { candidate, scanRun } from "../store/testSupport";
import { healthHomeViewModel } from "./healthHomeViewModel";
import { healthOnboardingViewModel } from "./healthOnboardingViewModel";

function state(scanned = false): HealthControllerState & { snapshot: HealthSnapshot } {
  const dimension = { state: scanned ? "good" as const : "unknown" as const, analysisDepth: "basic" as const,
    openFindings: 0, attentionFindings: 0, reviewFindings: 0, analysisComplete: scanned };
  return { busy: false, recovering: false, savingPreferences: false, preferencesError: false,
    preferences: { ...DEFAULT_HEALTH_PREFERENCES, profileChosen: true }, snapshot: {
      dimensions: { structure: { ...dimension }, connections: { ...dimension }, recall: { ...dimension, analysisComplete: false }, knowledge: { ...dimension, analysisComplete: false } },
      openFindings: 0, newFindings: 0, lastLocalScan: scanned ? scanRun() : undefined, lastLocalScanReconciled: scanned, localScanRunning: false,
      semanticScanRunning: false, lastSemanticScanReconciled: false,
      initialization: { status: "ready", storage: { findings: "loaded", scanRuns: "loaded" }, findingsWritable: true, historyWritable: true },
    } };
}
beforeEach(() => setLanguage("en"));

describe("explicit onboarding derivation", () => {
  it("routes unchosen -> profile, chosen -> scan, trustworthy result -> result, completed -> Home", () => {
    const f = state(); f.preferences.profileChosen = false; expect(healthOnboardingViewModel(f).step).toBe("profile");
    f.preferences.profileChosen = true; expect(healthOnboardingViewModel(f).step).toBe("scan");
    f.snapshot = state(true).snapshot; expect(healthOnboardingViewModel(f).step).toBe("result");
    f.preferences.onboardingCompleted = true; expect(healthOnboardingViewModel(f).step).toBe("complete");
  });
  it.each(["findingsWritable", "historyWritable"] as const)("recovery precedes both onboarding and completion (%s)", (field) => {
    const f = state(true); f.snapshot.initialization[field] = false;
    for (const completed of [false, true]) {
      f.preferences.onboardingCompleted = completed; f.preferences.profileChosen = false;
      expect(healthOnboardingViewModel(f).step).toBe("recovery");
    }
  });
  it.each(["stale", "unknown", "not-checked"] as const)("%s attempts cannot advance using older complete cards", (freshness) => {
    const f = state(true);
    f.outcome = { scan: scanRun({ status: "partial" }), freshness, findingsCommitted: false, historyRecorded: true, diagnostics: [] };
    expect(healthOnboardingViewModel(f).step).toBe("scan");
    expect(JSON.stringify(healthOnboardingViewModel(f))).not.toContain("Baseline");
  });
  it("failed, running, uncommitted and unmatched receipts stay at Scan, including after restart", () => {
    const f = state(true);
    f.snapshot.lastLocalScan!.status = "failed";
    const failed = healthOnboardingViewModel(f); expect(failed).toMatchObject({ step: "scan", scanLabel: "Scan again" });
    expect(failed.step === "scan" && failed.status).toContain("couldn't complete");
    f.snapshot.lastLocalScan!.status = "running"; expect(healthOnboardingViewModel(f).step).toBe("scan");
    f.snapshot.lastLocalScan!.status = "partial"; f.snapshot.lastLocalScanReconciled = false;
    expect(healthOnboardingViewModel(f).step).toBe("scan");
    f.snapshot = state(true).snapshot; f.busy = true; expect(healthOnboardingViewModel(f).step).toBe("scan");
    f.busy = false; f.error = "scan"; expect(healthOnboardingViewModel(f).step).toBe("scan");
  });
  it("a reconciled partial receipt produces a limited result after restart, never a baseline", () => {
    const f = state(true); f.snapshot.lastLocalScan!.status = "partial";
    const model = healthOnboardingViewModel(f);
    expect(model).toMatchObject({ step: "result", kind: "limited", scanAgain: true, title: "Check completed with limited coverage" });
    expect(JSON.stringify(model)).not.toContain("didn't find");
  });
  it("limited coverage wins even if cached cards were good or an older registry completed", () => {
    const f = state(true); f.outcome = { scan: scanRun({ status: "partial" }), freshness: "verified", findingsCommitted: true, historyRecorded: true, diagnostics: [] };
    expect(healthOnboardingViewModel(f)).toMatchObject({ kind: "limited" });
    f.outcome = undefined; f.snapshot.dimensions.connections.analysisComplete = false;
    expect(healthOnboardingViewModel(f)).toMatchObject({ kind: "limited" });
  });
  it("requires both complete good dimensions and zero review/attention findings for the narrow baseline", () => {
    const f = state(true);
    expect(healthOnboardingViewModel(f)).toMatchObject({ step: "result", kind: "baseline", scanAgain: false,
      explanation: "Veynrel didn't find structural issues that currently need your attention." });
    f.snapshot.openFindings = 1; // Informational findings alone do not invalidate the narrow claim.
    expect(healthOnboardingViewModel(f)).toMatchObject({ kind: "baseline" });
    f.snapshot.dimensions.structure.reviewFindings = 1;
    expect(healthOnboardingViewModel(f)).toMatchObject({ kind: "review" });
  });
  it("uses the backend choice with localized presentation and only a safe note CTA", () => {
    const f = state(true); f.snapshot.dimensions.structure = { ...f.snapshot.dimensions.structure, state: "needs-attention", attentionFindings: 1 };
    f.snapshot.openFindings = 1;
    f.recommendationFinding = { ...candidate(), id: "chosen", state: "open", firstSeenAt: 1, lastSeenAt: 1 };
    f.snapshot.recommendation = { id: "recommendation", findingId: "chosen", title: "Persisted English", explanation: "Persisted English", action: { kind: "open-note" } };
    setLanguage("ru"); const home = healthHomeViewModel(f, true); const model = healthOnboardingViewModel(f, home);
    expect(model).toMatchObject({ kind: "finding", finding: { title: "Неработающая внутренняя ссылка", canOpenNote: true } });
    expect(home.recommendation?.title).toBe("Неработающая внутренняя ссылка");
    expect(healthOnboardingViewModel(f, healthHomeViewModel(f, false))).toMatchObject({ kind: "review", title: "Стоит просмотреть: 1" });
    delete f.snapshot.recommendation;
    expect(healthOnboardingViewModel(f)).toMatchObject({ kind: "review" });
  });
  it("completion save failure retains Result and in-session committed results survive a history-write failure", () => {
    const f = state(true); f.preferencesError = true;
    f.outcome = { scan: scanRun(), freshness: "verified", findingsCommitted: true, historyRecorded: false, diagnostics: ["history-not-recorded"] };
    expect(healthOnboardingViewModel(f).step).toBe("result");
    expect(healthHomeViewModel(f).status).toContain("history could not be updated");
  });
});
