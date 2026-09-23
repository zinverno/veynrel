import { t } from "../../i18n";
import type { DeepIntelligenceSnapshot, DeepProvider, DeepProviderOption, DeepSetupDraft, DeepSetupResult } from "../deepIntelligencePort";
import { healthButton } from "./renderHealthHome";
import { deepIntelligenceViewModel, deepProviderKind, deepSetupError } from "./deepIntelligenceViewModel";
import type { DeepAction } from "./deepIntelligenceViewModel";

export type DeepSetupState = { step: "choose" } | { step: "form"; draft: DeepSetupDraft; result?: DeepSetupResult };

interface Actions {
  action(action: DeepAction): void;
  choose(provider: DeepProvider): void;
  edit(field: "baseUrl" | "model" | "apiKey", value: string): void;
  connect: () => void;
  back: () => void;
}

export function renderDeepIntelligence(parent: HTMLElement, snapshot: DeepIntelligenceSnapshot, providers: DeepProviderOption[],
  setup: DeepSetupState | undefined, actions: Actions): void {
  const model = deepIntelligenceViewModel(snapshot);
  const section = parent.createEl("section", { cls: "veynrel-health-home veynrel-deep",
    attr: { "aria-label": model.title, "aria-busy": String(snapshot.busy) } });
  const heading = section.createEl(setup ? "h1" : "h2", { text: model.title });
  if (setup) { heading.setAttribute("tabindex", "-1"); heading.setAttribute("data-health-heading", "true"); }
  section.createEl("p", { text: model.status, cls: "veynrel-health-state" });
  section.createEl("p", { text: model.description });
  if (setup) {
    section.createEl("p", { text: t("@deep.choose") });
    const choices = section.createDiv({ cls: "veynrel-deep-choices" });
    for (const provider of providers) {
      const selected = setup.step === "form" && setup.draft.provider === provider.id;
      const button = healthButton(choices, "", () => actions.choose(provider.id), `deep-provider-${provider.id}`, snapshot.busy);
      button.addClass("veynrel-health-profile-option"); button.setAttribute("aria-pressed", String(selected));
      button.createSpan({ text: provider.id === "custom" ? t("@deep.custom") : provider.label, cls: "veynrel-health-profile-name" });
      button.createSpan({ text: t(`@deep.kind.${deepProviderKind(provider.id)}`) });
      if (selected) button.createSpan({ text: `✓ ${t("@health.profile.selected")}`, cls: "veynrel-health-profile-selected" });
    }
    if (setup.step === "form") {
      const { draft } = setup;
      const kind = deepProviderKind(draft.provider);
      section.createEl("p", { text: t(`@deep.privacy.${kind}`), cls: "veynrel-health-muted" });
      if (kind !== "local") section.createEl("p", { text: t("@deep.cost"), cls: "veynrel-health-muted" });
      const field = (name: "baseUrl" | "model" | "apiKey", label: string, password = false): void => {
        const wrapper = section.createEl("label", { cls: "veynrel-deep-field" });
        wrapper.createSpan({ text: label });
        const input = wrapper.createEl("input", { attr: { type: password ? "password" : "text", autocomplete: "off",
          spellcheck: "false", "data-health-action": `deep-field-${name}` } });
        input.value = draft[name]; input.disabled = snapshot.busy;
        input.addEventListener("input", () => actions.edit(name, input.value));
      };
      if (draft.provider === "custom") field("baseUrl", t("@deep.base-url"));
      field("model", t("@deep.model"));
      if (draft.provider !== "ollama") {
        const required = providers.find((provider) => provider.id === draft.provider)?.requiresApiKey;
        field("apiKey", t(required ? "@deep.api-key" : "@deep.api-key-optional"), true);
      }
      const error = deepSetupError(setup.result);
      if (error) section.createEl("p", { text: error, cls: "veynrel-health-status-error" });
      healthButton(section, t(snapshot.busy ? "@deep.connecting" : "@deep.connect"), actions.connect, "deep-connect", snapshot.busy, true);
    }
    healthButton(section, t("@deep.back"), actions.back, "deep-back");
  } else {
    if (model.details) section.createEl("p", { text: model.details, cls: "veynrel-health-muted" });
    const buttons = section.createDiv({ cls: "veynrel-deep-actions" });
    for (const action of model.actions) healthButton(buttons, action.label, () => actions.action(action.id), `deep-${action.id}`, snapshot.busy);
  }
}
