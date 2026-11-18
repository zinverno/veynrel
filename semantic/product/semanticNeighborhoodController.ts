import { isVaultPath } from "../../health/domain/validation";
import type { SemanticNeighborhoodPort, SemanticNeighborhoodProductSnapshot, SemanticNeighborhoodReason, SemanticNeighborhoodRevision, SemanticSourceSearchResult } from "../../health/semanticNeighborhoodPort";
import { SemanticCompatibilityError, SemanticNotReadyError, SemanticSourceNotIndexedError } from "../errors";
import type { SemanticDocumentSimilarity, SemanticIndexState } from "../types";
import { InvalidNeighborhoodResult, neighborhoodRevision, projectNeighborhood, sameNeighborhoodRevision } from "./semanticNeighborhoodModel";

export interface SemanticNeighborhoodEngine {
  getCachedIndexState(): SemanticIndexState;
  subscribeStatus(listener: () => void): () => void;
  listIndexedPaths(): Promise<readonly string[]>;
  findSimilarNotes(path: string): Promise<SemanticDocumentSimilarity[]>;
}

export class SemanticNeighborhoodController implements SemanticNeighborhoodPort {
  private snapshot: SemanticNeighborhoodProductSnapshot = Object.freeze({ state: "idle", busy: false, indexedNoteCount: 0 });
  private catalog: readonly string[] = Object.freeze([]);
  private catalogRevision?: SemanticNeighborhoodRevision;
  private activeRevision?: SemanticNeighborhoodRevision;
  private pending?: Promise<void>;
  private epoch = 0;
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: () => void;

  constructor(private readonly engine: SemanticNeighborhoodEngine) {
    this.unsubscribe = engine.subscribeStatus(() => this.statusChanged());
  }
  createSession(): SemanticNeighborhoodPort { return new SemanticNeighborhoodController(this.engine); }
  cancel(): void {
    if (this.disposed || !this.pending) return;
    this.epoch++; this.pending = undefined; this.activeRevision = undefined;
    this.publish({ ...this.snapshot, state: this.snapshot.map ? "stale" : "idle", busy: false, reason: undefined });
  }
  getSnapshot(): SemanticNeighborhoodProductSnapshot { return this.snapshot; }
  subscribe(listener: () => void): () => void {
    if (!this.disposed) this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  prepare(): Promise<void> {
    if (this.pending) return this.pending;
    if (this.freshCatalog() && ["choosing", "ready"].includes(this.snapshot.state)) return Promise.resolve();
    return this.run(undefined);
  }
  load(sourcePath: string): Promise<void> { return this.pending ?? this.run(sourcePath); }
  refresh(): Promise<void> { return this.pending ?? this.run(this.snapshot.sourcePath); }
  chooseAnother(): void {
    if (this.disposed || this.pending) return;
    this.epoch++;
    this.publish({ state: this.freshCatalog() ? "choosing" : "stale", busy: false, indexedNoteCount: this.catalog.length,
      ...(this.freshCatalog() ? {} : { reason: "changed" as const }) });
  }
  searchSources(query: string): SemanticSourceSearchResult {
    if (this.disposed || this.snapshot.state !== "choosing" || !this.freshCatalog()) return Object.freeze({ paths: Object.freeze([]), total: 0 });
    const needle = query.trim().toLowerCase();
    // Full paths include basenames. Canonical catalog order survives filtering.
    const matches = this.catalog.filter((path) => path.toLowerCase().includes(needle));
    return Object.freeze({ paths: Object.freeze(matches.slice(0, 20)), total: matches.length });
  }
  dispose(): void {
    this.disposed = true; this.epoch++; this.unsubscribe(); this.listeners.clear();
  }
  private freshCatalog(): boolean {
    return sameNeighborhoodRevision(this.catalogRevision, neighborhoodRevision(this.engine.getCachedIndexState()));
  }
  private run(sourcePath: string | undefined): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const epoch = ++this.epoch;
    const state = this.engine.getCachedIndexState();
    const revision = neighborhoodRevision(state);
    if (!revision) {
      this.publish({ ...this.snapshot, state: "unavailable", busy: false, reason: this.unavailableReason(state) });
      return Promise.resolve();
    }
    this.activeRevision = revision;
    // Install ownership before notifying views. Repeated actions join this promise.
    const pending = Promise.resolve().then(async () => {
      try {
        if (!this.current(epoch, revision)) return;
        if (!sameNeighborhoodRevision(this.catalogRevision, revision)) {
          const paths = await this.engine.listIndexedPaths();
          if (!this.current(epoch, revision)) return;
          if (!Array.isArray(paths) || !Array.from(paths).every(isVaultPath) || new Set(paths).size !== paths.length) throw new InvalidNeighborhoodResult();
          this.catalog = Object.freeze(paths.map((path: string) => path).sort()); this.catalogRevision = revision;
        }
        if (!this.current(epoch, revision)) return;
        if (sourcePath === undefined) {
          this.publish({ state: "choosing", busy: true, indexedNoteCount: this.catalog.length });
          return;
        }
        if (!isVaultPath(sourcePath)) throw new InvalidNeighborhoodResult();
        if (!this.catalog.includes(sourcePath)) throw new SemanticSourceNotIndexedError();
        const results = await this.engine.findSimilarNotes(sourcePath);
        if (!this.current(epoch, revision)) return;
        const map = projectNeighborhood(sourcePath, results, this.catalog, revision, Date.now());
        if (!this.current(epoch, revision)) return;
        this.publish({ state: "ready", busy: true, sourcePath, map, indexedNoteCount: this.catalog.length });
      } catch (error) {
        if (!this.current(epoch, revision)) return;
        const reason: SemanticNeighborhoodReason = error instanceof SemanticSourceNotIndexedError ? "source-removed"
          : error instanceof InvalidNeighborhoodResult ? "invalid" : error instanceof SemanticCompatibilityError ? "incompatible"
          : error instanceof SemanticNotReadyError ? "unavailable" : "failed";
        this.publish({ ...this.snapshot, state: reason === "incompatible" || reason === "unavailable" ? "unavailable" : "error", reason });
      }
    }).finally(() => {
      if (this.pending !== pending) return;
      this.pending = undefined; this.activeRevision = undefined;
      if (!this.disposed) this.publish({ ...this.snapshot, busy: false });
    });
    this.pending = pending;
    this.publish({ ...this.snapshot, state: sourcePath === undefined ? "preparing" : "loading", busy: true, sourcePath, reason: undefined });
    return pending;
  }
  private current(epoch: number, revision: SemanticNeighborhoodRevision): boolean {
    if (this.disposed || epoch !== this.epoch) return false;
    if (sameNeighborhoodRevision(revision, neighborhoodRevision(this.engine.getCachedIndexState()))) return true;
    this.invalidate(true); return false;
  }
  private statusChanged(): void {
    if (this.disposed || this.snapshot.state === "idle") return;
    const revision = this.activeRevision ?? this.catalogRevision;
    if (revision && !sameNeighborhoodRevision(revision, neighborhoodRevision(this.engine.getCachedIndexState()))) this.invalidate(Boolean(this.pending));
  }
  private invalidate(duringOperation: boolean): void {
    this.epoch++;
    const state = this.engine.getCachedIndexState();
    const unavailable = !["ready", "indexing", "initializing"].includes(state.kind);
    this.publish({ ...this.snapshot, state: unavailable ? "unavailable" : "stale",
      reason: unavailable ? this.unavailableReason(state) : duringOperation ? "changed" : undefined });
  }
  private unavailableReason(state: SemanticIndexState): SemanticNeighborhoodReason {
    return state.kind === "incompatible" ? "incompatible" : state.kind === "not-initialized" ? "absent" : "unavailable";
  }
  private publish(snapshot: SemanticNeighborhoodProductSnapshot): void {
    if (this.disposed) return;
    this.snapshot = Object.freeze(snapshot);
    for (const listener of [...this.listeners]) {
      try { listener(); } catch { /* A view cannot change operation ownership. */ }
    }
  }
}
