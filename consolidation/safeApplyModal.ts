import { StructuralArchiveApplyModal, renderStructuralArchiveHistory } from "./structuralArchiveApplyModal";
import type { ArchivePlanV2 } from "./archivePlanV2";
import { App, Modal } from "obsidian";
import { dateLocale, t as tr } from "../i18n";
import { SafeApplyError } from "./operationJournal";
import type { ApplyReview, SafeApplyService, OperationHistory, ResolutionReview } from "./safeApply";
import { renderPlanDiff } from "./planDiffView";
import { MultiFileApplyModal, renderMultiHistory } from "./multiFileApplyModal";
import { GroupApplyModal, renderGroupHistory } from "./groupApplyModal";
import { EmptyAtomApplyModal, renderEmptyAtomHistory } from "./emptyAtomApplyModal";
import { BundleApplyModal, renderBundleHistory } from "./bundleApplyModal";
import { MergeApplyModal, renderMergeHistory } from "./mergeApplyModal";
import { ArchivePlannerModal } from "./archivePlannerModal";
import { readArchiveBasis } from "./obsidianArchive";
import { ArchivePlannerModalV2 } from "./archivePlannerModalV2";
import { readArchiveBasisV2 } from "./obsidianArchiveV2";
import { ArchiveApplyModal, renderArchiveHistory } from "./archiveApplyModal";
import { renderConsolidationHistory } from "./consolidationHistory";
import type { HistoryPresentation } from "./consolidationHistory";
import { reviewSummary, diagnosticPanel, historyHeading, historyUnavailable, focusStatus } from "./consolidationUx";
import type { ChangePlan } from "./changePlan";
import { ReviewLifetime } from "./reviewLifetime";

function button(parent: HTMLElement, key: string, action: () => void): HTMLButtonElement {
  const el = parent.createEl("button", { text: tr(`@safeApply.${key}`), attr: { type: "button", "data-safe-action": key } });
  el.addEventListener("click", action); return el;
}
function preview(root: HTMLElement, before: string, after: string): void {
  for (const [key, text] of [["before", before], ["after", after]]) {
    const details = root.createEl("details"); details.createEl("summary", { text: tr(`@planner.${key}`) });
    details.createEl("pre", { text, cls: "ai-pair-source", attr: { tabindex: "0" } });
  }
  renderPlanDiff(root, before, after);
}
function message(error: unknown): string { return tr(`@safeApply.error.${error instanceof SafeApplyError ? error.reason : "stale"}`); }
function diagnostics(root: HTMLElement, row: OperationHistory): void {
  root.createEl("p", { text: tr(`@journal.source.${row.sourceState}`) });
  root.createEl("p", { text: tr(`@journal.scope.${row.resolution ? "resolved" : row.scope}`) });
  if (row.scope === "local" && row.record && !row.resolution) root.createEl("p", { text: `${row.record.sourcePath} · ${row.record.targetPath}` });
  if (row.editorBlocked) root.createEl("p", { text: tr("@safeApply.error.editor") });
  const details = diagnosticPanel(root, row.id);
  const list = details.createEl("ul");
  for (const item of [...row.evidence, ...row.resolutionAttempts]) {
    const li = list.createEl("li", { text: `${item.name}: ${tr(`@journal.issue.${item.status}`)}` });
    if (item.sha256) li.createEl("code", { text: ` SHA-256: ${item.sha256}` });
  }
  for (const issue of row.issues) details.createEl("p", { text: `${issue.file}: ${tr(`@journal.issue.${issue.code}`)}` });
  if (row.resolution) {
    root.createEl("p", { text: `${tr("@journal.confirmed")}: ${new Date(row.resolution.confirmedAt).toLocaleString(dateLocale())}` });
    root.createEl("p", { text: tr(`@journal.source.${row.resolution.source.state}`) });
    root.createEl("p", { text: tr("@journal.historical") });
  }
  if ((row.damaged || row.state === "conflict") && !row.canResolve && !row.resolution) root.createEl("p", { text: tr("@journal.manual") });
}

/** No note write: a separately confirmed acknowledgement of the inspected evidence. */
export class JournalResolutionModal extends Modal {
  private pending: Promise<void> = Promise.resolve();
  private active = false;
  private busy = false;
  private review?: ResolutionReview;
  constructor(app: App, private readonly service: SafeApplyService, private readonly id: string,
    private readonly release: () => void = () => {}, private readonly history?: () => void) { super(app); }
  onOpen(): void {
    this.active = true; this.modalEl.addClass("ai-pair-inspector-modal"); this.contentEl.addClass("ai-change-planner", "ai-journal-resolution");
    this.titleEl.setText(tr("@journal.review"));
    this.contentEl.createEl("p", { text: tr("@safeApply.checking"), attr: { role: "status" } });
    this.pending = this.load();
  }
  private async load(): Promise<void> {
    try {
      const review = await this.service.reviewResolution(this.id, () => this.active);
      if (!this.active) { this.service.discardResolution(review); return; }
      this.review = review; this.contentEl.empty();
      const r = review.row.record!;
      this.contentEl.createEl("p", { text: `${tr(`@planner.op.${r.operation}`)}: ${r.sourcePath} → ${r.targetPath}` });
      diagnostics(this.contentEl, review.row);
      this.contentEl.createEl("p", { text: tr("@journal.warning") });
      preview(this.contentEl, r.before, r.after);
      const actions = this.contentEl.createDiv({ cls: "ai-consolidation-actions ai-review-actions" });
      button(actions, "resolveConfirm", () => { if (!this.busy) this.pending = this.commit(); });
      button(actions, "cancel", () => this.close());
    } catch (error) { this.error(error); }
  }
  private error(error: unknown): void {
    if (!this.active) return;
    this.contentEl.empty(); this.contentEl.createEl("p", { text: message(error), attr: { role: "alert" } });
    this.contentEl.createEl("p", { text: tr("@journal.failure") });
    button(this.contentEl, "history", () => this.openHistory());
  }
  private async commit(): Promise<void> {
    if (this.busy || !this.active || !this.review) return;
    this.busy = true; this.contentEl.empty();
    this.contentEl.createEl("p", { text: tr("@journal.working"), attr: { role: "status" } });
    try {
      await this.service.resolve(this.review);
      if (!this.active) return;
      this.contentEl.empty(); this.contentEl.createEl("p", { text: tr("@safeApply.state.resolved"), attr: { role: "status" } });
      this.contentEl.createEl("p", { text: tr("@journal.warning") });
      button(this.contentEl, "history", () => this.openHistory());
    } catch (error) { this.error(error); }
    finally { this.busy = false; }
  }
  private openHistory(): void { this.close(); void this.pending.then(() => { if (this.history) this.history(); else new OperationHistoryModal(this.app, this.service).open(); }); }
  onClose(): void { this.active = false; if (this.review) this.service.discardResolution(this.review); this.contentEl.empty(); void this.pending.then(this.release); }
}

/** A fresh consent window, independent of the LLM consent and of disposable planner rendering. */
export class SafeApplyModal extends Modal {
  private pending: Promise<void> = Promise.resolve();
  private active = false;
  private lifetime?: ReviewLifetime;
  private review?: ApplyReview;
  private busy = false;
  constructor(app: App, private readonly service: SafeApplyService,
    private readonly prepare: (current: () => boolean) => Promise<ApplyReview | null>, private readonly undo = false,
    private readonly release: () => void = () => {}, private readonly history?: () => void,
    private readonly context?: Pick<ChangePlan, "sourcePath" | "targetPath" | "operation">) { super(app); }
  onOpen(): void {
    this.active = true; this.modalEl.addClass("ai-pair-inspector-modal"); this.contentEl.addClass("ai-change-planner", "ai-safe-apply");
    this.lifetime = new ReviewLifetime(this.app, () => { if (this.review) this.service.discard(this.review); this.showError(new SafeApplyError("stale")); });
    this.titleEl.setText(tr(this.undo ? "@safeApply.undoReview" : "@safeApply.review"));
    this.contentEl.createEl("p", { text: tr("@safeApply.checking"), attr: { role: "status" } });
    this.pending = this.load();
  }
  private async load(): Promise<void> {
    try {
      const review = await this.prepare(() => this.active && !!this.lifetime?.current());
      if (!this.active || !this.lifetime?.current()) { if (review) this.service.discard(review); return; }
      this.contentEl.empty();
      if (!review) { this.contentEl.createEl("p", { text: tr("@safeApply.noChange") }); return; }
      this.review = review;
      reviewSummary(this.contentEl, [review.sourcePath], this.context?.sourcePath === review.sourcePath ? [this.context.targetPath] : [], this.undo);
      this.contentEl.createEl("p", { text: tr("@safeApply.warning") });
      preview(this.contentEl, this.undo ? review.after : review.before, this.undo ? review.before : review.after);
      const actions = this.contentEl.createDiv({ cls: "ai-consolidation-actions ai-review-actions" });
      button(actions, this.undo ? "undoConfirm" : "confirm", () => { if (!this.busy) this.pending = this.commit(); });
      button(actions, "cancel", () => this.close());
      focusStatus(this.contentEl);
    } catch (error) { this.showError(error); }
  }
  private showError(error: unknown): void {
    if (!this.active) return;
    this.contentEl.empty(); this.contentEl.createEl("p", { text: message(error), attr: { role: "alert" } });
    button(this.contentEl, "history", () => this.openHistory());
    focusStatus(this.contentEl);
  }
  private async commit(): Promise<void> {
    if (this.busy || !this.review || !this.active || !this.lifetime?.current()) return;
    this.lifetime.stop();
    this.busy = true;
    this.contentEl.empty(); this.contentEl.createEl("p", { text: tr("@safeApply.working"), attr: { role: "status", "aria-live": "polite" } }); focusStatus(this.contentEl);
    try {
      if (this.undo) await this.service.undo(this.review); else await this.service.apply(this.review);
      if (!this.active) return;
      this.contentEl.empty(); this.contentEl.createEl("p", { text: tr(this.undo ? "@safeApply.undone" : "@safeApply.applied"), attr: { role: "status" } });
      if (!this.undo) button(this.contentEl, "undo", () => {
        const id = this.review!.id;
        this.close();
        void this.pending.then(() => new SafeApplyModal(this.app, this.service, current => this.service.reviewUndo(id, current), true, undefined, this.history, this.context).open());
      });
      button(this.contentEl, "history", () => this.openHistory());
      focusStatus(this.contentEl);
    } catch (error) { this.showError(error); }
    finally { this.busy = false; }
  }
  private openHistory(): void { this.close(); void this.pending.then(() => { if (this.history) this.history(); else new OperationHistoryModal(this.app, this.service).open(); }); }
  onClose(): void { this.active = false; this.lifetime?.close(); if (this.review) this.service.discard(this.review); this.contentEl.empty(); void this.pending.then(this.release); }
}

export class OperationHistoryModal extends Modal {
  private active = false;
  private reading = false;
  private refreshButton?: HTMLButtonElement;
  private generation = 0;
  private lifetime?: ReviewLifetime;
  constructor(app: App, private readonly service: SafeApplyService, private readonly release: () => void = () => {}) { super(app); }
  onOpen(): void {
    this.active = true; this.modalEl.addClass("ai-pair-inspector-modal"); this.contentEl.addClass("ai-change-planner", "ai-operation-history");
    this.titleEl.setText(tr("@safeApply.history")); void this.refresh();
  }
  private async refresh(): Promise<void> {
    if (this.reading || !this.active) return;
    this.reading = true;
    const generation = ++this.generation;
    const current = () => this.active && this.generation === generation;
    this.lifetime?.close();
    this.lifetime = new ReviewLifetime(this.app, () => {
      this.generation++;
      if (!this.active) return;
      this.contentEl.empty(); this.contentEl.createEl("p", { text: tr("@ux.historyStale"), attr: { role: "status" } });
      this.refreshButton = button(this.contentEl, "refresh", () => { void this.refresh(); });
      this.refreshButton.disabled = this.reading; focusStatus(this.contentEl);
    });
    this.contentEl.empty(); this.contentEl.createEl("p", { text: tr("@safeApply.checking"), attr: { role: "status" } });
    try {
      const rows = await this.service.history();
      if (!current()) return;
      const multi = await this.service.multi?.history() ?? [];
      if (!current()) return;
      const merge = await this.service.merge?.history() ?? [];
      if (!current()) return;
      const archive = await this.service.archive?.history() ?? [];
      if (!current()) return;
      const structuralArchive = await this.service.structuralArchive?.history() ?? [];
      if (!current()) return;
      const bundle = await this.service.bundle?.history() ?? [];
      if (!current()) return;
      const group = await this.service.group?.history() ?? [];
      if (!current()) return;
      const emptyAtom = await this.service.emptyAtom?.history() ?? [];
      if (!current()) return;
      this.contentEl.empty(); this.contentEl.createEl("p", { text: tr("@safeApply.historyScope") });
      button(this.contentEl, "refresh", () => { void this.refresh(); });
      if (!rows.length && !multi.length && !merge.length && !archive.length && !bundle.length && !group.length && !emptyAtom.length && !structuralArchive.length) this.contentEl.createEl("p", { text: tr("@safeApply.empty") });
      const items: HistoryPresentation[] = [];
      const released = () => { if (this.active) void this.refresh(); };
      // Returning from a child closes it and refreshes this existing history once.
      const history = () => {};
      for (const row of emptyAtom) items.push({ family: "emptyAtom", row, render: root => renderEmptyAtomHistory(root, row,
        () => new EmptyAtomApplyModal(this.app, this.service.emptyAtom!, current => this.service.emptyAtom!.reviewUndo(row.id, current), history, released).open()) });
      for (const row of group) items.push({ family: "group", row, render: (root, linked) => renderGroupHistory(root, row,
        () => new GroupApplyModal(this.app, this.service.group!, current => this.service.group!.reviewUndo(row.id, current), history, released).open(),
        linked ? undefined : () => this.archiveV2("copy_context_group", row.id)) });
      for (const row of bundle) items.push({ family: "bundle", row, render: (root, linked) => renderBundleHistory(root, row,
        () => new BundleApplyModal(this.app, this.service.bundle!, current => this.service.bundle!.reviewUndo(row.id, current), history, released).open(),
        linked ? undefined : () => this.archiveV2("context_bundle_copy", row.id)) });
      for (const row of structuralArchive) items.push({ family: "structuralArchive", row,
        parent: row.record ? { family: row.record.parent.operation === "copy_context_group" ? "group" : "bundle", record: row.record.parent } : undefined,
        render: root => renderStructuralArchiveHistory(root, row, () => new StructuralArchiveApplyModal(this.app, this.service.structuralArchive!,
          current => this.service.structuralArchive!.reviewUndo(row.id, current), history, released).open()) });
      for (const row of archive) items.push({ family: "archive", row, parent: row.record ? { family: "merge", record: row.record.parent } : undefined,
        render: root => renderArchiveHistory(root, row, () => new ArchiveApplyModal(this.app, this.service.archive!,
          current => this.service.archive!.reviewUndo(row.id, current), history, released).open()) });
      for (const row of merge) items.push({ family: "merge", row, render: (root, linked) => renderMergeHistory(root, row,
        () => new MergeApplyModal(this.app, this.service.merge!, current => this.service.merge!.reviewUndo(row.id, current), history, released).open(),
        linked ? undefined : () => this.archiveV1(row.id)) });
      for (const row of multi) items.push({ family: "multi", row, render: root => renderMultiHistory(root, row,
        () => new MultiFileApplyModal(this.app, this.service.multi!, current => this.service.multi!.reviewUndo(row.id, current), history, released).open()) });
      for (const row of rows) items.push({ family: "single", row, render: root => this.row(root, row) });
      renderConsolidationHistory(this.contentEl, items);
      focusStatus(this.contentEl);
    } catch (error) {
      if (this.active && this.generation === generation) {
        this.contentEl.empty(); this.contentEl.createEl("p", { text: message(error), attr: { role: "alert" } });
        button(this.contentEl, "refresh", () => { void this.refresh(); });
      }
    } finally { this.reading = false; if (this.refreshButton) this.refreshButton.disabled = false; }
  }
  private archiveV2(operation: "copy_context_group" | "context_bundle_copy", id: string): void {
    const planner: ArchivePlannerModalV2 = new ArchivePlannerModalV2(this.app, current => readArchiveBasisV2(this.app, this.service, operation, id, current),
      this.service.structuralArchive ? (plan: ArchivePlanV2, currentPlan: () => boolean) => {
        new StructuralArchiveApplyModal(this.app, this.service.structuralArchive!, current => this.service.structuralArchive!.review(plan, () => current() && currentPlan()),
          () => { planner.close(); if (this.active) void this.refresh(); }).open();
      } : undefined);
    planner.open();
  }
  private archiveV1(id: string): void {
    const planner: ArchivePlannerModal = new ArchivePlannerModal(this.app, current => readArchiveBasis(this.app, this.service.merge!, id, current), this.service.archive ?
      (plan, currentPlan) => new ArchiveApplyModal(this.app, this.service.archive!, current => this.service.archive!.review(plan, () => current() && currentPlan()),
        () => { planner.close(); if (this.active) void this.refresh(); }).open() : undefined);
    planner.open();
  }
  private row(root: HTMLElement, row: OperationHistory): void {
    const card = root.createEl("section", { cls: "ai-semantic-result-card", attr: { "data-operation-state": row.state, "data-operation-id": row.id } });
    const r = row.record;
    historyHeading(card, r ? tr(`@planner.op.${r.operation}`) : tr("@safeApply.damaged"), r ? [r.sourcePath, r.targetPath] : [], r?.createdAt);
    card.createEl("p", { text: tr(`@safeApply.state.${row.state}`), attr: { role: "status" } });
    if (row.recovered) card.createEl("p", { text: tr("@safeApply.recovered") });
    if (row.damaged) card.createEl("p", { text: tr("@safeApply.damaged") });
    diagnostics(card, row);
    if (!r) return;
    card.createEl("p", { text: `${r.sourcePath} → ${r.targetPath}` });
    const details = card.createEl("details"); details.createEl("summary", { text: tr("@safeApply.preview") });
    preview(details, r.before, r.after);
    if (row.issues.some(issue => issue.code === "copies_disagree")) for (const copy of row.copies.slice(1)) {
      const other = card.createEl("details"); other.createEl("summary", { text: copy.name });
      other.createEl("p", { text: `${copy.record.sourcePath} → ${copy.record.targetPath}` });
      preview(other, copy.record.before, copy.record.after);
    }
    if (row.canResolve) button(card, "resolve", () => new JournalResolutionModal(this.app, this.service, row.id, () => { if (this.active) void this.refresh(); }, () => {}).open());
    if (row.canUndo) button(card, "undo", () => new SafeApplyModal(this.app, this.service, current => this.service.reviewUndo(row.id, current), true, () => { if (this.active) void this.refresh(); }, () => {}, r).open());
    historyUnavailable(card, row.canUndo || row.canResolve, row.state, row.editorBlocked || row.damaged);
  }
  onClose(): void { this.active = false; this.generation++; this.lifetime?.close(); this.contentEl.empty(); this.release(); }
}
