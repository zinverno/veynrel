import { ReviewLifetime } from "./reviewLifetime";
import { reviewSummary, diagnosticPanel, historyHeading, historyUnavailable, focusStatus, copyDependencies } from "./consolidationUx";
import { App, Modal } from "obsidian";
import { t as tr } from "../i18n";
import { SafeApplyError } from "./operationJournal";
import type { GroupApply, GroupHistory, GroupReview } from "./groupApply";
import type { GroupRecord } from "./groupJournal";
import { renderPlanDiff } from "./planDiffView";
import { renderStructuralArchiveAction } from "./archivePlannerModalV2";

function control(root: HTMLElement, key: string, action: () => void): HTMLButtonElement {
  const b = root.createEl("button", { text: tr(`@groupApply.${key}`), attr: { type: "button", "data-group-apply-action": key } });
  b.addEventListener("click", action); return b;
}
function preview(root: HTMLElement, record: GroupRecord, undo = false): void {
  const r = record.plan;
  reviewSummary(root, [r.canonical.path], [r.secondary.path], undo);
  root.createEl("p", { text: tr("@groupApply.warning") });
  root.createEl("p", { text: tr("@groupApply.limits") });
  if (undo) root.createEl("p", { text: tr("@groupApply.undoScope") });
  const before = undo ? r.canonical.after : r.canonical.before, after = undo ? r.canonical.before : r.canonical.after;
  for (const [key, text] of [["before", before], ["after", after], ["secondary", r.secondary.content]]) {
    const d = root.createEl("details"); d.open = false;
    d.createEl("summary", { text: tr(key === "secondary" ? "@groupApply.secondary" : `@planner.${key}`) });
    d.createEl("pre", { text, cls: "ai-pair-source", attr: { tabindex: "0", "data-group-apply-text": key } });
  }
  renderPlanDiff(root, before, after);
  copyDependencies(root, r.dependencies);
  root.createEl("h4", { text: tr("@group.tree") });
  root.createEl("p", { text: r.group.path.map(i => r.hierarchy.source[i].range.text).join(" → ") });
  for (const [key, ranges] of [["copied", r.group.copied], ["retained", r.group.retained]] as const) {
    root.createEl("h4", { text: tr(key === "copied" ? "@merge.copied" : "@group.retained") });
    for (const range of ranges) {
      root.createEl("p", { text: `${range.start}–${range.end}${r.group.context.some(c => c.start === range.start) ? ` · ${tr("@group.context")}` : ""}` });
      root.createEl("pre", { text: range.text, cls: "ai-pair-source", attr: { tabindex: "0", "data-group-apply-text": key } });
    }
  }
  root.createEl("h4", { text: tr("@group.expected") });
  for (const h of r.hierarchy.inserted) root.createEl("p", { text: `H${h.level} → H${h.level} · ${h.sourceOffset} → ${h.destinationOffset} · ${h.text}` });
  root.createEl("p", { text: tr("@group.eof", { point: r.insertion.point }) });
  const diagnostic = diagnosticPanel(root);
  diagnostic.createEl("pre", { text: JSON.stringify(r.insertion, null, 2), cls: "ai-pair-source", attr: { tabindex: "0", "data-group-apply-text": "insertion" } });
  for (const limitation of r.provenance.analysis.limitations) root.createEl("p", { text: limitation });
  diagnostic.createEl("p", { text: `${r.secondary.path} · SHA-256: ${record.hashes.secondary}`, cls: "ai-pair-path" });
}
/** A new, revocable consent ticket; displaying the checked plan never writes Markdown. */
export class GroupApplyModal extends Modal {
  private pending: Promise<void> = Promise.resolve();
  private active = false;
  private lifetime?: ReviewLifetime;
  private busy = false;
  private review?: GroupReview;
  constructor(app: App, private readonly service: GroupApply,
    private readonly prepare: (current: () => boolean) => Promise<GroupReview>, private readonly history: () => void,
    private readonly release: () => void = () => {}) { super(app); }
  onOpen(): void {
    this.lifetime = new ReviewLifetime(this.app, () => { if (this.review) this.service.discard(this.review); this.error(new SafeApplyError("stale")); });
    this.active = true; this.modalEl.addClass("ai-pair-inspector-modal"); this.contentEl.addClass("ai-change-planner", "ai-group-apply");
    this.titleEl.setText(tr("@groupApply.review")); this.contentEl.createEl("p", { text: tr("@safeApply.checking"), attr: { role: "status" } });
    this.pending = this.load();
  }
  private async load(): Promise<void> {
    try {
      const review = await this.prepare(() => this.active && !!this.lifetime?.current());
      if (!this.active || !this.lifetime?.current()) { this.service.discard(review); return; }
      this.review = review; this.contentEl.empty(); this.titleEl.setText(tr(review.action === "undo" ? "@groupApply.undoReview" : "@groupApply.review"));
      preview(this.contentEl, review.record, review.action === "undo");
      this.contentEl.createEl("p", { text: tr("@groupApply.closeScope") });
      const actions = this.contentEl.createDiv({ cls: "ai-consolidation-actions ai-review-actions" });
      control(actions, "confirm", () => { if (!this.busy) this.pending = this.commit(); }).setText(tr(review.action === "undo" ? "@groupApply.undoConfirm" : "@groupApply.confirm"));
      control(actions, "cancel", () => this.close()); focusStatus(this.contentEl);
    } catch (e) { this.error(e); }
  }
  private error(error: unknown): void {
    if (!this.active) return;
    this.contentEl.empty(); this.contentEl.createEl("p", { text: tr(error instanceof SafeApplyError && error.reason === "archive_chain" ? "@structuralArchive.error.archive_chain" : `@safeApply.error.${error instanceof SafeApplyError ? error.reason : "stale"}`), attr: { role: "alert" } });
    this.contentEl.createEl("p", { text: tr("@groupApply.failure") }); control(this.contentEl, "history", () => { this.close(); void this.pending.then(this.history); }); focusStatus(this.contentEl);
  }
  private async commit(): Promise<void> {
    if (!this.active || !this.lifetime?.current() || this.busy || !this.review) return;
    this.lifetime.stop();
    this.busy = true; this.contentEl.empty(); this.contentEl.createEl("p", { text: tr("@safeApply.working"), attr: { role: "status", "aria-live": "polite" } }); focusStatus(this.contentEl);
    try {
      await this.service.execute(this.review);
      if (!this.active) return;
      this.contentEl.empty(); this.contentEl.createEl("p", { text: tr(this.review.action === "apply" ? "@groupApply.applied" : "@groupApply.undone"), attr: { role: "status" } });
      control(this.contentEl, "history", () => { this.close(); void this.pending.then(this.history); }); focusStatus(this.contentEl);
    } catch (e) { this.error(e); } finally { this.busy = false; }
  }
  onClose(): void { this.active = false; this.lifetime?.close(); if (this.review) this.service.discard(this.review); this.contentEl.empty(); void this.pending.then(this.release); }
}
export function renderGroupHistory(root: HTMLElement, row: GroupHistory, review: () => void, archive?: () => void): void {
  const card = root.createEl("section", { cls: "ai-semantic-result-card", attr: { "data-group-state": row.state, "data-operation-id": row.id } });
  historyHeading(card, tr("@groupApply.operation"), row.record ? [row.record.plan.secondary.path, row.record.plan.canonical.path] : [], row.record?.createdAt);
  const awaitingArchive = row.archiveReason === "archive_active" && row.canonicalState === "after" && !row.damaged;
  card.createEl("p", { text: tr(awaitingArchive ? "@ux.awaitArchiveUndo" : `@safeApply.state.${row.state}`), attr: { role: "status" } });
  const diagnostic = diagnosticPanel(card, row.id);
  card.createEl("p", { text: tr(`@journal.source.${row.canonicalState}`) });
  if (!awaitingArchive) card.createEl("p", { text: tr(row.secondaryUnchanged ? "@groupApply.secondary" : "@groupApply.secondaryChanged") });
  if (row.recovered) card.createEl("p", { text: tr("@safeApply.recovered") });
  if (row.damaged) card.createEl("p", { text: tr("@safeApply.damaged") });
  if (row.state === "conflict" && !awaitingArchive || row.damaged) card.createEl("p", { text: tr("@journal.manual") });
  if (row.archiveReason) card.createEl("p", { text: tr(row.archiveReason === "archive_chain" ? "@structuralArchive.error.archive_chain" : "@safeApply.error.archive_active"), attr: { role: "alert" } });
  if (row.editorBlocked) card.createEl("p", { text: tr("@safeApply.error.editor") });
  if (!row.blocking) card.createEl("p", { text: tr("@groupApply.completed") });
  if (row.blocking) card.createEl("p", { text: tr(row.scope === "global" || !row.record ? "@journal.scope.global" : "@journal.scope.local") });
  for (const issue of row.issues) diagnostic.createEl("p", { text: issue, cls: "ai-pair-path" });
  if (row.record) {
    const details = card.createEl("details"); details.createEl("summary", { text: tr("@safeApply.preview") }); preview(details, row.record);
  }
  historyUnavailable(card, row.canUndo, row.state, row.editorBlocked || row.damaged || !!row.archiveReason);
  if (row.canUndo) control(card, "undoReview", review);
  if (archive) renderStructuralArchiveAction(card, row, archive);
}
