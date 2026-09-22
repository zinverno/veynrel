import { t } from "../../i18n";
import { healthButton } from "./renderHealthHome";
import { SNOOZE_DAYS } from "./findingsInboxViewModel";
import type { FindingsFilter, FindingsInboxViewModel, SnoozeDays } from "./findingsInboxViewModel";

interface FindingsInboxActions {
  filter: (filter: Partial<FindingsFilter>) => void;
  select: (id: string) => void;
  back: () => void;
  openNote: (path: string) => void;
  dismiss: (id: string) => void;
  snooze: (id: string, days: SnoozeDays) => void;
  reopen: (id: string) => void;
  togglePaths: () => void;
  toggleSnooze: () => void;
  tools: () => void;
}

export function renderFindingsInbox(parent: HTMLElement, model: FindingsInboxViewModel, actions: FindingsInboxActions,
  expandedPaths: boolean, expandedSnooze: boolean): void {
  const inbox = parent.createDiv({ cls: "veynrel-findings-inbox" });
  const header = inbox.createEl("header", { cls: "veynrel-health-header" });
  header.createEl("h1", { text: t("@findings.title"), attr: { tabindex: "-1", "data-health-heading": "true" } });
  healthButton(header, t("@health.tools"), actions.tools, "tools");
  const workspace = inbox.createDiv({ cls: `veynrel-findings-workspace${model.selected ? " veynrel-findings-has-detail" : ""}` });
  const listPane = workspace.createEl("section", { cls: "veynrel-findings-list-pane", attr: { "aria-label": t("@findings.title") } });
  const states = listPane.createDiv({ cls: "veynrel-findings-filters", attr: { role: "group", "aria-label": t("@findings.states") } });
  for (const filter of model.stateFilters) {
    healthButton(states, `${filter.label} ${filter.count}`, () => actions.filter({ state: filter.value }), `state-${filter.value}`)
      .setAttribute("aria-pressed", String(filter.selected));
  }
  const dimensions = listPane.createDiv({ cls: "veynrel-findings-filters", attr: { role: "group", "aria-label": t("@findings.dimension") } });
  for (const filter of model.dimensionFilters) {
    healthButton(dimensions, filter.label, () => actions.filter({ dimension: filter.value }), `filter-${filter.value}`)
      .setAttribute("aria-pressed", String(filter.selected));
  }
  if (!model.rows.length) {
    const empty = listPane.createDiv({ cls: "veynrel-findings-empty" });
    empty.createEl("h2", { text: model.empty.title });
    empty.createEl("p", { text: model.empty.description });
  }
  const list = listPane.createEl("ul", { cls: "veynrel-findings-list" });
  for (const row of model.rows) {
    const item = list.createEl("li");
    const button = healthButton(item, "", () => actions.select(row.id), `finding-${row.id}`);
    button.addClass("veynrel-findings-row");
    button.setAttribute("aria-pressed", String(row.selected));
    button.createSpan({ text: row.title, cls: "veynrel-findings-row-title" });
    button.createSpan({ text: `${row.dimension} · ${row.noteSummary}`, cls: "veynrel-findings-row-meta" });
    button.createSpan({ text: row.explanation, cls: "veynrel-findings-row-explanation" });
    if (row.selected) button.createSpan({ text: `✓ ${t("@findings.selected")}`, cls: "veynrel-findings-selected" });
  }
  if (model.selected) renderDetail(workspace, model.selected, actions, expandedPaths, expandedSnooze);
}

function renderDetail(parent: HTMLElement, detail: NonNullable<FindingsInboxViewModel["selected"]>, actions: FindingsInboxActions,
  expandedPaths: boolean, expandedSnooze: boolean): void {
  const article = parent.createEl("article", { cls: "veynrel-findings-detail" });
  healthButton(article, t("@findings.back"), actions.back, "findings-back");
  article.createEl("h2", { text: detail.title, attr: { tabindex: "-1", "data-findings-heading": "true" } });
  article.createEl("p", { text: [detail.dimension, detail.state, detail.source].filter(Boolean).join(" · "), cls: "veynrel-health-muted" });
  article.createEl("p", { text: detail.explanation });
  if (detail.snoozedUntil) article.createEl("p", { text: detail.snoozedUntil });
  const notes = article.createEl("section");
  notes.createEl("h3", { text: t("@findings.affected") });
  notes.createEl("p", { text: detail.affectedSummary });
  if (detail.representativeSummary) notes.createEl("p", { text: detail.representativeSummary, cls: "veynrel-health-muted" });
  const paths = notes.createEl("ul", { cls: "veynrel-findings-paths" });
  for (const [index, path] of detail.notes.slice(0, expandedPaths ? detail.notes.length : 10).entries()) {
    healthButton(paths.createEl("li"), path, () => actions.openNote(path), `finding-note-${index}`);
  }
  if (detail.notes.length > 10) {
    healthButton(notes, t(expandedPaths ? "@findings.show-less" : "@findings.show-all", { n: detail.notes.length }), actions.togglePaths, "finding-paths")
      .setAttribute("aria-expanded", String(expandedPaths));
  }
  const evidence = article.createEl("section");
  evidence.createEl("h3", { text: t("@findings.why") });
  if (detail.facts.length) {
    const list = evidence.createEl("ul");
    for (const fact of detail.facts) list.createEl("li", { text: fact });
  } else evidence.createEl("p", { text: t("@findings.no-evidence"), cls: "veynrel-health-muted" });
  const lifecycle = article.createEl("section");
  lifecycle.createEl("h3", { text: t("@findings.actions") });
  if (detail.resolved) lifecycle.createEl("p", { text: t("@findings.resolved-help") });
  if (detail.canDismiss) lifecycle.createEl("p", { text: t("@findings.dismiss-help"), cls: "veynrel-health-muted" });
  const buttons = lifecycle.createDiv({ cls: "veynrel-findings-actions" });
  if (detail.canSnooze) healthButton(buttons, t("@findings.snooze"), actions.toggleSnooze, "finding-snooze", detail.disabled)
    .setAttribute("aria-expanded", String(expandedSnooze));
  if (detail.canDismiss) healthButton(buttons, t("@findings.dismiss"), () => actions.dismiss(detail.id), "finding-dismiss", detail.disabled);
  if (detail.canReopen) healthButton(buttons, t("@findings.reopen"), () => actions.reopen(detail.id), "finding-reopen", detail.disabled);
  if (detail.canSnooze && expandedSnooze) {
    lifecycle.createEl("p", { text: t("@findings.snooze-for") });
    const presets = lifecycle.createDiv({ cls: "veynrel-findings-actions" });
    for (const days of SNOOZE_DAYS) healthButton(presets, t(`@findings.snooze.${days}`), () => actions.snooze(detail.id, days), `snooze-${days}`, detail.disabled);
    lifecycle.createEl("p", { text: t("@findings.snooze-help"), cls: "veynrel-health-muted" });
  }
}
