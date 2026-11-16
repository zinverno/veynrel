import { Modal } from "obsidian";
import type { App } from "obsidian";
import { t } from "../i18n";
import { orgText } from "./organizationView";
import { SafeApplyError } from "./operationJournal";
import type { SafeApplyService } from "./safeApply";
import type { RegistryReview, RegistryHistory } from "./registryApply";
import { ReviewLifetime } from "./reviewLifetime";
import { renderPlanDiff } from "./planDiffView";
import { focusStatus, historyHeading, reviewSummary } from "./consolidationUx";

function button(root: HTMLElement, text: string, key: string, fn: () => void): HTMLButtonElement {
  const b = root.createEl("button", { text, attr: { type: "button", "data-registry": key } }); b.addEventListener("click", fn); return b;
}
export class RegistryApplyModal extends Modal {
  private active = false; private busy = false; private lifetime?: ReviewLifetime; private review?: RegistryReview;
  private pending: Promise<void> = Promise.resolve();
  constructor(app: App, private readonly owner: SafeApplyService, private readonly prepare: (current: () => boolean) => Promise<RegistryReview>,
    private readonly history: () => void, private readonly release: () => void = () => {}) { super(app); }
  onOpen(): void {
    this.active = true; this.modalEl.addClass("ai-pair-inspector-modal"); this.contentEl.addClass("ai-change-planner", "ai-registry-review");
    this.lifetime = new ReviewLifetime(this.app, () => { if (this.review) this.owner.registry!.discard(this.review); this.error(new SafeApplyError("stale")); });
    this.titleEl.setText(t("@safeApply.review")); this.pending = this.load();
  }
  private async load(): Promise<void> {
    try {
      const review = await this.prepare(() => this.active && !!this.lifetime?.current());
      if (!this.active || !this.lifetime?.current()) { this.owner.registry!.discard(review); return; }
      this.review = review; const p = review.record.plan, undo = review.action === "undo";
      this.contentEl.empty(); reviewSummary(this.contentEl, [p.source.path], [], undo);
      this.contentEl.createEl("p", { text: orgText("Edit registry definitions", "Изменить определения реестра") });
      const before = undo ? p.after : p.source.content, after = undo ? p.source.content : p.after;
      for (const [key, text] of [["before", before], ["after", after]]) {
        const d = this.contentEl.createEl("details"); d.createEl("summary", { text: t(`@planner.${key}`) });
        d.createEl("pre", { text, cls: "ai-pair-source", attr: { tabindex: "0", "data-registry-text": key } });
      }
      renderPlanDiff(this.contentEl, before, after); this.contentEl.createEl("p", { text: orgText("Only the selected registry definition changes. Notes and the settings profile stay unchanged. Removing a definition does not remove tags or properties from notes; other category assignments can still permit that tag. Undo requires the unchanged saved result and closed editors.", "Меняется только выбранное определение реестра. Заметки и профиль настроек не меняются. Удаление определения не удаляет теги и свойства из заметок; другие категории могут по-прежнему разрешать тег. Для Undo нужен неизменённый сохранённый результат и закрытые редакторы.") });
      button(this.contentEl, t(undo ? "@safeApply.undoConfirm" : "@safeApply.confirm"), "confirm", () => { if (!this.busy) this.pending = this.commit(); });
      button(this.contentEl, t("@safeApply.cancel"), "cancel", () => this.close()); focusStatus(this.contentEl);
    } catch (e) { this.error(e); }
  }
  private error(error: unknown): void {
    if (!this.active) return; this.contentEl.empty();
    this.contentEl.createEl("p", { text: t(`@safeApply.error.${error instanceof SafeApplyError ? error.reason : "stale"}`), attr: { role: "alert" } });
    this.contentEl.createEl("p", { text: t("@groupApply.failure") }); this.historyButton(); focusStatus(this.contentEl);
  }
  private historyButton(): void { button(this.contentEl, t("@safeApply.history"), "history", () => { this.close(); void this.pending.then(this.history); }); }
  private async commit(): Promise<void> {
    if (!this.active || !this.review || !this.lifetime?.current() || this.busy) return;
    this.busy = true; this.lifetime.stop(); this.contentEl.empty(); this.contentEl.createEl("p", { text: t("@safeApply.working"), attr: { role: "status" } });
    try {
      await this.owner.registry!.execute(this.review);
      if (!this.active) return;
      this.contentEl.empty(); this.contentEl.createEl("p", { text: t(this.review.action === "apply" ? "@safeApply.applied" : "@safeApply.undone"), attr: { role: "status" } }); this.historyButton(); focusStatus(this.contentEl);
    } catch (e) { this.error(e); } finally { this.busy = false; }
  }
  onClose(): void { this.active = false; this.lifetime?.close(); if (this.review) this.owner.registry!.discard(this.review); this.contentEl.empty(); void this.pending.then(this.release); }
}
export function renderRegistryHistory(root: HTMLElement, row: RegistryHistory, undo: () => void): void {
  const card = root.createEl("section", { cls: "ai-semantic-result-card", attr: { "data-registry-state": row.state } });
  historyHeading(card, orgText("Edit registry definitions", "Изменить определения реестра"), row.record ? [row.record.plan.source.path] : [], row.record?.createdAt);
  card.createEl("p", { text: t(`@safeApply.state.${row.state}`), attr: { role: "status" } });
  if (row.recovered) card.createEl("p", { text: orgText("Recovered from exact saved content; no operation was replayed.", "Восстановлено по точному сохранённому содержимому; операция не повторялась.") });
  const d = card.createEl("details"); d.createEl("summary", { text: orgText("Journal evidence", "Доказательства журнала") });
  d.createEl("pre", { text: JSON.stringify({ id: row.id, damaged: row.damaged, issues: row.issues, receipts: row.receipts }, null, 2), cls: "ai-pair-source" });
  if (row.canUndo) button(card, t("@safeApply.undoReview"), "undo", undo);
  else card.createEl("p", { text: orgText("Automatic Undo is unavailable. Keep the original journal copies for manual recovery; no retry or overwrite is authorized.",
    "Автоматическая отмена недоступна. Сохраните исходные копии журнала для ручного восстановления; повторная запись не разрешена.") });
}
