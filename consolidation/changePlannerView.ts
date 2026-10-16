import { t as tr } from "../i18n";
import { proposalDiff } from "../proposals/diff";
import { paragraphRanges, permittedEmbed } from "./changePlan";
import type { PlanOperation, PlanRange } from "./changePlan";
import type { RelationshipAnalysis } from "./relationshipSession";
import type { ChangePlannerSession } from "./changePlannerSession";

/** Text-only controls and preview; no Markdown renderer or application protocol. */
export class ChangePlannerView {
  private operation: PlanOperation | "" = "";
  private side: 0 | 1 = 0;
  private selection: PlanRange | null = null;
  private confirmed = false;
  constructor(private readonly container: HTMLElement, private readonly session: ChangePlannerSession,
    private readonly analysis: RelationshipAnalysis) {
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
  private changed(): void { this.confirmed = false; this.session.changeSelection(); }
  render(): void {
    const root = this.container, view = this.session.view;
    root.empty(); root.createEl("h3", { text: tr("@planner.title") });
    root.createEl("p", { text: tr("@planner.scope") });
    root.createDiv({ text: tr(view.stage === "error" ? `@planner.error.${view.error}` : `@planner.stage.${view.stage}`),
      attr: { role: "status", "aria-live": "polite", "data-planner-stage": view.stage } });
    if (view.stage === "loading") { this.button(root, "cancel", () => this.session.cancel()); return; }
    if (!view.input) {
      this.button(root, "prepare", () => { this.selection = null; this.operation = ""; this.confirmed = false; void this.session.prepare(); }); return;
    }
    root.createEl("p", { text: tr("@planner.unsupported") });
    const controls = root.createDiv({ cls: "ai-planner-controls" });
    const sourceLabel = controls.createEl("label", { text: tr("@planner.source") });
    const source = sourceLabel.createEl("select", { attr: { "data-planner-field": "source" } });
    view.input.pair.forEach((note, i) => source.createEl("option", { text: `${i === 0 ? "A" : "B"}: ${note.path}`, value: String(i) }));
    source.value = String(this.side);
    source.addEventListener("change", () => { this.side = source.value === "1" ? 1 : 0; this.operation = ""; this.selection = null; this.changed(); });
    const operationLabel = controls.createEl("label", { text: tr("@planner.operation") });
    const operation = operationLabel.createEl("select", { attr: { "data-planner-field": "operation" } });
    operation.createEl("option", { text: tr("@planner.choose"), value: "" });
    for (const key of ["add_link", ...(permittedEmbed(this.analysis, this.side) ? ["replace_with_embed"] : []), "no_change"]) {
      operation.createEl("option", { text: tr(`@planner.op.${key}`), value: key });
    }
    operation.value = this.operation;
    operation.addEventListener("change", () => { this.operation = operation.value as PlanOperation | ""; this.selection = null; this.changed(); });
    if (this.operation) root.createEl("p", { text: tr(`@planner.op.${this.operation}`) });
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
      if (this.operation) void this.session.build({ operation: this.operation, source: this.side, selection: this.selection, confirmed: this.confirmed });
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
    if (plan.edit) this.diff(result, plan.before, plan.after);
    result.createEl("p", { text: tr("@planner.preserved") });
    result.createEl("p", { text: tr("@planner.limits") });
    for (const limitation of plan.modelLimitations) result.createEl("p", { text: limitation });
  }
  private diff(root: HTMLElement, before: string, after: string): void {
    const panel = root.createDiv({ cls: "ai-proposal-diff-panel" });
    const legend = panel.createDiv({ cls: "ai-proposal-diff-legend" });
    legend.createSpan({ text: tr("@planner.diff"), cls: "ai-proposal-diff-title" });
    let oldLine = 0, newLine = 0, page = 0;
    const lines = proposalDiff(before, after).map(line => ({ ...line,
      oldLine: line.kind === "added" ? "" : String(++oldLine), newLine: line.kind === "removed" ? "" : String(++newLine) }));
    const status = legend.createDiv({ attr: { role: "status", "aria-live": "polite" } });
    const diff = panel.createDiv({ cls: "ai-proposal-diff", attr: { tabindex: "0", "aria-label": tr("@planner.diff") } });
    const controls = panel.createDiv({ cls: "ai-proposal-pagination" });
    const previous = this.button(controls, "previous", () => { page--; render(); });
    const next = this.button(controls, "next", () => { page++; render(); });
    const render = () => {
      diff.empty(); const start = page * 200, end = Math.min(start + 200, lines.length);
      status.setText(tr("@planner.diffPage", { start: start + 1, end, total: lines.length }));
      for (const line of lines.slice(start, end)) {
        const row = diff.createDiv({ cls: `ai-proposal-diff-line ai-proposal-${line.kind}` });
        const numbers = row.createDiv({ cls: "ai-proposal-line-numbers", attr: { "aria-hidden": "true" } });
        numbers.createSpan({ text: line.oldLine }); numbers.createSpan({ text: line.newLine });
        row.createEl("pre", { cls: "ai-proposal-line-text", text: `${line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "} ${line.text}` });
      }
      previous.disabled = page === 0; next.disabled = end === lines.length;
    };
    render();
  }
}
