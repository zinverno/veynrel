import { App, Modal } from "obsidian";
import { t as tr } from "../i18n";
import { ArchiveSession } from "./archiveSession";
import type { ArchiveRead } from "./archiveSession";
import { ARCHIVE_LIMITATIONS, archiveFragments } from "./archivePlan";
import type { ArchiveChoice, ArchiveDisposition, ArchivePlan } from "./archivePlan";
import { renderPlanDiff } from "./planDiffView";

function source(root: HTMLElement, key: string, text: string): void {
  const d = root.createEl("details"); d.open = true;
  d.createEl("summary", { text: tr(`@archive.${key}`) });
  d.createEl("pre", { text, cls: "ai-pair-source", attr: { tabindex: "0", "data-archive-text": key } });
}
/** Review and planning only. Closing or changing a selection revokes the published plan. */
export class ArchivePlannerModal extends Modal {
  readonly session: ArchiveSession;
  private active = false;
  private cleanup: (() => void)[] = [];
  private choice: ArchiveChoice = { status: null, dispositions: [], limitationsReviewed: false };
  constructor(app: App, read: (current: () => boolean) => Promise<ArchiveRead>,
    private readonly apply?: (plan: ArchivePlan, current: () => boolean) => void) {
    super(app); this.session = new ArchiveSession(() => read(() => this.active));
  }
  onOpen(): void {
    this.active = true; this.modalEl.addClass("ai-pair-inspector-modal"); this.contentEl.addClass("ai-change-planner", "ai-archive-planner");
    this.titleEl.setText(tr("@archive.title")); this.session.onChange = () => this.render();
    const invalidate = () => { this.choice = { status: null, dispositions: [], limitationsReviewed: false }; this.session.invalidate(); };
    for (const ref of [this.app.vault.on("create", invalidate), this.app.vault.on("modify", invalidate),
      this.app.vault.on("delete", invalidate), this.app.vault.on("rename", invalidate)]) this.cleanup.push(() => this.app.vault.offref(ref));
    for (const ref of [this.app.metadataCache.on("changed", invalidate), this.app.metadataCache.on("resolved", invalidate)]) this.cleanup.push(() => this.app.metadataCache.offref(ref));
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
    root.createEl("p", { text: tr(view.error ? `@archive.error.${view.error}` : `@archive.stage.${view.stage}`),
      attr: { role: view.error || view.stage === "stale" ? "alert" : "status", "data-archive-stage": view.stage } });
    if (view.stage === "loading") { this.button("cancel", () => this.session.cancel()); return; }
    const input = view.input;
    if (!input) {
      this.button("restart", () => { this.choice = { status: null, dispositions: [], limitationsReviewed: false }; void this.session.prepare(); });
      this.button("close", () => this.close()); return;
    }
    const r = input.record;
    root.createEl("p", { text: `${r.secondary.path} → ${r.canonical.path}`, cls: "ai-pair-path" });
    root.createEl("p", { text: `${tr("@archive.provenance")}: ${r.id} · SHA-256: ${input.recordHash}`, cls: "ai-pair-path" });
    if (view.plan) {
      source(root, "before", view.plan.secondary.before); source(root, "after", view.plan.secondary.after);
      renderPlanDiff(root, view.plan.secondary.before, view.plan.secondary.after);
      const json = root.createEl("details"); json.createEl("summary", { text: tr("@archive.serialized") });
      json.createEl("pre", { text: JSON.stringify(view.plan, null, 2), cls: "ai-pair-source", attr: { tabindex: "0", "data-archive-text": "json" } });
      if (this.apply) {
        const plan = view.plan;
        this.button("applyReview", () => this.apply!(plan, () => this.active && this.session.view.plan === plan && this.session.view.stage === "ready"));
      }
    }
    source(root, "canonical", r.canonical.after); source(root, "secondary", r.secondary.content);
    root.createEl("h3", { text: tr("@archive.copied") });
    for (const t of r.transfers) {
      root.createEl("p", { text: `${t.range.start}–${t.range.end}` }); source(root, "copiedText", t.range.text);
    }
    root.createEl("h3", { text: tr("@archive.preservation") }); root.createEl("p", { text: tr("@archive.reviewHelp") });
    const fragments = archiveFragments(r, input.notes[1]);
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
      root.createEl("h4", { text: dep.path }); root.createEl("p", { text: tr("@archive.incoming") });
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
    for (const limitation of ARCHIVE_LIMITATIONS) warnings.createEl("li", { text: tr(`@archive.limit.${limitation}`) });
    const statusLabel = root.createEl("label", { text: tr("@archive.status") });
    const status = statusLabel.createEl("select", { attr: { "data-archive-status": "true" } });
    status.createEl("option", { text: tr("@archive.disposition.choose"), value: "" }); status.createEl("option", { text: tr("@archive.archived"), value: "archived" });
    status.value = this.choice.status ?? "";
    status.addEventListener("change", () => { this.choice.status = status.value === "archived" ? "archived" : null; this.session.changeSelection(); });
    const label = root.createEl("label", { text: tr("@archive.acknowledge") });
    const ack = label.createEl("input", { type: "checkbox", attr: { "data-archive-ack": "true" } }); ack.checked = this.choice.limitationsReviewed;
    ack.addEventListener("change", () => { this.choice.limitationsReviewed = ack.checked; this.session.changeSelection(); });
    this.button("build", () => { void this.session.build(this.choice); }).disabled = !this.choice.status || !this.choice.limitationsReviewed ||
      fragments.some((_, i) => !["represented", "retained"].includes(this.choice.dispositions[i]?.disposition));
    this.button("cancel", () => { this.choice = { status: null, dispositions: [], limitationsReviewed: false }; this.session.cancel(); });
    this.button("close", () => this.close());
  }
  onClose(): void { this.active = false; this.session.close(); for (const remove of this.cleanup.splice(0)) remove(); this.contentEl.empty(); }
}
