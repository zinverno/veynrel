import { sameLocalVaultRevision } from "../analyzers/local/localVaultRevision";
import { sameSemanticIndexRevision } from "../semanticHealthAnalysisPort";
import type { SemanticGlobalMap, SemanticGlobalMapPort } from "../semanticGlobalMapPort";
import type { VaultTopologyPort, VaultTopologySnapshot } from "../topology/types";
import type { ConnectionComparisonPort, ConnectionComparisonProductSnapshot } from "../connectionComparisonPort";
import { deriveConnectionComparison } from "./deriveConnectionComparison";

/** One session owner of comparison only; source controllers retain all capture/computation ownership. */
export class ConnectionComparisonController implements ConnectionComparisonPort {
  private snapshot: ConnectionComparisonProductSnapshot = Object.freeze({ state: "idle" });
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: (() => void)[];
  private inputs?: { semantic: SemanticGlobalMap; topology: VaultTopologySnapshot };
  private pending?: Promise<void>;
  private epoch = 0;
  private disposed = false;

  constructor(private readonly semantic: SemanticGlobalMapPort, private readonly topology: VaultTopologyPort) {
    this.unsubscribe = [semantic.subscribe(() => this.sourceChanged()), topology.subscribe(() => this.sourceChanged())];
  }
  getSnapshot(): ConnectionComparisonProductSnapshot { return this.snapshot; }
  subscribe(listener: () => void): () => void { if (!this.disposed) this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  load(): Promise<void> {
    if (this.pending) return this.pending;
    if (this.snapshot.state === "ready" || this.snapshot.state === "stale") return Promise.resolve();
    return this.run(false);
  }
  refresh(): Promise<void> { return this.pending ?? this.run(true); }
  cancel(): void {
    if (this.disposed || !this.pending) return;
    this.epoch++; this.pending = undefined; this.inputs = undefined;
    this.publish({ ...this.snapshot, state: this.snapshot.comparison ? "stale" : "idle", reason: undefined });
  }
  dispose(): void {
    this.disposed = true; this.epoch++; this.pending = undefined; this.inputs = undefined;
    for (const remove of this.unsubscribe) remove();
    this.listeners.clear(); this.snapshot = Object.freeze({ state: "idle" });
  }
  private sourceReason(): ConnectionComparisonProductSnapshot["reason"] {
    const semantic = this.semantic.getSnapshot(), topology = this.topology.getSnapshot();
    if (semantic.state === "stale") return "semantic-stale";
    if (topology.state === "stale") return "topology-stale";
    if (semantic.state !== "ready" || !semantic.map) return "semantic-unavailable";
    if (topology.state !== "ready" || !topology.map) return "topology-unavailable";
    return undefined;
  }
  private inputsCurrent(inputs: NonNullable<ConnectionComparisonController["inputs"]>): boolean {
    const semantic = this.semantic.getSnapshot(), topology = this.topology.getSnapshot();
    return !this.sourceReason() && semantic.map === inputs.semantic && topology.map === inputs.topology &&
      sameSemanticIndexRevision(inputs.semantic.revision, semantic.map.revision) && sameLocalVaultRevision(inputs.topology.revision, topology.map.revision);
  }
  private sourceChanged(): void {
    if (this.disposed || !this.inputs || this.inputsCurrent(this.inputs)) return;
    this.epoch++; this.inputs = undefined;
    this.publish({ ...this.snapshot, state: "stale", reason: this.sourceReason() ?? "changed" });
  }
  private run(refresh: boolean): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const reason = this.sourceReason();
    // Topology.load can refresh stale captures; comparison opening must not do so implicitly.
    if (!refresh && (reason === "semantic-stale" || reason === "topology-stale")) {
      this.publish({ ...this.snapshot, state: "stale", reason }); return Promise.resolve();
    }
    const epoch = ++this.epoch; this.inputs = undefined;
    const pending = Promise.resolve().then(async () => {
      try {
        if (this.disposed || epoch !== this.epoch) return;
        await Promise.all([
          refresh ? this.semantic.refresh() : this.semantic.getSnapshot().state === "ready" ? Promise.resolve() : this.semantic.load(),
          refresh ? this.topology.refresh() : this.topology.getSnapshot().state === "ready" ? Promise.resolve() : this.topology.load(),
        ]);
        if (this.disposed || epoch !== this.epoch) return;
        const reason = this.sourceReason();
        if (reason) {
          this.publish({ ...this.snapshot, state: reason.endsWith("stale") ? "stale" : "unavailable", reason }); return;
        }
        const inputs = { semantic: this.semantic.getSnapshot().map!, topology: this.topology.getSnapshot().map! };
        this.inputs = inputs;
        const comparison = deriveConnectionComparison(inputs.semantic, inputs.topology, Date.now());
        // A publication boundary gives queued source notifications/disposal ownership over the result.
        await Promise.resolve();
        if (this.disposed || epoch !== this.epoch) return;
        if (!this.inputsCurrent(inputs)) { this.sourceChanged(); return; }
        this.publish({ state: "ready", comparison });
      } catch {
        if (!this.disposed && epoch === this.epoch) { this.inputs = undefined; this.publish({ ...this.snapshot, state: "error", reason: "invalid" }); }
      }
    }).finally(() => { if (this.pending === pending) this.pending = undefined; });
    this.pending = pending;
    this.publish({ ...this.snapshot, state: "loading", reason: undefined });
    return pending;
  }
  private publish(snapshot: ConnectionComparisonProductSnapshot): void {
    if (this.disposed) return;
    this.snapshot = Object.freeze(snapshot);
    for (const listener of [...this.listeners]) { try { listener(); } catch { /* Views do not own comparison publication. */ } }
  }
}
