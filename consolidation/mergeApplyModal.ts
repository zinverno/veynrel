import { refreshReviewFacts, reviewOutcome } from "./reviewRefresh";
import { ReviewLifetime } from "./reviewLifetime";
import { reviewSummary, diagnosticPanel, historyHeading, historyUnavailable, focusStatus } from "./consolidationUx";
import { App, Modal } from "obsidian";
import { t as tr } from "../i18n";
import { SafeApplyError } from "./operationJournal";
import type { MergeApply, MergeHistory, MergeReview } from "./mergeApply";
import type { MergeRecord } from "./mergeJournal";
import { renderPlanDiff } from "./planDiffView";

function control(root: HTMLElement, key: string, action: () => void): HTMLButtonElement {
  const b = root.createEl("button", { text: tr(`@mergeApply.${key}`), attr: { type: "button", "data-merge-apply-action": key } });
  b.addEventListener("click", action); return b;
}
function preview(root: HTMLElement, r: MergeRecord, undo = false): void {
  reviewSummary(root, [r.canonical.path], [r.secondary.path], undo);
  root.createEl("p", { text: tr("@mergeApply.warning") });
  root.createEl("p", { text: tr("@mergeApply.limits") });
  if (undo) root.createEl("p", { text: tr("@mergeApply.undoScope") });
  const before = undo ? r.canonical.after : r.canonical.before, after = undo ? r.canonical.before : r.canonical.after;
  for (const [key, text] of [["before", before], ["after", after], ["secondary", r.secondary.content]]) {
    const d = root.createEl("details"); d.open = false;
    d.createEl("summary", { text: tr(key === "secondary" ? "@mergeApply.secondary" : `@planner.${key}`) });
    d.createEl("pre", { text, cls: "ai-pair-source", attr: { tabindex: "0", "data-merge-apply-text": key } });
  }
  renderPlanDiff(root, before, after);
  const ranges = root.createEl("details"); ranges.createEl("summary", { text: tr("@merge.copied") });
  ranges.createEl("h4", { text: tr("@merge.copied") });
  for (const t of r.transfers) {
    ranges.createEl("p", { text: `${t.range.start}–${t.range.end}` });
    ranges.createEl("pre", { text: t.range.text, cls: "ai-pair-source", attr: { tabindex: "0", "data-merge-apply-text": "copied" } });
  }
  ranges.createEl("p", { text: tr("@planner.range", { start: r.insertion.anchor.start, end: r.insertion.anchor.end, point: r.insertion.edit.start }) });
  ranges.createEl("pre", { text: r.insertion.anchor.text, cls: "ai-pair-source", attr: { tabindex: "0", "data-merge-apply-text": "anchor" } });
  diagnosticPanel(root).createEl("p", { text: `${r.secondary.path} · SHA-256: ${r.secondary.hash}`, cls: "ai-pair-path" });
}
/** A new, revocable consent ticket; displaying the checked plan never writes Markdown. */
export class MergeApplyModal extends Modal {
  private pending: Promise<void> = Promise.resolve();
  private active = false;
  private lifetime?: ReviewLifetime;
  private busy = false;
  private review?: MergeReview;
  constructor(app: App, private readonly service: MergeApply,
    private readonly prepare: (current: () => boolean) => Promise<MergeReview>, private readonly history: () => void,
    private readonly release: () => void = () => {}) { super(app); }
  onOpen(): void {
    this.lifetime = new ReviewLifetime(this.app, () => { if (this.review) this.service.discard(this.review); this.error(new SafeApplyError("stale")); });
    this.active = true; this.modalEl.addClass("ai-pair-inspector-modal"); this.contentEl.addClass("ai-change-planner", "ai-merge-apply");
    this.titleEl.setText(tr("@mergeApply.review")); this.contentEl.createEl("p", { text: tr("@safeApply.checking"), attr: { role: "status" } });
    this.pending = this.load();
  }
  private async load(): Promise<void> {
    try {
      const review = await this.prepare(() => this.active && !!this.lifetime?.current());
      if (!this.active || !this.lifetime?.current()) { this.service.discard(review); return; }
      this.review = review; this.contentEl.empty(); this.titleEl.setText(tr(review.action === "undo" ? "@mergeApply.undoReview" : "@mergeApply.review"));
      preview(this.contentEl, review.record, review.action === "undo");
      this.contentEl.createEl("p", { text: tr("@mergeApply.closeScope") });
      const actions = this.contentEl.createDiv({ cls: "ai-consolidation-actions ai-review-actions" });
      control(actions, "confirm", () => { if (!this.busy) this.pending = this.commit(); }).setText(tr(review.action === "undo" ? "@mergeApply.undoConfirm" : "@mergeApply.confirm"));
      control(actions, "cancel", () => this.close()); focusStatus(this.contentEl);
    } catch (e) { this.error(e); }
  }
  private error(error: unknown): void {
    if (!this.active) return;
    this.contentEl.empty(); this.contentEl.createEl("p", { text: tr(`@safeApply.error.${error instanceof SafeApplyError ? error.reason : "stale"}`), attr: { role: "alert" } });
    this.contentEl.createEl("p", { text: tr("@mergeApply.failure") }); control(this.contentEl, "history", () => { this.close(); void this.pending.then(this.history); }); focusStatus(this.contentEl);
  }
  private async commit(): Promise<void> {
    if (!this.active || !this.lifetime?.current() || this.busy || !this.review) return;
    this.lifetime.stop();
    this.busy = true; this.contentEl.empty(); this.contentEl.createEl("p", { text: tr("@safeApply.working"), attr: { role: "status", "aria-live": "polite" } }); focusStatus(this.contentEl);
    try {
      await this.service.execute(this.review);
      refreshReviewFacts(this.app, reviewOutcome(this.review.record, this.review.action === "apply" ? "applied" : "undone"));
      if (!this.active) return;
      this.contentEl.empty(); this.contentEl.createEl("p", { text: tr(this.review.action === "apply" ? "@mergeApply.applied" : "@mergeApply.undone"), attr: { role: "status" } });
      control(this.contentEl, "history", () => { this.close(); void this.pending.then(this.history); }); focusStatus(this.contentEl);
    } catch (e) { this.error(e); } finally { this.busy = false; }
  }
  onClose(): void { this.active = false; this.lifetime?.close(); if (this.review) this.service.discard(this.review); this.contentEl.empty(); void this.pending.then(this.release); }
}
export function renderMergeHistory(root: HTMLElement, row: MergeHistory, review: () => void, archive?: () => void): void {
  const card = root.createEl("section", { cls: "ai-semantic-result-card", attr: { "data-merge-state": row.state, "data-operation-id": row.id } });
  historyHeading(card, tr("@mergeApply.operation"), row.record ? [row.record.secondary.path, row.record.canonical.path] : [], row.record?.createdAt);
  const awaitingArchive = row.archiveReason === "archive_active" && row.canonicalState === "after" && !row.damaged;
  card.createEl("p", { text: tr(awaitingArchive ? "@ux.awaitArchiveUndo" : `@safeApply.state.${row.state}`), attr: { role: "status" } });
  const diagnostic = diagnosticPanel(card, row.id);
  card.createEl("p", { text: tr(`@journal.source.${row.canonicalState}`) });
  if (!awaitingArchive) card.createEl("p", { text: tr(row.secondaryUnchanged ? "@mergeApply.secondary" : "@mergeApply.secondaryChanged") });
  if (row.recovered) card.createEl("p", { text: tr("@safeApply.recovered") });
  if (row.damaged) card.createEl("p", { text: tr("@safeApply.damaged") });
  if (row.state === "conflict" && !awaitingArchive || row.damaged) card.createEl("p", { text: tr("@journal.manual") });
  if (row.editorBlocked) card.createEl("p", { text: tr("@safeApply.error.editor") });
  if (row.archiveReason) card.createEl("p", { text: tr(`@safeApply.error.${row.archiveReason}`) });
  if (row.blocking) card.createEl("p", { text: tr(row.scope === "global" || !row.record ? "@journal.scope.global" : "@journal.scope.local") });
  for (const issue of row.issues) diagnostic.createEl("p", { text: issue, cls: "ai-pair-path" });
  if (row.record) {
    const details = card.createEl("details"); details.createEl("summary", { text: tr("@safeApply.preview") }); preview(details, row.record);
  }
  historyUnavailable(card, row.canUndo, row.state, row.editorBlocked || row.damaged || !!row.archiveReason);
  if (row.canUndo) control(card, "undoReview", review);
  if (archive && row.record && row.canUndo && !row.damaged && !row.recovered && !row.blocking && row.receipts.length > 0 && row.receipts.every(r => r.state === "applied")) {
    const b = card.createEl("button", { text: tr("@archive.title"), attr: { type: "button", "data-archive-action": "open" } });
    b.addEventListener("click", archive);
  } else if (archive) card.createEl("p", { text: tr("@archive.error.basis") });
}
