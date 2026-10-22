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
import { recommendationIntent, combineCapabilities, changeRangeOptions } from "./recommendationIntent";
import type { IntentSelection, CombineOperation } from "./recommendationIntent";
import { renderActionChoice } from "./consolidationActions";
import { workflowStep, focusStatus } from "./consolidationUx";

const emptyMerge = (): MergeChoice => ({ operation: "merge_knowledge", canonical: null, transfers: [], insertion: null, insertionConfirmed: false });

/** Text-only controls and preview; no Markdown renderer or application protocol. */
export class ChangePlannerView {
  private operation: PlanOperation | "add_reciprocal_links" | "merge_knowledge" | "copy_context_group" | "copy_context_bundle" | "atomization_preview" | "write_atom_to_empty_note" | "" = "";
  private combineCanonical: 0 | 1 | null = null;
  private combineOperation: CombineOperation | null = null;
  private side: 0 | 1 = 0;
  private sourceChosen = false;
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
    private readonly reviewEmptyAtom?: (plan: AtomizationPlanV2) => void, private readonly intentSelection?: IntentSelection) {
    this.resetIntent();
    session.onChange = () => {
      const active = container.ownerDocument?.activeElement;
      const field = active?.getAttribute("data-planner-field");
      const caret = active?.tagName === "INPUT" ? (active as HTMLInputElement).selectionStart : null;
      this.render();
      if (field) {
        const next = container.querySelector<HTMLElement>(`[data-planner-field="${field}"]`);
        next?.focus();
        if (caret !== null && next?.tagName === "INPUT") (next as HTMLInputElement).setSelectionRange(caret, caret);
      } else if (["ready", "error", "stale", "cancelled"].includes(session.view.stage)) focusStatus(container);
    };
    this.render();
  }
  private resetIntent(): void {
    if (!this.intentSelection) return;
    const intent = recommendationIntent(this.analysis, this.intentSelection);
    this.operation = intent.operation ?? "";
    this.sourceChosen = intent.direction !== null; this.side = intent.direction ?? 0;
    this.combineCanonical = null; this.combineOperation = null;
  }
  private renderCombine(root: HTMLElement): void {
    const pair = this.session.view.input!.pair;
    const label = root.createEl("label", { text: tr("@intent.canonical"), cls: "ai-planner-location" });
    const select = label.createEl("select", { attr: { "data-planner-field": "combine-canonical" } });
    select.createEl("option", { text: tr("@planner.choose"), value: "" });
    pair.forEach((note, side) => select.createEl("option", { text: note.path, value: String(side) }));
    select.value = this.combineCanonical === null ? "" : String(this.combineCanonical);
    select.addEventListener("change", () => {
      this.combineCanonical = select.value === "" ? null : select.value === "0" ? 0 : 1;
      this.combineOperation = null; this.changed();
    });
    if (this.combineCanonical === null) return;
    const canonical = this.combineCanonical, capabilities = combineCapabilities(this.analysis, pair, canonical);
    const usable = capabilities.filter(c => !c.reason);
    root.createEl("p", { text: tr("@intent.combineDirection", { target: pair[canonical].path, source: pair[canonical === 0 ? 1 : 0].path }) });
    if (!usable.length) {
      root.createEl("p", { text: tr("@intent.combineUnavailable"), attr: { role: "status", "data-intent-unavailable": "" } });
      for (const c of capabilities) root.createEl("p", { text: `${tr(`@intent.variant.${c.operation}`)}: ${tr(c.reason!)}` });
      return;
    }
    // A single supported representation is proposed; all fragment and insertion confirmations stay empty.
    const operation = this.combineOperation ?? (usable.length === 1 ? usable[0].operation : null);
    if (usable.length > 1) {
      const label = root.createEl("label", { text: tr("@intent.material"), cls: "ai-planner-location" });
      const select = label.createEl("select", { attr: { "data-planner-field": "combine-material" } });
      select.createEl("option", { text: tr("@planner.choose"), value: "" });
      for (const c of usable) select.createEl("option", { text: tr(`@intent.variant.${c.operation}`), value: c.operation });
      select.value = operation ?? "";
      select.addEventListener("change", () => { this.combineOperation = usable.find(c => c.operation === select.value)?.operation ?? null; this.changed(); });
    }
    if (!operation) return;
    root.createEl("h4", { text: tr(`@intent.variant.${operation}`) });
    if (operation === "merge_knowledge") {
      this.mergeChoice = { ...this.mergeChoice, canonical };
      renderMergePlanner(root, this.session, this.analysis, this.mergeChoice, choice => { this.mergeChoice = choice; this.session.changeSelection(); }, this.reviewMerge, true);
    } else if (operation === "copy_context_group") {
      this.groupChoice = { ...this.groupChoice, canonical };
      renderGroupPlanner(root, this.session, this.analysis, this.groupChoice, choice => { this.groupChoice = choice; this.session.changeSelection(); }, this.reviewGroup, true);
    } else {
      this.bundleChoice = { ...this.bundleChoice, canonical };
      renderContextBundlePlanner(root, this.session, this.analysis, this.bundleChoice, choice => { this.bundleChoice = choice; this.session.changeSelection(); }, this.reviewBundle, true);
    }
  }
  private button(parent: HTMLElement, key: string, action: () => void): HTMLButtonElement {
    const button = parent.createEl("button", { text: tr(`@planner.${key}`), cls: key === "build" ? "mod-cta" : "", attr: { type: "button", "data-planner-action": key } });
    button.addEventListener("click", action); return button;
  }
  private changed(): void {
    this.emptyChoice = emptyAtomChoice();
    this.confirmed = false; this.multiSelections = [null, null]; this.multiConfirmed = [false, false]; this.mergeChoice = emptyMerge(); this.groupChoice = emptyGroupChoice(); this.bundleChoice = emptyBundleChoice(); this.atomizationChoice = emptyAtomizationChoice(); this.session.changeSelection();
  }
  render(): void {
    const root = this.container, view = this.session.view;
    root.empty(); workflowStep(root, view.atomizationPlan || view.plan && !view.plan.edit ? "previewOnly" :
      view.plan || view.multiPlan || view.mergePlan || view.groupPlan || view.bundlePlan || view.emptyAtomPlan ? "preview" : this.intentSelection ? "parameters" : "action");
    const intent = this.intentSelection ? recommendationIntent(this.analysis, this.intentSelection, view.input?.pair, view.input?.linktexts) : undefined;
    root.createEl("h3", { text: tr(intent ? `@intent.title.${intent.family}` : "@planner.title") });
    if (intent) {
      root.createEl("p", { text: tr(`@intent.origin.${intent.origin}`), attr: { "data-intent-origin": intent.origin } });

    }
    root.createEl("p", { text: tr(intent ? this.operation === "add_reciprocal_links" ? "@multi.warning" : this.operation === "write_atom_to_empty_note" ? "@emptyAtom.scope" : `@intent.effect.${intent.family}` : this.operation === "write_atom_to_empty_note" ? "@emptyAtom.scope" : this.operation === "atomization_preview" ? "@atom.scope" : this.operation === "copy_context_bundle" ? "@bundle.scope" : this.operation === "copy_context_group" ? "@group.scope" : this.operation === "merge_knowledge" ? "@merge.scope" : this.operation === "add_reciprocal_links" ? "@multi.warning" : "@planner.scope") });
    root.createDiv({ text: tr(view.stage === "error" ? view.atomizationError ? `@atom.error.${view.atomizationError}` : view.bundleError ? `@bundle.error.${view.bundleError}` : view.groupError ? `@group.error.${view.groupError}` : view.mergeError ? `@merge.error.${view.mergeError}` : `@planner.error.${view.error}` : intent && view.stage === "choosing" ? "@intent.parameters" : `@planner.stage.${view.stage}`),
      attr: { role: "status", "aria-live": "polite", "data-planner-stage": view.stage } });
    if (view.stage === "loading") { this.button(root, "cancel", () => this.session.cancel()); return; }
    if (!view.input) {
      this.button(root, "prepare", () => {
        this.emptyChoice = emptyAtomChoice();
        this.selection = null; this.operation = ""; this.confirmed = false; this.multiSelections = [null, null]; this.multiConfirmed = [false, false]; this.mergeChoice = emptyMerge(); this.groupChoice = emptyGroupChoice(); this.bundleChoice = emptyBundleChoice(); this.atomizationChoice = emptyAtomizationChoice();
        this.resetIntent();
        void this.session.prepare();
      }); return;
    }
    if (intent?.status === "unavailable") {
      if (intent.family !== "combine" || this.combineCanonical === null) for (const reason of intent.limitations) root.createEl("p", { text: tr(reason), attr: { "data-intent-unavailable": "", role: "status" } });
      if (intent.family === "combine") this.renderCombine(root);
      return;
    }
    if (intent?.family === "combine") { this.renderCombine(root); return; }
    if (intent && !intent.operation) return;
    if (!intent || !["add_link", "replace_with_embed"].includes(this.operation)) root.createEl("p", { text: tr(this.operation === "write_atom_to_empty_note" || this.operation === "atomization_preview" ? "@atom.supported" : this.operation === "copy_context_bundle" ? "@bundle.supported" : this.operation === "copy_context_group" ? "@group.branch" : this.operation === "merge_knowledge" ? "@merge.supported" : this.operation === "add_reciprocal_links" ? "@multi.unsupported" : "@planner.unsupported") });
    const controls = root.createDiv({ cls: "ai-planner-controls" });
    const sourceLabel = controls.createEl("label", { text: tr(intent ? this.operation === "add_link" ? "@intent.linkSource" : "@intent.embedSource" : "@planner.source") });
    sourceLabel.hidden = this.operation === "write_atom_to_empty_note" || this.operation === "atomization_preview" || this.operation === "copy_context_bundle" || this.operation === "copy_context_group" || this.operation === "add_reciprocal_links" || this.operation === "merge_knowledge";
    const source = sourceLabel.createEl("select", { attr: { "data-planner-field": "source" } });
    source.createEl("option", { text: tr("@planner.choose"), value: "" });
    view.input.pair.forEach((note, i) => {
      const option = source.createEl("option", { text: `${i === 0 ? "A" : "B"}: ${note.path}`, value: String(i) });
      if (intent?.family === "link" && this.operation === "add_link") option.disabled = !changeRangeOptions(this.analysis, view.input!.pair, "add_link", i as 0 | 1).ranges.length;
    });
    source.disabled = intent?.family === "embed";
    source.value = this.sourceChosen ? String(this.side) : "";
    source.addEventListener("change", () => { this.sourceChosen = source.value === "0" || source.value === "1"; this.side = source.value === "1" ? 1 : 0; if (!intent) this.operation = ""; this.selection = null; this.changed(); });
    if (!intent) renderActionChoice(controls, this.operation, this.sourceChosen && !!permittedEmbed(this.analysis, this.side), value => {
      this.operation = value; this.selection = null; this.changed();
    });
    if (!this.operation) { root.createEl("p", { text: tr("@ux.noSelection") }); return; }
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
    if (["add_link", "replace_with_embed"].includes(this.operation) && !this.sourceChosen) {
      root.createEl("p", { text: tr("@planner.source") }); return;
    }
    const note = view.input.pair[this.side], target = view.input.pair[this.side === 0 ? 1 : 0];
    root.createEl("p", { text: tr("@planner.direction", { source: note.path, target: target.path }) });
    if (this.operation && this.operation !== "no_change") {
      if (!intent) root.createEl("p", { text: tr("@planner.selectionScope") });
      const label = root.createEl("label", { cls: "ai-planner-location", text: tr(intent ? this.operation === "add_link" ? "@intent.linkLocation" : "@intent.embedRange" : "@planner.location") });
      const select = label.createEl("select", { attr: { "data-planner-field": "range" } });
      select.createEl("option", { text: tr("@planner.choose"), value: "" });
      const options = intent ? changeRangeOptions(this.analysis, view.input.pair, this.operation, this.side, view.input.linktexts[this.side === 0 ? 1 : 0]) : undefined;
      const ranges = options?.ranges ?? paragraphRanges(note);
      for (const [i, range] of ranges.entries()) select.createEl("option", { text: `${intent ? i + 1 : `${range.start}–${range.end}`}: ${range.text.slice(0, 90)}`, value: String(i) });
      select.value = this.selection ? String(ranges.findIndex(range => range.start === this.selection!.start && range.end === this.selection!.end)) : "";
      select.addEventListener("change", () => { this.selection = select.value === "" ? null : ranges[Number(select.value)]; this.changed(); });
      if (!ranges.length) root.createEl("p", { text: tr(options?.reason ?? (note.cache?.sections ? "@planner.noParagraphs" : "@planner.error.metadata")), attr: { "data-intent-unavailable": "" } });
      const original = root.createEl("details"); original.createEl("summary", { text: tr("@planner.savedSource") });
      original.createEl("pre", { text: note.content, cls: "ai-pair-source", attr: { tabindex: "0" } });
      if (this.selection) {
        (intent ? original : root).createEl("p", { text: tr("@planner.range", { start: this.selection.start, end: this.selection.end,
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
      const check = result.createEl("button", { text: tr("@safeApply.review"), cls: "mod-cta", attr: { type: "button", "data-safe-action": "review" } });
      check.addEventListener("click", () => this.review!(plan));
    }
    for (const limitation of plan.modelLimitations) result.createEl("p", { text: limitation });
  }
}
