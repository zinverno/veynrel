import { withAbort } from "../analyzers/local/cancellation";
import { sameLocalVaultRevision } from "../analyzers/local/localVaultRevision";
import { deriveTopology } from "./deriveTopology";
import type { TopologySource, VaultTopologyPort, VaultTopologyProductSnapshot } from "./types";

/** Plugin-session owner. No store, Health service, provider or automatic work. */
export class VaultTopologyController implements VaultTopologyPort {
  private snapshot: VaultTopologyProductSnapshot = Object.freeze({ state: "idle" });
  private readonly listeners = new Set<() => void>();
  private active?: Promise<void>;
  private abort?: AbortController;
  private epoch = 0;
  private invalidation = 0;
  private disposed = false;

  constructor(private readonly source: TopologySource, private readonly removeEvents: () => void = () => {}) {}
  getSnapshot(): VaultTopologyProductSnapshot { return this.snapshot; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  load(): Promise<void> { return this.active ?? (this.snapshot.state === "ready" ? Promise.resolve() : this.refresh()); }

  refresh(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.active) return this.active;
    const epoch = ++this.epoch;
    const invalidation = this.invalidation;
    const abort = new AbortController(); this.abort = abort;
    // Schedule after ownership is assigned, including synchronous subscriber re-entry.
    this.active = Promise.resolve().then(async () => {
      try {
        const start = performance.now();
        const metadata = await withAbort(this.source.captureMetadata(abort.signal), abort.signal);
        const captured = performance.now();
        const map = await deriveTopology(metadata, Date.now(), abort.signal);
        const derived = performance.now();
        const current = await withAbort(this.source.captureRevision(abort.signal), abort.signal);
        if (this.disposed || epoch !== this.epoch) return;
        if (invalidation !== this.invalidation || !sameLocalVaultRevision(map.revision, current)) {
          this.publish({ ...this.snapshot, state: "stale", error: "changed" });
        } else {
          this.publish({ state: "ready", map, timing: Object.freeze({ captureMs: captured - start, derivationMs: derived - captured }) });
        }
      } catch {
        if (!this.disposed && epoch === this.epoch) this.publish({ ...this.snapshot, state: "error", error: "build" });
      } finally {
        if (epoch === this.epoch) { this.active = undefined; this.abort = undefined; }
      }
    });
    this.publish({ ...this.snapshot, state: "loading", error: undefined });
    return this.active;
  }

  /** Events invalidate; they never enumerate or rebuild. Also detects metadata changes during capture. */
  markStale(): void {
    if (this.disposed) return;
    this.invalidation++;
    if (this.snapshot.map && this.snapshot.state !== "loading" && this.snapshot.state !== "stale") {
      this.publish({ ...this.snapshot, state: "stale", error: undefined });
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.epoch++; this.abort?.abort(); this.active = undefined;
    this.removeEvents(); this.listeners.clear(); this.snapshot = Object.freeze({ state: "idle" });
  }
  private publish(snapshot: VaultTopologyProductSnapshot): void {
    this.snapshot = Object.freeze(snapshot);
    for (const listener of [...this.listeners]) {
      try { listener(); } catch { /* A view cannot invalidate the captured graph. */ }
    }
  }
}
