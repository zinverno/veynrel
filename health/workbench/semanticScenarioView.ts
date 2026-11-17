import { FuzzySuggestModal, setIcon, type App, type TFile } from "obsidian";
import { t } from "../../i18n";
import { formatSemanticScore } from "../../utils/semanticPresentation";
import type { SemanticIntelligencePort } from "../semanticIntelligencePort";
import type { SemanticGlobalMapProductSnapshot } from "../semanticGlobalMapPort";
import type { SemanticNeighborhoodMap } from "../semanticNeighborhoodPort";
import { sameSemanticIndexRevision } from "../semanticHealthAnalysisPort";
import { healthButton } from "../ui/renderHealthHome";
import { globalSemanticMapStatus } from "../ui/renderSemanticGlobalMap";
import { neighborhoodStatus } from "../ui/renderSemanticNeighborhood";
import { renderConnectionComparison, newConnectionComparisonViewState } from "../connections/renderConnectionComparison";
import { semanticFamilies } from "./workbenchFamilies";
import { WorkbenchView } from "./workbenchView";
import { distinctSemanticPair, semanticEntryScope, type SemanticEntry, type SemanticIntent } from "./semanticEntry";
import type { PairReviewPort, WorkbenchData } from "./workbenchData";

interface Context {
  entry: SemanticEntry; query: string; limit: number; scroll: number; focus?: string;
  neighborhood?: SemanticNeighborhoodMap; focusSnapshot?: SemanticGlobalMapProductSnapshot;
}
interface Actions { back(): void; settings(): void; openNote(path: string): void; history(): void }

/** Seven entry surfaces over existing view-owned projections. Opening never computes or selects a recent editor. */
export class SemanticScenarioView {
  readonly element: HTMLElement;
  private context: Context;
  private readonly history: Context[] = [];
  private readonly sources = new Map<string, TFile>();
  private readonly comparison = newConnectionComparisonViewState();
  private map?: WorkbenchView;
  private mapHost?: HTMLElement;
  private stopReview?: () => void;
  private remove: () => void;
  private disposed = false;
  private suspended = false;
  private epoch = 0;
  private transitioning = false;
  private error = false;
  private reviewOpen = false;
  private mapEntry?: SemanticEntry;
  constructor(private readonly app: App, parent: HTMLElement, readonly data: WorkbenchData,
    private readonly pair: PairReviewPort, private readonly semantic: SemanticIntelligencePort | undefined,
    entry: SemanticEntry, private readonly actions: Actions, private readonly scrollOwner: HTMLElement) {
    this.element = parent.createDiv({ cls: "veynrel-semantic-scenario" });
    this.context = this.newContext(entry);
    this.remove = data.subscribe(() => this.render());
    this.render();
  }
  private newContext(entry: SemanticEntry): Context {
    for (const path of [entry.sourcePath, ...(entry.pairPaths ?? [])]) {
      const file = path && this.app.vault.getFileByPath(path);
      if (file && !this.sources.has(path)) this.sources.set(path, file);
    }
    return { entry, query: "", limit: 40, scroll: 0 };
  }
  private valid(path?: string): path is string {
    return !!path && this.sources.has(path) && this.app.vault.getFileByPath(path) === this.sources.get(path);
  }
  update(): void { this.suspended = false; this.render(); }
  suspend(): void {
    this.saveContext(); this.suspended = true; this.epoch++;
    this.stopReview?.(); this.stopReview = undefined; this.reviewOpen = false;
    if (this.map) this.map.suspend(); else this.data.cancel();
  }
  dispose(): void { this.suspend(); this.disposed = true; this.remove(); if (this.map) this.map.dispose(); else this.data.dispose(); }
  private saveContext(): void {
    this.context.scroll = this.scrollOwner.scrollTop;
    const active = this.element.ownerDocument.activeElement;
    if (active && this.element.contains(active)) this.context.focus = active.getAttribute("data-health-action") ?? undefined;
  }
  private go(intent: SemanticIntent, extra: Partial<SemanticEntry> = {}): void {
    if (this.disposed) return;
    this.saveContext(); this.history.push(this.context); this.transitioning = true; this.epoch++; this.data.cancel(); this.map?.suspend();
    this.context = this.newContext({ ...this.context.entry, intent, ...extra }); this.error = false; this.transitioning = false;
    this.render(); this.scrollOwner.scrollTop = 0;
    this.element.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
  }
  private back(): void {
    if (this.reviewOpen) {
      this.stopReview?.(); this.stopReview = undefined; this.reviewOpen = false;
    } else {
      const previous = this.history.pop();
      if (!previous) { this.actions.back(); return; }
      this.transitioning = true; this.epoch++; this.data.cancel(); this.map?.suspend(); this.context = previous; this.transitioning = false;
    }
    this.render(); this.scrollOwner.scrollTop = this.context.scroll;
    Array.from(this.element.querySelectorAll<HTMLElement>("[data-health-action]")).find(el => el.getAttribute("data-health-action") === this.context.focus)?.focus({ preventScroll: true });
  }
  private button(parent: HTMLElement, label: string, run: () => void, id: string, disabled = false): HTMLButtonElement {
    const context = this.context;
    return healthButton(parent, label, () => { if (!this.disposed && !this.suspended && this.context === context) run(); }, id, disabled);
  }
  private choose(slot?: 0 | 1): void {
    const context = this.context;
    const paths = semanticEntryScope(context.entry.intent) === "requested" ? new Set(this.data.scope.paths) : undefined;
    const other = slot === undefined ? undefined : context.entry.pairPaths?.[slot === 0 ? 1 : 0];
    const files = this.app.vault.getMarkdownFiles().filter(file => (!paths || paths.has(file.path)) && file.path !== other);
    const choose = (file: TFile): void => {
      if (this.disposed || this.suspended || this.context !== context || this.app.vault.getFileByPath(file.path) !== file) return;
      this.sources.set(file.path, file);
      if (slot === undefined) this.go(context.entry.intent, { sourcePath: file.path });
      else {
        this.transitioning = true; this.epoch++; this.data.cancel();
        const pair: [string, string] = [...(context.entry.pairPaths ?? ["", ""])]; pair[slot] = file.path;
        this.context.entry = { ...context.entry, pairPaths: pair }; this.transitioning = false; this.render();
      }
    };
    new class extends FuzzySuggestModal<TFile> {
      getItems(): TFile[] { return files; }
      getItemText(file: TFile): string { return file.path; }
      onChooseItem(file: TFile): void { choose(file); }
    }(this.app).open();
  }
  private async compute(): Promise<void> {
    const context = this.context, epoch = ++this.epoch, { intent, sourcePath } = context.entry;
    const current = (): boolean => !this.disposed && !this.suspended && epoch === this.epoch && context === this.context;
    if (["focus", "neighborhood", "similar"].includes(intent) && !this.valid(sourcePath)) return;
    this.error = false;
    try {
      if (intent === "families") { await this.data.dependencies.rules?.load(); await this.data.dependencies.rules?.refreshFolders(); this.data.dependencies.tags?.refresh(); }
      if (!current()) return;
      await this.data.dependencies.prepareExisting?.();
      if (!current()) return;
      if (intent === "families") await this.data.semantic?.refresh();
      else if (intent === "opportunities") await this.data.globalComparison?.refresh();
      else if (intent === "focus") {
        const port = this.data.globalSemantic;
        await port?.refresh();
        if (current() && this.valid(sourcePath) && port?.getSnapshot().state === "ready") {
          await port.focus(sourcePath);
          if (current()) context.focusSnapshot = port.getSnapshot();
        }
      } else if (sourcePath) {
        await this.data.neighborhood?.load(sourcePath);
        if (current()) context.neighborhood = this.data.neighborhood?.getSnapshot().map;
      }
    } catch { if (current()) this.error = true; }
    if (current()) this.render();
  }
  private source(parent: HTMLElement): void {
    const path = this.context.entry.sourcePath;
    const bar = parent.createDiv({ cls: "veynrel-semantic-source" });
    setIcon(bar.createSpan({ attr: { "aria-hidden": "true" } }), "file-text");
    bar.createEl("strong", { text: path ?? t("@routes.choose") });
    this.button(bar, t(path ? "@routes.change" : "@routes.choose"), () => this.choose(), "semantic-source");
    if (!this.valid(path)) this.state(parent, "source-missing", t(path ? "@routes.source-gone" : "@routes.source-required"));
  }
  private state(parent: HTMLElement, state: string, text: string): void {
    parent.createDiv({ cls: "veynrel-semantic-state", text, attr: { "data-semantic-state": state, role: "status" } });
  }
  private search(parent: HTMLElement): void {
    const input = parent.createEl("input", { type: "search", attr: { "aria-label": t("@workbench.search"), placeholder: t("@workbench.search"), "data-health-action": "semantic-result-search" } });
    input.value = this.context.query;
    input.addEventListener("input", () => { this.context.query = input.value; this.context.limit = 40; this.render(); });
  }
  private render(): void {
    if (this.disposed || this.suspended || this.transitioning || this.reviewOpen) return;
    const active = this.element.ownerDocument.activeElement as HTMLInputElement | null;
    const focus = active && this.element.contains(active) ? active.getAttribute("data-health-action") : undefined;
    const caret = focus === "semantic-result-search" ? active?.selectionStart : undefined;
    const scroll = this.scrollOwner.scrollTop;
    if (this.context.entry.intent === "map" && this.mapEntry === this.context.entry && this.mapHost?.isConnected) return;
    this.element.empty(); this.element.setAttribute("data-semantic-intent", this.context.entry.intent);
    this.button(this.element, "← " + t(this.history.length ? "@routes.back" : "@ux.semantic"), () => this.back(), "semantic-back");
    const { intent } = this.context.entry;
    const key = intent === "pair" ? "notes" : intent;
    const header = this.element.createDiv({ cls: "veynrel-semantic-heading" });
    header.createEl("h1", { text: t(`@followup.semantic.${key}`), attr: { tabindex: "-1", "data-health-heading": "true" } });
    header.createEl("small", { text: semanticEntryScope(intent) === "global" ? t("@routes.global") : this.data.scope.id === "all" ? t("@workspace.all") : this.data.scope.id.replace(/^folder:/u, "") });
    if (intent === "pair") this.renderPair();
    else if (intent === "map") this.renderMap();
    else {
      if (["neighborhood", "similar", "focus"].includes(intent)) this.source(this.element);
      const ready = this.semantic?.getSnapshot().state === "ready";
      if (!ready) {
        this.state(this.element, "no-index", t("@routes.no-index"));
        this.button(this.element, t("@workbench.setup"), this.actions.settings, "semantic-setup");
        this.button(this.element, t("@routes.load-existing"), () => { void this.compute(); }, "semantic-load-existing", ["focus", "neighborhood", "similar"].includes(intent) && !this.valid(this.context.entry.sourcePath));
      } else if (!["focus", "neighborhood", "similar"].includes(intent) || this.valid(this.context.entry.sourcePath)) {
        if (intent === "families") this.renderFamilies();
        else if (intent === "focus") this.renderFocus();
        else if (intent === "opportunities") this.renderOpportunities();
        else this.renderNeighbors(intent === "similar");
      }
    }
    if (this.error) this.state(this.element, "error", t("@routes.error"));
    if (focus) Array.from(this.element.querySelectorAll<HTMLElement>("[data-health-action]")).find(el => el.getAttribute("data-health-action") === focus)?.focus({ preventScroll: true });
    if (caret !== undefined) { const input = this.element.querySelector<HTMLInputElement>("[data-health-action=semantic-result-search]"); input?.setSelectionRange(caret ?? 0, caret ?? 0); }
    this.scrollOwner.scrollTop = scroll;
  }
  private renderMap(): void {
    if (!this.map) {
      this.mapHost = this.element.createDiv({ cls: "veynrel-semantic-map-host" });
      this.map = new WorkbenchView(this.mapHost, this.data, this.pair, {
        openNote: this.actions.openNote, settings: this.actions.settings, history: this.actions.history,
        search: () => this.semantic?.openSearch(), similar: () => this.go("similar"),
        advanced: page => this.go(page === "semantic-map" ? "focus" : page === "connection-opportunities" ? "opportunities" : page === "semantic-neighborhood" ? "neighborhood" : "map"),
      }, this.scrollOwner);
      this.map.showSemantic(false);
    } else { this.element.appendChild(this.mapHost!); this.map.update([]); }
    if (this.mapEntry !== this.context.entry) {
      if (this.context.entry.familyId) this.map.showFamily(this.context.entry.familyId);
      if (this.valid(this.context.entry.sourcePath)) this.map.selectPaths([this.context.entry.sourcePath]);
      this.mapEntry = this.context.entry;
    }
  }
  private renderPair(): void {
    const paths = this.context.entry.pairPaths ?? ["", ""];
    const grid = this.element.createDiv({ cls: "veynrel-semantic-pair" });
    for (const slot of [0, 1] as const) {
      const panel = grid.createEl("section", { cls: "veynrel-semantic-panel" });
      panel.createEl("h2", { text: t("@routes.note", { slot: slot === 0 ? "A" : "B" }) });
      panel.createEl("p", { text: paths[slot] || t("@routes.choose") });
      this.button(panel, t("@routes.choose"), () => this.choose(slot), `semantic-pair-${slot}`);
      if (paths[slot] && !this.valid(paths[slot])) this.state(panel, "source-missing", t("@routes.source-gone"));
    }
    this.button(this.element, t("@review.compare"), () => this.openPair(paths), "semantic-compare", !distinctSemanticPair(paths) || !paths.every(path => this.valid(path)));
  }
  private openPair(paths: readonly string[]): void {
    if (!distinctSemanticPair(paths) || !paths.every(path => this.valid(path)) || this.reviewOpen) return;
    this.saveContext(); this.reviewOpen = true; this.epoch++; this.data.cancel();
    this.element.empty(); this.button(this.element, "← " + t("@routes.back"), () => this.back(), "semantic-pair-back");
    this.stopReview = this.pair.mount(this.element.createDiv(), paths, () => { if (!this.disposed && !this.suspended) this.back(); });
    this.scrollOwner.scrollTop = 0; this.element.querySelector<HTMLElement>("[data-pair-heading]")?.focus();
  }
  private compare(left: string, right: string): void {
    for (const path of [left, right]) { const file = this.app.vault.getFileByPath(path); if (file) this.sources.set(path, file); }
    this.openPair([left, right]);
  }
  private renderFamilies(): void {
    const snapshot = this.data.semantic?.getSnapshot(), projection = semanticFamilies(snapshot);
    this.button(this.element, t("@review.refresh"), () => { void this.compute(); }, "semantic-compute", snapshot?.busy);
    if (!projection) { this.state(this.element, snapshot?.reason === "too-large" ? "cap-refused" : snapshot?.state ?? "idle", snapshot ? globalSemanticMapStatus(snapshot) ?? t("@routes.uncomputed") : t("@routes.uncomputed")); return; }
    if (!projection.families.length) { this.state(this.element, "empty", t("@r062.family-empty")); return; }
    this.search(this.element);
    const grid = this.element.createDiv({ cls: "veynrel-semantic-families" });
    const list = grid.createDiv({ cls: "veynrel-semantic-panel" });
    const matches = projection.families.filter(f => f.paths.some(p => p.toLowerCase().includes(this.context.query.toLowerCase())));
    for (const [index, family] of matches.entries()) this.button(list, t("@routes.family", { n: index + 1 }) + ` · ${family.paths.length}`, () => { this.context.entry = { ...this.context.entry, familyId: family.id }; this.render(); }, `semantic-family-${index}`).setAttribute("aria-pressed", String(this.context.entry.familyId === family.id));
    const family = projection.families.find(f => f.id === this.context.entry.familyId);
    const detail = grid.createDiv({ cls: "veynrel-semantic-panel" });
    detail.createEl("p", { text: t("@r062.family-limits") });
    if (!family) { detail.createEl("p", { text: t("@routes.choose-family") }); return; }
    detail.setAttribute("data-semantic-family", family.id);
    this.button(detail, t("@routes.on-map"), () => this.go("map", { familyId: family.id }), "semantic-family-map");
    for (const path of family.paths) {
      const row = detail.createDiv({ cls: "veynrel-semantic-row" });
      this.button(row, path, () => this.actions.openNote(path), `semantic-member-${encodeURIComponent(path)}`);
      const overlaps = projection.families.filter(f => f !== family && f.paths.includes(path)).length;
      if (overlaps) row.createEl("small", { text: t("@routes.overlaps", { count: overlaps }) });
      this.button(row, t("@routes.on-map"), () => this.go("map", { familyId: family.id, sourcePath: path }), `semantic-member-map-${encodeURIComponent(path)}`);
    }
    detail.createEl("p", { text: t("@r062.family-method") });
    const basis = detail.createEl("details"); basis.createEl("summary", { text: t("@r062.family-basis") });
    for (const edge of family.relationships) basis.createEl("p", { text: `${edge.left} ↔ ${edge.right} · ${formatSemanticScore(edge.score)}` });
  }
  private renderNeighbors(similar: boolean): void {
    const port = this.data.neighborhood, snapshot = port?.getSnapshot(), source = this.context.entry.sourcePath!;
    this.button(this.element, t("@review.refresh"), () => { void this.compute(); }, "semantic-compute", snapshot?.busy);
    const cached = this.context.neighborhood;
    const map = snapshot?.map?.source.path === source ? snapshot.map : cached;
    const stale = !!map && (snapshot?.state === "stale" || snapshot?.map && !sameSemanticIndexRevision(map.revision, snapshot.map.revision));
    const status = snapshot && neighborhoodStatus(snapshot);
    if (status || stale) this.state(this.element, stale ? "stale" : snapshot?.state ?? "idle", status ?? t("@routes.stale"));
    if (!map) { if (!status) this.state(this.element, "idle", t("@routes.uncomputed")); return; }
    this.context.neighborhood = map;
    if (!map.neighbors.length) this.state(this.element, "empty", t("@neighborhood.empty"));
    const list = this.element.createDiv({ cls: "veynrel-semantic-panel" });
    for (const node of map.neighbors) {
      const row = list.createEl("article", { cls: "veynrel-semantic-row", attr: { "data-neighbor-path": node.path } });
      const head = row.createDiv({ cls: "veynrel-semantic-row-heading" });
      head.createEl("strong", { text: node.path }); head.createSpan({ text: formatSemanticScore(node.similarity!) });
      if (!similar) for (const evidence of node.evidence) {
        if (evidence.preview !== undefined) row.createEl("blockquote", { text: evidence.preview });
        row.createEl("small", { text: [evidence.headingPath.join(" › "), t("@neighborhood.fragment-meta", { start: evidence.startLine + 1, end: evidence.endLine + 1, score: formatSemanticScore(evidence.score) })].filter(Boolean).join(" · ") });
      }
      const actions = row.createDiv({ cls: "veynrel-semantic-row-actions" });
      this.button(actions, t("@neighborhood.open-note"), () => this.actions.openNote(node.path), `semantic-open-${encodeURIComponent(node.path)}`);
      this.button(actions, t("@review.compare"), () => this.compare(source, node.path), `semantic-compare-${encodeURIComponent(node.path)}`, stale);
      this.button(actions, t("@neighborhood.explore"), () => this.go("neighborhood", { sourcePath: node.path }), `semantic-explore-${encodeURIComponent(node.path)}`, stale);
    }
    if (similar) this.button(this.element, t("@routes.fragments"), () => this.go("neighborhood", { sourcePath: source }), "semantic-fragments");
  }
  private renderFocus(): void {
    const current = this.data.globalSemantic?.getSnapshot(), source = this.context.entry.sourcePath!;
    if (current?.focus?.path === source) this.context.focusSnapshot = current;
    const cached = this.context.focusSnapshot;
    const snapshot = current?.focus?.path === source || !cached ? current : { ...cached, state: current?.state === "stale" || !sameSemanticIndexRevision(current?.map?.revision, cached.map?.revision) ? "stale" as const : cached.state };
    this.button(this.element, t("@routes.compute-focus"), () => { void this.compute(); }, "semantic-compute", snapshot?.busy);
    if (!snapshot) { this.state(this.element, "no-index", t("@routes.no-index")); return; }
    const focus = snapshot.focus?.path === source ? snapshot.focus : undefined;
    const scores = (focus?.scores.filter(score => score.path !== source) ?? []).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    const eligible = snapshot.map ? snapshot.map.nodes.filter(n => n.path !== source).length : undefined;
    const matches = scores.filter(s => s.path.toLowerCase().includes(this.context.query.toLowerCase()));
    this.state(this.element, snapshot.reason === "too-large" ? "cap-refused" : snapshot.state, snapshot.state === "ready" && focus && !snapshot.focusing ? t("@routes.focus-ready") : globalSemanticMapStatus(snapshot) ?? t("@routes.uncomputed"));
    const metrics = this.element.createEl("p", { attr: { "data-focus-counts": "" }, text: t("@routes.focus-counts", { eligible: eligible ?? "—", computed: scores.length, displayed: Math.min(matches.length, this.context.limit) }) });
    if (snapshot.reason === "too-large") metrics.createEl("small", { text: t("@workbench.cap", { count: snapshot.indexedNoteCount ?? "—", cap: snapshot.supportedNoteCount }) });
    if (!focus) return;
    this.search(this.element);
    const list = this.element.createDiv({ cls: "veynrel-semantic-panel" });
    const topology = this.data.dependencies.topology.getSnapshot();
    for (const score of matches.slice(0, this.context.limit)) {
      const row = list.createDiv({ cls: "veynrel-semantic-row", attr: { "data-focus-path": score.path } });
      row.createEl("strong", { text: score.path }); row.createSpan({ text: formatSemanticScore(score.score) });
      const known = topology.state === "ready" && [source, score.path].every(p => topology.map?.nodes.find(n => n.path === p)?.linksAvailable);
      const linked = topology.map?.edges.some(e => e.source === source && e.target === score.path || e.source === score.path && e.target === source);
      row.createEl("small", { text: t(!known ? "@routes.links-unknown" : linked ? "@routes.link-observed" : "@routes.link-absent") });
      this.button(row, t("@review.compare"), () => this.compare(source, score.path), `semantic-compare-${encodeURIComponent(score.path)}`, snapshot.state !== "ready");
    }
    list.createEl("p", { text: t("@routes.showing", { shown: Math.min(matches.length, this.context.limit), total: matches.length }) });
    if (matches.length > this.context.limit) this.button(list, t("@workbench.more"), () => { this.context.limit += 40; this.render(); }, "semantic-more");
  }
  private renderOpportunities(): void {
    const port = this.data.globalComparison;
    if (!port) { this.state(this.element, "no-index", t("@routes.no-index")); return; }
    if (port.getSnapshot().state === "idle") this.state(this.element, "idle", t("@routes.uncomputed"));
    renderConnectionComparison(this.element, port, this.comparison, { back: () => this.back(), openNote: this.actions.openNote,
      openPair: (left, right) => this.compare(left, right), explore: sourcePath => this.go("neighborhood", { sourcePath }), refresh: () => { void this.compute(); } }, true);
  }
}
