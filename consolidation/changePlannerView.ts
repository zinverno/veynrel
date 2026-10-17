import { t as tr } from "../i18n";
import { renderPlanDiff } from "./planDiffView";
import type { ChangePlan } from "./changePlan";
import { paragraphRanges, permittedEmbed } from "./changePlan";
import type { PlanOperation, PlanRange } from "./changePlan";
import type { RelationshipAnalysis } from "./relationshipSession";
import type { ChangePlannerSession } from "./changePlannerSession";
import type { MultiFileChoice } from "./multiFilePlan";
import { renderMultiFilePlanner } from "./multiFilePlannerView";

/** Text-only controls and preview; no Markdown renderer or application protocol. */
export class ChangePlannerView {
  private operation: PlanOperation | "add_reciprocal_links" | "" = "";
  private side: 0 | 1 = 0;
  private selection: PlanRange | null = null;
  private confirmed = false;
  private multiSelections: [PlanRange | null, PlanRange | null] = [null, null];
  private multiConfirmed: [boolean, boolean] = [false, false];
  constructor(private readonly container: HTMLElement, private readonly session: ChangePlannerSession,
    private readonly analysis: RelationshipAnalysis, private readonly review?: (plan: ChangePlan) => void) {
    session.onChange = () => {
      const field = container.ownerDocument?.activeElement?.getAttribute("data-planner-field");
      this.render();
      if (field) container.querySelector<HTMLElement>(`[data-planner-field="${field}"]`)?.focus();
    };
    this.render();
  }
  private button(parent: HTMLElement, key: string, action: () => void): HTMLButtonElement {
    const button = parent.createEl("button", { text: tr(`@planner.${key}`), attr: { type: "button", "data-planner-action": key } });
    button.addEventListener("click", action); return button;
  }
  private changed(): void {
    this.confirmed = false; this.multiSelections = [null, null]; this.multiConfirmed = [false, false]; this.session.changeSelection();
  }
  render(): void {
    const root = this.container, view = this.session.view;
    root.empty(); root.createEl("h3", { text: tr("@planner.title") });
    root.createEl("p", { text: tr(this.operation === "add_reciprocal_links" ? "@multi.warning" : "@planner.scope") });
    root.createDiv({ text: tr(view.stage === "error" ? `@planner.error.${view.error}` : `@planner.stage.${view.stage}`),
      attr: { role: "status", "aria-live": "polite", "data-planner-stage": view.stage } });
    if (view.stage === "loading") { this.button(root, "cancel", () => this.session.cancel()); return; }
    if (!view.input) {
      this.button(root, "prepare", () => {
        this.selection = null; this.operation = ""; this.confirmed = false; this.multiSelections = [null, null]; this.multiConfirmed = [false, false];
        void this.session.prepare();
      }); return;
    }
    root.createEl("p", { text: tr(this.operation === "add_reciprocal_links" ? "@multi.unsupported" : "@planner.unsupported") });
    const controls = root.createDiv({ cls: "ai-planner-controls" });
    const sourceLabel = controls.createEl("label", { text: tr("@planner.source") });
    sourceLabel.hidden = this.operation === "add_reciprocal_links";
    const source = sourceLabel.createEl("select", { attr: { "data-planner-field": "source" } });
    view.input.pair.forEach((note, i) => source.createEl("option", { text: `${i === 0 ? "A" : "B"}: ${note.path}`, value: String(i) }));
    source.value = String(this.side);
    source.addEventListener("change", () => { this.side = source.value === "1" ? 1 : 0; this.operation = ""; this.selection = null; this.changed(); });
    const operationLabel = controls.createEl("label", { text: tr("@planner.operation") });
    const operation = operationLabel.createEl("select", { attr: { "data-planner-field": "operation" } });
    operation.createEl("option", { text: tr("@planner.choose"), value: "" });
    for (const key of ["add_link", ...(permittedEmbed(this.analysis, this.side) ? ["replace_with_embed"] : []), "no_change", "add_reciprocal_links"]) {
      operation.createEl("option", { text: tr(`@planner.op.${key}`), value: key });
    }
    operation.value = this.operation;
    operation.addEventListener("change", () => { this.operation = operation.value as typeof this.operation; this.selection = null; this.changed(); });
    if (this.operation) root.createEl("p", { text: tr(`@planner.op.${this.operation}`) });
    if (this.operation === "add_reciprocal_links") {
      const choice: MultiFileChoice = { operation: this.operation, selections: this.multiSelections, confirmed: this.multiConfirmed };
      renderMultiFilePlanner(root, this.session, choice, (side, range) => {
        this.multiSelections[side] = range; this.multiConfirmed = [false, false]; this.session.changeSelection();
      }, (side, confirmed) => { this.multiConfirmed[side] = confirmed; this.session.changeSelection(); });
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
      if (this.operation && this.operation !== "add_reciprocal_links") void this.session.build({ operation: this.operation, source: this.side, selection: this.selection, confirmed: this.confirmed });
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
