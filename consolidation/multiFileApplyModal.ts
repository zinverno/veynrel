import { ReviewLifetime } from "./reviewLifetime";
import { reviewSummary, diagnosticPanel, historyHeading, historyUnavailable, focusStatus } from "./consolidationUx";
import { App, Modal } from "obsidian";
import { t as tr } from "../i18n";
import { SafeApplyError } from "./operationJournal";
import type { MultiFileApply, MultiHistory, MultiReview } from "./multiFileApply";
import type { MultiRecord } from "./multiFileJournal";
import { renderPlanDiff } from "./planDiffView";

function control(root: HTMLElement, key: string, action: () => void): HTMLButtonElement {
  const b = root.createEl("button", { text: tr(`@multiSafe.${key}`), attr: { type: "button", "data-multi-action": key } });
  b.addEventListener("click", action); return b;
}
function preview(root: HTMLElement, r: MultiRecord, action: MultiReview["action"] = "apply"): void {
  root.createEl("p", { text: tr("@planner.op.add_reciprocal_links") });
  const both = action === "apply" || action === "undo";
  reviewSummary(root, r.files.slice(0, both ? 2 : 1).map(f => f.path), both ? [] : [r.files[1].path], action !== "apply");
  for (const [i, f] of r.files.entries()) {
    const card = root.createEl("section", { cls: "ai-semantic-result-card", attr: { "data-multi-preview": f.path } });
    card.createEl("h4", { text: f.path });
    diagnosticPanel(card).createEl("p", { text: `SHA-256: ${f.beforeHash} → ${f.afterHash}`, cls: "ai-pair-path" });
    card.createEl("p", { text: tr("@planner.range", { start: f.selection.start, end: f.selection.end, point: f.edit.start }) });
    const before = action === "apply" || (i === 1 && action !== "undo") ? f.before : f.after, after = action === "apply" ? f.after : f.before;
    for (const [key, text] of [["before", before], ["after", after]]) {
      const details = card.createEl("details"); details.createEl("summary", { text: tr(`@planner.${key}`) });
      details.createEl("pre", { text, cls: "ai-pair-source", attr: { tabindex: "0" } });
    }
    renderPlanDiff(card, before, after);
  }
}
/** Separate consent, never shares the analyzer's request consent. Closing after dispatch cannot cancel recovery bookkeeping. */
export class MultiFileApplyModal extends Modal {
  private pending: Promise<void> = Promise.resolve();
  private active = false;
  private lifetime?: ReviewLifetime;
  private busy = false;
  private review?: MultiReview;
  constructor(app: App, private readonly service: MultiFileApply,
    private readonly prepare: (current: () => boolean) => Promise<MultiReview>, private readonly history: () => void,
    private readonly release: () => void = () => {}) { super(app); }
  onOpen(): void {
    this.lifetime = new ReviewLifetime(this.app, () => { if (this.review) this.service.discard(this.review); this.error(new SafeApplyError("stale")); });
    this.active = true; this.modalEl.addClass("ai-pair-inspector-modal"); this.contentEl.addClass("ai-change-planner", "ai-multi-apply");
    this.titleEl.setText(tr("@multiSafe.review")); this.contentEl.createEl("p", { text: tr("@safeApply.checking"), attr: { role: "status" } });
    this.pending = this.load();
  }
  private async load(): Promise<void> {
    try {
      const review = await this.prepare(() => this.active && !!this.lifetime?.current());
      if (!this.active || !this.lifetime?.current()) { this.service.discard(review); return; }
      this.review = review; this.contentEl.empty();
      this.contentEl.createEl("p", { text: tr(`@multiSafe.action.${review.action}`) });
      this.contentEl.createEl("p", { text: tr("@multiSafe.warning") });
      this.contentEl.createEl("p", { text: tr("@multiSafe.closeScope") });
      preview(this.contentEl, review.record, review.action);
      const actions = this.contentEl.createDiv({ cls: "ai-consolidation-actions ai-review-actions" });
      control(actions, "confirm", () => { if (!this.busy) this.pending = this.commit(); }).setText(tr(`@multiSafe.confirm.${review.action}`));
      control(actions, "cancel", () => this.close()); focusStatus(this.contentEl);
    } catch (e) { this.error(e); }
  }
  private error(error: unknown): void {
    if (!this.active) return;
    this.contentEl.empty(); this.contentEl.createEl("p", { text: tr(`@safeApply.error.${error instanceof SafeApplyError ? error.reason : "stale"}`), attr: { role: "alert" } });
    this.contentEl.createEl("p", { text: tr("@multiSafe.failure") }); control(this.contentEl, "history", () => { this.close(); void this.pending.then(this.history); }); focusStatus(this.contentEl);
  }
  private async commit(): Promise<void> {
    if (!this.active || !this.lifetime?.current() || this.busy || !this.review) return;
    this.lifetime.stop();
    this.busy = true; this.contentEl.empty(); this.contentEl.createEl("p", { text: tr("@safeApply.working"), attr: { role: "status", "aria-live": "polite" } }); focusStatus(this.contentEl);
    try {
      await this.service.execute(this.review);
      if (!this.active) return;
      this.contentEl.empty(); this.contentEl.createEl("p", { text: tr(this.review.action === "apply" ? "@multiSafe.state.applied" : "@multiSafe.state.undone"), attr: { role: "status" } });
      control(this.contentEl, "history", () => { this.close(); void this.pending.then(this.history); }); focusStatus(this.contentEl);
    } catch (e) { this.error(e); } finally { this.busy = false; }
  }
  onClose(): void { this.active = false; this.lifetime?.close(); if (this.review) this.service.discard(this.review); this.contentEl.empty(); void this.pending.then(this.release); }
}
export function renderMultiHistory(root: HTMLElement, row: MultiHistory, review: () => void): void {
  const card = root.createEl("section", { cls: "ai-semantic-result-card", attr: { "data-multi-state": row.state, "data-operation-id": row.id } });
  historyHeading(card, tr("@planner.op.add_reciprocal_links"), row.record ? row.record.files.map(f => f.path) : [], row.record?.createdAt);
  card.createEl("p", { text: tr(`@multiSafe.state.${row.state}`), attr: { role: "status" } });
  const diagnostic = diagnosticPanel(card, row.id);
  if (row.recovered) card.createEl("p", { text: tr("@safeApply.recovered") });
  if (row.markerWarnings) card.createEl("p", { text: tr("@multiSafe.markers") });
  if (row.damaged) card.createEl("p", { text: tr("@multiSafe.damaged") });
  if (row.state === "conflict" || row.damaged) card.createEl("p", { text: tr("@journal.manual") });
  if (row.editorBlocked) card.createEl("p", { text: tr("@safeApply.error.editor") });
  if (row.blocking) card.createEl("p", { text: tr(row.scope === "global" || !row.record ? "@journal.scope.global" : "@journal.scope.local") });
  for (const issue of row.issues) diagnostic.createEl("p", { text: issue, cls: "ai-pair-path" });
  if (row.record) {
    for (const [i, f] of row.record.files.entries()) card.createEl("p", { text: `${f.path}: ${tr(`@journal.source.${row.participants[i] ?? "unknown"}`)}` });
    const details = card.createEl("details"); details.createEl("summary", { text: tr("@safeApply.preview") }); preview(details, row.record);
  }
  historyUnavailable(card, !!row.action, row.state, row.editorBlocked || row.damaged);
  if (row.action) control(card, `action.${row.action}`, review);
}
