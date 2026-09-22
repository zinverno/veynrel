import { Modal } from "obsidian";
import type { App } from "obsidian";
import { t } from "../../i18n";
import type { HealthRecoveryScope } from "../obsidian/healthRecovery";

export class HealthRecoveryModal extends Modal {
  private settled = false;
  constructor(app: App, private readonly recoveryScope: HealthRecoveryScope, private readonly confirmed: () => void) { super(app); }
  onOpen(): void {
    this.titleEl.setText(t("@health.confirm-title"));
    this.contentEl.addClass("veynrel-health-confirmation");
    this.contentEl.createEl("p", { text: t(this.recoveryScope === "all" ? "@health.confirm-all" : "@health.confirm-history") });
    this.contentEl.createEl("p", { text: t("@health.confirm-safety") });
    const actions = this.contentEl.createDiv({ cls: "veynrel-health-confirmation-actions" });
    const cancel = actions.createEl("button", { text: t("@health.cancel"), attr: { type: "button" } });
    cancel.addEventListener("click", () => this.close());
    const confirm = actions.createEl("button", { text: t("@health.confirm"), cls: "mod-warning", attr: { type: "button" } });
    confirm.addEventListener("click", () => {
      if (this.settled) return;
      this.settled = true;
      this.confirmed();
      this.close();
    });
    cancel.focus();
  }
  onClose(): void { this.settled = true; this.contentEl.empty(); }
}
