import { t } from "../../i18n";
import type { DeepIntelligenceSnapshot, DeepProvider, DeepProviderOption, DeepSetupDraft, DeepSetupResult } from "../deepIntelligencePort";
import { healthButton, healthDetails } from "./renderHealthHome";
import { deepIntelligenceViewModel, deepProviderKind, deepSetupError, knowledgeProgressModel } from "./deepIntelligenceViewModel";
import type { DeepAction } from "./deepIntelligenceViewModel";
import { canCheckKnowledge } from "./deepIntelligenceViewModel";
import type { DeepKnowledgeConsent, DeepKnowledgeRunProgress } from "../deepHealthAnalysisPort";

export type DeepSetupState = { step: "choose" } | { step: "form"; draft: DeepSetupDraft; result?: DeepSetupResult };

interface Actions {
  action(action: DeepAction): void;
  choose(provider: DeepProvider): void;
  edit(field: "baseUrl" | "model" | "apiKey", value: string): void;
  connect: () => void;
  back: () => void;
  startKnowledge: () => void;
  cancelKnowledge: () => void;
  dismissConfirmation: () => void;
}

export interface KnowledgeCheckState { consent?: DeepKnowledgeConsent; available: boolean; running: boolean; busy: boolean; status?: string; progress?: DeepKnowledgeRunProgress }

export function renderDeepIntelligence(parent: HTMLElement, snapshot: DeepIntelligenceSnapshot, providers: DeepProviderOption[],
  setup: DeepSetupState | undefined, actions: Actions, knowledge: KnowledgeCheckState, settings = true): void {
  const model = deepIntelligenceViewModel(snapshot);
  const section = parent.createEl("section", { cls: "veynrel-health-home veynrel-deep",
    attr: { "aria-label": model.title, "aria-busy": String(snapshot.busy || knowledge.running) } });
  const heading = section.createEl(setup ? "h1" : "h2", { text: settings ? model.title : t("@polish.knowledge-title") });
  if (setup) { heading.setAttribute("tabindex", "-1"); heading.setAttribute("data-health-heading", "true"); }
  section.createEl("p", { text: settings || snapshot.busy || snapshot.state === "error" ? model.status : t(canCheckKnowledge(snapshot) ? "@polish.knowledge-ready" : "@polish.knowledge-setup"), cls: "veynrel-health-state" });
  if (setup) section.createEl("p", { text: model.description });
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
    healthButton(section, t("@deep.back"), actions.back, "deep-back").addClass("veynrel-quiet");
  } else {
    if (settings && model.details) section.createEl("p", { text: model.details, cls: "veynrel-health-muted" });
    if (settings) healthDetails(section, t("@ui.deep-about"), "deep-about").createEl("p", { text: model.description });
    const buttons = section.createDiv({ cls: "veynrel-deep-actions" });
    for (const action of model.actions) {
      if (settings && action.id === "knowledge") continue;
      if (!settings && action.id === "check") continue;
      if (!settings && action.id === "change" && canCheckKnowledge(snapshot)) continue;
      if (action.id === "knowledge" && !knowledge.available) continue;
      healthButton(buttons, action.label, () => actions.action(action.id), `deep-${action.id}`, snapshot.busy || knowledge.busy || Boolean(knowledge.consent), action.id === "setup" || action.id === "knowledge");
    }
    if (knowledge.running) {
      const progress = knowledgeProgressModel(knowledge.progress);
      const block = section.createDiv({ cls: "veynrel-knowledge-progress", attr: { "data-knowledge-stage": progress.stage } });
      block.createEl("p", { text: progress.title, cls: "veynrel-health-state" });
      if (progress.count) block.createEl("p", { text: progress.count });
      if (progress.explanation) block.createEl("p", { text: progress.explanation, cls: "veynrel-health-muted" });
      if (progress.elapsed) block.createEl("p", { text: progress.elapsed, attr: { "data-knowledge-elapsed": "true" } });
    } else if (knowledge.status) section.createEl("p", { text: knowledge.status });
    if (knowledge.running) healthButton(section, t("@health.cancel"), actions.cancelKnowledge, "knowledge-cancel");
    else if (knowledge.consent) {
      const confirmation = section.createEl("section", { attr: { "aria-label": t("@knowledge.confirm") } });
      confirmation.createEl("h3", { text: t("@knowledge.confirm"), attr: { tabindex: "-1", "data-knowledge-confirmation": "true" } });
      const kind = knowledge.consent.providerKind;
      confirmation.createEl("p", { text: t(`@knowledge.privacy.${kind}`) });
      confirmation.createEl("p", { text: t(kind === "local" ? "@knowledge.requests" : "@knowledge.cost") });
      confirmation.createEl("p", { text: t("@knowledge.meaning"), cls: "veynrel-health-muted" });
      healthButton(confirmation, t("@health.cancel"), actions.dismissConfirmation, "knowledge-back");
      healthButton(confirmation, t("@knowledge.start"), actions.startKnowledge, "knowledge-start", knowledge.busy || !knowledge.available || !canCheckKnowledge(snapshot), true);
    }
  }
}
