import type { PlanNote } from "./changePlan";
import type { AtomizationPlanV2, EmptyAtomChoice } from "./emptyAtomPlan";
import type { RelationshipAnalysis } from "./relationshipSession";
import type { JournalSnapshot, SafeApplyPort } from "./safeApply";
import type { MultiOwner, ParticipantState } from "./multiFileApply";
import { checksum, requireSafe, SafeApplyError } from "./operationJournal";
import { EmptyAtomJournal, emptyAtomRecord } from "./emptyAtomJournal";
import type { EmptyAtomRecord, EmptyAtomEntry } from "./emptyAtomJournal";

export type AtomParticipants = readonly [PlanNote, PlanNote, PlanNote];
export interface EmptyAtomCheck { notes: AtomParticipants; guard(): void }
export interface EmptyAtomPort {
  plan(analysis: RelationshipAnalysis, choice: EmptyAtomChoice): Promise<{ plan: AtomizationPlanV2; checked: EmptyAtomCheck }>;
  check(plan: AtomizationPlanV2, analysis: RelationshipAnalysis, pinned?: AtomParticipants): Promise<EmptyAtomCheck>;
  undo(record: EmptyAtomRecord, pinned?: AtomParticipants): Promise<EmptyAtomCheck>;
  finish(record: EmptyAtomRecord, before: AtomParticipants, forward: boolean): Promise<EmptyAtomCheck>;
}
export interface EmptyAtomHistory extends EmptyAtomEntry {
  state: "prepared" | "applied" | "undone" | "conflict"; targetState: ParticipantState; sourcesUnchanged: boolean;
  editorBlocked: boolean; canUndo: boolean; recovered: boolean; blocking: boolean;
}
export interface EmptyAtomReview { readonly id: string; readonly action: "apply" | "undo"; readonly record: EmptyAtomRecord }
interface Ticket { record: EmptyAtomRecord; action: EmptyAtomReview["action"]; current: () => boolean; checked: EmptyAtomCheck; analysis?: RelationshipAnalysis }
const paths = (r: EmptyAtomRecord) => [r.plan.target.path, ...r.plan.sources.map(n => n.path)];

/** Seventh family under the existing owner. Only the preexisting target reaches process(). */
export class EmptyAtomApply {
  private readonly tickets = new Map<EmptyAtomReview, Ticket>();
  constructor(private readonly journal: EmptyAtomJournal, private readonly port: SafeApplyPort,
    private readonly native: EmptyAtomPort, private readonly owner: MultiOwner) {}
  dispose(): void { this.tickets.clear(); }
  discard(review: EmptyAtomReview): void { this.tickets.delete(review); }
  private ticket(t: Ticket): EmptyAtomReview {
    const review = Object.freeze({ id: t.record.id, action: t.action, record: JSON.parse(JSON.stringify(t.record)) as EmptyAtomRecord });
    this.tickets.set(review, t); return review;
  }
  private async inspect(entry: EmptyAtomEntry): Promise<EmptyAtomHistory> {
    const applied = entry.receipts.find(m => m.state === "applied"), undone = entry.receipts.find(m => m.state === "undone"), intent = entry.receipts.find(m => m.state === "undo_intent");
    const row: EmptyAtomHistory = { ...entry, state: "conflict", targetState: "missing", sourcesUnchanged: false,
      editorBlocked: false, canUndo: false, recovered: false,
      blocking: !entry.record || entry.damaged || !undone && (!applied || !!intent) };
    const r = entry.record; if (!r) return row;
    const target = await this.port.read(r.plan.target.path);
    row.targetState = !target ? "missing" : target.file.stat.ctime !== r.plan.target.created ? "identity" :
      target.content === "" ? "before" : target.content === r.plan.target.after ? "after" : "different";
    row.sourcesUnchanged = true;
    for (const [i, source] of r.plan.sources.entries()) {
      const n = await this.port.read(source.path);
      if (!n || n.file.stat.ctime !== source.created || n.modified !== source.modified || n.bytes !== source.bytes || n.content !== source.markdown || await checksum(n.content) !== r.hashes.sources[i]) row.sourcesUnchanged = false;
      if (n) try { this.port.guard(n); } catch (e) { if (e instanceof SafeApplyError && e.reason === "editor") row.editorBlocked = true; else row.sourcesUnchanged = false; }
    }
    if (target) try { this.port.guard(target); } catch (e) { if (e instanceof SafeApplyError && e.reason === "editor") row.editorBlocked = true; else row.targetState = "identity"; }
    if (row.targetState === "before" && target?.modified === (undone?.modified ?? r.plan.target.modified)) row.state = undone ? "undone" : !applied && !intent ? "prepared" : "conflict";
    if (row.targetState === "after" && applied && !undone && target?.modified === applied.modified && target.bytes === applied.bytes && row.sourcesUnchanged) row.state = "applied";
    row.recovered = row.targetState === "after" && (!applied || !!intent) || row.targetState === "before" && !!intent && !undone;
    // Missing/torn receipts never authorize clearing a coincidentally matching existing file.
    row.canUndo = row.state === "applied" && !entry.damaged && !row.editorBlocked && !intent;
    return row;
  }
  async blockers(touched: readonly string[], ownId?: string, snapshot?: JournalSnapshot): Promise<void> {
    for (const entry of snapshot?.emptyAtom ?? await this.journal.entries()) {
      if (entry.id === ownId && entry.record && !entry.damaged) continue;
      requireSafe(entry.scope !== "global", "storage");
      if (entry.record && !paths(entry.record).some(p => touched.includes(p))) continue;
      const row = await this.inspect(entry);
      requireSafe(!row.blocking, "storage");
    }
  }
  history(): Promise<EmptyAtomHistory[]> {
    return this.owner.exclusive(async () => {
      const snapshot = await this.owner.history?.(), rows: EmptyAtomHistory[] = [];
      for (const entry of snapshot?.emptyAtom ?? await this.journal.entries()) {
        const row = await this.inspect(entry);
        if (row.canUndo && row.record) try { await this.owner.blockers(paths(row.record), row.id, snapshot); await this.native.undo(row.record); }
        catch { row.canUndo = false; }
        rows.push(row);
      }
      return rows.sort((a,b) => (b.record?.createdAt ?? 0) - (a.record?.createdAt ?? 0));
    });
  }
  review(plan: AtomizationPlanV2, analysis: RelationshipAnalysis, current: () => boolean): Promise<EmptyAtomReview> {
    return this.owner.exclusive(async () => {
      this.owner.active(current); const copy = JSON.parse(JSON.stringify(plan)) as AtomizationPlanV2;
      const first = await this.native.check(copy, analysis), record = await emptyAtomRecord(copy);
      await this.owner.blockers(paths(record)); requireSafe(!await this.journal.has(record.id), "used");
      const checked = await this.native.check(copy, analysis, first.notes);
      await this.owner.blockers(paths(record)); this.owner.active(current); first.guard(); checked.guard();
      return this.ticket({ record, action: "apply", current, checked, analysis });
    });
  }
  private async intact(r: EmptyAtomRecord): Promise<EmptyAtomEntry> {
    const entry = (await this.journal.entries()).find(e => e.id === r.id);
    requireSafe(entry && !entry.damaged && JSON.stringify(entry.record) === JSON.stringify(r), "storage"); return entry;
  }
  reviewUndo(id: string, current: () => boolean): Promise<EmptyAtomReview> {
    return this.owner.exclusive(async () => {
      this.owner.active(current); const entry = (await this.journal.entries()).find(e => e.id === id); requireSafe(entry, "conflict");
      const row = await this.inspect(entry); requireSafe(row.record && row.canUndo, row.editorBlocked ? "editor" : "conflict");
      const record = row.record; await this.owner.blockers(paths(record), id);
      const checked = await this.native.undo(record);
      requireSafe((await this.inspect(await this.intact(record))).canUndo, "conflict");
      await this.owner.blockers(paths(record), id); this.owner.active(current); checked.guard();
      return this.ticket({ record, action: "undo", current, checked });
    });
  }
  async execute(review: EmptyAtomReview): Promise<void> {
    const t = this.tickets.get(review); requireSafe(t, "used"); this.tickets.delete(review);
    await this.owner.exclusive(async () => {
      const r=t.record, forward=t.action==="apply", touched=paths(r);
      this.owner.active(t.current); t.checked.guard();
      if (forward) {
        await this.native.check(r.plan,t.analysis!,t.checked.notes); await this.owner.blockers(touched); this.owner.active(t.current);
        try { await this.journal.prepare(r); } catch(e) { throw e instanceof SafeApplyError ? e : new SafeApplyError("storage"); }
      } else {
        requireSafe((await this.inspect(await this.intact(r))).canUndo,"conflict");
        const checked=await this.native.undo(r,t.checked.notes);
        await this.owner.blockers(touched,r.id);this.owner.active(t.current);checked.guard();
        try { await this.journal.mark(r,"undo_intent",checked.notes[0]); } catch { throw new SafeApplyError("storage"); }
      }
      await this.intact(r); await this.owner.blockers(touched,r.id);
      const checked=forward ? await this.native.check(r.plan,t.analysis!,t.checked.notes) : await this.native.undo(r,t.checked.notes);
      await this.owner.blockers(touched,r.id);const entry=await this.intact(r);
      requireSafe(forward ? entry.receipts.length===0 : !entry.receipts.some(m=>m.state==="undone"),"conflict");
      t.checked.guard(); const guard=()=>{this.owner.active(t.current);checked.guard();};guard();
      try { await this.port.process(checked.notes[0],forward?"":r.plan.target.after,forward?r.plan.target.after:"",guard); }
      catch { throw new SafeApplyError("write"); }
      const saved=await this.native.finish(r,checked.notes,forward);
      requireSafe(await checksum(saved.notes[0].content)===(forward?r.hashes.after:r.hashes.before),"conflict");
      await this.intact(r);await this.owner.blockers(touched,r.id);saved.guard();
      try { await this.journal.mark(r,forward?"applied":"undone",saved.notes[0]); } catch { throw new SafeApplyError("storage"); }
      await this.intact(r);saved.guard();
    });
  }
}
