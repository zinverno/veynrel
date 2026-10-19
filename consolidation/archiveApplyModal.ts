import { ReviewLifetime } from "./reviewLifetime";
import { reviewSummary, diagnosticPanel, historyHeading, historyUnavailable, focusStatus } from "./consolidationUx";
import { App, Modal } from "obsidian";
import { t as tr } from "../i18n";
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
  reviewSummary(root, [p.secondary.path], [p.canonical.path], undo);
  diagnosticPanel(root).createEl("p", { text: `${tr("@archive.provenance")}: ${p.provenance.id} · SHA-256: ${p.provenance.recordHash}`, cls: "ai-pair-path" });
  root.createEl("p", { text: tr("@archiveApply.scope") });
  if (undo) root.createEl("p", { text: tr("@archiveApply.undoScope") });
  const before = undo ? p.secondary.after : p.secondary.before, after = undo ? p.secondary.before : p.secondary.after;
  for (const [key, text] of [["before", before], ["after", after], ["canonical", p.canonical.content]]) {
    const details = root.createEl("details"); details.open = false;
    details.createEl("summary", { text: tr(key === "canonical" ? "@archive.canonical" : `@planner.${key}`) });
    details.createEl("pre", { text, cls: "ai-pair-source", attr: { tabindex: "0", "data-archive-apply-text": key } });
  }
  renderPlanDiff(root, before, after);
  const copied = root.createEl("details"); copied.createEl("summary", { text: tr("@archiveV2.copied") });
  for (const transfer of p.copied) copied.createEl("pre", { text: `${transfer.range.start}–${transfer.range.end}\n${transfer.range.text}`, cls: "ai-pair-source", attr: { tabindex: "0" } });
  const dependencies = root.createEl("details"); dependencies.createEl("summary", { text: tr("@archive.dependencies") });
  for (const dep of p.dependencies) {
    dependencies.createEl("h4", { text: dep.path });
    if (!dep.incoming) dependencies.createEl("p", { text: tr("@archive.unknown") });
    for (const incoming of dep.incoming ?? []) {
      dependencies.createEl("p", { text: `${tr("@archive.incoming")}: ${incoming.path} · ${incoming.count}` });
      if (!incoming.metadataAvailable || incoming.references.length < incoming.count) dependencies.createEl("p", { text: tr("@archive.unknown") });
      for (const ref of incoming.references) dependencies.createEl("p", { text: `${tr(`@archive.kind.${ref.kind}`)}: ${ref.original}` });
    }
    for (const ref of dep.outgoing) dependencies.createEl("p", { text: `${tr(`@archive.kind.${ref.kind}`)}: ${ref.original} → ${ref.target ?? tr("@archive.unknown")}` });
  }
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
  private pending: Promise<void> = Promise.resolve();
  private active = false;
  private lifetime?: ReviewLifetime;
  private busy = false;
  private review?: ArchiveReview;
  constructor(app: App, private readonly service: ArchiveApply, private readonly prepare: (current: () => boolean) => Promise<ArchiveReview>,
    private readonly history: () => void, private readonly release: () => void = () => {}) { super(app); }
  onOpen(): void {
    this.lifetime = new ReviewLifetime(this.app, () => { if (this.review) this.service.discard(this.review); this.error(new SafeApplyError("stale")); });
    this.active = true; this.modalEl.addClass("ai-pair-inspector-modal"); this.contentEl.addClass("ai-change-planner", "ai-archive-apply");
    this.titleEl.setText(tr("@archiveApply.review")); this.contentEl.createEl("p", { text: tr("@safeApply.checking"), attr: { role: "status" } }); this.pending = this.load();
  }
  private async load(): Promise<void> {
    try {
      const r = await this.prepare(() => this.active && !!this.lifetime?.current());
      if (!this.active || !this.lifetime?.current()) { this.service.discard(r); return; }
      this.review = r; this.contentEl.empty(); this.titleEl.setText(tr(r.action === "undo" ? "@archiveApply.undoReview" : "@archiveApply.review"));
      preview(this.contentEl, r.record, r.action === "undo"); this.contentEl.createEl("p", { text: tr("@archiveApply.closeScope") });
      button(this.contentEl, "confirm", () => { if (!this.busy) this.pending = this.commit(); }).setText(tr(r.action === "undo" ? "@archiveApply.undoConfirm" : "@archiveApply.confirm"));
      button(this.contentEl, "cancel", () => this.close()); focusStatus(this.contentEl);
    } catch (e) { this.error(e); }
  }
  private error(e: unknown): void {
    if (!this.active) return;
    this.contentEl.empty(); this.contentEl.createEl("p", { text: tr(`@safeApply.error.${e instanceof SafeApplyError ? e.reason : "stale"}`), attr: { role: "alert" } });
    this.contentEl.createEl("p", { text: tr("@archiveApply.failure") }); button(this.contentEl, "history", () => { this.close(); void this.pending.then(this.history); }); focusStatus(this.contentEl);
  }
  private async commit(): Promise<void> {
    if (!this.active || !this.lifetime?.current() || this.busy || !this.review) return;
    this.lifetime.stop();
    this.busy = true; this.contentEl.empty(); this.contentEl.createEl("p", { text: tr("@safeApply.working"), attr: { role: "status", "aria-live": "polite" } }); focusStatus(this.contentEl);
    try {
      await this.service.execute(this.review);
      if (!this.active) return;
      this.contentEl.empty(); this.contentEl.createEl("p", { text: tr(this.review.action === "apply" ? "@archiveApply.applied" : "@archiveApply.undone"), attr: { role: "status" } });
      button(this.contentEl, "history", () => { this.close(); void this.pending.then(this.history); }); focusStatus(this.contentEl);
    } catch (e) { this.error(e); } finally { this.busy = false; }
  }
  onClose(): void { this.active = false; this.lifetime?.close(); if (this.review) this.service.discard(this.review); this.contentEl.empty(); void this.pending.then(this.release); }
}
export function renderArchiveHistory(root: HTMLElement, row: ArchiveHistory, undo: () => void): void {
  const card = root.createEl("section", { cls: "ai-semantic-result-card", attr: { "data-archive-state": row.state, "data-operation-id": row.id } });
  historyHeading(card, tr("@archiveApply.operation"), row.record ? [row.record.plan.secondary.path, row.record.plan.canonical.path] : [], row.record?.createdAt);
  card.createEl("p", { text: tr(`@archiveApply.state.${row.state}`), attr: { role: "status" } });
  const diagnostic = diagnosticPanel(card, row.id);
  if (row.recovered) card.createEl("p", { text: tr("@safeApply.recovered") });
  if (row.damaged) card.createEl("p", { text: tr("@safeApply.damaged") });
  if (row.editorBlocked) card.createEl("p", { text: tr("@safeApply.error.editor") });
  card.createEl("p", { text: tr(`@archiveApply.parent.${row.parentUndo}`) });
  if (row.state === "conflict" || row.damaged || row.parentUndo === "chain_incomplete") card.createEl("p", { text: tr("@journal.manual") });
  for (const issue of row.issues) diagnostic.createEl("p", { text: issue, cls: "ai-pair-path" });
  if (row.record) {
    diagnostic.createEl("p", { text: `${tr("@archive.provenance")}: ${row.record.parent.id}`, cls: "ai-pair-path" });
    const details = card.createEl("details"); details.createEl("summary", { text: tr("@safeApply.preview") }); preview(details, row.record);
  }
  historyUnavailable(card, row.canUndo, row.state, row.editorBlocked || row.damaged);
  if (row.canUndo) button(card, "undoReview", undo);
}
