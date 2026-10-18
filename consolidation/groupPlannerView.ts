import { t as tr } from "../i18n";
import type { ChangePlannerSession } from "./changePlannerSession";
import type { RelationshipAnalysis } from "./relationshipSession";
import { emptyGroupChoice } from "./groupPlan";
import type { GroupChoice } from "./groupPlan";
import { contextGroups, groupDestination, GroupPlanError } from "./groupStructure";
import { renderPlanDiff } from "./planDiffView";

function source(root: HTMLElement, title: string, text: string, key: string, open = false): void {
  const panel = root.createEl("details"); panel.open = open; panel.createEl("summary", { text: title });
  panel.createEl("pre", { text, cls: "ai-pair-source", attr: { tabindex: "0", "data-group-text": key } });
}
/** Read-only choices. No executor callback exists for GroupPlan. */
export function renderGroupPlanner(root: HTMLElement, session: ChangePlannerSession, analysis: RelationshipAnalysis,
  choice: GroupChoice, change: (choice: GroupChoice) => void): void {
  const input = session.view.input;
  if (!input) return;
  const check = (key: "groupConfirmed" | "contextConfirmed" | "insertionConfirmed" | "distinctIntent") => {
    const label = root.createEl("label", { cls: "ai-planner-confirm" });
    const box = label.createEl("input", { type: "checkbox", attr: { "data-planner-field": `group-${key}` } });
    box.checked = choice[key]; label.createSpan({ text: tr(`@group.${key}`) });
    box.addEventListener("change", () => change({ ...choice, [key]: box.checked }));
  };
  const select = (key: string, values: [string, string][], value: string, changed: (value: string) => void) => {
    const label = root.createEl("label", { cls: "ai-planner-location", text: tr(`@group.${key}`) });
    const element = label.createEl("select", { attr: { "data-planner-field": `group-${key}` } });
    element.createEl("option", { text: tr("@planner.choose"), value: "" });
    for (const [value, text] of values) element.createEl("option", { value, text });
    element.value = value; element.addEventListener("change", () => changed(element.value));
  };
  const clear = { groupConfirmed: false, contextConfirmed: false, insertionConfirmed: false, dependencies: null, representation: null, insertion: null };
  root.createEl("p", { text: tr("@group.limits") });
  root.createEl("p", { text: tr("@merge.hintScope") });
  for (const [i, note] of input.pair.entries()) source(root, `${i === 0 ? "A" : "B"}: ${note.path}`, note.content, `source-${i}`);
  for (const text of analysis.result.limitations) root.createEl("p", { text });
  if (analysis.result.relation === "related_distinct") { root.createEl("p", { text: tr("@group.distinct") }); check("distinctIntent"); }
  select("canonical", input.pair.map((n, i) => [String(i), `${i === 0 ? "A" : "B"}: ${n.path}`]),
    choice.canonical === null ? "" : String(choice.canonical), value => change({ ...emptyGroupChoice(), canonical: value === "" ? null : value === "0" ? 0 : 1 }));
  if (choice.canonical !== null) {
    try {
      const secondary = input.pair[choice.canonical === 0 ? 1 : 0], canonical = input.pair[choice.canonical];
      const { headings, groups } = contextGroups(secondary);
      root.createEl("h4", { text: tr("@group.tree") });
      const tree = root.createEl("ul", { attr: { "data-group-tree": "" } });
      for (const h of headings) tree.createEl("li", { text: `${"· ".repeat(h.level - 1)}H${h.level} · ${h.range.start}–${h.end} · ${h.title}` });
      if (!groups.length) root.createEl("p", { text: tr("@group.noGroups") });
      select("selection", groups.map(g => [String(g.range.start), `${g.range.start}–${g.range.end}: ${g.path.map(i => headings[i].title).join(" → ")}${g.failure ? ` · ${tr(`@group.error.${g.failure}`)}` : ""}`]),
        choice.group ? String(choice.group.start) : "", value => change({ ...choice, ...clear, group: groups.find(g => String(g.range.start) === value)?.range ?? null }));
      const selected = groups.find(g => g.range.start === choice.group?.start);
      if (selected) {
        root.createEl("p", { text: selected.path.map(i => headings[i].range.text).join(" → "), attr: { "data-group-path": "" } });
        if (selected.failure) root.createEl("p", { text: tr(`@group.error.${selected.failure}`) });
        source(root, `${tr("@group.transferred")} · ${selected.range.start}–${selected.range.end}`, selected.range.text, "selected", true);
        for (const r of selected.context) source(root, `${tr("@group.context")} · ${r.start}–${r.end}`, r.text, `context-${r.start}`, true);
        for (const r of selected.retained) source(root, `${tr("@group.retained")} · ${r.start}–${r.end}`, r.text, `retained-${r.start}`);
        check("groupConfirmed");
        select("representation", [["original_heading_branch", tr("@group.branch")]], choice.representation ?? "", value => change({ ...choice,
          representation: value === "original_heading_branch" ? value : null, contextConfirmed: false, insertionConfirmed: false }));
        check("contextConfirmed");
        select("dependencies", [["reviewed", tr("@group.reviewed")], ["unresolved", tr("@group.unresolved")]], choice.dependencies ?? "",
          value => change({ ...choice, dependencies: value === "reviewed" || value === "unresolved" ? value : null }));
        select("insertion", [[String(canonical.content.length), tr("@group.eof", { point: canonical.content.length })]],
          choice.insertion === null ? "" : String(choice.insertion), value => change({ ...choice, insertion: value === "" ? null : Number(value), insertionConfirmed: false }));
        root.createEl("p", { text: tr("@group.separators") });
        source(root, tr("@group.expected"), selected.copied.flatMap(r => headings.filter(h => h.range.start >= r.start && h.range.end <= r.end).map(h => h.range.text)).join("\n"), "hierarchy");
        groupDestination(canonical);
        check("insertionConfirmed");
      }
    } catch (e) { root.createEl("p", { text: tr(`@group.error.${e instanceof GroupPlanError ? e.reason : "metadata"}`) }); }
  }
  const build = root.createEl("button", { text: tr("@group.build"), attr: { type: "button", "data-group-action": "build" } });
  build.disabled = choice.canonical === null || !choice.group || !choice.groupConfirmed || !choice.contextConfirmed || !choice.insertionConfirmed ||
    choice.representation === null || choice.insertion === null || choice.dependencies !== "reviewed" || (analysis.result.relation === "related_distinct" && !choice.distinctIntent);
  build.addEventListener("click", () => { void session.buildGroup(choice); });
  const cancel = root.createEl("button", { text: tr("@planner.cancel"), attr: { type: "button", "data-group-action": "cancel" } });
  cancel.addEventListener("click", () => session.cancel());
  const plan = session.view.groupPlan;
  if (!plan) return;
  const result = root.createDiv({ cls: "ai-planner-result", attr: { "data-group-plan": "" } });
  result.createEl("h4", { text: tr("@group.checked") });
  result.createEl("p", { text: tr("@group.scope") });
  result.createEl("p", { text: `${plan.secondary.path} → ${plan.canonical.path}` });
  for (const key of ["before", "after"] as const) source(result, tr(`@planner.${key}`), plan.canonical[key], key);
  renderPlanDiff(result, plan.canonical.before, plan.canonical.after);
  source(result, tr("@group.serialized"), JSON.stringify(plan, null, 2), "serialized");
  result.createEl("p", { text: tr("@merge.dependencyScope") });
  for (const d of plan.dependencies) source(result, d.path, JSON.stringify(d, null, 2), `dependencies-${d.path}`);
  result.createEl("p", { text: tr("@group.limits") });
}
