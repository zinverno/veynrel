import { t } from "../../i18n";
import { formatSemanticScore } from "../../utils/semanticPresentation";
import type { ConnectionComparisonCategory, ConnectionComparisonPair, ConnectionComparisonPort, ConnectionComparisonProductSnapshot } from "../connectionComparisonPort";
import { healthButton, healthDetails } from "../ui/renderHealthHome";
import { candidateReviewSummary, filteredConnectionPairs, isExcalidrawPair, reviewCandidate, syncConnectionComparison } from "./connectionComparisonViewState";
import type { ConnectionComparisonViewState } from "./connectionComparisonViewState";
export { newConnectionComparisonViewState } from "./connectionComparisonViewState";

export function connectionComparisonStatus(snapshot: ConnectionComparisonProductSnapshot): string | undefined {
  if (snapshot.state === "loading") return t("@connections.loading");
  if (snapshot.reason) return t(`@connections.${snapshot.reason}`);
  return undefined;
}
function markdownText(pair: ConnectionComparisonPair): string {
  if (!pair.markdown) return t("@connections.no-markdown");
  if (pair.markdown.direction === "reciprocal") return t("@connections.reciprocal");
  const [from, to] = pair.markdown.direction === "left-to-right" ? [pair.leftBasename, pair.rightBasename] : [pair.rightBasename, pair.leftBasename];
  return `${t("@connections.markdown")}: ${from} → ${to}`;
}
function rankingText(pair: ConnectionComparisonPair): string {
  if (!pair.semantic) return t("@connections.outside-top-five");
  return t(`@connections.${pair.semantic.rankClass}`);
}
function rankDetails(pair: ConnectionComparisonPair): string[] {
  if (!pair.semantic) return [];
  return ([[pair.leftBasename, pair.semantic.leftRank], [pair.rightBasename, pair.semantic.rightRank]] as const).map(([note, rank]) =>
    rank === undefined ? t("@connections.not-ranked", { note }) : t("@connections.rank", { note, rank }));
}

/** Local filters and selection only. Note names/paths always use native text sinks. */
export function renderConnectionComparison(parent: HTMLElement, port: ConnectionComparisonPort, state: ConnectionComparisonViewState,
  actions: { back(): void; openNote(path: string): void; openPair?(left: string, right: string): void; explore(path: string): void; refresh?(): void }, embedded = false): void {
  const snapshot = port.getSnapshot(), comparison = snapshot.comparison;
  syncConnectionComparison(state, comparison);
  const section = parent.createEl("section", { cls: "veynrel-connections", attr: { "aria-label": t("@connections.title"), "aria-busy": String(snapshot.state === "loading") } });
  if (!embedded) healthButton(section, t("@global-map.back"), () => actions.back(), "connections-back").addClass("veynrel-quiet");
  section.createEl(embedded ? "h2" : "h1", { text: t("@connections.title"), attr: { tabindex: "-1", "data-health-heading": "true" } });
  section.createEl("p", { text: t("@connections.description"), cls: "veynrel-connections-lead" });
  const status = connectionComparisonStatus(snapshot);
  if (status) section.createEl("p", { text: status, cls: "veynrel-connections-status" });
  healthButton(section, t("@connections.refresh"), () => { if (actions.refresh) actions.refresh(); else void port.refresh(); }, "connections-refresh", snapshot.state === "loading").addClass("veynrel-quiet");
  if (!comparison) return;
  const overview = section.createDiv({ cls: "veynrel-connections-overview", attr: { role: "group", "aria-label": t("@connections.categories") } });
  const filterButtons = new Map<ConnectionComparisonCategory, HTMLButtonElement>();
  for (const [category, count] of [["candidate", comparison.candidateCount], ["aligned", comparison.alignedCount], ["explicit-only", comparison.explicitOnlyCount]] as const) {
    const button = healthButton(overview, "", () => {
      state.category = category; state.visibleLimit = 50; state.selectedPair = undefined; update();
    }, `connections-${category}`);
    button.addClass("veynrel-connections-count");
    button.createEl("strong", { text: String(count) }); button.createSpan({ text: t(`@connections.${category}`) });
    filterButtons.set(category, button);
  }
  const coverage = healthDetails(section, t("@connections.coverage"), "connections-coverage");
  coverage.addClass("veynrel-connections-coverage");
  const coverageMetrics = coverage.createEl("dl", { cls: "veynrel-connections-coverage-metrics" });
  for (const [key, count] of [["mapped", comparison.semanticMappedNoteCount], ["comparable", comparison.comparableNoteCount], ["semantic-pairs", comparison.semanticPairCount],
    ["unclassified", comparison.unclassifiedSemanticPairCount], ["explicit-outside", comparison.explicitOutsideSemanticMapCount], ["topology-notes", comparison.topologyNoteCount], ["unclassified-explicit", comparison.unclassifiedExplicitPairCount],
    ["missing-topology", comparison.semanticNotesMissingTopologyCount], ["unavailable-links", comparison.semanticNotesUnavailableLinksCount]] as const) {
    const item = coverageMetrics.createDiv(); item.createEl("dt", { text: t(`@connections.${key}`) }); item.createEl("dd", { text: String(count) });
  }
  if (comparison.unclassifiedSemanticPairCount || comparison.explicitOutsideSemanticMapCount || comparison.unclassifiedExplicitPairCount || comparison.semanticNotesMissingTopologyCount || comparison.semanticNotesUnavailableLinksCount) {
    section.createEl("p", { text: t("@connections.coverage-notice"), cls: "veynrel-health-muted" });
  }
  section.createEl("p", { text: t("@connections.exploratory"), cls: "veynrel-health-muted" });
  const filters = healthDetails(section, t("@ui.filters"), "connections-filters");
  filters.addClass("veynrel-connections-filter-details");
  const rankFilters = filters.createDiv({ cls: "veynrel-connections-filters veynrel-connections-secondary", attr: { role: "group", "aria-label": t("@connections.rank-filter") } });
  rankFilters.createSpan({ text: t("@connections.rank-filter") });
  const rankButtons = new Map<ConnectionComparisonViewState["rankFilter"], HTMLButtonElement>();
  for (const rank of ["all", "mutual-top-3", "mutual-top-5", "one-sided-top-5"] as const) {
    rankButtons.set(rank, healthButton(rankFilters, t(`@connections.${rank}`), () => {
      state.rankFilter = rank; state.visibleLimit = 50; update();
    }, `connections-rank-${rank}`));
  }
  const reviewSummary = filters.createEl("p", { cls: "veynrel-health-muted veynrel-connections-review-summary" });
  const reviewFilters = filters.createDiv({ cls: "veynrel-connections-filters veynrel-connections-secondary", attr: { role: "group", "aria-label": t("@connections.review-filter") } });
  reviewFilters.createSpan({ text: t("@connections.review-filter") });
  const reviewFilterButtons = new Map<ConnectionComparisonViewState["reviewFilter"], HTMLButtonElement>();
  for (const review of ["all", "unreviewed", "useful", "not-useful", "unsure"] as const) {
    reviewFilterButtons.set(review, healthButton(reviewFilters, t(`@connections.${review}`), () => {
      state.reviewFilter = review; state.visibleLimit = 50; update();
    }, `connections-review-filter-${review}`));
  }
  const specialFormat = filters.createEl("label", { cls: "veynrel-connections-special-format" });
  const hideExcalidraw = specialFormat.createEl("input", { type: "checkbox", attr: { "data-health-action": "connections-hide-excalidraw" } });
  hideExcalidraw.checked = state.hideExcalidraw;
  specialFormat.createSpan({ text: t("@connections.hide-excalidraw") });
  const hiddenCount = specialFormat.createSpan({ cls: "veynrel-health-muted" });
  hideExcalidraw.addEventListener("change", () => { state.hideExcalidraw = hideExcalidraw.checked; state.visibleLimit = 50; update(); });
  const search = section.createEl("label", { cls: "veynrel-connections-search" });
  search.createSpan({ text: t("@connections.search") });
  const input = search.createEl("input", { type: "search", attr: { "data-health-action": "connections-search" } }); input.value = state.query;
  const showing = section.createEl("p", { cls: "veynrel-health-muted", attr: { role: "status", "aria-live": "polite" } });
  const composition = section.createDiv({ cls: "veynrel-connections-composition" });
  const listing = composition.createDiv();
  const list = listing.createDiv({ cls: "veynrel-connections-list" });
  const more = healthButton(listing, t("@connections.show-more"), () => { state.visibleLimit += 50; update(); }, "connections-more");
  const inspector = composition.createEl("section", { cls: "veynrel-connections-inspector", attr: { "aria-label": t("@connections.inspector"), tabindex: "-1" } });
  const rowButtons = new Map<string, HTMLButtonElement>();
  const inspect = (): void => {
    inspector.empty();
    const pair = comparison.pairs.find(pair => pair.id === state.selectedPair);
    for (const [id, button] of rowButtons) button.setAttribute("aria-pressed", String(id === state.selectedPair));
    if (!pair) { inspector.createEl("h2", { text: t("@connections.inspector") }); inspector.createEl("p", { text: t("@connections.select") }); return; }
    inspector.createEl("p", { text: t(`@connections.${pair.category}`), cls: "veynrel-health-muted" });
    for (const [name, path] of [[pair.leftBasename, pair.leftPath], [pair.rightBasename, pair.rightPath]]) {
      inspector.createEl("h2", { text: name }); inspector.createEl("p", { text: path, cls: "veynrel-connections-path" });
    }
    inspector.createEl("h3", { text: t("@connections.semantic") });
    if (pair.semantic) {
      inspector.createEl("p", { text: `${t("@connections.similarity")} ${formatSemanticScore(pair.semantic.score)}` });
      for (const text of rankDetails(pair)) inspector.createEl("p", { text });
      inspector.createEl("p", { text: t("@connections.shared-neighbors", { count: pair.semantic.sharedNeighborPaths.length }) });
      const neighbors = inspector.createEl("ul");
      for (const path of pair.semantic.sharedNeighborPaths) neighbors.createEl("li", { text: path.split("/").pop()!.replace(/\.md$/i, ""), attr: { title: path } });
    }
    inspector.createEl("p", { text: rankingText(pair) });
    inspector.createEl("h3", { text: t("@connections.markdown-relationship") });
    inspector.createEl("p", { text: markdownText(pair) });
    if (pair.category === "candidate") {
      inspector.createEl("h3", { text: t("@connections.session-review") });
      const reviews = inspector.createDiv({ cls: "veynrel-connections-actions veynrel-annotations", attr: { role: "group", "aria-label": t("@connections.session-review") } });
      const setReview = (verdict?: "useful" | "not-useful" | "unsure"): void => {
        reviewCandidate(state, pair.id, verdict); update();
        inspector.querySelector<HTMLButtonElement>(`[data-health-action="connections-review-${verdict ?? "useful"}"]`)?.focus({ preventScroll: true });
      };
      for (const verdict of ["useful", "not-useful", "unsure"] as const) {
        const button = healthButton(reviews, t(`@connections.${verdict}`), () => setReview(verdict), `connections-review-${verdict}`);
        button.setAttribute("aria-pressed", String(state.reviewByPairId.get(pair.id) === verdict));
      }
      healthButton(reviews, t("@connections.clear-review"), () => setReview(), "connections-review-clear", !state.reviewByPairId.has(pair.id));
    }
    const buttons = inspector.createDiv({ cls: "veynrel-connections-note-actions" });
    if (actions.openPair) healthButton(buttons, t("@connections.open-pair"), () => actions.openPair!(pair.leftPath, pair.rightPath), "connections-open-pair").addClass("veynrel-quiet");
    for (const [side, path] of [["left", pair.leftPath], ["right", pair.rightPath]] as const) {
      healthButton(buttons, t(`@connections.open-${side}`), () => actions.openNote(path), `connections-open-${side}`);
      healthButton(buttons, t(`@connections.explore-${side}`), () => actions.explore(path), `connections-explore-${side}`, snapshot.state !== "ready").addClass("veynrel-quiet");
    }
  };
  const update = (): void => {
    for (const [category, button] of filterButtons) button.setAttribute("aria-pressed", String(category === state.category));
    filters.hidden = state.category === "explicit-only";
    filters.querySelector("summary")!.textContent = [t("@ui.filters"),
      ...(state.rankFilter !== "all" ? [t(`@connections.${state.rankFilter}`)] : []),
      ...(state.category === "candidate" && state.reviewFilter !== "all" ? [t(`@connections.${state.reviewFilter}`)] : []),
      ...(state.category === "candidate" && state.hideExcalidraw ? [t("@connections.hide-excalidraw")] : []),
    ].join(" · ");
    rankFilters.hidden = state.category === "explicit-only";
    reviewFilters.hidden = specialFormat.hidden = state.category !== "candidate";
    for (const [rank, button] of rankButtons) {
      button.setAttribute("aria-pressed", String(rank === state.rankFilter));
      const count = comparison.pairs.filter(pair => pair.category === state.category && (rank === "all" || pair.semantic?.rankClass === rank)).length;
      button.setText(`${t(`@connections.${rank}`)} (${count})`);
    }
    for (const [review, button] of reviewFilterButtons) button.setAttribute("aria-pressed", String(review === state.reviewFilter));
    const counts = candidateReviewSummary(state);
    reviewSummary.setText(`${t("@connections.session-review")}: ` + (["reviewed", "useful", "not-useful", "unsure"] as const)
      .map(key => `${t(`@connections.${key}`)} ${counts[key]}`).join(" · "));
    hiddenCount.setText(t("@connections.excalidraw-hidden", { count: state.hideExcalidraw ? comparison.pairs.filter(pair => pair.category === "candidate" && isExcalidrawPair(pair)).length : 0 }));
    const matches = filteredConnectionPairs(state);
    const visible = matches.slice(0, state.visibleLimit);
    showing.setText(t("@connections.showing", { shown: visible.length, total: matches.length }) + (state.category === "candidate" ? ` · ${t("@connections.reviewed")} ${counts.reviewed}` : ""));
    list.empty(); rowButtons.clear();
    visible.forEach((pair, index) => {
      const button = healthButton(list, "", () => { state.selectedPair = pair.id; inspect(); inspector.focus(); }, `connections-pair-${index}`);
      button.setAttribute("title", `${pair.leftPath} ↔ ${pair.rightPath}`);
      button.createEl("strong", { text: `${pair.leftBasename} ↔ ${pair.rightBasename}` });
      const metadata = button.createSpan({ cls: "veynrel-connections-row-meta" });
      if (pair.semantic) {
        const ranks = `#${pair.semantic.leftRank ?? "—"} ↔ #${pair.semantic.rightRank ?? "—"}`;
        metadata.createSpan({ text: `${t("@connections.similarity")} ${formatSemanticScore(pair.semantic.score)}` });
        metadata.createSpan({ text: ranks, attr: { title: rankDetails(pair).join(" · ") } });
        metadata.createSpan({ text: t("@connections.shared-neighbors", { count: pair.semantic.sharedNeighborPaths.length }) });
      } else metadata.createSpan({ text: rankingText(pair) });
      metadata.createSpan({ text: markdownText(pair) });
      const review = state.reviewByPairId.get(pair.id);
      if (pair.category === "candidate" && review) button.createSpan({ text: t(`@connections.${review}`), cls: "veynrel-connections-review-marker" });
      button.setAttribute("aria-label", [`${pair.leftBasename} ↔ ${pair.rightBasename}`,
        ...(pair.semantic ? [`${t("@connections.similarity")} ${formatSemanticScore(pair.semantic.score)}`, ...rankDetails(pair),
          t("@connections.shared-neighbors", { count: pair.semantic.sharedNeighborPaths.length })] : []),
        rankingText(pair), markdownText(pair), pair.category === "candidate" && review ? t(`@connections.${review}`) : ""].filter(Boolean).join(" · "));
      rowButtons.set(pair.id, button);
    });
    more.hidden = visible.length >= matches.length;
    if (more.hidden && more === more.ownerDocument.activeElement) input.focus({ preventScroll: true });
    inspect();
  };
  input.addEventListener("input", () => { state.query = input.value; state.visibleLimit = 50; update(); });
  update();
}
