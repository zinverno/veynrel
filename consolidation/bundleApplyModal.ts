import { ReviewLifetime } from "./reviewLifetime";
import { reviewSummary, diagnosticPanel, historyHeading, historyUnavailable, focusStatus, copyDependencies } from "./consolidationUx";
import { App, Modal } from "obsidian";
import { t as tr } from "../i18n";
import { SafeApplyError } from "./operationJournal";
import type { BundleApply, BundleHistory, BundleReview } from "./bundleApply";
import type { BundleRecord } from "./bundleJournal";
import { renderPlanDiff } from "./planDiffView";
import { renderStructuralArchiveAction } from "./archivePlannerModalV2";

function control(root: HTMLElement, key: string, action: () => void): HTMLButtonElement {
  const b = root.createEl("button", { text: tr(`@bundleApply.${key}`), attr: { type: "button", "data-bundle-apply-action": key } });
  b.addEventListener("click", action); return b;
}
function preview(root: HTMLElement, record: BundleRecord, undo = false): void {
  const r = record.plan;
  reviewSummary(root, [r.canonical.path], [r.secondary.path], undo);
  root.createEl("p", { text: tr("@bundleApply.warning") });
  root.createEl("p", { text: tr("@bundleApply.limits") });
  if (undo) root.createEl("p", { text: tr("@bundleApply.undoScope") });
  const before = undo ? r.canonical.after : r.canonical.before, after = undo ? r.canonical.before : r.canonical.after;
  for (const [key, text] of [["before", before], ["after", after], ["secondary", r.secondary.content]]) {
    const d = root.createEl("details"); d.open = false;
    d.createEl("summary", { text: tr(key === "secondary" ? "@bundleApply.secondary" : `@planner.${key}`) });
    d.createEl("pre", { text, cls: "ai-pair-source", attr: { tabindex: "0", "data-bundle-apply-text": key } });
  }
  renderPlanDiff(root, before, after);
  copyDependencies(root, r.dependencies);
  root.createEl("h4", { text: tr("@merge.copied") });
  root.createEl("p", { text: tr(`@bundle.kind.${r.kind}`) });
  for (const t of r.bundle.blocks) {
    root.createEl("p", { text: tr(`@bundle.role.${t.role}`) });
    root.createEl("p", { text: `${t.range.start}–${t.range.end}` });
    root.createEl("pre", { text: t.range.text, cls: "ai-pair-source", attr: { tabindex: "0", "data-bundle-apply-text": "copied" } });
  }
  root.createEl("p", { text: tr("@bundle.eof", { point: r.insertion.point }) });
  const diagnostic = diagnosticPanel(root);
  diagnostic.createEl("pre", { text: JSON.stringify(r.insertion, null, 2), cls: "ai-pair-source", attr: { tabindex: "0", "data-bundle-apply-text": "insertion" } });
  diagnostic.createEl("p", { text: `${r.secondary.path} · SHA-256: ${record.hashes.secondary}`, cls: "ai-pair-path" });
}
/** A new, revocable consent ticket; displaying the checked plan never writes Markdown. */
export class BundleApplyModal extends Modal {
  private pending: Promise<void> = Promise.resolve();
  private active = false;
  private lifetime?: ReviewLifetime;
  private busy = false;
  private review?: BundleReview;
  constructor(app: App, private readonly service: BundleApply,
    private readonly prepare: (current: () => boolean) => Promise<BundleReview>, private readonly history: () => void,
    private readonly release: () => void = () => {}) { super(app); }
  onOpen(): void {
    this.lifetime = new ReviewLifetime(this.app, () => { if (this.review) this.service.discard(this.review); this.error(new SafeApplyError("stale")); });
    this.active = true; this.modalEl.addClass("ai-pair-inspector-modal"); this.contentEl.addClass("ai-change-planner", "ai-bundle-apply");
    this.titleEl.setText(tr("@bundleApply.review")); this.contentEl.createEl("p", { text: tr("@safeApply.checking"), attr: { role: "status" } });
    this.pending = this.load();
  }
  private async load(): Promise<void> {
    try {
      const review = await this.prepare(() => this.active && !!this.lifetime?.current());
      if (!this.active || !this.lifetime?.current()) { this.service.discard(review); return; }
      this.review = review; this.contentEl.empty(); this.titleEl.setText(tr(review.action === "undo" ? "@bundleApply.undoReview" : "@bundleApply.review"));
      preview(this.contentEl, review.record, review.action === "undo");
      this.contentEl.createEl("p", { text: tr("@bundleApply.closeScope") });
      control(this.contentEl, "confirm", () => { if (!this.busy) this.pending = this.commit(); }).setText(tr(review.action === "undo" ? "@bundleApply.undoConfirm" : "@bundleApply.confirm"));
      control(this.contentEl, "cancel", () => this.close()); focusStatus(this.contentEl);
    } catch (e) { this.error(e); }
  }
  private error(error: unknown): void {
    if (!this.active) return;
    this.contentEl.empty(); this.contentEl.createEl("p", { text: tr(error instanceof SafeApplyError && error.reason === "archive_chain" ? "@structuralArchive.error.archive_chain" : `@safeApply.error.${error instanceof SafeApplyError ? error.reason : "stale"}`), attr: { role: "alert" } });
    this.contentEl.createEl("p", { text: tr("@bundleApply.failure") }); control(this.contentEl, "history", () => { this.close(); void this.pending.then(this.history); }); focusStatus(this.contentEl);
  }
  private async commit(): Promise<void> {
    if (!this.active || !this.lifetime?.current() || this.busy || !this.review) return;
    this.lifetime.stop();
    this.busy = true; this.contentEl.empty(); this.contentEl.createEl("p", { text: tr("@safeApply.working"), attr: { role: "status", "aria-live": "polite" } }); focusStatus(this.contentEl);
    try {
      await this.service.execute(this.review);
      if (!this.active) return;
      this.contentEl.empty(); this.contentEl.createEl("p", { text: tr(this.review.action === "apply" ? "@bundleApply.applied" : "@bundleApply.undone"), attr: { role: "status" } });
      control(this.contentEl, "history", () => { this.close(); void this.pending.then(this.history); }); focusStatus(this.contentEl);
    } catch (e) { this.error(e); } finally { this.busy = false; }
  }
  onClose(): void { this.active = false; this.lifetime?.close(); if (this.review) this.service.discard(this.review); this.contentEl.empty(); void this.pending.then(this.release); }
}
export function renderBundleHistory(root: HTMLElement, row: BundleHistory, review: () => void, archive?: () => void): void {
  const card = root.createEl("section", { cls: "ai-semantic-result-card", attr: { "data-bundle-state": row.state, "data-operation-id": row.id } });
  historyHeading(card, tr("@bundleApply.operation"), row.record ? [row.record.plan.secondary.path, row.record.plan.canonical.path] : [], row.record?.createdAt);
  const awaitingArchive = row.archiveReason === "archive_active" && row.canonicalState === "after" && !row.damaged;
  card.createEl("p", { text: tr(awaitingArchive ? "@ux.awaitArchiveUndo" : `@safeApply.state.${row.state}`), attr: { role: "status" } });
  const diagnostic = diagnosticPanel(card, row.id);
  card.createEl("p", { text: tr(`@journal.source.${row.canonicalState}`) });
  if (!awaitingArchive) card.createEl("p", { text: tr(row.secondaryUnchanged ? "@bundleApply.secondary" : "@bundleApply.secondaryChanged") });
  if (row.recovered) card.createEl("p", { text: tr("@safeApply.recovered") });
  if (row.damaged) card.createEl("p", { text: tr("@safeApply.damaged") });
  if (row.state === "conflict" && !awaitingArchive || row.damaged) card.createEl("p", { text: tr("@journal.manual") });
  if (row.archiveReason) card.createEl("p", { text: tr(row.archiveReason === "archive_chain" ? "@structuralArchive.error.archive_chain" : "@safeApply.error.archive_active"), attr: { role: "alert" } });
  if (row.editorBlocked) card.createEl("p", { text: tr("@safeApply.error.editor") });
  if (row.blocking) card.createEl("p", { text: tr(row.scope === "global" || !row.record ? "@journal.scope.global" : "@journal.scope.local") });
  for (const issue of row.issues) diagnostic.createEl("p", { text: issue, cls: "ai-pair-path" });
  if (row.record) {
    const details = card.createEl("details"); details.createEl("summary", { text: tr("@safeApply.preview") }); preview(details, row.record);
  }
  historyUnavailable(card, row.canUndo, row.state, row.editorBlocked || row.damaged || !!row.archiveReason);
  if (row.canUndo) control(card, "undoReview", review);
  if (archive) renderStructuralArchiveAction(card, row, archive);
}
