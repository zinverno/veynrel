import { App, Modal } from "obsidian";
import { t as tr, dateLocale } from "../i18n";
import { SafeApplyError } from "./operationJournal";
import type { MergeApply, MergeHistory, MergeReview } from "./mergeApply";
import type { MergeRecord } from "./mergeJournal";
import { renderPlanDiff } from "./planDiffView";

function control(root: HTMLElement, key: string, action: () => void): HTMLButtonElement {
  const b = root.createEl("button", { text: tr(`@mergeApply.${key}`), attr: { type: "button", "data-merge-apply-action": key } });
  b.addEventListener("click", action); return b;
}
function preview(root: HTMLElement, r: MergeRecord, undo = false): void {
  root.createEl("p", { text: `${r.secondary.path} → ${r.canonical.path}`, cls: "ai-pair-path" });
  root.createEl("p", { text: tr("@mergeApply.warning") });
  root.createEl("p", { text: tr("@mergeApply.limits") });
  if (undo) root.createEl("p", { text: tr("@mergeApply.undoScope") });
  const before = undo ? r.canonical.after : r.canonical.before, after = undo ? r.canonical.before : r.canonical.after;
  for (const [key, text] of [["before", before], ["after", after], ["secondary", r.secondary.content]]) {
    const d = root.createEl("details"); d.open = true;
    d.createEl("summary", { text: tr(key === "secondary" ? "@mergeApply.secondary" : `@planner.${key}`) });
    d.createEl("pre", { text, cls: "ai-pair-source", attr: { tabindex: "0", "data-merge-apply-text": key } });
  }
  renderPlanDiff(root, before, after);
  root.createEl("h4", { text: tr("@merge.copied") });
  for (const t of r.transfers) {
    root.createEl("p", { text: `${t.range.start}–${t.range.end}` });
    root.createEl("pre", { text: t.range.text, cls: "ai-pair-source", attr: { tabindex: "0", "data-merge-apply-text": "copied" } });
  }
  root.createEl("p", { text: tr("@planner.range", { start: r.insertion.anchor.start, end: r.insertion.anchor.end, point: r.insertion.edit.start }) });
  root.createEl("pre", { text: r.insertion.anchor.text, cls: "ai-pair-source", attr: { tabindex: "0", "data-merge-apply-text": "anchor" } });
  root.createEl("p", { text: `${r.secondary.path} · SHA-256: ${r.secondary.hash}`, cls: "ai-pair-path" });
}
/** A new, revocable consent ticket; displaying the checked plan never writes Markdown. */
export class MergeApplyModal extends Modal {
  private active = false;
  private busy = false;
  private review?: MergeReview;
  constructor(app: App, private readonly service: MergeApply,
    private readonly prepare: (current: () => boolean) => Promise<MergeReview>, private readonly history: () => void,
    private readonly release: () => void = () => {}) { super(app); }
  onOpen(): void {
    this.active = true; this.modalEl.addClass("ai-pair-inspector-modal"); this.contentEl.addClass("ai-change-planner", "ai-merge-apply");
    this.titleEl.setText(tr("@mergeApply.review")); this.contentEl.createEl("p", { text: tr("@safeApply.checking"), attr: { role: "status" } });
    void this.load();
  }
  private async load(): Promise<void> {
    try {
      const review = await this.prepare(() => this.active);
      if (!this.active) { this.service.discard(review); return; }
      this.review = review; this.contentEl.empty(); this.titleEl.setText(tr(review.action === "undo" ? "@mergeApply.undoReview" : "@mergeApply.review"));
      preview(this.contentEl, review.record, review.action === "undo");
      this.contentEl.createEl("p", { text: tr("@mergeApply.closeScope") });
      control(this.contentEl, "confirm", () => { void this.commit(); }).setText(tr(review.action === "undo" ? "@mergeApply.undoConfirm" : "@mergeApply.confirm"));
      control(this.contentEl, "cancel", () => this.close());
    } catch (e) { this.error(e); }
  }
  private error(error: unknown): void {
    if (!this.active) return;
    this.contentEl.empty(); this.contentEl.createEl("p", { text: tr(`@safeApply.error.${error instanceof SafeApplyError ? error.reason : "stale"}`), attr: { role: "alert" } });
    this.contentEl.createEl("p", { text: tr("@mergeApply.failure") }); control(this.contentEl, "history", this.history);
  }
  private async commit(): Promise<void> {
    if (!this.active || this.busy || !this.review) return;
    this.busy = true; this.contentEl.empty(); this.contentEl.createEl("p", { text: tr("@safeApply.working"), attr: { role: "status", "aria-live": "polite" } });
    try {
      await this.service.execute(this.review);
      if (!this.active) return;
      this.contentEl.empty(); this.contentEl.createEl("p", { text: tr(this.review.action === "apply" ? "@mergeApply.applied" : "@mergeApply.undone"), attr: { role: "status" } });
      control(this.contentEl, "history", this.history);
    } catch (e) { this.error(e); } finally { this.busy = false; }
  }
  onClose(): void { this.active = false; if (this.review) this.service.discard(this.review); this.contentEl.empty(); this.release(); }
}
export function renderMergeHistory(root: HTMLElement, row: MergeHistory, review: () => void): void {
  const card = root.createEl("section", { cls: "ai-semantic-result-card", attr: { "data-merge-state": row.state, "data-operation-id": row.id } });
  card.createEl("h3", { text: `${tr("@mergeApply.operation")} · ${row.record ? new Date(row.record.createdAt).toLocaleString(dateLocale()) : ""}` });
  card.createEl("p", { text: tr(`@safeApply.state.${row.state}`), attr: { role: "status" } });
  card.createEl("p", { text: row.id, cls: "ai-pair-path" });
  card.createEl("p", { text: tr(`@journal.source.${row.canonicalState}`) });
  card.createEl("p", { text: tr(row.secondaryUnchanged ? "@mergeApply.secondary" : "@mergeApply.secondaryChanged") });
  if (row.recovered) card.createEl("p", { text: tr("@safeApply.recovered") });
  if (row.damaged) card.createEl("p", { text: tr("@safeApply.damaged") });
  if (row.state === "conflict" || row.damaged) card.createEl("p", { text: tr("@journal.manual") });
  if (row.editorBlocked) card.createEl("p", { text: tr("@safeApply.error.editor") });
  if (row.blocking) card.createEl("p", { text: tr(row.scope === "global" || !row.record ? "@journal.scope.global" : "@journal.scope.local") });
  for (const issue of row.issues) card.createEl("p", { text: issue, cls: "ai-pair-path" });
  if (row.record) {
    const details = card.createEl("details"); details.createEl("summary", { text: tr("@safeApply.preview") }); preview(details, row.record);
  }
  if (row.canUndo) control(card, "undoReview", review);
}
