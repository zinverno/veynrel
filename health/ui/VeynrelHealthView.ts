import { ItemView } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import { t } from "../../i18n";
import type { HealthPluginController } from "../obsidian/healthPluginController";
import { VEYNREL_HEALTH_VIEW_TYPE } from "../obsidian/openHealthView";
import { openHealthNote, resolveHealthNote } from "../obsidian/openHealthNote";
import { healthHomeViewModel } from "./healthHomeViewModel";
import { renderHealthHome } from "./renderHealthHome";
import { HealthRecoveryModal } from "./healthRecoveryModal";

export class VeynrelHealthView extends ItemView {
  private unsubscribe?: () => void;
  private epoch = 0;
  private body?: HTMLElement;
  private status?: HTMLElement;
  private navigationMessage?: string;

  constructor(leaf: WorkspaceLeaf, private readonly controller: HealthPluginController, private readonly openTools: () => void) { super(leaf); }
  getViewType(): string { return VEYNREL_HEALTH_VIEW_TYPE; }
  getDisplayText(): string { return t("@health.title"); }
  getIcon(): string { return "activity"; }

  async onOpen(): Promise<void> {
    const epoch = ++this.epoch;
    this.contentEl.empty(); this.contentEl.addClass("veynrel-health-view");
    // Keep the live region mounted while the inexpensive dashboard content is replaced.
    this.status = this.contentEl.createDiv({ cls: "veynrel-health-status", attr: { role: "status", "aria-live": "polite", "aria-atomic": "true" } });
    this.status.setText(t("@health.loading"));
    this.body = this.contentEl.createDiv();
    try {
      await this.controller.getHealthService();
      if (epoch !== this.epoch) return;
      this.unsubscribe?.();
      this.unsubscribe = this.controller.subscribe(() => this.render());
      this.render();
    } catch {
      if (epoch === this.epoch) this.status?.setText(t("@health.error.load"));
    }
  }

  async onClose(): Promise<void> {
    this.epoch++; this.unsubscribe?.(); this.unsubscribe = undefined;
    this.body = undefined; this.status = undefined; this.navigationMessage = undefined;
    this.contentEl.empty();
    // Scans belong to the plugin controller and continue after this view closes.
  }

  private render(): void {
    if (!this.body || !this.status) return;
    const state = this.controller.getState();
    const model = healthHomeViewModel(state, Boolean(resolveHealthNote(this.app, this.controller.getRecommendationPath())));
    const active = this.contentEl.ownerDocument.activeElement;
    const focusKey = active && this.contentEl.contains(active) ? active.getAttribute("data-health-action") : null;
    renderHealthHome(this.body, model, {
      scan: () => { this.navigationMessage = undefined; if (!this.controller.getState().busy) void this.controller.runLocalScan(); },
      tools: this.openTools,
      recover: () => {
        if (this.controller.getState().busy || !model.recovery) return;
        const scope = model.recovery.scope;
        new HealthRecoveryModal(this.app, scope, () => { void this.controller.recover(scope); }).open();
      },
      openNote: () => { void this.openNote(); },
    });
    this.status.setText(this.navigationMessage ?? model.status ?? "");
    this.status.toggleClass("veynrel-health-status-error", model.statusError);
    // Leave the sibling live region available to announce the running state.
    this.body.setAttribute("aria-busy", String(state.busy));
    if (focusKey) this.body.querySelector<HTMLButtonElement>(`[data-health-action="${focusKey}"]`)?.focus();
  }

  private async openNote(): Promise<void> {
    const epoch = this.epoch;
    const opened = await openHealthNote(this.app, this.controller.getRecommendationPath());
    if (!opened && epoch === this.epoch) { this.navigationMessage = t("@health.note-unavailable"); this.render(); }
  }
}
