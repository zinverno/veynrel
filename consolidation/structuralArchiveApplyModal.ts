import { reviewSummary, diagnosticPanel, historyHeading, historyUnavailable, focusStatus } from "./consolidationUx";
import { App, Modal } from "obsidian";
import { t as tr } from "../i18n";
import { SafeApplyError } from "./operationJournal";
import type { StructuralArchiveApply, StructuralArchiveReview, StructuralArchiveHistory } from "./structuralArchiveApply";
import type { StructuralArchiveRecord } from "./structuralArchiveJournal";
import { renderPlanDiff } from "./planDiffView";

function button(root: HTMLElement, key: string, action: () => void): HTMLButtonElement {
  const b = root.createEl("button", { text: tr(`@archiveApply.${key}`), attr: { type: "button", "data-structural-archive-action": key } });
  b.addEventListener("click", action); return b;
}
function preview(root: HTMLElement, r: StructuralArchiveRecord, undo = false): void {
  const p = r.plan;
  reviewSummary(root, [p.secondary.path], [p.canonical.path], undo);
  diagnosticPanel(root).createEl("p", { text: `${tr("@archiveV2.provenance")}: ${p.provenance.operation} · ${p.provenance.id} · SHA-256: ${p.provenance.recordHash}`, cls: "ai-pair-path" });
  root.createEl("p", { text: tr("@archiveApply.scope") });
  if (undo) root.createEl("p", { text: tr("@archiveApply.undoScope") });
  const before = undo ? p.secondary.after : p.secondary.before, after = undo ? p.secondary.before : p.secondary.after;
  for (const [key, text] of [["before", before], ["after", after], ["canonical", p.canonical.content]]) {
    const details = root.createEl("details"); details.open = false;
    details.createEl("summary", { text: tr(key === "canonical" ? "@archive.canonical" : `@planner.${key}`) });
    details.createEl("pre", { text, cls: "ai-pair-source", attr: { tabindex: "0", "data-structural-archive-text": key } });
  }
  renderPlanDiff(root, before, after);
  root.createEl("h3", { text: tr("@archive.preservation") });
  for (const f of p.preservation) {
    root.createEl("p", { text: `${f.range.start}–${f.range.end} · ${tr(`@archive.disposition.${f.disposition}`)}` });
    root.createEl("pre", { text: f.range.text, cls: "ai-pair-source", attr: { tabindex: "0", "data-structural-archive-text": "fragment" } });
  }
  root.createEl("h3", { text: tr("@archiveV2.copied") });
  for (const range of p.copied) {
    root.createEl("p", { text: `${range.start}–${range.end}` });
    root.createEl("pre", { text: range.text, cls: "ai-pair-source", attr: { tabindex: "0" } });
  }
  root.createEl("h3", { text: tr("@archive.dependencies") });
  for (const dep of p.dependencies) {
    root.createEl("h4", { text: dep.path });
    for (const issue of dep.issues) root.createEl("p", { text: tr(`@archiveV2.dependency.${issue}`) });
    for (const incoming of dep.incoming ?? []) root.createEl("p", { text: `${tr("@archive.incoming")}: ${incoming.path} · ${incoming.count}` });
    for (const target of dep.targets) root.createEl("p", { text: `${tr(`@archive.kind.${target.kind}`)}: ${target.from} → ${target.target ?? tr("@archive.unknown")}${target.subpath} · ${target.original}` });
  }
  root.createEl("p", { text: tr("@archiveV2.unknownDecision") });
  root.createEl("p", { text: tr("@archiveV2.structureLimit") });
  root.createEl("p", { text: tr("@archiveV2.singleParent") });
  root.createEl("p", { text: tr("@archiveV2.undoChain") });
  const provenance = root.createEl("details"); provenance.createEl("summary", { text: tr("@archive.serialized") });
  provenance.createEl("pre", { text: JSON.stringify(p, null, 2), cls: "ai-pair-source", attr: { tabindex: "0", "data-structural-archive-text": "json" } });
}
/** A separate confirmation ticket. Merely opening this modal never writes recovery data or Markdown. */
export class StructuralArchiveApplyModal extends Modal {
  private pending: Promise<void> = Promise.resolve();
  private active = false;
  private busy = false;
  private generation = 0;
  private cleanup: (() => void)[] = [];
  private review?: StructuralArchiveReview;
  constructor(app: App, private readonly service: StructuralArchiveApply, private readonly prepare: (current: () => boolean) => Promise<StructuralArchiveReview>,
    private readonly history: () => void, private readonly release: () => void = () => {}) { super(app); }
  onOpen(): void {
    this.active = true; this.modalEl.addClass("ai-pair-inspector-modal"); this.contentEl.addClass("ai-change-planner", "ai-structural-archive-apply");
    this.titleEl.setText(tr("@archiveApply.review")); this.contentEl.createEl("p", { text: tr("@safeApply.checking"), attr: { role: "status" } }); const invalidate = () => { this.generation++; if (this.review) this.service.discard(this.review); if (!this.busy) this.error(new SafeApplyError("stale")); };
    for (const ref of [this.app.vault.on("create", invalidate), this.app.vault.on("modify", invalidate), this.app.vault.on("delete", invalidate), this.app.vault.on("rename", invalidate)]) this.cleanup.push(() => this.app.vault.offref(ref));
    for (const ref of [this.app.metadataCache.on("changed", invalidate), this.app.metadataCache.on("resolved", invalidate)]) this.cleanup.push(() => this.app.metadataCache.offref(ref));
    const workspace = () => { if (this.review && !this.busy) try { this.service.guard(this.review); } catch { invalidate(); } };
    for (const ref of [this.app.workspace.on("file-open", workspace), this.app.workspace.on("layout-change", workspace)]) this.cleanup.push(() => this.app.workspace.offref(ref));
    this.pending = this.load();
  }
  private async load(): Promise<void> {
    try {
      const generation = this.generation, r = await this.prepare(() => this.active && generation === this.generation);
      if (!this.active || generation !== this.generation) { this.service.discard(r); return; }
      this.review = r; this.contentEl.empty(); this.titleEl.setText(tr(r.action === "undo" ? "@archiveApply.undoReview" : "@archiveApply.review"));
      preview(this.contentEl, r.record, r.action === "undo"); this.contentEl.createEl("p", { text: tr("@archiveApply.closeScope") });
      const label = this.contentEl.createEl("label", { text: tr("@structuralArchive.confirmReview") });
      const ack = label.createEl("input", { type: "checkbox", attr: { "data-structural-archive-ack": "true" } }); ack.checked = false;
      const confirm = button(this.contentEl, "confirm", () => { if (ack.checked && !this.busy) this.pending = this.commit(); });
      confirm.setText(tr(r.action === "undo" ? "@archiveApply.undoConfirm" : "@archiveApply.confirm")); confirm.disabled = true;
      ack.addEventListener("change", () => { confirm.disabled = !ack.checked; });
      button(this.contentEl, "cancel", () => this.close());
      focusStatus(this.contentEl);
    } catch (e) { this.error(e); }
  }
  private error(e: unknown): void {
    if (!this.active) return;
    this.contentEl.empty(); this.contentEl.createEl("p", { text: tr(e instanceof SafeApplyError && ["archive_parent", "archive_chain"].includes(e.reason) ? `@structuralArchive.error.${e.reason}` : `@safeApply.error.${e instanceof SafeApplyError ? e.reason : "stale"}`), attr: { role: "alert" } });
    this.contentEl.createEl("p", { text: tr("@archiveApply.failure") }); button(this.contentEl, "history", () => { this.close(); void this.pending.then(this.history); });
    focusStatus(this.contentEl);
  }
  private async commit(): Promise<void> {
    if (!this.active || this.busy || !this.review) return;
    this.busy = true; this.contentEl.empty(); this.contentEl.createEl("p", { text: tr("@safeApply.working"), attr: { role: "status", "aria-live": "polite" } }); focusStatus(this.contentEl);
    try {
      await this.service.execute(this.review);
      if (!this.active) return;
      this.contentEl.empty(); this.contentEl.createEl("p", { text: tr(this.review.action === "apply" ? "@archiveApply.applied" : "@structuralArchive.undone"), attr: { role: "status" } });
      button(this.contentEl, "history", () => { this.close(); void this.pending.then(this.history); });
      focusStatus(this.contentEl);
    } catch (e) { this.error(e); } finally {
      this.busy = false;
      // The ticket is consumed; later vault/workspace events cannot revoke a recorded outcome.
      for (const remove of this.cleanup.splice(0)) remove();
    }
  }
  onClose(): void { this.active = false; this.generation++; for (const remove of this.cleanup.splice(0)) remove(); if (this.review) this.service.discard(this.review); this.contentEl.empty(); void this.pending.then(this.release); }
}
export function renderStructuralArchiveHistory(root: HTMLElement, row: StructuralArchiveHistory, undo: () => void): void {
  const card = root.createEl("section", { cls: "ai-semantic-result-card", attr: { "data-structural-archive-state": row.state, "data-operation-id": row.id } });
  historyHeading(card, tr("@structuralArchive.operation"), row.record ? [row.record.plan.secondary.path, row.record.plan.canonical.path] : [], row.record?.createdAt);
  card.createEl("p", { text: tr(`@archiveApply.state.${row.state}`), attr: { role: "status" } });
  const diagnostic = diagnosticPanel(card, row.id);
  if (row.recovered) card.createEl("p", { text: tr("@safeApply.recovered") });
  if (row.damaged) card.createEl("p", { text: tr("@safeApply.damaged") });
  if (row.editorBlocked) card.createEl("p", { text: tr("@safeApply.error.editor") });
  card.createEl("p", { text: tr(row.parentUndo === "parent_ready" ? "@structuralArchive.parentReady" : `@structuralArchive.parent.${row.parentUndo}`) });
  if (row.state === "conflict" || row.damaged || row.parentUndo === "chain_incomplete") card.createEl("p", { text: tr("@journal.manual") });
  for (const issue of row.issues) diagnostic.createEl("p", { text: issue, cls: "ai-pair-path" });
  if (row.record) {
    diagnostic.createEl("p", { text: `${tr("@archiveV2.provenance")}: ${row.record.parent.id}`, cls: "ai-pair-path" });
    const details = card.createEl("details"); details.createEl("summary", { text: tr("@safeApply.preview") }); preview(details, row.record);
  }
  historyUnavailable(card, row.canUndo, row.state, row.editorBlocked || row.damaged);
  if (row.canUndo) button(card, "undoReview", undo);
}
