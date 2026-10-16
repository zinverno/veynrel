import { t } from "../i18n";
import type { TagRecommendationSession } from "./tagRecommendationSession";
import type { TagEvidence } from "./tagRecommendationContract";
import { TAG_LIMITS } from "./tagRecommendationContract";

/** Plain text only: provider prose cannot render Markdown, embeds, HTML or remote resources. */
export function renderTagRecommendationView(container: HTMLElement, session: TagRecommendationSession, select: () => void): void {
  const active = container.ownerDocument?.activeElement, hadFocus = !!active && container.contains(active);
  const focusedAction = active?.getAttribute("data-tag-rec-action");
  container.empty(); const view = session.view;
  container.createEl("h3", { text: t("@tagRec.title") });
  container.createEl("p", { text: t("@tagRec.scope") });
  const status = container.createDiv({ text: t(view.error ? `@tagRec.error.${view.error}` : `@tagRec.stage.${view.stage}`),
    attr: { role: "status", "aria-live": "polite", "data-tag-rec-stage": view.stage, tabindex: "-1" } });
  const button = (key: string, action: () => void, disabled = false) => {
    const control = container.createEl("button", { text: t(`@tagRec.${key}`), attr: { type: "button", "data-tag-rec-action": key } });
    control.disabled = disabled; control.addEventListener("click", action);
  };
  container.createEl("p", { text: session.path || t("@tagRec.noSelection"), cls: "ai-relationship-paths", attr: { "data-tag-rec-path": "" } });
  button("select", select, session.busy);
  button("analyze", () => { void session.prepare(); }, session.busy || !session.path);
  if (["preparing", "consent", "running"].includes(view.stage)) button("cancel", () => session.cancel());
  if (session.hasDispatched) container.createEl("p", { text: t("@relationship.cancelScope") });
  if (view.consent) {
    const preview = view.consent;
    container.createEl("p", { text: t("@relationship.destination", { provider: t(preview.provider), model: preview.model, endpoint: preview.endpoint }) });
    container.createEl("p", { text: t("@tagRec.volume", { characters: preview.characters, tags: preview.tags, excluded: preview.excluded, bytes: preview.bytes }) });
    container.createEl("p", { text: t("@tagRec.privacy") });
    const payload = container.createEl("details", { attr: { open: "" } }); payload.createEl("summary", { text: t("@relationship.payload") });
    payload.createEl("pre", { text: preview.body, cls: "ai-pair-source", attr: { tabindex: "0", "aria-label": t("@relationship.payload") } });
    button("confirm", () => { void session.confirm(); });
  }
  if (view.error === "tooLarge") container.createEl("p", { text: t("@tagRec.limits", TAG_LIMITS) });
  const restoreFocus = () => {
    if (!hadFocus) return;
    const action = view.stage === "consent" ? "confirm" : focusedAction;
    const control = Array.from(container.querySelectorAll<HTMLButtonElement>("[data-tag-rec-action]")).find(button => button.getAttribute("data-tag-rec-action") === action && !button.disabled);
    (control ?? status).focus();
  };
  if (!view.result) { restoreFocus(); return; }
  container.createEl("p", { text: t("@tagRec.provisional"), cls: "ai-semantic-duplicate-disclaimer" });
  const evidence = (parent: HTMLElement, item: TagEvidence) => {
    parent.createEl("p", { text: item.text });
    parent.createEl("p", { text: t("@tagRec.quote") });
    parent.createEl("pre", { text: item.quote, cls: "ai-pair-source", attr: { tabindex: "0" } });
  };
  for (const kind of ["existing", "proposed", "none"] as const) {
    container.createEl("h4", { text: t(`@tagRec.${kind}`) }); let count = 0;
    for (const category of view.result.categories) {
      const suggestions = kind === "none" ? [] : category[kind];
      if (kind === "none" ? category.status === "recommend" : !suggestions.length) continue;
      count++;
      const card = container.createDiv({ cls: "ai-semantic-result-card", attr: { "data-tag-rec-category": category.categoryId } });
      card.createEl("h5", { text: session.categoryName(category.categoryId) });
      card.createEl("p", { text: t(`@tagRec.outcome.${category.status}`) });
      if (category.quote !== null) evidence(card, { text: category.explanation, quote: category.quote });
      else card.createEl("p", { text: category.explanation });
      if (category.basis) for (const field of ["domain", "prerequisites"] as const) {
        const basis = category.basis[field]; if (!basis) continue;
        card.createEl("h6", { text: t(`@tagRec.${field}`) }); evidence(card, basis);
      }
      for (const suggestion of suggestions) {
        card.createEl("h6", { text: `#${suggestion.tag}` }); evidence(card, suggestion.evidence);
        const proposed = category.proposed.find(item => item === suggestion);
        if (proposed) {
          card.createEl("p", { text: t("@tagRec.newScope") });
          for (const nearest of proposed.nearest) card.createEl("p", { text: `#${nearest.tag}: ${nearest.difference}` });
          for (const limitation of proposed.limitations) card.createEl("p", { text: limitation });
        }
      }
    }
    if (!count) container.createEl("p", { text: t("@tagRec.empty") });
  }
  container.createEl("h4", { text: t("@relationship.limitations") });
  container.createEl("p", { text: t("@tagRec.coverage") });
  for (const limitation of view.result.limitations) container.createEl("p", { text: limitation });
  button("dismiss", () => session.dismiss()); restoreFocus();
}
