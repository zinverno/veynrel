import { t } from "../../i18n";
import { formatSemanticScore } from "../../utils/semanticPresentation";
import type { SemanticGlobalMapPort, SemanticGlobalMapProductSnapshot } from "../semanticGlobalMapPort";
import { healthButton, healthDetails } from "./renderHealthHome";
import { fitGraph } from "./graphViewport";
import { renderSemanticGlobalMapGraph } from "./renderSemanticGlobalMapGraph";
import { semanticScoreSummary } from "./semanticGlobalMapLayout";
import type { SemanticGlobalMapViewState } from "./renderSemanticGlobalMapGraph";

export function globalSemanticMapStatus(snapshot: SemanticGlobalMapProductSnapshot): string | undefined {
  if (snapshot.state === "loading") return snapshot.progress ? t("@global-map.comparing", { completed: snapshot.progress.completedPairs, total: snapshot.progress.totalPairs }) : t("@global-map.loading");
  if (snapshot.state === "stale") return t("@global-map.changed") + ". " + t("@global-map.stale");
  if (snapshot.reason) return t(`@global-map.${snapshot.reason}`, { n: snapshot.supportedNoteCount });
  if (snapshot.focusError) return t("@global-map.focus-failed");
  if (snapshot.focusing) return t("@global-map.focusing");
  if (snapshot.focus) return t("@global-map.centered", { note: snapshot.map!.nodes.find((node) => node.path === snapshot.focus!.path)!.basename });
  return undefined;
}
export function renderSemanticGlobalMap(parent: HTMLElement, port: SemanticGlobalMapPort, state: SemanticGlobalMapViewState,
  actions: { back(): void; openNote(path: string): void; explore(path: string): void; selectNote?(path: string): void }, embedded = false): () => void {
  const snapshot = port.getSnapshot();
  const section = parent.createEl("section", { cls: "veynrel-global-map", attr: { "aria-label": t("@global-map.title"), "aria-busy": String(snapshot.busy) } });
  if (!embedded) healthButton(section, t("@global-map.back"), () => actions.back(), "global-map-back").addClass("veynrel-quiet");
  section.createEl(embedded ? "h2" : "h1", { text: t(embedded ? "@r062b.semantic-title" : "@global-map.title"), attr: { tabindex: "-1", "data-health-heading": "true" } });

  const status = embedded && snapshot.focusError ? t("@r062b.focus-error") : globalSemanticMapStatus(snapshot);
  if (status && !(snapshot.state === "ready" && snapshot.focus && !snapshot.focusing && !snapshot.focusError)) section.createEl("p", { text: status, cls: "veynrel-global-map-status" });
  const map = snapshot.map;
  const focus = snapshot.focus;
  const focusScores = new Map(focus?.scores.map((item) => [item.path, item.score]));
  const metrics = section.createEl("dl", { cls: "veynrel-global-map-metrics" });
  for (const [label, value] of [["indexed", map?.indexedNoteCount ?? snapshot.indexedNoteCount], ["mapped", embedded ? map?.mappedNoteCount ?? (snapshot.state === "idle" ? undefined : 0) : map?.mappedNoteCount ?? snapshot.mappedNoteCount]] as const) {
    if (value === undefined) continue;
    const item = metrics.createDiv(); item.createEl("dt", { text: t(embedded && label === "mapped" ? "@r062b.computed" : `@global-map.${label}`) }); item.createEl("dd", { text: String(value) });
  }
  if (map) for (const [key, scores] of [[focus ? "selected-similarity" : "similarity", focus ? focus.scores.filter((item) => item.path !== focus.path).map((item) => item.score) : map.nodes.map((node) => node.coreSimilarity)], ["connectedness", map.nodes.map((node) => node.semanticConnectedness)]] as const) {
    const summary = semanticScoreSummary(scores);
    const item = metrics.createDiv({ cls: "veynrel-global-map-summary" });
    item.createEl("dt", { text: t(`@global-map.${key}`) });
    item.createEl("dd", { text: summary ? t("@global-map.score-summary", { min: formatSemanticScore(summary.min), max: formatSemanticScore(summary.max), median: formatSemanticScore(summary.median) }) : t("@global-map.no-neighbors") });
  }
  const controls = section.createDiv({ cls: "veynrel-global-map-actions" });
  healthButton(controls, t(embedded ? "@r062b.compute-global" : "@global-map.refresh"), () => { void port.refresh(); }, "global-map-refresh", snapshot.busy).addClass("veynrel-quiet");
  if (!map) return () => {};
  if (state.map !== map) { state.map = map; state.viewport = fitGraph(); if (!map.nodes.some((node) => node.path === state.selected)) state.selected = undefined; }
  const search = controls.createEl("label", { cls: "veynrel-global-map-search" });
  search.createSpan({ text: t("@global-map.search") });
  const input = search.createEl("input", { type: "search", attr: { "data-health-action": "global-map-search" } }); input.value = state.query;
  const results = section.createDiv({ cls: "veynrel-global-map-results" });
  const composition = section.createDiv({ cls: "veynrel-global-map-composition" });
  const visual = composition.createDiv({ cls: "veynrel-global-map-visual" });
  const context = visual.createDiv({ cls: "veynrel-global-map-context" });
  context.createEl("h2", { text: focus ? t(embedded ? "@r062b.focus-selected" : "@global-map.centered", { note: map.nodes.find(node => node.path === focus.path)!.basename }) : t("@global-map.similarity") });
  if (!embedded) context.createEl("p", { cls: "veynrel-global-map-scale", text: t(focus ? "@global-map.focus-radial-scale" : "@global-map.radial-scale") });
  if (focus) healthButton(context, t(embedded ? "@r062b.focus-reset" : "@global-map.reset-focus"), () => {
    state.focusAction = state.selected ? "global-map-focus" : "global-map-search"; port.resetFocus();
  }, "global-map-reset-focus").addClass("veynrel-quiet");
  const inspector = composition.createEl("section", { cls: "veynrel-global-map-inspector", attr: { "aria-label": t("@global-map.selection"), tabindex: "-1" } });
  const nodes = new Map(map.nodes.map((node) => [node.path, node]));
  const inspect = (path?: string): void => {
    const heldFocus = inspector.contains(inspector.ownerDocument.activeElement);
    inspector.empty();
    const node = nodes.get(path ?? "");
    if (!node) { inspector.createEl("h2", { text: t("@global-map.selection") }); inspector.createEl("p", { text: t("@global-map.select") }); return; }
    inspector.createEl("h2", { text: node.basename });
    inspector.createEl("p", { text: node.path, cls: "veynrel-global-map-path" });
    const facts = inspector.createEl("dl", { cls: "veynrel-global-map-facts" });
    for (const [key, score] of [[focus ? "focus-similarity" : "similarity", focus ? focusScores.get(node.path)! : node.coreSimilarity], ["connectedness", node.semanticConnectedness]] as const) {
      if (key === "focus-similarity" && node.path === focus?.path) continue;
      const item = facts.createDiv(); item.createEl("dt", { text: t(embedded && key === "focus-similarity" ? "@r062b.focus-similarity" : `@global-map.${key}`) });
      item.createEl("dd", { text: score === null ? t("@global-map.no-neighbors") : formatSemanticScore(score) });
    }
    inspector.createEl("h3", { text: t("@global-map.nearest") });
    const list = inspector.createDiv({ cls: "veynrel-global-map-neighbors" });
    node.neighbors.forEach((neighbor, i) => {
      const button = healthButton(list, "", () => graph.select(neighbor.path, true), `global-map-neighbor-${i}`);
      button.setAttribute("title", neighbor.path); button.setAttribute("aria-label", `${neighbor.path} · ${formatSemanticScore(neighbor.score)}`);
      button.createSpan({ text: nodes.get(neighbor.path)!.basename }); button.createSpan({ text: formatSemanticScore(neighbor.score) });
    });
    const buttons = inspector.createDiv({ cls: "veynrel-global-map-actions" });
    healthButton(buttons, t("@global-map.open-note"), () => actions.openNote(node.path), "global-map-open-note");
    healthButton(buttons, t("@global-map.explore"), () => actions.explore(node.path), "global-map-explore", snapshot.busy || snapshot.state !== "ready");
    healthButton(buttons, t(embedded ? "@r062b.focus-action" : "@global-map.focus"), () => { void port.focus(node.path); }, "global-map-focus", snapshot.busy || snapshot.state !== "ready");
    if (heldFocus) inspector.focus({ preventScroll: true });
  };
  const graph = embedded ? {
    select: (path: string, _focus?: boolean): void => { state.selected = path; inspect(path); actions.selectNote?.(path); },
    zoom: (_factor: number): void => {}, reset: (): void => {}, fit: (): void => {}, dispose: (): void => {},
  } : renderSemanticGlobalMapGraph(visual, map, state, inspect, focus);
  if (!embedded) {
  healthButton(controls, t("@global-map.zoom-in"), () => graph.zoom(1.5), "global-map-zoom-in").addClass("veynrel-quiet");
  healthButton(controls, t("@global-map.zoom-out"), () => graph.zoom(1 / 1.5), "global-map-zoom-out").addClass("veynrel-quiet");
  healthButton(controls, t("@global-map.reset-view"), graph.reset, "global-map-reset-view").addClass("veynrel-quiet");
  healthButton(controls, t("@global-map.fit"), graph.fit, "global-map-fit").addClass("veynrel-quiet");
  }
  inspect(state.selected);
  const legend = healthDetails(visual, t("@global-map.relationships"), "global-map-legend");
  legend.addClass("veynrel-global-map-legend");
  for (const key of embedded ? ["connectedness-description", "core-description"] : [focus ? "focus-distance-legend" : "distance-legend", "size-legend", "connectedness-description", "edge-legend", "selected-legend", focus ? "focus-description" : "core-description"]) legend.createEl("p", { text: t(`@global-map.${key}`) });
  const showResults = (): void => {
    results.empty();
    if (!state.query.trim()) return;
    const matches = port.search(state.query);
    results.createEl("p", { text: t("@global-map.showing", { shown: matches.nodes.length, total: matches.total }), attr: { role: "status", "aria-live": "polite" } });
    matches.nodes.forEach((node, i) => {
      healthButton(results, node.path, () => graph.select(node.path, true), `global-map-result-${i}`);
    });
  };
  input.addEventListener("input", () => { state.query = input.value; showResults(); }); showResults();
  return graph.dispose;
}
