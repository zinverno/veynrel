import { t } from "../../i18n";
import { healthButton } from "../ui/renderHealthHome";
import { renderTopology } from "../topology/renderTopology";
import { newTopologyViewState } from "../topology/renderTopologyMap";
import { renderSemanticGlobalMap } from "../ui/renderSemanticGlobalMap";
import { newSemanticGlobalMapViewState } from "../ui/renderSemanticGlobalMapGraph";
import { renderSemanticNeighborhood } from "../ui/renderSemanticNeighborhood";
import type { SemanticNeighborhoodViewState } from "../ui/renderSemanticNeighborhood";
import { renderConnectionComparison, newConnectionComparisonViewState } from "../connections/renderConnectionComparison";
import type { WorkbenchData } from "./workbenchData";

export type WorkbenchInspector = "topology" | "semantic-map" | "semantic-neighborhood" | "connection-opportunities";

/** Presentation state only. Each global computation belongs to this WorkbenchData, not the shared topology. */
export class WorkbenchInspectors {
  panel?: WorkbenchInspector;
  private topology = newTopologyViewState();
  private semantic = newSemanticGlobalMapViewState();
  private neighborhood: SemanticNeighborhoodViewState = { query: "" };
  private connections = newConnectionComparisonViewState();
  private source?: string;
  private stop?: () => void;
  constructor(private readonly data: WorkbenchData, private readonly changed: () => void,
    private readonly actions: { openNote(path: string): void; selectNote(path: string): void; openPair(left: string, right: string): void }) {}

  supports(panel: WorkbenchInspector): boolean {
    return panel === "topology" || Boolean(panel === "semantic-map" ? this.data.global : panel === "semantic-neighborhood" ? this.data.neighborhood : this.data.globalComparison);
  }
  open(panel: WorkbenchInspector, path?: string): void {
    if (!this.supports(panel)) return;
    this.panel = panel;
    if (path) { this.source = path; this.topology.selected = path; this.semantic.selected = path; }
    this.changed();
  }
  unmount(): void { this.stop?.(); this.stop = undefined; }
  render(parent: HTMLElement): void {
    this.unmount();
    if (!this.panel) return;
    const panel = parent.createEl("section", { cls: "veynrel-workbench-inspector", attr: { "data-workbench-inspector": this.panel } });
    const controls = panel.createDiv({ cls: "veynrel-workbench-toolbar" });
    healthButton(controls, t("@r062b.close"), () => { this.panel = undefined; this.changed(); }, "workbench-inspector-close");
    panel.createEl("p", { text: t("@r062b.global-scope"), cls: "veynrel-health-muted" });
    const actions = { ...this.actions, back: (): void => { this.panel = undefined; this.changed(); },
      explore: (path: string): void => this.open("semantic-neighborhood", path) };
    if (this.panel === "topology") this.stop = renderTopology(panel, this.data.dependencies.topology, this.topology, actions, true);
    if (this.panel === "semantic-map" && this.data.global) {
      panel.createEl("p", { text: t("@r062b.focus-contract") });
      this.stop = renderSemanticGlobalMap(panel, this.data.global, this.semantic, actions, true);
    }
    if (this.panel === "semantic-neighborhood" && this.data.neighborhood) {
      const port = this.data.neighborhood;
      if (this.source) healthButton(controls, t("@r062b.load-source", { path: this.source }), () => { void port.load(this.source!); }, "workbench-load-neighborhood", port.getSnapshot().busy);
      renderSemanticNeighborhood(panel, port, this.neighborhood, actions, true);
    }
    if (this.panel === "connection-opportunities" && this.data.globalComparison) {
      panel.createEl("p", { text: t("@r062b.global-opportunities") });
      renderConnectionComparison(panel, this.data.globalComparison, this.connections, actions, true);
    }
    if (this.data.global?.getSnapshot().busy || this.data.neighborhood?.getSnapshot().busy || this.data.globalComparison?.getSnapshot().state === "loading") {
      healthButton(controls, t("@r062b.cancel"), () => this.data.cancel(), "workbench-inspector-cancel");
      panel.createEl("small", { text: t("@r062b.cancel-scope") });
    }
  }
}
