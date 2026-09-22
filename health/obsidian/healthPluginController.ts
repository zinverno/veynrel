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

export interface HealthControllerState {
  snapshot?: HealthSnapshot;
  recommendationFinding?: Finding;
  preferences: HealthPreferences;
  savingPreferences: boolean;
  preferencesError: boolean;
  mutatingFindingId?: string;
  outcome?: LocalHealthScanOutcome;
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
  private error?: HealthControllerState["error"];
  private recovering = false;
  private disposed = false;
  private readonly recovery: HealthRecovery;
  private savingPreferences = false;
  private preferencesError = false;
  private mutatingFindingId?: string;

  constructor(private readonly app: App, private readonly pluginId: string, private readonly preferences: HealthPreferencesPort) {
    this.recovery = new HealthRecovery(app.vault.adapter, healthStorageRoot(app.vault.configDir, pluginId));
  }

  getHealthService(): Promise<HealthService> {
    if (this.disposed || this.recovering) return Promise.reject(new Error("Health is unavailable during shutdown or recovery."));
    this.servicePromise ??= this.createService();
    return this.servicePromise;
  }

  private async createService(): Promise<HealthService> {
    const storage = new ObsidianHealthStorage(this.app.vault.adapter, healthStorageRoot(this.app.vault.configDir, this.pluginId));
    const service = new HealthService(new FindingStore(storage), new ObsidianLocalVaultSource(this.app));
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
    const snapshot = this.service?.getSnapshot(preferences.profile);
    const id = snapshot?.recommendation?.findingId;
    return { snapshot, recommendationFinding: id ? this.service?.getFinding(id) : undefined,
      preferences, savingPreferences: this.savingPreferences, preferencesError: this.preferencesError,
      mutatingFindingId: this.mutatingFindingId,
      outcome: this.outcome ? structuredClone(this.outcome) : undefined,
      busy: Boolean(this.activeScan) || Boolean(this.service?.isLocalScanRunning()) || this.recovering || Boolean(this.mutatingFindingId),
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
  runLocalScan(): Promise<void> {
    if (this.activeScan) return this.activeScan;
    if (this.recovering || this.disposed || this.mutatingFindingId) return Promise.resolve();
    this.error = undefined;
    this.outcome = undefined;
    this.scanAbort = new AbortController();
    const signal = this.scanAbort.signal;
    this.activeScan = (async () => {
      try {
        const service = await this.getHealthService();
        this.outcome = await service.runLocalScan(signal);
      } catch (error) {
        if (!isCancellation(error)) this.error = "scan";
      } finally {
        this.activeScan = undefined;
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
    if (this.activeScan || this.recovering || this.disposed || this.mutatingFindingId || service.isLocalScanRunning()) return false;
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
    this.listeners.clear();
  }

  private notify(): void {
    if (this.disposed) return;
    for (const listener of [...this.listeners]) {
      try { listener(); } catch { /* View failures do not invalidate a durable scan. */ }
    }
  }
}
