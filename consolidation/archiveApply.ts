import type { ArchivePlan } from "./archivePlan";
import { ArchiveJournal, archiveRecord } from "./archiveJournal";
import type { ArchiveEntry, ArchiveRecord } from "./archiveJournal";
import type { MergeJournal, MergeRecord } from "./mergeJournal";
import type { MergeCheck, ArchiveRestoration } from "./mergeApply";
import type { PlanPair } from "./changePlan";
import type { MultiOwner } from "./multiFileApply";
import type { SafeApplyPort, JournalSnapshot } from "./safeApply";
import { sameSavedNote } from "./savedNote";
import { requireSafe, SafeApplyError } from "./operationJournal";

export interface ArchivePort {
  check(plan: ArchivePlan, parent: MergeRecord, pinned?: PlanPair): Promise<MergeCheck>;
  undo(record: ArchiveRecord, pinned?: PlanPair): Promise<MergeCheck>;
}
export interface ArchiveHistory extends ArchiveEntry {
  state: "prepared" | "applied" | "undone" | "conflict"; recovered: boolean; canUndo: boolean; editorBlocked: boolean;
  parentUndo: "undo_first" | "merge_ready" | "chain_incomplete" | "parent_unavailable";
}
export interface ArchiveReview { readonly id: string; readonly action: "apply" | "undo"; readonly record: ArchiveRecord }
interface Ticket { record: ArchiveRecord; action: ArchiveReview["action"]; checked: MergeCheck; current: () => boolean }
const exact = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const complete = (e: ArchiveEntry) => !e.damaged && ["applied", "undo_intent", "undone"].every(state => e.receipts.some(m => m.state === state));

/** Same owner lock as every other executor. Only secondary is dispatched to process(). */
export class ArchiveApply {
  private readonly tickets = new Map<ArchiveReview, Ticket>();
  constructor(private readonly journal: ArchiveJournal, private readonly mergeJournal: MergeJournal,
    private readonly port: SafeApplyPort, private readonly native: ArchivePort, private readonly owner: MultiOwner) {}
  dispose(): void { this.tickets.clear(); }
  discard(review: ArchiveReview): void { this.tickets.delete(review); }
  private ticket(t: Ticket): ArchiveReview {
    const review = Object.freeze({ id: t.record.id, action: t.action, record: JSON.parse(JSON.stringify(t.record)) as ArchiveRecord });
    this.tickets.set(review, t); return review;
  }
  /** Leaf journal reads only: never reenter Merge or the shared lock. */
  private async parent(plan: ArchivePlan, expected?: MergeRecord, snapshot?: JournalSnapshot): Promise<MergeRecord> {
    const e = (snapshot?.merge ?? await this.mergeJournal.entries()).find(row => row.id === plan.provenance.id);
    requireSafe(e?.record && !e.damaged && e.receipts.length > 0 && e.receipts.every(m => exact(m, plan.provenance.receipt)) &&
      plan.provenance.receipt.state === "applied" && (!expected || exact(e.record, expected)), "archive_parent");
    return e.record;
  }
  private async intact(r: ArchiveRecord): Promise<ArchiveEntry> {
    const e = (await this.journal.entries()).find(row => row.id === r.id);
    requireSafe(e && !e.damaged && exact(e.record, r), "storage"); return e;
  }
  async blockers(paths: readonly string[], ownId?: string, snapshot?: JournalSnapshot): Promise<void> {
    for (const e of snapshot?.archive ?? await this.journal.entries()) {
      requireSafe(e.scope !== "global", "storage");
      const p = e.record?.plan;
      if (!p || !paths.includes(p.canonical.path) && !paths.includes(p.secondary.path)) continue;
      if (e.id === ownId && !e.damaged) continue;
      // Active and incomplete archives reserve both participants, including against parent Merge Undo.
      requireSafe(complete(e), e.damaged ? "storage" : "archive_active");
    }
  }
  /** The sole mtime exception: full immutable binding plus all three verified receipts. */
  async restoration(parent: MergeRecord, snapshot?: JournalSnapshot): Promise<ArchiveRestoration | undefined> {
    const entries = snapshot?.archive ?? await this.journal.entries();
    requireSafe(!entries.some(e => e.scope === "global"), "archive_chain");
    const linked = entries.filter(e => e.record?.parent.id === parent.id);
    if (!linked.length) return undefined;
    requireSafe(linked.length === 1, "archive_chain");
    const e = linked[0];
    requireSafe(e.record && exact(e.record.parent, parent) && !e.damaged, "archive_chain");
    requireSafe(complete(e), e.receipts.some(m => m.state === "applied") && !e.receipts.some(m => m.state === "undone") ? "archive_active" : "archive_chain");
    const original = (snapshot?.merge ?? await this.mergeJournal.entries()).find(m => m.id === parent.id);
    requireSafe(original && !original.damaged && exact(original.record, parent) &&
      original.receipts.some(m => exact(m, e.record!.plan.provenance.receipt)), "archive_chain");
    return { archiveId: e.id, modified: e.receipts.find(m => m.state === "undone")!.modified, evidence: JSON.stringify(e) };
  }
  private async inspect(e: ArchiveEntry, snapshot?: JournalSnapshot): Promise<ArchiveHistory> {
    const row: ArchiveHistory = { ...e, state: "conflict", recovered: false, canUndo: false, editorBlocked: false, parentUndo: "chain_incomplete" };
    const r = e.record; if (!r) return row;
    const p = r.plan, c = await this.port.read(p.canonical.path), s = await this.port.read(p.secondary.path);
    if (!s || s.path !== p.secondary.path || s.file.stat.ctime !== p.secondary.created) return row;
    const applied = e.receipts.find(m => m.state === "applied"), intent = e.receipts.find(m => m.state === "undo_intent"), undone = e.receipts.find(m => m.state === "undone");
    if (s.content === p.secondary.before && s.bytes === p.secondary.bytes) {
      if (intent && (!undone || undone.modified === s.modified)) { row.state = "undone"; row.recovered = !undone; }
      else if (!applied && !undone && s.modified === p.secondary.modified) row.state = "prepared";
    } else if (s.content === p.secondary.after && s.bytes === new TextEncoder().encode(s.content).length && !undone &&
      [applied, intent].every(m => !m || m.modified === s.modified && m.bytes === s.bytes)) {
      row.state = "applied"; row.recovered = !applied || !!intent; row.parentUndo = "undo_first";
    }
    let parentValid = false;
    try {
      await this.parent(p, r.parent, snapshot);
      parentValid = !!c && c.path === p.canonical.path && c.file.stat.ctime === p.canonical.created && c.modified === p.canonical.modified &&
        c.bytes === p.canonical.bytes && c.content === p.canonical.content;
    } catch { /* Evidence remains visible when the parent is unavailable. */ }
    if (!parentValid && row.state !== "undone") { row.state = "conflict"; row.parentUndo = "parent_unavailable"; }
    for (const n of [c, s]) if (n) try { this.port.guard(n); } catch (error) {
      if (error instanceof SafeApplyError && error.reason === "editor") row.editorBlocked = true;
      else return { ...row, state: "conflict" };
    }
    if (row.state === "undone" && complete(e)) row.parentUndo = parentValid ? "merge_ready" : "parent_unavailable";
    row.canUndo = row.state === "applied" && parentValid && !e.damaged && !row.editorBlocked;
    return row;
  }
  history(): Promise<ArchiveHistory[]> {
    return this.owner.exclusive(async () => {
      const snapshot = await this.owner.history?.();
      const rows: ArchiveHistory[] = [];
      for (const e of snapshot?.archive ?? await this.journal.entries()) {
        const row = await this.inspect(e, snapshot);
        if (row.record && (row.canUndo || row.parentUndo === "merge_ready")) try {
          await this.owner.blockers([row.record.plan.canonical.path, row.record.plan.secondary.path], row.id, snapshot);
        } catch { row.canUndo = false; row.parentUndo = "chain_incomplete"; }
        rows.push(row);
      }
      return rows.sort((a, b) => (b.record?.createdAt ?? 0) - (a.record?.createdAt ?? 0));
    });
  }
  review(plan: ArchivePlan, current: () => boolean): Promise<ArchiveReview> {
    return this.owner.exclusive(async () => {
      this.owner.active(current); const snapshot = JSON.parse(JSON.stringify(plan)) as ArchivePlan, parent = await this.parent(snapshot);
      const first = await this.native.check(snapshot, parent), record = await archiveRecord(snapshot, parent);
      const paths = [snapshot.canonical.path, snapshot.secondary.path];
      await this.owner.blockers(paths);
      requireSafe(!(await this.journal.entries()).some(e => e.record?.parent.id === parent.id) && !await this.journal.has(record.id), "used");
      const checked = await this.native.check(snapshot, parent, first.notes);
      await this.owner.blockers(paths); await this.parent(snapshot, parent); this.owner.active(current); first.guard(); checked.guard();
      return this.ticket({ record, action: "apply", checked, current });
    });
  }
  reviewUndo(id: string, current: () => boolean): Promise<ArchiveReview> {
    return this.owner.exclusive(async () => {
      this.owner.active(current); const e = (await this.journal.entries()).find(row => row.id === id); requireSafe(e, "conflict");
      const row = await this.inspect(e); requireSafe(row.record && row.canUndo, row.editorBlocked ? "editor" : "conflict");
      const r = row.record, checked = await this.native.undo(r);
      await this.owner.blockers([r.plan.canonical.path, r.plan.secondary.path], id); await this.parent(r.plan, r.parent);
      requireSafe((await this.inspect(await this.intact(r))).canUndo, "conflict"); this.owner.active(current); checked.guard();
      return this.ticket({ record: r, action: "undo", checked, current });
    });
  }
  async execute(review: ArchiveReview): Promise<void> {
    const t = this.tickets.get(review); requireSafe(t, "used"); this.tickets.delete(review);
    await this.owner.exclusive(async () => {
      const r = t.record, p = r.plan, forward = t.action === "apply", paths = [p.canonical.path, p.secondary.path];
      this.owner.active(t.current); t.checked.guard(); await this.parent(p, r.parent);
      if (forward) {
        const checked = await this.native.check(p, r.parent, t.checked.notes);
        await this.owner.blockers(paths); this.owner.active(t.current); checked.guard();
        try { await this.journal.prepare(r); } catch (e) { throw e instanceof SafeApplyError ? e : new SafeApplyError("storage"); }
      } else {
        requireSafe((await this.inspect(await this.intact(r))).canUndo, "conflict");
        const checked = await this.native.undo(r, t.checked.notes);
        await this.owner.blockers(paths, r.id); await this.parent(p, r.parent); this.owner.active(t.current); checked.guard();
        try { await this.journal.mark(r, "undo_intent", checked.notes[1]); } catch { throw new SafeApplyError("storage"); }
      }
      const checked = forward ? await this.native.check(p, r.parent, t.checked.notes) : await this.native.undo(r, t.checked.notes);
      await this.owner.blockers(paths, r.id); await this.parent(p, r.parent);
      const entry = await this.intact(r);
      requireSafe(forward ? entry.receipts.length === 0 : !entry.receipts.some(m => m.state === "undone"), "conflict");
      t.checked.guard();
      const guard = () => { this.owner.active(t.current); checked.guard(); }; guard();
      try { await this.port.process(checked.notes[1], forward ? p.secondary.before : p.secondary.after, forward ? p.secondary.after : p.secondary.before, guard); }
      catch { throw new SafeApplyError("write"); }
      // Once dispatched, observe both saved files even if our own modification event invalidates the planner.
      const secondary = await this.port.read(p.secondary.path), canonical = await this.port.read(p.canonical.path);
      requireSafe(secondary && secondary.path === p.secondary.path && secondary.file === checked.notes[1].file && secondary.file.stat.ctime === p.secondary.created &&
        secondary.content === (forward ? p.secondary.after : p.secondary.before) && secondary.bytes === new TextEncoder().encode(secondary.content).length &&
        canonical && sameSavedNote(canonical, checked.notes[0]) && canonical.file.stat.ctime === p.canonical.created, "conflict");
      this.port.guard(secondary); this.port.guard(canonical);
      await this.parent(p, r.parent); await this.intact(r); await this.owner.blockers(paths, r.id);
      this.port.guard(secondary); this.port.guard(canonical);
      try { await this.journal.mark(r, forward ? "applied" : "undone", secondary); } catch { throw new SafeApplyError("storage"); }
    });
  }
}
