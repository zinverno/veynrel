import { setIcon } from "obsidian";
import { t } from "../../i18n";
import type { HealthHomeViewModel, HealthCardModel } from "./healthHomeViewModel";
import type { VaultProfile } from "../domain/profile";
import { healthProfileName, renderHealthProfileOptions } from "./healthProfileOptions";
import type { HealthDimension } from "../domain/finding";
import { renderVaultPulse } from "./renderVaultPulse";
import { renderHealthInsights, renderHealthMetric } from "./renderHealthInsights";

export interface HealthHomeActions { scan: () => void; recover: () => void; openNote: () => void;
  changeProfile: () => void; chooseProfile: (profile: VaultProfile) => void;
  findings?: (dimension?: HealthDimension) => void; recall?: () => void; reviewFinding?: (id: string) => void }

export function healthButton(parent: HTMLElement, text: string, action: () => void, key: string, disabled = false, primary = false): HTMLButtonElement {
  const element = parent.createEl("button", { text, cls: primary ? "mod-cta veynrel-health-primary" : "",
    attr: { type: "button", "data-health-action": key } });
  element.disabled = disabled;
  element.addEventListener("click", () => { if (!element.disabled) action(); });
  return element;
}

/** Native disclosure; the view retains open/focus state only during a same-page render. */
export function healthDetails(parent: HTMLElement, label: string, key: string): HTMLDetailsElement {
  const details = parent.createEl("details", { cls: "veynrel-details", attr: { "data-health-disclosure": key } });
  details.createEl("summary", { text: label, attr: { "data-health-action": key } });
  return details;
}

function renderHealthCard(parent: HTMLElement, card: HealthCardModel, actions: HealthHomeActions): void {
  const article = parent.createEl("article", { cls: "veynrel-health-card", attr: { "data-dimension": card.id,
    "data-state": card.signal, "data-complete": String(card.complete) } });
  const heading = article.createEl("h3");
  const icon = heading.createSpan({ cls: "veynrel-health-icon", attr: { "aria-hidden": "true" } });
  setIcon(icon, card.icon);
  const action = card.action === "recall" ? actions.recall : card.action === "findings" && actions.findings ? () => actions.findings?.(card.id) : undefined;
  if (action) healthButton(heading, card.title, action, `dimension-${card.id}`);
  else heading.createSpan({ text: card.title });
  article.createEl("p", { text: card.state, cls: "veynrel-health-state" });
  if (card.metric) renderHealthMetric(article, card.metric);
  if (card.depth) article.createEl("p", { text: card.depth, cls: "veynrel-health-muted" });
  article.createDiv({ cls: "veynrel-health-state-rail", attr: { "aria-hidden": "true" } });
}

export function renderHealthHome(parent: HTMLElement, model: HealthHomeViewModel, actions: HealthHomeActions): void {
  parent.empty();
  const home = parent.createDiv({ cls: "veynrel-health-home" });
  const header = home.createEl("header", { cls: "veynrel-health-header" });
  const title = header.createDiv();
  title.createEl("h1", { text: t("@findings.health"), attr: { tabindex: "-1", "data-health-heading": "true" } });
  if (model.recovery) {
    const section = home.createEl("section", { cls: "veynrel-health-recovery", attr: { role: "alert" } });
    section.createEl("h2", { text: model.recovery.title });
    section.createEl("p", { text: model.recovery.description });
    section.createEl("p", { text: t("@health.unaffected") });
    healthButton(section, t(model.recovery.scope === "all" ? "@health.recover-all" : "@health.recover-history"), actions.recover, "recover", model.recoveryDisabled);
  }
  if (model.recovery?.blocking) return;
  const hero = renderVaultPulse(home, model.dashboard.pulse);
  healthButton(hero, model.scanLabel, actions.scan, "scan", model.scanDisabled, true);
  hero.createEl("p", { text: t("@dashboard.local-private"), cls: "veynrel-dashboard-note veynrel-health-muted" });
  if (model.recommendation) {
    const section = home.createEl("section", { cls: "veynrel-health-recommendation" });
    section.createEl("h2", { text: t("@dashboard.recommended"), cls: "veynrel-dashboard-eyebrow" });
    section.createEl("h3", { text: model.recommendation.title });
    section.createEl("p", { text: model.recommendation.explanation });
    if (model.recommendation.canOpenNote) healthButton(section, t("@health.open-note"), actions.openNote, "open-note").addClass("veynrel-quiet");
    const id = model.recommendation.findingId;
    if (id && actions.reviewFinding) healthButton(section, t("@findings.review"), () => actions.reviewFinding?.(id), "review-finding");
  }
  const health = home.createEl("section", { cls: "veynrel-health-dimensions" });
  health.createEl("h2", { text: t("@ui.dimensions") });
  const grid = health.createDiv({ cls: "veynrel-health-grid" });
  for (const card of model.cards) renderHealthCard(grid, card, actions);
  renderHealthInsights(home, model.dashboard, actions);
}

export function renderHealthProfile(parent: HTMLElement, model: HealthHomeViewModel,
  actions: Pick<HealthHomeActions, "changeProfile" | "chooseProfile">, changingProfile: boolean): void {
  const controls = parent.createEl("section", { cls: "veynrel-dashboard-controls" });
  if (model.profile && !model.recovery) {
    const profile = controls.createDiv({ cls: "veynrel-health-profile-control" });
    profile.createSpan({ text: t("@health.profile.current", { name: healthProfileName(model.profile.value) }), cls: "veynrel-health-muted" });
    healthButton(profile, t(changingProfile ? "@health.cancel" : "@health.profile.change"), actions.changeProfile, "change-profile", model.profile.saving).addClass("veynrel-quiet");
    if (changingProfile) renderHealthProfileOptions(controls, model.profile.value, model.profile.saving, actions.chooseProfile);
  }
}
