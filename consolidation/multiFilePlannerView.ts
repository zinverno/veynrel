import { t as tr } from "../i18n";
import { paragraphRanges } from "./changePlan";
import type { PlanRange } from "./changePlan";
import type { ChangePlannerSession } from "./changePlannerSession";
import type { MultiFileChoice } from "./multiFilePlan";
import { renderPlanDiff } from "./planDiffView";

/** No executor/callback is accepted here. This surface can only build or discard a whole plan. */
export function renderMultiFilePlanner(root: HTMLElement, session: ChangePlannerSession, choice: MultiFileChoice,
  select: (side: 0 | 1, range: PlanRange | null) => void, confirm: (side: 0 | 1, value: boolean) => void): void {
  const input = session.view.input;
  if (!input) return;
  root.createEl("p", { text: tr("@multi.warning") });
  if (session.view.errorSide !== undefined) root.createEl("p", { text: tr("@multi.errorSide", { path: input.pair[session.view.errorSide].path }) });
  for (const side of [0, 1] as const) {
    const note = input.pair[side], target = input.pair[side === 0 ? 1 : 0], selected = choice.selections[side];
    const card = root.createDiv({ cls: "ai-semantic-result-card" });
    card.createEl("h4", { text: side === 0 ? "A" : "B" });
    card.createEl("p", { text: tr("@planner.direction", { source: note.path, target: target.path }) });
    const label = card.createEl("label", { cls: "ai-planner-location", text: tr("@multi.location") });
    const field = label.createEl("select", { attr: { "data-planner-field": `range-${side}` } });
    field.createEl("option", { text: tr("@planner.choose"), value: "" });
    const ranges = paragraphRanges(note);
    ranges.forEach((range, i) => field.createEl("option", { text: `${range.start}–${range.end}: ${range.text.slice(0, 90)}`, value: String(i) }));
    field.value = selected ? String(ranges.findIndex(range => range.start === selected.start && range.end === selected.end && range.text === selected.text)) : "";
    field.addEventListener("change", () => select(side, field.value === "" ? null : ranges[Number(field.value)] ?? null));
    if (!ranges.length) card.createEl("p", { text: tr(note.cache?.sections ? "@planner.noParagraphs" : "@planner.error.metadata") });
    const saved = card.createEl("details"); saved.createEl("summary", { text: tr("@planner.savedSource") });
    saved.createEl("pre", { text: note.content, cls: "ai-pair-source", attr: { tabindex: "0" } });
    if (!selected) continue;
    card.createEl("p", { text: tr("@planner.range", { start: selected.start, end: selected.end, point: selected.end }) });
    card.createEl("pre", { text: selected.text, cls: "ai-pair-source", attr: { tabindex: "0", "data-multi-selection": String(side) } });
    const consent = card.createEl("label", { cls: "ai-planner-confirm" });
    const checkbox = consent.createEl("input", { type: "checkbox", attr: { "data-planner-field": `confirm-${side}` } });
    checkbox.checked = choice.confirmed[side];
    consent.createSpan({ text: tr("@planner.confirmLink") });
    checkbox.addEventListener("change", () => confirm(side, checkbox.checked));
  }
  const build = root.createEl("button", { text: tr("@multi.build"), attr: { type: "button", "data-planner-action": "buildMulti" } });
  build.disabled = choice.selections.some(range => !range) || choice.confirmed.some(confirmed => !confirmed);
  build.addEventListener("click", () => { void session.buildMulti(choice); });
  const cancel = root.createEl("button", { text: tr("@planner.cancel"), attr: { type: "button", "data-planner-action": "cancel" } });
  cancel.addEventListener("click", () => session.cancel());
  const plan = session.view.multiPlan;
  if (!plan) return;
  const result = root.createDiv({ cls: "ai-planner-result", attr: { "data-multi-plan": "" } });
  result.createEl("h4", { text: tr("@multi.title") });
  result.createEl("p", { text: tr("@multi.summary", { count: plan.files.length }) });
  result.createEl("p", { text: tr("@planner.op.add_reciprocal_links") });
  result.createEl("p", { text: tr("@multi.warning") });
  result.createEl("p", { text: tr("@planner.provenance", { provider: plan.provenance.provider, model: plan.provenance.model }) });
  result.createEl("p", { text: `${tr(`@relationship.action.${plan.provenance.recommendation.action}`)}: ${plan.provenance.recommendation.reason}` });
  for (const file of plan.files) {
    const card = result.createDiv({ cls: "ai-semantic-result-card", attr: { "data-multi-file": file.path } });
    card.createEl("p", { text: file.path, cls: "ai-pair-path" });
    card.createEl("p", { text: tr("@planner.identity", { path: file.path, hash: file.identity.contentHash, modified: file.identity.modified, bytes: file.identity.bytes }) });
    card.createEl("p", { text: tr("@planner.range", { start: file.userSelection.range.start, end: file.userSelection.range.end, point: file.edits[0].start }) });
    card.createEl("pre", { text: file.userSelection.range.text, cls: "ai-pair-source", attr: { tabindex: "0" } });
    card.createEl("p", { text: tr("@planner.links", { added: file.links.added, count: file.links.preserved.length }) });
    for (const [key, text] of [["before", file.before], ["after", file.after]]) {
      const details = card.createEl("details"); details.createEl("summary", { text: tr(`@planner.${key}`) });
      details.createEl("pre", { text, cls: "ai-pair-source", attr: { tabindex: "0", "data-planner-text": key } });
    }
    renderPlanDiff(card, file.before, file.after);
  }
  result.createEl("p", { text: tr("@multi.limits") });
  for (const limitation of plan.modelLimitations) result.createEl("p", { text: limitation });
}
