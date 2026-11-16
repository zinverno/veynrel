import type { SemanticGlobalMapPort, SemanticMapScope, ConnectionSelectionSource } from "../semanticGlobalMapPort";
import { compileConnectionRules } from "../connections/connectionRules";
import type { ConnectionComparisonPort } from "../connectionComparisonPort";
import type { VaultTopologyPort } from "../topology/types";
import { sameSemanticIndexRevision } from "../semanticHealthAnalysisPort";
import type { SemanticDuplicateAnalysis, SemanticHealthAnalysisPort } from "../semanticHealthAnalysisPort";
import type { WorkbenchTagsPort } from "./workbenchTags";

/** Context is navigation only. The host creates a fresh session; no serialized write authority. */
export interface PairReviewPort {
  localFacts?(changed: () => void): import("./reviewFacts").ReviewFactsPort;
  decisions?: import("./reviewDecisionsPort").ReviewDecisionsPort;
  mount(container: HTMLElement, paths: readonly [string, string], completed?: (decision: import("./reviewDecisionsPort").ReviewDecision) => void): () => void;
}
export interface WorkbenchDependencies {
  topology: VaultTopologyPort;
  createSemantic?: (scope: SemanticMapScope, selection?: ConnectionSelectionSource) => SemanticGlobalMapPort;
  createGlobal?: () => SemanticGlobalMapPort;
  createNeighborhood?: () => import("../semanticNeighborhoodPort").SemanticNeighborhoodPort;
  createComparison: (semantic: SemanticGlobalMapPort) => ConnectionComparisonPort;
  duplicates?: SemanticHealthAnalysisPort;
  tags?: WorkbenchTagsPort;
  editRules?: () => () => void;
  rules?: import("../connections/connectionRules").ConnectionRulesPort;
  prepareExisting?: () => Promise<void>;
  subscribeIndex?: (listener: () => void) => () => void;
}

/** Per ItemView, transient read-only ownership. Sources retain all computation/IO authority. */
export class WorkbenchData {
  semantic?: SemanticGlobalMapPort;
  comparison?: ConnectionComparisonPort;
  globalSemantic?: SemanticGlobalMapPort;
  neighborhood?: import("../semanticNeighborhoodPort").SemanticNeighborhoodPort;
  globalComparison?: ConnectionComparisonPort;
  duplicates?: SemanticDuplicateAnalysis;
  duplicateState: "idle" | "loading" | "ready" | "stale" | "unavailable" | "error" = "idle";
  busy = false;
  connectionError = false;
  private abort?: AbortController;
  private epoch = 0;
  private disposed = false;
  private removers: (() => void)[] = [];
  private readonly listeners = new Set<() => void>();
  constructor(readonly scope: SemanticMapScope, readonly dependencies: WorkbenchDependencies, graphical = true) {
    if (graphical) {
      this.ensureComparison();
      this.globalSemantic = dependencies.createGlobal?.();
      this.neighborhood = dependencies.createNeighborhood?.();
      this.globalComparison = this.globalSemantic && dependencies.createComparison(this.globalSemantic);
    }
    const changed = (): void => {
      if (this.duplicates && (dependencies.topology.getSnapshot().state === "stale" ||
        this.semantic?.getSnapshot().state === "stale" || this.semantic?.getSnapshot().map &&
        !sameSemanticIndexRevision(this.duplicates.revision, this.semantic.getSnapshot().map?.revision))) this.duplicateState = "stale";
      this.emit();
    };
    this.removers = [dependencies.topology.subscribe(changed)];
    for (const source of [this.globalSemantic, this.neighborhood, this.globalComparison]) if (source) this.removers.push(source.subscribe(changed));
    if (dependencies.rules) this.removers.push(dependencies.rules.subscribe(changed));
    if (dependencies.tags) this.removers.push(dependencies.tags.subscribe(changed));
    if (this.semantic) this.removers.push(this.semantic.subscribe(changed));
    if (this.comparison) this.removers.push(this.comparison.subscribe(changed));
    if (dependencies.subscribeIndex) this.removers.push(dependencies.subscribeIndex(() => {
      if (this.duplicates) this.duplicateState = "stale";
      this.emit();
    }));
  }
  private ensureComparison(): void {
    if (this.semantic) return;
    const { rules, tags } = this.dependencies;
    const selection: ConnectionSelectionSource | undefined = rules ? {
      capture: () => this.captureParticipation(),
      subscribe: listener => { const a = rules.subscribe(listener), b = tags?.subscribe(listener); return () => { a(); b?.(); }; },
    } : undefined;
    this.semantic = this.dependencies.createSemantic?.(this.scope, selection);
    this.comparison = this.semantic && this.dependencies.createComparison(this.semantic);
  }
  captureParticipation(): import("../connections/connectionSelection").ConnectionSelection | undefined {
    const { rules, tags } = this.dependencies;
    return rules ? compileConnectionRules(rules, tags?.getSnapshot() ?? { revision: 0, categories: [], notes: this.scope.paths.map(path => ({ path, state: "unknown", tags: [] })) }) : undefined;
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  async refresh(task: "map" | "repeats" | "connections" = "map"): Promise<void> {
    if (this.disposed || this.busy) return;
    const epoch = ++this.epoch, abort = new AbortController(); this.abort = abort;
    const duplicates = task !== "connections";
    if (task !== "repeats") this.connectionError = false;
    this.busy = true;
    if (duplicates) this.duplicateState = this.dependencies.duplicates ? "loading" : "unavailable";
    const hadSemantic = Boolean(this.semantic);
    if (task !== "repeats" && !hadSemantic) {
      this.ensureComparison();
      if (this.semantic) this.removers.push(this.semantic.subscribe(() => this.emit()));
      if (this.comparison) this.removers.push(this.comparison.subscribe(() => this.emit()));
    }
    this.emit();
    if (task === "map") this.dependencies.tags?.refresh();
    const current = (): boolean => !this.disposed && epoch === this.epoch;
    try {
      if (task !== "repeats" && this.dependencies.rules) { await this.dependencies.rules.load(); await this.dependencies.rules.refreshFolders(); }
      if (!current()) return;
      if (this.dependencies.prepareExisting) await this.dependencies.prepareExisting();
      else await this.semantic?.prepareExisting?.();
      if (!current()) return;
      await Promise.all([
        task === "repeats" ? Promise.resolve() : this.comparison ? this.comparison.refresh() : this.dependencies.topology.refresh(),
        (async () => {
          if (!duplicates || !this.dependencies.duplicates) return;
          try {
            const result = await this.dependencies.duplicates.analyzeDuplicates(abort.signal);
            await this.dependencies.duplicates.verifyCurrent(result.revision, abort.signal);
            if (current()) { this.duplicates = result; this.duplicateState = "ready"; }
          } catch (error) {
            if (current()) this.duplicateState = (error as { code?: string })?.code === "semantic-unavailable" ? "unavailable" : "error";
          }
        })(),
      ]);
    } catch { if (current()) { if (duplicates) this.duplicateState = "error"; else this.connectionError = true; } } finally { if (current()) { this.busy = false; this.abort = undefined; this.emit(); } }
  }
  /** Only view-owned work; the shared topology refresh remains available to other windows. */
  cancel(): void {
    this.epoch++; this.abort?.abort(); this.abort = undefined; this.busy = false;
    if (this.duplicateState === "loading") this.duplicateState = this.duplicates ? "stale" : "idle";
    this.comparison?.cancel?.(); this.semantic?.cancel?.();
    this.globalComparison?.cancel?.(); this.globalSemantic?.cancel?.(); this.neighborhood?.cancel?.(); this.emit();
  }
  dispose(): void {
    this.disposed = true; this.epoch++; this.abort?.abort();
    this.removers.forEach(remove => remove()); this.removers = [];
    this.globalComparison?.dispose(); this.globalSemantic?.dispose(); this.neighborhood?.dispose();
    this.comparison?.dispose(); this.semantic?.dispose(); this.listeners.clear();
    this.dependencies.tags?.dispose();
  }
  private emit(): void { if (!this.disposed) for (const listener of this.listeners) listener(); }
}
