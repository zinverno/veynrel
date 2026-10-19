import { t as tr } from "../i18n";

const groups = [
  ["link", ["add_link", "add_reciprocal_links", "replace_with_embed"]],
  ["copy", ["merge_knowledge", "copy_context_group", "copy_context_bundle"]],
  ["atom", ["atomization_preview", "write_atom_to_empty_note"]],
  ["keep", ["no_change"]],
] as const;
export type ConsolidationAction = typeof groups[number][1][number];

/** These are UI categories, not new operations or permission checks. */
export function renderActionChoice(root: HTMLElement, value: ConsolidationAction | "", canEmbed: boolean,
  change: (value: ConsolidationAction | "") => void): void {
  const label = root.createEl("label", { text: tr("@planner.operation"), cls: "ai-planner-location" });
  const select = label.createEl("select", { attr: { "data-planner-field": "operation" } });
  select.createEl("option", { text: tr("@planner.choose"), value: "" });
  for (const [group, actions] of groups) {
    const options = select.createEl("optgroup", { attr: { label: tr(`@ux.category.${group}`) } });
    for (const action of actions) {
      const option = options.createEl("option", { text: tr(`@planner.op.${action}`), value: action });
      option.disabled = action === "replace_with_embed" && !canEmbed;
    }
  }
  select.value = value;
  select.addEventListener("change", () => {
    const next = select.value;
    if (next === "" || groups.some(([, actions]) => actions.some(action => action === next)) && (next !== "replace_with_embed" || canEmbed))
      change(next as ConsolidationAction | "");
  });
  if (value) root.createEl("p", { text: tr(`@ux.effect.${value}`), cls: "ai-consolidation-effect", attr: { role: "status" } });
  const unavailable = root.createEl("details", { cls: "ai-consolidation-availability" });
  unavailable.createEl("summary", { text: tr("@ux.availability") });
  unavailable.createEl("p", { text: tr("@ux.checkedSelection") });
  if (!canEmbed) unavailable.createEl("p", { text: tr("@ux.embedUnavailable") });
  unavailable.createEl("p", { text: tr("@ux.archiveInHistory") });
}
