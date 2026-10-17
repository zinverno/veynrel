import type { MergePlan } from "./mergePlan";
import type { RelationshipAnalysis } from "./relationshipSession";
import type { PlanPair } from "./changePlan";
import type { SafeApplyPort, JournalSnapshot } from "./safeApply";
import type { MultiOwner, ParticipantState } from "./multiFileApply";
import { sameSavedNote } from "./savedNote";
import { checksum, requireSafe, SafeApplyError } from "./operationJournal";
import { MergeJournal, mergeRecord } from "./mergeJournal";
import type { MergeEntry, MergeRecord } from "./mergeJournal";

export interface ArchiveRestoration { archiveId: string; modified: number; evidence: string }
export interface MergeCheck { notes: PlanPair; guard(): void; restoration?: ArchiveRestoration }
export interface MergePort {
  check(plan: MergePlan, analysis: RelationshipAnalysis, pinned?: PlanPair): Promise<MergeCheck>;
  undo(record: MergeRecord, pinned?: PlanPair, restoration?: ArchiveRestoration): Promise<MergeCheck>;
}
export interface MergeHistory extends MergeEntry {
  state: "prepared" | "applied" | "undone" | "conflict"; canonicalState: ParticipantState; secondaryUnchanged: boolean;
  editorBlocked: boolean; canUndo: boolean; recovered: boolean; blocking: boolean;
  archiveReason?: "archive_active" | "archive_chain";
}
export interface MergeReview { readonly id: string; readonly action: "apply" | "undo"; readonly record: MergeRecord }
interface Ticket { record: MergeRecord; action: MergeReview["action"]; current: () => boolean; checked: MergeCheck; plan?: MergePlan; analysis?: RelationshipAnalysis }

/** Shares SafeApplyService's execution lock. Only canonical is ever dispatched to process(). */
export class MergeApply {
  private readonly tickets = new Map<MergeReview, Ticket>();
  constructor(private readonly journal: MergeJournal, private readonly port: SafeApplyPort,
    private readonly native: MergePort, private readonly owner: MultiOwner,
    private readonly restored?: (record: MergeRecord, snapshot?: JournalSnapshot) => Promise<ArchiveRestoration | undefined>) {}
  dispose(): void { this.tickets.clear(); }
  discard(review: MergeReview): void { this.tickets.delete(review); }
  private ticket(t: Ticket): MergeReview {
    const review = Object.freeze({ id: t.record.id, action: t.action, record: JSON.parse(JSON.stringify(t.record)) as MergeRecord });
    this.tickets.set(review, t); return review;
  }
  private async inspect(entry: MergeEntry, snapshot?: JournalSnapshot): Promise<MergeHistory> {
    const row: MergeHistory = { ...entry, state: "conflict", canonicalState: "missing", secondaryUnchanged: false,
      editorBlocked: false, canUndo: false, recovered: false, blocking: true };
    const r = entry.record; if (!r) return row;
    const c = await this.port.read(r.canonical.path), s = await this.port.read(r.secondary.path);
    let restoration: ArchiveRestoration | undefined;
    try { restoration = await this.restored?.(r, snapshot); }
    catch (e) { row.archiveReason = e instanceof SafeApplyError && e.reason === "archive_active" ? "archive_active" : "archive_chain"; }
    row.canonicalState = !c ? "missing" : c.path !== r.canonical.path || c.file.stat.ctime !== r.canonical.created ? "identity" :
      c.content === r.canonical.before ? "before" : c.content === r.canonical.after ? "after" : "different";
    row.secondaryUnchanged = !row.archiveReason && !!s && s.path === r.secondary.path && s.file.stat.ctime === r.secondary.created && s.modified === (restoration?.modified ?? r.secondary.modified) &&
      s.bytes === r.secondary.bytes && s.content === r.secondary.content && await checksum(s.content) === r.secondary.hash;
    for (const note of [c, s]) if (note) try { this.port.guard(note); } catch (e) {
      if (e instanceof SafeApplyError && e.reason === "editor") row.editorBlocked = true;
      else return row;
    }
    const marked = (state: string) => entry.receipts.some(m => m.state === state);
    if (row.canonicalState === "before") row.state = marked("undo_intent") ? "undone" : marked("applied") || marked("undone") ? "conflict" : "prepared";
    if (row.canonicalState === "after" && !marked("undone")) row.state = "applied";
    const receiptChanged = entry.receipts.some(m => m.state !== "undone" && (m.modified !== c?.modified || m.bytes !== c?.bytes));
    if (!row.secondaryUnchanged || row.state === "applied" && receiptChanged) row.state = "conflict";
    row.recovered = row.state === "applied" && (!marked("applied") || marked("undo_intent")) || row.state === "undone" && !marked("undone");
    row.canUndo = row.state === "applied" && !entry.damaged && !row.editorBlocked;
    row.blocking = entry.damaged || !marked("undone") && (!marked("applied") || marked("undo_intent"));
    return row;
  }
  private async undoCheck(record: MergeRecord, pinned?: PlanPair): Promise<MergeCheck> {
    const restoration = await this.restored?.(record), checked = await this.native.undo(record, pinned, restoration);
    requireSafe(JSON.stringify(await this.restored?.(record)) === JSON.stringify(restoration), "archive_chain");
    return { ...checked, restoration };
  }
  private async verifyRestoration(record: MergeRecord, checked: MergeCheck): Promise<void> {
    requireSafe(JSON.stringify(await this.restored?.(record)) === JSON.stringify(checked.restoration), "archive_chain");
  }
  async blockers(paths: readonly string[], ownId?: string, snapshot?: JournalSnapshot): Promise<void> {
    for (const entry of snapshot?.merge ?? await this.journal.entries()) {
      if (entry.id === ownId && entry.record && !entry.damaged) continue;
      requireSafe(entry.scope !== "global", "storage");
      if (entry.record && !paths.includes(entry.record.canonical.path) && !paths.includes(entry.record.secondary.path)) continue;
      const row = await this.inspect(entry, snapshot), r = row.record;
      requireSafe(!row.blocking || row.scope !== "global" && r && !paths.includes(r.canonical.path) && !paths.includes(r.secondary.path), "storage");
    }
  }
  history(): Promise<MergeHistory[]> {
    return this.owner.exclusive(async () => {
      const snapshot = await this.owner.history?.();
      const rows: MergeHistory[] = [];
      for (const entry of snapshot?.merge ?? await this.journal.entries()) {
        const row = await this.inspect(entry, snapshot);
        if (row.canUndo && row.record) try { await this.owner.blockers([row.record.canonical.path, row.record.secondary.path], row.id, snapshot); }
        catch { row.canUndo = false; }
        rows.push(row);
      }
      return rows.sort((a, b) => (b.record?.createdAt ?? 0) - (a.record?.createdAt ?? 0));
    });
  }
  review(plan: MergePlan, analysis: RelationshipAnalysis, current: () => boolean): Promise<MergeReview> {
    return this.owner.exclusive(async () => {
      this.owner.active(current); const snapshot = JSON.parse(JSON.stringify(plan)) as MergePlan;
      let checked = await this.native.check(snapshot, analysis);
      const record = await mergeRecord(snapshot);
      await this.owner.blockers([record.canonical.path, record.secondary.path]); requireSafe(!await this.journal.has(record.id), "used");
      checked = await this.native.check(snapshot, analysis, checked.notes);
      await this.owner.blockers([record.canonical.path, record.secondary.path]);
      this.owner.active(current); checked.guard();
      return this.ticket({ record, action: "apply", current, checked, plan: snapshot, analysis });
    });
  }
  private async intact(r: MergeRecord): Promise<MergeEntry> {
    const entry = (await this.journal.entries()).find(e => e.id === r.id);
    requireSafe(entry && !entry.damaged && JSON.stringify(entry.record) === JSON.stringify(r), "storage"); return entry;
  }
  /** Read-only archive basis. Recovered text without a completed receipt is insufficient. */
  readApplied(id: string, current: () => boolean): Promise<MergeCheck & { record: MergeRecord; entry: MergeEntry; recordHash: string }> {
    return this.owner.exclusive(async () => {
      this.owner.active(current);
      const entry = (await this.journal.entries()).find(e => e.id === id); requireSafe(entry, "conflict");
      const completed = async (e: MergeEntry) => {
        const row = await this.inspect(e);
        requireSafe(row.record && row.canUndo && !row.recovered && !row.blocking && row.receipts.length > 0 &&
          row.receipts.every(m => m.state === "applied"), "conflict");
        return row.record;
      };
      const record = await completed(entry), checked = await this.native.undo(record);
      const recordHash = await checksum(JSON.stringify(record));
      await this.owner.blockers([record.canonical.path, record.secondary.path], id);
      const verified = await this.intact(record);
      requireSafe(JSON.stringify(entry) === JSON.stringify(verified), "stale");
      requireSafe(verified.receipts.every(m => m.modified === checked.notes[0].modified && m.bytes === checked.notes[0].bytes), "stale");
      this.owner.active(current); checked.guard();
      return { ...checked, record, entry: verified, recordHash };
    });
  }
  reviewUndo(id: string, current: () => boolean): Promise<MergeReview> {
    return this.owner.exclusive(async () => {
      this.owner.active(current); const entry = (await this.journal.entries()).find(e => e.id === id); requireSafe(entry, "conflict");
      const row = await this.inspect(entry); requireSafe(row.record && row.canUndo, row.archiveReason ?? (row.editorBlocked ? "editor" : "conflict"));
      const record = row.record;
      await this.owner.blockers([record.canonical.path, record.secondary.path], id);
      const checked = await this.undoCheck(record); this.owner.active(current); checked.guard();
      // Recheck receipt identity after asynchronous dependency reads, before presenting consent.
      requireSafe((await this.inspect(await this.intact(record))).canUndo, "conflict");
      await this.owner.blockers([record.canonical.path, record.secondary.path], id); await this.verifyRestoration(record, checked); this.owner.active(current); checked.guard();
      return this.ticket({ record, action: "undo", current, checked });
    });
  }
  async execute(review: MergeReview): Promise<void> {
    const t = this.tickets.get(review); requireSafe(t, "used"); this.tickets.delete(review);
    await this.owner.exclusive(async () => {
      const r = t.record, forward = t.action === "apply", paths = [r.canonical.path, r.secondary.path];
      this.owner.active(t.current); t.checked.guard();
      if (forward) {
        await this.native.check(t.plan!, t.analysis!, t.checked.notes); await this.owner.blockers(paths); this.owner.active(t.current);
        try { await this.journal.prepare(r); } catch (e) { throw e instanceof SafeApplyError ? e : new SafeApplyError("storage"); }
      } else {
        requireSafe((await this.inspect(await this.intact(r))).canUndo, "conflict");
        const checked = await this.undoCheck(r, t.checked.notes); await this.verifyRestoration(r, t.checked);
        await this.owner.blockers(paths, r.id); this.owner.active(t.current); checked.guard();
        try { await this.journal.mark(r, "undo_intent", checked.notes[0]); } catch { throw new SafeApplyError("storage"); }
      }
      await this.intact(r); await this.owner.blockers(paths, r.id);
      // Journal IO precedes a fresh two-source read and complete plan rebuild, including native structure.
      const checked = forward ? await this.native.check(t.plan!, t.analysis!, t.checked.notes) : await this.undoCheck(r, t.checked.notes);
      await this.intact(r); await this.owner.blockers(paths, r.id);
      if (!forward) {
        requireSafe((await this.inspect(await this.intact(r))).canUndo, "conflict");
        await this.verifyRestoration(r, t.checked);
      }
      t.checked.guard();
      const guard = () => { this.owner.active(t.current); checked.guard(); };
      guard();
      try { await this.port.process(checked.notes[0], forward ? r.canonical.before : r.canonical.after, forward ? r.canonical.after : r.canonical.before, guard); }
      catch { throw new SafeApplyError("write"); }
      // Finish observing an issued write even if its own vault event invalidated the planner.
      const saved = await this.port.read(r.canonical.path), secondary = await this.port.read(r.secondary.path);
      requireSafe(saved && saved.file === checked.notes[0].file && saved.file.stat.ctime === r.canonical.created &&
        saved.content === (forward ? r.canonical.after : r.canonical.before) && secondary && sameSavedNote(secondary, checked.notes[1]) &&
        secondary.file.stat.ctime === r.secondary.created, "conflict");
      try { await this.journal.mark(r, forward ? "applied" : "undone", saved); } catch { throw new SafeApplyError("storage"); }
    });
  }
}
