import { t, currentLanguage } from "../../i18n";
import type { Finding } from "../domain/finding";
import { healthButton, healthDetails } from "../ui/renderHealthHome";
import { workspaceHeading } from "../workspace/renderWorkspaceHome";
import type { WorkbenchData, PairReviewPort } from "./workbenchData";
import { linkFact, pairId, reconcileWorkbenchSelection, workbenchLayout, workbenchModel } from "./workbenchModel";
import type { MapPoint, WorkbenchPair } from "./workbenchModel";
import { newWorkbenchGraphState, renderWorkbenchGraph } from "./workbenchGraph";

export interface WorkbenchActions {
  openNote(path: string): void;
  search(): void;
  settings(): void;
  history(): void;
  advanced(page: "topology" | "semantic-map" | "connection-opportunities" | "semantic-neighborhood"): void;
  similar(): void;
}

/** Browser state survives pair review. Consent and final tickets remain in disposable owners. */
export class WorkbenchView {
  readonly element: HTMLElement;
  private readonly browser: HTMLElement;
  private readonly review: HTMLElement;
  private stopReview?: () => void;
  private remove: () => void;
  private disposed = false;
  private generation = 0;
  private mode: "repeats" | "connections" | "notes" = "repeats";
  private query = "";
  private limit = 60;
  private showMap = true;
  private selected?: WorkbenchPair;
  private note?: string;
  private findings: readonly Finding[] = [];
  private graph = newWorkbenchGraphState();
  private points: readonly MapPoint[] = [];
  private geometryKey = "";
  private listScroll = 0;
  private pageScroll = 0;
  private language = currentLanguage();
  constructor(parent: HTMLElement, readonly data: WorkbenchData, private readonly pair: PairReviewPort, private readonly actions: WorkbenchActions,
    private readonly scrollOwner: HTMLElement) {
    this.element = parent.createDiv({ cls: "veynrel-workbench" });
    this.browser = this.element.createDiv(); this.review = this.element.createDiv({ cls: "veynrel-workbench-review" });
    this.review.hidden = true;
    this.remove = data.subscribe(() => this.render()); this.render();
  }
  update(findings: readonly Finding[]): void {
    this.findings = findings;
    if (this.language !== currentLanguage()) { this.language = currentLanguage(); this.suspend(); }
    this.render();
  }
  suspend(): void {
    this.generation++;
    this.stopReview?.(); this.stopReview = undefined; this.review.empty(); this.review.hidden = true; this.browser.hidden = false;
  }
  dispose(): void { this.disposed = true; this.generation++; this.suspend(); this.remove(); this.data.dispose(); }
  private render(): void {
    if (this.disposed || this.stopReview) return;
    const generation = ++this.generation, current = (): boolean => !this.disposed && generation === this.generation;
    const active = this.element.ownerDocument.activeElement as HTMLInputElement | null;
    const key = this.element.contains(active) ? active?.getAttribute("data-health-action") : undefined;
    const selection = key === "workbench-search" ? [active?.selectionStart ?? null, active?.selectionEnd ?? null] : undefined;
    const scroll = this.scrollOwner.scrollTop;
    this.listScroll = this.browser.querySelector(".veynrel-workbench-list")?.scrollTop ?? this.listScroll;
    this.browser.empty();
    const button = (parent: HTMLElement, label: string, action: () => void, id: string, disabled = false, primary = false): HTMLButtonElement =>
      healthButton(parent, label, () => { if (current()) action(); }, id, disabled, primary);
    const model = workbenchModel(this.data, this.findings.filter(finding => finding.state === "open"));
    const paths = new Set(model.nodes.map(node => node.path));
    this.selected = reconcileWorkbenchSelection(model, this.selected);
    if (this.note && !paths.has(this.note)) this.note = undefined;
    const geometryKey = JSON.stringify([model.nodes.map(node => node.path), model.edges]);
    if (geometryKey !== this.geometryKey) { this.geometryKey = geometryKey; this.points = workbenchLayout(model.nodes, model.edges); }
    workspaceHeading(this.browser, t("@workspace.map"), t("@workbench.description"));
    const modes = this.browser.createDiv({ cls: "veynrel-workbench-modes", attr: { role: "group", "aria-label": t("@workbench.scenarios") } });
    for (const mode of ["repeats", "connections", "notes"] as const) {
      const control = button(modes, t(`@workbench.${mode}`), () => { this.mode = mode; this.limit = 60; this.listScroll = 0; this.render(); }, `workbench-mode-${mode}`);
      control.setAttribute("aria-pressed", String(this.mode === mode));
    }
    const toolbar = this.browser.createDiv({ cls: "veynrel-workbench-toolbar" });
    const search = toolbar.createEl("input", { type: "search", attr: { placeholder: t("@workbench.search"), "aria-label": t("@workbench.search"), "data-health-action": "workbench-search" } });
    search.value = this.query;
    search.addEventListener("input", () => { if (current()) { this.query = search.value; this.limit = 60; this.render(); } });
    button(toolbar, t(this.showMap ? "@workbench.list-only" : "@workbench.list-map"), () => { this.showMap = !this.showMap; this.render(); }, "workbench-map-toggle").setAttribute("aria-pressed", String(this.showMap));
    button(toolbar, t("@workbench.refresh"), () => { void this.data.refresh(); }, "workbench-refresh", this.data.busy, true);
    const status = this.browser.createDiv({ cls: "veynrel-workbench-status", attr: { role: "status", "aria-live": "polite" } });
    status.createEl("p", { text: t(`@workbench.state.${this.data.duplicateState}`) });
    const semantic = this.data.semantic?.getSnapshot();
    if (semantic?.reason === "too-large") status.createEl("p", { text: t("@workbench.cap", { count: semantic.mappedNoteCount ?? 0, cap: semantic.supportedNoteCount }) });
    else if (semantic && semantic.state !== "ready") status.createEl("p", { text: t(`@workbench.map-state.${semantic.state}`) });
    if (this.data.duplicateState === "unavailable") button(status, t("@workbench.setup"), () => this.actions.settings(), "workbench-setup");
    if (!model.linksCurrent) status.createEl("p", { text: t("@workbench.links-not-current") });
    else if (!this.data.dependencies.topology.getSnapshot().map?.complete) status.createEl("p", { text: t("@workbench.links-partial") });
    const work = this.browser.createDiv({ cls: `veynrel-workbench-grid${this.showMap ? " with-map" : ""}` });
    const listPane = work.createEl("section", { cls: "veynrel-workbench-list-pane" });
    listPane.createEl("h2", { text: t(`@workbench.${this.mode}`) });
    const needle = this.query.trim().toLocaleLowerCase();
    const pairs = (this.mode === "connections" ? model.connections : model.repeats).filter(pair => pair.paths.some(path => path.toLocaleLowerCase().includes(needle)));
    const notes = model.nodes.filter(node => node.path.toLocaleLowerCase().includes(needle));
    const total = this.mode === "notes" ? notes.length : pairs.length;
    listPane.createEl("p", { text: t("@workbench.count", { count: total }), cls: "veynrel-data-note" });
    const list = listPane.createEl("ul", { cls: "veynrel-workbench-list", attr: { "aria-label": t(`@workbench.${this.mode}`) } });
    if (this.mode === "notes") {
      for (const node of notes.slice(0, this.limit)) {
        const row = list.createEl("li");
        const control = button(row, node.path, () => this.selectNote(node.path), `workbench-note-${encodeURIComponent(node.path)}`);
        control.setAttribute("aria-pressed", String(this.note === node.path || Boolean(this.selected?.paths.includes(node.path))));
        control.setAttribute("data-workbench-path", node.path);
        row.createEl("small", { text: t(node.semantic ? "@workbench.indexed" : "@workbench.semantic-unknown") });
      }
    } else for (const pair of pairs.slice(0, this.limit)) {
      const row = list.createEl("li");
      const control = button(row, `${pair.paths[0]} ↔ ${pair.paths[1]}`, () => { this.selected = pair; this.note = undefined; this.render(); this.focusSelection(); }, `workbench-pair-${encodeURIComponent(pair.id)}`);
      control.setAttribute("aria-pressed", String(this.selected?.id === pair.id)); control.setAttribute("data-workbench-pair", pair.id);
      row.createEl("small", { text: t(`@workbench.basis.${pair.basis}`) + (pair.score === undefined ? "" : ` · ${pair.score.toFixed(3)}`) });
    }
    if (!total) listPane.createEl("p", { text: t(this.query ? "@workbench.no-search" : this.mode === "notes" ? "@workbench.no-notes" :
      this.mode === "repeats" && this.data.duplicateState === "ready" ? "@workbench.no-candidates" : this.mode === "connections" && model.comparisonCurrent ? "@workbench.no-connections" : "@workbench.not-checked") });
    if (total > this.limit) button(listPane, t("@workbench.more"), () => { this.limit += 60; this.render(); }, "workbench-more");
    if (this.mode === "repeats") listPane.createEl("p", { text: t("@workbench.global-candidates"), cls: "veynrel-data-note" });
    if (this.mode === "connections") listPane.createEl("p", { text: t("@workbench.ranking"), cls: "veynrel-data-note" });
    list.scrollTop = this.listScroll;
    const selectedPaths: readonly string[] = this.selected?.paths ?? (this.note ? [this.note] : []);
    if (this.showMap) {
      const map = work.createEl("section", { cls: "veynrel-workbench-map-pane" });
      map.createEl("h2", { text: t("@workbench.map") });
      renderWorkbenchGraph(map, model, this.points, selectedPaths, this.graph, path => { if (current()) this.selectNote(path); }, () => { if (current()) this.render(); });
    }
    const detail = work.createEl("section", { cls: "veynrel-workbench-selection", attr: { tabindex: "-1", "data-workbench-selection": "true" } });
    detail.createEl("h2", { text: t(this.selected ? "@workbench.pair" : "@workbench.note") });
    if (!selectedPaths.length) detail.createEl("p", { text: t("@workbench.select") });
    for (const path of selectedPaths) {
      detail.createEl("p", { text: path, cls: "veynrel-workbench-path" });
      button(detail, t("@consolidation.open"), () => this.actions.openNote(path), `workbench-open-${encodeURIComponent(path)}`);
    }
    if (this.selected) {
      detail.createEl("p", { text: t(`@workbench.link.${linkFact(model, this.selected.paths)}`) });
      detail.createEl("p", { text: t(`@workbench.basis.${this.selected.basis}`) });
      detail.createEl("p", { text: t("@workbench.candidate-disclaimer") });
      button(detail, t("@workbench.compare"), () => this.openReview(), "workbench-compare", false, true);
    } else if (this.note) {
      const label = detail.createEl("label", { text: t("@workbench.second-note") });
      const picker = label.createEl("select", { attr: { "data-health-action": "workbench-second", "aria-label": t("@workbench.second-note") } });
      picker.createEl("option", { text: t("@workbench.choose"), attr: { value: "" } });
      for (const node of model.nodes) if (node.path !== this.note) picker.createEl("option", { text: node.path, attr: { value: node.path } });
      picker.addEventListener("change", () => {
        if (!current() || !this.note || !paths.has(picker.value)) return;
        const a = this.note, b = picker.value;
        this.selected = model.repeats.find(pair => pair.id === pairId(a,b)) ?? model.connections.find(pair => pair.id === pairId(a,b)) ?? { id: pairId(a,b), paths: [a,b].sort() as [string,string], basis: "selected" };
        this.note = undefined; this.render(); this.focusSelection();
      });
    }
    const external = model.external.filter(edge => selectedPaths.includes(edge.source) || selectedPaths.includes(edge.target));
    if (external.length) {
      const outside = healthDetails(detail, t("@workbench.external", { count: external.length }), "workbench-external");
      for (const edge of external) outside.createEl("p", { text: `${edge.source} → ${edge.target}` });
    }
    const footer = this.browser.createDiv({ cls: "veynrel-workbench-footer" });
    button(footer, t("@polish.explore.search"), () => {
      if (this.data.scope.id === "all") this.actions.search();
      else {
        const confirm = footer.createDiv({ cls: "veynrel-scope-handoff" });
        confirm.createEl("p", { text: t("@workbench.search-scope") });
        button(confirm, t("@workspace.continue"), () => this.actions.search(), "workbench-search-confirm");
      }
    }, "workbench-semantic-search");
    button(footer, t("@safeApply.history"), () => this.actions.history(), "workbench-history");
    const details = healthDetails(this.browser, t("@workbench.coverage"), "workbench-coverage");
    details.createEl("p", { text: t("@workbench.coverage-count", { notes: model.nodes.length, indexed: semantic?.indexedNoteCount ?? "—", mapped: semantic?.mappedNoteCount ?? "—" }) });
    details.createEl("p", { text: t("@workbench.coverage-meaning") });
    details.createEl("pre", { text: JSON.stringify({ scope: { id: this.data.scope.id, revision: this.data.scope.revision },
      semantic: semantic?.map?.revision, topology: this.data.dependencies.topology.getSnapshot().map?.revision,
      comparisonCurrent: model.comparisonCurrent, duplicateState: this.data.duplicateState, duplicateComplete: this.data.duplicates?.complete }, null, 2) });
    const advanced = healthDetails(this.browser, t("@workbench.advanced"), "workbench-advanced");
    for (const page of ["topology", "semantic-map", "connection-opportunities", "semantic-neighborhood"] as const)
      button(advanced, t(`@workbench.advanced.${page}`), () => this.actions.advanced(page), `workbench-advanced-${page}`);
    button(advanced, t("@workbench.similar"), () => this.actions.similar(), "workbench-similar");
    if (key) {
      const target = Array.from(this.browser.querySelectorAll<HTMLElement>("[data-health-action]")).find(element => element.getAttribute("data-health-action") === key);
      target?.focus({ preventScroll: true });
      if (selection && target?.tagName === "INPUT") (target as HTMLInputElement).setSelectionRange(selection[0], selection[1]);
    }
    this.scrollOwner.scrollTop = scroll;
  }
  private selectNote(path: string): void {
    const model = workbenchModel(this.data, this.findings);
    const candidates = this.mode === "connections" ? model.connections : model.repeats;
    const pair = this.mode !== "notes" ? candidates.find(pair => pair.paths.includes(path)) : undefined;
    this.selected = pair; this.note = pair ? undefined : path; this.render(); this.focusSelection();
  }
  private focusSelection(): void {
    const panel = this.browser.querySelector<HTMLElement>("[data-workbench-selection]");
    panel?.focus({ preventScroll: true });
    if (this.element.clientWidth < 760) panel?.scrollIntoView({ block: "start" });
  }
  private openReview(): void {
    if (!this.selected || this.stopReview || this.disposed) return;
    this.pageScroll = this.scrollOwner.scrollTop;
    this.browser.hidden = true; this.review.hidden = false; this.review.empty();
    const generation = ++this.generation;
    const back = healthButton(this.review, t("@workbench.back"), () => {
      if (!this.stopReview || generation !== this.generation) return;
      this.suspend(); this.render(); this.scrollOwner.scrollTop = this.pageScroll;
      this.browser.querySelector<HTMLElement>('[data-health-action="workbench-compare"]')?.focus({ preventScroll: true });
    }, "workbench-back");
    const content = this.review.createDiv();
    this.stopReview = this.pair.mount(content, this.selected.paths);
    back.focus(); this.scrollOwner.scrollTop = 0;
  }
}
