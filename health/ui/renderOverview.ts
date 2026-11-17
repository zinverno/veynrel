import { setIcon } from "obsidian";
import { dateLocale, t } from "../../i18n";
import type { HealthControllerState } from "../obsidian/healthPluginController";
import type { Finding } from "../domain/finding";
import type { SemanticIntelligenceSnapshot } from "../semanticIntelligencePort";
import type { VaultScopeSnapshot } from "../workspace/vaultScope";
import { findingCategory, type VeynrelHealthRoute } from "./findingsInboxViewModel";
import { renderSearchEntry } from "./renderSearchEntry";
import { toolsViewModel } from "./toolsViewModel";

export function renderOverview(parent: HTMLElement, state: HealthControllerState, findings: readonly Finding[],
  semantic: SemanticIntelligenceSnapshot | undefined, actions: {
    navigate: (route: VeynrelHealthRoute) => void; search: (query: string) => void; setup: () => void;
  }, query: { value: string }, inventory: VaultScopeSnapshot): void {
  const page = parent.createEl("section", { cls: "veynrel-overview" });
  const header = page.createEl("header", { cls: "veynrel-overview-heading" });
  header.createEl("h1", { text: t("@workspace.home"), attr: { tabindex: "-1", "data-health-heading": "true" } });
  header.createEl("small", { text: t("@visual.inventory", { notes: inventory.paths.length, folders: inventory.folders.length }) });
  renderSearchEntry(page, semantic, query, actions.search, actions.setup);
  const grid = page.createDiv({ cls: "veynrel-overview-grid" });
  const icon = (target: HTMLElement, name: string): void => setIcon(target.createSpan({ cls: "veynrel-overview-icon", attr: { "aria-hidden": "true" } }), name);
  const panel = (key: string, title: string, glyph: string, route: VeynrelHealthRoute): HTMLElement => {
    const card = grid.createEl("a", { cls: `veynrel-overview-panel veynrel-overview-${key}`, href: `#veynrel-${route.page}`,
      attr: { "data-health-action": `overview-${key}`, "aria-label": title } });
    card.addEventListener("click", event => { event.preventDefault(); actions.navigate(route); });
    const heading = card.createDiv({ cls: "veynrel-overview-panel-heading" });
    heading.createEl("h2", { text: title }); icon(heading, glyph);
    return card;
  };
  const next = (target: HTMLElement, label: string): void => {
    const footer = target.createDiv({ cls: "veynrel-overview-next" }); footer.createSpan({ text: label }); icon(footer, "arrow-right");
  };
  const metric = (target: HTMLElement, value: number | string, label: string): void => {
    const item = target.createDiv({ cls: "veynrel-overview-metric" });
    item.createEl("strong", { text: String(value) }); item.createSpan({ text: label });
  };
  // Reading order matches narrow layout: primary check, then each secondary row.
  const open = findings.filter(f => f.state === "open"), run = state.snapshot?.lastLocalScan;
  const known = Boolean(run) || open.length > 0;
  const check = panel("check", t("@ux.check"), "shield-check", { page: "health" });
  metric(check, known ? open.length : "—", t("@overview.open"));
  const counts = check.createDiv({ cls: "veynrel-overview-breakdown" });
  const categories = [["links", "link"], ["duplicates", "copy"], ["organization", "tag"], ["other", "ellipsis"]] as const;
  for (const [key, glyph] of categories) {
    const row = counts.createDiv(); icon(row, glyph); row.createSpan({ text: t(`@ux.${key}`) });
    row.createEl("strong", { text: known ? String(open.filter(f => findingCategory(f) === key).length) : "—" });
  }
  if (known && open.length) {
    const bar = check.createDiv({ cls: "veynrel-overview-breakdown-bar", attr: { "aria-hidden": "true" } });
    for (const [key] of categories) {
      const count = open.filter(f => findingCategory(f) === key).length;
      if (count) bar.createSpan().style.flexGrow = String(count);
    }
  }
  check.createEl("small", { cls: "veynrel-overview-observed", text: run?.completedAt
    ? t("@visual.observed", { date: new Intl.DateTimeFormat(dateLocale(), { dateStyle: "short", timeStyle: "short" }).format(run.completedAt) })
    : t("@overview.not-checked") });
  next(check, t("@visual.review-findings"));
  const batch = panel("batch", t("@workspace.process"), "layers", { page: "process" });
  const workflow = batch.createDiv({ cls: "veynrel-overview-workflow", attr: { "aria-hidden": "true" } });
  for (const [i, glyph] of ["file-text", "search", "shield-check"].entries()) {
    if (i) workflow.createSpan({ cls: "veynrel-overview-workflow-line" });
    icon(workflow.createSpan({ cls: "veynrel-overview-workflow-step" }), glyph);
  }
  batch.createEl("p", { text: t("@visual.batch-summary") }); next(batch, t("@visual.select-notes"));
  const analysis = panel("semantic", t("@overview.analysis"), "network", { page: "semantic" });
  metric(analysis, semantic?.vectorCount ?? "—", t("@overview.vectors"));
  analysis.createEl("small", { text: t(semantic?.state === "ready" ? "@overview.index-ready" : "@overview.index-unavailable") });
  next(analysis, t("@visual.families-map"));
  const tools = panel("tools", t("@workspace.tools"), "wrench", { page: "tools" });
  const toolMetric = tools.createDiv({ cls: "veynrel-overview-tools-metric" });
  toolMetric.createSpan({ cls: "veynrel-mini-ring", attr: { "aria-hidden": "true" } });
  metric(toolMetric, toolsViewModel().groups.reduce((n, g) => n + g.tools.length, 0), t("@visual.catalog-count"));
  next(tools, t("@visual.select-tool"));
  const recall = panel("recall", t("@ux.recall"), "history", { page: "recall" }), summary = state.snapshot?.recall;
  const recallMetric = recall.createDiv({ cls: "veynrel-overview-recall-metric" });
  metric(recallMetric, summary?.loadState === "ready" ? summary.due : "—", t("@recall.due"));
  const stack = recallMetric.createSpan({ cls: "veynrel-card-stack", attr: { "aria-hidden": "true" } });
  for (let i = 0; i < 3; i++) stack.createSpan();
  if (summary?.loadState !== "ready") recall.createEl("small", { text: t("@visual.recall-unknown") });
  next(recall, t("@overview.open-recall"));
}
