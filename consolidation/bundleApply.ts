import type { ContextBundlePlan } from "./contextBundlePlan";
import type { RelationshipAnalysis } from "./relationshipSession";
import type { PlanPair } from "./changePlan";
import type { SafeApplyPort, JournalSnapshot } from "./safeApply";
import type { MultiOwner, ParticipantState } from "./multiFileApply";
import { sameSavedNote } from "./savedNote";
import { checksum, requireSafe, SafeApplyError } from "./operationJournal";
import { BundleJournal, bundleRecord } from "./bundleJournal";
import type { BundleEntry, BundleRecord } from "./bundleJournal";

export interface BundleCheck { notes: PlanPair; guard(): void }
export interface BundlePort {
  check(plan: ContextBundlePlan, analysis: RelationshipAnalysis, pinned?: PlanPair): Promise<BundleCheck>;
  undo(record: BundleRecord, pinned?: PlanPair): Promise<BundleCheck>;
}
export interface BundleHistory extends BundleEntry {
  state: "prepared" | "applied" | "undone" | "conflict"; canonicalState: ParticipantState; secondaryUnchanged: boolean;
  editorBlocked: boolean; canUndo: boolean; recovered: boolean; blocking: boolean;
}
export interface BundleReview { readonly id: string; readonly action: "apply" | "undo"; readonly record: BundleRecord }
interface Ticket { record: BundleRecord; action: BundleReview["action"]; current: () => boolean; checked: BundleCheck; plan?: ContextBundlePlan; analysis?: RelationshipAnalysis }

/** Shares SafeApplyService's execution lock. Only canonical is ever dispatched to process(). */
export class BundleApply {
  private readonly tickets = new Map<BundleReview, Ticket>();
  constructor(private readonly journal: BundleJournal, private readonly port: SafeApplyPort,
    private readonly native: BundlePort, private readonly owner: MultiOwner) {}
  dispose(): void { this.tickets.clear(); }
  discard(review: BundleReview): void { this.tickets.delete(review); }
  private ticket(t: Ticket): BundleReview {
    const review = Object.freeze({ id: t.record.id, action: t.action, record: JSON.parse(JSON.stringify(t.record)) as BundleRecord });
    this.tickets.set(review, t); return review;
  }
  private async inspect(entry: BundleEntry): Promise<BundleHistory> {
    const row: BundleHistory = { ...entry, state: "conflict", canonicalState: "missing", secondaryUnchanged: false,
      editorBlocked: false, canUndo: false, recovered: false, blocking: true };
    const r = entry.record; if (!r) return row;
    const c = await this.port.read(r.plan.canonical.path), s = await this.port.read(r.plan.secondary.path);
    row.canonicalState = !c ? "missing" : c.path !== r.plan.canonical.path || c.file.stat.ctime !== r.plan.canonical.identity.created ? "identity" :
      c.content === r.plan.canonical.before ? "before" : c.content === r.plan.canonical.after ? "after" : "different";
    row.secondaryUnchanged = !!s && s.path === r.plan.secondary.path && s.file.stat.ctime === r.plan.secondary.identity.created && s.modified === r.plan.secondary.identity.modified &&
      s.bytes === r.plan.secondary.identity.bytes && s.content === r.plan.secondary.content && await checksum(s.content) === r.hashes.secondary;
    for (const note of [c, s]) if (note) try { this.port.guard(note); } catch (e) {
      if (e instanceof SafeApplyError && e.reason === "editor") row.editorBlocked = true;
      else return row;
    }
    const marked = (state: string) => entry.receipts.some(m => m.state === state);
    if (row.canonicalState === "before") {
      const undone = entry.receipts.find(m => m.state === "undone");
      row.state = marked("undo_intent") && (!undone || undone.modified === c?.modified) ? "undone" :
        !marked("applied") && !undone && c?.modified === r.plan.canonical.identity.modified ? "prepared" : "conflict";
    }
    if (row.canonicalState === "after" && !marked("undone")) row.state = "applied";
    const receiptChanged = entry.receipts.some(m => m.state !== "undone" && (m.modified !== c?.modified || m.bytes !== c?.bytes));
    if (!row.secondaryUnchanged || row.state === "applied" && receiptChanged) row.state = "conflict";
    row.recovered = row.state === "applied" && (!marked("applied") || marked("undo_intent")) || row.state === "undone" && !marked("undone");
    row.canUndo = row.state === "applied" && !entry.damaged && !row.editorBlocked;
    row.blocking = entry.damaged || row.state !== "undone" || !marked("undone");
    return row;
  }
  async blockers(paths: readonly string[], ownId?: string, snapshot?: JournalSnapshot): Promise<void> {
    for (const entry of snapshot?.bundle ?? await this.journal.entries()) {
      if (entry.id === ownId && entry.record && !entry.damaged) continue;
      requireSafe(entry.scope !== "global", "storage");
      if (entry.record && !paths.includes(entry.record.plan.canonical.path) && !paths.includes(entry.record.plan.secondary.path)) continue;
      const row = await this.inspect(entry), r = row.record;
      requireSafe(!row.blocking || row.scope !== "global" && r && !paths.includes(r.plan.canonical.path) && !paths.includes(r.plan.secondary.path), "storage");
    }
  }
  history(): Promise<BundleHistory[]> {
    return this.owner.exclusive(async () => {
      const snapshot = await this.owner.history?.();
      const rows: BundleHistory[] = [];
      for (const entry of snapshot?.bundle ?? await this.journal.entries()) {
        const row = await this.inspect(entry);
        if (row.canUndo && row.record) try { await this.owner.blockers([row.record.plan.canonical.path, row.record.plan.secondary.path], row.id, snapshot); }
        catch { row.canUndo = false; }
        rows.push(row);
      }
      return rows.sort((a, b) => (b.record?.createdAt ?? 0) - (a.record?.createdAt ?? 0));
    });
  }
  review(plan: ContextBundlePlan, analysis: RelationshipAnalysis, current: () => boolean): Promise<BundleReview> {
    return this.owner.exclusive(async () => {
      this.owner.active(current); const snapshot = JSON.parse(JSON.stringify(plan)) as ContextBundlePlan;
      let checked = await this.native.check(snapshot, analysis);
      const record = await bundleRecord(snapshot);
      await this.owner.blockers([record.plan.canonical.path, record.plan.secondary.path]); requireSafe(!await this.journal.has(record.id), "used");
      const first = checked; checked = await this.native.check(snapshot, analysis, checked.notes);
      await this.owner.blockers([record.plan.canonical.path, record.plan.secondary.path]);
      this.owner.active(current); first.guard(); checked.guard();
      return this.ticket({ record, action: "apply", current, checked, plan: snapshot, analysis });
    });
  }
  private async intact(r: BundleRecord): Promise<BundleEntry> {
    const entry = (await this.journal.entries()).find(e => e.id === r.id);
    requireSafe(entry && !entry.damaged && JSON.stringify(entry.record) === JSON.stringify(r), "storage"); return entry;
  }
  reviewUndo(id: string, current: () => boolean): Promise<BundleReview> {
    return this.owner.exclusive(async () => {
      this.owner.active(current); const entry = (await this.journal.entries()).find(e => e.id === id); requireSafe(entry, "conflict");
      const row = await this.inspect(entry); requireSafe(row.record && row.canUndo, row.editorBlocked ? "editor" : "conflict");
      const record = row.record;
      await this.owner.blockers([record.plan.canonical.path, record.plan.secondary.path], id);
      const checked = await this.native.undo(record); this.owner.active(current); checked.guard();
      // Recheck receipt identity after asynchronous dependency reads, before presenting consent.
      requireSafe((await this.inspect(await this.intact(record))).canUndo, "conflict");
      await this.owner.blockers([record.plan.canonical.path, record.plan.secondary.path], id); this.owner.active(current); checked.guard();
      return this.ticket({ record, action: "undo", current, checked });
    });
  }
  async execute(review: BundleReview): Promise<void> {
    const t = this.tickets.get(review); requireSafe(t, "used"); this.tickets.delete(review);
    await this.owner.exclusive(async () => {
      const r = t.record, forward = t.action === "apply", paths = [r.plan.canonical.path, r.plan.secondary.path];
      this.owner.active(t.current); t.checked.guard();
      if (forward) {
        await this.native.check(t.plan!, t.analysis!, t.checked.notes); await this.owner.blockers(paths); this.owner.active(t.current);
        try { await this.journal.prepare(r); } catch (e) { throw e instanceof SafeApplyError ? e : new SafeApplyError("storage"); }
      } else {
        requireSafe((await this.inspect(await this.intact(r))).canUndo, "conflict");
        const checked = await this.native.undo(r, t.checked.notes);
        await this.owner.blockers(paths, r.id); this.owner.active(t.current); checked.guard();
        try { await this.journal.mark(r, "undo_intent", checked.notes[0]); } catch { throw new SafeApplyError("storage"); }
      }
      await this.intact(r); await this.owner.blockers(paths, r.id);
      // Journal IO precedes a fresh two-source read and complete plan rebuild, including native structure.
      const checked = forward ? await this.native.check(t.plan!, t.analysis!, t.checked.notes) : await this.native.undo(r, t.checked.notes);
      if (!forward) requireSafe((await this.inspect(await this.intact(r))).canUndo, "conflict");
      await this.owner.blockers(paths, r.id);
      const entry = await this.intact(r);
      requireSafe(forward ? entry.receipts.length === 0 : !entry.receipts.some(m => m.state === "undone"), "conflict");
      t.checked.guard();
      const guard = () => { this.owner.active(t.current); checked.guard(); };
      guard();
      try { await this.port.process(checked.notes[0], forward ? r.plan.canonical.before : r.plan.canonical.after, forward ? r.plan.canonical.after : r.plan.canonical.before, guard); }
      catch { throw new SafeApplyError("write"); }
      // Finish observing an issued write even if its own vault event invalidated the planner.
      const saved = await this.port.read(r.plan.canonical.path), secondary = await this.port.read(r.plan.secondary.path);
      requireSafe(saved && saved.file === checked.notes[0].file && saved.file.stat.ctime === r.plan.canonical.identity.created &&
        saved.content === (forward ? r.plan.canonical.after : r.plan.canonical.before) && secondary && sameSavedNote(secondary, checked.notes[1]) &&
        secondary.file.stat.ctime === r.plan.secondary.identity.created, "conflict");
      requireSafe(saved.path === r.plan.canonical.path && saved.bytes === new TextEncoder().encode(saved.content).length, "conflict");
      this.port.guard(saved); this.port.guard(secondary);
      await this.intact(r); await this.owner.blockers(paths, r.id);
      this.port.guard(saved); this.port.guard(secondary);
      try { await this.journal.mark(r, forward ? "applied" : "undone", saved); } catch { throw new SafeApplyError("storage"); }
    });
  }
}
