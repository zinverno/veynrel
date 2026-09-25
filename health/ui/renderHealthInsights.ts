import { t } from "../../i18n";
import type { HealthDashboardModel, DashboardPanelModel, DashboardMetric } from "./healthDashboardModel";
import { healthButton } from "./renderHealthHome";
import type { HealthHomeActions } from "./renderHealthHome";

export function renderHealthMetric(parent: HTMLElement, metric: DashboardMetric): void {
  const item = parent.createDiv({ cls: "veynrel-dashboard-metric" });
  item.createSpan({ text: String(metric.value), cls: "veynrel-dashboard-number" });
  item.createSpan({ text: metric.label, cls: "veynrel-health-muted" });
}

function panel(parent: HTMLElement, id: string, title: string, model: DashboardPanelModel): HTMLElement {
  const section = parent.createEl("section", { cls: "veynrel-dashboard-insight", attr: { "data-insight": id } });
  section.createEl("h3", { text: title });
  if (model.metrics.length) {
    const metrics = section.createDiv({ cls: "veynrel-dashboard-metrics" });
    for (const metric of model.metrics) renderHealthMetric(metrics, metric);
  }
  section.createEl("p", { text: model.detail, cls: "veynrel-health-muted" });
  if (model.note) section.createEl("p", { text: model.note, cls: "veynrel-dashboard-note veynrel-health-muted" });
  return section;
}

export function renderHealthInsights(parent: HTMLElement, model: HealthDashboardModel, actions: HealthHomeActions): void {
  const section = parent.createEl("section", { cls: "veynrel-dashboard-insights" });
  section.createEl("h2", { text: t("@dashboard.insights") });
  const grid = section.createDiv({ cls: "veynrel-dashboard-insights-grid" });
  const findings = grid.createEl("section", { cls: "veynrel-dashboard-insight veynrel-dashboard-findings" });
  findings.createEl("h3", { text: t("@dashboard.findings-area") });
  const legend = findings.createDiv({ cls: "veynrel-dashboard-legend" });
  for (const impact of ["attention", "review", "info"]) {
    legend.createSpan({ text: t(`@dashboard.${impact}`), attr: { "data-impact": impact } });
  }
  if (model.pulse.openFindings === 0) findings.createEl("p", { text: t("@dashboard.no-findings"), cls: "veynrel-health-muted" });
  for (const area of model.findingsBreakdown) {
    const row = findings.createDiv({ cls: "veynrel-dashboard-area", attr: { "data-area": area.id } });
    const heading = row.createDiv({ cls: "veynrel-dashboard-area-heading" });
    const action = area.id === "recall" ? actions.recall : actions.findings ? () => actions.findings?.(area.id) : undefined;
    if (action) healthButton(heading, area.label, action, `area-${area.id}`);
    else heading.createSpan({ text: area.label });
    heading.createSpan({ text: String(area.total), cls: "veynrel-dashboard-area-total" });
    const track = row.createDiv({ cls: "veynrel-dashboard-bar", attr: { "aria-hidden": "true" } });
    for (const segment of area.segments) {
      track.createSpan({ cls: "veynrel-dashboard-bar-segment", attr: { "data-impact": segment.impact,
        style: `width: ${segment.ratio * 100}%` } });
    }
    row.createDiv({ cls: "veynrel-dashboard-breakdown" }).setText(area.breakdownLabel);
  }
  if (actions.findings) healthButton(findings, t("@findings.view"), () => actions.findings?.(), "view-findings");
  const current = grid.createDiv({ cls: "veynrel-dashboard-current" });
  panel(current, "local", t("@dashboard.last-local"), model.localScan);
  const recall = panel(current, "recall", t("@health.recall"), model.recall);
  if (actions.recall) healthButton(recall, t("@dashboard.open-recall"), actions.recall, "dashboard-recall");
  const knowledge = panel(current, "knowledge", t("@health.knowledge"), model.knowledge);
  if (actions.findings && model.knowledge.metrics.length) {
    healthButton(knowledge, t("@findings.view"), () => actions.findings?.("knowledge"), "dashboard-knowledge");
  }
}
