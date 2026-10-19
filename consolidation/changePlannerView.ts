import { t as tr } from "../i18n";
import { renderPlanDiff } from "./planDiffView";
import type { ChangePlan } from "./changePlan";
import { paragraphRanges, permittedEmbed } from "./changePlan";
import type { PlanOperation, PlanRange } from "./changePlan";
import type { RelationshipAnalysis } from "./relationshipSession";
import type { ChangePlannerSession } from "./changePlannerSession";
import type { MultiFileChoice, MultiFilePlan } from "./multiFilePlan";
import { renderMultiFilePlanner } from "./multiFilePlannerView";
import { renderContextBundlePlanner } from "./contextBundleView";
import type { ContextBundlePlan } from "./contextBundlePlan";
import { emptyBundleChoice } from "./contextBundlePlan";
import { renderGroupPlanner } from "./groupPlannerView";
import type { GroupPlan } from "./groupPlan";
import { emptyGroupChoice } from "./groupPlan";
import { renderMergePlanner } from "./mergePlannerView";
import type { MergeChoice, MergePlan } from "./mergePlan";

import { emptyAtomizationChoice } from "./atomizationPlan";
import { renderAtomizationPlanner } from "./atomizationPlannerView";
import { renderEmptyAtomPlanner } from "./emptyAtomPlannerView";
import { emptyAtomChoice } from "./emptyAtomPlan";
import type { AtomizationPlanV2 } from "./emptyAtomPlan";

const emptyMerge = (): MergeChoice => ({ operation: "merge_knowledge", canonical: null, transfers: [], insertion: null, insertionConfirmed: false });

/** Text-only controls and preview; no Markdown renderer or application protocol. */
export class ChangePlannerView {
  private operation: PlanOperation | "add_reciprocal_links" | "merge_knowledge" | "copy_context_group" | "copy_context_bundle" | "atomization_preview" | "write_atom_to_empty_note" | "" = "";
  private side: 0 | 1 = 0;
  private selection: PlanRange | null = null;
  private confirmed = false;
  private multiSelections: [PlanRange | null, PlanRange | null] = [null, null];
  private multiConfirmed: [boolean, boolean] = [false, false];
  private mergeChoice = emptyMerge();
  private groupChoice = emptyGroupChoice();
  private bundleChoice = emptyBundleChoice();
  private atomizationChoice = emptyAtomizationChoice();
  private emptyChoice = emptyAtomChoice();
  constructor(private readonly container: HTMLElement, private readonly session: ChangePlannerSession,
    private readonly analysis: RelationshipAnalysis, private readonly review?: (plan: ChangePlan) => void,
    private readonly reviewMulti?: (plan: MultiFilePlan) => void, private readonly reviewMerge?: (plan: MergePlan) => void, private readonly reviewBundle?: (plan: ContextBundlePlan) => void, private readonly reviewGroup?: (plan: GroupPlan) => void,
    private readonly reviewEmptyAtom?: (plan: AtomizationPlanV2) => void) {
    session.onChange = () => {
      const active = container.ownerDocument?.activeElement;
      const field = active?.getAttribute("data-planner-field");
      const caret = active?.tagName === "INPUT" ? (active as HTMLInputElement).selectionStart : null;
      this.render();
      if (field) {
        const next = container.querySelector<HTMLElement>(`[data-planner-field="${field}"]`);
        next?.focus();
        if (caret !== null && next?.tagName === "INPUT") (next as HTMLInputElement).setSelectionRange(caret, caret);
      }
    };
    this.render();
  }
  private button(parent: HTMLElement, key: string, action: () => void): HTMLButtonElement {
    const button = parent.createEl("button", { text: tr(`@planner.${key}`), attr: { type: "button", "data-planner-action": key } });
    button.addEventListener("click", action); return button;
  }
  private changed(): void {
    this.emptyChoice = emptyAtomChoice();
    this.confirmed = false; this.multiSelections = [null, null]; this.multiConfirmed = [false, false]; this.mergeChoice = emptyMerge(); this.groupChoice = emptyGroupChoice(); this.bundleChoice = emptyBundleChoice(); this.atomizationChoice = emptyAtomizationChoice(); this.session.changeSelection();
  }
  render(): void {
    const root = this.container, view = this.session.view;
    root.empty(); root.createEl("h3", { text: tr("@planner.title") });
    root.createEl("p", { text: tr(this.operation === "write_atom_to_empty_note" ? "@emptyAtom.scope" : this.operation === "atomization_preview" ? "@atom.scope" : this.operation === "copy_context_bundle" ? "@bundle.scope" : this.operation === "copy_context_group" ? "@group.scope" : this.operation === "merge_knowledge" ? "@merge.scope" : this.operation === "add_reciprocal_links" ? "@multi.warning" : "@planner.scope") });
    root.createDiv({ text: tr(view.stage === "error" ? view.atomizationError ? `@atom.error.${view.atomizationError}` : view.bundleError ? `@bundle.error.${view.bundleError}` : view.groupError ? `@group.error.${view.groupError}` : view.mergeError ? `@merge.error.${view.mergeError}` : `@planner.error.${view.error}` : `@planner.stage.${view.stage}`),
      attr: { role: "status", "aria-live": "polite", "data-planner-stage": view.stage } });
    if (view.stage === "loading") { this.button(root, "cancel", () => this.session.cancel()); return; }
    if (!view.input) {
      this.button(root, "prepare", () => {
        this.emptyChoice = emptyAtomChoice();
        this.selection = null; this.operation = ""; this.confirmed = false; this.multiSelections = [null, null]; this.multiConfirmed = [false, false]; this.mergeChoice = emptyMerge(); this.groupChoice = emptyGroupChoice(); this.bundleChoice = emptyBundleChoice(); this.atomizationChoice = emptyAtomizationChoice();
        void this.session.prepare();
      }); return;
    }
    root.createEl("p", { text: tr(this.operation === "write_atom_to_empty_note" || this.operation === "atomization_preview" ? "@atom.supported" : this.operation === "copy_context_bundle" ? "@bundle.supported" : this.operation === "copy_context_group" ? "@group.branch" : this.operation === "merge_knowledge" ? "@merge.supported" : this.operation === "add_reciprocal_links" ? "@multi.unsupported" : "@planner.unsupported") });
    const controls = root.createDiv({ cls: "ai-planner-controls" });
    const sourceLabel = controls.createEl("label", { text: tr("@planner.source") });
    sourceLabel.hidden = this.operation === "write_atom_to_empty_note" || this.operation === "atomization_preview" || this.operation === "copy_context_bundle" || this.operation === "copy_context_group" || this.operation === "add_reciprocal_links" || this.operation === "merge_knowledge";
    const source = sourceLabel.createEl("select", { attr: { "data-planner-field": "source" } });
    view.input.pair.forEach((note, i) => source.createEl("option", { text: `${i === 0 ? "A" : "B"}: ${note.path}`, value: String(i) }));
    source.value = String(this.side);
    source.addEventListener("change", () => { this.side = source.value === "1" ? 1 : 0; this.operation = ""; this.selection = null; this.changed(); });
    const operationLabel = controls.createEl("label", { text: tr("@planner.operation") });
    const operation = operationLabel.createEl("select", { attr: { "data-planner-field": "operation" } });
    operation.createEl("option", { text: tr("@planner.choose"), value: "" });
    for (const key of ["add_link", ...(permittedEmbed(this.analysis, this.side) ? ["replace_with_embed"] : []), "no_change", "add_reciprocal_links", "merge_knowledge", "copy_context_group", "copy_context_bundle", "atomization_preview", "write_atom_to_empty_note"]) {
      operation.createEl("option", { text: tr(`@planner.op.${key}`), value: key });
    }
    operation.value = this.operation;
    operation.addEventListener("change", () => { this.operation = operation.value as typeof this.operation; this.selection = null; this.changed(); });
    if (this.operation) root.createEl("p", { text: tr(`@planner.op.${this.operation}`) });
    if (this.operation === "write_atom_to_empty_note") {
      renderEmptyAtomPlanner(root,this.session,this.analysis,this.emptyChoice,choice=>{this.emptyChoice=choice;this.session.changeSelection();},this.reviewEmptyAtom);
      return;
    }
    if (this.operation === "atomization_preview") {
      renderAtomizationPlanner(root, this.session, this.analysis, this.atomizationChoice, choice => { this.atomizationChoice = choice; this.session.changeSelection(); });
      return;
    }
    if (this.operation === "copy_context_bundle") {
      renderContextBundlePlanner(root, this.session, this.analysis, this.bundleChoice, choice => { this.bundleChoice = choice; this.session.changeSelection(); }, this.reviewBundle);
      return;
    }
    if (this.operation === "copy_context_group") {
      renderGroupPlanner(root, this.session, this.analysis, this.groupChoice, choice => { this.groupChoice = choice; this.session.changeSelection(); }, this.reviewGroup);
      return;
    }
    if (this.operation === "merge_knowledge") {
      renderMergePlanner(root, this.session, this.analysis, this.mergeChoice, choice => { this.mergeChoice = choice; this.session.changeSelection(); }, this.reviewMerge);
      return;
    }
    if (this.operation === "add_reciprocal_links") {
      const choice: MultiFileChoice = { operation: this.operation, selections: this.multiSelections, confirmed: this.multiConfirmed };
      renderMultiFilePlanner(root, this.session, choice, (side, range) => {
        this.multiSelections[side] = range; this.multiConfirmed = [false, false]; this.session.changeSelection();
      }, (side, confirmed) => { this.multiConfirmed[side] = confirmed; this.session.changeSelection(); }, this.reviewMulti);
      return;
    }
    const note = view.input.pair[this.side], target = view.input.pair[this.side === 0 ? 1 : 0];
    root.createEl("p", { text: tr("@planner.direction", { source: note.path, target: target.path }) });
    if (this.operation && this.operation !== "no_change") {
      root.createEl("p", { text: tr("@planner.selectionScope") });
      const label = root.createEl("label", { cls: "ai-planner-location", text: tr("@planner.location") });
      const select = label.createEl("select", { attr: { "data-planner-field": "range" } });
      select.createEl("option", { text: tr("@planner.choose"), value: "" });
      const ranges = paragraphRanges(note);
      for (const [i, range] of ranges.entries()) select.createEl("option", { text: `${range.start}–${range.end}: ${range.text.slice(0, 90)}`, value: String(i) });
      select.value = this.selection ? String(ranges.findIndex(range => range.start === this.selection!.start && range.end === this.selection!.end)) : "";
      select.addEventListener("change", () => { this.selection = select.value === "" ? null : ranges[Number(select.value)]; this.changed(); });
      if (!ranges.length) root.createEl("p", { text: tr(note.cache?.sections ? "@planner.noParagraphs" : "@planner.error.metadata") });
      const original = root.createEl("details"); original.createEl("summary", { text: tr("@planner.savedSource") });
      original.createEl("pre", { text: note.content, cls: "ai-pair-source", attr: { tabindex: "0" } });
      if (this.selection) {
        root.createEl("p", { text: tr("@planner.range", { start: this.selection.start, end: this.selection.end,
          point: this.operation === "add_link" ? this.selection.end : this.selection.start }) });
        root.createEl("pre", { text: this.selection.text, cls: "ai-pair-source", attr: { tabindex: "0", "data-planner-selection": "" } });
        const label = root.createEl("label", { cls: "ai-planner-confirm" });
        const confirm = label.createEl("input", { type: "checkbox", attr: { "data-planner-field": "confirm" } });
        confirm.checked = this.confirmed;
        label.createSpan({ text: tr(this.operation === "replace_with_embed" ? "@planner.confirmEmbed" : "@planner.confirmLink") });
        confirm.addEventListener("change", () => { this.confirmed = confirm.checked; this.session.changeSelection(); });
      }
    }
    const build = this.button(root, "build", () => {
      if (this.operation && this.operation !== "write_atom_to_empty_note" && this.operation !== "add_reciprocal_links" && this.operation !== "merge_knowledge" && this.operation !== "copy_context_group" && this.operation !== "copy_context_bundle" && this.operation !== "atomization_preview") void this.session.build({ operation: this.operation, source: this.side, selection: this.selection, confirmed: this.confirmed });
    });
    build.disabled = !this.operation || (this.operation !== "no_change" && (!this.selection || !this.confirmed));
    this.button(root, "cancel", () => this.session.cancel());
    if (!view.plan) return;
    const plan = view.plan, result = root.createDiv({ cls: "ai-planner-result" });
    result.createEl("h4", { text: tr("@planner.checked") });
    result.createEl("p", { text: tr(`@planner.op.${plan.operation}`) });
    result.createEl("p", { text: `${plan.sourcePath} → ${plan.targetPath}` });
    const basis = result.createEl("details"); basis.createEl("summary", { text: tr("@planner.basis") });
    basis.createEl("p", { text: tr("@planner.identity", { path: plan.sourcePath, hash: plan.sourceHash, modified: plan.source.modified, bytes: plan.source.bytes }) });
    basis.createEl("p", { text: tr("@planner.targetIdentity", { path: plan.targetPath, hash: plan.targetHash }) });
    basis.createEl("p", { text: tr("@planner.provenance", { provider: plan.provenance.provider, model: plan.provenance.model }) });
    basis.createEl("p", { text: `${tr(`@relationship.action.${plan.provenance.recommendation.action}`)}: ${plan.provenance.recommendation.reason}` });
    basis.createEl("p", { text: tr("@planner.links", { added: plan.affectedLinks.added ?? "—", count: plan.affectedLinks.preserved.length }) });
    for (const [key, text] of [["before", plan.before], ["after", plan.after]]) {
      const details = result.createEl("details"); details.createEl("summary", { text: tr(`@planner.${key}`) });
      details.createEl("pre", { text, cls: "ai-pair-source", attr: { tabindex: "0", "data-planner-text": key } });
    }
    if (plan.edit) renderPlanDiff(result, plan.before, plan.after);
    result.createEl("p", { text: tr("@planner.preserved") });
    result.createEl("p", { text: tr("@planner.limits") });
    if (plan.edit && this.review) {
      const check = result.createEl("button", { text: tr("@safeApply.review"), attr: { type: "button", "data-safe-action": "review" } });
      check.addEventListener("click", () => this.review!(plan));
    }
    for (const limitation of plan.modelLimitations) result.createEl("p", { text: limitation });
  }
}
