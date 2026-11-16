import type { SafeApplyPort, JournalSnapshot } from "./safeApply";
import type { MultiOwner } from "./multiFileApply";
import type { RegistryPort, RegistryCheck } from "./obsidianRegistry";
import type { RegistryPlan } from "./registryPlan";
import { localBytes } from "./localNotePlan";
import { RegistryJournal, registryRecord } from "./registryJournal";
import type { RegistryEntry, RegistryRecord } from "./registryJournal";
import { requireSafe, SafeApplyError } from "./operationJournal";

export interface RegistryHistory extends RegistryEntry {
  state: "prepared" | "applied" | "undone" | "conflict"; canUndo: boolean; recovered: boolean; blocking: boolean;
}
export interface RegistryReview { readonly id: string; readonly action: "apply" | "undo"; readonly record: RegistryRecord }
interface Ticket { record: RegistryRecord; action: "apply" | "undo"; current: () => boolean; checked: RegistryCheck }
export function registryPaths(r: RegistryRecord): string[] {
  return [r.plan.source.path];
}
/** One additional typed family under SafeApplyService's lock, never a general patch executor. */
export class RegistryApply {
  private readonly tickets = new Map<RegistryReview, Ticket>();
  constructor(private readonly journal: RegistryJournal, private readonly port: SafeApplyPort,
    private readonly native: RegistryPort, private readonly owner: MultiOwner) {}
  dispose(): void { this.tickets.clear(); }
  discard(review: RegistryReview): void { this.tickets.delete(review); }
  private ticket(t: Ticket): RegistryReview {
    const review = Object.freeze({ id: t.record.id, action: t.action, record: JSON.parse(JSON.stringify(t.record)) as RegistryRecord });
    this.tickets.set(review, t); return review;
  }
  private async inspect(entry: RegistryEntry): Promise<RegistryHistory> {
    const marked = (s: string) => entry.receipts.some(m => m.state === s);
    const row: RegistryHistory = { ...entry, state: "conflict", canUndo: false, recovered: false,
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
      try { const checked = await this.native.undo(r); checked.guard(); row.canUndo = true; } catch { /* Open or replaced source remains inspectable, never writable. */ }
    }
    return row;
  }
  async blockers(paths: readonly string[], ownId?: string, snapshot?: JournalSnapshot): Promise<void> {
    for (const e of snapshot?.registry ?? await this.journal.entries()) {
      if (e.id === ownId && e.record && !e.damaged) continue;
      requireSafe(e.scope !== "global", "storage");
      if (e.record && !registryPaths(e.record).some(p => paths.includes(p))) continue;
      requireSafe(!(await this.inspect(e)).blocking, "storage");
    }
  }
  history(): Promise<RegistryHistory[]> {
    return this.owner.exclusive(async () => {
      const snapshot = await this.owner.history?.(), rows: RegistryHistory[] = [];
      for (const e of snapshot?.registry ?? await this.journal.entries()) {
        const row = await this.inspect(e);
        if (row.canUndo && row.record) try { await this.owner.blockers(registryPaths(row.record), row.id, snapshot); }
        catch { row.canUndo = false; }
        rows.push(row);
      }
      return rows.sort((a, b) => (b.record?.createdAt ?? 0) - (a.record?.createdAt ?? 0));
    });
  }
  review(plan: RegistryPlan, current: () => boolean): Promise<RegistryReview> {
    return this.owner.exclusive(async () => {
      this.owner.active(current);
      const record = await registryRecord(plan), checked = await this.native.check(record.plan);
      await this.owner.blockers(registryPaths(record)); requireSafe(!await this.journal.has(record.id), "used");
      this.owner.active(current); checked.guard(); return this.ticket({ record, action: "apply", current, checked });
    });
  }
  private async intact(r: RegistryRecord): Promise<RegistryEntry> {
    const e = (await this.journal.entries()).find(e => e.id === r.id);
    requireSafe(e && !e.damaged && JSON.stringify(e.record) === JSON.stringify(r), "storage"); return e;
  }
  reviewUndo(id: string, current: () => boolean): Promise<RegistryReview> {
    return this.owner.exclusive(async () => {
      this.owner.active(current); const entry = (await this.journal.entries()).find(e => e.id === id); requireSafe(entry, "conflict");
      const row = await this.inspect(entry); requireSafe(row.canUndo && row.record, "conflict");
      await this.owner.blockers(registryPaths(row.record), id);
      const checked = await this.native.undo(row.record);
      this.owner.active(current); checked.guard(); return this.ticket({ record: row.record, action: "undo", current, checked });
    });
  }
  execute(review: RegistryReview): Promise<void> {
    const t = this.tickets.get(review); this.tickets.delete(review);
    return this.owner.exclusive(async () => {
      requireSafe(t, "used"); this.owner.active(t.current);
      const r = t.record, forward = t.action === "apply", paths = registryPaths(r);
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
      this.port.guard(saved); await this.intact(r); await this.owner.blockers(paths, r.id); this.port.guard(saved);
      try { await this.journal.mark(r, forward ? "applied" : "undone", saved); } catch { throw new SafeApplyError("storage"); }
      this.port.guard(saved); requireSafe(saved.file.stat.ctime === r.plan.source.created, "conflict");
      await this.native.committed(saved);
      this.port.guard(saved); requireSafe(saved.file.stat.ctime === r.plan.source.created, "conflict");
    });
  }
}
