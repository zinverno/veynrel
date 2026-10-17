import type { MultiFilePlan } from "./multiFilePlan";
import type { RelationshipAnalysis } from "./relationshipSession";
import type { SavedNote } from "./savedNote";
import { sameSavedNote } from "./savedNote";
import type { PlannerRead } from "./changePlannerSession";
import { requireSafe, SafeApplyError } from "./operationJournal";
import { MultiFileJournal, multiRecord } from "./multiFileJournal";
import type { MultiEntry, MultiRecord } from "./multiFileJournal";
import type { SafeApplyPort } from "./safeApply";

export type ParticipantState = "before" | "after" | "different" | "missing" | "identity";
export type MultiState = "prepared" | "partial" | "applied" | "undo_partial" | "undone" | "conflict";
export type MultiAction = "apply" | "undo" | "compensate" | "resume";
export interface MultiHistory extends MultiEntry {
  state: MultiState; participants: ParticipantState[]; editorBlocked: boolean; action?: Exclude<MultiAction, "apply">; recovered: boolean; blocking: boolean;
}
export interface MultiReview { readonly id: string; readonly action: MultiAction; readonly record: MultiRecord }
export interface MultiFilePort {
  review(plan: MultiFilePlan, analysis: RelationshipAnalysis): Promise<PlannerRead>;
  step(r: MultiRecord, expected: readonly ParticipantState[], pinned: readonly SavedNote[], baseline?: PlannerRead, next?: 0 | 1, analysis?: RelationshipAnalysis, written?: readonly boolean[]): Promise<{ notes: readonly SavedNote[]; guard(): void }>;
}
export interface MultiOwner {
  exclusive<T>(work: () => Promise<T>): Promise<T>;
  active(current?: () => boolean): void;
  blockers(paths: readonly string[], ownId?: string): Promise<void>;
}
interface Ticket { record: MultiRecord; action: MultiAction; current: () => boolean; notes: readonly SavedNote[]; plan?: MultiFilePlan; analysis?: RelationshipAnalysis; baseline?: PlannerRead }

/** Uses the single-file owner's lock, never a second busy flag. No startup recovery writes. */
export class MultiFileApply {
  private readonly tickets = new Map<MultiReview, Ticket>();
  constructor(private readonly journal: MultiFileJournal, private readonly port: SafeApplyPort,
    private readonly native: MultiFilePort, private readonly owner: MultiOwner) {}
  dispose(): void { this.tickets.clear(); }
  discard(review: MultiReview): void { this.tickets.delete(review); }
  private ticket(t: Ticket): MultiReview {
    const review = Object.freeze({ id: t.record.id, action: t.action, record: JSON.parse(JSON.stringify(t.record)) as MultiRecord });
    this.tickets.set(review, t); return review;
  }
  private async inspect(entry: MultiEntry): Promise<MultiHistory> {
    const row: MultiHistory = { ...entry, state: "conflict", participants: [], editorBlocked: false, recovered: false, blocking: true };
    if (!entry.record) return row;
    for (const f of entry.record.files) {
      const n = await this.port.read(f.path);
      row.participants.push(!n ? "missing" : n.path !== f.path || n.file.stat.ctime !== f.created ? "identity" :
        n.content === f.before ? "before" : n.content === f.after ? "after" : "different");
      if (n) try { this.port.guard(n); } catch (error) {
        if (error instanceof SafeApplyError && error.reason === "editor") row.editorBlocked = true;
        else row.participants[row.participants.length - 1] = "identity";
      }
    }
    if (entry.damaged) return row;
    const undo = entry.marks.includes("undo_intent") || entry.marks.includes("compensate_intent");
    const [a, b] = row.participants;
    const reversedThenEdited = (entry.marks.includes("undo_b") && b !== "before") || (entry.marks.includes("undo_a") && a !== "before");
    if (reversedThenEdited) { row.blocking = !entry.marks.includes("undone"); return row; }
    if (a === "after" && b === "after" && !entry.marks.includes("undone") && !entry.marks.includes("compensate_intent")) {
      row.state = "applied"; row.action = "undo"; row.recovered = !entry.marks.includes("applied") || undo;
    } else if (a === "after" && b === "before" && !entry.marks.includes("undone") && (undo || (!entry.marks.includes("applied") && !entry.marks.includes("apply_b")))) {
      row.state = undo ? "undo_partial" : "partial"; row.action = undo ? "resume" : "compensate"; row.recovered = true;
    } else if (a === "before" && b === "before") {
      row.state = undo ? "undone" : entry.marks.some(m => ["apply_a", "apply_b", "applied", "undone"].includes(m)) ? "conflict" : "prepared";
      row.recovered = undo && !entry.marks.includes("undone");
    }
    if (row.editorBlocked) row.action = undefined;
    // Later user edits invalidate Undo, not an already acknowledged terminal operation's neighbours.
    const terminal = entry.marks.includes("undone") || (entry.marks.includes("applied") && !undo);
    row.blocking = !terminal && ["conflict", "partial", "undo_partial", "prepared"].includes(row.state);
    return row;
  }
  async blockers(paths: readonly string[], ownId?: string): Promise<void> {
    for (const entry of await this.journal.entries()) {
      if (entry.id === ownId && entry.record && !entry.damaged) continue;
      requireSafe(entry.scope !== "global", "storage");
      if (entry.record && !entry.record.files.some(f => paths.includes(f.path))) continue;
      const row = await this.inspect(entry);
      requireSafe(!row.blocking || (row.scope !== "global" && row.record && !row.record.files.some(f => paths.includes(f.path))), "storage");
    }
  }
  history(): Promise<MultiHistory[]> {
    return this.owner.exclusive(async () => {
      const rows: MultiHistory[] = []; for (const entry of await this.journal.entries()) rows.push(await this.inspect(entry));
      return rows.sort((a, b) => (b.record?.createdAt ?? 0) - (a.record?.createdAt ?? 0));
    });
  }
  review(plan: MultiFilePlan, analysis: RelationshipAnalysis, current: () => boolean): Promise<MultiReview> {
    return this.owner.exclusive(async () => {
      this.owner.active(current); const snapshot = JSON.parse(JSON.stringify(plan)) as MultiFilePlan;
      const baseline = await this.native.review(snapshot, analysis), record = await multiRecord(snapshot);
      await this.owner.blockers(record.files.map(f => f.path)); requireSafe(!await this.journal.has(record.id), "used");
      const checked = await this.native.step(record, ["before", "before"], baseline.pair, baseline, 0, analysis);
      this.owner.active(current); checked.guard();
      return this.ticket({ record, action: "apply", current, notes: checked.notes, plan: snapshot, analysis, baseline });
    });
  }
  reviewUndo(id: string, current: () => boolean): Promise<MultiReview> {
    return this.owner.exclusive(async () => {
      this.owner.active(current);
      const entry = (await this.journal.entries()).find(e => e.id === id); requireSafe(entry, "conflict");
      const row = await this.inspect(entry); requireSafe(row.record && row.action, row.editorBlocked ? "editor" : "conflict");
      await this.owner.blockers(row.record.files.map(f => f.path), id);
      const notes = await this.readNotes(row.record);
      const checked = await this.native.step(row.record, row.participants, notes); checked.guard(); this.owner.active(current);
      return this.ticket({ record: row.record, action: row.action, current, notes: checked.notes });
    });
  }
  private async readNotes(r: MultiRecord): Promise<SavedNote[]> {
    const notes: SavedNote[] = [];
    for (const f of r.files) { const n = await this.port.read(f.path); requireSafe(n && n.file.stat.ctime === f.created, "conflict"); notes.push(n); }
    return notes;
  }
  private async intact(r: MultiRecord): Promise<MultiEntry> {
    const e = (await this.journal.entries()).find(entry => entry.id === r.id);
    requireSafe(e && !e.damaged && JSON.stringify(e.record) === JSON.stringify(r), "storage"); return e;
  }
  async execute(review: MultiReview): Promise<void> {
    const t = this.tickets.get(review); requireSafe(t, "used"); this.tickets.delete(review);
    await this.owner.exclusive(async () => {
      const r = t.record, paths = r.files.map(f => f.path), forward = t.action === "apply";
      this.owner.active(t.current);
      let notes = [...t.notes], expected: ParticipantState[] = forward || t.action === "undo" ? [forward ? "before" : "after", forward ? "before" : "after"] : ["after", "before"];
      if (forward) {
        const fresh = await this.native.review(t.plan!, t.analysis!);
        requireSafe(fresh.pair.every((n, i) => sameSavedNote(n, notes[i])), "stale");
        await this.owner.blockers(paths); this.owner.active(t.current);
        try { await this.journal.prepare(r); } catch (e) { throw e instanceof SafeApplyError ? e : new SafeApplyError("storage"); }
        // The analysis/current predicate is used only before the first dispatch. Our writes invalidate its UI.
        await this.native.review(t.plan!, t.analysis!);
      } else {
        const row = await this.inspect(await this.intact(r));
        requireSafe(row.action === t.action, row.editorBlocked ? "editor" : "conflict");
      }
      await this.intact(r);
      let checked = await this.native.step(r, expected, notes, forward ? t.baseline : undefined, forward ? 0 : undefined, t.analysis);
      await this.owner.blockers(paths, r.id); this.owner.active(t.current); checked.guard();
      if (!forward) {
        try { await this.journal.mark(r, t.action === "compensate" ? "compensate_intent" : "undo_intent"); }
        catch { throw new SafeApplyError("storage"); }
      }
      const order: readonly (0 | 1)[] = forward ? [0, 1] : t.action === "undo" ? [1, 0] : [0];
      let dispatched = false;
      const written = [false, false];
      for (const side of order) {
        await this.intact(r);
        checked = await this.native.step(r, expected, notes, forward ? t.baseline : undefined, forward ? side : undefined, t.analysis, written);
        await this.owner.blockers(paths, r.id);
        const guard = () => { this.owner.active(dispatched ? undefined : t.current); checked.guard(); };
        guard();
        const f = r.files[side];
        try {
          await this.port.process(checked.notes[side], forward ? f.before : f.after, forward ? f.after : f.before, guard);
          dispatched = true;
        } catch { throw new SafeApplyError("write"); }
        const saved = await this.port.read(f.path);
        requireSafe(saved && saved.file === notes[side].file && saved.file.stat.ctime === f.created && saved.content === (forward ? f.after : f.before), "conflict");
        notes[side] = saved; expected[side] = forward ? "after" : "before";
        written[side] = true;
        try { await this.journal.mark(r, forward ? side === 0 ? "apply_a" : "apply_b" : side === 0 ? "undo_a" : "undo_b"); }
        catch { throw new SafeApplyError("storage"); }
      }
      checked = await this.native.step(r, expected, notes, undefined, undefined, undefined, written); await this.owner.blockers(paths, r.id); this.owner.active(); checked.guard();
      try { await this.journal.mark(r, forward ? "applied" : "undone"); } catch { throw new SafeApplyError("storage"); }
    });
  }
}
