import { App, Modal } from "obsidian";
import { t as tr, dateLocale } from "../i18n";
import { SafeApplyError } from "./operationJournal";
import type { ArchiveApply, ArchiveReview, ArchiveHistory } from "./archiveApply";
import type { ArchiveRecord } from "./archiveJournal";
import { renderPlanDiff } from "./planDiffView";

function button(root: HTMLElement, key: string, action: () => void): HTMLButtonElement {
  const b = root.createEl("button", { text: tr(`@archiveApply.${key}`), attr: { type: "button", "data-archive-apply-action": key } });
  b.addEventListener("click", action); return b;
}
function preview(root: HTMLElement, r: ArchiveRecord, undo = false): void {
  const p = r.plan;
  root.createEl("p", { text: `${p.secondary.path} → ${p.canonical.path}`, cls: "ai-pair-path" });
  root.createEl("p", { text: `${tr("@archive.provenance")}: ${p.provenance.id} · SHA-256: ${p.provenance.recordHash}`, cls: "ai-pair-path" });
  root.createEl("p", { text: tr("@archiveApply.scope") });
  if (undo) root.createEl("p", { text: tr("@archiveApply.undoScope") });
  const before = undo ? p.secondary.after : p.secondary.before, after = undo ? p.secondary.before : p.secondary.after;
  for (const [key, text] of [["before", before], ["after", after], ["canonical", p.canonical.content]]) {
    const details = root.createEl("details"); details.open = true;
    details.createEl("summary", { text: tr(key === "canonical" ? "@archive.canonical" : `@planner.${key}`) });
    details.createEl("pre", { text, cls: "ai-pair-source", attr: { tabindex: "0", "data-archive-apply-text": key } });
  }
  renderPlanDiff(root, before, after);
  root.createEl("h3", { text: tr("@archive.preservation") });
  for (const f of p.preservation) {
    root.createEl("p", { text: `${f.range.start}–${f.range.end} · ${tr(`@archive.disposition.${f.disposition}`)}` });
    root.createEl("pre", { text: f.range.text, cls: "ai-pair-source", attr: { tabindex: "0", "data-archive-apply-text": "fragment" } });
  }
  const warnings = root.createEl("ul");
  for (const warning of p.limitations.filter(w => w !== "read_only")) warnings.createEl("li", { text: tr(`@archive.limit.${warning}`) });
  root.createEl("p", { text: tr("@archiveApply.chain") });
}
/** A separate confirmation ticket. Merely opening this modal never writes recovery data or Markdown. */
export class ArchiveApplyModal extends Modal {
  private active = false;
  private busy = false;
  private review?: ArchiveReview;
  constructor(app: App, private readonly service: ArchiveApply, private readonly prepare: (current: () => boolean) => Promise<ArchiveReview>,
    private readonly history: () => void, private readonly release: () => void = () => {}) { super(app); }
  onOpen(): void {
    this.active = true; this.modalEl.addClass("ai-pair-inspector-modal"); this.contentEl.addClass("ai-change-planner", "ai-archive-apply");
    this.titleEl.setText(tr("@archiveApply.review")); this.contentEl.createEl("p", { text: tr("@safeApply.checking"), attr: { role: "status" } }); void this.load();
  }
  private async load(): Promise<void> {
    try {
      const r = await this.prepare(() => this.active);
      if (!this.active) { this.service.discard(r); return; }
      this.review = r; this.contentEl.empty(); this.titleEl.setText(tr(r.action === "undo" ? "@archiveApply.undoReview" : "@archiveApply.review"));
      preview(this.contentEl, r.record, r.action === "undo"); this.contentEl.createEl("p", { text: tr("@archiveApply.closeScope") });
      button(this.contentEl, "confirm", () => { void this.commit(); }).setText(tr(r.action === "undo" ? "@archiveApply.undoConfirm" : "@archiveApply.confirm"));
      button(this.contentEl, "cancel", () => this.close());
    } catch (e) { this.error(e); }
  }
  private error(e: unknown): void {
    if (!this.active) return;
    this.contentEl.empty(); this.contentEl.createEl("p", { text: tr(`@safeApply.error.${e instanceof SafeApplyError ? e.reason : "stale"}`), attr: { role: "alert" } });
    this.contentEl.createEl("p", { text: tr("@archiveApply.failure") }); button(this.contentEl, "history", this.history);
  }
  private async commit(): Promise<void> {
    if (!this.active || this.busy || !this.review) return;
    this.busy = true; this.contentEl.empty(); this.contentEl.createEl("p", { text: tr("@safeApply.working"), attr: { role: "status", "aria-live": "polite" } });
    try {
      await this.service.execute(this.review);
      if (!this.active) return;
      this.contentEl.empty(); this.contentEl.createEl("p", { text: tr(this.review.action === "apply" ? "@archiveApply.applied" : "@archiveApply.undone"), attr: { role: "status" } });
      button(this.contentEl, "history", this.history);
    } catch (e) { this.error(e); } finally { this.busy = false; }
  }
  onClose(): void { this.active = false; if (this.review) this.service.discard(this.review); this.contentEl.empty(); this.release(); }
}
export function renderArchiveHistory(root: HTMLElement, row: ArchiveHistory, undo: () => void): void {
  const card = root.createEl("section", { cls: "ai-semantic-result-card", attr: { "data-archive-state": row.state, "data-operation-id": row.id } });
  card.createEl("h3", { text: `${tr("@archiveApply.operation")} · ${row.record ? new Date(row.record.createdAt).toLocaleString(dateLocale()) : ""}` });
  card.createEl("p", { text: tr(`@archiveApply.state.${row.state}`), attr: { role: "status" } });
  card.createEl("p", { text: row.id, cls: "ai-pair-path" });
  if (row.recovered) card.createEl("p", { text: tr("@safeApply.recovered") });
  if (row.damaged) card.createEl("p", { text: tr("@safeApply.damaged") });
  if (row.editorBlocked) card.createEl("p", { text: tr("@safeApply.error.editor") });
  card.createEl("p", { text: tr(`@archiveApply.parent.${row.parentUndo}`) });
  if (row.state === "conflict" || row.damaged || row.parentUndo === "chain_incomplete") card.createEl("p", { text: tr("@journal.manual") });
  for (const issue of row.issues) card.createEl("p", { text: issue, cls: "ai-pair-path" });
  if (row.record) {
    card.createEl("p", { text: `${tr("@archive.provenance")}: ${row.record.parent.id}`, cls: "ai-pair-path" });
    const details = card.createEl("details"); details.createEl("summary", { text: tr("@safeApply.preview") }); preview(details, row.record);
  }
  if (row.canUndo) button(card, "undoReview", undo);
}
