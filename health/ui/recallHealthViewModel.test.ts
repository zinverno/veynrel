import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ getLanguage: () => "en" }));
import { setLanguage } from "../../i18n";
import { healthHomeViewModel } from "./healthHomeViewModel";
import { aggregateHealth } from "../services/healthAggregator";
import { DEFAULT_HEALTH_PREFERENCES } from "../preferences";
import type { RecallHealthSnapshot } from "../recallHealthPort";

const ready: RecallHealthSnapshot = { loadState: "ready", firstRun: false, active: 37, due: 12, new: 0 };
function model(recall: RecallHealthSnapshot) {
  return healthHomeViewModel({ busy: false, recovering: false, savingPreferences: false, preferencesError: false,
    preferences: { ...DEFAULT_HEALTH_PREFERENCES, onboardingCompleted: true },
    // Local scan failure must never downgrade independently available Recall scheduling state.
    error: "scan", snapshot: { ...aggregateHealth({ findings: [], reconciled: false, recall }), recall,
      localScanRunning: false, semanticScanRunning: false, deepScanRunning: false, lastDeepScanReconciled: false, lastLocalScanReconciled: false, lastSemanticScanReconciled: false,
      initialization: { status: "ready", storage: { findings: "missing", scanRuns: "missing" }, findingsWritable: true, historyWritable: true } },
  }).cards[2];
}
beforeEach(() => setLanguage("en"));

describe("Recall Health card presentation", () => {
  it.each([
    [ready, "Review recommended", "12 due · 37 active", "Native FSRS"],
    [{ ...ready, due: 0 }, "Good", "0 due · 37 active", "Native FSRS"],
    [{ ...ready, active: 0, due: 0 }, "No active cards", "0 due · 0 active", "Native FSRS"],
    [{ ...ready, firstRun: true }, "Not enabled", "", ""],
    [{ ...ready, loadState: "uninitialized" }, "Not enabled", "", ""],
    [{ ...ready, loadState: "loading" }, "Not enabled", "", ""],
    [{ ...ready, loadState: "invalid" }, "Recall data needs recovery", "", ""],
    [{ ...ready, loadState: "unsupported" }, "Recall data needs recovery", "", ""],
    [{ ...ready, loadState: "unavailable" }, "Recall data unavailable", "", ""],
  ] as const)("presents %j as actionable Recall without generic analysis copy", (snapshot, state, count, depth) => {
    expect(model(snapshot)).toMatchObject({ id: "recall", state, count, depth, action: "recall" });
    expect(JSON.stringify(model(snapshot))).not.toMatch(/Basic analysis|Needs attention|stability|difficulty|retrievability|weights/u);
  });
  it.each([[1, "активная"], [2, "активные"], [5, "активных"], [11, "активных"], [21, "активная"], [22, "активные"]])("uses natural Russian counts for %s", (active, form) => {
    setLanguage("ru");
    expect(model({ ...ready, active: Number(active), due: 1 })).toMatchObject({ title: "Повторение", state: "Пора повторить",
      count: `1 к повторению · ${active} ${form}`, depth: "Встроенный FSRS" });
  });
  it.each(["en", "ru"] as const)("explains first run, inventory freshness and scoped recovery in %s", (language) => {
    setLanguage(language);
    expect(model({ ...ready, firstRun: true }).description).toBe(language === "en"
      ? "Set up Recall to start reviewing flashcards with Veynrel." : "Настройте «Повторение», чтобы повторять карточки с Veynrel.");
    expect(model(ready).description).toBe(language === "en"
      ? "Tracked cards only. Refresh flashcards to discover changes in your notes." : "Только учтённые карточки. Обновите карточки, чтобы найти изменения в заметках.");
    expect(model({ ...ready, loadState: "invalid" }).state).toBe(language === "en" ? "Recall data needs recovery" : "Данные повторения требуют восстановления");
    expect(model({ ...ready, loadState: "unavailable" }).state).toBe(language === "en" ? "Recall data unavailable" : "Данные повторения недоступны");
    expect(model({ ...ready, active: 0, due: 0 }).state).toBe(language === "en" ? "No active cards" : "Нет активных карточек");
  });
});
