import { semanticGraphLabel, semanticGraphBasename } from "./semanticGraphLabel";
import { t } from "../../i18n";
import { formatSemanticScore } from "../../utils/semanticPresentation";
import type { SemanticNeighborhoodMap, SemanticNeighborhoodNode, SemanticNeighborhoodPort, SemanticNeighborhoodProductSnapshot } from "../semanticNeighborhoodPort";
import { healthButton } from "./renderHealthHome";
import { semanticNeighborhoodLayout, semanticNeighborhoodRadius } from "./semanticNeighborhoodLayout";

export interface SemanticNeighborhoodViewState { query: string; selected?: string; map?: SemanticNeighborhoodMap; focusAction?: "neighborhood-search" | "neighborhood-select-0" }
export function neighborhoodStatus(snapshot: SemanticNeighborhoodProductSnapshot): string | undefined {
  if (snapshot.state === "preparing") return t("@neighborhood.preparing");
  if (snapshot.state === "loading") return t("@neighborhood.loading");
  if (snapshot.state === "stale") return t(snapshot.reason === "changed" ? "@neighborhood.changed" : "@neighborhood.stale");
  if (snapshot.state === "unavailable") return t(`@neighborhood.${snapshot.reason ?? "unavailable"}`);
  if (snapshot.state === "error") return t(`@neighborhood.${snapshot.reason ?? "failed"}`);
  return undefined;
}

/** All note text, including stored previews, uses native text sinks. */
export function renderSemanticNeighborhood(parent: HTMLElement, port: SemanticNeighborhoodPort, state: SemanticNeighborhoodViewState,
  actions: { returnTo?: "discover" | "semantic-map" | "connection-opportunities"; back(): void; openNote(path: string): void }, embedded = false): void {
  const snapshot = port.getSnapshot();
  const section = parent.createEl("section", { cls: "veynrel-neighborhood", attr: { "aria-label": t("@neighborhood.title"), "aria-busy": String(snapshot.busy) } });
  if (!embedded) healthButton(section, t(actions.returnTo === "connection-opportunities" ? "@connections.back-comparison" : actions.returnTo === "semantic-map" ? "@neighborhood.back-global" : "@neighborhood.back"), () => actions.back(), "neighborhood-back").addClass("veynrel-quiet");
  const header = section.createDiv({ cls: "veynrel-neighborhood-header" });
  header.createEl(embedded ? "h2" : "h1", { text: t("@neighborhood.title"), attr: { tabindex: "-1", "data-health-heading": "true" } });
  if (!snapshot.map) header.createEl("p", { text: t("@neighborhood.description") });
  const status = neighborhoodStatus(snapshot);
  if (status) section.createEl("p", { text: status, cls: "veynrel-neighborhood-status" });
  const controls = section.createDiv({ cls: "veynrel-neighborhood-actions" });
  if (snapshot.sourcePath || snapshot.map) healthButton(controls, t("@neighborhood.choose-another"), () => { state.query = ""; state.focusAction = "neighborhood-search"; port.chooseAnother(); }, "neighborhood-choose", snapshot.busy);
  if (snapshot.state !== "choosing") healthButton(controls, t(snapshot.state === "error" ? "@neighborhood.retry" : "@neighborhood.refresh"), () => { void port.refresh(); }, "neighborhood-refresh", snapshot.busy).addClass("veynrel-quiet");
  if (snapshot.state === "choosing") {
    section.createEl("h2", { text: t("@neighborhood.choose") });
    section.createEl("p", { text: t("@neighborhood.indexed-count", { count: snapshot.indexedNoteCount }) });
    const label = section.createEl("label", { cls: "veynrel-neighborhood-search" });
    label.createSpan({ text: t("@neighborhood.search") });
    const input = label.createEl("input", { type: "search", attr: { "data-health-action": "neighborhood-search" } });
    input.value = state.query;
    const results = section.createDiv({ cls: "veynrel-neighborhood-sources" });
    const showResults = (): void => {
      results.empty(); const matches = port.searchSources(state.query);
      const count = results.createEl("p", { text: t("@neighborhood.showing", { shown: matches.paths.length, total: matches.total }),
        cls: "veynrel-health-muted", attr: { "aria-live": "polite", "aria-atomic": "true" } });
      count.setAttribute("role", "status");
      matches.paths.forEach((path, index) => healthButton(results, path, () => { state.focusAction = "neighborhood-select-0"; void port.load(path); }, `neighborhood-source-${index}`, snapshot.busy));
    };
    input.addEventListener("input", () => { state.query = input.value; showResults(); }); showResults();
    return;
  }
  const map = snapshot.map;
  if (!map) return;
  if (state.map !== map) { state.map = map; state.selected = map.source.id; }
  section.createEl("p", { text: t("@neighborhood.current-source", { path: map.source.path }), cls: "veynrel-neighborhood-path" });
  const metrics = section.createEl("dl", { cls: "veynrel-neighborhood-metrics" });
  for (const [label, value] of [["indexed", map.indexedNoteCount], ["neighbors", map.neighbors.length]] as const) {
    const metric = metrics.createDiv(); metric.createEl("dt", { text: t(`@neighborhood.${label}`) }); metric.createEl("dd", { text: String(value) });
  }
  const composition = section.createDiv({ cls: "veynrel-neighborhood-composition" });
  const visual = composition.createDiv({ cls: "veynrel-neighborhood-visual" });
  const inspector = composition.createEl("section", { cls: "veynrel-neighborhood-inspector", attr: { "aria-label": t("@neighborhood.selection") } });
  const nodes = [map.source, ...map.neighbors];
  const positions = embedded ? [] : semanticNeighborhoodLayout(map.source, map.neighbors);
  const buttons = new Map<string, HTMLButtonElement>();
  const circles = new Map<string, SVGElement>();
  const select = (node: SemanticNeighborhoodNode): void => {
    state.selected = node.id;
    for (const [id, button] of buttons) button.setAttribute("aria-pressed", String(id === node.id));
    for (const [id, circle] of circles) circle.setAttribute("data-selected", String(id === node.id));
    inspector.empty();
    inspector.createEl("p", { text: t(node.role === "source" ? "@neighborhood.source" : "@neighborhood.neighbor"), cls: "veynrel-health-muted" });
    inspector.createEl("h2", { text: node.basename });
    inspector.createEl("p", { text: node.path, cls: "veynrel-neighborhood-path" });
    if (node.role === "source") inspector.createEl("p", { text: t("@neighborhood.neighbors-count", { count: map.neighbors.length }) });
    else {
      const score = inspector.createDiv({ cls: "veynrel-neighborhood-score" });
      score.createSpan({ text: t("@neighborhood.similarity") }); score.createEl("strong", { text: formatSemanticScore(node.similarity!) });
      inspector.createEl("h3", { text: t("@neighborhood.evidence") });
      inspector.createEl("p", { text: t("@neighborhood.evidence-description"), cls: "veynrel-health-muted" });
      for (const evidence of node.evidence) {
        const fragment = inspector.createDiv({ cls: "veynrel-neighborhood-evidence" });
        if (evidence.headingPath.length) fragment.createEl("h4", { text: evidence.headingPath.join(" › ") });
        if (evidence.preview !== undefined) fragment.createEl("p", { text: evidence.preview });
        fragment.createEl("p", { text: t("@neighborhood.fragment-meta", { start: evidence.startLine + 1, end: evidence.endLine + 1, score: formatSemanticScore(evidence.score) }), cls: "veynrel-health-muted" });
      }
    }
    const actionsEl = inspector.createDiv({ cls: "veynrel-neighborhood-actions" });
    healthButton(actionsEl, t("@neighborhood.open-note"), () => actions.openNote(node.path), "neighborhood-open-note");
    if (node.role === "neighbor") healthButton(actionsEl, t("@neighborhood.explore"), () => { state.focusAction = "neighborhood-select-0"; void port.load(node.path); }, "neighborhood-explore", snapshot.busy || snapshot.state !== "ready");
  };
  if (!embedded && map.neighbors.length) {
    const svg = visual.createSvg("svg", { cls: "veynrel-neighborhood-svg", attr: { viewBox: "0 0 1000 1000", "aria-hidden": "true", focusable: "false" } });
    // Fixed reference rings, no thresholds or force physics. Distance alone encodes score.
    for (const score of [1, 0, -1]) svg.createSvg("circle", { cls: "veynrel-neighborhood-guide", attr: { cx: "500", cy: "500", r: String(semanticNeighborhoodRadius(score)) } });
    for (const position of positions.slice(1)) svg.createSvg("line", { cls: "veynrel-neighborhood-edge", attr: { x1: "500", y1: "500", x2: String(position.x), y2: String(position.y) } });
    for (const node of nodes) {
      const position = positions.find((p) => p.id === node.id)!;
      const group = svg.createSvg("g", { cls: "veynrel-neighborhood-node", attr: { "data-neighborhood-node": node.id, "data-role": node.role, "data-label-rank": String(map.neighbors.findIndex((n) => n.id === node.id) + 1) } });
      group.createSvg("title").textContent = node.path;
      // Comfortable pointer target; keyboard equivalents are real buttons below.
      group.createSvg("circle", { cls: "veynrel-neighborhood-hit", attr: { cx: String(position.x), cy: String(position.y), r: "40" } });
      group.createSvg("circle", { cls: "veynrel-neighborhood-dot", attr: { cx: String(position.x), cy: String(position.y), r: node.role === "source" ? "25" : "18" } });
      if (node.role === "source") group.createSvg("circle", { cls: "veynrel-neighborhood-source-ring", attr: { cx: "500", cy: "500", r: "35" } });
      const labelPosition = semanticGraphLabel(position, node.role === "source" ? 35 : 18);
      const space = labelPosition.anchor === "start" ? 980 - labelPosition.x : labelPosition.anchor === "end" ? labelPosition.x - 20 : 300;
      group.createSvg("text", { cls: "veynrel-neighborhood-label", attr: { x: String(labelPosition.x), y: String(labelPosition.y),
        "text-anchor": labelPosition.anchor, "dominant-baseline": "middle" } }).textContent = semanticGraphBasename(node.basename, Math.max(3, Math.min(22, Math.floor(space / 13))));
      group.addEventListener("click", () => select(node)); circles.set(node.id, group);
    }
    visual.createEl("p", { text: t("@neighborhood.legend"), cls: "veynrel-neighborhood-legend" });
  } else if (!map.neighbors.length) visual.createEl("p", { text: t("@neighborhood.empty"), cls: "veynrel-neighborhood-empty" });
  const list = visual.createDiv({ cls: "veynrel-neighborhood-list", attr: { "aria-label": t("@neighborhood.neighbors") } });
  nodes.forEach((node, index) => {
    const button = healthButton(list, "", () => select(node), `neighborhood-select-${index}`);
    button.setAttribute("title", node.path);
    button.setAttribute("aria-label", node.path);
    button.createSpan({ text: node.basename });
    button.createSpan({ text: node.role === "source" ? t("@neighborhood.source") : formatSemanticScore(node.similarity!) });
    buttons.set(node.id, button);
  });
  select(nodes.find((node) => node.id === state.selected) ?? map.source);
}
