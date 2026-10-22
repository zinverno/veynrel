import { keepReviewSeparate } from "./reviewDecisions";
import type { App } from "obsidian";
import type { TAbstractFile } from "obsidian";
import { dateLocale, t as tr } from "../i18n";
import { openDiscoveryResult } from "../semantic/semanticDiscoveryModal";
import { readPairNote } from "./pairSnapshot";
import type { InspectorList, PairNoteSnapshot } from "./pairSnapshot";
import type { RelationshipSession } from "./relationshipSession";
import type { IntentSelection } from "./recommendationIntent";
import { renderRelationshipView } from "./relationshipView";
import { ChangePlannerSession, readPlannerPair } from "./changePlannerSession";
import type { SafeApplyService } from "./safeApply";
import { SafeApplyModal, OperationHistoryModal } from "./safeApplyModal";
import { ChangePlannerView } from "./changePlannerView";
import { MultiFileApplyModal } from "./multiFileApplyModal";
import { GroupApplyModal } from "./groupApplyModal";
import { BundleApplyModal } from "./bundleApplyModal";
import { MergeApplyModal } from "./mergeApplyModal";
import { readAtomizationObservation } from "./obsidianAtomization";
import { readMergeIncoming } from "./obsidianMergeApply";
import { obsidianEmptyAtomPort } from "./obsidianEmptyAtom";
import { obsidianSafeApplyPort } from "./obsidianSafeApply";
import { EmptyAtomApplyModal } from "./emptyAtomApplyModal";
import { RecommendationPreflight } from "./recommendationPreflight";
import { recommendationIntent } from "./recommendationIntent";
import { focusStatus } from "./consolidationUx";
import { reviewPair } from "./reviewPresentation";

/** Disposable pair owner; metadata readiness may recheck availability, never rerun analysis. */
export class PairReview {
  private openState = false;
  private generation = 0;
  private readonly cleanup: (() => void)[] = [];
  private relationship?: RelationshipSession;
  private planner?: ChangePlannerSession;
  private preflight?: RecommendationPreflight;

  constructor(private readonly app: App, private readonly contentEl: HTMLElement, private readonly paths: readonly [string, string],
    private readonly createRelationship?: () => RelationshipSession, private readonly release: () => void = () => {}, private readonly safeApply?: SafeApplyService) {}

  open(): void {
    this.openState = true;
    this.contentEl.empty();
    this.contentEl.addClass("ai-pair-inspector");
    const heading = this.contentEl.createEl("h2", { text: tr("@review.pair-title"), attr: { tabindex: "-1", "data-pair-heading": "true" } });
    reviewPair(this.contentEl, this.paths);
    const intro = this.contentEl.createEl("p", { text: tr("@review.pair-description"), cls: "ai-pair-intro" });
    const controls = this.contentEl.createDiv({ cls: "ai-consolidation-actions ai-pair-actions" });
    const refresh = controls.createEl("button", { text: tr("@consolidation.refresh"), attr: { type: "button" } });
    if (this.safeApply) {
      const history = controls.createEl("button", { text: tr("@safeApply.history"), attr: { type: "button", "data-safe-action": "history" } });
      history.addEventListener("click", () => new OperationHistoryModal(this.app, this.safeApply!).open());
    }
    const analysis = this.contentEl.createDiv({ cls: "ai-relationship" });
    const planning = this.contentEl.createDiv({ cls: "ai-change-planner" });
    planning.hidden = true;
    const backResult = controls.createEl("button", { text: tr("@review.result-back"), attr: { type: "button", "data-planner-action": "back-result" } });
    backResult.hidden = true;
    backResult.addEventListener("click", () => {
      if (!this.openState) return;
      this.planner?.close(); this.planner = undefined; planning.empty(); planning.hidden = true;
      analysis.hidden = false; backResult.hidden = true; heading.setText(tr("@final.headingResult")); renderAnalysis(); checkAvailability(); focusStatus(analysis);
    });
    const pendingMetadata = new Set<string>();
    let renderAnalysis = () => {};
    this.preflight = new RecommendationPreflight(async () => {
      if (this.paths.some(path => pendingMetadata.has(path))) throw new Error("metadata");
      return readPlannerPair(this.app, this.paths);
    }, () => renderAnalysis());
    const checkAvailability = () => {
      const expected = this.relationship?.analysisSource;
      if (expected) void this.preflight!.check(expected, () => this.openState && this.relationship?.analysisSource === expected);
    };
    if (this.createRelationship) {
      const analyze = controls.createEl("button", { text: tr("@relationship.analyze"), attr: { type: "button", "data-relationship-action": "analyze" } });
      analyze.addEventListener("click", () => {
        if (!this.openState) return;
        if (!this.relationship) {
          this.relationship = this.createRelationship!();
          this.relationship.onChange = () => {
            if (!this.openState || !this.relationship) return;
            analyze.disabled = this.relationship.busy;
            const stage = this.relationship.view.stage;
            heading.setText(tr(stage === "result" ? "@final.headingResult" : stage === "error" ? "@final.headingError" : "@review.pair-title"));
            const initial = ["idle", "cancelled", "stale", "dismissed"].includes(stage);
            notes.hidden = !initial; limits.hidden = !initial; status.hidden = !initial;
            intro.hidden = !initial;
            refresh.hidden = !initial; analyze.hidden = !initial;
            analysis.hidden = false; planning.hidden = true; backResult.hidden = true;
            analyze.setText(tr(this.relationship.view.stage === "result" ? "@relationship.reanalyze" : "@relationship.analyze"));
            this.planner?.close(); this.planner = undefined; planning.empty();
            const expected = this.relationship.analysisSource;
            const prepare = (selection: IntentSelection) => {
              if (analysis.hidden || this.relationship?.analysisSource !== expected || this.planner?.busy) return;
              const source = this.relationship?.analysisSource;
              if (!source || !this.openState || this.preflight?.view.state !== "ready" ||
                recommendationIntent(source, selection, this.preflight.view.pair, this.preflight.view.linktexts).status === "unavailable") return;
              this.planner?.close();
              this.planner = new ChangePlannerSession({ analysis: () => this.relationship?.analysisSource, read: () => readPlannerPair(this.app, this.paths),
                incoming: () => readMergeIncoming(this.app, this.paths),
                emptyAtom: obsidianEmptyAtomPort(this.app, obsidianSafeApplyPort(this.app)),
                emptyTargets: () => this.app.vault.getMarkdownFiles().filter(f => !this.paths.includes(f.path) && f.stat.size === 0).map(f => f.path).sort(),
                atomizationObservation: (path, source) => readAtomizationObservation(this.app, path, source) });
              const planner = this.planner;
              heading.setText(tr(`@intent.cta.${recommendationIntent(source, selection).family}`));
              analysis.hidden = true; planning.hidden = false; backResult.hidden = false;
              new ChangePlannerView(planning, planner, source, this.safeApply ? plan => {
                new SafeApplyModal(this.app, this.safeApply!, current => this.safeApply!.review(plan, source,
                  () => current() && this.openState && planner.view.plan === plan && this.relationship?.analysisSource === source), false, undefined, undefined, plan).open();
              } : undefined, this.safeApply?.multi ? plan => {
                new MultiFileApplyModal(this.app, this.safeApply!.multi!, current => this.safeApply!.multi!.review(plan, source,
                  () => current() && this.openState && planner.view.multiPlan === plan && this.relationship?.analysisSource === source),
                () => new OperationHistoryModal(this.app, this.safeApply!).open()).open();
              } : undefined, this.safeApply?.merge ? plan => {
                new MergeApplyModal(this.app, this.safeApply!.merge!, current => this.safeApply!.merge!.review(plan, source,
                  () => current() && this.openState && planner.view.mergePlan === plan && this.relationship?.analysisSource === source),
                () => new OperationHistoryModal(this.app, this.safeApply!).open()).open();
              } : undefined, this.safeApply?.bundle ? plan => {
                new BundleApplyModal(this.app, this.safeApply!.bundle!, current => this.safeApply!.bundle!.review(plan, source,
                  () => current() && this.openState && planner.view.bundlePlan === plan && this.relationship?.analysisSource === source),
                () => new OperationHistoryModal(this.app, this.safeApply!).open()).open();
              } : undefined, this.safeApply?.group ? plan => {
                new GroupApplyModal(this.app, this.safeApply!.group!, current => this.safeApply!.group!.review(plan, source,
                  () => current() && this.openState && planner.view.groupPlan === plan && this.relationship?.analysisSource === source),
                () => new OperationHistoryModal(this.app, this.safeApply!).open()).open();
              } : undefined, this.safeApply?.emptyAtom ? plan => {
                new EmptyAtomApplyModal(this.app, this.safeApply!.emptyAtom!, current => this.safeApply!.emptyAtom!.review(plan, source,
                  () => current() && this.openState && planner.view.emptyAtomPlan === plan && this.relationship?.analysisSource === source),
                () => new OperationHistoryModal(this.app, this.safeApply!).open()).open();
              } : undefined, selection);
              void this.planner.prepare();
            };
            renderAnalysis = () => { if (this.openState && this.relationship && !analysis.hidden)
              renderRelationshipView(analysis, this.relationship, prepare, this.preflight?.view, () => {
                if (expected && this.relationship?.analysisSource === expected) keepReviewSeparate(this.app, expected.pair);
              }, () => { if (this.openState) { notes.hidden = false; limits.hidden = false; notes.scrollIntoView({ block: "start" }); } }); };
            this.preflight?.invalidate();
            renderAnalysis();
            checkAvailability();
            if (["consent", "result", "error", "cancelled"].includes(this.relationship.view.stage)) {
              focusStatus(analysis);
              (this.contentEl.closest(".veynrel-review-detail") ?? heading).scrollIntoView({ block: "start" });
            }
          };
        }
        void this.relationship.prepare();
      });
    }
    const status = this.contentEl.createDiv({ cls: "ai-pair-status", attr: { role: "status", "aria-live": "polite" } });
    const notes = this.contentEl.createDiv({ cls: "ai-pair-notes" });
    const limits = this.contentEl.createEl("details", { cls: "ai-consolidation-diagnostics" });
    limits.createEl("summary", { text: tr("@ux.pairDetails") });
    limits.createEl("p", { text: tr("@consolidation.scope") });
    limits.createEl("p", { text: tr("@consolidation.sourceScope") });
    const invalidate = () => {
      if (!this.openState) return;
      this.generation++;
      this.planner?.invalidate();
      this.preflight?.invalidate();
      notes.setAttribute("aria-busy", "false");
      status.setAttribute("data-state", "stale");
      status.setText(tr("@consolidation.stale"));
    };
    const sourceChanged = (file: TAbstractFile, oldPath?: string) => {
      pendingMetadata.add(file.path);
      invalidate();
      if (this.paths.some(path => [file.path, oldPath].some(changed => changed !== undefined && (path === changed || path.startsWith(`${changed}/`))))) this.relationship?.invalidate();
    };
    // Vault changes revoke planner dependencies; metadata readiness rechecks only local availability.
    for (const ref of [this.app.vault.on("create", sourceChanged), this.app.vault.on("modify", sourceChanged),
      this.app.vault.on("delete", sourceChanged), this.app.vault.on("rename", sourceChanged)]) {
      this.cleanup.push(() => this.app.vault.offref(ref));
    }
    if (this.app.metadataCache) {
      for (const ref of [this.app.metadataCache.on("changed", file => { pendingMetadata.delete(file.path); invalidate(); checkAvailability(); }),
        this.app.metadataCache.on("resolved", () => { invalidate(); checkAvailability(); })]) {
        this.cleanup.push(() => this.app.metadataCache.offref(ref));
      }
    }
    const load = async () => {
      if (!this.openState) return;
      this.relationship?.invalidate();
      const generation = ++this.generation;
      notes.empty();
      notes.setAttribute("aria-busy", "true");
      status.setAttribute("data-state", "loading");
      status.setText(tr("@consolidation.loading"));
      const snapshots = await Promise.all(this.paths.map(path => readPairNote(this.app, path)));
      if (!this.openState || generation !== this.generation) return;
      notes.setAttribute("aria-busy", "false");
      status.setAttribute("data-state", "ready");
      status.setText(tr("@consolidation.loaded"));
      for (const [index, snapshot] of snapshots.entries()) this.renderNote(notes, snapshot, index === 0 ? "A" : "B");
    };
    refresh.addEventListener("click", () => { void load(); });
    void load();
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.generation++;
    this.planner?.close(); this.planner = undefined;
    this.preflight?.close(); this.preflight = undefined;
    this.relationship?.close(); this.relationship = undefined;
    for (const remove of this.cleanup.splice(0)) remove();
    this.contentEl.empty();
    this.release();
  }

  private renderNote(container: HTMLElement, note: PairNoteSnapshot, side: string): void {
    const card = container.createDiv({ cls: "ai-semantic-result-card ai-pair-note" });
    card.createEl("h3", { text: `${side}: ${note.name ?? note.path}` });
    card.createDiv({ cls: "ai-semantic-result-path", text: note.path });
    if (note.state !== "ready") {
      card.createEl("p", { text: tr(`@consolidation.${note.state}`) });
      return;
    }
    const open = card.createEl("button", { text: tr("@consolidation.open"), attr: {
      type: "button", "aria-label": tr("Открыть заметку {path}", { path: note.path }),
    } });
    open.addEventListener("click", () => { void openDiscoveryResult(this.app, note.path, undefined, () => {}); });

    const source = card.createEl("details"); source.createEl("summary", { text: tr("@consolidation.source") });
    source.createEl("p", { text: tr("@consolidation.size", { bytes: note.bytes!, characters: note.characters! }) });
    if (note.preview!.length < note.characters!) card.createEl("p", { text: tr("@consolidation.truncated", { shown: note.preview!.length, total: note.characters! }) });
    if (note.characters === 0) card.createEl("p", { text: tr("@consolidation.empty") });
    source.createEl("pre", { cls: "ai-pair-source", text: note.preview, attr: { tabindex: "0", "aria-label": tr("@consolidation.source") } });
    const metadata = card.createEl("details");
    metadata.createEl("summary", { text: tr("@consolidation.metadata") });
    metadata.createEl("p", { text: tr("@consolidation.modified", { time: new Date(note.modified!).toLocaleString(dateLocale()) }) });
    metadata.createEl("p", { text: tr("@consolidation.cacheScope") });
    if (note.metadata) {
      for (const [key, values] of Object.entries(note.metadata)) this.renderList(metadata, key, values);
    } else metadata.createEl("p", { text: tr("@consolidation.unavailable") });
    this.renderList(metadata, "incoming", note.incoming);
  }

  private renderList(card: HTMLElement, key: string, values?: InspectorList): void {
    const details = card.createEl("details");
    details.createEl("summary", { text: `${tr(`@consolidation.${key}`)}${values ? ` (${values.total})` : ""}` });
    if (!values) { details.createEl("p", { text: tr("@consolidation.unavailable") }); return; }
    if (values.total === 0) details.createEl("p", { text: tr("@consolidation.noCachedEntries") });
    if (values.items.length < values.total) details.createEl("p", { text: tr("@consolidation.listTruncated", { shown: values.items.length, total: values.total }) });
    const list = details.createEl("ul");
    for (const text of values.items) list.createEl("li", {
      text: text.length > 500 ? `${text.slice(0, 500)}${tr("@consolidation.entryTruncated")}` : text,
    });
  }
}
