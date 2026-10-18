import { App, Modal } from "obsidian";
import { dateLocale, t as tr } from "../i18n";
import { SafeApplyError } from "./operationJournal";
import type { ApplyReview, SafeApplyService, OperationHistory, ResolutionReview } from "./safeApply";
import { renderPlanDiff } from "./planDiffView";
import { MultiFileApplyModal, renderMultiHistory } from "./multiFileApplyModal";
import { GroupApplyModal, renderGroupHistory } from "./groupApplyModal";
import { BundleApplyModal, renderBundleHistory } from "./bundleApplyModal";
import { MergeApplyModal, renderMergeHistory } from "./mergeApplyModal";
import { ArchivePlannerModal } from "./archivePlannerModal";
import { readArchiveBasis } from "./obsidianArchive";
import { ArchiveApplyModal, renderArchiveHistory } from "./archiveApplyModal";

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
function diagnostics(root: HTMLElement, row: OperationHistory): void {
  root.createEl("p", { text: row.id, cls: "ai-pair-path" });
  root.createEl("p", { text: tr(`@journal.source.${row.sourceState}`) });
  root.createEl("p", { text: tr(`@journal.scope.${row.resolution ? "resolved" : row.scope}`) });
  if (row.scope === "local" && row.record && !row.resolution) root.createEl("p", { text: `${row.record.sourcePath} · ${row.record.targetPath}` });
  if (row.editorBlocked) root.createEl("p", { text: tr("@safeApply.error.editor") });
  const details = root.createEl("details"); details.createEl("summary", { text: tr("@journal.evidence") });
  const list = details.createEl("ul");
  for (const item of [...row.evidence, ...row.resolutionAttempts]) {
    const li = list.createEl("li", { text: `${item.name}: ${tr(`@journal.issue.${item.status}`)}` });
    if (item.sha256) li.createEl("code", { text: ` SHA-256: ${item.sha256}` });
  }
  for (const issue of row.issues) root.createEl("p", { text: `${issue.file}: ${tr(`@journal.issue.${issue.code}`)}` });
  if (row.resolution) {
    root.createEl("p", { text: `${tr("@journal.confirmed")}: ${new Date(row.resolution.confirmedAt).toLocaleString(dateLocale())}` });
    root.createEl("p", { text: tr(`@journal.source.${row.resolution.source.state}`) });
    root.createEl("p", { text: tr("@journal.historical") });
  }
  if ((row.damaged || row.state === "conflict") && !row.canResolve && !row.resolution) root.createEl("p", { text: tr("@journal.manual") });
}

/** No note write: a separately confirmed acknowledgement of the inspected evidence. */
export class JournalResolutionModal extends Modal {
  private active = false;
  private busy = false;
  private review?: ResolutionReview;
  constructor(app: App, private readonly service: SafeApplyService, private readonly id: string,
    private readonly release: () => void = () => {}) { super(app); }
  onOpen(): void {
    this.active = true; this.modalEl.addClass("ai-pair-inspector-modal"); this.contentEl.addClass("ai-change-planner", "ai-journal-resolution");
    this.titleEl.setText(tr("@journal.review"));
    this.contentEl.createEl("p", { text: tr("@safeApply.checking"), attr: { role: "status" } });
    void this.load();
  }
  private async load(): Promise<void> {
    try {
      const review = await this.service.reviewResolution(this.id, () => this.active);
      if (!this.active) { this.service.discardResolution(review); return; }
      this.review = review; this.contentEl.empty();
      const r = review.row.record!;
      this.contentEl.createEl("p", { text: `${tr(`@planner.op.${r.operation}`)}: ${r.sourcePath} → ${r.targetPath}` });
      diagnostics(this.contentEl, review.row);
      this.contentEl.createEl("p", { text: tr("@journal.warning") });
      preview(this.contentEl, r.before, r.after);
      button(this.contentEl, "resolveConfirm", () => { void this.commit(); });
      button(this.contentEl, "cancel", () => this.close());
    } catch (error) { this.error(error); }
  }
  private error(error: unknown): void {
    if (!this.active) return;
    this.contentEl.empty(); this.contentEl.createEl("p", { text: message(error), attr: { role: "alert" } });
    this.contentEl.createEl("p", { text: tr("@journal.failure") });
    button(this.contentEl, "history", () => new OperationHistoryModal(this.app, this.service).open());
  }
  private async commit(): Promise<void> {
    if (this.busy || !this.active || !this.review) return;
    this.busy = true; this.contentEl.empty();
    this.contentEl.createEl("p", { text: tr("@journal.working"), attr: { role: "status" } });
    try {
      await this.service.resolve(this.review);
      if (!this.active) return;
      this.contentEl.empty(); this.contentEl.createEl("p", { text: tr("@safeApply.state.resolved"), attr: { role: "status" } });
      this.contentEl.createEl("p", { text: tr("@journal.warning") });
      button(this.contentEl, "history", () => new OperationHistoryModal(this.app, this.service).open());
    } catch (error) { this.error(error); }
    finally { this.busy = false; }
  }
  onClose(): void { this.active = false; if (this.review) this.service.discardResolution(this.review); this.contentEl.empty(); this.release(); }
}

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
      const multi = await this.service.multi?.history() ?? [];
      const merge = await this.service.merge?.history() ?? [];
      const archive = await this.service.archive?.history() ?? [];
      const bundle = await this.service.bundle?.history() ?? [];
      const group = await this.service.group?.history() ?? [];
      if (!this.active || this.generation !== generation) return;
      this.contentEl.empty(); this.contentEl.createEl("p", { text: tr("@safeApply.historyScope") });
      button(this.contentEl, "refresh", () => { void this.refresh(); });
      if (!rows.length && !multi.length && !merge.length && !archive.length && !bundle.length && !group.length) this.contentEl.createEl("p", { text: tr("@safeApply.empty") });
      for (const row of group) renderGroupHistory(this.contentEl, row, () => new GroupApplyModal(this.app, this.service.group!,
        current => this.service.group!.reviewUndo(row.id, current), () => new OperationHistoryModal(this.app, this.service).open(),
        () => { if (this.active) void this.refresh(); }).open());
      for (const row of bundle) renderBundleHistory(this.contentEl, row, () => new BundleApplyModal(this.app, this.service.bundle!,
        current => this.service.bundle!.reviewUndo(row.id, current), () => new OperationHistoryModal(this.app, this.service).open(),
        () => { if (this.active) void this.refresh(); }).open());
      for (const row of archive) renderArchiveHistory(this.contentEl, row, () => new ArchiveApplyModal(this.app, this.service.archive!,
        current => this.service.archive!.reviewUndo(row.id, current), () => new OperationHistoryModal(this.app, this.service).open(),
        () => { if (this.active) void this.refresh(); }).open());
      for (const row of merge) renderMergeHistory(this.contentEl, row, () => new MergeApplyModal(this.app, this.service.merge!,
        current => this.service.merge!.reviewUndo(row.id, current), () => new OperationHistoryModal(this.app, this.service).open(),
        () => { if (this.active) void this.refresh(); }).open(),
      () => new ArchivePlannerModal(this.app, current => readArchiveBasis(this.app, this.service.merge!, row.id, current), this.service.archive ?
        (plan, currentPlan) => new ArchiveApplyModal(this.app, this.service.archive!, current => this.service.archive!.review(plan, () => current() && currentPlan()),
          () => new OperationHistoryModal(this.app, this.service).open()).open() : undefined).open());
      for (const row of multi) renderMultiHistory(this.contentEl, row, () => new MultiFileApplyModal(this.app, this.service.multi!,
        current => this.service.multi!.reviewUndo(row.id, current), () => new OperationHistoryModal(this.app, this.service).open(),
        () => { if (this.active) void this.refresh(); }).open());
      for (const row of rows) this.row(row);
    } catch (error) {
      if (this.active && this.generation === generation) {
        this.contentEl.empty(); this.contentEl.createEl("p", { text: message(error), attr: { role: "alert" } });
        button(this.contentEl, "refresh", () => { void this.refresh(); });
      }
    }
  }
  private row(row: OperationHistory): void {
    const card = this.contentEl.createEl("section", { cls: "ai-semantic-result-card", attr: { "data-operation-state": row.state, "data-operation-id": row.id } });
    const r = row.record;
    card.createEl("h3", { text: r ? `${new Date(r.createdAt).toLocaleString(dateLocale())} · ${tr(`@planner.op.${r.operation}`)}` : row.id });
    card.createEl("p", { text: tr(`@safeApply.state.${row.state}`), attr: { role: "status" } });
    if (row.recovered) card.createEl("p", { text: tr("@safeApply.recovered") });
    if (row.damaged) card.createEl("p", { text: tr("@safeApply.damaged") });
    diagnostics(card, row);
    if (!r) return;
    card.createEl("p", { text: `${r.sourcePath} → ${r.targetPath}` });
    const details = card.createEl("details"); details.createEl("summary", { text: tr("@safeApply.preview") });
    preview(details, r.before, r.after);
    if (row.issues.some(issue => issue.code === "copies_disagree")) for (const copy of row.copies.slice(1)) {
      const other = card.createEl("details"); other.createEl("summary", { text: copy.name });
      other.createEl("p", { text: `${copy.record.sourcePath} → ${copy.record.targetPath}` });
      preview(other, copy.record.before, copy.record.after);
    }
    if (row.canResolve) button(card, "resolve", () => new JournalResolutionModal(this.app, this.service, row.id, () => { if (this.active) void this.refresh(); }).open());
    if (row.canUndo) button(card, "undo", () => new SafeApplyModal(this.app, this.service, current => this.service.reviewUndo(row.id, current), true, () => { if (this.active) void this.refresh(); }).open());
    else if (row.state === "applied") card.createEl("p", { text: tr("@safeApply.error.editor") });
  }
  onClose(): void { this.active = false; this.generation++; this.contentEl.empty(); this.release(); }
}
