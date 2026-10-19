import { renderSemanticIndexProgress, renderSemanticRejectedBatch } from "./renderSemanticIntelligence";
import { t } from "../../i18n";
import { healthButton } from "./renderHealthHome";
import type { DiscoverAction, DiscoverViewModel } from "./discoverViewModel";

export function renderDiscover(parent: HTMLElement, model: DiscoverViewModel, action: (action: DiscoverAction) => void, openNeighborhood?: () => void, openGlobalMap?: () => void, openComparison?: () => void, openHistory?: () => void): void {
  const section = parent.createEl("section", { cls: "veynrel-health-home veynrel-discover",
    attr: { "aria-label": model.title, "aria-busy": String(model.busy) } });
  section.createEl("h1", { text: model.title, attr: { tabindex: "-1", "data-health-heading": "true" } });
  if (openHistory) {
    const history = section.createDiv({ cls: "veynrel-discover-history" });
    healthButton(history, t("@safeApply.history"), openHistory, "consolidation-history", false);
    history.createEl("p", { text: t("@ux.historyAccess"), cls: "veynrel-health-muted" });
  }
  const status = section.createDiv({ cls: "veynrel-capability-summary" });
  status.createEl("p", { text: model.status, cls: "veynrel-health-state" });
  if (model.details) status.createEl("p", { text: model.details, cls: "veynrel-health-muted" });
  if (model.vectors) status.createEl("p", { text: model.vectors, cls: "veynrel-health-muted" });
  if (model.state !== "ready") {
    section.createEl("p", { text: model.description });
    renderSemanticRejectedBatch(section, model.rejectedBatch);
    renderSemanticIndexProgress(section, model.progress);
    const actions = section.createDiv({ cls: "veynrel-semantic-actions" });
    for (const [index, item] of model.actions.entries()) healthButton(actions, item.label, () => action(item.id), `discover-${item.id}`, model.busy, index === 0);
  }
  if (model.workflows.length) {
    section.createEl("h2", { text: model.exploreTitle });
    const workflows = section.createDiv({ cls: "veynrel-discover-workflows" });
    for (const workflow of model.workflows) {
      const button = healthButton(workflows, "", () => action(workflow.id), `discover-${workflow.id}`, model.busy);
      button.addClass("veynrel-workflow-link");
      button.createSpan({ text: workflow.label, cls: "veynrel-health-profile-name" });
      button.createSpan({ text: workflow.description });
    }
  }
  if (model.state === "ready" && (openNeighborhood || openGlobalMap || openComparison)) {
    section.createEl("h2", { text: t("@global-map.exploration") });
    const exploration = section.createDiv({ cls: "veynrel-semantic-exploration" });
    for (const [key, open, actionKey] of [["neighborhood", openNeighborhood, "neighborhood-open"], ["global-map", openGlobalMap, "global-map-open"], ["connections", openComparison, "connections-open"]] as const) {
      if (!open) continue;
      const card = exploration.createEl("section", { cls: "veynrel-neighborhood-card" });
      card.createEl("h3", { text: t(`@${key}.title`) });
      card.createEl("p", { text: t(`@${key}.tagline`), cls: "veynrel-neighborhood-card-lead" });
      healthButton(card, t(`@${key}.open`), open, actionKey, model.busy).addClass("veynrel-quiet");
    }
    section.createEl("p", { text: t("@neighborhood.index-only"), cls: "veynrel-health-muted" });
  }
  if (model.healthAnalysis) {
    const health = section.createEl("section", { cls: "veynrel-discover-health", attr: { "aria-label": model.healthAnalysis.title } });
    const copy = health.createDiv();
    copy.createEl("h2", { text: model.healthAnalysis.title });
    copy.createEl("p", { text: model.healthAnalysis.description });
    healthButton(health, model.healthAnalysis.label, () => action("semantic-duplicates"), "semantic-health-scan", model.healthAnalysis.disabled);
  }
  if (model.healthStatus) section.createEl("p", { text: model.healthStatus });
}
