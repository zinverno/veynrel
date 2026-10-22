import type { ConnectionSelectionSource } from "../../health/semanticGlobalMapPort";
import type { SemanticIndexRevision } from "../../health/semanticHealthAnalysisPort";
import type { SemanticGlobalMapPort, SemanticGlobalMapProductSnapshot, SemanticGlobalSearchResult, SemanticMapScope } from "../../health/semanticGlobalMapPort";
import { GLOBAL_SEMANTIC_DOCUMENT_CAP } from "../globalSemanticMap";
import type { GlobalSemanticAnalysis, GlobalSemanticOptions, SemanticFocusAnalysis } from "../globalSemanticMap";
import type { SemanticIndexState } from "../types";
import { semanticIndexRevision, sameSemanticIndexRevision } from "../semanticIndexRevision";
import { InvalidGlobalSemanticResult, projectGlobalSemanticMap, projectSemanticFocus } from "./semanticGlobalMapModel";

export interface SemanticGlobalMapEngine {
  getCachedIndexState(): SemanticIndexState;
  refreshSemanticStatus?(): Promise<unknown>;
  subscribeStatus(listener: () => void): () => void;
  analyzeGlobalSemanticMap(options?: GlobalSemanticOptions): Promise<GlobalSemanticAnalysis>;
  analyzeSemanticFocus(path: string): Promise<SemanticFocusAnalysis | undefined>;
}
export class SemanticGlobalMapController implements SemanticGlobalMapPort {
  private snapshot: SemanticGlobalMapProductSnapshot = Object.freeze({ state: "idle", busy: false, supportedNoteCount: GLOBAL_SEMANTIC_DOCUMENT_CAP });
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: () => void;
  private revision?: SemanticIndexRevision;
  private readonly removeSelection?: () => void;
  private abort?: AbortController;
  private pending?: Promise<void>;
  private epoch = 0;
  private disposed = false;

  constructor(private readonly engine: SemanticGlobalMapEngine, private readonly scope?: SemanticMapScope, private readonly selection?: ConnectionSelectionSource) {
    this.removeSelection = selection?.subscribe(() => { if (!this.disposed) this.invalidate(); });
    this.unsubscribe = engine.subscribeStatus(() => {
      if (!this.disposed && this.revision && !sameSemanticIndexRevision(this.revision, semanticIndexRevision(engine.getCachedIndexState()))) this.invalidate();
    });
  }
  createScoped(scope: SemanticMapScope, selection?: ConnectionSelectionSource): SemanticGlobalMapPort {
    return new SemanticGlobalMapController(this.engine, Object.freeze({ ...scope, paths: Object.freeze([...scope.paths]) }), selection);
  }
  async prepareExisting(): Promise<void> {
    if (!this.disposed) await this.engine.refreshSemanticStatus?.();
  }
  getSnapshot(): SemanticGlobalMapProductSnapshot { return this.snapshot; }
  subscribe(listener: () => void): () => void { if (!this.disposed) this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  load(): Promise<void> {
    if (this.pending) return this.pending;
    // Opening a cached/stale surface does not silently recompute it.
    if (this.snapshot.state === "stale" || this.snapshot.state === "ready") return Promise.resolve();
    return this.run();
  }
  refresh(): Promise<void> { return this.pending ?? this.run(); }
  focus(path: string): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.pending) return this.pending;
    if (this.scope || this.snapshot.state !== "ready" || !this.snapshot.map?.nodes.some((node) => node.path === path)) {
      this.publish({ ...this.snapshot, focusError: true }); return Promise.resolve();
    }
    return this.run(path);
  }
  resetFocus(): void {
    if (this.disposed) return;
    // A reset also owns any pending focus; its late result must not recenter the map.
    if (this.snapshot.focusing) { this.epoch++; this.abort?.abort(); this.pending = undefined; this.abort = undefined; }
    this.publish({ ...this.snapshot, focus: undefined, focusError: undefined, focusing: undefined,
      busy: this.snapshot.focusing ? false : this.snapshot.busy });
  }
  search(query: string): SemanticGlobalSearchResult {
    const needle = query.trim().toLowerCase();
    const matches = this.disposed ? [] : (this.snapshot.map?.nodes ?? []).filter((node) => node.path.toLowerCase().includes(needle) || node.basename.toLowerCase().includes(needle));
    return Object.freeze({ nodes: Object.freeze(matches.slice(0, 20)), total: matches.length });
  }
  dispose(): void { this.disposed = true; this.epoch++; this.abort?.abort(); this.unsubscribe(); this.removeSelection?.(); this.listeners.clear(); }
  private invalidate(): void {
    this.epoch++; this.abort?.abort(); this.revision = undefined;
    this.publish({ ...this.snapshot, state: "stale", reason: "changed", progress: undefined });
  }
  private current(epoch: number, revision: SemanticIndexRevision): boolean {
    if (this.disposed || epoch !== this.epoch) return false;
    if (sameSemanticIndexRevision(revision, semanticIndexRevision(this.engine.getCachedIndexState()))) return true;
    this.invalidate(); return false;
  }
  private run(focusPath?: string): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const revision = semanticIndexRevision(this.engine.getCachedIndexState());
    if (!revision) { this.publish({ ...this.snapshot, state: "unavailable", reason: "unavailable", busy: false }); return Promise.resolve(); }
    const capturedMap = this.snapshot.map;
    if (focusPath !== undefined && (!capturedMap || !sameSemanticIndexRevision(capturedMap.revision, revision))) { this.invalidate(); return Promise.resolve(); }
    const epoch = ++this.epoch; this.revision = revision;
    const abort = new AbortController(); this.abort = abort;
    const pending = Promise.resolve().then(async () => {
      try {
        if (!this.current(epoch, revision)) return;
        if (focusPath !== undefined) {
          const result = await this.engine.analyzeSemanticFocus(focusPath);
          if (!this.current(epoch, revision)) return;
          const focus = projectSemanticFocus(result, focusPath, capturedMap!);
          if (!this.current(epoch, revision)) return;
          this.publish({ ...this.snapshot, focus, focusError: undefined });
          return;
        }
        const selection = this.selection?.capture();
        const result = await this.engine.analyzeGlobalSemanticMap({ ...(selection ? { selection } : {}), ...(this.scope ? { paths: this.scope.paths } : {}), signal: abort.signal, onProgress: (progress) => {
          if (this.current(epoch, revision)) this.publish({ ...this.snapshot, progress: Object.freeze({ ...progress }) });
        } });
        if (!this.current(epoch, revision)) return;
        if (this.selection && this.selection.capture()?.revision !== selection?.revision) { this.invalidate(); return; }
        const projected = projectGlobalSemanticMap(result, revision, Date.now(), selection);
        if (this.scope && projected?.nodes.some(node => !this.scope!.paths.includes(node.path))) throw new InvalidGlobalSemanticResult();
        const map = projected && this.scope ? Object.freeze({ ...projected, scope: this.scope }) : projected;
        if (!this.current(epoch, revision)) return;
        this.publish({ state: map ? "ready" : "unavailable", reason: result.state === "ready" ? undefined : result.state,
          map, selection: result.selection && Object.freeze({ ...result.selection }), indexedNoteCount: result.indexedNoteCount, mappedNoteCount: result.mappedNoteCount,
          busy: true, supportedNoteCount: GLOBAL_SEMANTIC_DOCUMENT_CAP });
      } catch (error) {
        if (this.current(epoch, revision)) this.publish(focusPath !== undefined ? { ...this.snapshot, focusError: true } :
          { ...this.snapshot, state: "error", progress: undefined, reason: error instanceof InvalidGlobalSemanticResult ? "invalid" : "failed" });
      }
    }).finally(() => {
      if (this.pending !== pending) return;
      this.pending = undefined; this.abort = undefined;
      if (!this.disposed) this.publish({ ...this.snapshot, busy: false, focusing: undefined });
    });
    this.pending = pending;
    this.publish({ ...this.snapshot, state: focusPath !== undefined ? "ready" : "loading", busy: true,
      focusing: focusPath !== undefined, focusError: undefined, reason: undefined, progress: undefined });
    return pending;
  }
  private publish(snapshot: SemanticGlobalMapProductSnapshot): void {
    if (this.disposed) return;
    this.snapshot = Object.freeze(snapshot);
    for (const listener of [...this.listeners]) { try { listener(); } catch { /* Views cannot change ownership. */ } }
  }
}
