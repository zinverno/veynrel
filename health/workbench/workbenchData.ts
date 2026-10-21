import type { SemanticGlobalMapPort, SemanticMapScope } from "../semanticGlobalMapPort";
import type { ConnectionComparisonPort } from "../connectionComparisonPort";
import type { VaultTopologyPort } from "../topology/types";
import { sameSemanticIndexRevision } from "../semanticHealthAnalysisPort";
import type { SemanticDuplicateAnalysis, SemanticHealthAnalysisPort } from "../semanticHealthAnalysisPort";
import type { WorkbenchTagsPort } from "./workbenchTags";

/** Context is navigation only. The host creates a fresh session; no serialized write authority. */
export interface PairReviewPort {
  mount(container: HTMLElement, paths: readonly [string, string]): () => void;
}
export interface WorkbenchDependencies {
  topology: VaultTopologyPort;
  createSemantic?: (scope: SemanticMapScope) => SemanticGlobalMapPort;
  createComparison: (semantic: SemanticGlobalMapPort) => ConnectionComparisonPort;
  duplicates?: SemanticHealthAnalysisPort;
  tags?: WorkbenchTagsPort;
}

/** Per ItemView, transient read-only ownership. Sources retain all computation/IO authority. */
export class WorkbenchData {
  semantic?: SemanticGlobalMapPort;
  comparison?: ConnectionComparisonPort;
  duplicates?: SemanticDuplicateAnalysis;
  duplicateState: "idle" | "loading" | "ready" | "stale" | "unavailable" | "error" = "idle";
  busy = false;
  private abort?: AbortController;
  private epoch = 0;
  private disposed = false;
  private removers: (() => void)[] = [];
  private readonly listeners = new Set<() => void>();
  constructor(readonly scope: SemanticMapScope, readonly dependencies: WorkbenchDependencies) {
    this.semantic = dependencies.createSemantic?.(scope);
    this.comparison = this.semantic && dependencies.createComparison(this.semantic);
    const changed = (): void => {
      if (this.duplicates && (dependencies.topology.getSnapshot().state === "stale" ||
        this.semantic?.getSnapshot().state === "stale" || this.semantic?.getSnapshot().map &&
        !sameSemanticIndexRevision(this.duplicates.revision, this.semantic.getSnapshot().map?.revision))) this.duplicateState = "stale";
      this.emit();
    };
    this.removers = [dependencies.topology.subscribe(changed)];
    if (dependencies.tags) this.removers.push(dependencies.tags.subscribe(changed));
    if (this.semantic) this.removers.push(this.semantic.subscribe(changed));
    if (this.comparison) this.removers.push(this.comparison.subscribe(changed));
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  async refresh(): Promise<void> {
    if (this.disposed || this.busy) return;
    const epoch = ++this.epoch, abort = new AbortController(); this.abort = abort;
    this.busy = true; this.duplicateState = this.dependencies.duplicates ? "loading" : "unavailable"; this.emit();
    this.dependencies.tags?.refresh();
    const current = (): boolean => !this.disposed && epoch === this.epoch;
    try {
      await this.semantic?.prepareExisting?.();
      if (!current()) return;
      await Promise.all([
        this.comparison ? this.comparison.refresh() : this.dependencies.topology.refresh(),
        (async () => {
          if (!this.dependencies.duplicates) return;
          try {
            const result = await this.dependencies.duplicates.analyzeDuplicates(abort.signal);
            await this.dependencies.duplicates.verifyCurrent(result.revision, abort.signal);
            if (current()) { this.duplicates = result; this.duplicateState = "ready"; }
          } catch (error) {
            if (current()) this.duplicateState = (error as { code?: string })?.code === "semantic-unavailable" ? "unavailable" : "error";
          }
        })(),
      ]);
    } catch { if (current()) this.duplicateState = "error"; } finally { if (current()) { this.busy = false; this.abort = undefined; this.emit(); } }
  }
  dispose(): void {
    this.disposed = true; this.epoch++; this.abort?.abort();
    this.removers.forEach(remove => remove()); this.removers = [];
    this.comparison?.dispose(); this.semantic?.dispose(); this.listeners.clear();
    this.dependencies.tags?.dispose();
  }
  private emit(): void { if (!this.disposed) for (const listener of this.listeners) listener(); }
}
