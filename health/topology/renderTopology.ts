import { t } from "../../i18n";
import { healthButton } from "../ui/renderHealthHome";
import { renderTopologyMap } from "./renderTopologyMap";
import type { TopologyViewState } from "./renderTopologyMap";
import { searchTopology, topologyMetrics, topologyStatus, TOPOLOGY_LIST_LIMIT } from "./topologyPresentation";
import type { VaultTopologyPort, VaultTopologyProductSnapshot, VaultTopologySnapshot } from "./types";

function renderStatus(parent: HTMLElement, snapshot: VaultTopologyProductSnapshot): void {
  const status = topologyStatus(snapshot);
  if (!status) return;
  const context = parent.createDiv({ cls: "veynrel-topology-status", attr: { "data-topology-status": snapshot.state } });
  context.createEl("p", { text: status, cls: "veynrel-topology-status-label" });
  if (snapshot.map && !snapshot.map.complete) context.createEl("p", { text: t("@topology.partial-explanation"), cls: "veynrel-topology-partial", attr: { role: "note" } });
}
function renderMetrics(parent: HTMLElement, map: VaultTopologySnapshot): void {
  const metrics = parent.createEl("dl", { cls: "veynrel-topology-metrics" });
  for (const metric of topologyMetrics(map)) {
    const item = metrics.createDiv({ attr: { "data-unknown": String(typeof metric.value === "string") } });
    item.createEl("dt", { text: metric.label }); item.createEl("dd", { text: String(metric.value) });
  }
}
function renderEmpty(parent: HTMLElement, map: VaultTopologySnapshot): void {
  if (!map.noteCount) parent.createEl("p", { text: t("@topology.empty"), cls: "veynrel-topology-empty" });
  else if (!map.resolvedLinkCount) parent.createEl("p", { text: t(map.complete ? "@topology.no-links" : "@topology.no-observed-links"), cls: "veynrel-health-muted" });
}
function refreshButton(parent: HTMLElement, port: VaultTopologyPort, snapshot: VaultTopologyProductSnapshot, primary = false): void {
  healthButton(parent, t(snapshot.error ? "@topology.retry" : snapshot.map ? "@topology.refresh" : "@topology.load"),
    () => { void port.refresh(); }, "topology-refresh", snapshot.state === "loading", primary);
}

export function renderTopologyPreview(parent: HTMLElement, port: VaultTopologyPort, open: () => void): void {
  const snapshot = port.getSnapshot();
  const panel = parent.createEl("section", { cls: "veynrel-topology-preview" });
  const header = panel.createDiv({ cls: "veynrel-topology-toolbar" });
  header.createEl("h2", { text: t("@topology.title") });
  if (!snapshot.map) panel.createEl("p", { text: t("@topology.description") });
  renderStatus(panel, snapshot);
  if (snapshot.map) {
    renderMetrics(panel, snapshot.map); renderEmpty(panel, snapshot.map);
    if (snapshot.map.noteCount) {
      const preview = healthButton(panel, "", open, "topology-preview");
      preview.addClass("veynrel-topology-preview-map"); preview.setAttribute("aria-label", t("@topology.open"));
      renderTopologyMap(preview, snapshot.map);
    }
    healthButton(header, t("@topology.open"), open, "topology-open");
  }
  refreshButton(header, port, snapshot);
  panel.createEl("p", { text: t("@topology.private"), cls: "veynrel-health-muted veynrel-topology-private" });
}

export function renderTopology(parent: HTMLElement, port: VaultTopologyPort, state: TopologyViewState,
  actions: { back(): void; openNote(path: string): void }): () => void {
  const snapshot = port.getSnapshot();
  const section = parent.createEl("section", { cls: "veynrel-topology-detail" });
  healthButton(section, t("@topology.back"), () => actions.back(), "topology-back").addClass("veynrel-topology-back");
  const header = section.createEl("header", { cls: "veynrel-topology-header" });
  const title = header.createDiv({ cls: "veynrel-topology-heading" });
  title.createEl("h1", { text: t("@topology.title"), attr: { tabindex: "-1", "data-health-heading": "true" } });
  renderStatus(title, snapshot);
  if (!snapshot.map && snapshot.state === "idle") title.createEl("p", { text: t("@topology.description"), cls: "veynrel-health-muted" });
  refreshButton(header, port, snapshot, true);
  const map = snapshot.map;
  if (!map) return () => {};
  const content = section.createDiv({ cls: "veynrel-topology-content" });
  renderMetrics(content, map); renderEmpty(content, map);
  if (!map.noteCount) return () => {};
  const columns = content.createDiv({ cls: "veynrel-topology-columns" });
  const mapPanel = columns.createDiv({ cls: "veynrel-topology-map-panel" });
  const toolbar = mapPanel.createDiv({ cls: "veynrel-topology-map-toolbar" });
  const search = toolbar.createEl("label", { cls: "veynrel-topology-search" });
  search.createSpan({ text: t("@topology.search") });
  const input = search.createEl("input", { attr: { type: "search", "data-health-action": "topology-search", maxlength: "4096" } });
  input.value = state.query;
  const results = mapPanel.createDiv({ cls: "veynrel-topology-results" });
  const inspector = columns.createEl("aside", { cls: "veynrel-topology-inspector", attr: { "aria-label": t("@topology.inspector") } });
  const byPath = new Map(map.nodes.map((node) => [node.path, node]));
  const select = (path: string): void => {
    state.selected = path;
    const active = inspector.ownerDocument.activeElement;
    const hadFocus = active && inspector.contains(active);
    inspector.empty();
    const node = byPath.get(path); if (!node) return;
    const details = inspector.createDiv({ cls: "veynrel-topology-inspector-content" });
    const noteHeader = details.createEl("header", { cls: "veynrel-topology-note-header" });
    noteHeader.createEl("p", { text: t("@topology.inspector"), cls: "veynrel-topology-eyebrow" });
    const heading = noteHeader.createEl("h2", { text: node.basename, attr: { tabindex: "-1" } });
    noteHeader.createEl("p", { text: node.path, cls: "veynrel-topology-path" });
    healthButton(noteHeader, t("@health.open-note"), () => actions.openNote(node.path), "topology-open-note");
    const facts = details.createEl("dl", { cls: "veynrel-topology-facts" });
    const yesNo = (value: boolean): string => t(!map.complete ? "@topology.unknown" : value ? "@topology.yes" : "@topology.no");
    const fact = (label: string, value: string | number): void => {
      const item = facts.createDiv(); item.createEl("dt", { text: label }); item.createEl("dd", { text: String(value) });
    };
    fact(t("@topology.incoming"), node.incoming); fact(t("@topology.outgoing"), node.outgoing); fact(t("@topology.connections"), node.degree);
    fact(t(map.complete ? "@topology.component-size" : "@topology.observed-size"), map.components.find((component) => component.id === node.componentId)!.paths.length);
    fact(t("@topology.orphan"), yesNo(node.orphan)); fact(t("@topology.connector"), yesNo(node.connector));
    fact(t("@topology.unresolved"), node.linksAvailable ? node.unresolvedTargetCount : t("@topology.unknown"));
    fact(t("@topology.broken"), node.linksAvailable ? node.unresolvedOccurrenceCount : t("@topology.unknown"));
    if (!node.linksAvailable || !map.complete && node.degree === 0) details.createEl("p", { text: t("@topology.connections-unknown"), cls: "veynrel-health-muted" });
    const neighbors = (key: "incoming" | "outgoing", paths: string[]): void => {
      const group = details.createEl("section", { cls: "veynrel-topology-relationships" });
      group.createEl("h3", { text: t(`@topology.${key}-notes`, { n: paths.length }) });
      const list = group.createEl("ul");
      for (const [index, path] of paths.slice(0, TOPOLOGY_LIST_LIMIT).entries()) {
        healthButton(list.createEl("li"), path, () => renderer.select(path, true), `topology-${key}-${index}`);
      }
      if (paths.length > TOPOLOGY_LIST_LIMIT) group.createEl("p", { text: t("@topology.showing-items", { shown: TOPOLOGY_LIST_LIMIT, total: paths.length }) });
    };
    neighbors("incoming", map.edges.filter((edge) => edge.target === path).map((edge) => edge.source));
    neighbors("outgoing", map.edges.filter((edge) => edge.source === path).map((edge) => edge.target));
    const unresolved = details.createEl("section", { cls: "veynrel-topology-relationships" });
    unresolved.createEl("h3", { text: t("@topology.unresolved") });
    const broken = map.brokenTargets.flatMap((target) => {
      const source = target.sources.find((source) => source.path === path);
      return source ? [{ target: target.target, count: source.occurrences }] : [];
    });
    const list = unresolved.createEl("ul");
    for (const target of broken.slice(0, TOPOLOGY_LIST_LIMIT)) list.createEl("li", { text: `${target.target} (${target.count})` });
    if (broken.length > TOPOLOGY_LIST_LIMIT) unresolved.createEl("p", { text: t("@topology.showing-items", { shown: TOPOLOGY_LIST_LIMIT, total: broken.length }) });
    if (hadFocus) heading.focus();
  };
  const renderer = renderTopologyMap(mapPanel, map, state, select);
  healthButton(toolbar, t("@topology.fit"), renderer.fit, "topology-fit");
  const legend = mapPanel.createEl("details", { cls: "veynrel-topology-legend" });
  legend.createEl("summary", { text: t("@topology.legend-title") });
  legend.createEl("p", { text: t("@topology.legend") });
  if (state.selected && byPath.has(state.selected)) select(state.selected);
  else {
    state.selected = undefined;
    inspector.createEl("h2", { text: t("@topology.inspector") });
    inspector.createEl("p", { text: t("@topology.select"), cls: "veynrel-health-muted" });
  }
  const updateSearch = (): void => {
    state.query = input.value; results.empty();
    if (!state.query.trim()) return;
    const found = searchTopology(map.nodes, state.query);
    results.createEl("p", { text: t("@topology.showing-items", { shown: found.nodes.length, total: found.total }), attr: { role: "status" } });
    for (const [index, node] of found.nodes.entries()) healthButton(results, node.path, () => renderer.select(node.path, true), `topology-result-${index}`);
  };
  input.addEventListener("input", updateSearch); updateSearch();
  return () => { renderer.dispose(); input.removeEventListener("input", updateSearch); };
}
