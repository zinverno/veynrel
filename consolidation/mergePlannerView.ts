import { t as tr } from "../i18n";
import { paragraphRanges } from "./changePlan";
import type { ChangePlannerSession } from "./changePlannerSession";
import type { RelationshipAnalysis } from "./relationshipSession";
import { mergeBlockFailure, mergeHints } from "./mergePlan";
import type { MergeChoice, MergePlan } from "./mergePlan";
import { renderPlanDiff } from "./planDiffView";

function button(root: HTMLElement, key: string, fn: () => void): HTMLButtonElement {
  const b = root.createEl("button", { text: tr(`@merge.${key}`), attr: { type: "button", "data-merge-action": key } }); b.addEventListener("click", fn); return b;
}
function source(root: HTMLElement, title: string, text: string, key: string, open = false): void {
  const d = root.createEl("details"); d.open = open; d.createEl("summary", { text: title });
  d.createEl("pre", { text, cls: "ai-pair-source", attr: { tabindex: "0", "data-merge-text": key } });
}
/** Local choices and literal previews; Apply opens a separate checked consent window. */
export function renderMergePlanner(root: HTMLElement, session: ChangePlannerSession, analysis: RelationshipAnalysis,
  choice: MergeChoice, change: (choice: MergeChoice) => void, review?: (plan: MergePlan) => void): void {
  const input = session.view.input;
  if (!input) return;
  const pair = input.pair, hints = mergeHints(analysis.result, pair);
  root.createEl("p", { text: tr("@merge.hintScope") });
  for (const [i, note] of pair.entries()) source(root, `${i === 0 ? "A" : "B"}: ${note.path}`, note.content, `source-${i}`, true);
  const hintPanel = root.createEl("details"); hintPanel.createEl("summary", { text: tr("@merge.hints") });
  for (const h of hints) {
    hintPanel.createEl("p", { text: `${tr(`@relationship.kind.${h.kind}`)} · ${h.side === 0 ? "A" : "B"} · ${h.range.start}–${h.range.end}: ${h.text}` });
    hintPanel.createEl("pre", { text: h.range.text, cls: "ai-pair-source", attr: { tabindex: "0" } });
  }
  const label = root.createEl("label", { text: tr("@merge.canonical"), cls: "ai-planner-location" });
  const select = label.createEl("select", { attr: { "data-planner-field": "merge-canonical" } });
  select.createEl("option", { text: tr("@planner.choose"), value: "" });
  pair.forEach((n, i) => select.createEl("option", { text: `${i === 0 ? "A" : "B"}: ${n.path}`, value: String(i) }));
  select.value = choice.canonical === null ? "" : String(choice.canonical);
  select.addEventListener("change", () => change({ ...choice, canonical: select.value === "" ? null : select.value === "0" ? 0 : 1,
    transfers: [], insertion: null, insertionConfirmed: false }));
  if (choice.canonical !== null) {
    const side = choice.canonical === 0 ? 1 : 0, secondary = pair[side];
    root.createEl("h4", { text: tr("@merge.blocks", { path: secondary.path }) });
    root.createEl("p", { text: tr("@merge.contextScope") });
    const ranges = paragraphRanges(secondary);
    if (!ranges.length) root.createEl("p", { text: tr(secondary.cache?.sections ? "@planner.noParagraphs" : "@planner.error.metadata") });
    for (const range of ranges) {
      const card = root.createEl("section", { cls: "ai-semantic-result-card" });
      const failure = mergeBlockFailure(secondary, range, hints, side);
      card.createEl("p", { text: `${range.start}–${range.end}` });
      card.createEl("pre", { text: range.text, cls: "ai-pair-source", attr: { tabindex: "0", "data-merge-block": String(range.start) } });
      if (failure) card.createEl("p", { text: tr(`@merge.error.${failure}`) });
      const label = card.createEl("label", { cls: "ai-planner-confirm" });
      const check = label.createEl("input", { type: "checkbox", attr: { "data-planner-field": `merge-transfer-${range.start}` } });
      label.createSpan({ text: tr("@merge.confirmBlock") }); check.disabled = !!failure;
      check.checked = choice.transfers.some(t => t.range.start === range.start && t.range.end === range.end);
      check.addEventListener("change", () => change({ ...choice, insertionConfirmed: false,
        transfers: [...choice.transfers.filter(t => t.range.start !== range.start), ...(check.checked ? [{ range, contextReviewed: true }] : [])] }));
    }
    const location = root.createEl("label", { text: tr("@merge.location"), cls: "ai-planner-location" });
    const anchor = location.createEl("select", { attr: { "data-planner-field": "merge-location" } });
    anchor.createEl("option", { text: tr("@planner.choose"), value: "" });
    const anchors = paragraphRanges(pair[choice.canonical]);
    anchors.forEach((r, i) => anchor.createEl("option", { text: `${r.start}–${r.end}: ${r.text.slice(0, 90)}`, value: String(i) }));
    anchor.value = choice.insertion ? String(anchors.findIndex(r => r.start === choice.insertion!.start && r.end === choice.insertion!.end)) : "";
    anchor.addEventListener("change", () => change({ ...choice, insertion: anchor.value === "" ? null : anchors[Number(anchor.value)], insertionConfirmed: false }));
    if (choice.insertion) {
      root.createEl("p", { text: tr("@planner.range", { start: choice.insertion.start, end: choice.insertion.end, point: choice.insertion.end }) });
      root.createEl("pre", { text: choice.insertion.text, cls: "ai-pair-source", attr: { tabindex: "0" } });
      const label = root.createEl("label", { cls: "ai-planner-confirm" });
      const check = label.createEl("input", { type: "checkbox", attr: { "data-planner-field": "merge-confirm" } });
      check.checked = choice.insertionConfirmed; label.createSpan({ text: tr("@merge.confirmInsertion") });
      check.addEventListener("change", () => change({ ...choice, insertionConfirmed: check.checked }));
    }
  }
  const build = button(root, "build", () => { void session.buildMerge(choice); });
  build.disabled = choice.canonical === null || !choice.transfers.length || !choice.insertion || !choice.insertionConfirmed;
  button(root, "cancel", () => session.cancel());
  const plan = session.view.mergePlan;
  if (!plan) return;
  const result = root.createDiv({ cls: "ai-planner-result", attr: { "data-merge-plan": "" } });
  result.createEl("h4", { text: tr("@merge.checked") });
  result.createEl("p", { text: tr("@merge.scope") });
  result.createEl("p", { text: `${plan.secondary.path} → ${plan.canonical.path}`, cls: "ai-pair-path" });
  for (const [key, text] of [["before", plan.canonical.before], ["after", plan.canonical.after]]) source(result, tr(`@planner.${key}`), text, key);
  renderPlanDiff(result, plan.canonical.before, plan.canonical.after);
  result.createEl("h4", { text: tr("@merge.retained") });
  result.createEl("p", { text: tr("@merge.secondaryScope") });
  for (const h of plan.hints.filter(h => h.side !== plan.provenance.userCanonical &&
    (h.kind === "shared" || h.kind.endsWith(h.side === 0 ? "_a" : "_b")))) {
    const copied = plan.transfers.some(t => t.range.start <= h.range.start && t.range.end >= h.range.end);
    source(result, `${tr(`@relationship.kind.${h.kind}`)} · ${tr(copied ? "@merge.copied" : "@merge.left")}`, h.range.text, `hint-${h.id}`);
  }
  for (const f of plan.retained) source(result, `${tr(f.copied ? "@merge.copied" : "@merge.left")} · ${f.range.start}–${f.range.end}${f.claimIds.length ? ` · ${f.claimIds.join(", ")}` : ""}`,
    f.range.text, `retained-${f.range.start}`);
  result.createEl("h4", { text: tr("@merge.dependencies") });
  result.createEl("p", { text: tr("@merge.dependencyScope") });
  for (const d of plan.dependencies) {
    const panel = result.createEl("details"); panel.createEl("summary", { text: d.path });
    for (const ref of d.outgoing) panel.createEl("p", { text: `${tr(`@merge.reference.${ref.kind}`)}: ${ref.original} → ${ref.target ?? tr("@merge.unresolved")}` });
    panel.createEl("p", { text: d.incoming ? tr("@merge.incoming", { shown: d.incoming.items.length, total: d.incoming.total }) : tr("@consolidation.unavailable") });
    for (const path of d.incoming?.items ?? []) panel.createEl("p", { text: path });
  }
  result.createEl("p", { text: tr("@planner.provenance", { provider: plan.provenance.provider, model: plan.provenance.model }) });
  result.createEl("p", { text: `${tr(`@relationship.relation.${plan.provenance.relation}`)}: ${plan.provenance.recommendation.reason}` });
  for (const limit of plan.modelLimitations) result.createEl("p", { text: limit });
  if (review) {
    const check = result.createEl("button", { text: tr("@mergeApply.review"), attr: { type: "button", "data-merge-apply-action": "review" } });
    check.addEventListener("click", () => review(plan));
  }
}
