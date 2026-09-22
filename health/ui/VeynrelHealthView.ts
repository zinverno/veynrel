import { ItemView } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import { t } from "../../i18n";
import type { HealthPluginController } from "../obsidian/healthPluginController";
import { VEYNREL_HEALTH_VIEW_TYPE } from "../obsidian/openHealthView";
import { openHealthNote, resolveHealthNote } from "../obsidian/openHealthNote";
import { healthHomeViewModel } from "./healthHomeViewModel";
import { renderHealthHome } from "./renderHealthHome";
import { HealthRecoveryModal } from "./healthRecoveryModal";
import { healthOnboardingViewModel } from "./healthOnboardingViewModel";
import { renderHealthOnboarding } from "./renderHealthOnboarding";
import type { HealthPreferences } from "../preferences";
import type { VaultProfile } from "../domain/profile";

export class VeynrelHealthView extends ItemView {
  private unsubscribe?: () => void;
  private epoch = 0;
  private body?: HTMLElement;
  private status?: HTMLElement;
  private navigationMessage?: string;
  private changingProfile = false;

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
    this.changingProfile = false;
    this.contentEl.empty();
    // Scans belong to the plugin controller and continue after this view closes.
  }

  private render(): void {
    if (!this.body || !this.status) return;
    const state = this.controller.getState();
    const model = healthHomeViewModel(state, Boolean(resolveHealthNote(this.app, this.controller.getRecommendationPath())));
    const onboarding = healthOnboardingViewModel(state, model);
    const active = this.contentEl.ownerDocument.activeElement;
    const hadFocus = active && this.contentEl.contains(active);
    const focusKey = hadFocus ? active.getAttribute("data-health-action") : null;
    const scan = (): void => { this.navigationMessage = undefined; if (!this.controller.getState().busy) void this.controller.runLocalScan(); };
    const openNote = (): void => { void this.openNote(); };
    const choose = (profile: VaultProfile): void => { void this.savePreferences({ profile, profileChosen: true }); };
    if (onboarding.step === "complete" || onboarding.step === "recovery") {
      renderHealthHome(this.body, model, {
        scan, openNote, tools: this.openTools,
        recover: () => {
          if (this.controller.getState().busy || !model.recovery) return;
          const scope = model.recovery.scope;
          new HealthRecoveryModal(this.app, scope, () => { void this.controller.recover(scope); }).open();
        },
        changeProfile: () => { this.changingProfile = !this.changingProfile; this.render(); }, chooseProfile: choose,
      }, this.changingProfile);
    } else {
      renderHealthOnboarding(this.body, onboarding, model, state, {
        scan, openNote, choose,
        skip: () => { void this.savePreferences({ profile: "mixed", profileChosen: true, onboardingCompleted: true }); },
        complete: () => { void this.savePreferences({ onboardingCompleted: true }); },
      });
    }
    const status = onboarding.step === "scan" ? onboarding.status : model.status;
    this.status.setText(state.preferencesError ? t("@health.profile.save-failed") : state.savingPreferences ? t("@health.profile.saving")
      : this.navigationMessage ?? status ?? "");
    this.status.toggleClass("veynrel-health-status-error", state.preferencesError || model.statusError);
    // Leave the sibling live region available to announce the running state.
    this.body.setAttribute("aria-busy", String(state.busy || state.savingPreferences));
    if (hadFocus) {
      const target = focusKey ? this.body.querySelector<HTMLButtonElement>(`[data-health-action="${focusKey}"]`) : null;
      // When a step disappears or its button is disabled, keep keyboard focus in this view.
      if (target && !target.disabled) target.focus();
      else this.body.querySelector<HTMLElement>("[data-health-heading]")?.focus();
    }
  }

  private async savePreferences(update: Partial<HealthPreferences>): Promise<void> {
    const epoch = this.epoch;
    this.navigationMessage = undefined;
    if (await this.controller.updatePreferences(update) && epoch === this.epoch) {
      this.changingProfile = false;
      this.render();
    }
  }

  private async openNote(): Promise<void> {
    const epoch = this.epoch;
    const opened = await openHealthNote(this.app, this.controller.getRecommendationPath());
    if (!opened && epoch === this.epoch) { this.navigationMessage = t("@health.note-unavailable"); this.render(); }
  }
}
