import { t } from "../../i18n";
import type { RecallRating } from "../../recall/scheduler/types";
import { healthButton } from "./renderHealthHome";
import type { RecallViewModel } from "./recallViewModel";

export interface RecallActions {
  refresh: () => void; start: () => void; reveal: () => void; rate: (rating: RecallRating) => void;
  back: () => void; source: () => void; retry: () => void;
  recover: () => void; cancelRecovery: () => void; confirmRecovery: () => void;
}

/** Literal text prevents note embeds, remote images or HTML from turning card display into IO. */
export function renderRecall(parent: HTMLElement, model: RecallViewModel, actions: RecallActions): () => void {
  const section = parent.createEl("section", { cls: "veynrel-health-home veynrel-recall", attr: { "aria-label": model.title, "aria-busy": String(model.busy) } });
  section.createEl("h1", { text: model.title, attr: { tabindex: "-1", "data-health-heading": "true" } });
  if (model.mode === "loading") { section.createEl("p", { text: t("@recall.loading") }); return () => {}; }
  if (model.mode === "confirm") {
    section.createEl("h2", { text: t("@recall.confirm-title") });
    section.createEl("p", { text: t("@recall.confirm-description") });
    const controls = section.createDiv({ cls: "veynrel-recall-actions" });
    healthButton(controls, t("@health.cancel"), actions.cancelRecovery, "recall-cancel-recovery", model.busy);
    healthButton(controls, t("@recall.confirm"), actions.confirmRecovery, "recall-confirm-recovery", model.busy).addClass("mod-warning");
    return () => {};
  }
  if (model.mode === "recovery") {
    const recovery = section.createEl("section", { cls: "veynrel-health-recovery" });
    recovery.createEl("h2", { text: model.recoveryTitle });
    recovery.createEl("p", { text: t("@recall.recovery-description") });
    const controls = recovery.createDiv({ cls: "veynrel-recall-actions" });
    if (model.retry) healthButton(controls, t("@recall.retry"), actions.retry, "recall-retry", model.busy);
    if (model.canRecover) healthButton(controls, t("@recall.recover"), actions.recover, "recall-recover", model.busy);
    // Preserve the failed card/answer in the surface while its storage is blocked. Ratings cannot run.
    if (!model.session?.card) return () => {};
  }
  if (model.session?.card) {
    const session = model.session, card = model.session.card;
    const review = section.createEl("section", { cls: "veynrel-recall-review", attr: { "aria-label": t("@recall.review") } });
    review.createEl("p", { text: session.count, cls: "veynrel-health-muted" });
    const question = review.createEl("section", { attr: { "aria-label": t("@recall.question") } });
    question.createEl("h2", { text: card.question, attr: { tabindex: "-1", "data-recall-question": "true" } });
    healthButton(review, `${t("@recall.from")} ${card.path}`, actions.source, "recall-source").addClass("veynrel-recall-source");
    if (session.revealed && card.answer !== undefined) {
      const answer = review.createEl("section", { cls: "veynrel-recall-answer", attr: { "aria-label": t("@recall.answer") } });
      answer.createEl("h2", { text: t("@recall.answer"), attr: { tabindex: "-1", "data-recall-answer": "true" } });
      answer.createEl("p", { text: card.answer });
      const ratings = review.createDiv({ cls: "veynrel-recall-ratings", attr: { "aria-label": t("@recall.rate") } });
      for (const preview of session.previews ?? []) {
        const button = healthButton(ratings, "", () => actions.rate(preview.rating), `recall-${preview.rating}`, model.busy || model.mode === "recovery");
        button.setAttribute("title", preview.help);
        button.createSpan({ text: preview.label, cls: "veynrel-recall-rating-label" });
        button.createSpan({ text: preview.interval, cls: "veynrel-recall-interval" });
      }
    } else healthButton(review, t("@recall.show-answer"), actions.reveal, "recall-reveal", model.busy || model.mode === "recovery", true);
    healthButton(review, t("@recall.back"), actions.back, "recall-back").addClass("veynrel-recall-back");
    const keydown = (event: KeyboardEvent): void => {
      if (!session.revealed || model.busy || model.mode === "recovery" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat ||
        !review.contains(review.ownerDocument.activeElement)) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']")) return;
      const rating = ({ "1": "again", "2": "hard", "3": "good", "4": "easy" } as Record<string, RecallRating>)[event.key];
      const button = rating ? review.querySelector<HTMLButtonElement>(`[data-health-action="recall-${rating}"]`) : null;
      if (button && !button.disabled) { event.preventDefault(); button.click(); }
    };
    review.addEventListener("keydown", keydown);
    return () => review.removeEventListener("keydown", keydown);
  }
  if (model.mode === "complete") {
    section.createEl("h2", { text: t("@recall.caught-up") });
    section.createEl("p", { text: model.session!.count });
    if (model.nextDue) section.createEl("p", { text: t("@recall.next-at", { date: model.nextDue }) });
    healthButton(section, t("@recall.back"), actions.back, "recall-back");
    return () => {};
  }
  section.createEl("p", { text: model.mode === "first-run" ? t("@recall.first-run") : model.introduction, cls: "veynrel-health-muted" });
  if (model.mode === "first-run") {
    section.createEl("p", { text: t("@recall.syntax") });
    const example = section.createEl("pre").createEl("code");
    example.textContent = "## Flashcards\n\nquestion::answer";
  } else if (model.mode === "empty") {
    section.createEl("h2", { text: model.emptyTitle });
    section.createEl("p", { text: t("@recall.empty-help") });
  } else {
    const stats = section.createEl("dl", { cls: "veynrel-recall-stats" });
    for (const stat of model.stats) {
      const item = stats.createDiv(); item.createEl("dt", { text: stat.label }); item.createEl("dd", { text: String(stat.value) });
    }
    if (model.start) healthButton(section, t("@recall.start"), actions.start, "recall-start", model.busy, true);
    else section.createEl("p", { text: t("@recall.no-due") });
    if (model.nextDue) section.createEl("p", { text: t("@recall.next-at", { date: model.nextDue }) });
  }
  const controls = section.createDiv({ cls: "veynrel-recall-actions" });
  healthButton(controls, t(model.mode === "first-run" ? "@recall.find" : "@recall.refresh"), actions.refresh, "recall-refresh", model.busy, model.mode === "first-run");
  section.createEl("p", { text: t("@recall.source-help"), cls: "veynrel-health-muted" });
  if (!model.inventoryEstablished && model.mode !== "first-run") section.createEl("p", { text: t("@recall.inventory-not-established"), cls: "veynrel-health-muted" });
  return () => {};
}
