import { t as tr } from "../i18n";
import { RELATIONSHIP_LIMITS } from "./relationshipPrompt";
import type { RelationshipSession } from "./relationshipSession";
import type { RelationshipRecommendation } from "./relationshipContract";

/** Model prose and excerpts are text nodes; no Markdown renderer or actionable diff. */
export function renderRelationshipView(container: HTMLElement, session: RelationshipSession): void {
  container.empty();
  const view = session.view;
  container.createEl("h3", { text: tr("@relationship.title") });
  container.createDiv({ text: tr(view.stage === "error" ? `@relationship.error.${view.error}` : `@relationship.stage.${view.stage}`),
    attr: { role: "status", "aria-live": "polite", "data-relationship-stage": view.stage } });
  const button = (key: string, action: () => void) => {
    const control = container.createEl("button", { text: tr(`@relationship.${key}`), attr: { type: "button", "data-relationship-action": key } });
    control.addEventListener("click", action);
  };
  if (["preparing", "consent", "running"].includes(view.stage)) button("cancel", () => session.cancel());
  if (view.stage === "running" || view.stage === "cancelled") container.createEl("p", { text: tr("@relationship.cancelScope") });
  if (view.consent) {
    const preview = view.consent;
    container.createEl("p", { text: tr("@relationship.destination", { provider: preview.provider, model: preview.model, endpoint: preview.endpoint }) });
    container.createEl("p", { text: `A: ${preview.paths[0]}\nB: ${preview.paths[1]}`, cls: "ai-relationship-paths" });
    container.createEl("p", { text: tr("@relationship.volume", { a: preview.characters[0], b: preview.characters[1], bytes: preview.bytes }) });
    container.createEl("p", { text: tr("@relationship.privacy") });
    container.createEl("p", { text: tr("@relationship.fullInput") });
    const payload = container.createEl("details", { attr: { open: "" } });
    payload.createEl("summary", { text: tr("@relationship.payload") });
    payload.createEl("pre", { text: preview.body, cls: "ai-pair-source", attr: { tabindex: "0", "aria-label": tr("@relationship.payload") } });
    button("confirm", () => { void session.confirm(); });
  }
  if (view.error === "tooLarge") container.createEl("p", { text: tr("@relationship.limits", {
    note: RELATIONSHIP_LIMITS.noteCharacters, pair: RELATIONSHIP_LIMITS.pairCharacters, bytes: RELATIONSHIP_LIMITS.requestBytes,
  }) });
  if (!view.result) return;
  const result = view.result;
  container.createEl("p", { text: tr("@relationship.provisional"), cls: "ai-semantic-duplicate-disclaimer" });
  container.createEl("h4", { text: tr(`@relationship.relation.${result.relation}`) });
  container.createEl("p", { text: result.explanation.text });
  container.createEl("p", { text: tr("@relationship.references", { ids: result.explanation.evidence.join(", ") || "—" }) });
  container.createEl("h4", { text: tr("@relationship.evidence") });
  container.createEl("p", { text: tr("@relationship.evidenceScope") });
  if (!result.claims.length) container.createEl("p", { text: tr("@relationship.noEvidence") });
  for (const claim of result.claims) {
    const card = container.createDiv({ cls: "ai-semantic-duplicate-card" });
    card.createEl("h5", { text: `${claim.id}: ${tr(`@relationship.kind.${claim.kind}`)}` });
    card.createEl("p", { text: claim.text });
    for (const [side, quote] of [["A", claim.quoteA], ["B", claim.quoteB]] as const) {
      if (quote === null) continue;
      card.createEl("p", { text: tr("@relationship.verifiedQuote", { side }) });
      card.createEl("pre", { cls: "ai-pair-source", text: quote, attr: { tabindex: "0" } });
    }
  }
  container.createEl("h4", { text: tr("@relationship.unique") });
  const unique = result.claims.filter(claim => /^(unique|context|standalone)_/.test(claim.kind));
  if (!unique.length) container.createEl("p", { text: tr("@relationship.noUnique") });
  for (const claim of unique) container.createEl("p", { text: `${claim.id}: ${claim.text}` });
  const recommend = (item: RelationshipRecommendation) => {
    container.createEl("h5", { text: tr(`@relationship.action.${item.action}`) });
    container.createEl("p", { text: item.reason });
    container.createEl("p", { text: tr("@relationship.references", { ids: item.evidence.join(", ") || "—" }) });
  };
  container.createEl("h4", { text: tr("@relationship.recommendation") }); recommend(result.recommendation);
  if (result.alternatives.length) {
    container.createEl("h4", { text: tr("@relationship.alternatives") });
    for (const item of result.alternatives) recommend(item);
  }
  container.createEl("h4", { text: tr("@relationship.limitations") });
  container.createEl("p", { text: tr("@relationship.coverage") });
  for (const limitation of result.limitations) container.createEl("p", { text: limitation });
  button("dismiss", () => session.dismiss());
}
