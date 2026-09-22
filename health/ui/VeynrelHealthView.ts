import { ItemView } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import { t } from "../../i18n";
import type { HealthPluginController } from "../obsidian/healthPluginController";
import { VEYNREL_HEALTH_VIEW_TYPE } from "../obsidian/openHealthView";
import { openHealthNote, resolveHealthNote } from "../obsidian/openHealthNote";
import { healthHomeViewModel } from "./healthHomeViewModel";
import { healthButton, renderHealthHome } from "./renderHealthHome";
import { HealthRecoveryModal } from "./healthRecoveryModal";
import { healthOnboardingViewModel } from "./healthOnboardingViewModel";
import { renderHealthOnboarding } from "./renderHealthOnboarding";
import type { HealthPreferences } from "../preferences";
import type { VaultProfile } from "../domain/profile";
import { findingsInboxViewModel, findingsRoute, snoozeDeadline } from "./findingsInboxViewModel";
import type { VeynrelHealthRoute } from "./findingsInboxViewModel";
import { renderFindingsInbox } from "./renderFindingsInbox";

export class VeynrelHealthView extends ItemView {
  private unsubscribe?: () => void;
  private epoch = 0;
  private body?: HTMLElement;
  private status?: HTMLElement;
  private navigationMessage?: string;
  private changingProfile = false;
  private route: VeynrelHealthRoute = { page: "health" };
  private expandedPaths = false;
  private expandedSnooze = false;
  private focusDestination?: "heading" | "detail";

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
    this.route = { page: "health" }; this.expandedPaths = false; this.expandedSnooze = false; this.focusDestination = undefined;
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
    const openNote = (): void => { void this.openNote(this.controller.getRecommendationPath()); };
    const choose = (profile: VaultProfile): void => { void this.savePreferences({ profile, profileChosen: true }); };
    const normal = onboarding.step === "complete";
    this.body.empty();
    if (normal) {
      const nav = this.body.createEl("nav", { cls: "veynrel-findings-navigation", attr: { "aria-label": t("@findings.navigation") } });
      for (const page of ["health", "findings"] as const) {
        const button = healthButton(nav, t(page === "health" ? "@findings.health" : "@findings.title"),
          () => this.navigate(page === "health" ? { page } : findingsRoute()), `nav-${page}`);
        button.setAttribute("aria-pressed", String(this.route.page === page));
        if (this.route.page === page) button.setAttribute("aria-current", "page");
      }
    }
    const surface = this.body.createDiv();
    if (normal && this.route.page === "findings") {
      const route = this.route;
      const inbox = findingsInboxViewModel({ findings: this.controller.listFindings(), route,
        busy: state.busy, mutatingFindingId: state.mutatingFindingId });
      if (inbox.selectionLeftFilter) {
        this.route = { ...route, selectedFindingId: undefined };
        this.expandedPaths = false; this.expandedSnooze = false;
        this.navigationMessage = t(inbox.selectionResolved ? "@findings.resolved-scan" : "@findings.updated");
        if (hadFocus) this.focusDestination = "heading";
      }
      renderFindingsInbox(surface, inbox, {
        filter: (filter) => this.navigate({ ...route, ...filter, selectedFindingId: undefined }),
        select: (id) => this.navigate({ ...route, selectedFindingId: id }),
        back: () => this.navigate({ ...route, selectedFindingId: undefined }),
        openNote: (path) => { void this.openNote(path); }, tools: this.openTools,
        dismiss: (id) => { this.navigationMessage = undefined; void this.controller.dismissFinding(id); },
        snooze: (id, days) => { this.navigationMessage = undefined; void this.controller.snoozeFinding(id, snoozeDeadline(days)); },
        reopen: (id) => { this.navigationMessage = undefined; void this.controller.reopenFinding(id); },
        togglePaths: () => { this.expandedPaths = !this.expandedPaths; this.render(); },
        toggleSnooze: () => { this.expandedSnooze = !this.expandedSnooze; this.render(); },
      }, this.expandedPaths, this.expandedSnooze);
    } else if (normal || onboarding.step === "recovery") {
      renderHealthHome(surface, model, {
        scan, openNote, tools: this.openTools,
        recover: () => {
          if (this.controller.getState().busy || !model.recovery) return;
          const scope = model.recovery.scope;
          new HealthRecoveryModal(this.app, scope, () => { void this.controller.recover(scope); }).open();
        },
        changeProfile: () => { this.changingProfile = !this.changingProfile; this.render(); }, chooseProfile: choose,
        findings: normal ? (dimension) => this.navigate(findingsRoute({ dimension: dimension ?? "all" })) : undefined,
        reviewFinding: normal ? (selectedFindingId) => this.navigate(findingsRoute({ selectedFindingId })) : undefined,
      }, this.changingProfile);
    } else {
      renderHealthOnboarding(surface, onboarding, model, state, {
        scan, openNote, choose,
        skip: () => { void this.savePreferences({ profile: "mixed", profileChosen: true, onboardingCompleted: true }); },
        complete: () => { void this.savePreferences({ onboardingCompleted: true }); },
      });
    }
    const status = onboarding.step === "scan" ? onboarding.status : model.status;
    this.status.setText(state.preferencesError ? t("@health.profile.save-failed") : state.savingPreferences ? t("@health.profile.saving")
      : state.findingMutationError ? t("@findings.update-failed") : state.mutatingFindingId ? t("@findings.saving")
      : this.navigationMessage ?? status ?? "");
    this.status.toggleClass("veynrel-health-status-error", state.preferencesError || Boolean(state.findingMutationError) || model.statusError);
    // Leave the sibling live region available to announce the running state.
    this.body.setAttribute("aria-busy", String(state.busy || state.savingPreferences));
    const heading = (): HTMLElement | null => this.body?.querySelector<HTMLElement>("[data-findings-heading]")
      ?? this.body?.querySelector<HTMLElement>("[data-health-heading]") ?? null;
    if (this.focusDestination) {
      const target = this.focusDestination === "detail" ? heading() : this.body.querySelector<HTMLElement>("[data-health-heading]");
      target?.focus(); this.focusDestination = undefined;
    } else if (hadFocus) {
      const target = focusKey ? this.body.querySelector<HTMLButtonElement>(`[data-health-action="${focusKey}"]`) : null;
      // When a step disappears or its button is disabled, keep keyboard focus in this view.
      if (target && !target.disabled) target.focus();
      else heading()?.focus();
    }
  }

  /** Transient product navigation only; never persisted and never starts analysis. */
  private navigate(route: VeynrelHealthRoute): void {
    this.route = route; this.expandedPaths = false; this.expandedSnooze = false;
    this.changingProfile = false; this.navigationMessage = undefined;
    this.focusDestination = route.page === "findings" && route.selectedFindingId ? "detail" : "heading";
    this.render();
  }

  private async savePreferences(update: Partial<HealthPreferences>): Promise<void> {
    const epoch = this.epoch;
    this.navigationMessage = undefined;
    if (await this.controller.updatePreferences(update) && epoch === this.epoch) {
      this.changingProfile = false;
      this.render();
    }
  }

  private async openNote(path: string | undefined): Promise<void> {
    const epoch = this.epoch;
    const opened = await openHealthNote(this.app, path);
    if (!opened && epoch === this.epoch) { this.navigationMessage = t("@health.note-unavailable"); this.render(); }
  }
}
