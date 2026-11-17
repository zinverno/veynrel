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
  compare?: (id: string) => void;
  repair?: (path: string) => void;
}

export function renderFindingsInbox(parent: HTMLElement, model: FindingsInboxViewModel, actions: FindingsInboxActions,
  expandedPaths: boolean, expandedSnooze: boolean): void {
  const inbox = parent.createDiv({ cls: "veynrel-findings-inbox" });
  const workspace = inbox.createDiv({ cls: `veynrel-findings-workspace${model.selected ? " veynrel-findings-has-detail" : ""}` });
  const listPane = workspace.createEl("section", { cls: "veynrel-findings-list-pane", attr: { "aria-label": t("@findings.title") } });
  const states = listPane.createDiv({ cls: "veynrel-findings-filters", attr: { role: "group", "aria-label": t("@findings.states") } });
  for (const filter of model.stateFilters) {
    healthButton(states, `${filter.label} ${filter.count}`, () => actions.filter({ state: filter.value }), `state-${filter.value}`)
      .setAttribute("aria-pressed", String(filter.selected));
  }
  const dimensions = listPane.createDiv({ cls: "veynrel-findings-filters", attr: { role: "group", "aria-label": t("@findings.dimension") } });
  for (const value of ["all", "links", "duplicates", "organization", "other"] as const) {
    healthButton(dimensions, t(`@ux.${value}`), () => actions.filter({ category: value, offset: 0 }), `category-${value}`)
      .setAttribute("aria-pressed", String(model.category === value));
  }
  const sources = listPane.createEl("details", { attr: { "data-health-disclosure": "finding-dimensions" } });
  sources.createEl("summary", { text: t("@findings.dimension") });
  for (const filter of model.dimensionFilters) healthButton(sources, filter.label, () => actions.filter({ dimension: filter.value, offset: 0 }), `filter-${filter.value}`)
    .setAttribute("aria-pressed", String(filter.selected));
  const search = listPane.createEl("input", { attr: { type: "search", placeholder: t("@ux.search"), "aria-label": t("@ux.search"), "data-health-action": "finding-search" } });
  search.value = model.query; search.addEventListener("input", () => actions.filter({ query: search.value, offset: 0 }));
  if (!model.rows.length) listPane.createEl("p", { text: model.query || model.category !== "all" ? t("@ux.empty") : model.empty.title });
  const groups = new Map<string, HTMLElement>();
  for (const row of model.rows) {
    const sourceKey = row.sourceKey;
    let list = groups.get(sourceKey);
    if (!list) {
      const group = listPane.createEl("details", { attr: { "data-health-disclosure": `finding-group-${sourceKey}` } }); group.open = true;
      const source = group.createEl("summary");
      source.createSpan({ text: t("@visual.findings-count", { n: model.rows.filter(item => item.sourceKey === sourceKey).length }) });
      if (row.paths.length > 1) group.createEl("small", { text: row.noteSummary });
      const files = group.createDiv({ cls: "veynrel-finding-files" });
      for (const path of row.paths) healthButton(files, path, () => actions.openNote(path), `source-${row.id}-${path}`).addClass("veynrel-finding-source");
      list = group.createEl("ul", { cls: "veynrel-findings-list" }); groups.set(sourceKey, list);
    }
    const item = list.createEl("li", { cls: "veynrel-finding-item" });
    const problem = item.createDiv({ cls: "veynrel-finding-problem" });
    problem.createEl("strong", { text: row.title });
    for (const fact of row.facts.slice(0, 3)) problem.createEl("p", { text: fact });
    if (!row.facts.length) problem.createEl("p", { text: row.explanation });
    const buttons = item.createDiv({ cls: "veynrel-health-actions" });
    if (row.repairSource && actions.repair) healthButton(buttons, t("@localNote.repair"), () => actions.repair!(row.repairSource!), `repair-${row.id}`);
    else if (row.pair && actions.compare) healthButton(buttons, t("@actions.compare"), () => actions.compare!(row.id), `compare-${row.id}`);
    healthButton(buttons, t("@ux.details"), () => actions.select(row.id), `finding-${row.id}`).setAttribute("aria-pressed", String(row.selected));
  }
  if (model.total) {
    const pages = listPane.createDiv({ cls: "veynrel-health-actions" });
    pages.createSpan({ text: t("@ux.page", { from: model.offset + 1, to: model.offset + model.rows.length, total: model.total }) });
    if (model.offset) healthButton(pages, t("@ux.previous"), () => actions.filter({ offset: model.offset - 60 }), "findings-previous");
    if (model.offset + model.rows.length < model.total) healthButton(pages, t("@ux.next"), () => actions.filter({ offset: model.offset + 60 }), "findings-next");
  }
  if (model.selected) renderDetail(workspace, model.selected, actions, expandedPaths, expandedSnooze);
}

function renderDetail(parent: HTMLElement, detail: NonNullable<FindingsInboxViewModel["selected"]>, actions: FindingsInboxActions,
  expandedPaths: boolean, expandedSnooze: boolean): void {
  const article = parent.createEl("article", { cls: "veynrel-findings-detail" });
  healthButton(article, t("@findings.back"), actions.back, "findings-back").addClass("veynrel-quiet");
  article.createEl("h2", { text: detail.title, attr: { tabindex: "-1", "data-findings-heading": "true" } });
  article.createEl("p", { text: [detail.dimension, detail.state, detail.source].filter(Boolean).join(" · "), cls: "veynrel-health-muted" });
  article.createEl("p", { text: detail.explanation });
  if (detail.snoozedUntil) article.createEl("p", { text: detail.snoozedUntil });
  const evidence = article.createEl("section");
  evidence.createEl("h3", { text: t("@findings.why") });
  if (detail.facts.length) {
    const list = evidence.createEl("ul");
    for (const fact of detail.facts) list.createEl("li", { text: fact });
  } else evidence.createEl("p", { text: t("@findings.no-evidence"), cls: "veynrel-health-muted" });
  evidence.createEl("p", { text: detail.recorded });
  evidence.createEl("p", { text: detail.origin });
  evidence.createEl("p", { text: t(detail.pair ? "@actions.pair-scope" : "@actions.manual") });
  if (detail.repairSource && actions.repair) healthButton(evidence, t("@localNote.repair"), () => actions.repair!(detail.repairSource!), "finding-repair", detail.disabled);
  if (detail.pair && actions.compare) {
    evidence.createEl("p", { text: detail.pair.join(" ↔ "), cls: "veynrel-health-muted" });
    healthButton(evidence, t("@actions.compare"), () => actions.compare!(detail.id), "finding-compare", detail.disabled, true);
  }
  const notes = article.createEl("section");
  notes.createEl("h3", { text: t("@findings.affected") });
  notes.createEl("p", { text: detail.affectedSummary });
  if (detail.representativeSummary) notes.createEl("p", { text: detail.representativeSummary, cls: "veynrel-health-muted" });
  const paths = notes.createEl("ul", { cls: "veynrel-findings-paths" });
  for (const [index, path] of detail.notes.slice(0, expandedPaths ? detail.notes.length : 10).entries()) {
    healthButton(paths.createEl("li"), path, () => actions.openNote(path), `finding-note-${index}`).addClass("veynrel-quiet");
  }
  if (detail.notes.length > 10) {
    healthButton(notes, t(expandedPaths ? "@findings.show-less" : "@findings.show-all", { n: detail.notes.length }), actions.togglePaths, "finding-paths")
      .setAttribute("aria-expanded", String(expandedPaths));
  }
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
