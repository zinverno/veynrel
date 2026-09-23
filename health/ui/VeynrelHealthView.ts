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
import type { FindingsRoute, VeynrelHealthRoute } from "./findingsInboxViewModel";
import { renderFindingsInbox } from "./renderFindingsInbox";
import type { SemanticIntelligencePort } from "../semanticIntelligencePort";
import { renderSemanticIntelligence } from "./renderSemanticIntelligence";
import type { SemanticSetupState } from "./renderSemanticIntelligence";
import { semanticIntelligenceViewModel, semanticSetupError } from "./semanticIntelligenceViewModel";
import { discoverViewModel } from "./discoverViewModel";
import type { DiscoverAction } from "./discoverViewModel";
import { renderDiscover } from "./renderDiscover";
import type { RecallProductPort } from "../../recall/product/types";
import { recallViewModel } from "./recallViewModel";
import { renderRecall } from "./renderRecall";

export class VeynrelHealthView extends ItemView {
  // One transient review surface per plugin owner, including duplicated workspace tabs.
  private static readonly recallViews = new WeakMap<RecallProductPort, VeynrelHealthView>();
  private unsubscribe?: () => void;
  private unsubscribeSemantic?: () => void;
  private cleanupRecall?: () => void;
  private recallFocusKey?: string;
  private dueWakeup?: number;
  private semanticSetup?: SemanticSetupState;
  private epoch = 0;
  private body?: HTMLElement;
  private status?: HTMLElement;
  private navigationMessage?: string;
  private changingProfile = false;
  private route: VeynrelHealthRoute = { page: "health" };
  private findingMutationErrorRoute?: FindingsRoute;
  private expandedPaths = false;
  private expandedSnooze = false;
  private focusDestination?: "heading" | "detail" | "recall-question" | "recall-answer";

  constructor(leaf: WorkspaceLeaf, private readonly controller: HealthPluginController, private readonly openTools: () => void,
    private readonly semantic?: SemanticIntelligencePort, private readonly recall?: RecallProductPort) { super(leaf); }
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
      this.unsubscribeSemantic?.();
      this.unsubscribeSemantic = this.semantic?.subscribe(() => this.render());
      this.render();
    } catch {
      if (epoch === this.epoch) this.status?.setText(t("@health.error.load"));
    }
  }

  async onClose(): Promise<void> {
    this.epoch++; this.unsubscribe?.(); this.unsubscribe = undefined;
    this.leaveRecall();
    this.unsubscribeSemantic?.(); this.unsubscribeSemantic = undefined; this.semanticSetup = undefined;
    this.body = undefined; this.status = undefined; this.navigationMessage = undefined;
    this.findingMutationErrorRoute = undefined;
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
    if (!normal && this.route.page === "recall") { this.leaveRecall(); this.route = { page: "health" }; }
    if (!normal) this.semanticSetup = undefined;
    // A newer scan/mutation or a dominant recovery/onboarding surface ends the failed interaction.
    if (state.busy || !normal) this.findingMutationErrorRoute = undefined;
    this.cleanupRecall?.(); this.cleanupRecall = undefined;
    if (this.dueWakeup !== undefined) window.clearTimeout(this.dueWakeup);
    this.dueWakeup = undefined;
    this.body.empty();
    if (normal) {
      const nav = this.body.createEl("nav", { cls: "veynrel-findings-navigation", attr: { "aria-label": t("@findings.navigation") } });
      const pages = this.recall ? ["health", "findings", "discover", "recall"] as const : ["health", "findings", "discover"] as const;
      for (const page of pages) {
        const button = healthButton(nav, t(page === "health" ? "@findings.health" : page === "findings" ? "@findings.title" : page === "recall" ? "@recall.title" : "@discover.title"),
          () => this.navigate(page === "findings" ? findingsRoute() : { page }), `nav-${page}`);
        button.setAttribute("aria-pressed", String(this.route.page === page));
        if (this.route.page === page) button.setAttribute("aria-current", "page");
      }
    }
    const surface = this.body.createDiv();
    const semanticSnapshot = normal && (this.route.page === "health" || this.route.page === "discover") ? this.semantic?.getSnapshot() : undefined;
    const discover = normal && this.route.page === "discover" ? discoverViewModel(semanticSnapshot, state) : undefined;
    const recallSnapshot = normal && this.route.page === "recall" ? this.recall?.getSnapshot() : undefined;
    const recall = recallSnapshot ? recallViewModel(recallSnapshot) : undefined;
    if (recall && this.recall) {
      const port = this.recall;
      this.cleanupRecall = renderRecall(surface, recall, {
        refresh: () => { void port.refreshCards(); }, start: () => port.startSession(), reveal: () => port.revealAnswer(),
        rate: (rating) => { void port.rate(rating); }, back: () => port.endSession(), source: () => { void port.openSourceNote(); },
        retry: () => { void port.retryLoad(); }, recover: () => port.requestRecovery(), cancelRecovery: () => port.cancelRecovery(),
        confirmRecovery: () => { void port.recoverStorage(); },
      });
      const card = recallSnapshot?.session?.card;
      const focusKey = card ? `${card.id}:${recallSnapshot?.session?.reviewed}:${recallSnapshot?.session?.revealed}` : undefined;
      if (focusKey && focusKey !== this.recallFocusKey) this.focusDestination = recallSnapshot?.session?.revealed ? "recall-answer" : "recall-question";
      this.recallFocusKey = focusKey;
      // One wakeup for an idle overview, never polling or an automatically waiting review session.
      if (!recallSnapshot?.session && !recallSnapshot?.summary?.due && recallSnapshot?.nextDueAt !== undefined) {
        this.wakeAt(recallSnapshot.nextDueAt);
      }
    } else if (discover) {
      renderDiscover(surface, discover, (action) => this.semanticAction(action));
    } else if (normal && this.route.page === "findings") {
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
        dismiss: (id) => { void this.mutateFinding(id, () => this.controller.dismissFinding(id)); },
        snooze: (id, days) => { void this.mutateFinding(id, () => this.controller.snoozeFinding(id, snoozeDeadline(days))); },
        reopen: (id) => { void this.mutateFinding(id, () => this.controller.reopenFinding(id)); },
        togglePaths: () => { this.expandedPaths = !this.expandedPaths; this.render(); },
        toggleSnooze: () => { this.expandedSnooze = !this.expandedSnooze; this.render(); },
      }, this.expandedPaths, this.expandedSnooze);
    } else if (normal && this.semanticSetup && this.semantic) {
      this.renderSemantic(surface);
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
        recall: normal && this.recall ? () => this.navigate({ page: "recall" }) : undefined,
        reviewFinding: normal ? (selectedFindingId) => this.navigate(findingsRoute({ selectedFindingId })) : undefined,
      }, this.changingProfile);
      const recallHealth = state.snapshot?.recall;
      if (normal && recallHealth?.loadState === "ready" && recallHealth.active > 0 && recallHealth.due === 0 && recallHealth.nextDueAt !== undefined) {
        this.wakeAt(recallHealth.nextDueAt);
      }
      if (normal && this.semantic) this.renderSemantic(surface);
    } else {
      renderHealthOnboarding(surface, onboarding, model, state, {
        scan, openNote, choose,
        skip: () => { void this.savePreferences({ profile: "mixed", profileChosen: true, onboardingCompleted: true }); },
        complete: () => { void this.savePreferences({ onboardingCompleted: true }); },
      });
    }
    const status = onboarding.step === "scan" ? onboarding.status : model.status;
    const mutationError = this.findingMutationErrorRoute === this.route;
    const semanticError = this.semanticSetup?.step === "form"
      ? semanticSetupError(this.semanticSetup.result, this.semanticSetup.draft.mode) : undefined;
    const semanticStatus = discover?.healthStatus ?? discover?.status ?? (semanticSnapshot?.busy ? semanticIntelligenceViewModel(semanticSnapshot).status
      : this.semanticSetup?.step === "connected" ? t("@semantic.connected") : undefined);
    this.status.setText(recall ? recall.status ?? "" : state.preferencesError ? t("@health.profile.save-failed") : state.savingPreferences ? t("@health.profile.saving")
      : mutationError ? t("@findings.update-failed") : state.mutatingFindingId ? t("@findings.saving")
      : semanticError ?? semanticStatus ?? this.navigationMessage ?? status ?? "");
    this.status.toggleClass("veynrel-health-status-error", recall ? recall.error : state.preferencesError || mutationError || model.statusError || Boolean(semanticError));
    // Leave the sibling live region available to announce the running state.
    this.body.setAttribute("aria-busy", String(state.busy || state.savingPreferences));
    const heading = (): HTMLElement | null => this.body?.querySelector<HTMLElement>("[data-findings-heading]")
      ?? this.body?.querySelector<HTMLElement>("[data-health-heading]") ?? null;
    if (this.focusDestination) {
      const target = this.focusDestination === "recall-question" ? this.body.querySelector<HTMLElement>("[data-recall-question]")
        : this.focusDestination === "recall-answer" ? this.body.querySelector<HTMLElement>("[data-recall-answer]")
        : this.focusDestination === "detail" ? heading() : this.body.querySelector<HTMLElement>("[data-health-heading]");
      target?.focus(); this.focusDestination = undefined;
    } else if (hadFocus) {
      const target = focusKey ? this.body.querySelector<HTMLButtonElement>(`[data-health-action="${focusKey}"]`) : null;
      // When a step disappears or its button is disabled, keep keyboard focus in this view.
      if (target && !target.disabled) target.focus();
      else heading()?.focus();
    }
    // Metadata only, after onboarding/recovery. Product notifications flow through the Health controller.
    if (normal) this.controller.initializeRecall();
  }

  private wakeAt(dueAt: number): void {
    // A deadline crossed during rendering still gets a wakeup; long delays are bounded and rechecked.
    this.dueWakeup = window.setTimeout(() => this.render(), Math.max(0, Math.min(dueAt - Date.now(), 2_147_483_647)));
  }

  /** Transient product navigation only; never persisted and never starts analysis. */
  private navigate(route: VeynrelHealthRoute): void {
    if (this.route.page === "recall") this.leaveRecall();
    if (route.page === "recall" && this.recall) {
      VeynrelHealthView.recallViews.get(this.recall)?.navigate({ page: "health" });
      VeynrelHealthView.recallViews.set(this.recall, this);
    }
    this.semanticSetup = undefined;
    this.route = route; this.expandedPaths = false; this.expandedSnooze = false;
    this.changingProfile = false; this.navigationMessage = undefined;
    this.findingMutationErrorRoute = undefined;
    this.focusDestination = route.page === "findings" && route.selectedFindingId ? "detail" : "heading";
    this.render();
    if (route.page === "recall" && this.recall) {
      void this.recall.initialize();
    }
  }

  private leaveRecall(): void {
    this.cleanupRecall?.(); this.cleanupRecall = undefined; this.recallFocusKey = undefined;
    if (this.dueWakeup !== undefined) window.clearTimeout(this.dueWakeup);
    this.dueWakeup = undefined;
    if (this.recall && VeynrelHealthView.recallViews.get(this.recall) === this) {
      VeynrelHealthView.recallViews.delete(this.recall);
      this.recall.endSession();
    }
  }

  private renderSemantic(surface: HTMLElement): void {
    const semantic = this.semantic;
    if (!semantic) return;
    renderSemanticIntelligence(surface, semantic.getSnapshot(), this.semanticSetup, {
      action: (action) => this.semanticAction(action),
      choose: (mode) => {
        if (semantic.getSnapshot().busy) return;
        this.semanticSetup = { step: "form", draft: semantic.createDraft(mode) }; this.render();
      },
      edit: (field, value) => {
        if (this.semanticSetup?.step === "form" && !semantic.getSnapshot().busy) this.semanticSetup.draft[field] = value;
      },
      connect: () => { void this.connectSemantic(); },
      back: () => {
        if (semantic.getSnapshot().busy) return;
        this.semanticSetup = undefined; this.focusDestination = "heading"; this.render();
      },
    });
  }

  private openSemanticSetup(): void {
    this.route = { page: "health" }; this.semanticSetup = { step: "choose" };
    this.changingProfile = false; this.navigationMessage = undefined;
    this.focusDestination = "heading"; this.render();
  }

  private semanticAction(action: DiscoverAction): void {
    const semantic = this.semantic;
    if (!semantic || semantic.getSnapshot().busy) return;
    if (action === "enable" || action === "change") {
      this.openSemanticSetup();
    } else if (action === "check") void semantic.checkCurrentSetup();
    else if (action === "build") void semantic.buildIndex();
    else if (action === "rebuild") void semantic.rebuildIndex();
    else if (action === "search") semantic.openSearch();
    else if (action === "related") semantic.openSimilarNotes();
    else if (action === "semantic-duplicates") {
      if (semantic.getSnapshot().state === "ready" && !this.controller.getState().busy) {
        this.navigationMessage = undefined;
        void this.controller.runSemanticScan();
      }
    }
    else semantic.openPotentialDuplicates();
  }

  private async connectSemantic(): Promise<void> {
    const setup = this.semanticSetup; const epoch = this.epoch;
    if (!this.semantic || setup?.step !== "form" || this.semantic.getSnapshot().busy) return;
    const result = await this.semantic.connect({ ...setup.draft });
    if (epoch !== this.epoch || this.semanticSetup !== setup) return;
    this.semanticSetup = result.ok ? { step: "connected", dimensions: result.dimensions } : { ...setup, result };
    this.focusDestination = "heading"; this.render();
  }

  private async mutateFinding(id: string, update: () => Promise<boolean>): Promise<void> {
    const route = this.route;
    if (route.page !== "findings" || route.selectedFindingId !== id || this.controller.getState().busy) return;
    this.navigationMessage = undefined; this.findingMutationErrorRoute = undefined;
    const success = await update();
    // Route identity also rejects late failures after leaving and returning to the same Finding.
    if (!success && this.route === route && !this.controller.getState().busy) {
      this.findingMutationErrorRoute = route;
      this.render();
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

  private async openNote(path: string | undefined): Promise<void> {
    const epoch = this.epoch;
    const opened = await openHealthNote(this.app, path);
    if (!opened && epoch === this.epoch) { this.navigationMessage = t("@health.note-unavailable"); this.render(); }
  }
}
