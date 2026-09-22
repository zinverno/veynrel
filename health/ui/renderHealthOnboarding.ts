import { t } from "../../i18n";
import type { VaultProfile } from "../domain/profile";
import type { HealthControllerState } from "../obsidian/healthPluginController";
import type { HealthHomeViewModel } from "./healthHomeViewModel";
import type { HealthOnboardingViewModel } from "./healthOnboardingViewModel";
import { renderHealthProfileOptions } from "./healthProfileOptions";
import { healthButton } from "./renderHealthHome";

interface OnboardingActions { choose: (profile: VaultProfile) => void; skip: () => void; scan: () => void; openNote: () => void; complete: () => void }

export function renderHealthOnboarding(parent: HTMLElement, model: HealthOnboardingViewModel, home: HealthHomeViewModel,
  state: HealthControllerState, actions: OnboardingActions): void {
  parent.empty();
  const section = parent.createEl("section", { cls: "veynrel-health-home veynrel-health-onboarding", attr: { "data-onboarding-step": model.step } });
  const heading = (text: string): void => { section.createEl("h1", { text, attr: { tabindex: "-1", "data-health-heading": "true" } }); };
  if (model.step === "profile") {
    heading(t("@health.onboarding.welcome"));
    section.createEl("p", { text: t("@health.onboarding.subtitle") });
    section.createEl("h2", { text: t("@health.profile.question") });
    renderHealthProfileOptions(section, undefined, state.savingPreferences, actions.choose);
    section.createEl("p", { text: t("@health.profile.explanation"), cls: "veynrel-health-muted" });
    healthButton(section, t("@health.onboarding.skip"), actions.skip, "skip", state.savingPreferences);
  } else if (model.step === "scan") {
    heading(t("@health.initial-title"));
    section.createEl("p", { text: t("@health.initial-description") });
    section.createEl("p", { text: t("@health.private"), cls: "veynrel-health-muted" });
    healthButton(section, model.scanLabel, actions.scan, "scan", home.scanDisabled, true);
  } else if (model.step === "result") {
    heading(model.title);
    if (model.explanation) section.createEl("p", { text: model.explanation });
    if (model.finding) {
      section.createEl("h2", { text: model.finding.title });
      section.createEl("p", { text: model.finding.explanation });
    }
    const buttons = section.createDiv({ cls: "veynrel-health-onboarding-actions" });
    if (model.finding?.canOpenNote) healthButton(buttons, t("@health.open-note"), actions.openNote, "open-note");
    healthButton(buttons, t("@health.onboarding.continue"), actions.complete, "continue", state.savingPreferences, true);
    if (model.scanAgain) healthButton(buttons, t("@health.scan-again"), actions.scan, "scan", home.scanDisabled || state.savingPreferences);
  }
}
