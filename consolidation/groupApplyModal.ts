import { App, Modal } from "obsidian";
import { t as tr, dateLocale } from "../i18n";
import { SafeApplyError } from "./operationJournal";
import type { GroupApply, GroupHistory, GroupReview } from "./groupApply";
import type { GroupRecord } from "./groupJournal";
import { renderPlanDiff } from "./planDiffView";

function control(root: HTMLElement, key: string, action: () => void): HTMLButtonElement {
  const b = root.createEl("button", { text: tr(`@groupApply.${key}`), attr: { type: "button", "data-group-apply-action": key } });
  b.addEventListener("click", action); return b;
}
function preview(root: HTMLElement, record: GroupRecord, undo = false): void {
  const r = record.plan;
  root.createEl("p", { text: `${r.secondary.path} → ${r.canonical.path}`, cls: "ai-pair-path" });
  root.createEl("p", { text: tr("@groupApply.warning") });
  root.createEl("p", { text: tr("@groupApply.limits") });
  if (undo) root.createEl("p", { text: tr("@groupApply.undoScope") });
  const before = undo ? r.canonical.after : r.canonical.before, after = undo ? r.canonical.before : r.canonical.after;
  for (const [key, text] of [["before", before], ["after", after], ["secondary", r.secondary.content]]) {
    const d = root.createEl("details"); d.open = true;
    d.createEl("summary", { text: tr(key === "secondary" ? "@groupApply.secondary" : `@planner.${key}`) });
    d.createEl("pre", { text, cls: "ai-pair-source", attr: { tabindex: "0", "data-group-apply-text": key } });
  }
  renderPlanDiff(root, before, after);
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
  root.createEl("pre", { text: JSON.stringify(r.insertion, null, 2), cls: "ai-pair-source", attr: { tabindex: "0", "data-group-apply-text": "insertion" } });
  for (const limitation of r.provenance.analysis.limitations) root.createEl("p", { text: limitation });
  root.createEl("p", { text: `${r.secondary.path} · SHA-256: ${record.hashes.secondary}`, cls: "ai-pair-path" });
}
/** A new, revocable consent ticket; displaying the checked plan never writes Markdown. */
export class GroupApplyModal extends Modal {
  private active = false;
  private busy = false;
  private review?: GroupReview;
  constructor(app: App, private readonly service: GroupApply,
    private readonly prepare: (current: () => boolean) => Promise<GroupReview>, private readonly history: () => void,
    private readonly release: () => void = () => {}) { super(app); }
  onOpen(): void {
    this.active = true; this.modalEl.addClass("ai-pair-inspector-modal"); this.contentEl.addClass("ai-change-planner", "ai-group-apply");
    this.titleEl.setText(tr("@groupApply.review")); this.contentEl.createEl("p", { text: tr("@safeApply.checking"), attr: { role: "status" } });
    void this.load();
  }
  private async load(): Promise<void> {
    try {
      const review = await this.prepare(() => this.active);
      if (!this.active) { this.service.discard(review); return; }
      this.review = review; this.contentEl.empty(); this.titleEl.setText(tr(review.action === "undo" ? "@groupApply.undoReview" : "@groupApply.review"));
      preview(this.contentEl, review.record, review.action === "undo");
      this.contentEl.createEl("p", { text: tr("@groupApply.closeScope") });
      control(this.contentEl, "confirm", () => { void this.commit(); }).setText(tr(review.action === "undo" ? "@groupApply.undoConfirm" : "@groupApply.confirm"));
      control(this.contentEl, "cancel", () => this.close());
    } catch (e) { this.error(e); }
  }
  private error(error: unknown): void {
    if (!this.active) return;
    this.contentEl.empty(); this.contentEl.createEl("p", { text: tr(`@safeApply.error.${error instanceof SafeApplyError ? error.reason : "stale"}`), attr: { role: "alert" } });
    this.contentEl.createEl("p", { text: tr("@groupApply.failure") }); control(this.contentEl, "history", this.history);
  }
  private async commit(): Promise<void> {
    if (!this.active || this.busy || !this.review) return;
    this.busy = true; this.contentEl.empty(); this.contentEl.createEl("p", { text: tr("@safeApply.working"), attr: { role: "status", "aria-live": "polite" } });
    try {
      await this.service.execute(this.review);
      if (!this.active) return;
      this.contentEl.empty(); this.contentEl.createEl("p", { text: tr(this.review.action === "apply" ? "@groupApply.applied" : "@groupApply.undone"), attr: { role: "status" } });
      control(this.contentEl, "history", this.history);
    } catch (e) { this.error(e); } finally { this.busy = false; }
  }
  onClose(): void { this.active = false; if (this.review) this.service.discard(this.review); this.contentEl.empty(); this.release(); }
}
export function renderGroupHistory(root: HTMLElement, row: GroupHistory, review: () => void): void {
  const card = root.createEl("section", { cls: "ai-semantic-result-card", attr: { "data-group-state": row.state, "data-operation-id": row.id } });
  card.createEl("h3", { text: `${tr("@groupApply.operation")} · ${row.record ? new Date(row.record.createdAt).toLocaleString(dateLocale()) : ""}` });
  card.createEl("p", { text: tr(`@safeApply.state.${row.state}`), attr: { role: "status" } });
  card.createEl("p", { text: row.id, cls: "ai-pair-path" });
  card.createEl("p", { text: tr(`@journal.source.${row.canonicalState}`) });
  card.createEl("p", { text: tr(row.secondaryUnchanged ? "@groupApply.secondary" : "@groupApply.secondaryChanged") });
  if (row.recovered) card.createEl("p", { text: tr("@safeApply.recovered") });
  if (row.damaged) card.createEl("p", { text: tr("@safeApply.damaged") });
  if (row.state === "conflict" || row.damaged) card.createEl("p", { text: tr("@journal.manual") });
  if (row.editorBlocked) card.createEl("p", { text: tr("@safeApply.error.editor") });
  if (!row.blocking) card.createEl("p", { text: tr("@groupApply.completed") });
  if (row.blocking) card.createEl("p", { text: tr(row.scope === "global" || !row.record ? "@journal.scope.global" : "@journal.scope.local") });
  for (const issue of row.issues) card.createEl("p", { text: issue, cls: "ai-pair-path" });
  if (row.record) {
    const details = card.createEl("details"); details.createEl("summary", { text: tr("@safeApply.preview") }); preview(details, row.record);
  }
  if (row.canUndo) control(card, "undoReview", review);
}
