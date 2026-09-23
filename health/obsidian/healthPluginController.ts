import type { App } from "obsidian";
import { FindingStore } from "../store/findingStore";
import { ObsidianHealthStorage, healthStorageRoot } from "../store/healthStorage";
import { ObsidianLocalVaultSource } from "../analyzers/local/obsidianLocalVaultSource";
import { isCancellation } from "../analyzers/local/cancellation";
import { HealthService } from "../services/healthService";
import type { HealthSnapshot, LocalHealthScanOutcome } from "../services/types";
import { HealthRecovery } from "./healthRecovery";
import type { HealthRecoveryScope } from "./healthRecovery";
import type { HealthPreferences, HealthPreferencesPort } from "../preferences";
import type { Finding, FindingState } from "../domain/finding";
import type { FindingFilter } from "../store/types";
import { isFindingId } from "../domain/identity";
import type { SemanticHealthAnalysisPort } from "../semanticHealthAnalysisPort";
import type { SemanticHealthScanOutcome } from "../services/types";
import type { RecallHealthPort } from "../recallHealthPort";

export interface HealthControllerState {
  snapshot?: HealthSnapshot;
  recommendationFinding?: Finding;
  preferences: HealthPreferences;
  savingPreferences: boolean;
  preferencesError: boolean;
  mutatingFindingId?: string;
  outcome?: LocalHealthScanOutcome;
  semanticOutcome?: SemanticHealthScanOutcome;
  semanticScanRunning?: boolean;
  semanticError?: boolean;
  busy: boolean;
  recovering: boolean;
  error?: "load" | "scan" | "recovery";
}

/** Plugin lifetime, not view lifetime: one lazy service, one owned scan promise. */
export class HealthPluginController {
  private servicePromise?: Promise<HealthService>;
  private service?: HealthService;
  private serviceUnsubscribe?: () => void;
  private readonly listeners = new Set<() => void>();
  private activeScan?: Promise<void>;
  private scanAbort?: AbortController;
  private outcome?: LocalHealthScanOutcome;
  private semanticOutcome?: SemanticHealthScanOutcome;
  private activeScanType?: "local" | "semantic";
  private semanticError = false;
  private error?: HealthControllerState["error"];
  private recovering = false;
  private disposed = false;
  private readonly recovery: HealthRecovery;
  private savingPreferences = false;
  private preferencesError = false;
  private mutatingFindingId?: string;
  private readonly recallUnsubscribe?: () => void;

  constructor(private readonly app: App, private readonly pluginId: string, private readonly preferences: HealthPreferencesPort,
    private readonly semanticAnalysis?: SemanticHealthAnalysisPort, private readonly recall?: RecallHealthPort) {
    this.recovery = new HealthRecovery(app.vault.adapter, healthStorageRoot(app.vault.configDir, pluginId));
    this.recallUnsubscribe = recall?.subscribe(() => this.notify());
  }

  /** Called only once normal Health navigation is available, never by startup or a scan. */
  initializeRecall(): void {
    if (this.disposed || this.recovering || !this.preferences.get().onboardingCompleted || this.recall?.getSnapshot().loadState !== "uninitialized") return;
    const load = this.service?.getSnapshot().initialization;
    if (load?.findingsWritable && load.historyWritable) void this.recall.initialize();
  }

  getHealthService(): Promise<HealthService> {
    if (this.disposed || this.recovering) return Promise.reject(new Error("Health is unavailable during shutdown or recovery."));
    this.servicePromise ??= this.createService();
    return this.servicePromise;
  }

  private async createService(): Promise<HealthService> {
    const storage = new ObsidianHealthStorage(this.app.vault.adapter, healthStorageRoot(this.app.vault.configDir, this.pluginId));
    const service = new HealthService(new FindingStore(storage), new ObsidianLocalVaultSource(this.app), { semanticAnalysis: this.semanticAnalysis });
    try {
      await service.initialize();
      if (!this.disposed) {
        this.service = service;
        this.serviceUnsubscribe = service.subscribe(() => this.notify());
        this.error = undefined;
      }
      return service;
    } catch {
      this.servicePromise = undefined;
      this.error = "load";
      throw new Error("Health storage could not be initialized.");
    }
  }

  getState(): HealthControllerState {
    const preferences = this.preferences.get();
    const snapshot = this.service?.getSnapshot(preferences.profile, this.recall?.getSnapshot());
    const id = snapshot?.recommendation?.findingId;
    return { snapshot, recommendationFinding: id ? this.service?.getFinding(id) : undefined,
      preferences, savingPreferences: this.savingPreferences, preferencesError: this.preferencesError,
      mutatingFindingId: this.mutatingFindingId,
      outcome: this.outcome ? structuredClone(this.outcome) : undefined,
      semanticOutcome: this.semanticOutcome ? structuredClone(this.semanticOutcome) : undefined,
      semanticScanRunning: this.activeScanType === "semantic" || Boolean(this.service?.isSemanticScanRunning()), semanticError: this.semanticError,
      busy: Boolean(this.activeScan) || Boolean(this.service?.isScanRunning()) || this.recovering || Boolean(this.mutatingFindingId),
      recovering: this.recovering, error: this.error };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  getRecommendationPath(): string | undefined {
    return this.getState().recommendationFinding?.notePaths[0];
  }

  /** Service reads are deep copies of committed state; no Vault enumeration or reads. */
  listFindings(filter?: FindingFilter): Finding[] {
    return this.disposed || this.recovering ? [] : this.service?.listFindings(filter) ?? [];
  }

  getFinding(id: string): Finding | undefined {
    return this.disposed || this.recovering || !isFindingId(id) ? undefined : this.service?.getFinding(id);
  }

  dismissFinding(id: string): Promise<boolean> {
    return this.mutateFinding(id, ["open"], (service) => service.dismissFinding(id));
  }

  snoozeFinding(id: string, until: number): Promise<boolean> {
    return this.mutateFinding(id, ["open"], (service) => service.snoozeFinding(id, until));
  }

  reopenFinding(id: string): Promise<boolean> {
    return this.mutateFinding(id, ["dismissed", "snoozed"], (service) => service.reopenFinding(id));
  }

  private async mutateFinding(id: string, allowed: readonly FindingState[], update: (service: HealthService) => Promise<void>): Promise<boolean> {
    // Exclude scan/recovery races and stale/double clicks; resolved history stays backend-owned.
    if (this.disposed || this.getState().busy || !this.service) return false;
    const finding = this.getFinding(id);
    if (!finding || !allowed.includes(finding.state)) return false;
    this.mutatingFindingId = id;
    this.notify();
    try { await update(this.service); return true; }
    catch { return false; }
    finally { this.mutatingFindingId = undefined; this.notify(); }
  }

  async updatePreferences(update: Partial<HealthPreferences>): Promise<boolean> {
    if (this.savingPreferences || this.recovering || this.disposed) return false;
    this.savingPreferences = true;
    this.preferencesError = false;
    this.notify();
    try {
      await this.preferences.update(update);
      return true;
    } catch {
      this.preferencesError = true;
      return false;
    } finally { this.savingPreferences = false; this.notify(); }
  }

  /** Only explicit user actions call this. The controller consumes every rejection. */
  runLocalScan(): Promise<void> { return this.runScan("local"); }
  runSemanticScan(): Promise<void> { return this.runScan("semantic"); }

  private runScan(type: "local" | "semantic"): Promise<void> {
    if (this.activeScan) return this.activeScan;
    if (this.recovering || this.disposed || this.mutatingFindingId) return Promise.resolve();
    if (type === "local") { this.error = undefined; this.outcome = undefined; }
    else { this.semanticError = false; this.semanticOutcome = undefined; }
    this.activeScanType = type;
    this.scanAbort = new AbortController();
    const signal = this.scanAbort.signal;
    this.activeScan = (async () => {
      try {
        const service = await this.getHealthService();
        if (type === "local") this.outcome = await service.runLocalScan(signal);
        else this.semanticOutcome = await service.runSemanticScan(signal);
      } catch (error) {
        if (!isCancellation(error)) {
          if (type === "local") this.error = "scan";
          else this.semanticError = true;
        }
      } finally {
        this.activeScan = undefined;
        this.activeScanType = undefined;
        this.scanAbort = undefined;
        this.notify();
      }
    })();
    this.notify();
    return this.activeScan;
  }

  /** UI must confirm first. Derive scope again here so history-only cannot reset damaged Findings alone. */
  async recover(scope: HealthRecoveryScope): Promise<boolean> {
    if (this.activeScan || this.recovering || this.disposed || this.mutatingFindingId) return false;
    let service: HealthService;
    try { service = await this.getHealthService(); }
    catch { this.error = "recovery"; this.notify(); return false; }
    if (this.activeScan || this.recovering || this.disposed || this.mutatingFindingId || service.isScanRunning()) return false;
    const state = service.getSnapshot().initialization;
    const required = !state.findingsWritable ? "all" : !state.historyWritable ? "history" : undefined;
    if (!required || required !== scope) return false;
    this.recovering = true;
    this.error = undefined;
    this.notify();
    try {
      await this.recovery.recover(required);
      this.serviceUnsubscribe?.(); this.serviceUnsubscribe = undefined;
      this.service = undefined; this.servicePromise = undefined; this.outcome = undefined;
      this.semanticOutcome = undefined; this.semanticError = false;
      // Still exclusive while the replacement initializes; no callers can start another owner.
      this.servicePromise = this.createService();
      await this.servicePromise;
      return true;
    } catch {
      this.error = "recovery";
      return false;
    } finally { this.recovering = false; this.notify(); }
  }

  dispose(): void {
    this.disposed = true;
    this.scanAbort?.abort();
    this.serviceUnsubscribe?.();
    this.recallUnsubscribe?.();
    this.listeners.clear();
  }

  private notify(): void {
    if (this.disposed) return;
    for (const listener of [...this.listeners]) {
      try { listener(); } catch { /* View failures do not invalidate a durable scan. */ }
    }
  }
}
