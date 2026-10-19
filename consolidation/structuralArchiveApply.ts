import type { ArchiveParent, ArchivePlanV2 } from "./archivePlanV2";
import type { PlanPair } from "./changePlan";
import type { SafeApplyPort, JournalSnapshot } from "./safeApply";
import type { MultiOwner } from "./multiFileApply";
import { requireSafe, SafeApplyError } from "./operationJournal";
import { StructuralArchiveJournal, structuralArchiveRecord, completeStructuralArchive } from "./structuralArchiveJournal";
import type { StructuralArchiveRecord, StructuralArchiveEntry } from "./structuralArchiveJournal";
import type { StructuralRestoration } from "./structuralArchiveEvidence";

export interface StructuralArchiveCheck { notes: PlanPair; environment: string; guard(): void }
export interface StructuralArchivePort {
  check(plan: ArchivePlanV2, parent: ArchiveParent, pinned?: PlanPair): Promise<StructuralArchiveCheck>;
  undo(record: StructuralArchiveRecord, pinned?: PlanPair): Promise<StructuralArchiveCheck>;
  restored(record: StructuralArchiveRecord, pinned?: PlanPair): Promise<StructuralArchiveCheck>;
  observe(record: StructuralArchiveRecord, archived: boolean, previous: PlanPair): Promise<StructuralArchiveCheck>;
}
export interface StructuralArchiveReview { readonly id: string; readonly action: "apply" | "undo"; readonly record: StructuralArchiveRecord }
export interface StructuralArchiveHistory extends StructuralArchiveEntry {
  state: "prepared" | "applied" | "undone" | "conflict"; recovered: boolean; canUndo: boolean; editorBlocked: boolean;
  parentUndo: "undo_first" | "parent_ready" | "chain_incomplete" | "parent_unavailable";
}
interface Ticket { record: StructuralArchiveRecord; action: StructuralArchiveReview["action"]; checked: StructuralArchiveCheck; current: () => boolean }
const exact = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Eighth journal owner. Leaf inspection never calls a lock-owning service method. */
export class StructuralArchiveApply {
  private readonly tickets = new Map<StructuralArchiveReview, Ticket>();
  constructor(private readonly journal: StructuralArchiveJournal, private readonly port: SafeApplyPort,
    private readonly native: StructuralArchivePort, private readonly owner: MultiOwner) {}
  dispose(): void { this.tickets.clear(); }
  discard(review: StructuralArchiveReview): void { this.tickets.delete(review); }
  guard(review: StructuralArchiveReview): void { const t = this.tickets.get(review); requireSafe(t, "used"); this.owner.active(t.current); t.checked.guard(); }
  private ticket(t: Ticket): StructuralArchiveReview {
    const review = Object.freeze({ id: t.record.id, action: t.action, record: JSON.parse(JSON.stringify(t.record)) as StructuralArchiveRecord });
    this.tickets.set(review, t); return review;
  }
  private async snapshot(): Promise<JournalSnapshot> { const s = await this.owner.history?.(); requireSafe(s, "storage"); return s; }
  private parent(p: ArchivePlanV2, snapshot: JournalSnapshot, undoingParent = false): void {
    const rows = p.provenance.operation === "copy_context_group" ? snapshot.group : snapshot.bundle;
    const e = rows.find(e => e.id === p.provenance.id);
    requireSafe(e?.record && !e.damaged && e.scope === "none" && exact(e.record, p.provenance.parent) &&
      e.record.operation === p.provenance.operation && e.receipts.filter(m => m.state === "applied").length === 1 &&
      exact(e.receipts.find(m => m.state === "applied"), p.provenance.receipt) &&
      (undoingParent || e.receipts.length === 1), "archive_parent");
  }
  private intact(r: StructuralArchiveRecord, s: JournalSnapshot): StructuralArchiveEntry {
    const e = s.structuralArchive.find(e => e.id === r.id);
    requireSafe(e && !e.damaged && e.scope === "none" && exact(e.record, r), "storage"); return e;
  }
  async blockers(paths: readonly string[], ownId?: string, snapshot?: JournalSnapshot): Promise<void> {
    for (const e of (snapshot ?? await this.snapshot()).structuralArchive) {
      requireSafe(e.scope !== "global", "storage");
      if (e.record && !paths.includes(e.record.plan.canonical.path) && !paths.includes(e.record.plan.secondary.path)) continue;
      if (e.id === ownId && e.record && !e.damaged) continue;
      requireSafe(completeStructuralArchive(e), e.damaged ? "storage" : "archive_active");
    }
  }
  /** The only historical-mtime exception, bound to the entire immutable, completed chain. */
  async restoration(parent: ArchiveParent, snapshot?: JournalSnapshot): Promise<StructuralRestoration | undefined> {
    const s = snapshot ?? await this.snapshot(), rows = s.structuralArchive;
    requireSafe(!rows.some(e => e.scope === "global"), "archive_chain");
    const linked = rows.filter(e => e.record?.parent.id === parent.id);
    if (!linked.length) return undefined;
    requireSafe(linked.length === 1, "archive_chain");
    const e = linked[0]; requireSafe(e.record && exact(e.record.parent, parent) && !e.damaged, "archive_chain");
    requireSafe(completeStructuralArchive(e), e.receipts.length === 1 ? "archive_active" : "archive_chain");
    this.parent(e.record.plan, s, true); this.pending(e.record.plan, s);
    return { archiveId: e.id, modified: e.receipts[2].modified, record: e.record, receipt: e.receipts[2], evidence: JSON.stringify(e) };
  }
  private pending(p: ArchivePlanV2, s: JournalSnapshot): void {
    const paths = [p.canonical.path, p.secondary.path];
    for (const e of s.single) requireSafe(!!e.resolution || !!e.record && (!paths.some(path => path === e.record!.sourcePath || path === e.record!.targetPath) ||
      e.marks.includes("undone") || e.marks.includes("applied") && !e.marks.includes("undo_pending")), "storage");
    for (const e of s.multi) requireSafe(!!e.record && (!e.record.files.some(f => paths.includes(f.path)) || e.marks.includes("undone") ||
      e.marks.includes("applied") && !e.marks.includes("undo_intent") && !e.marks.includes("compensate_intent")), "storage");
  }
  private async constraints(p: ArchivePlanV2, s: JournalSnapshot, ownId?: string): Promise<void> {
    this.parent(p, s); const paths = [p.canonical.path, p.secondary.path];
    this.pending(p, s);
    await this.owner.blockers(paths, ownId, s);
    const linked = s.structuralArchive.filter(e => e.record?.parent.id === p.provenance.id);
    requireSafe(ownId ? linked.length === 1 && linked[0].id === ownId : linked.length === 0, "archive_chain");
  }
  private async checked(r: StructuralArchiveRecord, action: "apply" | "undo", pinned?: PlanPair, ownId?: string, receipts?: number): Promise<StructuralArchiveCheck> {
    const snapshot = await this.snapshot(); await this.constraints(r.plan, snapshot, ownId);
    if (ownId) requireSafe(this.intact(r, snapshot).receipts.length === receipts, "conflict");
    const checked = action === "apply" ? await this.native.check(r.plan, r.parent, pinned) : await this.native.undo(r, pinned);
    if (action === "undo") requireSafe(checked.notes[1].modified === this.intact(r, snapshot).receipts[0].modified, "conflict");
    requireSafe(checked.environment === r.environment && exact(snapshot, await this.snapshot()), "stale");
    checked.guard(); return checked;
  }
  review(plan: ArchivePlanV2, current: () => boolean): Promise<StructuralArchiveReview> {
    return this.owner.exclusive(async () => {
      this.owner.active(current); const p = JSON.parse(JSON.stringify(plan)) as ArchivePlanV2, snapshot = await this.snapshot();
      await this.constraints(p, snapshot);
      const first = await this.native.check(p, p.provenance.parent), record = await structuralArchiveRecord(p, first.environment);
      requireSafe(!await this.journal.has(record.id) && exact(snapshot, await this.snapshot()), "used");
      const checked = await this.checked(record, "apply", first.notes); this.owner.active(current); first.guard();
      return this.ticket({ record, action: "apply", checked, current });
    });
  }
  reviewUndo(id: string, current: () => boolean): Promise<StructuralArchiveReview> {
    return this.owner.exclusive(async () => {
      this.owner.active(current); const s = await this.snapshot(), e = s.structuralArchive.find(e => e.id === id);
      requireSafe(e?.record && !e.damaged && e.receipts.length === 1 && e.receipts[0].state === "applied", "archive_chain");
      const first = await this.checked(e.record, "undo", undefined, id, 1), checked = await this.checked(e.record, "undo", first.notes, id, 1);
      this.owner.active(current); first.guard(); return this.ticket({ record: e.record, action: "undo", checked, current });
    });
  }
  async execute(review: StructuralArchiveReview): Promise<void> {
    const t = this.tickets.get(review); requireSafe(t, "used"); this.tickets.delete(review);
    await this.owner.exclusive(async () => {
      const r = t.record, forward = t.action === "apply"; this.owner.active(t.current); t.checked.guard();
      const first = await this.checked(r, t.action, t.checked.notes, forward ? undefined : r.id, forward ? undefined : 1);
      this.owner.active(t.current); first.guard();
      try { if (forward) await this.journal.prepare(r); else await this.journal.mark(r, "undo_intent", first.notes[1]); }
      catch (e) { throw e instanceof SafeApplyError ? e : new SafeApplyError("storage"); }
      const checked = await this.checked(r, t.action, t.checked.notes, r.id, forward ? 0 : 2);
      t.checked.guard(); const guard = () => { this.owner.active(t.current); checked.guard(); }; guard();
      try { await this.port.process(checked.notes[1], forward ? r.plan.secondary.before : r.plan.secondary.after, forward ? r.plan.secondary.after : r.plan.secondary.before, guard); }
      catch { throw new SafeApplyError("write"); }
      // Observe the dispatched write even when its own event revokes the UI ticket.
      const observed = await this.native.observe(r, forward, checked.notes);
      const s = await this.snapshot(); await this.constraints(r.plan, s, r.id);
      requireSafe(this.intact(r, s).receipts.length === (forward ? 0 : 2) && exact(s, await this.snapshot()), "storage"); observed.guard();
      try { await this.journal.mark(r, forward ? "applied" : "undone", observed.notes[1]); } catch { throw new SafeApplyError("storage"); }
    });
  }
  history(): Promise<StructuralArchiveHistory[]> {
    return this.owner.exclusive(async () => {
      const s = await this.snapshot(), rows: StructuralArchiveHistory[] = [];
      for (const e of s.structuralArchive) {
        const row: StructuralArchiveHistory = { ...e, state: "conflict", recovered: false, canUndo: false, editorBlocked: false, parentUndo: "chain_incomplete" };
        const r = e.record;
        if (r) {
          const secondary = await this.port.read(r.plan.secondary.path);
          if (secondary?.file.stat.ctime === r.plan.secondary.created) {
            if (secondary.content === r.plan.secondary.after) { row.state = "applied"; row.recovered = e.receipts.length !== 1; }
            else if (secondary.content === r.plan.secondary.before) {
              row.state = e.receipts.some(m => m.state === "undo_intent") ? "undone" : !e.receipts.length && secondary.modified === r.plan.secondary.modified ? "prepared" : "conflict";
              row.recovered = row.state === "undone" && !completeStructuralArchive(e);
            }
          }
          try {
            if (row.state === "applied") { await this.checked(r, "undo", undefined, r.id, 1); row.canUndo = true; row.parentUndo = "undo_first"; }
            else if (row.state === "undone" && completeStructuralArchive(e)) {
              this.parent(r.plan, s); const checked = await this.native.restored(r);
              requireSafe(checked.notes[1].modified === e.receipts[2].modified, "archive_chain");
              await this.constraints(r.plan, s, r.id); row.parentUndo = "parent_ready";
            }
          } catch (error) {
            if (error instanceof SafeApplyError && error.reason === "editor") row.editorBlocked = true;
            if (completeStructuralArchive(e) && error instanceof SafeApplyError && error.reason === "archive_parent") row.parentUndo = "parent_unavailable";
          }
        }
        rows.push(row);
      }
      return rows.sort((a, b) => (b.record?.createdAt ?? 0) - (a.record?.createdAt ?? 0));
    });
  }
}
