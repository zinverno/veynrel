import { FuzzySuggestModal, Modal, type App, type TFile } from "obsidian";
import type { AIHubSettings } from "../settings";
import { t } from "../i18n";
import { healthButton } from "../health/ui/renderHealthHome";
import { GenerationError, GenerativeAtomization, type AtomProposal, type AtomWritePlan } from "./generativeSession";

export class AtomizationPicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private readonly choose: (file: TFile) => void) { super(app); this.setPlaceholder(t("@genatom.choose")); }
  getItems(): TFile[] { return this.app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path)); }
  getItemText(file: TFile): string { return file.path; }
  onChooseItem(file: TFile): void { this.choose(file); }
}

type Stage = "loading" | "consent" | "generating" | "proposals" | "review" | "writing" | "result";
export class GenerativeAtomizationModal extends Modal {
  private stage: Stage = "loading";
  private session?: GenerativeAtomization;
  private proposals: readonly AtomProposal[] = [];
  private selected = new Set<number>();
  private plan?: AtomWritePlan;
  private error?: string;
  private editorBlocked = false;
  private alive = true;
  private busy = false;
  constructor(app: App, private readonly file: TFile, private readonly settings: () => AIHubSettings, private readonly finished: () => void) { super(app); }
  onOpen(): void {
    this.modalEl.addClass("veynrel-atom-modal");
    this.titleEl.setText(t("@processing.atomization"));
    void this.prepare();
  }
  private async prepare(): Promise<void> {
    this.stage = "loading"; this.error = undefined; this.render();
    try {
      const session = await GenerativeAtomization.prepare(this.app, this.settings, this.file);
      if (!this.alive) { session.cancel(); return; }
      this.session = session; this.stage = "consent";
    } catch (error) { this.error = this.message(error); this.stage = "result"; }
    if (this.alive) this.render();
  }
  private message(error: unknown): string { return t(`@genatom.error-${error instanceof GenerationError ? error.reason : this.stage === "writing" ? "write" : "request"}`); }
  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy || !this.alive) return;
    this.busy = true;
    try { await action(); this.editorBlocked = false; }
    catch (error) { this.editorBlocked = error instanceof GenerationError && error.reason === "editor"; this.error = this.message(error); if (this.stage === "writing" || this.stage === "generating") this.stage = "result"; }
    finally { this.busy = false; if (this.alive) this.render(); }
  }
  private literal(parent: HTMLElement, text: string, label: string): void {
    parent.createEl("pre", { text, cls: "veynrel-atom-literal", attr: { tabindex: "0", "aria-label": label } });
  }
  private button(parent: HTMLElement, key: string, action: () => void, primary = false, disabled = false): HTMLButtonElement {
    return healthButton(parent, t(`@genatom.${key}`), () => { if (this.alive) action(); }, `atom-${key}`, disabled, primary);
  }
  private render(): void {
    const root = this.contentEl; root.empty(); root.addClass("veynrel-atom-flow"); root.dataset.atomStage = this.stage; root.tabIndex = -1; root.focus({ preventScroll: true });
    const source = root.createDiv({ cls: "veynrel-atom-source" });
    source.createEl("h3", { text: this.file.basename });
    source.createEl("p", { text: this.session?.source.path ?? this.file.path, cls: "veynrel-atom-path" });
    if (this.error) root.createEl("p", { text: this.error, attr: { role: "alert" } });
    const s = this.session;
    if (this.editorBlocked && s) this.button(root, "close-tabs", () => { void this.run(async () => {
      await s.closeSavedTabs(); this.editorBlocked = false; this.error = undefined;
    }); });
    if (this.stage === "loading" || this.stage === "generating" || this.stage === "writing") {
      root.createEl("p", { text: t(`@genatom.${this.stage}`), attr: { role: "status" } });
      this.button(root, this.stage === "writing" ? "stop" : "cancel", () => this.close()); return;
    }
    if (s && this.stage === "consent") {
      root.createEl("h3", { text: t("@genatom.consent") });
      root.createEl("p", { text: t("@genatom.send", { provider: s.model.provider, model: s.model.model }) });
      root.createEl("p", { text: t(s.user === s.source.content ? "@genatom.full" : "@genatom.shortened", { n: s.user.length, total: s.source.content.length }) });
      root.createEl("p", { text: t("@genatom.cost") });
      if (s.connectionError) root.createEl("p", { text: s.connectionError, attr: { role: "alert" } });
      const actions = root.createDiv({ cls: "veynrel-atom-actions" });
      this.button(actions, "cancel", () => this.close());
      this.button(actions, "generate", () => { void this.run(async () => {
        this.error = undefined; this.stage = "generating"; this.render();
        this.proposals = await s.generate(); this.selected = new Set(this.proposals.map(p => p.id)); this.stage = "proposals";
      }); }, true, !!s.connectionError);
      root.createEl("h4", { text: t("@genatom.sent-text") }); this.literal(root, s.user, t("@genatom.sent-text"));
      const more = this.button(root, "prompt", () => { more.disabled = true; this.literal(root, s.system, t("@genatom.prompt")); });
    } else if (s && this.stage === "proposals") {
      root.createEl("h3", { text: t("@genatom.proposals", { n: this.proposals.length }) });
      root.createEl("p", { text: t(this.proposals.length ? "@genatom.human" : "@genatom.none") });
      const actions = root.createDiv({ cls: "veynrel-atom-actions" });
      this.button(actions, "cancel", () => this.close());
      const next = this.button(actions, "review", () => { void this.run(async () => {
        this.error = undefined; this.plan = await s.review([...this.selected]); this.stage = "review";
      }); }, true, !this.selected.size);
      for (const p of this.proposals) {
        const card = root.createEl("article", { cls: "veynrel-atom-proposal" });
        const label = card.createEl("label", { cls: "veynrel-atom-choice" });
        const check = label.createEl("input", { type: "checkbox", attr: { "data-atom-id": String(p.id) } });
        check.checked = this.selected.has(p.id); label.createSpan({ text: p.title });
        check.addEventListener("change", () => { if (check.checked) this.selected.add(p.id); else this.selected.delete(p.id); next.disabled = !this.selected.size; });
        card.createEl("p", { text: p.path, cls: "veynrel-atom-path" }); this.literal(card, p.content, p.title);
      }
    } else if (s && this.stage === "review" && this.plan) {
      const plan = this.plan;
      root.createEl("h3", { text: t("@genatom.write-count", { n: plan.proposals.length - s.createdPaths.length }) });
      root.createEl("p", { text: t("@genatom.destination", { path: s.folder || "/" }) });
      root.createEl("p", { text: t("@genatom.write-effect") });
      root.createEl("p", { text: t("@genatom.no-undo") });
      const paths = root.createEl("ul"); for (const p of plan.proposals) paths.createEl("li", { text: `${p.path}${s.createdPaths.includes(p.path) ? ` — ${t("@genatom.created")}` : ""}` });
      root.createEl("h4", { text: t("@genatom.source-addition") }); this.literal(root, plan.addition, t("@genatom.source-addition"));
      const actions = root.createDiv({ cls: "veynrel-atom-actions" });
      this.button(actions, "cancel", () => this.close());
      if (!s.createdPaths.length) this.button(actions, "back", () => { this.stage = "proposals"; this.error = undefined; this.render(); });
      this.button(actions, "apply", () => { void this.run(async () => {
        this.error = undefined; this.stage = "writing"; this.render(); await s.apply(plan); this.stage = "result";
      }); }, true);
    } else {
      root.createEl("h3", { text: t(s?.done ? "@genatom.success" : "@genatom.not-completed") });
      root.createEl("p", { text: t(s?.done ? "@genatom.source-updated" : s?.uncertainPath && s.uncertainPath === s.source.path ? "@genatom.source-unknown" : "@genatom.source-untouched") });
      if (s?.createdPaths.length) {
        root.createEl("h4", { text: t("@genatom.created") }); const paths = root.createEl("ul");
        for (const path of s.createdPaths) paths.createEl("li", { text: path });
      }
      if (s?.uncertainPath) root.createEl("p", { text: t("@genatom.uncertain", { path: s.uncertainPath }), attr: { role: "alert" } });
      const remaining = this.plan?.proposals.filter(p => !s?.createdPaths.includes(p.path)) ?? [];
      if (remaining.length) {
        root.createEl("h4", { text: t("@genatom.remaining") }); const paths = root.createEl("ul"); for (const p of remaining) paths.createEl("li", { text: p.path });
      }
      const actions = root.createDiv({ cls: "veynrel-atom-actions" });
      this.button(actions, "close", () => this.close(), !!s?.done);
      if (!s?.done && this.plan && s) this.button(actions, "retry", () => { void this.run(async () => {
        this.error = undefined; this.plan = await s.retryReview(this.plan!); this.stage = "review";
      }); }, true);
      else if (!s?.done) this.button(actions, "restart", () => { this.session?.cancel(); void this.prepare(); }, true);
    }
  }
  close(): void {
    this.session?.cancel();
    if (this.stage === "writing") { this.error = t("@genatom.stopping"); this.render(); return; }
    super.close();
  }
  dispose(): void { this.session?.cancel(); super.close(); }
  onClose(): void { this.alive = false; this.session?.cancel(); this.contentEl.empty(); this.finished(); }
}
