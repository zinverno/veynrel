import type { SavedNote } from "./savedNote";
import { sameSavedNote } from "./savedNote";
import type { ChangePlan } from "./changePlan";
import type { RelationshipAnalysis } from "./relationshipSession";
import { OperationJournal, SafeApplyError, requireSafe, checksum } from "./operationJournal";
import type { JournalEntry, OperationRecord, OperationState, ResolutionRecord } from "./operationJournal";

export interface SafeApplyPort {
  check(plan: ChangePlan, analysis: RelationshipAnalysis): Promise<() => void>;
  read(path: string): Promise<SavedNote | null>;
  guard(note: SavedNote): void;
  process(note: SavedNote, before: string, after: string, guard: () => void): Promise<void>;
}
export interface OperationHistory extends JournalEntry {
  state: OperationState | "resolved"; recovered: boolean; canUndo: boolean; canResolve: boolean;
  sourceState: "before" | "after" | "different" | "missing" | "identity" | "unknown";
  editorBlocked: boolean;
}
export interface ApplyReview { readonly id: string; readonly before: string; readonly after: string; readonly sourcePath: string }
export interface ResolutionReview { readonly row: OperationHistory }
interface Ticket { record: OperationRecord; plan?: ChangePlan; analysis?: RelationshipAnalysis; source?: SavedNote; current: () => boolean }

/** One plugin-wide owner. No work at construction; no retries and no automatic Markdown recovery. */
export class SafeApplyService {
  private busy = false;
  private closed = false;
  private readonly tickets = new Map<ApplyReview, Ticket>();
  private readonly resolutions = new Map<ResolutionReview, { entry: JournalEntry; source: SavedNote; current: () => boolean }>();
  constructor(private readonly journal: OperationJournal, private readonly port: SafeApplyPort) {}
  dispose(): void { this.closed = true; this.tickets.clear(); this.resolutions.clear(); }
  discard(review: ApplyReview): void { this.tickets.delete(review); }
  discardResolution(review: ResolutionReview): void { this.resolutions.delete(review); }
  private async checkBlockers(paths: readonly string[]): Promise<void> {
    const blocked = (await this.journal.entries()).some(entry => !entry.resolution && entry.damaged &&
      (entry.scope === "global" || !entry.record || paths.includes(entry.record.sourcePath) || paths.includes(entry.record.targetPath)));
    requireSafe(!blocked, "storage");
  }
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
      await this.checkBlockers([record.sourcePath, record.targetPath]);
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
      await this.checkBlockers([record.sourcePath, record.targetPath]);
      try { await this.journal.prepare(record); } catch (error) { throw error instanceof SafeApplyError ? error : new SafeApplyError("storage"); }
      // A journal write can take time; re-read both sources and structure after it, too.
      await this.checkBlockers([record.sourcePath, record.targetPath]);
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
    const result: OperationHistory = { ...entry, state: entry.resolution ? "resolved" : "conflict", recovered: false, canUndo: false,
      canResolve: false, sourceState: "unknown", editorBlocked: false };
    const r = entry.record;
    if (!r || entry.scope === "global") return result;
    const source = await this.port.read(r.sourcePath);
    if (!source) { result.sourceState = "missing"; return result; }
    if (source.path !== r.sourcePath || source.file.stat.ctime !== r.sourceCreated) { result.sourceState = "identity"; return result; }
    result.sourceState = source.content === r.before ? "before" : source.content === r.after ? "after" : "different";
    try { this.port.guard(source); } catch (error) {
      if (error instanceof SafeApplyError && error.reason === "editor") result.editorBlocked = true;
      else { result.sourceState = "identity"; return result; }
    }
    result.canResolve = entry.damaged && !entry.resolution && entry.scope === "local" && entry.evidence.length === 5 &&
      !entry.issues.some(issue => issue.code === "unknown" || issue.code === "unreadable") &&
      (result.sourceState === "before" || result.sourceState === "after") && !result.editorBlocked;
    if (entry.damaged || entry.resolutionAttempts.length) return result;
    const pending = entry.marks.includes("undo_pending"), undone = entry.marks.includes("undone"), applied = entry.marks.includes("applied");
    if (source.content === r.after && !undone) {
      result.state = "applied"; result.recovered = !applied || pending;
      result.canUndo = !result.editorBlocked;
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
  async reviewResolution(id: string, current: () => boolean): Promise<ResolutionReview> {
    return this.exclusive(async () => {
      this.active(current);
      const entry = (await this.journal.entries()).find(item => item.id === id); requireSafe(entry, "conflict");
      const row = await this.inspect(entry); requireSafe(row.canResolve && row.record, "conflict");
      const source = await this.port.read(row.record.sourcePath);
      requireSafe(source && source.file.stat.ctime === row.record.sourceCreated &&
        source.content === (row.sourceState === "before" ? row.record.before : row.record.after), "conflict");
      this.port.guard(source); this.active(current);
      // Keep the authority separate from the public preview, as for Apply tickets.
      const review = Object.freeze({ row: JSON.parse(JSON.stringify(row)) as OperationHistory });
      this.resolutions.set(review, { entry, source, current }); return review;
    });
  }
  async resolve(review: ResolutionReview): Promise<void> {
    const ticket = this.resolutions.get(review); requireSafe(ticket, "used"); this.resolutions.delete(review);
    await this.exclusive(async () => {
      const { entry, source, current } = ticket, record = entry.record!;
      const recheck = async () => {
        this.active(current);
        const fresh = (await this.journal.entries()).find(item => item.id === entry.id);
        requireSafe(fresh && !fresh.resolution && fresh.scope === "local" && fresh.evidenceHash === entry.evidenceHash &&
          JSON.stringify(fresh.record) === JSON.stringify(record) &&
          !fresh.issues.some(issue => issue.code === "unknown" || issue.code === "unreadable"), "conflict");
        const saved = await this.port.read(record.sourcePath);
        requireSafe(saved && saved.file.stat.ctime === record.sourceCreated && sameSavedNote(saved, source), "conflict");
        this.port.guard(saved); this.active(current);
      };
      await recheck();
      const receipt: ResolutionRecord = {
        version: 1, operationId: entry.id, attempt: crypto.randomUUID(), decision: "acknowledge_verified_state", confirmedAt: Date.now(),
        recordHash: await checksum(JSON.stringify(record)), evidence: entry.evidence, evidenceHash: entry.evidenceHash,
        source: { path: source.path, created: record.sourceCreated, modified: source.modified, bytes: source.bytes,
          hash: await checksum(source.content), state: source.content === record.before ? "before" : "after" },
      };
      try { await this.journal.resolve(receipt, recheck, () => {
        this.active(current); requireSafe(source.file.stat.ctime === record.sourceCreated, "conflict"); this.port.guard(source);
      }); }
      catch (error) { throw error instanceof SafeApplyError ? error : new SafeApplyError("storage"); }
    });
  }
  async reviewUndo(id: string, current: () => boolean): Promise<ApplyReview> {
    return this.exclusive(async () => {
      const entry = (await this.journal.entries()).find(item => item.id === id); requireSafe(entry, "conflict");
      const row = await this.inspect(entry); requireSafe(row.canUndo && row.record, "conflict");
      await this.checkBlockers([row.record.sourcePath, row.record.targetPath]);
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
      requireSafe(entry && !entry.damaged && !entry.resolutionAttempts.length && !entry.marks.includes("undone") && JSON.stringify(entry.record) === JSON.stringify(r), "conflict");
      const fresh = await this.port.read(r.sourcePath);
      requireSafe(fresh && fresh.file === source!.file && fresh.content === r.after && fresh.modified === source!.modified && fresh.file.stat.ctime === r.sourceCreated, "conflict");
      const check = () => {
        this.active(current); requireSafe(fresh.file.stat.ctime === r.sourceCreated, "conflict"); this.port.guard(fresh);
      };
      await this.checkBlockers([r.sourcePath, r.targetPath]);
      check();
      try { await this.journal.mark(r, "undo_pending"); } catch { throw new SafeApplyError("storage"); }
      // Journal IO can reveal a new incident after consent, just as during Apply preparation.
      await this.checkBlockers([r.sourcePath, r.targetPath]);
      check();
      try { await this.port.process(fresh, r.after, r.before, check); }
      catch { throw new SafeApplyError("write"); }
      const saved = await this.port.read(r.sourcePath);
      requireSafe(saved && saved.file === fresh.file && saved.content === r.before, "conflict");
      try { await this.journal.mark(r, "undone"); } catch { throw new SafeApplyError("storage"); }
    });
  }
}
