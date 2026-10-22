import { t as tr } from "../i18n";
import { RELATIONSHIP_LIMITS } from "./relationshipPrompt";
import type { RelationshipSession } from "./relationshipSession";
import { recommendationIntent } from "./recommendationIntent";
import type { IntentSelection } from "./recommendationIntent";
import type { RecommendationAvailability } from "./recommendationPreflight";
import { reviewIcon, reviewName } from "./reviewPresentation";
import { renderRelationshipFailure } from "./relationshipFailureView";

/** All model prose and literal excerpts are text nodes, never rendered Markdown/HTML. */
export function renderRelationshipView(container: HTMLElement, session: RelationshipSession, prepare?: (selection: IntentSelection) => void,
  availability?: RecommendationAvailability, keepSeparate?: () => Promise<void>, sources?: () => void): void {
  container.empty();
  const view = session.view, body = container.createDiv({ cls: "ai-relationship-body" });
  const status = body.createDiv({ cls: "ai-review-stage", text: tr(view.result ? "@final.decisionStage" : view.stage === "error" ? "@final.errorStage" : `@relationship.stage.${view.stage}`),
    attr: { role: "status", "aria-live": "polite", "data-relationship-stage": view.stage } });
  const actions = container.createDiv({ cls: "ai-consolidation-actions ai-relationship-actions" });
  const button = (key: string, action: () => void) => {
    const control = actions.createEl("button", { text: tr(`@relationship.${key}`), cls: key === "confirm" ? "mod-cta" : "", attr: { type: "button", "data-relationship-action": key } });
    control.addEventListener("click", action);
  };
  if (view.stage === "running" || view.stage === "cancelled") body.createEl("p", { text: tr("@relationship.cancelScope"), cls: "ai-review-caption" });
  if (view.consent) {
    const preview = view.consent, panel = body.createEl("section", { cls: "ai-review-panel" });
    panel.createEl("h3", { text: tr("@final.sending") });
    const summary = panel.createEl("dl", { cls: "ai-review-keyval" });
    for (const [label, value] of [["@final.contents", "@final.contentsText"], ["@final.payment", "@final.paymentText"]]) {
      summary.createEl("dt", { text: tr(label) }); summary.createEl("dd", { text: tr(value) });
    }
    summary.createEl("dt", { text: tr("@final.destination") }); summary.createEl("dd", { text: `${preview.provider} · ${preview.model}` });
    summary.createEl("dt", { text: tr("@final.limit") }); summary.createEl("dd", { text: tr("@flow.output-cap", { tokens: preview.maxTokens }) });
    if (preview.evidence?.uncoveredCharacters.some(n => n > 0)) panel.createEl("p", { text: tr("@relationship.catalog", { count: preview.evidence.fragments,
      a: preview.evidence.uncoveredCharacters[0], b: preview.evidence.uncoveredCharacters[1] }) });
    panel.createEl("p", { text: tr("@relationship.fullInput"), cls: "ai-review-caption" });
    const payload = body.createEl("details", { cls: "ai-review-technical" }); payload.createEl("summary", { text: tr("@relationship.payload") });
    payload.createEl("p", { text: preview.paths.join("\n"), cls: "ai-relationship-paths" });
    payload.createEl("p", { text: tr("@relationship.volume", { a: preview.characters[0], b: preview.characters[1], bytes: preview.bytes }) });
    payload.createEl("p", { text: tr("@relationship.budget", { tokens: preview.maxTokens, reasoning: tr(`@relationship.reasoning.${preview.reasoning}`) }) });
    payload.createEl("p", { text: preview.endpoint, cls: "ai-relationship-paths" });
    payload.createEl("pre", { text: preview.body, cls: "ai-pair-source", attr: { tabindex: "0", "aria-label": tr("@relationship.payload") } });
    button("confirm", () => { void session.confirm(); });
  }
  if (["preparing", "consent", "running"].includes(view.stage)) button("cancel", () => session.cancel());
  if (view.error) renderRelationshipFailure(body, session, sources);
  if (view.error === "tooLarge") body.createEl("p", { text: tr("@relationship.limits", {
    note: RELATIONSHIP_LIMITS.noteCharacters, pair: RELATIONSHIP_LIMITS.pairCharacters, bytes: RELATIONSHIP_LIMITS.requestBytes,
  }) });
  if (!view.result) return;
  const result = view.result, analysis = session.analysisSource;
  if (!analysis) return;
  status.createSpan({ text: ` · ${tr(`@relationship.relation.${result.relation}`)}` });
  let evidence: HTMLElement;
  const inspectEvidence = () => { evidence.hidden = false; evidence.focus(); evidence.scrollIntoView({ block: "start" }); };
  const propose = (parent: HTMLElement, selection: IntentSelection) => {
    const intent = recommendationIntent(analysis, selection, availability?.pair, availability?.linktexts);
    const pending = !!intent.operation && availability?.state !== "ready", unavailable = intent.status === "unavailable";
    const section = parent.createEl("section", { cls: "ai-review-proposal", attr: { "data-intent-origin": intent.origin } });
    const tile = section.createEl("button", { cls: "ai-review-decision", attr: { type: "button", "data-intent-action":
      selection.origin === "alternative" ? `alternative-${selection.index}` : selection.origin === "user" ? selection.action : "primary", "data-planner-action": "open" } });
    tile.disabled = pending || unavailable || intent.family === "keep" && !keepSeparate;
    reviewIcon(tile, unavailable ? "circle-alert" : { link: "link", embed: "file-input", combine: "combine", atom: "scissors", keep: "check", manual: "scan-text" }[intent.family]);
    const content = tile.createSpan({ cls: "ai-review-decision-copy" });
    content.createSpan({ cls: "ai-review-eyebrow", text: `${tr(selection.origin === "user" ? "@final.interfaceOption" : `@intent.origin.${selection.origin}`)} · ${tr(pending ? "@flow.preflight.checking" : unavailable ? "@final.unavailable" : "@final.canPrepare")}` });
    content.createSpan({ cls: "ai-review-decision-title", text: tr(`@intent.title.${intent.family}`) });
    content.createSpan({ cls: "ai-review-decision-effect", text: tr(`@intent.effect.${intent.family}`) });
    if (intent.direction !== null) content.createSpan({ text: `${reviewName(analysis.pair[intent.direction].path)} ← ${reviewName(analysis.pair[intent.direction === 0 ? 1 : 0].path)}` });
    content.createSpan({ cls: "ai-review-decision-next", text: tr(pending || unavailable ? "@final.unavailableNext" : `@intent.cta.${intent.family}`) });
    reviewIcon(tile, "arrow-right");
    if (pending) section.createEl("p", { text: tr(`@flow.preflight.${availability?.state ?? "checking"}`), attr: { "data-intent-availability": availability?.state ?? "checking" } });
    for (const reason of intent.limitations) section.createEl("p", { cls: "ai-review-restriction", text: tr(reason === "@planner.error.existing" ? "@flow.already-linked" : reason === "@planner.error.protected" ? "@flow.protected" : reason === "@planner.error.evidence" ? "@flow.evidence" : reason), attr: { "data-intent-unavailable": "" } });
    tile.addEventListener("click", () => {
      if (tile.disabled || !container.contains(tile) || session.analysisSource !== analysis) return;
      if (intent.family === "keep") { tile.disabled = true; void keepSeparate?.().finally(() => { tile.disabled = false; }); }
      else if (intent.family === "manual") inspectEvidence();
      else prepare?.(selection);
    });
    return unavailable;
  };
  const unavailable = propose(body, { origin: "primary" });
  body.createEl("small", { text: tr(result.recommendation.action === "no_change" ? "@decision.reversible" : "@final.prepareOnly"), cls: "ai-review-caption" });
  const summary = body.createDiv({ cls: "ai-relationship-summary" });
  for (const [key, claims] of [["shared", result.claims.filter(c => c.kind === "shared")], ["differences", result.claims.filter(c => c.kind !== "shared")]] as const) {
    if (!claims.length) continue;
    const section = summary.createEl("section"); section.createEl("h3", { text: tr(`@workbench.${key}`) });
    for (const claim of claims) section.createEl("p", { text: claim.text });
  }
  const rationale = body.createEl("section", { cls: "ai-review-rationale" });
  rationale.createEl("h3", { text: tr("@final.reason") }); rationale.createEl("p", { text: result.recommendation.reason });
  if (result.explanation.text !== result.recommendation.reason) rationale.createEl("p", { text: result.explanation.text });
  for (const limitation of result.limitations) rationale.createEl("p", { text: limitation, cls: "ai-review-caption" });
  const show = body.createEl("button", { text: tr("@relationship.evidence"), attr: { type: "button", "data-relationship-action": "evidence" } });
  show.addEventListener("click", inspectEvidence);
  body.createEl("small", { text: tr("@relationship.evidenceScope"), cls: "ai-review-caption" });
  evidence = body.createEl("section", { cls: "ai-review-evidence", attr: { tabindex: "-1", "data-review-evidence": "" } }); evidence.hidden = true;
  evidence.createEl("h3", { text: tr("@relationship.evidence") });
  evidence.createEl("p", { text: tr("@final.frozenEvidence") });
  if (!result.claims.length) evidence.createEl("p", { text: tr("@relationship.noEvidence") });
  for (const claim of result.claims) {
    const card = evidence.createEl("article", { cls: "ai-review-panel" });
    card.createEl("h4", { text: claim.text }); card.createEl("small", { text: tr(`@relationship.kind.${claim.kind}`) });
    const quotes = card.createDiv({ cls: "ai-relationship-summary" });
    for (const [side, quote] of [[0, claim.quoteA], [1, claim.quoteB]] as const) {
      if (quote === null) continue;
      const source = quotes.createEl("section"); source.createEl("strong", { text: `${side ? "B" : "A"} · ${reviewName(analysis.pair[side].path)}` });
      source.createEl("blockquote", { text: quote, cls: "ai-review-quote" });
      source.createEl("small", { text: analysis.pair[side].path });
    }
  }
  if (sources) { const current = evidence.createEl("button", { text: tr("@final.currentSources"), attr: { type: "button" } }); current.addEventListener("click", sources); }
  const alternatives = body.createEl("details", { cls: "ai-review-options" }); alternatives.open = unavailable;
  alternatives.createEl("summary", { text: tr("@intent.other") });
  result.alternatives.forEach((_, index) => propose(alternatives, { origin: "alternative", index }));
  for (const action of ["add_link", "consider_merge"] as const) {
    if (action === result.recommendation.action) continue;
    const selection = { origin: "user", action } as const;
    if (availability?.state === "ready" && recommendationIntent(analysis, selection, availability.pair, availability.linktexts).status !== "unavailable") propose(alternatives, selection);
  }
  if (keepSeparate && result.recommendation.action !== "no_change") {
    const keep = actions.createEl("button", { text: tr("@flow.keep"), attr: { type: "button", "data-review-keep": "" } });
    keep.addEventListener("click", () => { if (container.contains(keep) && session.analysisSource === analysis) { keep.disabled = true; void keepSeparate().finally(() => { keep.disabled = false; }); } });
  }
}
