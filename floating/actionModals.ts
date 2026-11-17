import { Modal, setIcon, type App } from "obsidian";
import { t } from "../i18n";
import { healthButton } from "../health/ui/renderHealthHome";
import { renderRecallAuthoring, recallAuthoringStatus } from "../health/ui/renderRecallAuthoring";
import type { RecallAuthoringAdapter } from "../recallAuthoring";
import type { EditorSource } from "./editorSource";
import { validateLanguageModelSettings } from "../deep/product/validateLanguageModelSettings";
import { StyleSession } from "./styleSession";
import type { LanguageModelSettingsPort } from "../deep/product/languageModelSettingsPort";

export class StyleModal extends Modal {
  private live = false;
  private readonly session: StyleSession;
  constructor(app: App, source: EditorSource, settings: LanguageModelSettingsPort, private readonly origin: HTMLElement, private readonly setup: () => void) {
    super(app); this.session = new StyleSession(source, settings, undefined, () => this.render());
  }
  onOpen(): void { this.live = true; this.modalEl.addClass("veynrel-floating-style"); this.render(); }
  private render(): void {
    if (!this.live) return;
    const s = this.session, source = s.source;
    this.titleEl.setText(t("Улучшить стиль")); this.contentEl.empty();
    this.contentEl.createEl("p", { text: `${source.path} · ${t(source.selection ? "@floating.selection" : "@floating.whole")}` });
    if (s.state === "consent" && validateLanguageModelSettings(s.settings)) {
      this.contentEl.createEl("p", { text: t("@floating.error.settings") });
      healthButton(this.contentEl, t("@recall.authoring.configure"), () => { this.close(); this.setup(); }, "float-settings");
      healthButton(this.contentEl, t("@health.cancel"), () => this.close(), "float-cancel");
    } else if (s.state === "consent") {
      const url = new URL(s.settings.baseUrl);
      this.contentEl.createEl("p", { text: `${s.settings.provider} · ${s.settings.model} · ${url.origin}${url.pathname}` });
      this.contentEl.createEl("p", { text: t("@floating.style-consent") });
      const material = this.contentEl.createEl("details"); material.createEl("summary", { text: t("@floating.original") });
      material.createEl("pre", { text: source.selection || source.original });
      const label = this.contentEl.createEl("label", { cls: "veynrel-floating-consent" });
      const consent = label.createEl("input", { type: "checkbox" }); label.createSpan({ text: t("@floating.consent") });
      const buttons = this.contentEl.createDiv({ cls: "modal-button-container" });
      healthButton(buttons, t("@health.cancel"), () => this.close(), "float-cancel");
      const generate = healthButton(buttons, t("@floating.draft"), () => {
        if (!consent.checked || s.state !== "consent") return;
        const pending = s.generate(); this.render(); void pending.then(() => this.render());
      }, "float-generate", true, true);
      consent.addEventListener("change", () => { generate.disabled = !consent.checked; });
    } else if (s.state === "generating") {
      this.contentEl.createEl("p", { text: t("@floating.generating"), attr: { role: "status" } });
      healthButton(this.contentEl, t("@health.cancel"), () => this.close(), "float-cancel");
    } else {
      if (s.draft !== undefined) {
        const grid = this.contentEl.createDiv({ cls: "veynrel-floating-preview" });
        for (const [title, text] of [["@floating.original", source.selection || source.original], ["@floating.proposed", s.draft]]) {
          const col = grid.createEl("section"); col.createEl("h3", { text: t(title) }); col.createEl("pre", { text });
        }
        this.contentEl.createEl("p", { text: t("@floating.meaning", { count: s.checks?.findings.length ?? 0 }) });
      }
      this.contentEl.createEl("p", { text: t(s.state === "applied" ? "@floating.applied" : s.state === "preview" ? "@floating.preview" : `@floating.error.${s.reason ?? "request"}`), attr: { role: "status", "data-style-state": s.state } });
      const buttons = this.contentEl.createDiv({ cls: "modal-button-container" });
      healthButton(buttons, t("@floating.close"), () => this.close(), "float-close");
      if (s.state === "preview") healthButton(buttons, t("@floating.apply"), () => { s.apply(); this.render(); }, "float-apply", false, true);
    }
    setIcon(this.titleEl.createSpan({ attr: { "aria-hidden": "true" } }), "sparkles");
  }
  onClose(): void { this.live = false; this.session.cancel(); queueMicrotask(() => { if (this.origin.isConnected) this.origin.focus(); }); }
}

export class FloatingRecallModal extends Modal {
  private live = false;
  private remove?: () => void;
  constructor(app: App, private readonly source: EditorSource, private readonly author: RecallAuthoringAdapter,
    private readonly settings: LanguageModelSettingsPort, private readonly origin: HTMLElement, private readonly setup: () => void) { super(app); }
  onOpen(): void {
    this.live = true; this.modalEl.addClass("veynrel-floating-recall");
    const settings = JSON.stringify(this.settings.get());
    this.author.requestCapturedGeneration({ ...this.source, current: () => this.live && this.source.current() && settings === JSON.stringify(this.settings.get()) });
    this.remove = this.author.subscribe(() => this.render()); this.render();
  }
  private render(): void {
    if (!this.live) return;
    this.contentEl.empty(); this.titleEl.setText(t("@recall.authoring.title"));
    this.contentEl.createEl("p", { text: `${this.source.path} · ${t(this.source.selection ? "@floating.selection" : "@floating.whole")}` });
    const snapshot = this.author.getSnapshot();
    if (["confirming", "generating", "ingesting"].includes(snapshot.state) || !snapshot.configured) renderRecallAuthoring(this.contentEl, snapshot, {
      configureOptions: options => this.author.configure(options), savePrompt: prompt => { void this.author.savePrompt(prompt); },
      request: () => {}, generate: () => { void this.author.generate(); }, cancel: () => this.close(), configure: () => { this.close(); this.setup(); },
    });
    if (snapshot.state === "idle") this.contentEl.createEl("p", { text: t(this.source.current() ? "@floating.error.settings" : "@floating.error.source"), attr: { role: "status" } });
    if (snapshot.result || snapshot.state === "idle") healthButton(this.contentEl, t("@floating.close"), () => this.close(), "float-close");
    const status = recallAuthoringStatus(snapshot); if (status) this.contentEl.createEl("p", { text: status, attr: { role: "status" } });
  }
  onClose(): void { this.live = false; this.remove?.(); this.author.cancelConfirmation(); queueMicrotask(() => { if (this.origin.isConnected) this.origin.focus(); }); }
}
