import { setIcon } from "obsidian";
import { t } from "../../i18n";
import type { HealthHomeViewModel, HealthCardModel } from "./healthHomeViewModel";
import type { VaultProfile } from "../domain/profile";
import { healthProfileName, renderHealthProfileOptions } from "./healthProfileOptions";
import type { HealthDimension } from "../domain/finding";

interface HealthHomeActions { scan: () => void; tools: () => void; recover: () => void; openNote: () => void;
  changeProfile: () => void; chooseProfile: (profile: VaultProfile) => void;
  findings?: (dimension?: HealthDimension) => void; reviewFinding?: (id: string) => void }

export function healthButton(parent: HTMLElement, text: string, action: () => void, key: string, disabled = false, primary = false): HTMLButtonElement {
  const element = parent.createEl("button", { text, cls: primary ? "mod-cta veynrel-health-primary" : "",
    attr: { type: "button", "data-health-action": key } });
  element.disabled = disabled;
  element.addEventListener("click", () => { if (!element.disabled) action(); });
  return element;
}

function renderHealthCard(parent: HTMLElement, card: HealthCardModel, findings?: HealthHomeActions["findings"]): void {
  const article = parent.createEl("article", { cls: "veynrel-health-card", attr: { "data-dimension": card.id } });
  const heading = article.createEl("h3");
  const icon = heading.createSpan({ cls: "veynrel-health-icon", attr: { "aria-hidden": "true" } });
  setIcon(icon, card.icon);
  if (card.actionable && findings) healthButton(heading, card.title, () => findings(card.id), `dimension-${card.id}`);
  else heading.createSpan({ text: card.title });
  article.createEl("p", { text: card.state, cls: "veynrel-health-state" });
  if (card.count) article.createEl("p", { text: card.count });
  if (card.depth) article.createEl("p", { text: card.depth, cls: "veynrel-health-muted" });
}

export function renderHealthHome(parent: HTMLElement, model: HealthHomeViewModel, actions: HealthHomeActions, changingProfile = false): void {
  parent.empty();
  const home = parent.createDiv({ cls: "veynrel-health-home" });
  const header = home.createEl("header", { cls: "veynrel-health-header" });
  const title = header.createDiv();
  title.createEl("h1", { text: t("@health.title"), attr: { tabindex: "-1", "data-health-heading": "true" } });
  title.createEl("p", { text: t("@health.subtitle"), cls: "veynrel-health-muted" });
  healthButton(header, t("@health.tools"), actions.tools, "tools");
  if (model.recovery) {
    const section = home.createEl("section", { cls: "veynrel-health-recovery", attr: { role: "alert" } });
    section.createEl("h2", { text: model.recovery.title });
    section.createEl("p", { text: model.recovery.description });
    section.createEl("p", { text: t("@health.unaffected") });
    healthButton(section, t(model.recovery.scope === "all" ? "@health.recover-all" : "@health.recover-history"), actions.recover, "recover", model.recoveryDisabled);
  }
  if (model.recovery?.blocking) return;
  if (model.profile && !model.recovery) {
    const profile = home.createDiv({ cls: "veynrel-health-profile-control" });
    profile.createSpan({ text: t("@health.profile.current", { name: healthProfileName(model.profile.value) }), cls: "veynrel-health-muted" });
    healthButton(profile, t(changingProfile ? "@health.cancel" : "@health.profile.change"), actions.changeProfile, "change-profile", model.profile.saving);
    if (changingProfile) renderHealthProfileOptions(home, model.profile.value, model.profile.saving, actions.chooseProfile);
  }
  const scan = home.createEl("section", { cls: "veynrel-health-scan" });
  if (model.initial) {
    scan.createEl("h2", { text: t("@health.initial-title") });
    scan.createEl("p", { text: t("@health.initial-description") });
  }
  scan.createEl("p", { text: t("@health.private"), cls: "veynrel-health-muted" });
  healthButton(scan, model.scanLabel, actions.scan, "scan", model.scanDisabled, true);
  if (model.recommendation) {
    const section = home.createEl("section", { cls: "veynrel-health-recommendation" });
    section.createEl("h2", { text: t("@health.recommended") });
    section.createEl("h3", { text: model.recommendation.title });
    section.createEl("p", { text: model.recommendation.explanation });
    if (model.recommendation.canOpenNote) healthButton(section, t("@health.open-note"), actions.openNote, "open-note");
    const id = model.recommendation.findingId;
    if (id && actions.reviewFinding) healthButton(section, t("@findings.review"), () => actions.reviewFinding?.(id), "review-finding");
  }
  const health = home.createEl("section", { cls: "veynrel-health-dimensions" });
  health.createEl("h2", { text: t("@health.health") });
  const grid = health.createDiv({ cls: "veynrel-health-grid" });
  for (const card of model.cards) renderHealthCard(grid, card, actions.findings);
  const summary = home.createDiv({ cls: "veynrel-health-summary" });
  summary.createEl("p", { text: model.count });
  if (actions.findings) healthButton(summary, t("@findings.view"), () => actions.findings?.(), "view-findings");
}
