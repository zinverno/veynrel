import { dateLocale, t } from "../../i18n";
import type { HealthControllerState } from "../obsidian/healthPluginController";
import type { Finding } from "../domain/finding";
import type { SemanticIntelligenceSnapshot } from "../semanticIntelligencePort";
import type { VeynrelHealthRoute } from "./findingsInboxViewModel";
import { healthButton } from "./renderHealthHome";
import { renderSearchEntry } from "./renderSearchEntry";
import { toolsViewModel } from "./toolsViewModel";

export function renderOverview(parent: HTMLElement, state: HealthControllerState, findings: readonly Finding[],
  semantic: SemanticIntelligenceSnapshot | undefined, actions: {
    navigate: (route: VeynrelHealthRoute) => void; search: (query: string) => void; setup: () => void;
  }, query: { value: string }): void {
  const page = parent.createEl("section", { cls: "veynrel-overview" });
  page.createEl("h1", { text: t("@workspace.home"), attr: { tabindex: "-1", "data-health-heading": "true" } });
  page.createEl("p", { text: t("@overview.scope"), cls: "veynrel-health-muted" });
  const grid = page.createDiv({ cls: "veynrel-overview-grid" });
  const search = grid.createEl("section", { cls: "veynrel-overview-panel veynrel-overview-search" });
  renderSearchEntry(search, semantic, query, actions.search, actions.setup);
  const panel = (key: string, title: string, route: VeynrelHealthRoute): HTMLElement => {
    const card = grid.createEl("section", { cls: `veynrel-overview-panel veynrel-overview-${key}` });
    const heading = card.createEl("h2");
    healthButton(heading, title, () => actions.navigate(route), `overview-${key}`).addClass("veynrel-panel-link");
    return card;
  };
  const metric = (parent: HTMLElement, label: string, value: number | string): void => {
    const item = parent.createDiv({ cls: "veynrel-overview-metric" });
    item.createEl("strong", { text: String(value) }); item.createSpan({ text: label });
  };
  const open = findings.filter(f => f.state === "open");
  const check = panel("check", t("@ux.check"), { page: "health" });
  const checked = Boolean(state.snapshot?.lastLocalScan);
  metric(check, t("@overview.open"), checked || open.length ? open.length : "—");
  const counts = check.createDiv({ cls: "veynrel-overview-counts" });
  metric(counts, t("@overview.broken"), checked ? open.filter(f => f.type === "broken-link").length : "—");
  metric(counts, t("@overview.duplicates"), checked ? open.filter(f => /duplicate|similar/.test(f.type)).length : "—");
  metric(counts, t("@overview.organization"), checked ? open.filter(f => f.dimension === "structure" && !/duplicate|link/.test(f.type)).length : "—");
  const run = state.snapshot?.lastLocalScan;
  check.createEl("p", { cls: "veynrel-health-muted", text: run?.completedAt
    ? t("@overview.last-check", { date: new Intl.DateTimeFormat(dateLocale(), { dateStyle: "short", timeStyle: "short" }).format(run.completedAt) }) : t("@overview.not-checked") });
  if (run) check.createEl("small", { text: t("@overview.saved-findings") });
  const batch = panel("batch", t("@workspace.process"), { page: "process" });
  batch.createEl("strong", { text: t("@overview.available"), cls: "veynrel-overview-state" });
  batch.createEl("p", { text: t("@overview.batch-description") });
  healthButton(batch, t("@overview.open-batch"), () => actions.navigate({ page: "process" }), "overview-batch-open", false, true);
  const analysis = panel("semantic", t("@overview.analysis"), { page: "semantic" });
  metric(analysis, t("@overview.vectors"), semantic?.vectorCount ?? "—");
  analysis.createEl("p", { text: t(semantic?.state === "ready" ? "@overview.index-ready" : "@overview.index-unavailable") });
  analysis.createEl("small", { text: t("@overview.analysis-description") });
  const recall = panel("recall", t("@ux.recall"), { page: "recall" });
  const summary = state.snapshot?.recall;
  const stats = recall.createDiv({ cls: "veynrel-overview-counts" });
  for (const key of ["due", "active", "new"] as const) metric(stats, t(`@recall.${key}`), summary?.loadState === "ready" ? summary[key] : "—");
  if (summary?.loadState !== "ready") recall.createEl("p", { text: t("@overview.recall-unavailable") });
  healthButton(recall, t("@overview.open-recall"), () => actions.navigate({ page: "recall" }), "overview-recall-open");
  const tools = panel("tools", t("@workspace.tools"), { page: "tools" });
  metric(tools, t("@overview.tools"), toolsViewModel().groups.reduce((n, g) => n + g.tools.length, 0));
  tools.createEl("p", { text: t("@overview.tools-description") });
}
