import { t as tr } from "../i18n";
import type { ChangePlannerSession } from "./changePlannerSession";
import type { RelationshipAnalysis } from "./relationshipSession";
import { atomizationCandidates, atomizationHintIds, emptyAtomizationChoice, resetAtomizationConfirmations } from "./atomizationPlan";
import type { AtomizationCandidate, AtomizationChoice } from "./atomizationPlan";

function source(root: HTMLElement, key: string, text: string, open = false): void {
  const panel = root.createEl("details"); panel.open = open; panel.createEl("summary", { text: tr(`@atom.${key}`) });
  panel.createEl("pre", { text, cls: "ai-pair-source", attr: { tabindex: "0", "data-atom-text": key } });
}
/** No Apply callback, Markdown renderer, file writer, journal or completion port. */
export function renderAtomizationPlanner(root: HTMLElement, session: ChangePlannerSession, analysis: RelationshipAnalysis,
  choice: AtomizationChoice, change: (choice: AtomizationChoice) => void): void {
  const input = session.view.input; if (!input) return;
  const select = (key: string, values: [string, string][], value: string, update: (value: string) => void) => {
    const label = root.createEl("label", { cls: "ai-planner-location", text: tr(`@atom.${key}`) });
    const field = label.createEl("select", { attr: { "data-planner-field": `atom-${key}` } });
    field.createEl("option", { text: tr("@planner.choose"), value: "" });
    values.forEach(([value, text]) => field.createEl("option", { value, text })); field.value = value;
    field.addEventListener("change", () => update(field.value));
  };
  select("source", input.pair.map((n, i) => [String(i), n.path]), choice.side === null ? "" : String(choice.side), value =>
    change({ ...emptyAtomizationChoice(), side: value === "" ? null : value === "0" ? 0 : 1 }));
  let candidate: AtomizationCandidate | undefined, hints: string[] = [];
  if (choice.side !== null) {
    const note = input.pair[choice.side]; source(root, "original", note.content);
    let candidates: AtomizationCandidate[] = [];
    try { candidates = atomizationCandidates(note); } catch { root.createEl("p", { text: tr("@atom.error.metadata") }); }
    const selected = candidates.findIndex(c => c.kind === choice.kind && JSON.stringify(c.range) === JSON.stringify(choice.range));
    select("selection", candidates.map((c, i) => [String(i), `${tr(`@atom.${c.kind}`)} ${c.range.start}–${c.range.end}: ${c.range.text.slice(0, 80)}`]),
      selected < 0 ? "" : String(selected), value => {
        const c = value === "" ? undefined : candidates[Number(value)];
        change(resetAtomizationConfirmations({ ...choice, kind: c?.kind ?? null, range: c?.range ?? null }));
      });
    for (const c of candidates.filter(c => c.failure)) root.createEl("p", { text: `${c.range.start}–${c.range.end}: ${tr(`@atom.error.${c.failure}`)}` });
    candidate = candidates[selected];
    if (candidate) {
      source(root, "unit", candidate.range.text, true);
      source(root, "context", candidate.context.map(r => `${r.start}–${r.end}\n${r.text}`).join("\n\n"), true);
      hints = atomizationHintIds(analysis, input.pair, choice.side, candidate);
      root.createEl("p", { text: tr(hints.length ? "@atom.hint" : "@atom.manual") });
      if (candidate.failure) root.createEl("p", { text: tr(`@atom.error.${candidate.failure}`) });
    }
  }
  for (const key of ["title", "path"] as const) {
    const label = root.createEl("label", { cls: "ai-planner-location", text: tr(`@atom.${key}`) });
    const field = label.createEl("input", { type: "text", attr: { "data-planner-field": `atom-${key}`, spellcheck: "false" } });
    field.value = choice[key];
    // Input invalidates immediately, including edits made before blur or an async result.
    field.addEventListener("input", () => change(resetAtomizationConfirmations({ ...choice, [key]: field.value })));
  }
  root.createEl("p", { text: tr("@atom.unknown") });
  root.createEl("p", { text: tr("@atom.addedExplanation") });
  if (choice.side !== null) source(root, "additions", `# ${choice.title}\n\nSource: [[${input.pair[choice.side].path.slice(0, -3)}]]`, true);
  const confirmations = ["unitConfirmed", "contextConfirmed", ...(!hints.length ? ["manualConfirmed" as const] : []),
    "titleConfirmed", "sourceConfirmed", "dependenciesReviewed"] as const;
  for (const key of confirmations) {
    const label = root.createEl("label", { cls: "ai-planner-confirm" });
    const checkbox = label.createEl("input", { type: "checkbox", attr: { "data-planner-field": `atom-${key}` } });
    checkbox.checked = choice[key]; label.createSpan({ text: tr(`@atom.${key}`) });
    checkbox.addEventListener("change", () => change({ ...choice, [key]: checkbox.checked }));
  }
  const build = root.createEl("button", { text: tr("@planner.build"), attr: { type: "button", "data-atom-action": "build" } });
  build.disabled = !candidate || !!candidate.failure || !choice.title || !choice.path || confirmations.some(key => !choice[key]);
  build.addEventListener("click", () => { void session.buildAtomization(choice); });
  const cancel = root.createEl("button", { text: tr("@planner.cancel"), attr: { type: "button", "data-atom-action": "cancel" } });
  cancel.addEventListener("click", () => session.cancel());
  const plan = session.view.atomizationPlan; if (!plan) return;
  const result = root.createDiv({ attr: { "data-atom-plan": "" } });
  result.createEl("h4", { text: tr("@atom.ready") });
  result.createEl("p", { text: plan.destination.path });
  source(result, "preview", plan.destination.markdown, true);
  source(result, "remaining", plan.source.remaining);
  source(result, "additions", plan.additions.title + plan.additions.separator + plan.additions.source);
  result.createEl("p", { text: `${plan.source.path} · ${plan.source.checksum} · ${plan.provenance.provider}/${plan.provenance.model}` });
  for (const limitation of plan.provenance.analysis.limitations) result.createEl("p", { text: limitation });
}
