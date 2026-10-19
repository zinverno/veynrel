import { App, Modal } from "obsidian";
import { t as tr } from "../i18n";
import { ArchiveSessionV2 } from "./archiveSessionV2";
import type { ArchiveReadV2 } from "./archiveSessionV2";
import { ARCHIVE_LIMITATIONS } from "./archivePlan";
import { archivePartition, archiveReviewParts, archiveSourceRanges } from "./archivePlanV2";
import type { ArchiveChoiceV2 } from "./archivePlanV2";
import type { ArchiveDisposition } from "./archivePlan";
import { renderPlanDiff } from "./planDiffView";
import type { GroupHistory } from "./groupApply";
import type { BundleHistory } from "./bundleApply";

export function renderStructuralArchiveAction(root: HTMLElement, row: GroupHistory | BundleHistory, open: () => void): void {
  if (row.record && row.canUndo && !row.damaged && !row.recovered && !row.blocking && row.receipts.length > 0 && row.receipts.every(r => r.state === "applied")) {
    const b = root.createEl("button", { text: tr("@archive.title"), attr: { type: "button", "data-archive-v2-action": "open" } });
    b.addEventListener("click", open);
  } else root.createEl("p", { text: tr("@archiveV2.basis"), attr: { "data-archive-v2-unavailable": "true" } });
}

function source(root: HTMLElement, key: string, text: string): void {
  const d = root.createEl("details"); d.open = true;
  d.createEl("summary", { text: tr(key === "copiedText" ? "@archiveV2.copiedText" : `@archive.${key}`) });
  d.createEl("pre", { text, cls: "ai-pair-source", attr: { tabindex: "0", "data-archive-text": key } });
}
/** Review and planning only. Closing or changing a selection revokes the published plan. */
export class ArchivePlannerModalV2 extends Modal {
  readonly session: ArchiveSessionV2;
  private active = false;
  private cleanup: (() => void)[] = [];
  private choice: ArchiveChoiceV2 = { status: null, dispositions: [], limitationsReviewed: false, unknownDependenciesAccepted: false };
  constructor(app: App, read: (current: () => boolean) => Promise<ArchiveReadV2>) {
    super(app); this.session = new ArchiveSessionV2(() => read(() => this.active));
  }
  onOpen(): void {
    this.active = true; this.modalEl.addClass("ai-pair-inspector-modal"); this.contentEl.addClass("ai-change-planner", "ai-archive-planner", "ai-archive-planner-v2");
    this.titleEl.setText(tr("@archive.title")); this.session.onChange = () => {
      if (this.session.view.stage === "stale") this.choice = { status: null, dispositions: [], limitationsReviewed: false, unknownDependenciesAccepted: false };
      this.render();
    };
    const invalidate = () => { this.choice = { status: null, dispositions: [], limitationsReviewed: false, unknownDependenciesAccepted: false }; this.session.invalidate(); };
    for (const ref of [this.app.vault.on("create", invalidate), this.app.vault.on("modify", invalidate),
      this.app.vault.on("delete", invalidate), this.app.vault.on("rename", invalidate)]) this.cleanup.push(() => this.app.vault.offref(ref));
    for (const ref of [this.app.metadataCache.on("changed", invalidate), this.app.metadataCache.on("resolved", invalidate)]) this.cleanup.push(() => this.app.metadataCache.offref(ref));
    const checkWorkspace = () => { try { this.session.view.input?.guard(); } catch { invalidate(); } };
    for (const ref of [this.app.workspace.on("file-open", checkWorkspace), this.app.workspace.on("layout-change", checkWorkspace)])
      this.cleanup.push(() => this.app.workspace.offref(ref));
    void this.session.prepare();
  }
  private button(key: string, action: () => void): HTMLButtonElement {
    const b = this.contentEl.createEl("button", { text: tr(`@archive.${key}`), attr: { type: "button", "data-archive-action": key } });
    b.addEventListener("click", action); return b;
  }
  private render(): void {
    if (!this.active) return;
    const root = this.contentEl, view = this.session.view; root.empty();
    root.createEl("p", { text: tr("@archive.scope") });
    root.createEl("p", { text: tr("@archiveV2.structureLimit") });
    root.createEl("p", { text: tr(view.error === "basis" ? "@archiveV2.basis" : view.stage === "stale" ? "@archiveV2.stale" : view.error ? `@archive.error.${view.error}` : `@archive.stage.${view.stage}`),
      attr: { role: view.error || view.stage === "stale" ? "alert" : "status", "data-archive-stage": view.stage } });
    if (view.stage === "loading") { this.button("cancel", () => this.session.cancel()); return; }
    const input = view.input;
    if (!input) {
      this.button("restart", () => { this.choice = { status: null, dispositions: [], limitationsReviewed: false, unknownDependenciesAccepted: false }; void this.session.prepare(); });
      this.button("close", () => this.close()); return;
    }
    const parent = input.record, r = parent.plan;
    root.createEl("p", { text: `${r.secondary.path} → ${r.canonical.path}`, cls: "ai-pair-path" });
    root.createEl("p", { text: `${tr("@archiveV2.provenance")}: ${parent.operation} · ${parent.id} · SHA-256: ${input.recordHash}`, cls: "ai-pair-path" });
    if (view.plan) {
      source(root, "before", view.plan.secondary.before); source(root, "after", view.plan.secondary.after);
      renderPlanDiff(root, view.plan.secondary.before, view.plan.secondary.after);
      const json = root.createEl("details"); json.createEl("summary", { text: tr("@archive.serialized") });
      json.createEl("pre", { text: JSON.stringify(view.plan, null, 2), cls: "ai-pair-source", attr: { tabindex: "0", "data-archive-text": "json" } });
    }
    source(root, "canonical", r.canonical.after); source(root, "secondary", r.secondary.content);
    root.createEl("h3", { text: tr("@archiveV2.copied") });
    for (const range of archiveSourceRanges(parent).copied) {
      root.createEl("p", { text: `${range.start}–${range.end}` }); source(root, "copiedText", range.text);
    }
    root.createEl("h3", { text: tr("@archive.preservation") }); root.createEl("p", { text: tr("@archive.reviewHelp") });
    const partition = archivePartition(parent, input.notes[1]), fragments = archiveReviewParts(partition);
    const coverage = root.createEl("details"); coverage.createEl("summary", { text: tr("@archiveV2.partition") });
    for (const part of partition) {
      coverage.createEl("p", { text: `${part.range.start}–${part.range.end} · ${tr(`@archiveV2.part.${part.kind}`)} · ${part.section ?? ""}` });
      coverage.createEl("pre", { text: part.range.text, cls: "ai-pair-source", attr: { tabindex: "0", "data-archive-part": part.kind } });
    }
    fragments.forEach((fragment, i) => {
      const card = root.createEl("section", { cls: "ai-semantic-result-card" });
      card.createEl("h4", { text: `${i + 1} · ${fragment.range.start}–${fragment.range.end}` });
      source(card, "fragment", fragment.range.text); source(card, "context", fragment.context.text);
      const label = card.createEl("label", { text: tr("@archive.disposition") });
      const select = label.createEl("select", { attr: { "data-archive-fragment": String(i) } });
      for (const value of ["", "represented", "retained", "consolidate"]) select.createEl("option", { text: tr(`@archive.disposition.${value || "choose"}`), value });
      select.value = this.choice.dispositions[i]?.disposition ?? "";
      select.addEventListener("change", () => {
        this.choice.dispositions[i] = { range: fragment.range, disposition: select.value as ArchiveDisposition };
        this.session.changeSelection(); this.contentEl.querySelector<HTMLSelectElement>(`[data-archive-fragment="${i}"]`)?.focus();
      });
    });
    root.createEl("h3", { text: tr("@archive.dependencies") });
    for (const dep of input.dependencies) {
      root.createEl("h4", { text: dep.path });
      for (const issue of dep.issues) root.createEl("p", { text: tr(`@archiveV2.dependency.${issue}`) });
      for (const ref of dep.targets.filter(r => r.subpath)) root.createEl("p", { text: `${ref.from} → ${ref.target ?? tr("@archive.unknown")}${ref.subpath} · ${tr(`@archive.kind.${ref.kind}`)}: ${ref.original}` }); root.createEl("p", { text: tr("@archive.incoming") });
      if (dep.incoming === null) root.createEl("p", { text: tr("@archive.unknown") });
      else if (!dep.incoming.length) root.createEl("p", { text: tr("@archive.noneDetected") });
      for (const incoming of dep.incoming ?? []) {
        root.createEl("p", { text: `${incoming.path} · ${incoming.count}` });
        if (!incoming.metadataAvailable || incoming.references.length < incoming.count) root.createEl("p", { text: tr("@archive.unknown") });
        for (const ref of incoming.references) root.createEl("p", { text: `${tr(`@archive.kind.${ref.kind}`)}: ${ref.original}` });
      }
      root.createEl("p", { text: tr("@archive.outgoing") });
      if (!dep.outgoing.length) root.createEl("p", { text: tr("@archive.noneDetected") });
      for (const ref of dep.outgoing) root.createEl("p", { text: `${tr(`@archive.kind.${ref.kind}`)}: ${ref.original} → ${ref.target ?? tr("@archive.unknown")}` });
    }
    const warnings = root.createEl("ul");
    for (const limitation of ARCHIVE_LIMITATIONS.filter(l => l !== "semantic_review_unavailable")) warnings.createEl("li", { text: tr(`@archive.limit.${limitation}`) });
    warnings.createEl("li", { text: tr("@archiveV2.singleParent") });
    warnings.createEl("li", { text: tr("@archiveV2.undoChain") });
    for (const limitation of r.provenance.analysis.limitations) warnings.createEl("li", { text: limitation });
    const unknownLabel = root.createEl("label", { text: tr("@archiveV2.unknownDecision") });
    const unknown = unknownLabel.createEl("input", { type: "checkbox", attr: { "data-archive-unknown": "true" } }); unknown.checked = this.choice.unknownDependenciesAccepted;
    unknown.addEventListener("change", () => { this.choice.unknownDependenciesAccepted = unknown.checked; this.session.changeSelection(); this.contentEl.querySelector<HTMLInputElement>("[data-archive-unknown]")?.focus(); });
    const statusLabel = root.createEl("label", { text: tr("@archive.status") });
    const status = statusLabel.createEl("select", { attr: { "data-archive-status": "true" } });
    status.createEl("option", { text: tr("@archive.disposition.choose"), value: "" }); status.createEl("option", { text: tr("@archive.archived"), value: "archived" });
    status.value = this.choice.status ?? "";
    status.addEventListener("change", () => { this.choice.status = status.value === "archived" ? "archived" : null; this.session.changeSelection(); this.contentEl.querySelector<HTMLSelectElement>("[data-archive-status]")?.focus(); });
    const label = root.createEl("label", { text: tr("@archive.acknowledge") });
    const ack = label.createEl("input", { type: "checkbox", attr: { "data-archive-ack": "true" } }); ack.checked = this.choice.limitationsReviewed;
    ack.addEventListener("change", () => { this.choice.limitationsReviewed = ack.checked; this.session.changeSelection(); this.contentEl.querySelector<HTMLInputElement>("[data-archive-ack]")?.focus(); });
    this.button("build", () => { void this.session.build(this.choice); }).disabled = !this.choice.status || !this.choice.limitationsReviewed || !this.choice.unknownDependenciesAccepted ||
      fragments.some((_, i) => !["represented", "retained"].includes(this.choice.dispositions[i]?.disposition));
    this.button("cancel", () => { this.choice = { status: null, dispositions: [], limitationsReviewed: false, unknownDependenciesAccepted: false }; this.session.cancel(); });
    this.button("close", () => this.close());
  }
  onClose(): void { this.active = false; this.session.close(); for (const remove of this.cleanup.splice(0)) remove(); this.contentEl.empty(); }
}
