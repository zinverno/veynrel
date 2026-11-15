import type { SafeApplyPort, JournalSnapshot } from "./safeApply";
import type { MultiOwner } from "./multiFileApply";
import type { LocalNotePort, LocalNoteCheck } from "./obsidianLocalNote";
import type { LocalNotePlan } from "./localNotePlan";
import { localBytes } from "./localNotePlan";
import { LocalNoteJournal, localNoteRecord } from "./localNoteJournal";
import type { LocalNoteEntry, LocalNoteRecord } from "./localNoteJournal";
import { requireSafe, SafeApplyError } from "./operationJournal";
import { sameSavedNote } from "./savedNote";

export interface LocalNoteHistory extends LocalNoteEntry {
  state: "prepared" | "applied" | "undone" | "conflict"; canUndo: boolean; recovered: boolean; blocking: boolean;
}
export interface LocalNoteReview { readonly id: string; readonly action: "apply" | "undo"; readonly record: LocalNoteRecord }
interface Ticket { record: LocalNoteRecord; action: "apply" | "undo"; current: () => boolean; checked: LocalNoteCheck }
export function localNotePaths(r: LocalNoteRecord): string[] {
  return [r.plan.source.path, ...(r.plan.choice.kind === "repair_wikilink" ? [r.plan.choice.target.path] : [])];
}
/** One additional typed family under SafeApplyService's lock, never a general patch executor. */
export class LocalNoteApply {
  private readonly tickets = new Map<LocalNoteReview, Ticket>();
  constructor(private readonly journal: LocalNoteJournal, private readonly port: SafeApplyPort,
    private readonly native: LocalNotePort, private readonly owner: MultiOwner) {}
  dispose(): void { this.tickets.clear(); }
  discard(review: LocalNoteReview): void { this.tickets.delete(review); }
  private ticket(t: Ticket): LocalNoteReview {
    const review = Object.freeze({ id: t.record.id, action: t.action, record: JSON.parse(JSON.stringify(t.record)) as LocalNoteRecord });
    this.tickets.set(review, t); return review;
  }
  private async inspect(entry: LocalNoteEntry): Promise<LocalNoteHistory> {
    const marked = (s: string) => entry.receipts.some(m => m.state === s);
    const row: LocalNoteHistory = { ...entry, state: "conflict", canUndo: false, recovered: false,
      blocking: entry.damaged || !entry.record || !marked("undone") && (!marked("applied") || marked("undo_intent")) };
    const r = entry.record; if (!r || entry.damaged) return row;
    const n = await this.port.read(r.plan.source.path);
    if (!n || n.file.stat.ctime !== r.plan.source.created || n.bytes !== localBytes(n.content)) return row;
    if (n.content === r.plan.source.content) {
      const undone = entry.receipts.find(m => m.state === "undone");
      if (marked("undo_intent") && (!undone || undone.modified === n.modified)) { row.state = "undone"; row.recovered = !undone; }
      else if (!entry.receipts.length && n.modified === r.plan.source.modified) row.state = "prepared";
    }
    if (n.content === r.plan.after && !marked("undone") && entry.receipts.every(m => m.modified === n.modified && m.bytes === n.bytes)) {
      row.state = "applied"; row.recovered = !marked("applied") || marked("undo_intent");
      try { this.port.guard(n); row.canUndo = true; } catch { /* Open or replaced source remains inspectable, never writable. */ }
    }
    return row;
  }
  async blockers(paths: readonly string[], ownId?: string, snapshot?: JournalSnapshot): Promise<void> {
    for (const e of snapshot?.localNote ?? await this.journal.entries()) {
      if (e.id === ownId && e.record && !e.damaged) continue;
      requireSafe(e.scope !== "global", "storage");
      if (e.record && !localNotePaths(e.record).some(p => paths.includes(p))) continue;
      requireSafe(!(await this.inspect(e)).blocking, "storage");
    }
  }
  history(): Promise<LocalNoteHistory[]> {
    return this.owner.exclusive(async () => {
      const snapshot = await this.owner.history?.(), rows: LocalNoteHistory[] = [];
      for (const e of snapshot?.localNote ?? await this.journal.entries()) {
        const row = await this.inspect(e);
        if (row.canUndo && row.record) try { await this.owner.blockers(localNotePaths(row.record), row.id, snapshot); }
        catch { row.canUndo = false; }
        rows.push(row);
      }
      return rows.sort((a, b) => (b.record?.createdAt ?? 0) - (a.record?.createdAt ?? 0));
    });
  }
  review(plan: LocalNotePlan, current: () => boolean): Promise<LocalNoteReview> {
    return this.owner.exclusive(async () => {
      this.owner.active(current);
      const record = await localNoteRecord(plan), checked = await this.native.check(record.plan);
      await this.owner.blockers(localNotePaths(record)); requireSafe(!await this.journal.has(record.id), "used");
      this.owner.active(current); checked.guard(); return this.ticket({ record, action: "apply", current, checked });
    });
  }
  private async intact(r: LocalNoteRecord): Promise<LocalNoteEntry> {
    const e = (await this.journal.entries()).find(e => e.id === r.id);
    requireSafe(e && !e.damaged && JSON.stringify(e.record) === JSON.stringify(r), "storage"); return e;
  }
  reviewUndo(id: string, current: () => boolean): Promise<LocalNoteReview> {
    return this.owner.exclusive(async () => {
      this.owner.active(current); const entry = (await this.journal.entries()).find(e => e.id === id); requireSafe(entry, "conflict");
      const row = await this.inspect(entry); requireSafe(row.canUndo && row.record, "conflict");
      await this.owner.blockers(localNotePaths(row.record), id);
      const checked = await this.native.undo(row.record);
      this.owner.active(current); checked.guard(); return this.ticket({ record: row.record, action: "undo", current, checked });
    });
  }
  execute(review: LocalNoteReview): Promise<void> {
    const t = this.tickets.get(review); this.tickets.delete(review);
    return this.owner.exclusive(async () => {
      requireSafe(t, "used"); this.owner.active(t.current);
      const r = t.record, forward = t.action === "apply", paths = localNotePaths(r);
      await this.owner.blockers(paths, forward ? undefined : r.id);
      t.checked.guard();
      if (forward) {
        await this.native.check(r.plan, t.checked.notes);
        try { await this.journal.prepare(r); } catch (e) { throw e instanceof SafeApplyError ? e : new SafeApplyError("storage"); }
      } else {
        requireSafe((await this.inspect(await this.intact(r))).canUndo, "conflict");
        const checked = await this.native.undo(r, t.checked.notes);
        this.owner.active(t.current); checked.guard();
        try { await this.journal.mark(r, "undo_intent", checked.notes[0]); } catch { throw new SafeApplyError("storage"); }
      }
      await this.owner.blockers(paths, r.id);
      const checked = forward ? await this.native.check(r.plan, t.checked.notes) : await this.native.undo(r, t.checked.notes);
      const entry = await this.intact(r);
      requireSafe(forward ? entry.receipts.length === 0 : (await this.inspect(entry)).canUndo, "conflict");
      await this.owner.blockers(paths, r.id);
      t.checked.guard(); const guard = () => { this.owner.active(t.current); checked.guard(); }; guard();
      try { await this.port.process(checked.notes[0], forward ? r.plan.source.content : r.plan.after, forward ? r.plan.after : r.plan.source.content, guard); }
      catch { throw new SafeApplyError("write"); }
      // Observe an already dispatched write even when its own event revoked the UI lifetime.
      const saved = await this.port.read(r.plan.source.path);
      requireSafe(saved && saved.file === checked.notes[0].file && saved.file.stat.ctime === r.plan.source.created &&
        saved.content === (forward ? r.plan.after : r.plan.source.content) && saved.bytes === localBytes(saved.content), "conflict");
      for (const target of checked.notes.slice(1)) {
        const now = await this.port.read(target.path); requireSafe(now && sameSavedNote(now, target), "conflict"); this.port.guard(now);
      }
      this.port.guard(saved); await this.intact(r); await this.owner.blockers(paths, r.id); this.port.guard(saved);
      try { await this.journal.mark(r, forward ? "applied" : "undone", saved); } catch { throw new SafeApplyError("storage"); }
    });
  }
}
