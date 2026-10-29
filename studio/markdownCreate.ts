import { checksum } from "../consolidation/operationJournal";
import { atomKey } from "../consolidation/atomizationPlan";
import { ensure, freeze, StudioError } from "./recipe";
import { freshSource } from "./writePlan";
import type { StudioWritePlan } from "./writePlan";
import type { ApplyResult, ReviewSession, StudioNotePort, StudioSource } from "./ports";
import type { CreatedMarkdown, MarkdownTargetPort } from "./markdownTarget";
import { MarkdownCreateJournal } from "./markdownCreateJournal";
import type { MarkdownCreateEntry, MarkdownCreateIntent } from "./markdownCreateJournal";
import { StudioOperations } from "./operations";

export interface MarkdownCreateHistory {
  entry: MarkdownCreateEntry; index: number; source: string; target: string;
  state: "created" | "modified" | "not-created" | "unconfirmed" | "damaged";
  observed?: "created" | "not-created";
}
export interface CreateRecovery { id: string; index: number; target: string; state: "created" | "not-created"; output: string }
export class StudioMarkdownCreate {
  private closed = false;
  private tickets = new Map<CreateRecovery, { entry: MarkdownCreateEntry; note: CreatedMarkdown | null }>();
  constructor(readonly journal: MarkdownCreateJournal, readonly targets: MarkdownTargetPort, private readonly notes: StudioNotePort, readonly operations: StudioOperations) {}
  dispose(): void { this.closed = true; this.tickets.clear(); }
  discard(ticket: CreateRecovery): void { this.tickets.delete(ticket); }
  async preflight(plan: StudioWritePlan, sources: readonly StudioSource[]): Promise<void> {
    ensure(!this.closed && plan.destination === "new-note", "stale");
    const entries = await this.journal.entries(); ensure(!entries.some(e => e.damaged), "storage");
    for (const row of plan.rows) {
      const source = sources.find(s => s.path === row.source.path); ensure(source, "source");
      await freshSource(this.notes, source, "new-note"); await this.targets.check(source.path, row.target);
      ensure(!entries.some(e => e.intent?.plan.rows.some((r, i) => atomKey(r.target) === atomKey(row.target) && !e.marks.some(m => m.index === i && m.kind !== "dispatch"))), "storage");
    }
  }
  create(plan: StudioWritePlan, review: ReviewSession, sources: readonly StudioSource[], active: () => boolean, owner: object): Promise<readonly ApplyResult[]> {
    return this.operations.run(owner, async () => {
      const results: ApplyResult[] = review.rows.map(r => ({ path: r.path, outcome: "skipped" }));
      const intent: MarkdownCreateIntent = freeze({ schemaVersion: 1, operation: "markdown-create", id: plan.id, createdAt: Date.now(),
        recipeId: review.recipeId, recipeVersion: review.recipeVersion, plan,
        sources: plan.rows.map(r => ({ path: r.source.path, content: sources.find(s => s.path === r.source.path)!.content })) });
      const checkActive = () => ensure(active() && !this.closed, "cancelled");
      try { checkActive(); await this.journal.prepare(intent); }
      catch (e) {
        for (const row of plan.rows) Object.assign(results.find(r => r.path === row.source.path)!, { target: row.target, outcome: "failed", reason: e instanceof StudioError ? e.code : "storage" });
        return freeze(results);
      }
      for (let index = 0; index < plan.rows.length; index++) {
        const row = plan.rows[index], result = results.find(r => r.path === row.source.path)!; result.target = row.target;
        if (!active() || this.closed) break;
        let issued = false;
        try {
          const source = sources.find(s => s.path === row.source.path)!;
          await freshSource(this.notes, source, "new-note"); await this.targets.check(source.path, row.target);
          await this.journal.intact(intent); checkActive(); await this.journal.mark(intent, index, "dispatch", null);
          await freshSource(this.notes, source, "new-note"); await this.targets.check(source.path, row.target); await this.journal.intact(intent);
          const guard = () => { checkActive(); this.notes.readGuard(source); };
          guard(); issued = true; await this.targets.create(source.path, row.target, row.output, guard);
          // Always observe an issued create, including cancellation during the native call.
          const saved = await this.targets.read(row.target); ensure(saved && saved.content === row.output, "conflict");
          await this.journal.mark(intent, index, "created", saved); result.outcome = "created";
        } catch (e) {
          const reason = e instanceof StudioError ? e.code : "storage";
          result.outcome = issued ? "unconfirmed" : reason === "cancelled" ? "skipped" : ["target", "source", "conflict", "unsaved", "read-editor"].includes(reason) ? "conflict" : "failed";
          result.reason = reason; break;
        }
      }
      return freeze(results);
    });
  }
  private async inspect(entry: MarkdownCreateEntry, index: number): Promise<MarkdownCreateHistory> {
    const planned = entry.intent?.plan.rows[index];
    const row: MarkdownCreateHistory = { entry, index, source: planned?.source.path ?? "", target: planned?.target ?? "", state: "damaged" };
    if (entry.damaged || !planned) return row;
    try {
      const note = await this.targets.read(planned.target), mark = entry.marks.find(m => m.index === index && m.kind !== "dispatch");
      if (mark) {
        if (mark.kind === "not-created") row.state = note ? "modified" : "not-created";
        else row.state = note && await checksum(note.content) === mark.observed!.hash && note.created === mark.observed!.created &&
          note.modified === mark.observed!.modified && note.bytes === mark.observed!.bytes ? "created" : "modified";
      } else { row.state = "unconfirmed"; if (!note) row.observed = "not-created"; else if (note.content === planned.output) row.observed = "created"; }
    } catch { row.state = "unconfirmed"; }
    return row;
  }
  history(): Promise<readonly MarkdownCreateHistory[]> {
    return this.operations.run(this, async () => {
      const rows: MarkdownCreateHistory[] = [];
      for (const entry of await this.journal.entries()) {
        if (!entry.intent) rows.push(await this.inspect(entry, -1));
        else for (let i = 0; i < entry.intent.plan.rows.length; i++) rows.push(await this.inspect(entry, i));
      }
      return rows;
    });
  }
  reviewRecovery(id: string, index: number): Promise<CreateRecovery> {
    return this.operations.run(this, async () => {
      ensure(!this.closed, "cancelled"); const entry = await this.journal.entry(id), row = await this.inspect(entry, index);
      ensure(row.observed && entry.intent, "conflict"); const note = await this.targets.read(row.target);
      ensure(row.observed === "created" ? note?.content === entry.intent.plan.rows[index].output : note === null, "conflict");
      const ticket = freeze({ id, index, target: row.target, state: row.observed, output: note?.content ?? "" });
      this.tickets.set(ticket, { entry, note }); return ticket;
    });
  }
  executeRecovery(ticket: CreateRecovery): Promise<void> {
    const evidence = this.tickets.get(ticket); ensure(evidence, "used"); this.tickets.delete(ticket);
    return this.operations.run(this, async () => {
      ensure(!this.closed, "cancelled"); const entry = await this.journal.entry(ticket.id), current = await this.targets.read(ticket.target);
      ensure(JSON.stringify(entry) === JSON.stringify(evidence.entry) && JSON.stringify(current) === JSON.stringify(evidence.note), "stale");
      await this.journal.mark(entry.intent!, ticket.index, ticket.state, current, true);
    });
  }
}
