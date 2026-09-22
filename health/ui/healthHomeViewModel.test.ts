import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ getLanguage: () => "en" }));
import { setLanguage } from "../../i18n";
import { healthHomeViewModel } from "./healthHomeViewModel";
import type { HealthSnapshot, LocalHealthScanOutcome } from "../services/types";
import type { HealthControllerState } from "../obsidian/healthPluginController";
import { scanRun } from "../store/testSupport";

function fixture(): HealthControllerState & { snapshot: HealthSnapshot } {
  const dimension = { state: "unknown" as const, analysisDepth: "not-enabled" as const, openFindings: 0, attentionFindings: 0, reviewFindings: 0, analysisComplete: false };
  return { busy: false, recovering: false, snapshot: {
    dimensions: { structure: { ...dimension }, connections: { ...dimension }, recall: { ...dimension }, knowledge: { ...dimension } },
    openFindings: 0, newFindings: 0, localScanRunning: false,
    initialization: { status: "ready", storage: { findings: "missing", scanRuns: "missing" }, findingsWritable: true, historyWritable: true },
  } };
}
function outcome(status: "completed" | "partial" | "failed" = "completed"): LocalHealthScanOutcome {
  return { scan: scanRun({ status }), freshness: "verified", findingsCommitted: true, historyRecorded: true, diagnostics: [] };
}
beforeEach(() => setLanguage("en"));

describe("Health home copy and state", () => {
  it("starts with an explicit Scan action, unknown local health and honest disabled dimensions", () => {
    const model = healthHomeViewModel(fixture());
    expect(model.initial).toBe(true); expect(model.scanLabel).toBe("Scan my vault"); expect(model.scanDisabled).toBe(false);
    expect(model.cards.map((card) => card.state)).toEqual(["Not fully analyzed", "Not fully analyzed", "Not enabled", "Not enabled"]);
    expect(model.cards.map((card) => card.depth)).toEqual(["", "", "", ""]);
  });
  it.each([
    ["good", true, "Good"], ["good", false, "Not fully analyzed"],
    ["unknown", false, "Not fully analyzed"], ["needs-attention", false, "Needs attention"],
    ["review-recommended", false, "Review recommended"],
  ] as const)("maps %s with completeness %s without equating basic depth to complete", (state, complete, copy) => {
    const f = fixture(); f.snapshot.dimensions.structure = { ...f.snapshot.dimensions.structure, state, analysisDepth: "basic", analysisComplete: complete };
    const card = healthHomeViewModel(f).cards[0];
    expect(card.state).toBe(copy); expect(card.depth).toBe(complete ? "Basic analysis" : "Basic analysis · incomplete");
  });
  it.each(["partial", "failed"] as const)("%s cannot render Good from a previous complete snapshot", (status) => {
    const f = fixture(); f.snapshot.dimensions.structure = { ...f.snapshot.dimensions.structure, state: "good", analysisDepth: "basic", analysisComplete: true };
    f.outcome = outcome(status);
    expect(healthHomeViewModel(f).cards[0]).toMatchObject({ state: "Not fully analyzed", depth: "Basic analysis · incomplete" });
  });
  it("keeps cached attention counts and recommendation visible while busy or failed", () => {
    const f = fixture(); f.snapshot.dimensions.structure.state = "needs-attention"; f.snapshot.dimensions.structure.openFindings = 2;
    f.snapshot.recommendation = { id: "recommendation", title: "Check this note", explanation: "A missing link was found.", action: { kind: "fix-link" } };
    f.busy = true;
    let model = healthHomeViewModel(f, true);
    expect(model.scanDisabled).toBe(true); expect(model.status).toBe("Checking your vault…");
    expect(model.cards[0]).toMatchObject({ state: "Needs attention", count: "Findings: 2" });
    expect(model.recommendation).toEqual({ title: "Check this note", explanation: "A missing link was found.", canOpenNote: true });
    f.busy = false; f.error = "scan"; model = healthHomeViewModel(f);
    expect(model.recommendation?.canOpenNote).toBe(false); expect(model.status).toContain("previous Health results were not replaced");
    expect(model.scanLabel).toBe("Try again");
  });
  it("uses distinct complete, partial, stale, failed, and late-history-failure copy", () => {
    const f = fixture(); f.outcome = outcome(); expect(healthHomeViewModel(f).status).toBe("Vault check complete");
    f.outcome = outcome("partial"); expect(healthHomeViewModel(f).status).toContain("limited coverage");
    f.outcome.freshness = "stale"; f.outcome.findingsCommitted = false;
    expect(healthHomeViewModel(f).status).toContain("No scan results were applied");
    f.outcome = outcome("failed"); expect(healthHomeViewModel(f).status).toContain("couldn't complete");
    f.outcome = outcome(); f.outcome.historyRecorded = false;
    expect(healthHomeViewModel(f).status).toBe("Health results were saved, but scan history could not be updated.");
    expect(healthHomeViewModel(f).statusError).toBe(false);
  });
  it.each(["invalid", "unsupported", "unavailable"] as const)("%s Findings require blocking all-Health recovery", (status) => {
    const f = fixture(); f.snapshot.initialization.findingsWritable = false; f.snapshot.initialization.storage.findings = status;
    const model = healthHomeViewModel(f);
    expect(model.recovery).toMatchObject({ scope: "all", blocking: true }); expect(model.scanDisabled).toBe(true);
    if (status === "unavailable") expect(model.recovery?.description).toBe("Health storage could not be accessed.");
  });
  it("damaged history offers history-only recovery without blocking usable Findings", () => {
    const f = fixture(); f.snapshot.initialization.historyWritable = false; f.snapshot.initialization.storage.scanRuns = "invalid";
    const model = healthHomeViewModel(f); expect(model.recovery).toMatchObject({ scope: "history", blocking: false });
    expect(model.scanDisabled).toBe(false);
    f.recovering = true; f.busy = true;
    expect(healthHomeViewModel(f)).toMatchObject({ scanDisabled: true, recoveryDisabled: true, status: "Backing up and resetting Health metadata…" });
  });
  it("uses the existing language setting for new Health strings", () => {
    setLanguage("ru"); const model = healthHomeViewModel(fixture());
    expect(model.scanLabel).toBe("Проверить хранилище"); expect(model.cards[0].title).toBe("Структура");
    expect(JSON.stringify(model)).not.toContain("@health.");
  });
});
