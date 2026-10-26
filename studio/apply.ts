import { checksum } from "../consolidation/operationJournal";
import { sameSavedNote } from "../consolidation/savedNote";
import { ensure, freeze, StudioError } from "./recipe";
import { StudioJournal } from "./journal";
import type { JournalEntry, MarkKind, StudioChange, StudioMark, StudioRecord } from "./journal";
import type { ApplyResult, ReviewSession, StudioNotePort, StudioSource } from "./ports";

export interface StudioHistoryRow {
  entry: JournalEntry; index: number; path: string;
  state: "applied" | "undone" | "skipped" | "conflict" | "unconfirmed" | "damaged";
  recovery?: "applied" | "undone" | "skipped";
  canUndo: boolean; reason?: string;
}
export interface UndoReview { id: string; index: number; path: string; before: string; after: string; action: "undo" | "recover"; recovery?: StudioHistoryRow["recovery"] }
interface UndoTicket { record: StudioRecord; note: StudioSource; evidence: string; review: UndoReview }
const markAt = (entry: JournalEntry, index: number, kind: MarkKind) => entry.marks.find(m => m.index === index && m.kind === kind);
const identity = (n: StudioSource, c: StudioChange) => n.path === c.path && n.created === c.created;
const receiptMatches = (n: StudioSource, m: StudioMark | undefined) => !!m && n.created === m.created && n.modified === m.modified && n.bytes === m.bytes;

export class StudioApply {
  private busy = false;
  private closed = false;
  private tickets = new Map<UndoReview, UndoTicket>();
  constructor(readonly journal: StudioJournal, private readonly port: StudioNotePort) {}
  dispose(): void { this.closed = true; this.tickets.clear(); }
  discard(review: UndoReview): void { this.tickets.delete(review); }
  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    ensure(!this.closed, "cancelled"); ensure(!this.busy, "busy"); this.busy = true;
    try { return await work(); } finally { this.busy = false; }
  }
  private async blockers(paths: readonly string[], own?: string): Promise<void> {
    const entries = await this.journal.entries();
    ensure(!entries.some(e => e.damaged), "storage");
    for (const e of entries) if (e.id !== own && e.record) for (let i = 0; i < e.record.changes.length; i++) {
      if (!paths.includes(e.record.changes[i].path)) continue;
      ensure(!(markAt(e, i, "apply-intent") && !markAt(e, i, "applied") && !markAt(e, i, "skipped")) &&
        !(markAt(e, i, "undo-intent") && !markAt(e, i, "undone")), "storage");
    }
  }
  private async fresh(expected: StudioSource): Promise<StudioSource> {
    const note = await this.port.read(expected.path);
    ensure(note && sameSavedNote(note, expected) && note.created === expected.created, "conflict"); this.port.writeGuard(note); return note;
  }
  apply(review: ReviewSession, sources: readonly StudioSource[], selected: readonly string[], active: () => boolean): Promise<readonly ApplyResult[]> {
    return this.exclusive(async () => {
      ensure(new Set(selected).size === selected.length && selected.length > 0 && selected.every(path => review.rows.some(r => r.path === path && r.status === "generated" && r.after !== null)), "scope");
      const results: ApplyResult[] = review.rows.map(r => ({ path: r.path, outcome: "skipped" }));
      const changes: StudioChange[] = [];
      for (const row of review.rows) {
        if (!selected.includes(row.path) || row.after === row.before) continue;
        const n = sources.find(n => n.path === row.path); ensure(n && n.content === row.before && row.after !== null, "stale");
        changes.push({ path: n.path, created: n.created, modified: n.modified, bytes: n.bytes, before: row.before, after: row.after,
          beforeHash: await checksum(row.before), afterHash: await checksum(row.after), action: row.action });
      }
      if (!changes.length || !active() || this.closed) return freeze(results);
      await this.blockers(changes.map(c => c.path));
      const record: StudioRecord = freeze({ schemaVersion: 1, operation: "studio_transform", id: review.id, createdAt: Date.now(),
        recipeId: review.recipeId, recipeVersion: review.recipeVersion, changes });
      if (!active() || this.closed) return freeze(results);
      try { await this.journal.prepare(record); }
      catch { for (const r of results) if (changes.some(c => c.path === r.path)) { r.outcome = "failed"; r.reason = "storage"; } return freeze(results); }
      for (let i = 0; i < changes.length; i++) {
        if (!active() || this.closed) break;
        const c = changes[i], result = results.find(r => r.path === c.path)!;
        let issued = false;
        try {
          const expected = sources.find(n => n.path === c.path)!;
          let note = await this.fresh(expected);
          await this.blockers([c.path], record.id); await this.journal.intact(record);
          ensure(active() && !this.closed, "cancelled");
          await this.journal.mark(record, i, "apply-intent", note);
          await this.blockers([c.path], record.id); await this.journal.intact(record);
          note = await this.fresh(expected);
          await this.journal.intact(record);
          const check = () => { ensure(active() && !this.closed, "cancelled"); this.port.writeGuard(note); };
          check(); issued = true;
          await this.port.process(note, c.before, c.after, check);
          // An issued write is always observed and journalled, even after cancellation/disposal.
          const saved = await this.port.read(c.path);
          ensure(saved && saved.file === note.file && identity(saved, c) && saved.content === c.after, "conflict");
          await this.journal.mark(record, i, "applied", saved); result.outcome = "applied";
        } catch (error) {
          const code = error instanceof StudioError ? error.code : "storage";
          result.outcome = issued ? "unconfirmed" : ["conflict", "editor", "source", "stale"].includes(code) ? "conflict" : code === "cancelled" ? "skipped" : "failed";
          result.reason = code;
          if (issued || result.outcome === "failed" || code === "cancelled") break;
        }
      }
      return freeze(results);
    });
  }
  private async inspect(entry: JournalEntry, index: number): Promise<StudioHistoryRow> {
    const c = entry.record!.changes[index], row: StudioHistoryRow = { entry, index, path: c.path, state: "conflict", canUndo: false };
    if (entry.damaged) { row.state = "damaged"; row.reason = "storage"; return row; }
    const n = await this.port.read(c.path);
    if (!n || !identity(n, c)) return row;
    const applied = markAt(entry, index, "applied"), intent = markAt(entry, index, "apply-intent"), undo = markAt(entry, index, "undo-intent"), undone = markAt(entry, index, "undone"), skipped = markAt(entry, index, "skipped");
    if (undone) { row.state = n.content === c.before && receiptMatches(n, undone) ? "undone" : "conflict"; return row; }
    if (skipped) { row.state = n.content === c.before && receiptMatches(n, skipped) ? "skipped" : "conflict"; return row; }
    if (undo && n.content === c.before) { row.state = "unconfirmed"; row.recovery = "undone"; }
    else if (applied && n.content === c.after && receiptMatches(n, applied)) { row.state = "applied"; row.canUndo = true; }
    else if (!applied && intent && n.content === c.after) { row.state = "unconfirmed"; row.recovery = "applied"; }
    else if (!applied && n.content === c.before && n.modified === c.modified && n.bytes === c.bytes) {
      row.state = intent ? "unconfirmed" : "skipped"; if (intent) row.recovery = "skipped";
    }
    try { this.port.writeGuard(n); await this.blockers([c.path], entry.id); }
    catch (e) { row.reason = e instanceof StudioError ? e.code : "storage"; row.canUndo = false; row.recovery = undefined; }
    return row;
  }
  history(): Promise<readonly StudioHistoryRow[]> {
    return this.exclusive(async () => {
      const rows: StudioHistoryRow[] = [];
      for (const entry of await this.journal.entries()) {
        if (!entry.record) rows.push({ entry, index: -1, path: "", state: "damaged", canUndo: false, reason: "storage" });
        else for (let i = 0; i < entry.record.changes.length; i++) rows.push(await this.inspect(entry, i));
      }
      return rows;
    });
  }
  reviewUndo(id: string, index: number, action: "undo" | "recover"): Promise<UndoReview> {
    return this.exclusive(async () => {
      const entry = (await this.journal.entries()).find(e => e.id === id); ensure(entry?.record && entry.record.changes[index], "storage");
      const row = await this.inspect(entry, index); ensure(action === "undo" ? row.canUndo : row.recovery, row.reason === "editor" ? "editor" : "conflict");
      const note = await this.port.read(row.path); ensure(note, "source"); this.port.writeGuard(note);
      const c = entry.record.changes[index];
      ensure(identity(note, c) && note.content === (action === "undo" || row.recovery === "applied" ? c.after : c.before), "conflict");
      const review: UndoReview = freeze({ id, index, path: c.path, before: note.content, after: action === "undo" ? c.before : note.content, action, ...(row.recovery ? { recovery: row.recovery } : {}) });
      this.tickets.set(review, { record: entry.record, note, evidence: JSON.stringify(entry), review }); return review;
    });
  }
  executeUndo(review: UndoReview): Promise<void> {
    const ticket = this.tickets.get(review); ensure(ticket, "used"); this.tickets.delete(review);
    return this.exclusive(async () => {
      const r = ticket.record, index = review.index, c = r.changes[index];
      const entry = await this.journal.intact(r); ensure(JSON.stringify(entry) === ticket.evidence, "stale");
      await this.blockers([c.path], r.id); let note = await this.fresh(ticket.note);
      const row = await this.inspect(entry, index);
      ensure(review.action === "undo" ? row.canUndo : row.recovery === review.recovery && !!row.recovery, "conflict");
      ensure(!this.closed, "cancelled");
      if (review.action === "recover") {
        await this.journal.mark(r, index, review.recovery!, note); return;
      }
      if (!markAt(entry, index, "undo-intent")) await this.journal.mark(r, index, "undo-intent", note);
      await this.blockers([c.path], r.id); note = await this.fresh(ticket.note); await this.journal.intact(r);
      const check = () => { ensure(!this.closed, "cancelled"); this.port.writeGuard(note); };
      check(); await this.port.process(note, c.after, c.before, check);
      const saved = await this.port.read(c.path);
      ensure(saved && saved.file === note.file && identity(saved, c) && saved.content === c.before, "conflict");
      await this.journal.mark(r, index, "undone", saved);
    });
  }
}
