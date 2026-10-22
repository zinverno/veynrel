import type { ReviewDecision } from "./reviewDecisionsPort";
import { currentLanguage, t } from "../../i18n";
import type { Finding } from "../domain/finding";
import { healthButton, healthDetails } from "../ui/renderHealthHome";
import type { PairReviewPort, WorkbenchData } from "./workbenchData";
import { workbenchModel } from "./workbenchModel";
import type { WorkbenchPair } from "./workbenchModel";

interface OptionalMap { update(findings: readonly Finding[]): void; dispose(): void }
interface ReviewActions {
  history(): void; settings(): void;
  map(parent: HTMLElement): OptionalMap;
}

/** List navigation has no graphical dependencies. Each pair owns fresh consent and tickets. */
export class ReviewListView {
  readonly element: HTMLElement;
  private readonly browser: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly remove: () => void;
  private readonly removeDecisions?: () => void;
  private decision?: ReviewDecision;
  private decisionError = false;
  private restoring?: string;
  private reviewedOpen = false;
  private readonly facts?: import("./reviewFacts").ReviewFactsPort;
  private closeRules?: () => void;
  private stopReview?: () => void;
  private map?: OptionalMap;
  private findings: readonly Finding[] = [];
  private mode: "repeats" | "connections" = "repeats";
  private query = "";
  private limit = 60;
  private selected?: WorkbenchPair;
  private previousConnections: readonly WorkbenchPair[] = [];
  private scroll = 0;
  private generation = 0;
  private disposed = false;
  private suspended = false;
  private language = currentLanguage();
  constructor(parent: HTMLElement, readonly data: WorkbenchData, private readonly pair: PairReviewPort,
    private readonly actions: ReviewActions, private readonly scrollOwner: HTMLElement) {
    this.element = parent.createDiv({ cls: "veynrel-review" });
    this.browser = this.element.createDiv({ cls: "veynrel-review-list" });
    this.detail = this.element.createDiv({ cls: "veynrel-review-detail" });
    this.detail.hidden = true;
    this.facts = pair.localFacts?.(() => this.render());
    this.remove = data.subscribe(() => this.render());
    this.removeDecisions = pair.decisions?.subscribe(() => this.render());
    void data.dependencies.rules?.load().catch(() => {});
    void pair.decisions?.load().catch(() => {});
    this.render();
  }
  update(findings: readonly Finding[]): void {
    if (this.disposed) return;
    if (this.language !== currentLanguage()) { this.suspend(); this.language = currentLanguage(); }
    this.suspended = false;
    this.findings = findings;
    if (this.map) this.map.update(findings); else this.render();
  }
  inheritNavigation(previous?: ReviewListView): void {
    if (!previous) return;
    this.mode = previous.mode; this.query = previous.query; this.limit = previous.limit;
    this.selected = previous.selected?.paths.every(path => this.data.scope.paths.includes(path)) ? previous.selected : undefined;
    this.render();
  }
  suspend(): void {
    this.suspended = true; this.generation++;
    this.closeRules?.(); this.closeRules = undefined;
    this.stopReview?.(); this.stopReview = undefined;
    this.map?.dispose(); this.map = undefined;
    this.detail.empty(); this.detail.hidden = true; this.browser.hidden = false;
  }
  dispose(): void { this.suspend(); this.disposed = true; this.remove(); this.removeDecisions?.(); this.facts?.dispose(); this.data.dispose(); }
  private back(): void {
    this.suspend(); this.suspended = false; this.facts?.refresh(); this.render();
    this.scrollOwner.scrollTop = this.scroll;
    const target = Array.from(this.browser.querySelectorAll<HTMLElement>("[data-pair-id]")).find(el => el.getAttribute("data-pair-id") === this.selected?.id);
    (target ?? this.browser.querySelector<HTMLElement>("[data-decision-undo], [data-review-heading]"))?.focus({ preventScroll: true });
  }
  private openPair(pair: WorkbenchPair): void {
    if (this.stopReview || this.disposed) return;
    this.selected = pair; this.scroll = this.scrollOwner.scrollTop; this.generation++;
    this.browser.hidden = true; this.detail.hidden = false; this.detail.empty();
    const generation = this.generation;
    healthButton(this.detail, t("@review.back"), () => { if (generation === this.generation) this.back(); }, "review-back");
    this.detail.createEl("p", { text: t(`@review.origin.${pair.basis}`), cls: "veynrel-review-basis" });
    this.stopReview = this.pair.mount(this.detail.createDiv(), pair.paths, decision => {
      if (this.disposed || generation !== this.generation) return;
      this.decision = decision; this.decisionError = false; this.back();
    });
    this.scrollOwner.scrollTop = 0;
    this.detail.querySelector<HTMLElement>("[data-pair-heading]")?.focus({ preventScroll: true });
  }
  private async restoreDecision(id: string): Promise<void> {
    if (this.restoring || !this.pair.decisions) return;
    this.restoring = id; this.decisionError = false; this.render();
    try {
      await this.pair.decisions.restore(id);
      if (this.decision?.id === id) this.decision = undefined;
      this.facts?.refresh();
    } catch { this.decisionError = true; }
    finally { this.restoring = undefined; this.render(); }
  }
  private basis(pair: WorkbenchPair): string {
    return t(pair.basis === "duplicate" && this.data.duplicateState !== "ready" ? "@review.old-result" : `@review.basis.${pair.basis}`);
  }
  private render(): void {
    if (this.disposed || this.suspended || this.stopReview || this.map) return;
    const generation = ++this.generation;
    const current = (): boolean => !this.disposed && !this.suspended && generation === this.generation;
    const active = this.element.ownerDocument.activeElement as HTMLInputElement | null;
    const focusKey = this.browser.contains(active) ? active?.getAttribute("data-health-action") : undefined;
    const searching = focusKey === "review-search";
    const caret = searching ? [active?.selectionStart, active?.selectionEnd] : undefined;
    const scroll = this.scrollOwner.scrollTop;
    this.browser.empty();
    const button = (parent: HTMLElement, label: string, action: () => void, id: string, disabled = false, primary = false) =>
      healthButton(parent, label, () => { if (current()) action(); }, id, disabled, primary);
    this.browser.createEl("h1", { text: t("@review.title"), attr: { tabindex: "-1", "data-review-heading": "true" } });
    this.browser.createEl("p", { text: t("@review.description") });
    if (this.decision && this.pair.decisions?.list().some(r => r.id === this.decision!.id)) {
      const notice = this.browser.createDiv({ cls: "veynrel-review-status veynrel-review-toolbar", attr: { role: "status", "data-review-decision-saved": "" } });
      notice.createSpan({ text: t("@decision.saved") });
      const undo = button(notice, t("@decision.undo"), () => { void this.restoreDecision(this.decision!.id); }, "review-undo-decision", !!this.restoring);
      undo.setAttribute("data-decision-undo", "");
    }
    if (this.decisionError) this.browser.createEl("p", { text: t("@decision.restoreError"), attr: { role: "alert" } });
    if (this.pair.decisions?.state === "error") this.browser.createEl("p", { text: t("@decision.loadError"), attr: { role: "status" } });
    const toolbar = this.browser.createDiv({ cls: "veynrel-review-toolbar" });
    const modes = toolbar.createDiv({ cls: "veynrel-review-modes", attr: { "aria-label": t("@workbench.scenarios") } });
    for (const mode of ["repeats", "connections"] as const) {
      const control = button(modes, t(`@workbench.${mode}`), () => { this.mode = mode; this.limit = 60; this.render(); }, `review-${mode}`);
      control.setAttribute("aria-pressed", String(this.mode === mode));
    }
    if (this.mode === "connections" && this.data.dependencies.editRules) {
      const count = this.data.dependencies.rules?.list().filter(r => r.enabled).length ?? 0;
      button(toolbar, `${t("@rules.title")} (${count})`, () => { this.closeRules = this.data.dependencies.editRules!(); }, "review-rules");
    }
    button(toolbar, t("@safeApply.history"), () => this.actions.history(), "review-history");
    button(toolbar, t("@review.map"), () => {
      this.scroll = this.scrollOwner.scrollTop; this.browser.hidden = true; this.detail.hidden = false; this.detail.empty(); this.generation++;
      const mapGeneration = this.generation;
      healthButton(this.detail, t("@review.back"), () => { if (mapGeneration === this.generation) this.back(); }, "review-back");
      this.map = this.actions.map(this.detail.createDiv()); this.map.update(this.findings);
    }, "review-map");
    const searchRow = this.browser.createDiv({ cls: "veynrel-review-toolbar" });
    const search = searchRow.createEl("input", { type: "search", attr: { placeholder: t("@workbench.search"), "aria-label": t("@workbench.search"), "data-health-action": "review-search" } });
    search.value = this.query;
    search.addEventListener("input", () => { if (current()) { this.query = search.value; this.limit = 60; this.render(); } });
    button(searchRow, t("@review.refresh"), () => { void this.data.refresh(this.mode); }, "review-refresh", this.data.busy, true);
    const model = workbenchModel(this.data, this.findings.filter(f => f.state === "open"));
    if (model.comparisonCurrent) this.previousConnections = model.connections;
    const staleConnections = ["stale", "loading"].includes(this.data.comparison?.getSnapshot().state ?? "");
    const all = this.mode === "repeats" ? model.repeats : staleConnections ? this.previousConnections : model.connections;
    const includesQuery = (paths: readonly string[]) => paths.some(path => path.toLowerCase().includes(this.query.trim().toLowerCase()));
    const checking = (pair: WorkbenchPair) => this.pair.decisions?.state === "loading" ||
      this.pair.decisions?.hasPaths(pair.paths) && (!this.facts?.get(pair.paths) || this.facts.get(pair.paths)?.state === "checking");
    const activePairs = all.filter(pair => !checking(pair) && !this.facts?.get(pair.paths)?.kept);
    const matches = activePairs.filter(pair => includesQuery(pair.paths));
    const reviewed = this.pair.decisions?.list().filter(r => r.notes.every(n => this.data.scope.paths.includes(n.path)) && includesQuery(r.notes.map(n => n.path))) ?? [];
    if (reviewed.length) {
      const details = healthDetails(this.browser, t("@decision.reviewed", { count: reviewed.length }), "review-reviewed");
      details.open = this.reviewedOpen;
      details.addEventListener("toggle", () => { if (current()) this.reviewedOpen = details.open; });
      details.createEl("p", { text: t("@decision.scope") });
      if (this.mode === "connections" && this.data.dependencies.rules?.list().some(r => r.enabled)) details.createEl("p", { text: t("@rules.reviewed") });
      for (const record of reviewed) {
        const row = details.createDiv({ cls: "veynrel-review-toolbar" });
        row.createSpan({ text: record.notes.map(n => n.path.replace(/\.md$/iu, "")).join(" · ") });
        const restore = button(row, t("@flow.reopen"), () => { void this.restoreDecision(record.id); }, `review-restore-${record.id}`, !!this.restoring);
        restore.setAttribute("data-review-restore", record.id);
      }
    }
    const linkedCount = this.mode === "connections" ? matches.filter(p => this.facts?.get(p.paths)?.links?.some(Boolean)).length : 0;
    const state = this.mode === "repeats" ? this.data.duplicateState : this.data.connectionError ? "error" : this.data.comparison?.getSnapshot().state ?? "idle";
    const status = this.browser.createDiv({ cls: "veynrel-review-status", attr: { role: "status", "aria-live": "polite" } });
    const waiting = all.some(checking);
    if (waiting) status.createEl("p", { text: t("@decision.loading") });
    const changedSources = matches.some(p => this.facts?.get(p.paths)?.changed);
    status.createEl("p", { text: t(this.data.busy ? "@workbench.state.loading" : changedSources ? "@flow.observations-stale" :
      state === "ready" ? "@flow.candidates-loaded" : `@workbench.state.${state}`) });
    if (state === "unavailable") button(status, t("@workbench.setup"), () => this.actions.settings(), "review-settings");
    if (all.length || state === "ready") status.createEl("p", { text: t("@review.count", { shown: Math.min(matches.length - linkedCount, this.limit), total: matches.length - linkedCount, all: activePairs.length }) });
    if (linkedCount) status.createEl("p", { text: t("@flow.linked-count", { count: linkedCount }) });
    if (this.mode === "repeats") {
      status.createEl("small", { text: t("@review.global-limit") });
      const coverage = healthDetails(status, t("@workbench.coverage"), "review-coverage");
      coverage.createEl("p", { text: t("@workbench.global-candidates") });
      if (this.data.duplicates?.complete === false) coverage.createEl("p", { text: t("@review.partial") });
      if (this.data.duplicates) coverage.createEl("pre", { text: JSON.stringify(this.data.duplicates.revision, null, 2) });
    } else {
      const semantic = this.data.semantic?.getSnapshot();
      const rules = this.data.dependencies.rules;
      if (rules?.state === "error") status.createEl("p", { text: t("@rules.loadError"), attr: { role: "alert" } });
      const enabledRules = rules?.list().filter(r => r.enabled) ?? [];
      if (enabledRules.length === 1) {
        const r = enabledRules[0];
        status.createEl("p", { text: `${t(`@rules.${r.mode}`)} · ${r.selector.kind === "tag" ? "#" : ""}${r.selector.value}` });
      } else if (enabledRules.length) status.createEl("p", { text: t("@rules.activeHint", { count: enabledRules.length }) });
      if (semantic?.selection) {
        const s = semantic.selection;
        status.createEl("p", { text: t("@rules.coverage", { eligible: s.eligibleNoteCount, excluded: s.excludedNoteCount, pairs: s.excludedPairCount, unknown: s.unknownNoteCount, pending: s.unknownPairCount }), attr: { "data-rules-coverage": "" } });
      }
      if (semantic?.state === "stale" || this.data.comparison?.getSnapshot().state === "stale") status.createEl("p", { text: t("@rules.refresh") });
      if (semantic?.reason === "too-large") status.createEl("p", { text: t("@workbench.cap", { cap: semantic.supportedNoteCount, count: semantic.indexedNoteCount ?? "—" }) });
      const coverage = healthDetails(status, t("@workbench.coverage"), "review-coverage");
      coverage.createEl("p", { text: t("@workbench.ranking") });
      const topology = this.data.dependencies.topology.getSnapshot();
      if (topology.state === "ready" && topology.map?.complete === false) coverage.createEl("p", { text: t("@workbench.links-partial") });
    }
    const participation = this.mode === "connections" ? this.data.semantic?.getSnapshot().selection : undefined;
    const policyEmpty = participation && (participation.excludedPairCount > 0 || participation.unknownPairCount > 0 || participation.excludedNoteCount > 0);
    if (!this.data.scope.paths.length) this.browser.createEl("p", { text: t("@workbench.no-notes") });
    else if (!waiting && !matches.length && (all.length || state === "ready")) this.browser.createEl("p", { text: t(all.some(p => includesQuery(p.paths) && this.facts?.get(p.paths)?.kept) ? "@decision.noActive" : this.query ? "@workbench.no-search" : this.mode === "repeats" ? "@workbench.no-candidates" : policyEmpty ? "@rules.noCandidates" : "@workbench.no-connections") });
    this.facts?.track([...new Map([...matches.slice(0, this.limit), ...all.filter(p => this.pair.decisions?.hasPaths(p.paths))].map(p => [p.id, p])).values()].map(p => p.paths));
    const list = this.browser.createEl("ol", { cls: "veynrel-review-results" });
    for (const pair of matches.slice(0, this.limit)) {
      const row = list.createEl("li", { cls: "veynrel-review-row" });
      if (this.selected?.id === pair.id) row.addClass("is-selected");
      const names = row.createDiv({ cls: "veynrel-review-names" });
      pair.paths.forEach(path => {
        const name = names.createDiv(); name.createEl("strong", { text: (pair.paths[0].split("/").pop() === pair.paths[1].split("/").pop() ? path.split("/").slice(-2).join("/") : path.split("/").pop()!).replace(/\.md$/iu, "") });

      });
      const paths = names.createEl("details"); paths.createEl("summary", { text: t("@flow.paths") });
      for (const path of pair.paths) paths.createEl("small", { text: path, cls: "veynrel-review-path" });
      const facts = this.facts?.get(pair.paths);
      const state = row.createDiv({ cls: "veynrel-review-facts" });
      const achieved = this.mode === "connections" && facts?.links?.some(Boolean);
      row.setAttribute("data-review-state", achieved ? "linked" : "candidate");
      state.createEl("p", { text: achieved ? t("@flow.link-achieved") : facts?.operation ? t("@flow.saved-observation") :
        this.mode === "connections" && facts?.state !== "ready" ? t("@flow.connection-observation") : this.basis(pair) });
      if (facts) {
        if (facts.state !== "ready") state.createEl("p", { text: t(`@flow.local.${facts.state}`) });
        if (facts.links) state.createEl("p", { text: t(facts.links[0] && facts.links[1] ? "@flow.links.both" : facts.links[0] ? "@flow.links.forward" : facts.links[1] ? "@flow.links.backward" : "@flow.links.none") });
        if (facts.operation) state.createEl("p", { text: t(facts.operation.state === "applied" ? "@flow.applied" : facts.operation.state === "undone" ? "@flow.undone" : "@flow.history-check") });
        if (facts.changed) state.createEl("p", { text: t("@flow.observation-stale") });
        if (facts.historyUnknown) state.createEl("p", { text: t("@flow.history-unknown") });
      }
      const compare = button(row, t(this.mode === "connections" && facts?.links?.some(Boolean) ? "@flow.inspect-linked" : "@review.compare"), () => this.openPair(pair), `review-pair-${encodeURIComponent(pair.id)}`);
      compare.setAttribute("data-pair-id", pair.id);
      compare.setAttribute("aria-label", `${t("@review.compare")}: ${pair.paths.join(" · ")}`);
    }
    if (matches.length > this.limit) button(this.browser, t("@workbench.more"), () => { this.limit += 60; this.render(); }, "review-more");
    if (searching) { search.focus({ preventScroll: true }); search.setSelectionRange(caret?.[0] ?? null, caret?.[1] ?? null); }
    if (focusKey && !searching) {
      const next = Array.from(this.browser.querySelectorAll<HTMLElement>("[data-health-action]")).find(el => el.getAttribute("data-health-action") === focusKey);
      if (next && !(next as HTMLButtonElement).disabled) next.focus({ preventScroll: true });
      else this.browser.querySelector<HTMLElement>("[data-review-heading]")?.focus({ preventScroll: true });
    }
    this.scrollOwner.scrollTop = scroll;
  }
}
