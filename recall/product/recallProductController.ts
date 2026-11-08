import type { RecallScope } from "../domain/topics";
import { isStudyTag } from "../domain/topics";
import { isRecallPath } from "../domain/identity";
import type { RecallCard } from "../domain/card";
import type { RecallService } from "../services/recallService";
import { RECALL_RATINGS } from "../scheduler/types";
import type { RecallRating } from "../scheduler/types";
import type { RecallProductPort, RecallProductSnapshot, RecallRecoveryPort, RecallSessionSnapshot } from "./types";

interface Session {
  reviewed: number;
  card?: RecallCard;
  decisionAt?: number;
  previews?: RecallSessionSnapshot["previews"];
}

/** One plugin-lifetime service owner. View/session state is disposable; issued durable writes are not. */
export class RecallProductController implements RecallProductPort {
  private scope: RecallScope = {};
  private service?: RecallService;
  private initializing?: Promise<void>;
  private loadState: RecallProductSnapshot["loadState"] = "uninitialized";
  private firstRun = false;
  private refreshing = false;
  private ingestions = 0;
  private readonly admissionAbort = new AbortController();
  private reviewSaving = false;
  private recovering = false;
  private canRecover = false;
  private confirmingRecovery = false;
  private inventoryResult?: RecallProductSnapshot["inventoryResult"];
  private sourceIssue?: RecallProductSnapshot["sourceIssue"];
  private error?: RecallProductSnapshot["error"];
  private session?: Session;
  private abort?: AbortController;
  private disposed = false;
  private readonly cleanup: (() => void)[] = [];
  addCleanup(cleanup: () => void): void { this.cleanup.push(cleanup); }
  private readonly listeners = new Set<() => void>();

  constructor(private readonly createService: () => RecallService, private readonly recovery: RecallRecoveryPort,
    private readonly openNote: (path: string) => Promise<boolean>, private readonly clock: () => number = Date.now) {}

  initialize(): Promise<void> {
    if (this.disposed || this.loadState !== "uninitialized") return this.initializing ?? Promise.resolve();
    this.loadState = "loading"; this.notify();
    this.initializing = this.loadOwner().finally(() => { this.initializing = undefined; this.notify(); });
    return this.initializing;
  }

  private async loadOwner(): Promise<void> {
    this.error = undefined;
    try {
      this.service = this.createService();
      await this.service.initialize();
      await this.updateLoadState();
    } catch { this.loadState = "unavailable"; this.error = "load"; this.canRecover = await this.recovery.canRecover(); }
  }

  private async updateLoadState(): Promise<void> {
    const load = this.service!.getLoadResult();
    this.loadState = load.writable ? "ready" : load.status as "invalid" | "unsupported" | "unavailable";
    this.firstRun = load.status === "missing";
    this.canRecover = !load.writable && (load.status !== "unavailable" || await this.recovery.canRecover());
  }

  getSnapshot(): RecallProductSnapshot {
    const session = this.session;
    const ready = this.loadState === "ready" && this.service;
    return { scope: { ...this.scope }, totalActive: ready ? ready.getActiveCount() : 0,
      facets: ready ? ready.getFacets() : undefined, loadState: this.loadState, firstRun: this.firstRun, refreshing: this.refreshing, reviewSaving: this.reviewSaving,
      inventoryEstablished: Boolean(ready && ready.hasFullInventory()), ingesting: this.ingestions > 0,
      recovering: this.recovering, canRecover: this.canRecover, confirmingRecovery: this.confirmingRecovery,
      summary: ready ? ready.getSummary(this.clock(), this.scope) : undefined, nextDueAt: ready ? ready.getNextDueAt(this.scope) : undefined,
      globalSummary: ready ? ready.getSummary(this.clock()) : undefined, globalNextDueAt: ready ? ready.getNextDueAt() : undefined,
      sourceIssue: this.sourceIssue ? { ...this.sourceIssue } : undefined,
      inventoryResult: this.inventoryResult ? { ...this.inventoryResult } : undefined, error: this.error,
      session: session ? { reviewed: session.reviewed, complete: !session.card && !this.reviewSaving, revealed: session.decisionAt !== undefined,
        card: session.card ? { id: session.card.id, path: session.card.path, question: session.card.question, vocabulary: session.card.vocabulary ? { ...session.card.vocabulary } : undefined,
          ...(session.decisionAt === undefined ? {} : { answer: session.card.answer }) } : undefined,
        previews: session.previews?.map((preview) => ({ ...preview })) } : undefined };
  }

  private get busy(): boolean { return this.loadState === "loading" || this.refreshing || this.reviewSaving || this.recovering || this.ingestions > 0; }
  private get ready(): boolean { return !this.disposed && this.loadState === "ready" && !this.busy; }

  async refreshNote(path: string): Promise<"updated" | "blocked" | "failed"> {
    await this.initialize();
    if (this.disposed || this.recovering || this.loadState !== "ready") return "blocked";
    this.ingestions++; this.notify();
    try {
      const diagnostics = await this.service!.refreshNote(path, this.admissionAbort.signal);
      const issue = diagnostics?.find(item => ["invalid-vocabulary", "malformed-card", "oversized-card"].includes(item.code));
      this.sourceIssue = issue ? { path, line: issue.line } : undefined;
      if (this.session?.card?.path === path) { this.session = undefined; this.error = "source"; }
      await this.updateLoadState();
      return "updated";
    } catch {
      await this.updateLoadState();
      return "failed";
    } finally { this.ingestions--; this.notify(); }
  }

  async refreshCards(): Promise<void> {
    if (!this.ready || this.session) return;
    this.refreshing = true; this.error = undefined; this.abort = new AbortController(); this.notify();
    try {
      const result = await this.service!.scan(this.abort.signal);
      const issue = result.diagnostics.find(item => item.path && ["invalid-vocabulary", "malformed-card", "oversized-card"].includes(item.code));
      this.sourceIssue = issue?.path ? { path: issue.path, line: issue.line } : undefined;
      this.inventoryResult = { complete: result.complete, committed: result.committed, active: this.service!.getSummary(this.clock()).active };
      await this.updateLoadState();
    } catch {
      if (!this.disposed) { this.error = "inventory"; await this.updateLoadState(); }
    } finally { this.refreshing = false; this.abort = undefined; this.notify(); }
  }

  setScope(scope: RecallScope): void {
    if (this.busy || this.disposed) return;
    if ((scope.kind !== undefined && !["study", "vocabulary"].includes(scope.kind)) ||
        (scope.tag !== undefined && scope.tag !== "" && !isStudyTag(scope.tag)) || (scope.path !== undefined && !isRecallPath(scope.path))) return;
    this.session = undefined; this.scope = { ...scope }; this.error = undefined; this.notify();
  }

  async renameNote(oldPath: string, path: string): Promise<void> {
    if (!this.service || this.loadState !== "ready" || this.disposed) return;
    this.session = undefined; this.ingestions++; this.notify();
    try { await this.service.renameNote(oldPath, path); if (this.scope.path === oldPath) this.scope = { ...this.scope, path }; }
    catch { this.error = "source"; }
    finally { this.ingestions--; this.notify(); }
  }

  sourceChanged(path: string): void {
    if (this.session?.card?.path === path) { this.session = undefined; this.error = "source"; this.notify(); }
  }

  async startSession(): Promise<void> {
    if (!this.ready || this.session) return;
    this.error = undefined; const session: Session = { reviewed: 0 }; this.session = session;
    this.reviewSaving = true; this.notify();
    try { await this.selectNext(session); }
    catch { if (this.session === session) { this.session = undefined; this.error = "source"; } }
    finally { this.reviewSaving = false; this.notify(); }
  }

  private async selectNext(session: Session): Promise<void> {
    const card = this.service!.listDue(this.clock(), 1, this.scope)[0];
    if (card) await this.service!.verifyCard(card.id, this.admissionAbort.signal, this.scope);
    if (this.disposed || this.session !== session) return;
    session.card = card; session.decisionAt = undefined; session.previews = undefined;
  }

  revealAnswer(): void {
    const session = this.session;
    if (!this.ready || !session?.card || session.decisionAt !== undefined) return;
    try {
      const decisionAt = this.clock();
      const previews = this.service!.previewCard(session.card.id, decisionAt);
      session.previews = RECALL_RATINGS.map((rating) => ({ rating, intervalMs: previews[rating].intervalMs }));
      session.decisionAt = decisionAt; this.error = undefined;
    } catch { this.error = "session"; }
    this.notify();
  }

  async rate(rating: RecallRating): Promise<void> {
    const session = this.session;
    if (!this.ready || !session?.card || session.decisionAt === undefined || !RECALL_RATINGS.includes(rating)) return;
    this.reviewSaving = true; this.error = undefined; this.notify();
    let committed = false;
    try {
      const current = await this.service!.verifyCard(session.card.id, this.admissionAbort.signal, this.scope);
      if (this.disposed || this.session !== session) return;
      await this.service!.reviewCard(session.card.id, rating, session.decisionAt, current); committed = true;
    }
    catch { if (this.session === session) this.error = "review"; await this.updateLoadState(); }
    finally {
      // Navigation/close invalidates the object identity, but never cancels an issued write or resurrects its UI.
      if (committed && this.session === session && !this.disposed) {
        session.reviewed++;
        try { await this.selectNext(session); } catch { this.session = undefined; this.error = "session"; }
      }
      this.reviewSaving = false; this.notify();
    }
  }

  endSession(): void {
    this.session = undefined; this.confirmingRecovery = false; this.error = undefined; this.notify();
  }

  async openSourceNote(): Promise<void> {
    const session = this.session;
    if (this.disposed || !session?.card) return;
    let opened = false;
    try { opened = await this.openNote(session.card.path); } catch { /* Safe category only. */ }
    if (this.session === session && !opened) { this.error = "source"; this.notify(); }
  }

  async retryLoad(): Promise<void> {
    if (this.disposed || this.busy || this.loadState !== "unavailable") return;
    this.endSession(); this.inventoryResult = undefined; this.loadState = "uninitialized";
    await this.initialize();
  }

  requestRecovery(): void {
    if (!this.disposed && !this.busy && this.canRecover && this.loadState !== "ready") {
      this.confirmingRecovery = true; this.notify();
    }
  }
  cancelRecovery(): void { if (!this.recovering) { this.confirmingRecovery = false; this.notify(); } }

  async recoverStorage(): Promise<void> {
    if (this.disposed || this.busy || !this.canRecover || !this.confirmingRecovery) return;
    this.recovering = true; this.error = undefined; this.notify();
    try {
      await this.recovery.recover();
      this.session = undefined; this.inventoryResult = undefined; this.confirmingRecovery = false;
      await this.loadOwner();
    } catch { this.error = "recovery"; }
    finally { this.recovering = false; this.notify(); }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  dispose(): void { this.disposed = true; this.cleanup.forEach(cleanup => cleanup()); this.session = undefined; this.abort?.abort(); this.admissionAbort.abort(); this.listeners.clear(); }
  private notify(): void {
    if (!this.disposed) for (const listener of [...this.listeners]) { try { listener(); } catch { /* Subscribers cannot fail durable operations. */ } }
  }
}
