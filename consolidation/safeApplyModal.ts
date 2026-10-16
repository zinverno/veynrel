import { App, Modal } from "obsidian";
import { dateLocale, t as tr } from "../i18n";
import { SafeApplyError } from "./operationJournal";
import type { ApplyReview, SafeApplyService, OperationHistory } from "./safeApply";
import { renderPlanDiff } from "./planDiffView";

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

/** A fresh consent window, independent of the LLM consent and of disposable planner rendering. */
export class SafeApplyModal extends Modal {
  private active = false;
  private review?: ApplyReview;
  private busy = false;
  constructor(app: App, private readonly service: SafeApplyService,
    private readonly prepare: (current: () => boolean) => Promise<ApplyReview | null>, private readonly undo = false,
    private readonly release: () => void = () => {}) { super(app); }
  onOpen(): void {
    this.active = true; this.modalEl.addClass("ai-pair-inspector-modal"); this.contentEl.addClass("ai-change-planner", "ai-safe-apply");
    this.titleEl.setText(tr(this.undo ? "@safeApply.undoReview" : "@safeApply.review"));
    this.contentEl.createEl("p", { text: tr("@safeApply.checking"), attr: { role: "status" } });
    void this.load();
  }
  private async load(): Promise<void> {
    try {
      const review = await this.prepare(() => this.active);
      if (!this.active) { if (review) this.service.discard(review); return; }
      this.contentEl.empty();
      if (!review) { this.contentEl.createEl("p", { text: tr("@safeApply.noChange") }); return; }
      this.review = review;
      this.contentEl.createEl("p", { text: review.sourcePath });
      this.contentEl.createEl("p", { text: tr("@safeApply.warning") });
      preview(this.contentEl, this.undo ? review.after : review.before, this.undo ? review.before : review.after);
      button(this.contentEl, this.undo ? "undoConfirm" : "confirm", () => { void this.commit(); });
      button(this.contentEl, "cancel", () => this.close());
    } catch (error) { this.showError(error); }
  }
  private showError(error: unknown): void {
    if (!this.active) return;
    this.contentEl.empty(); this.contentEl.createEl("p", { text: message(error), attr: { role: "alert" } });
    button(this.contentEl, "history", () => new OperationHistoryModal(this.app, this.service).open());
  }
  private async commit(): Promise<void> {
    if (this.busy || !this.review || !this.active) return;
    this.busy = true;
    this.contentEl.empty(); this.contentEl.createEl("p", { text: tr("@safeApply.working"), attr: { role: "status", "aria-live": "polite" } });
    try {
      if (this.undo) await this.service.undo(this.review); else await this.service.apply(this.review);
      if (!this.active) return;
      this.contentEl.empty(); this.contentEl.createEl("p", { text: tr(this.undo ? "@safeApply.undone" : "@safeApply.applied"), attr: { role: "status" } });
      if (!this.undo) button(this.contentEl, "undo", () => new SafeApplyModal(this.app, this.service, current => this.service.reviewUndo(this.review!.id, current), true).open());
      button(this.contentEl, "history", () => new OperationHistoryModal(this.app, this.service).open());
    } catch (error) { this.showError(error); }
    finally { this.busy = false; }
  }
  onClose(): void { this.active = false; if (this.review) this.service.discard(this.review); this.contentEl.empty(); this.release(); }
}

export class OperationHistoryModal extends Modal {
  private active = false;
  private generation = 0;
  constructor(app: App, private readonly service: SafeApplyService, private readonly release: () => void = () => {}) { super(app); }
  onOpen(): void {
    this.active = true; this.modalEl.addClass("ai-pair-inspector-modal"); this.contentEl.addClass("ai-change-planner", "ai-operation-history");
    this.titleEl.setText(tr("@safeApply.history")); void this.refresh();
  }
  private async refresh(): Promise<void> {
    const generation = ++this.generation;
    this.contentEl.empty(); this.contentEl.createEl("p", { text: tr("@safeApply.checking"), attr: { role: "status" } });
    try {
      const rows = await this.service.history();
      if (!this.active || this.generation !== generation) return;
      this.contentEl.empty(); this.contentEl.createEl("p", { text: tr("@safeApply.historyScope") });
      button(this.contentEl, "refresh", () => { void this.refresh(); });
      if (!rows.length) this.contentEl.createEl("p", { text: tr("@safeApply.empty") });
      for (const row of rows) this.row(row);
    } catch (error) {
      if (this.active && this.generation === generation) {
        this.contentEl.empty(); this.contentEl.createEl("p", { text: message(error), attr: { role: "alert" } });
        button(this.contentEl, "refresh", () => { void this.refresh(); });
      }
    }
  }
  private row(row: OperationHistory): void {
    const card = this.contentEl.createEl("section", { cls: "ai-semantic-result-card", attr: { "data-operation-state": row.state } });
    const r = row.record;
    card.createEl("h3", { text: r ? `${new Date(r.createdAt).toLocaleString(dateLocale())} · ${tr(`@planner.op.${r.operation}`)}` : row.id });
    card.createEl("p", { text: tr(`@safeApply.state.${row.state}`), attr: { role: "status" } });
    if (row.recovered) card.createEl("p", { text: tr("@safeApply.recovered") });
    if (row.damaged) card.createEl("p", { text: tr("@safeApply.damaged") });
    if (!r) return;
    card.createEl("p", { text: `${r.sourcePath} → ${r.targetPath}` });
    const details = card.createEl("details"); details.createEl("summary", { text: tr("@safeApply.preview") });
    preview(details, r.before, r.after);
    if (row.canUndo) button(card, "undo", () => new SafeApplyModal(this.app, this.service, current => this.service.reviewUndo(row.id, current), true, () => { if (this.active) void this.refresh(); }).open());
    else if (row.state === "applied") card.createEl("p", { text: tr("@safeApply.error.editor") });
  }
  onClose(): void { this.active = false; this.generation++; this.contentEl.empty(); this.release(); }
}
