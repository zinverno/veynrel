import { Modal, setIcon, type App } from "obsidian";
import { t } from "../../i18n";
import { healthButton } from "./renderHealthHome";

interface ToolExplanation {
  title: string; icon: string; description: string; material: string; effect: string;
  instructions?: string; model?: string;
}

/** Static catalog copy only; the existing launcher retains all operation-specific gates. */
export class ToolExplanationModal extends Modal {
  private openedTool = false;
  private active = false;
  constructor(app: App, private readonly tool: ToolExplanation, private readonly origin: HTMLElement | SVGElement,
    private readonly launch?: () => void) { super(app); }
  get isShowing(): boolean { return this.active; }
  onOpen(): void {
    this.active = true;
    this.modalEl.addClass("veynrel-tool-explanation");
    const emblem = this.titleEl.createSpan({ attr: { "aria-hidden": "true" } }); setIcon(emblem, this.tool.icon);
    this.titleEl.createSpan({ text: this.tool.title });
    this.contentEl.createEl("p", { cls: "veynrel-tool-description", text: this.tool.description });
    const facts = this.contentEl.createEl("dl", { cls: "veynrel-tool-facts" });
    const rows = [["material", this.tool.material, "files"]];
    if (this.tool.model) rows.push(["model", this.tool.model, "cpu"]);
    rows.push(["effect", this.tool.effect, "info"]);
    for (const [label, value, icon] of rows) {
      const row = facts.createDiv();
      const term = row.createEl("dt"); setIcon(term.createSpan({ attr: { "aria-hidden": "true" } }), icon);
      term.createSpan({ text: t(`@followup.${label}`) }); row.createEl("dd", { text: value });
    }
    if (this.tool.instructions) this.contentEl.createEl("p", { cls: "veynrel-tool-instructions", text: this.tool.instructions });
    const buttons = this.contentEl.createDiv({ cls: "modal-button-container" });
    healthButton(buttons, t("@workspace.cancel"), () => this.close(), "tool-info-cancel");
    if (this.launch) healthButton(buttons, t("@followup.open-tool"), () => {
      if (!this.active || this.openedTool) return;
      this.openedTool = true; this.close(); this.launch!();
    }, "tool-info-open", false, true);
  }
  onClose(): void {
    this.active = false;
    // The native modal restores selection while closing; restore the exact view/window afterwards.
    if (!this.openedTool) queueMicrotask(() => { if (this.origin.isConnected) this.origin.focus(); });
  }
}
