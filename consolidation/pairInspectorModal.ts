import { App, Modal } from "obsidian";
import type { TAbstractFile } from "obsidian";
import { dateLocale, t as tr } from "../i18n";
import { openDiscoveryResult } from "../semantic/semanticDiscoveryModal";
import { readPairNote } from "./pairSnapshot";
import type { InspectorList, PairNoteSnapshot } from "./pairSnapshot";
import type { RelationshipSession } from "./relationshipSession";
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

/** One disposable view: listeners only invalidate; reading requires open or refresh. */
export class PairInspectorModal extends Modal {
  private openState = false;
  private generation = 0;
  private readonly cleanup: (() => void)[] = [];
  private relationship?: RelationshipSession;
  private planner?: ChangePlannerSession;

  constructor(app: App, private readonly paths: readonly [string, string],
    private readonly createRelationship?: () => RelationshipSession, private readonly release: () => void = () => {}, private readonly safeApply?: SafeApplyService) { super(app); }

  onOpen(): void {
    this.openState = true;
    this.modalEl.addClass("ai-pair-inspector-modal");
    this.titleEl.setText(tr("@consolidation.title"));
    this.contentEl.empty();
    this.contentEl.addClass("ai-pair-inspector");
    this.contentEl.createEl("p", { text: tr("@consolidation.scope") });
    this.contentEl.createEl("p", { text: tr("@consolidation.sourceScope") });
    const controls = this.contentEl.createDiv({ cls: "ai-semantic-search-controls" });
    const refresh = controls.createEl("button", { text: tr("@consolidation.refresh"), attr: { type: "button" } });
    if (this.safeApply) {
      const history = controls.createEl("button", { text: tr("@safeApply.history"), attr: { type: "button", "data-safe-action": "history" } });
      history.addEventListener("click", () => new OperationHistoryModal(this.app, this.safeApply!).open());
    }
    const analysis = this.contentEl.createDiv({ cls: "ai-relationship" });
    const planning = this.contentEl.createDiv({ cls: "ai-change-planner" });
    if (this.createRelationship) {
      const analyze = controls.createEl("button", { text: tr("@relationship.analyze"), attr: { type: "button", "data-relationship-action": "analyze" } });
      analyze.addEventListener("click", () => {
        if (!this.relationship) {
          this.relationship = this.createRelationship!();
          this.relationship.onChange = () => {
            if (!this.openState || !this.relationship) return;
            analyze.disabled = this.relationship.busy;
            analyze.setText(tr(this.relationship.view.stage === "result" ? "@relationship.reanalyze" : "@relationship.analyze"));
            this.planner?.close(); this.planner = undefined; planning.empty();
            renderRelationshipView(analysis, this.relationship);
            if (this.relationship.view.result) {
              const prepare = analysis.createEl("button", { text: tr("@planner.prepare"), attr: { type: "button", "data-planner-action": "open" } });
              prepare.addEventListener("click", () => {
                if (this.planner?.busy) return;
                const source = this.relationship?.analysisSource;
                if (!source || !this.openState) return;
                this.planner?.close();
                this.planner = new ChangePlannerSession({ analysis: () => this.relationship?.analysisSource, read: () => readPlannerPair(this.app, this.paths),
                  incoming: () => readMergeIncoming(this.app, this.paths),
                  atomizationObservation: (path, source) => readAtomizationObservation(this.app, path, source) });
                const planner = this.planner;
                new ChangePlannerView(planning, planner, source, this.safeApply ? plan => {
                  new SafeApplyModal(this.app, this.safeApply!, current => this.safeApply!.review(plan, source,
                    () => current() && this.openState && planner.view.plan === plan && this.relationship?.analysisSource === source)).open();
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
                } : undefined);
                void this.planner.prepare();
              });
            }
          };
        }
        void this.relationship.prepare();
      });
    }
    const status = this.contentEl.createDiv({ attr: { role: "status", "aria-live": "polite" } });
    const notes = this.contentEl.createDiv({ cls: "ai-pair-notes" });
    const invalidate = () => {
      if (!this.openState) return;
      this.generation++;
      this.planner?.invalidate();
      notes.setAttribute("aria-busy", "false");
      status.setAttribute("data-state", "stale");
      status.setText(tr("@consolidation.stale"));
    };
    const sourceChanged = (file: TAbstractFile, oldPath?: string) => {
      invalidate();
      if (this.paths.some(path => [file.path, oldPath].some(changed => changed !== undefined && (path === changed || path.startsWith(`${changed}/`))))) this.relationship?.invalidate();
    };
    // Any vault change can affect incoming references; do no work until Refresh.
    for (const ref of [this.app.vault.on("create", sourceChanged), this.app.vault.on("modify", sourceChanged),
      this.app.vault.on("delete", sourceChanged), this.app.vault.on("rename", sourceChanged)]) {
      this.cleanup.push(() => this.app.vault.offref(ref));
    }
    if (this.app.metadataCache) {
      for (const ref of [this.app.metadataCache.on("changed", invalidate), this.app.metadataCache.on("resolved", invalidate)]) {
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

  onClose(): void {
    this.openState = false;
    this.generation++;
    this.planner?.close(); this.planner = undefined;
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
    card.createEl("p", { text: tr("@consolidation.size", { bytes: note.bytes!, characters: note.characters! }) });
    card.createEl("p", { text: tr("@consolidation.modified", { time: new Date(note.modified!).toLocaleString(dateLocale()) }) });
    card.createEl("h4", { text: tr("@consolidation.source") });
    if (note.preview!.length < note.characters!) card.createEl("p", { text: tr("@consolidation.truncated", { shown: note.preview!.length, total: note.characters! }) });
    if (note.characters === 0) card.createEl("p", { text: tr("@consolidation.empty") });
    card.createEl("pre", { cls: "ai-pair-source", text: note.preview, attr: { tabindex: "0", "aria-label": tr("@consolidation.source") } });
    card.createEl("h4", { text: tr("@consolidation.metadata") });
    card.createEl("p", { text: tr("@consolidation.cacheScope") });
    if (note.metadata) {
      for (const [key, values] of Object.entries(note.metadata)) this.renderList(card, key, values);
    } else card.createEl("p", { text: tr("@consolidation.unavailable") });
    this.renderList(card, "incoming", note.incoming);
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
