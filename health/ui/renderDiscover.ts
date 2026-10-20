import { setIcon } from "obsidian";
import { renderSemanticIndexProgress, renderSemanticRejectedBatch } from "./renderSemanticIntelligence";
import { t } from "../../i18n";
import { healthButton, healthDetails } from "./renderHealthHome";
import type { DiscoverAction, DiscoverViewModel } from "./discoverViewModel";

export function renderDiscover(parent: HTMLElement, model: DiscoverViewModel, action: (action: DiscoverAction) => void,
  openNeighborhood?: () => void, openGlobalMap?: () => void, openComparison?: () => void, openHistory?: () => void,
  scope: { topology?: () => void; blocked?: boolean; confirmScope?: (parent: HTMLElement) => void } = {}): void {
  const section = parent.createEl("section", { cls: "veynrel-discover", attr: { "aria-label": model.title, "aria-busy": String(model.busy) } });
  const entries = section.createDiv({ cls: "veynrel-explore-entries" });
  const ready = model.state === "ready";
  for (const [id, icon, open, available, coverage] of [
    ["search", "search", () => action("search"), ready, "index"],
    ["links", "git-fork", scope.topology, Boolean(scope.topology), "vault"],
    ["map", "orbit", openGlobalMap, ready && Boolean(openGlobalMap), "index"],
    ["comparison", "git-compare-arrows", openComparison, ready && Boolean(openComparison), "index"],
  ] as const) {
    const row = entries.createEl("article", { cls: "veynrel-explore-entry" });
    const symbol = row.createSpan({ cls: "veynrel-catalog-icon", attr: { "aria-hidden": "true" } }); setIcon(symbol, icon);
    const copy = row.createDiv();
    copy.createEl("h2", { text: t(`@polish.explore.${id}`) });
    copy.createEl("p", { text: t(`@polish.explore.${id}.description`) });
    copy.createEl("small", { text: t(`@polish.scope.${coverage}`) });
    const button = healthButton(row, t("@polish.open"), () => open?.(),
      id === "search" ? "discover-search" : id === "map" ? "global-map-open" : id === "comparison" ? "connections-open" : "topology-open",
      !available || model.busy || Boolean(scope.blocked));
    button.setAttribute("aria-label", `${t("@polish.open")}: ${t(`@polish.explore.${id}`)}`);
  }
  scope.confirmScope?.(section);
  if (scope.blocked) return;
  if (!ready) {
    const status = section.createDiv({ cls: "veynrel-explore-status" });
    status.createEl("p", { text: model.status, cls: "veynrel-health-state" });
    status.createEl("p", { text: model.description, cls: "veynrel-health-muted" });
    if (model.details) status.createEl("p", { text: model.details, cls: "veynrel-health-muted" });
    renderSemanticRejectedBatch(status, model.rejectedBatch);
    renderSemanticIndexProgress(status, model.progress);
    for (const item of model.actions) healthButton(status, item.label, () => action(item.id), `discover-${item.id}`, model.busy);
  }
  if (ready || openHistory) {
    const more = healthDetails(section, t("@polish.explore.more"), "discover-more");
    for (const workflow of (ready ? model.workflows : []).filter(item => item.id !== "search")) {
      const row = more.createDiv({ cls: "veynrel-explore-secondary" });
      healthButton(row, workflow.label, () => action(workflow.id), `discover-${workflow.id}`, model.busy);
      row.createEl("p", { text: workflow.description });
    }
    if (ready && openNeighborhood) healthButton(more, t("@neighborhood.open"), openNeighborhood, "neighborhood-open", model.busy);
    if (openHistory) healthButton(more, t("@safeApply.history"), openHistory, "consolidation-history");
    if (ready && model.healthAnalysis) {
      const health = more.createDiv({ cls: "veynrel-discover-health" });
      health.createEl("p", { text: model.healthAnalysis.description });
      healthButton(health, model.healthAnalysis.label, () => action("semantic-duplicates"), "semantic-health-scan", model.healthAnalysis.disabled);
    }
  }
  if (model.healthStatus) section.createEl("p", { text: model.healthStatus });
}
