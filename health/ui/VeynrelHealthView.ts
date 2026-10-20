import { VaultScopeIndex } from "../workspace/vaultScope";
import { renderWorkspaceShell } from "../workspace/renderWorkspaceShell";
import { renderWorkspaceHome, renderScopeNotes, workspaceHeading, scopeName } from "../workspace/renderWorkspaceHome";
import type { ConnectionComparisonPort } from "../connectionComparisonPort";
import { renderConnectionComparison, newConnectionComparisonViewState, connectionComparisonStatus } from "../connections/renderConnectionComparison";
import { syncConnectionComparison } from "../connections/connectionComparisonViewState";
import type { SemanticGlobalMapPort } from "../semanticGlobalMapPort";
import { renderSemanticGlobalMap, globalSemanticMapStatus } from "./renderSemanticGlobalMap";
import { newSemanticGlobalMapViewState } from "./renderSemanticGlobalMapGraph";
import { ItemView } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import { t } from "../../i18n";
import type { HealthPluginController } from "../obsidian/healthPluginController";
import { VEYNREL_HEALTH_VIEW_TYPE } from "../obsidian/openHealthView";
import { openHealthNote, openHealthNotePair, resolveHealthNote } from "../obsidian/openHealthNote";
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
import type { RecallAuthoringPort } from "../../recall/product/recallAuthoringPort";
import { recallAuthoringStatus, renderRecallAuthoring } from "./renderRecallAuthoring";
import type { DeepIntelligencePort } from "../deepIntelligencePort";
import type { DeepKnowledgeConsent } from "../deepHealthAnalysisPort";
import { renderDeepIntelligence } from "./renderDeepIntelligence";
import type { DeepSetupState } from "./renderDeepIntelligence";
import { canCheckKnowledge, deepIntelligenceViewModel, deepSetupError, knowledgeScanStatus, knowledgeElapsed } from "./deepIntelligenceViewModel";

import type { ConnectPort, ConnectResult, ConnectSyncConfirmation } from "../connectPort";
import { renderConnect } from "./renderConnect";
import type { ConnectSetupState } from "./renderConnect";
import { connectResultMessage, connectViewModel } from "./connectViewModel";
import type { VeynrelToolsPort, VeynrelToolAction } from "../toolsPort";
import { toolsViewModel } from "./toolsViewModel";
import { renderTools } from "./renderTools";
import { settingsViewModel } from "./settingsViewModel";
import type { ProductSettingsAction } from "./settingsViewModel";
import { renderProductSettings } from "./renderProductSettings";
import type { VaultTopologyPort } from "../topology/types";
import { renderTopology, renderTopologyPreview } from "../topology/renderTopology";
import { newTopologyViewState } from "../topology/renderTopologyMap";
import { topologyStatus } from "../topology/topologyPresentation";

import type { SemanticNeighborhoodPort } from "../semanticNeighborhoodPort";
import { renderSemanticNeighborhood, neighborhoodStatus } from "./renderSemanticNeighborhood";
import type { SemanticNeighborhoodViewState } from "./renderSemanticNeighborhood";

export class VeynrelHealthView extends ItemView {
  // One transient review surface per plugin owner, including duplicated workspace tabs.
  private static readonly recallViews = new WeakMap<RecallProductPort, VeynrelHealthView>();
  private unsubscribe?: () => void;
  private unsubscribeSemantic?: () => void;
  private unsubscribeDeep?: () => void;
  private unsubscribeAuthoring?: () => void;
  private unsubscribeConnect?: () => void;
  private comparisonView = newConnectionComparisonViewState();
  private unsubscribeComparison?: () => void;
  private globalMapView = newSemanticGlobalMapViewState();
  private unsubscribeGlobalMap?: () => void;
  private cleanupGlobalMap?: () => void;
  private neighborhoodView: SemanticNeighborhoodViewState = { query: "" };
  private unsubscribeNeighborhood?: () => void;
  private unsubscribeTopology?: () => void;
  private cleanupTopology?: () => void;
  private topologyView = newTopologyViewState();
  private connectSetup?: ConnectSetupState;
  private connectConfirmation?: ConnectSyncConfirmation;
  private connectResult?: ConnectResult;
  private deepSetup?: DeepSetupState;
  private knowledgeElapsedTimer?: number;
  private knowledgeConfirmation?: DeepKnowledgeConsent;
  private cleanupRecall?: () => void;
  private recallFocusKey?: string;
  private dueWakeup?: number;
  private dueWindow?: Window;
  private semanticSetup?: SemanticSetupState;
  private epoch = 0;
  private body?: HTMLElement;
  private status?: HTMLElement;
  private navigationMessage?: string;
  private changingProfile = false;
  private route: VeynrelHealthRoute = { page: "home" };
  private areaIndex?: VaultScopeIndex;
  private scopeAcknowledged = false;
  private scopeRevision = 0;
  private pendingTool?: VeynrelToolAction;
  private noteQuery = "";
  private noteLimit = 80;
  private motion = true;
  private shellState = { menuOpen: false };
  private sceneObserver?: IntersectionObserver;
  private findingMutationErrorRoute?: FindingsRoute;
  private expandedPaths = false;
  private expandedSnooze = false;
  private focusDestination?: "heading" | "detail" | "recall-question" | "recall-answer" | "knowledge-confirmation" | "recall-authoring" | "connect-confirmation";

  constructor(leaf: WorkspaceLeaf, private readonly controller: HealthPluginController, private readonly tools: VeynrelToolsPort,
    private readonly semantic?: SemanticIntelligencePort, private readonly recall?: RecallProductPort,
    private readonly deep?: DeepIntelligencePort, private readonly authoring?: RecallAuthoringPort, private readonly connect?: ConnectPort,
    private readonly topology?: VaultTopologyPort, private readonly neighborhood?: SemanticNeighborhoodPort, private readonly globalMap?: SemanticGlobalMapPort, private readonly comparison?: ConnectionComparisonPort) { super(leaf); }
  getViewType(): string { return VEYNREL_HEALTH_VIEW_TYPE; }
  getDisplayText(): string { return t("@health.title"); }
  getIcon(): string { return "activity"; }

  async onOpen(): Promise<void> {
    const epoch = ++this.epoch;
    this.contentEl.empty(); this.contentEl.addClass("veynrel-health-view");
    // Keep the live region mounted while the inexpensive dashboard content is replaced.
    this.status = this.contentEl.createDiv({ cls: "veynrel-health-status", attr: { role: "status", "aria-live": "polite", "aria-atomic": "true" } });
    this.status.setText(t("@health.loading"));
    this.body = this.contentEl.createDiv({ cls: "veynrel-workspace" });
    this.areaIndex = new VaultScopeIndex(this.app.vault, () => {
      this.scopeRevision++; this.scopeAcknowledged = false; this.pendingTool = undefined; this.knowledgeConfirmation = undefined;
      if (this.route.page === "recall") this.leaveRecall();
      this.render();
    });
    const ownerWindow = this.contentEl.ownerDocument.defaultView;
    if (ownerWindow?.IntersectionObserver) {
      this.sceneObserver = new ownerWindow.IntersectionObserver(entries => {
        this.contentEl.setAttribute("data-scene-visible", String(entries.some(entry => entry.isIntersecting)));
      });
      this.sceneObserver.observe(this.contentEl);
    }
    try {
      await this.controller.getHealthService();
      if (epoch !== this.epoch) return;
      this.unsubscribe?.();
      this.unsubscribe = this.controller.subscribe(() => this.render());
      this.unsubscribeSemantic?.();
      this.unsubscribeSemantic = this.semantic?.subscribe(() => this.render());
      this.unsubscribeDeep?.();
      this.unsubscribeDeep = this.deep?.subscribe(() => this.render());
      this.unsubscribeAuthoring?.();
      this.unsubscribeAuthoring = this.authoring?.subscribe(() => this.render());
      this.unsubscribeConnect?.();
      this.unsubscribeConnect = this.connect?.subscribe(() => { this.connectResult = undefined; this.render(); });
      this.unsubscribeComparison?.();
      this.unsubscribeComparison = this.comparison?.subscribe(() => {
        syncConnectionComparison(this.comparisonView, this.comparison?.getSnapshot().comparison);
        if (this.route.page === "connection-opportunities") this.render();
      });
      this.unsubscribeGlobalMap?.();
      let globalSnapshot = this.globalMap?.getSnapshot();
      this.unsubscribeGlobalMap = this.globalMap?.subscribe(() => {
        const next = this.globalMap!.getSnapshot();
        const progressOnly = globalSnapshot?.state === "loading" && next.state === "loading" && next.map === globalSnapshot.map;
        globalSnapshot = next;
        if (this.route.page !== "semantic-map") return;
        if (progressOnly) {
          const message = globalSemanticMapStatus(next) ?? "";
          this.status?.setText(message);
          this.body?.querySelector<HTMLElement>(".veynrel-global-map-status")?.setText(message);
        } else this.render();
      });
      this.unsubscribeNeighborhood?.();
      this.unsubscribeNeighborhood = this.neighborhood?.subscribe(() => this.render());
      this.unsubscribeTopology?.();
      this.unsubscribeTopology = this.topology?.subscribe(() => this.render());
      this.render();
    } catch {
      if (epoch === this.epoch) {
        this.status?.setText(t("@health.error.load"));
        this.body?.createEl("p", { text: t("@health.error.load"), cls: "veynrel-workspace-message veynrel-health-status-error" });
      }
    }
  }

  async onClose(): Promise<void> {
    this.areaIndex?.dispose(); this.areaIndex = undefined;
    this.sceneObserver?.disconnect(); this.sceneObserver = undefined;
    this.scopeAcknowledged = false; this.pendingTool = undefined; this.shellState.menuOpen = false; this.noteQuery = ""; this.noteLimit = 80;
    this.clearKnowledgeElapsedTimer();
    this.unsubscribeComparison?.(); this.unsubscribeComparison = undefined; this.comparisonView = newConnectionComparisonViewState();
    this.unsubscribeGlobalMap?.(); this.unsubscribeGlobalMap = undefined;
    this.cleanupGlobalMap?.(); this.cleanupGlobalMap = undefined; this.globalMapView = newSemanticGlobalMapViewState();
    this.unsubscribeNeighborhood?.(); this.unsubscribeNeighborhood = undefined;
    this.neighborhoodView = { query: "" };
    this.epoch++; this.unsubscribe?.(); this.unsubscribe = undefined;
    this.unsubscribeTopology?.(); this.unsubscribeTopology = undefined;
    this.cleanupTopology?.(); this.cleanupTopology = undefined; this.topologyView = newTopologyViewState();
    this.leaveRecall(); this.dueWindow = undefined;
    this.unsubscribeSemantic?.(); this.unsubscribeSemantic = undefined; this.semanticSetup = undefined;
    this.unsubscribeDeep?.(); this.unsubscribeDeep = undefined; this.deepSetup = undefined;
    this.unsubscribeAuthoring?.(); this.unsubscribeAuthoring = undefined;
    this.unsubscribeConnect?.(); this.unsubscribeConnect = undefined;
    this.connectSetup = undefined; this.connectConfirmation = undefined; this.connectResult = undefined;
    this.knowledgeConfirmation = undefined;
    this.body = undefined; this.status = undefined; this.navigationMessage = undefined;
    this.findingMutationErrorRoute = undefined;
    this.changingProfile = false;
    this.route = { page: "home" }; this.expandedPaths = false; this.expandedSnooze = false; this.focusDestination = undefined;
    this.contentEl.empty();
    // Scans belong to the plugin controller and continue after this view closes.
  }

  private render(): void {
    if (!this.body || !this.status || !this.areaIndex) return;
    this.clearKnowledgeElapsedTimer();
    const state = this.controller.getState();
    const model = healthHomeViewModel(state, Boolean(resolveHealthNote(this.app, this.controller.getRecommendationPath())));
    const onboarding = healthOnboardingViewModel(state, model);
    const active = this.contentEl.ownerDocument.activeElement;
    const hadFocus = active && this.contentEl.contains(active);
    const neighborhoodFocus = this.route.page === "semantic-neighborhood" ? this.neighborhoodView.focusAction : undefined;
    const globalFocus = this.route.page === "semantic-map" ? this.globalMapView.focusAction : undefined;
    this.globalMapView.focusAction = undefined;
    this.neighborhoodView.focusAction = undefined;
    const focusKey = hadFocus ? neighborhoodFocus ?? globalFocus ?? active.getAttribute("data-health-action") ?? active.getAttribute("data-health-focus-action") : null;
    const scan = (): void => { this.navigationMessage = undefined; if (!this.controller.getState().busy) void this.controller.runLocalScan(); };
    const openNote = (): void => { void this.openNote(this.controller.getRecommendationPath()); };
    const choose = (profile: VaultProfile): void => { void this.savePreferences({ profile, profileChosen: true }); };
    const normal = onboarding.step === "complete";
    if (!normal && this.route.page === "recall") this.leaveRecall();
    if (!normal) this.route = { page: "home" };
    if (!normal) { this.connectSetup = undefined; this.connectConfirmation = undefined; this.semanticSetup = undefined; this.deepSetup = undefined; this.knowledgeConfirmation = undefined; }
    // A newer scan/mutation or a dominant recovery/onboarding surface ends the failed interaction.
    if (state.busy || !normal) this.findingMutationErrorRoute = undefined;
    this.cleanupGlobalMap?.(); this.cleanupGlobalMap = undefined;
    this.cleanupRecall?.(); this.cleanupRecall = undefined;
    this.cleanupTopology?.(); this.cleanupTopology = undefined;
    if (this.dueWakeup !== undefined) this.dueWindow?.clearTimeout(this.dueWakeup);
    this.dueWakeup = undefined;
    const enteringPage = this.body.getAttribute("data-page") !== this.route.page;
    const searchSelection = focusKey === "scope-search" ? [(active as HTMLInputElement).selectionStart, (active as HTMLInputElement).selectionEnd] : undefined;
    const scrollTop = this.contentEl.scrollTop;
    const scrollLeft = this.contentEl.scrollLeft;
    const disclosures = new Map<string, boolean>();
    if (!enteringPage && normal) for (const detail of Array.from(this.body.querySelectorAll<HTMLDetailsElement>("details[data-health-disclosure]"))) {
      disclosures.set(detail.getAttribute("data-health-disclosure")!, detail.open);
    }
    this.body.setAttribute("data-page", this.route.page);
    this.body.empty();
    const scope = this.areaIndex;
    const main = normal ? renderWorkspaceShell(this.body, this.route, scope, this.app.vault.getName(),
      route => this.navigate(route), path => this.selectScope(path), this.shellState) : this.body;
    const feedback = main.createDiv({ cls: "veynrel-workspace-message", attr: { "data-workspace-message": "true" } });
    const surface = main.createDiv({ cls: enteringPage ? "veynrel-health-page-enter" : "" });
    const scoped = scope.selection.kind === "folder";
    const gate = (target: HTMLElement, proceed: () => void): void => {
      const box = target.createDiv({ cls: "veynrel-scope-handoff" });
      box.createEl("h2", { text: t("@workspace.handoff") });
      box.createEl("p", { text: t("@workspace.handoff-description", { scope: scopeName(scope) }) });
      box.createEl("p", { text: this.pendingTool ? t(`@tools.${this.pendingTool}.description`) : t(this.route.page === "recall"
        ? "@workspace.global-queue" : ["health", "findings"].includes(this.route.page) ? "@workspace.health-coverage" : this.route.page === "topology" ? "@workspace.topology-coverage" : "@workspace.map-coverage") });
      const revision = this.scopeRevision, route = this.route;
      let consumed = false;
      healthButton(box, t("@workspace.continue"), () => {
        if (!consumed && this.scopeRevision === revision && this.route === route) { consumed = true; proceed(); }
      }, "scope-continue");
    };
    const routeNeedsScope = ["health", "findings", "recall", "topology", "semantic-map", "semantic-neighborhood", "connection-opportunities"].includes(this.route.page);
    const gated = normal && scoped && routeNeedsScope && !this.scopeAcknowledged;
    if (normal && this.pendingTool) {
      const action = this.pendingTool, route = this.route;
      gate(surface, () => { this.pendingTool = undefined; this.render(); void this.launchTool(action, route, true); });
      healthButton(surface, t("@workspace.cancel"), () => { this.pendingTool = undefined; this.render(); }, "scope-cancel");
    }
    if (normal && scoped && routeNeedsScope && this.scopeAcknowledged) surface.createEl("p", { cls: "veynrel-scope-handoff", text: t("@workspace.actual-scope") });
    const deepSnapshot = normal && this.route.page === "health" ? this.deep?.getSnapshot() : undefined;
    const semanticSnapshot = normal && (this.route.page === "health" || this.route.page === "discover") ? this.semantic?.getSnapshot() : undefined;
    const discover = normal && this.route.page === "discover" ? discoverViewModel(semanticSnapshot, state) : undefined;
    const recallSnapshot = normal && this.route.page === "recall" ? this.recall?.getSnapshot() : undefined;
    const recall = recallSnapshot ? recallViewModel(recallSnapshot) : undefined;
    const authoring = recall && !recallSnapshot?.session ? this.authoring?.getSnapshot() : undefined;
    const connectSnapshot = normal && this.route.page === "connect" ? this.connect?.getSnapshot() : undefined;
    if (normal && ["health", "findings", "topology"].includes(this.route.page) && !gated) {
      const entries = surface.createDiv({ cls: "veynrel-check-entries" });
      const findings = healthButton(entries, t("@workspace.findings"), () => this.navigate(findingsRoute()), "nav-findings");
      if (this.route.page === "findings") findings.setAttribute("aria-current", "page");
      const route = this.route;
      healthButton(entries, t("@workspace.audit"), () => { void this.launchTool("openDeepAudit", route); }, "check-audit");
    }
    if (gated) {
      gate(surface, () => { this.scopeAcknowledged = true; this.render(); if (this.route.page === "recall") void this.recall?.initialize(); });
    } else if (normal && this.route.page === "home") {
      renderWorkspaceHome(surface, scope, this.app.vault.getName(), state, this.controller.listFindings(), this.motion, {
        select: path => this.selectScope(path), open: () => this.navigate({ page: "discover" }),
        recall: () => this.navigate({ page: "recall" }), check: () => this.navigate({ page: "health" }),
        process: () => this.navigate({ page: "process" }), motion: () => { this.motion = !this.motion; this.render(); },
      });
      const due = state.snapshot?.recall;
      if (scope.selection.kind === "all" && due?.loadState === "ready" && !due.firstRun && due.due === 0 && due.nextDueAt !== undefined) this.wakeAt(due.nextDueAt);
    } else if (normal && (this.route.page === "process" || this.route.page === "history")) {
      const route = this.route;
      workspaceHeading(surface, t(`@workspace.${route.page}`), t(`@workspace.${route.page}-description`));
      surface.createEl("p", { text: t(route.page === "process" ? "@workspace.batch-scope" : "@workspace.batch-history") });
      const actions: VeynrelToolAction[] = route.page === "process" ? ["openBatchProcessing", "generateMocs"] : ["openOperationHistory", "openBatchProcessing"];
      for (const action of actions) {
        const row = surface.createDiv({ cls: "veynrel-tool-entry" });
        row.createEl("p", { text: t(`@tools.${action}.description`) });
        healthButton(row, t(`@tools.${action}`), () => { void this.launchTool(action, route); }, `tool-${action}`);
      }
      if (route.page === "process") healthButton(surface, t("@workspace.open-recall"), () => this.navigate({ page: "recall" }), "process-recall");
    } else if (normal && this.route.page === "connection-opportunities" && this.comparison) {
      renderConnectionComparison(surface, this.comparison, this.comparisonView, {
        back: () => this.navigate({ page: "discover" }), openNote: (path) => { void this.openNote(path); },
        openPair: (left, right) => { void this.openPair(left, right); },
        explore: (path) => { if (this.neighborhood) { this.navigate({ page: "semantic-neighborhood", returnTo: "connection-opportunities" }); void this.neighborhood.load(path); } },
      });
    } else if (normal && this.route.page === "semantic-map" && this.globalMap) {
      this.cleanupGlobalMap = renderSemanticGlobalMap(surface, this.globalMap, this.globalMapView, {
        back: () => this.navigate({ page: "discover" }), openNote: (path) => { void this.openNote(path); },
        explore: (path) => { if (this.neighborhood) { this.navigate({ page: "semantic-neighborhood", returnTo: "semantic-map" }); void this.neighborhood.load(path); } },
      });
    } else if (normal && this.route.page === "semantic-neighborhood" && this.neighborhood) {
      const returnTo = this.route.returnTo ?? "discover";
      renderSemanticNeighborhood(surface, this.neighborhood, this.neighborhoodView, {
        returnTo, back: () => this.navigate({ page: returnTo }), openNote: (path) => { void this.openNote(path); },
      });
    } else if (normal && this.route.page === "topology" && this.topology) {
      this.cleanupTopology = renderTopology(surface, this.topology, this.topologyView, {
        back: () => this.navigate({ page: "health" }), openNote: (path) => { void this.openNote(path); },
      });
    } else if (normal && this.route.page === "tools") {
      const route = this.route;
      renderTools(surface, toolsViewModel(), (action) => { void this.launchTool(action, route); }, (page) => this.navigate({ page }));
    } else if (normal && this.route.page === "settings") {
      const route = this.route;
      renderProductSettings(surface, settingsViewModel(this.deep?.getSnapshot(), this.semantic?.getSnapshot(), this.connect?.getSnapshot()),
        (action) => { if (this.route === route) this.settingsAction(action); });
    } else if (connectSnapshot) {
      this.renderConnect(surface);
    } else if (recall && this.recall) {
      const port = this.recall;
      this.cleanupRecall = renderRecall(surface, recall, {
        refresh: () => { void port.refreshCards(); }, start: () => { this.authoring?.cancelConfirmation(); port.startSession(); }, reveal: () => port.revealAnswer(),
        rate: (rating) => { void port.rate(rating); }, back: () => port.endSession(), source: () => { void port.openSourceNote(); },
        retry: () => { void port.retryLoad(); }, recover: () => port.requestRecovery(), cancelRecovery: () => port.cancelRecovery(),
        confirmRecovery: () => { void port.recoverStorage(); },
      });
      if (authoring && this.authoring && recall.mode !== "confirm" && recall.mode !== "loading") {
        const author = this.authoring;
        renderRecallAuthoring(surface, authoring, {
          request: () => { this.focusDestination = "recall-authoring"; author.requestGeneration(); },
          generate: () => { void author.generate(); }, cancel: () => author.cancelConfirmation(),
          configure: () => this.navigate({ page: "health" }),
        });
      }
      const card = recallSnapshot?.session?.card;
      const focusKey = card ? `${card.id}:${recallSnapshot?.session?.reviewed}:${recallSnapshot?.session?.revealed}` : undefined;
      if (focusKey && focusKey !== this.recallFocusKey) this.focusDestination = recallSnapshot?.session?.revealed ? "recall-answer" : "recall-question";
      this.recallFocusKey = focusKey;
      // One wakeup for an idle overview, never polling or an automatically waiting review session.
      if (!recallSnapshot?.session && !recallSnapshot?.summary?.due && recallSnapshot?.nextDueAt !== undefined) {
        this.wakeAt(recallSnapshot.nextDueAt);
      }
    } else if (discover) {
      renderScopeNotes(surface, scope, this.noteQuery, this.noteLimit, {
        search: query => { this.noteQuery = query; this.noteLimit = 80; this.render(); },
        more: () => { this.noteLimit += 80; this.render(); }, open: path => { void this.openNote(path); },
      });
      surface.createEl("h2", { text: t("@workspace.advanced-map"), cls: "veynrel-home-section-title" });
      if (scoped && !this.scopeAcknowledged) gate(surface, () => { this.scopeAcknowledged = true; this.render(); });
      else {
      if (scoped) surface.createEl("p", { cls: "veynrel-scope-handoff", text: t("@workspace.actual-scope") });
      renderDiscover(surface, discover, (action) => this.semanticAction(action), this.neighborhood ? () => {
        this.navigate({ page: "semantic-neighborhood", returnTo: "discover" }); void this.neighborhood!.prepare();
      } : undefined, this.globalMap ? () => { this.navigate({ page: "semantic-map" }); void this.globalMap!.load(); } : undefined,
      this.comparison ? () => { this.navigate({ page: "connection-opportunities" }); void this.comparison!.load(); } : undefined,
      () => this.tools.openOperationHistory());
      }
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
        openNote: (path) => { void this.openNote(path); }, tools: () => this.navigate({ page: "tools" }),
        dismiss: (id) => { void this.mutateFinding(id, () => this.controller.dismissFinding(id)); },
        snooze: (id, days) => { void this.mutateFinding(id, () => this.controller.snoozeFinding(id, snoozeDeadline(days))); },
        reopen: (id) => { void this.mutateFinding(id, () => this.controller.reopenFinding(id)); },
        togglePaths: () => { this.expandedPaths = !this.expandedPaths; this.render(); },
        toggleSnooze: () => { this.expandedSnooze = !this.expandedSnooze; this.render(); },
      }, this.expandedPaths, this.expandedSnooze);
    } else if (normal && this.deepSetup && this.deep) {
      this.renderDeep(surface);
    } else if (normal && this.semanticSetup && this.semantic) {
      this.renderSemantic(surface);
    } else if (normal || onboarding.step === "recovery") {
      renderHealthHome(surface.createDiv(), model, {
        scan, openNote,
        recover: () => {
          if (this.controller.getState().busy || !model.recovery) return;
          const scope = model.recovery.scope;
          new HealthRecoveryModal(this.app, scope, () => { void this.controller.recover(scope); }).open();
        },
        changeProfile: () => { this.changingProfile = !this.changingProfile; this.render(); }, chooseProfile: choose,
        findings: normal ? (dimension) => this.navigate(findingsRoute({ dimension: dimension ?? "all" })) : undefined,
        recall: normal && this.recall ? () => this.navigate({ page: "recall" }) : undefined,
        reviewFinding: normal ? (selectedFindingId) => this.navigate(findingsRoute({ selectedFindingId })) : undefined,
      }, this.changingProfile, normal && this.topology ? (home) => renderTopologyPreview(home, this.topology!, () => this.navigate({ page: "topology" })) : undefined);
      const recallHealth = state.snapshot?.recall;
      if (normal && recallHealth?.loadState === "ready" && recallHealth.active > 0 && recallHealth.due === 0 && recallHealth.nextDueAt !== undefined) {
        this.wakeAt(recallHealth.nextDueAt);
      }
      if (normal && this.semantic) this.renderSemantic(surface);
      if (normal && this.deep) this.renderDeep(surface);
    } else {
      renderHealthOnboarding(surface, onboarding, model, state, {
        scan, openNote, choose,
        skip: () => { void this.savePreferences({ profile: "mixed", profileChosen: true, onboardingCompleted: true }); },
        complete: () => { void this.savePreferences({ onboardingCompleted: true }); },
      });
    }
    for (const detail of Array.from(this.body.querySelectorAll<HTMLDetailsElement>("details[data-health-disclosure]"))) {
      const open = disclosures.get(detail.getAttribute("data-health-disclosure")!);
      if (open !== undefined) detail.open = open;
    }
    const status = onboarding.step === "scan" ? onboarding.status : model.status;
    const mutationError = this.findingMutationErrorRoute === this.route;
    const semanticError = this.semanticSetup?.step === "form"
      ? semanticSetupError(this.semanticSetup.result, this.semanticSetup.draft.mode) : undefined;
    const semanticStatus = discover?.healthStatus ?? discover?.status ?? (semanticSnapshot?.busy ? semanticIntelligenceViewModel(semanticSnapshot).status
      : this.semanticSetup?.step === "connected" ? t("@semantic.connected") : undefined);
    const deepError = this.deepSetup?.step === "form" ? deepSetupError(this.deepSetup.result) : undefined;
    const deepStatus = deepSnapshot && (deepSnapshot.busy || deepSnapshot.state === "error" || deepSnapshot.state === "ready")
      ? deepIntelligenceViewModel(deepSnapshot).status : undefined;
    const primaryStatus = connectSnapshot ? connectResultMessage(this.connectSetup?.step === "form" ? this.connectSetup.result : this.connectResult) ?? connectViewModel(connectSnapshot).error ?? connectViewModel(connectSnapshot).status : recall ? (authoring ? recallAuthoringStatus(authoring) : undefined) ?? recall.status ?? "" : state.preferencesError ? t("@health.profile.save-failed") : state.savingPreferences ? t("@health.profile.saving")
      : mutationError ? t("@findings.update-failed") : state.mutatingFindingId ? t("@findings.saving")
      : semanticError ?? semanticStatus ?? this.navigationMessage ?? status ?? "";
    // A connection result must not hide a later Health scan, recovery or navigation message.
    const mapStatus = normal && (this.route.page === "health" || this.route.page === "topology") && this.topology ? topologyStatus(this.topology.getSnapshot()) : undefined;
    const neighborhoodMessage = this.route.page === "semantic-neighborhood" && this.neighborhood ? neighborhoodStatus(this.neighborhood.getSnapshot()) : undefined;
    const globalMessage = this.route.page === "semantic-map" && this.globalMap ? globalSemanticMapStatus(this.globalMap.getSnapshot()) : undefined;
    this.status.setText([this.route.page === "connection-opportunities" && this.comparison ? connectionComparisonStatus(this.comparison.getSnapshot()) ?? this.navigationMessage : this.route.page === "semantic-map" ? globalMessage ?? this.navigationMessage : this.route.page === "semantic-neighborhood" ? neighborhoodMessage ?? this.navigationMessage : this.route.page === "topology" ? this.navigationMessage : primaryStatus, deepError ?? (deepSnapshot ? knowledgeScanStatus(state) ?? deepStatus : undefined), mapStatus].filter(Boolean).join(" · "));
    // Routine state and setup errors already belong to their page sections. Keep
    // otherwise unrepresented failures/results visible below the rail as well.
    const healthNotice = model.statusError || state.outcome?.freshness === "stale" ||
      state.outcome?.findingsCommitted && !state.outcome.historyRecorded ? model.status : undefined;
    const recallNotice = recall?.error || recallSnapshot?.inventoryResult?.complete === false ||
      recallSnapshot?.inventoryResult?.committed === false ? recall?.status : undefined;
    const messages = [this.navigationMessage, state.preferencesError ? t("@health.profile.save-failed") : undefined,
      mutationError ? t("@findings.update-failed") : undefined, healthNotice,
      recallNotice, authoring?.result ? recallAuthoringStatus(authoring) : undefined];
    for (const message of new Set(messages.filter((message): message is string => Boolean(message)))) feedback.createEl("p", { text: message });
    this.status.toggleClass("veynrel-health-status-error", connectSnapshot ? Boolean(connectSnapshot.error || (this.connectResult && !this.connectResult.ok) || (this.connectSetup?.step === "form" && this.connectSetup.result && !this.connectSetup.result.ok)) : recall ? recall.error || Boolean(authoring?.result && authoring.result.status !== "success") : state.preferencesError || mutationError || model.statusError || Boolean(semanticError || deepError) || deepSnapshot?.state === "error");
    // Leave the sibling live region available to announce the running state.
    this.body.setAttribute("aria-busy", String(state.busy || state.savingPreferences || connectSnapshot?.busy));
    const heading = (): HTMLElement | null => this.body?.querySelector<HTMLElement>("[data-findings-heading]")
      ?? this.body?.querySelector<HTMLElement>("[data-health-heading]") ?? null;
    // Explicit navigation/step destinations retain their intentional focus behavior.
    const preserveViewport = normal && !enteringPage && !this.focusDestination;
    if (this.focusDestination) {
      const target = this.focusDestination === "connect-confirmation" ? this.body.querySelector<HTMLElement>("[data-connect-confirmation]")
        : this.focusDestination === "recall-question" ? this.body.querySelector<HTMLElement>("[data-recall-question]")
        : this.focusDestination === "recall-authoring" ? this.body.querySelector<HTMLElement>("[data-recall-authoring-confirmation]")
        : this.focusDestination === "knowledge-confirmation" ? this.body.querySelector<HTMLElement>("[data-knowledge-confirmation]")
        : this.focusDestination === "recall-answer" ? this.body.querySelector<HTMLElement>("[data-recall-answer]")
        : this.focusDestination === "detail" ? heading() : this.body.querySelector<HTMLElement>("[data-health-heading]");
      target?.focus(); this.focusDestination = undefined;
    } else if (hadFocus) {
      const target = focusKey ? this.body.querySelector<HTMLButtonElement>(`[data-health-action="${focusKey}"]`) : null;
      if (enteringPage || !normal) heading()?.focus();
      else if (target && !target.disabled) {
        target.focus({ preventScroll: true });
        if (searchSelection) (target as unknown as HTMLInputElement).setSelectionRange(searchSelection[0], searchSelection[1]);
      }
      else if (!focusKey && (active.getAttribute("data-health-heading") || active.getAttribute("data-findings-heading"))) heading()?.focus({ preventScroll: true });
      else {
        // Keep the keyboard near a temporarily disabled action. Carry its key on
        // the replacement parent so completion restores it only if focus stayed here.
        const nearby = target?.parentElement ?? (this.route.page === "semantic-neighborhood" ? heading() : undefined) ?? this.body;
        nearby.setAttribute("tabindex", "-1");
        if (focusKey && (target || this.route.page === "semantic-neighborhood")) nearby.setAttribute("data-health-focus-action", focusKey);
        nearby.focus({ preventScroll: true });
      }
    }
    if (preserveViewport) {
      // contentEl is the native ItemView scroll owner; DOM replacement can clamp it.
      this.contentEl.scrollTop = scrollTop;
      this.contentEl.scrollLeft = scrollLeft;
    }
    // Metadata only, after onboarding/recovery. Product notifications flow through the Health controller.
    if (normal && (this.route.page === "home" || this.route.page === "health" && !gated)) this.controller.initializeRecall();
  }

  private selectScope(path?: string): void {
    if (!this.areaIndex) return;
    this.areaIndex.select(path); this.scopeRevision++; this.scopeAcknowledged = false; this.pendingTool = undefined;
    this.noteQuery = ""; this.noteLimit = 80;
    this.knowledgeConfirmation = undefined; this.authoring?.cancelConfirmation();
    this.semanticSetup = undefined; this.deepSetup = undefined; this.connectConfirmation = undefined; this.connectResult = undefined;
    if (this.route.page === "recall") this.leaveRecall();
    this.render();
  }

  private wakeAt(dueAt: number): void {
    // A deadline crossed during rendering still gets a wakeup; long delays are bounded and rechecked.
    this.dueWindow = this.contentEl.ownerDocument.defaultView ?? window;
    this.dueWakeup = this.dueWindow.setTimeout(() => this.render(), Math.max(0, Math.min(dueAt - Date.now(), 2_147_483_647)));
  }

  /** Transient product navigation only; never persisted and never starts analysis. */
  private navigate(route: VeynrelHealthRoute): void {
    if (!this.body || healthOnboardingViewModel(this.controller.getState()).step !== "complete") return;
    if (this.route.page === "recall") this.leaveRecall();
    if (route.page === "recall" && this.recall) {
      VeynrelHealthView.recallViews.get(this.recall)?.navigate({ page: "health" });
      VeynrelHealthView.recallViews.set(this.recall, this);
    }
    this.semanticSetup = undefined;
    this.deepSetup = undefined;
    this.knowledgeConfirmation = undefined;
    this.connectSetup = undefined; this.connectConfirmation = undefined; this.connectResult = undefined;
    this.scopeAcknowledged = false; this.pendingTool = undefined; this.shellState.menuOpen = false;
    this.route = route; this.expandedPaths = false; this.expandedSnooze = false;
    this.changingProfile = false; this.navigationMessage = undefined;
    this.findingMutationErrorRoute = undefined;
    this.focusDestination = route.page === "findings" && route.selectedFindingId ? "detail" : "heading";
    this.render();
    if (route.page === "recall" && this.recall && this.areaIndex?.selection.kind === "all") {
      void this.recall.initialize();
    }
  }

  private async launchTool(action: VeynrelToolAction, route: VeynrelHealthRoute, acknowledged = false): Promise<void> {
    if (!this.body || this.route !== route || !["tools", "health", "findings", "topology", "process", "history"].includes(route.page) || healthOnboardingViewModel(this.controller.getState()).step !== "complete") return;
    if (this.areaIndex?.selection.kind === "folder" && !acknowledged && !this.scopeAcknowledged) {
      this.pendingTool = action; this.render(); return;
    }
    const epoch = this.epoch, scopeRevision = this.scopeRevision;
    if (this.navigationMessage) { this.navigationMessage = undefined; this.render(); }
    try { await this.tools[action](); }
    catch {
      // Workflow UI owns detailed results. A failed launcher never exposes raw errors.
      if (this.epoch === epoch && this.route === route && this.scopeRevision === scopeRevision) {
        this.navigationMessage = t("@tools.launch-failed"); this.render();
      }
    }
  }

  private settingsAction(action: ProductSettingsAction): void {
    if (!this.body || healthOnboardingViewModel(this.controller.getState()).step !== "complete") return;
    if (action === "connect") this.navigate({ page: "connect" });
    else if (action === "semantic") this.semanticAction("change");
    else if (this.deep && !this.deep.getSnapshot().busy && !this.controller.getState().busy) this.openDeepSetup();
  }

  private leaveRecall(): void {
    this.authoring?.cancelConfirmation();
    this.cleanupRecall?.(); this.cleanupRecall = undefined; this.recallFocusKey = undefined;
    if (this.dueWakeup !== undefined) this.dueWindow?.clearTimeout(this.dueWakeup);
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
    this.deepSetup = undefined;
    this.knowledgeConfirmation = undefined;
    this.route = { page: "health" }; this.semanticSetup = { step: "choose" };
    this.changingProfile = false; this.navigationMessage = undefined;
    this.focusDestination = "heading"; this.render();
  }

  private openDeepSetup(): void {
    this.semanticSetup = undefined; this.knowledgeConfirmation = undefined;
    this.route = { page: "health" }; this.deepSetup = { step: "choose" };
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

  private renderDeep(surface: HTMLElement): void {
    const deep = this.deep;
    if (!deep) return;
    renderDeepIntelligence(surface, deep.getSnapshot(), deep.getProviders(), this.deepSetup, {
      action: (action) => {
        if (deep.getSnapshot().busy || this.controller.getState().busy) return;
        if (action === "knowledge") {
          if (!canCheckKnowledge(deep.getSnapshot())) return;
          this.knowledgeConfirmation = this.controller.getKnowledgeConsent();
          if (!this.knowledgeConfirmation) return;
          this.focusDestination = "knowledge-confirmation"; this.render(); return;
        }
        this.knowledgeConfirmation = undefined;
        if (action === "check") { void deep.checkCurrentSetup(); return; }
        this.openDeepSetup();
      },
      choose: (provider) => {
        if (deep.getSnapshot().busy) return;
        this.deepSetup = { step: "form", draft: deep.createDraft(provider) }; this.render();
      },
      edit: (field, value) => {
        if (this.deepSetup?.step === "form" && !deep.getSnapshot().busy) {
          this.deepSetup.draft[field] = value; this.deepSetup.result = undefined;
        }
      },
      connect: () => { void this.connectDeep(); },
      back: () => { this.deepSetup = undefined; this.focusDestination = "heading"; this.render(); },
      startKnowledge: () => {
        if (!this.knowledgeConfirmation || this.controller.getState().busy || !canCheckKnowledge(deep.getSnapshot())) return;
        const consent = this.knowledgeConfirmation;
        this.knowledgeConfirmation = undefined; this.navigationMessage = undefined;
        void this.controller.runDeepScan(consent);
      },
      cancelKnowledge: () => this.controller.cancelDeepScan(),
      dismissConfirmation: () => { this.knowledgeConfirmation = undefined; this.focusDestination = "heading"; this.render(); },
    }, { consent: this.knowledgeConfirmation, available: Boolean(this.controller.getKnowledgeConsent()), running: Boolean(this.controller.getState().deepScanRunning),
      busy: this.controller.getState().busy, status: knowledgeScanStatus(this.controller.getState()), progress: this.controller.getState().deepProgress });
    const progress = this.controller.getState().deepProgress;
    const elapsed = surface.querySelector<HTMLElement>("[data-knowledge-elapsed]");
    if (progress && elapsed) {
      // Presentation clock only: no polling, progress increments, state writes or provider work.
      this.knowledgeElapsedTimer = window.setInterval(() => elapsed.setText(knowledgeElapsed(progress.startedAt)), 1000);
    }
  }

  private clearKnowledgeElapsedTimer(): void {
    if (this.knowledgeElapsedTimer !== undefined) window.clearInterval(this.knowledgeElapsedTimer);
    this.knowledgeElapsedTimer = undefined;
  }

  private async connectDeep(): Promise<void> {
    const setup = this.deepSetup; const epoch = this.epoch;
    if (!this.deep || setup?.step !== "form" || this.deep.getSnapshot().busy) return;
    setup.result = undefined;
    const result = await this.deep.connect(setup.draft);
    if (epoch !== this.epoch || this.deepSetup !== setup) return;
    this.deepSetup = result.ok ? undefined : { ...setup, result };
    this.focusDestination = "heading"; this.render();
  }

  private renderConnect(surface: HTMLElement): void {
    const connect = this.connect;
    if (!connect) return;
    renderConnect(surface, connect.getSnapshot(), this.connectSetup, this.connectConfirmation, this.connectResult, {
      setup: () => {
        if (connect.getSnapshot().busy) return;
        this.connectSetup = { step: "choose" }; this.connectConfirmation = undefined; this.connectResult = undefined;
        this.focusDestination = "heading"; this.render();
      },
      choose: (mode) => {
        if (connect.getSnapshot().busy) return;
        this.connectSetup = { step: "form", draft: connect.createDraft(mode) }; this.render();
      },
      edit: (field, value) => {
        if (this.connectSetup?.step !== "form" || connect.getSnapshot().busy) return;
        const draft = this.connectSetup.draft;
        if (field === "endpoint" && draft.endpoint !== value) {
          draft.token = "";
          const password = this.body?.querySelector<HTMLInputElement>('[data-health-action="connect-field-token"]');
          if (password) password.value = "";
        }
        draft[field] = value; this.connectSetup.result = undefined;
      },
      connect: () => { void this.connectCompanion(); },
      back: () => { this.connectSetup = undefined; this.focusDestination = "heading"; this.render(); },
      check: () => { void this.connectAction(() => connect.check()); },
      requestSync: () => {
        this.connectConfirmation = connect.createSyncConfirmation(); this.connectResult = undefined;
        this.focusDestination = "connect-confirmation"; this.render();
      },
      confirmSync: () => {
        const confirmation = this.connectConfirmation;
        if (!confirmation || this.route.page !== "connect") return;
        this.connectConfirmation = undefined;
        void this.connectAction(() => connect.sync(confirmation));
      },
      cancelSync: () => { this.connectConfirmation = undefined; this.focusDestination = "heading"; this.render(); },
      disable: () => { this.connectConfirmation = undefined; void this.connectAction(() => connect.disable()); },
      review: () => connect.openProposalReview(),
      discover: () => this.navigate({ page: "discover" }),
    });
  }

  private async connectCompanion(): Promise<void> {
    const setup = this.connectSetup; const epoch = this.epoch;
    if (!this.connect || setup?.step !== "form" || this.connect.getSnapshot().busy) return;
    setup.result = undefined;
    const result = await this.connect.connect(setup.draft);
    if (epoch !== this.epoch || this.connectSetup !== setup) return;
    this.connectSetup = result.ok ? undefined : { ...setup, result };
    this.focusDestination = "heading"; this.render();
  }

  private async connectAction(action: () => Promise<ConnectResult>): Promise<void> {
    const route = this.route; const epoch = this.epoch;
    this.connectResult = undefined;
    const result = await action();
    if (epoch !== this.epoch || this.route !== route) return;
    this.connectResult = result;
    this.render();
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
  private async openPair(left: string, right: string): Promise<void> {
    const epoch = this.epoch;
    if (!await openHealthNotePair(this.app, left, right) && epoch === this.epoch) { this.navigationMessage = t("@health.note-unavailable"); this.render(); }
  }
}
