import type { SavedNote } from "./savedNote";
import type { ChangePlan } from "./changePlan";
import type { RelationshipAnalysis } from "./relationshipSession";
import { OperationJournal, SafeApplyError, requireSafe, checksum } from "./operationJournal";
import type { JournalEntry, OperationRecord, OperationState } from "./operationJournal";

export interface SafeApplyPort {
  check(plan: ChangePlan, analysis: RelationshipAnalysis): Promise<() => void>;
  read(path: string): Promise<SavedNote | null>;
  guard(note: SavedNote): void;
  process(note: SavedNote, before: string, after: string, guard: () => void): Promise<void>;
}
export interface OperationHistory extends JournalEntry { state: OperationState; recovered: boolean; canUndo: boolean }
export interface ApplyReview { readonly id: string; readonly before: string; readonly after: string; readonly sourcePath: string }
interface Ticket { record: OperationRecord; plan?: ChangePlan; analysis?: RelationshipAnalysis; source?: SavedNote; current: () => boolean }

/** One plugin-wide owner. No work at construction; no retries and no automatic Markdown recovery. */
export class SafeApplyService {
  private busy = false;
  private closed = false;
  private readonly tickets = new Map<ApplyReview, Ticket>();
  constructor(private readonly journal: OperationJournal, private readonly port: SafeApplyPort) {}
  dispose(): void { this.closed = true; this.tickets.clear(); }
  discard(review: ApplyReview): void { this.tickets.delete(review); }
  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    requireSafe(!this.closed, "cancelled"); requireSafe(!this.busy, "busy"); this.busy = true;
    try { return await work(); } finally { this.busy = false; }
  }
  private active(current: () => boolean): void { requireSafe(!this.closed && current(), "cancelled"); }
  private ticket(ticket: Ticket): ApplyReview {
    const { record: r } = ticket;
    const review = Object.freeze({ id: r.id, before: r.before, after: r.after, sourcePath: r.sourcePath });
    this.tickets.set(review, ticket); return review;
  }
  async review(plan: ChangePlan, analysis: RelationshipAnalysis, current: () => boolean): Promise<ApplyReview | null> {
    if (plan.operation === "no_change") return null;
    return this.exclusive(async () => {
      this.active(current);
      const check = await this.port.check(plan, analysis); check();
      requireSafe(plan.edit && plan.selection, "stale");
      const record: OperationRecord = {
        version: 1, state: "prepared", id: "", createdAt: Date.now(), operation: plan.operation as OperationRecord["operation"],
        sourcePath: plan.sourcePath, targetPath: plan.targetPath,
        sourceCreated: plan.source.file.stat.ctime, sourceModified: plan.source.modified,
        targetCreated: plan.target.file.stat.ctime, targetModified: plan.target.modified,
        before: plan.before, after: plan.after, beforeHash: await checksum(plan.before), afterHash: await checksum(plan.after), targetHash: await checksum(plan.target.content),
        selection: { ...plan.selection }, edit: { ...plan.edit },
      };
      // Stable reservation across windows/restarts; the same original plan cannot be replayed after undo.
      record.id = await checksum(JSON.stringify({ ...record, id: "", createdAt: 0 }));
      requireSafe(!(await this.journal.entries()).some(entry => entry.damaged), "storage");
      requireSafe(!await this.journal.has(record.id), "used");
      this.active(current); check();
      const snapshot = { ...plan, source: { ...plan.source }, target: { ...plan.target }, selection: { ...plan.selection }, edit: { ...plan.edit },
        affectedLinks: { ...plan.affectedLinks, preserved: plan.affectedLinks.preserved.map(ref => ({ ...ref })) } };
      return this.ticket({ record, plan: snapshot, analysis, current });
    });
  }
  async apply(review: ApplyReview): Promise<void> {
    const ticket = this.tickets.get(review); requireSafe(ticket?.plan && ticket.analysis, "used");
    this.tickets.delete(review);
    await this.exclusive(async () => {
      const { plan, analysis, record, current } = ticket;
      this.active(current);
      let check = await this.port.check(plan!, analysis!); this.active(current); check();
      requireSafe(!(await this.journal.entries()).some(entry => entry.damaged), "storage");
      try { await this.journal.prepare(record); } catch (error) { throw error instanceof SafeApplyError ? error : new SafeApplyError("storage"); }
      // A journal write can take time; re-read both sources and structure after it, too.
      check = await this.port.check(plan!, analysis!); this.active(current); check();
      try {
        await this.port.process(plan!.source, record.before, record.after, () => { this.active(current); check(); });
      } catch { throw new SafeApplyError("write"); }
      // Once process was issued, finish recording the truth even if its modal was closed.
      const saved = await this.port.read(record.sourcePath);
      requireSafe(saved && saved.file === plan!.source.file && saved.content === record.after, "conflict");
      try { await this.journal.mark(record, "applied"); } catch { throw new SafeApplyError("storage"); }
    });
  }
  private async inspect(entry: JournalEntry): Promise<OperationHistory> {
    const result: OperationHistory = { ...entry, state: "conflict", recovered: false, canUndo: false };
    const r = entry.record;
    if (!r || entry.damaged) return result;
    const source = await this.port.read(r.sourcePath);
    if (!source || source.file.stat.ctime !== r.sourceCreated) return result;
    const pending = entry.marks.includes("undo_pending"), undone = entry.marks.includes("undone"), applied = entry.marks.includes("applied");
    if (source.content === r.after && !undone) {
      result.state = "applied"; result.recovered = !applied || pending;
      try { this.port.guard(source); result.canUndo = true; } catch { /* View remains available; no automatic editor writes. */ }
    } else if (source.content === r.before) {
      result.state = pending ? "undone" : applied ? "conflict" : "prepared";
      result.recovered = pending && !undone;
    }
    return result;
  }
  async history(): Promise<OperationHistory[]> {
    return this.exclusive(async () => {
      const rows: OperationHistory[] = [];
      for (const entry of await this.journal.entries()) rows.push(await this.inspect(entry));
      return rows.sort((a, b) => (b.record?.createdAt ?? 0) - (a.record?.createdAt ?? 0));
    });
  }
  async reviewUndo(id: string, current: () => boolean): Promise<ApplyReview> {
    return this.exclusive(async () => {
      const entry = (await this.journal.entries()).find(item => item.id === id); requireSafe(entry, "conflict");
      const row = await this.inspect(entry); requireSafe(row.canUndo && row.record, "conflict");
      const source = await this.port.read(row.record.sourcePath);
      requireSafe(source?.content === row.record.after && source.file.stat.ctime === row.record.sourceCreated, "conflict");
      this.port.guard(source); this.active(current);
      return this.ticket({ record: row.record, source, current });
    });
  }
  async undo(review: ApplyReview): Promise<void> {
    const ticket = this.tickets.get(review); requireSafe(ticket?.source && !ticket.plan, "used"); this.tickets.delete(review);
    await this.exclusive(async () => {
      const { record: r, source, current } = ticket;
      this.active(current);
      const entry = (await this.journal.entries()).find(item => item.id === r.id);
      requireSafe(entry && !entry.damaged && !entry.marks.includes("undone") && JSON.stringify(entry.record) === JSON.stringify(r), "conflict");
      const fresh = await this.port.read(r.sourcePath);
      requireSafe(fresh && fresh.file === source!.file && fresh.content === r.after && fresh.modified === source!.modified && fresh.file.stat.ctime === r.sourceCreated, "conflict");
      this.port.guard(fresh);
      try { await this.journal.mark(r, "undo_pending"); } catch { throw new SafeApplyError("storage"); }
      this.active(current); this.port.guard(fresh);
      try { await this.port.process(fresh, r.after, r.before, () => { this.active(current); this.port.guard(fresh); }); }
      catch { throw new SafeApplyError("write"); }
      const saved = await this.port.read(r.sourcePath);
      requireSafe(saved && saved.file === fresh.file && saved.content === r.before, "conflict");
      try { await this.journal.mark(r, "undone"); } catch { throw new SafeApplyError("storage"); }
    });
  }
}
