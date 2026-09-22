import { setIcon } from "obsidian";
import { t } from "../../i18n";
import type { HealthHomeViewModel, HealthCardModel } from "./healthHomeViewModel";

interface HealthHomeActions { scan: () => void; tools: () => void; recover: () => void; openNote: () => void }

function button(parent: HTMLElement, text: string, action: () => void, key: string, disabled = false, primary = false): void {
  const element = parent.createEl("button", { text, cls: primary ? "mod-cta veynrel-health-primary" : "",
    attr: { type: "button", "data-health-action": key } });
  element.disabled = disabled;
  element.addEventListener("click", () => { if (!element.disabled) action(); });
}

function renderHealthCard(parent: HTMLElement, card: HealthCardModel): void {
  const article = parent.createEl("article", { cls: "veynrel-health-card", attr: { "data-dimension": card.id } });
  const heading = article.createEl("h3");
  const icon = heading.createSpan({ cls: "veynrel-health-icon", attr: { "aria-hidden": "true" } });
  setIcon(icon, card.icon);
  heading.createSpan({ text: card.title });
  article.createEl("p", { text: card.state, cls: "veynrel-health-state" });
  if (card.count) article.createEl("p", { text: card.count });
  if (card.depth) article.createEl("p", { text: card.depth, cls: "veynrel-health-muted" });
}

export function renderHealthHome(parent: HTMLElement, model: HealthHomeViewModel, actions: HealthHomeActions): void {
  parent.empty();
  const home = parent.createDiv({ cls: "veynrel-health-home" });
  const header = home.createEl("header", { cls: "veynrel-health-header" });
  const title = header.createDiv();
  title.createEl("h1", { text: t("@health.title") });
  title.createEl("p", { text: t("@health.subtitle"), cls: "veynrel-health-muted" });
  button(header, t("@health.tools"), actions.tools, "tools");
  if (model.recovery) {
    const section = home.createEl("section", { cls: "veynrel-health-recovery", attr: { role: "alert" } });
    section.createEl("h2", { text: model.recovery.title });
    section.createEl("p", { text: model.recovery.description });
    section.createEl("p", { text: t("@health.unaffected") });
    button(section, t(model.recovery.scope === "all" ? "@health.recover-all" : "@health.recover-history"), actions.recover, "recover", model.recoveryDisabled);
  }
  if (model.recovery?.blocking) return;
  const scan = home.createEl("section", { cls: "veynrel-health-scan" });
  if (model.initial) {
    scan.createEl("h2", { text: t("@health.initial-title") });
    scan.createEl("p", { text: t("@health.initial-description") });
  }
  scan.createEl("p", { text: t("@health.private"), cls: "veynrel-health-muted" });
  button(scan, model.scanLabel, actions.scan, "scan", model.scanDisabled, true);
  if (model.recommendation) {
    const section = home.createEl("section", { cls: "veynrel-health-recommendation" });
    section.createEl("h2", { text: t("@health.recommended") });
    section.createEl("h3", { text: model.recommendation.title });
    section.createEl("p", { text: model.recommendation.explanation });
    if (model.recommendation.canOpenNote) button(section, t("@health.open-note"), actions.openNote, "open-note");
  }
  const health = home.createEl("section", { cls: "veynrel-health-dimensions" });
  health.createEl("h2", { text: t("@health.health") });
  const grid = health.createDiv({ cls: "veynrel-health-grid" });
  for (const card of model.cards) renderHealthCard(grid, card);
  home.createEl("p", { text: model.count, cls: "veynrel-health-summary" });
}
