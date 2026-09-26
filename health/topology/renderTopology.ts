import { t } from "../../i18n";
import { healthButton } from "../ui/renderHealthHome";
import { renderTopologyMap } from "./renderTopologyMap";
import type { TopologyViewState } from "./renderTopologyMap";
import { searchTopology, topologyMetrics, topologyStatus, TOPOLOGY_LIST_LIMIT } from "./topologyPresentation";
import type { VaultTopologyPort, VaultTopologyProductSnapshot, VaultTopologySnapshot } from "./types";

function renderStatus(parent: HTMLElement, snapshot: VaultTopologyProductSnapshot): void {
  const status = topologyStatus(snapshot);
  if (status) parent.createEl("p", { text: status, cls: "veynrel-topology-status", attr: { "data-topology-status": snapshot.state } });
  if (snapshot.map && !snapshot.map.complete) parent.createEl("p", { text: t("@topology.partial-explanation"), cls: "veynrel-topology-partial", attr: { role: "note" } });
}
function renderMetrics(parent: HTMLElement, map: VaultTopologySnapshot): void {
  const metrics = parent.createEl("dl", { cls: "veynrel-topology-metrics" });
  for (const metric of topologyMetrics(map)) {
    const item = metrics.createDiv(); item.createEl("dt", { text: metric.label }); item.createEl("dd", { text: String(metric.value) });
  }
}
function renderEmpty(parent: HTMLElement, map: VaultTopologySnapshot): void {
  if (!map.noteCount) parent.createEl("p", { text: t("@topology.empty"), cls: "veynrel-topology-empty" });
  else if (!map.resolvedLinkCount) parent.createEl("p", { text: t(map.complete ? "@topology.no-links" : "@topology.no-observed-links"), cls: "veynrel-health-muted" });
}
function refreshButton(parent: HTMLElement, port: VaultTopologyPort, snapshot: VaultTopologyProductSnapshot): void {
  healthButton(parent, t(snapshot.error ? "@topology.retry" : snapshot.map ? "@topology.refresh" : "@topology.load"),
    () => { void port.refresh(); }, "topology-refresh", snapshot.state === "loading");
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
  section.createEl("h1", { text: t("@topology.title"), attr: { tabindex: "-1", "data-health-heading": "true" } });
  const toolbar = section.createDiv({ cls: "veynrel-topology-toolbar" });
  healthButton(toolbar, t("@topology.back"), () => actions.back(), "topology-back");
  refreshButton(toolbar, port, snapshot);
  renderStatus(section, snapshot);
  const map = snapshot.map;
  if (!map) return () => {};
  renderMetrics(section, map); renderEmpty(section, map);
  if (!map.noteCount) return () => {};
  const search = section.createEl("label", { cls: "veynrel-topology-search" });
  search.createSpan({ text: t("@topology.search") });
  const input = search.createEl("input", { attr: { type: "search", "data-health-action": "topology-search", maxlength: "4096" } });
  input.value = state.query;
  const results = section.createDiv({ cls: "veynrel-topology-results" });
  const columns = section.createDiv({ cls: "veynrel-topology-columns" });
  const mapPanel = columns.createDiv({ cls: "veynrel-topology-map-panel" });
  const inspector = columns.createEl("aside", { cls: "veynrel-topology-inspector", attr: { "aria-label": t("@topology.inspector") } });
  const byPath = new Map(map.nodes.map((node) => [node.path, node]));
  const select = (path: string): void => {
    state.selected = path;
    inspector.empty();
    const node = byPath.get(path); if (!node) return;
    inspector.createEl("h2", { text: node.basename });
    inspector.createEl("p", { text: node.path, cls: "veynrel-topology-path" });
    const facts = inspector.createEl("dl", { cls: "veynrel-topology-facts" });
    const yesNo = (value: boolean): string => t(!map.complete ? "@topology.unknown" : value ? "@topology.yes" : "@topology.no");
    const fact = (label: string, value: string | number): void => { facts.createEl("dt", { text: label }); facts.createEl("dd", { text: String(value) }); };
    fact(t("@topology.incoming"), node.incoming); fact(t("@topology.outgoing"), node.outgoing); fact(t("@topology.connections"), node.degree);
    fact(t(map.complete ? "@topology.component-size" : "@topology.observed-size"), map.components.find((component) => component.id === node.componentId)!.paths.length);
    fact(t("@topology.orphan"), yesNo(node.orphan)); fact(t("@topology.connector"), yesNo(node.connector));
    fact(t("@topology.unresolved"), node.linksAvailable ? node.unresolvedTargetCount : t("@topology.unknown"));
    fact(t("@topology.broken"), node.linksAvailable ? node.unresolvedOccurrenceCount : t("@topology.unknown"));
    if (!node.linksAvailable || !map.complete && node.degree === 0) inspector.createEl("p", { text: t("@topology.connections-unknown") });
    healthButton(inspector, t("@health.open-note"), () => actions.openNote(node.path), "topology-open-note");
    const neighbors = (key: "incoming" | "outgoing", paths: string[]): void => {
      inspector.createEl("h3", { text: t(`@topology.${key}-notes`, { n: paths.length }) });
      const list = inspector.createEl("ul");
      for (const [index, path] of paths.slice(0, TOPOLOGY_LIST_LIMIT).entries()) {
        healthButton(list.createEl("li"), path, () => renderer.select(path, true), `topology-${key}-${index}`);
      }
      if (paths.length > TOPOLOGY_LIST_LIMIT) inspector.createEl("p", { text: t("@topology.showing-items", { shown: TOPOLOGY_LIST_LIMIT, total: paths.length }) });
    };
    neighbors("incoming", map.edges.filter((edge) => edge.target === path).map((edge) => edge.source));
    neighbors("outgoing", map.edges.filter((edge) => edge.source === path).map((edge) => edge.target));
    inspector.createEl("h3", { text: t("@topology.unresolved") });
    const broken = map.brokenTargets.flatMap((target) => {
      const source = target.sources.find((source) => source.path === path);
      return source ? [{ target: target.target, count: source.occurrences }] : [];
    });
    const list = inspector.createEl("ul");
    for (const target of broken.slice(0, TOPOLOGY_LIST_LIMIT)) list.createEl("li", { text: `${target.target} (${target.count})` });
    if (broken.length > TOPOLOGY_LIST_LIMIT) inspector.createEl("p", { text: t("@topology.showing-items", { shown: TOPOLOGY_LIST_LIMIT, total: broken.length }) });
  };
  const renderer = renderTopologyMap(mapPanel, map, state, select);
  healthButton(toolbar, t("@topology.fit"), renderer.fit, "topology-fit");
  mapPanel.createEl("p", { text: t("@topology.legend"), cls: "veynrel-topology-legend" });
  if (state.selected && byPath.has(state.selected)) select(state.selected);
  else { state.selected = undefined; inspector.createEl("p", { text: t("@topology.select") }); }
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
