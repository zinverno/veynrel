import { t as tr } from "../i18n";
import { RELATIONSHIP_LIMITS } from "./relationshipPrompt";
import type { RelationshipSession } from "./relationshipSession";
import { recommendationIntent } from "./recommendationIntent";
import type { IntentSelection } from "./recommendationIntent";
import { workflowStep } from "./consolidationUx";

/** Model prose and excerpts are text nodes; no Markdown renderer or actionable diff. */
export function renderRelationshipView(container: HTMLElement, session: RelationshipSession, prepare?: (selection: IntentSelection) => void): void {
  container.empty();
  const view = session.view;
  const body = container.createDiv({ cls: "ai-relationship-body" });
  const actions = container.createDiv({ cls: "ai-consolidation-actions ai-relationship-actions" });
  workflowStep(body, "analysis");
  body.createEl("h3", { text: tr("@relationship.title") });
  body.createDiv({ text: tr(view.stage === "error" ? `@relationship.error.${view.error}` : `@relationship.stage.${view.stage}`),
    attr: { role: "status", "aria-live": "polite", "data-relationship-stage": view.stage } });
  const button = (key: string, action: () => void) => {
    const control = actions.createEl("button", { text: tr(`@relationship.${key}`), attr: { type: "button", "data-relationship-action": key } });
    control.addEventListener("click", action);
  };

  if (view.stage === "running" || view.stage === "cancelled") body.createEl("p", { text: tr("@relationship.cancelScope") });
  if (view.consent) {
    const preview = view.consent;
    body.createEl("p", { text: tr("@relationship.destination", { provider: preview.provider, model: preview.model }) });
    body.createEl("p", { text: `A: ${preview.paths[0]}\nB: ${preview.paths[1]}`, cls: "ai-relationship-paths" });
    body.createEl("p", { text: tr("@relationship.volume", { a: preview.characters[0], b: preview.characters[1], bytes: preview.bytes }) });
    body.createEl("p", { text: tr("@relationship.budget", { tokens: preview.maxTokens, reasoning: tr(`@relationship.reasoning.${preview.reasoning}`) }) });
    if (preview.evidence) body.createEl("p", { text: tr("@relationship.catalog", { count: preview.evidence.fragments,
      a: preview.evidence.uncoveredCharacters[0], b: preview.evidence.uncoveredCharacters[1] }) });
    body.createEl("p", { text: tr("@relationship.privacy") });
    const payload = body.createEl("details");
    payload.createEl("summary", { text: tr("@relationship.payload") });
    payload.createEl("p", { text: preview.endpoint, cls: "ai-relationship-paths" });
    payload.createEl("p", { text: tr("@relationship.fullInput") });
    payload.createEl("pre", { text: preview.body, cls: "ai-pair-source", attr: { tabindex: "0", "aria-label": tr("@relationship.payload") } });
    button("confirm", () => { void session.confirm(); });
  }
  if (["preparing", "consent", "running"].includes(view.stage)) button("cancel", () => session.cancel());
  if (view.error) {
    if (view.diagnostics?.length) body.createEl("p", { text: tr(`@relationship.diagnostic.${view.diagnostics[0].code}`) });
    const diagnostic = body.createEl("details", { cls: "ai-consolidation-diagnostics" });
    diagnostic.createEl("summary", { text: tr("@ux.diagnostics") });
    diagnostic.createEl("p", { text: view.error + (view.httpStatus === undefined ? "" : ` · HTTP ${view.httpStatus}`) });
    for (const issue of view.diagnostics ?? []) diagnostic.createEl("p", { text: `${issue.field}${issue.claimId ? ` · ${issue.claimId}` : ""}${issue.side ? ` · ${issue.side}` : ""}: ${tr(`@relationship.diagnostic.${issue.code}`)} (${issue.code})` });
    if (!["source", "tooLarge", "configuration"].includes(view.error)) body.createEl("p", { text: tr("@relationship.billingUnknown") });
  }
  if (view.error === "tooLarge") body.createEl("p", { text: tr("@relationship.limits", {
    note: RELATIONSHIP_LIMITS.noteCharacters, pair: RELATIONSHIP_LIMITS.pairCharacters, bytes: RELATIONSHIP_LIMITS.requestBytes,
  }) });
  if (!view.result) return;
  const result = view.result;

  body.createEl("h4", { text: tr(`@relationship.relation.${result.relation}`) });
  const propose = (parent: HTMLElement, selection: IntentSelection) => {
    const analysis = session.analysisSource;
    if (!analysis) return;
    const intent = recommendationIntent(analysis, selection);
    const section = parent.createEl("section", { attr: { "data-intent-origin": intent.origin } });
    const explicit = intent.operation === "add_reciprocal_links" || intent.operation === "write_atom_to_empty_note";
    section.createEl("h4", { text: tr(explicit ? `@planner.op.${intent.operation}` : `@intent.title.${intent.family}`) });
    if (intent.reason) section.createEl("p", { text: intent.reason });
    if (intent.evidence.length) {
      const basis = section.createEl("details"); basis.createEl("summary", { text: tr("@planner.basis") });
      basis.createEl("p", { text: tr("@relationship.references", { ids: intent.evidence.join(", ") }) });
    }
    section.createEl("p", { text: tr(explicit ? intent.operation === "add_reciprocal_links" ? "@multi.warning" : "@emptyAtom.scope" : `@intent.effect.${intent.family}`) });
    for (const reason of intent.limitations) section.createEl("p", { text: tr(reason) });
    if (prepare || !intent.operation) {
      const control = section.createEl("button", { text: tr(explicit ? `@planner.op.${intent.operation}` : `@intent.cta.${intent.family}`),
        attr: { type: "button", "data-intent-action": selection.origin === "alternative" ? `alternative-${selection.index}` : selection.origin === "user" ? selection.action : "primary", "data-planner-action": "open" } });
      if (selection.origin === "primary") control.addClass("mod-cta");
      control.disabled = intent.status === "unavailable";
      control.addEventListener("click", () => {
        if (control.disabled || !container.contains(control) || session.analysisSource !== analysis) return;
        if (intent.family === "keep") session.dismiss();
        else if (intent.family === "manual") { evidence.open = true; evidence.setAttribute("tabindex", "-1"); evidence.focus(); }
        else prepare?.(selection);
      });
    }
  };
  propose(body, { origin: "primary" });
  const explanation = body.createEl("details");
  explanation.createEl("summary", { text: tr("@intent.explanation") });
  explanation.createEl("p", { text: result.explanation.text });
  const summary = body.createDiv({ cls: "ai-relationship-summary" });
  for (const [key, claims] of [["shared", result.claims.filter(claim => claim.kind === "shared")],
    ["differences", result.claims.filter(claim => claim.kind !== "shared")]] as const) {
    const section = summary.createEl("section");
    section.createEl("h4", { text: tr(`@workbench.${key}`) });
    if (!claims.length) section.createEl("p", { text: tr("@workbench.no-claims") });
    for (const claim of claims) section.createEl("p", { text: claim.text });
  }
  const evidence = body.createEl("details");
  evidence.createEl("summary", { text: tr("@relationship.evidence") });
  evidence.createEl("p", { text: tr("@relationship.evidenceScope") });
  evidence.createEl("p", { text: tr("@relationship.references", { ids: result.explanation.evidence.join(", ") || "—" }) });
  if (!result.claims.length) evidence.createEl("p", { text: tr("@relationship.noEvidence") });
  for (const claim of result.claims) {
    const card = evidence.createDiv({ cls: "ai-semantic-duplicate-card" });
    card.createEl("h5", { text: `${claim.id}: ${tr(`@relationship.kind.${claim.kind}`)}` });
    card.createEl("p", { text: claim.text });
    for (const [side, quote] of [["A", claim.quoteA], ["B", claim.quoteB]] as const) {
      if (quote === null) continue;
      card.createEl("p", { text: tr("@relationship.verifiedQuote", { side }) });
      card.createEl("pre", { cls: "ai-pair-source", text: quote, attr: { tabindex: "0" } });
    }
  }
  evidence.createEl("h4", { text: tr("@relationship.unique") });
  const unique = result.claims.filter(claim => /^(unique|context|standalone)_/.test(claim.kind));
  if (!unique.length) evidence.createEl("p", { text: tr("@relationship.noUnique") });
  for (const claim of unique) evidence.createEl("p", { text: `${claim.id}: ${claim.text}` });
  const alternatives = body.createEl("details");
  alternatives.createEl("summary", { text: tr("@intent.other") });
  result.alternatives.forEach((_, index) => propose(alternatives, { origin: "alternative", index }));
  alternatives.createEl("h4", { text: tr("@intent.user") });
  for (const action of ["add_link", "consider_merge", "consider_atomize", "add_reciprocal_links", "write_atom_to_empty_note"] as const)
    propose(alternatives, { origin: "user", action });
  const limitations = body.createEl("details");
  limitations.createEl("summary", { text: tr("@relationship.limitations") });
  limitations.createEl("p", { text: tr("@relationship.coverage") });
  for (const limitation of result.limitations) limitations.createEl("p", { text: limitation });
  button("dismiss", () => session.dismiss());
}
