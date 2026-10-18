import { t as tr } from "../i18n";
import type { ChangePlannerSession } from "./changePlannerSession";
import type { RelationshipAnalysis } from "./relationshipSession";
import { emptyBundleChoice } from "./contextBundlePlan";
import type { ContextBundleChoice, ContextBundlePlan } from "./contextBundlePlan";
import { contextBundleCandidates, contextBundleDestination, ContextBundleError } from "./contextBundleStructure";
import type { BundleKind } from "./contextBundleStructure";
import { renderPlanDiff } from "./planDiffView";
const kinds: BundleKind[] = ["code_explanation", "list_context", "quotation_attribution"];
function source(root: HTMLElement, label: string, text: string, key: string, open = false): void {
  const panel = root.createEl("details"); panel.open = open; panel.createEl("summary", { text: label });
  panel.createEl("pre", { text, cls: "ai-pair-source", attr: { tabindex: "0", "data-bundle-text": key } });
}
/** The plan stays read-only; optional execution opens a separate consent flow. */
export function renderContextBundlePlanner(root: HTMLElement, session: ChangePlannerSession, analysis: RelationshipAnalysis,
  choice: ContextBundleChoice, change: (c: ContextBundleChoice) => void, review?: (plan: ContextBundlePlan) => void): void {
  const input = session.view.input; if (!input) return;
  const select = (key: string, options: [string, string][], value: string, onChange: (v: string) => void) => {
    const label = root.createEl("label", { text: tr(`@bundle.${key}`), cls: "ai-planner-location" });
    const el = label.createEl("select", { attr: { "data-planner-field": `bundle-${key}` } });
    el.createEl("option", { text: tr("@planner.choose"), value: "" }); options.forEach(([value, text]) => el.createEl("option", { value, text }));
    el.value = value; el.addEventListener("change", () => onChange(el.value));
  };
  const check = (key: string, text: string, checked: boolean, onChange: (v: boolean) => void) => {
    const label = root.createEl("label", { cls: "ai-planner-confirm" });
    const el = label.createEl("input", { type: "checkbox", attr: { "data-planner-field": `bundle-${key}` } });
    el.checked = checked; label.createSpan({ text }); el.addEventListener("change", () => onChange(el.checked));
  };
  root.createEl("p", { text: tr("@bundle.limits") });
  root.createEl("p", { text: tr("@merge.hintScope") });
  for (const [i, note] of input.pair.entries()) {
    source(root, `${i === 0 ? "A" : "B"}: ${note.path}`, note.content, `source-${i}`);
    source(root, tr("@bundle.references", { path: note.path }), JSON.stringify(note.references, null, 2), `references-${i}`);
  }
  root.createEl("p", { text: tr("@merge.dependencyScope") });
  for (const c of analysis.result.claims) source(root, `${tr(`@relationship.kind.${c.kind}`)}: ${c.text}`, [c.quoteA, c.quoteB].filter(Boolean).join("\n"), `hint-${c.id}`);
  for (const text of analysis.result.limitations) root.createEl("p", { text });
  select("canonical", input.pair.map((n, i) => [String(i), `${i === 0 ? "A" : "B"}: ${n.path}`]), choice.canonical === null ? "" : String(choice.canonical),
    value => change({ ...emptyBundleChoice(), canonical: value === "" ? null : value === "0" ? 0 : 1 }));
  let valid = false;
  if (choice.canonical !== null) {
    select("kind", kinds.map(k => [k, tr(`@bundle.kind.${k}`)]), choice.kind ?? "", value => change({ ...emptyBundleChoice(), canonical: choice.canonical, kind: kinds.find(k => k === value) ?? null }));
    if (analysis.result.relation === "related_distinct") {
      root.createEl("p", { text: tr("@group.distinct") });
      check("distinctIntent", tr("@group.distinctIntent"), choice.distinctIntent, value => change({ ...choice, distinctIntent: value }));
    }
    if (choice.kind) try {
      const secondary = input.pair[1 - choice.canonical], canonical = input.pair[choice.canonical];
      const candidates = contextBundleCandidates(secondary).filter(c => c.kind === choice.kind);
      if (!candidates.length) root.createEl("p", { text: tr("@bundle.none") });
      select("selection", candidates.map(c => [String(c.core.start), `${c.core.start}–${c.core.end} · ${tr(`@bundle.kind.${c.kind}`)}${c.failure ? ` · ${tr(`@bundle.error.${c.failure}`)}` : ""}`]),
        choice.core ? String(choice.core.start) : "", value => change({ ...emptyBundleChoice(), canonical: choice.canonical, kind: choice.kind,
          core: candidates.find(c => String(c.core.start) === value)?.core ?? null }));
      const selected = candidates.find(c => c.core.start === choice.core?.start);
      if (selected) {
        if (selected.failure) root.createEl("p", { text: tr(`@bundle.error.${selected.failure}`) });
        for (const block of selected.blocks) {
          const r = block.range;
          source(root, `${tr(`@bundle.role.${block.role}`)} · ${r.start}–${r.end}`, r.text, `block-${r.start}`, true);
          if (block.role !== "core") check(`context-${r.start}`, tr("@bundle.selectContext"), choice.context.some(c => c.start === r.start), value => change({ ...choice,
            context: [...choice.context.filter(c => c.start !== r.start), ...(value ? [r] : [])].sort((a, b) => a.start - b.start), contextConfirmed: false, insertionConfirmed: false }));
        }
        for (const r of selected.retained) source(root, `${tr("@group.retained")} · ${r.start}–${r.end}`, r.text, `retained-${r.start}`);
        check("boundariesConfirmed", tr("@bundle.boundariesConfirmed"), choice.boundariesConfirmed, value => change({ ...choice, boundariesConfirmed: value }));
        check("contextConfirmed", tr(`@bundle.context.${selected.kind}`), choice.contextConfirmed, value => change({ ...choice, contextConfirmed: value }));
        select("dependencies", [["reviewed", tr("@group.reviewed")], ["unresolved", tr("@group.unresolved")]], choice.dependencies ?? "",
          value => change({ ...choice, dependencies: value === "reviewed" || value === "unresolved" ? value : null }));
        select("insertion", [[String(canonical.content.length), tr("@bundle.eof", { point: canonical.content.length })]], choice.insertion === null ? "" : String(choice.insertion),
          value => change({ ...choice, insertion: value === "" ? null : Number(value), insertionConfirmed: false }));
        contextBundleDestination(canonical);
        check("insertionConfirmed", tr("@bundle.insertionConfirmed"), choice.insertionConfirmed, value => change({ ...choice, insertionConfirmed: value }));
        valid = !selected.failure && JSON.stringify(choice.context) === JSON.stringify([...selected.before, ...selected.after]);
      }
    } catch (e) { root.createEl("p", { text: tr(`@bundle.error.${e instanceof ContextBundleError ? e.reason : "metadata"}`) }); }
  }
  const build = root.createEl("button", { text: tr("@bundle.build"), attr: { type: "button", "data-bundle-action": "build" } });
  build.disabled = !valid || !choice.boundariesConfirmed || !choice.contextConfirmed || !choice.insertionConfirmed || choice.insertion === null ||
    choice.dependencies !== "reviewed" || (analysis.result.relation === "related_distinct" && !choice.distinctIntent);
  build.addEventListener("click", () => { void session.buildBundle(choice); });
  const cancel = root.createEl("button", { text: tr("@planner.cancel"), attr: { type: "button", "data-bundle-action": "cancel" } });
  cancel.addEventListener("click", () => session.cancel());
  const plan = session.view.bundlePlan; if (!plan) return;
  const result = root.createDiv({ cls: "ai-planner-result", attr: { "data-bundle-plan": "" } });
  result.createEl("h4", { text: tr("@bundle.checked") }); result.createEl("p", { text: tr("@bundle.scope") });
  result.createEl("p", { text: `${plan.secondary.path} → ${plan.canonical.path}` });
  for (const key of ["before", "after"] as const) source(result, tr(`@planner.${key}`), plan.canonical[key], key);
  renderPlanDiff(result, plan.canonical.before, plan.canonical.after);
  source(result, tr("@bundle.serialized"), JSON.stringify(plan, null, 2), "serialized");
  result.createEl("p", { text: tr("@bundle.limits") });
  if (review) {
    const button=result.createEl("button", {text:tr("@bundleApply.review"),attr:{type:"button","data-bundle-apply-action":"review"}});
    button.addEventListener("click",()=>review(plan));
  }
}
