import { t } from "../../i18n";
import type { SemanticIntelligenceSnapshot, SemanticSetupDraft, SemanticSetupMode, SemanticSetupResult } from "../semanticIntelligencePort";
import { healthButton } from "./renderHealthHome";
import { semanticIntelligenceViewModel, semanticSetupCopy, semanticSetupError } from "./semanticIntelligenceViewModel";
import type { SemanticAction } from "./semanticIntelligenceViewModel";

export type SemanticSetupState =
  | { step: "choose" }
  | { step: "form"; draft: SemanticSetupDraft; result?: SemanticSetupResult }
  | { step: "connected"; dimensions: number };

interface Actions {
  action: (action: SemanticAction) => void;
  choose: (mode: SemanticSetupMode) => void;
  edit: (field: "baseUrl" | "model" | "apiKey", value: string) => void;
  connect: () => void;
  back: () => void;
}

export function renderSemanticIntelligence(parent: HTMLElement, snapshot: SemanticIntelligenceSnapshot,
  setup: SemanticSetupState | undefined, actions: Actions): void {
  const model = semanticIntelligenceViewModel(snapshot, setup?.step === "connected");
  const section = parent.createEl("section", { cls: "veynrel-health-home veynrel-semantic",
    attr: { "aria-label": model.title, "aria-busy": String(snapshot.busy) } });
  const heading = section.createEl(setup ? "h1" : "h2", { text: setup
    ? t(setup.step === "connected" ? "@semantic.connected" : "@semantic.action.enable") : model.title });
  if (setup) { heading.setAttribute("tabindex", "-1"); heading.setAttribute("data-health-heading", "true"); }

  if (setup && setup.step !== "connected") {
    section.createEl("p", { text: t("@semantic.choose") });
    const choices = section.createDiv({ cls: "veynrel-semantic-choices" });
    for (const mode of ["local", "cloud", "custom"] as const) {
      const copy = semanticSetupCopy(mode); const selected = setup.step === "form" && setup.draft.mode === mode;
      const button = healthButton(choices, "", () => actions.choose(mode), `semantic-mode-${mode}`, snapshot.busy);
      button.addClass("veynrel-health-profile-option"); button.setAttribute("aria-pressed", String(selected));
      button.createSpan({ text: copy.title, cls: "veynrel-health-profile-name" });
      button.createSpan({ text: copy.provider });
      if (selected) button.createSpan({ text: `✓ ${t("@health.profile.selected")}`, cls: "veynrel-health-profile-selected" });
    }
    if (setup.step === "form") {
      const { draft } = setup; const copy = semanticSetupCopy(draft.mode);
      section.createEl("h2", { text: t(`@semantic.setup.${draft.mode}`) });
      section.createEl("p", { text: copy.privacy, cls: "veynrel-health-muted" });
      const field = (name: "baseUrl" | "model" | "apiKey", label: string, password = false): void => {
        const wrapper = section.createEl("label", { cls: "veynrel-semantic-field" });
        wrapper.createSpan({ text: label });
        const input = wrapper.createEl("input", { attr: { type: password ? "password" : "text", autocomplete: "off",
          "data-health-action": `semantic-field-${name}`, spellcheck: "false" } });
        input.value = draft[name]; input.disabled = snapshot.busy;
        input.addEventListener("input", () => actions.edit(name, input.value));
      };
      if (draft.mode === "custom") { field("baseUrl", t("@semantic.base-url")); field("model", t("@semantic.model")); }
      else section.createEl("p", { text: t("@semantic.model-value", { model: draft.model }) });
      if (draft.mode !== "local") field("apiKey", t(draft.mode === "cloud" ? "@semantic.api-key" : "@semantic.api-key-optional"), true);
      else section.createEl("p", { text: t("@semantic.local-help") });
      const error = semanticSetupError(setup.result, draft.mode);
      if (error) section.createEl("p", { text: error, cls: "veynrel-health-status-error" });
      healthButton(section, t(snapshot.busy ? "@semantic.connecting" : "@semantic.connect"), actions.connect,
        "semantic-connect", snapshot.busy, true);
    }
  } else {
    section.createEl("p", { text: model.status, cls: "veynrel-health-state" });
    section.createEl("p", { text: model.description });
    if (model.details) section.createEl("p", { text: model.details, cls: "veynrel-health-muted" });
    if (setup?.step === "connected") section.createEl("p", { text: t("@semantic.dimensions", { n: setup.dimensions }) });
    if (model.vectors) section.createEl("p", { text: model.vectors });
    if (snapshot.state === "configured" || snapshot.state === "ready") {
      section.createEl("p", { text: model.privacy, cls: "veynrel-health-muted" });
      section.createEl("p", { text: t("@semantic.auto-sync"), cls: "veynrel-health-muted" });
    }
    const buttons = section.createDiv({ cls: "veynrel-semantic-actions" });
    for (const action of model.actions) healthButton(buttons, action.label, () => actions.action(action.id),
      `semantic-${action.id}`, snapshot.busy);
  }
  if (setup) healthButton(section, t("@semantic.back"), actions.back, "semantic-back", snapshot.busy);
}
