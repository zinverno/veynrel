import type { MergeEntry, MergeRecord } from "./mergeJournal";
import type { PlanPair } from "./changePlan";
import { sameSavedNote } from "./savedNote";
import { ArchiveError, buildArchivePlan } from "./archivePlan";
import type { ArchiveChoice, ArchiveDependencies, ArchivePlan } from "./archivePlan";

export interface ArchiveRead {
  record: MergeRecord; entry: MergeEntry; recordHash: string; notes: PlanPair;
  dependencies: ArchiveDependencies[]; guard(): void;
}
export interface ArchiveView {
  stage: "idle" | "loading" | "choosing" | "ready" | "error" | "stale" | "cancelled";
  input?: ArchiveRead; plan?: ArchivePlan; error?: ArchiveError["reason"];
}
function same(a: ArchiveRead, b: ArchiveRead): boolean {
  return a.notes.every((n, i) => sameSavedNote(n, b.notes[i]) && n.created === b.notes[i].created &&
    JSON.stringify(n.cache) === JSON.stringify(b.notes[i].cache) && JSON.stringify(n.references) === JSON.stringify(b.notes[i].references)) &&
    a.recordHash === b.recordHash && JSON.stringify(a.entry) === JSON.stringify(b.entry) && JSON.stringify(a.dependencies) === JSON.stringify(b.dependencies);
}
/** Ephemeral read-only session. No executor, storage writer or model port. */
export class ArchiveSession {
  view: ArchiveView = { stage: "idle" };
  onChange: () => void = () => {};
  private generation = 0;
  private closed = false;
  constructor(private readonly read: () => Promise<ArchiveRead>) {}
  private publish(view: ArchiveView): void { if (!this.closed) { this.view = view; this.onChange(); } }
  private current(g: number): boolean { return !this.closed && this.generation === g; }
  invalidate(): void { this.generation++; this.publish({ stage: "stale" }); }
  cancel(): void { this.generation++; this.publish({ stage: "cancelled" }); }
  close(): void { this.closed = true; this.generation++; this.view = { stage: "idle" }; this.onChange = () => {}; }
  changeSelection(): void {
    this.generation++;
    if (this.view.input) this.publish({ stage: "choosing", input: this.view.input });
    else this.invalidate();
  }
  async prepare(): Promise<void> {
    if (this.closed || this.view.stage === "loading") return;
    const g = ++this.generation; this.publish({ stage: "loading" });
    try {
      const input = await this.read();
      if (!this.current(g)) return;
      const verified = await this.read();
      if (!this.current(g)) return;
      input.guard(); verified.guard();
      if (!same(input, verified)) { this.invalidate(); return; }
      this.publish({ stage: "choosing", input: verified });
    } catch { if (this.current(g)) this.publish({ stage: "error", error: "basis" }); }
  }
  async build(choice: ArchiveChoice): Promise<void> {
    if (this.closed || this.view.stage === "loading" || !this.view.input) return;
    const input = this.view.input, g = ++this.generation, selected = JSON.parse(JSON.stringify(choice)) as ArchiveChoice;
    this.publish({ stage: "loading", input });
    try {
      const fresh = await this.read();
      if (!this.current(g)) return;
      input.guard(); fresh.guard();
      if (!same(input, fresh)) { this.invalidate(); return; }
      const plan = buildArchivePlan(fresh.record, fresh.entry.receipts[0], fresh.recordHash, fresh.notes[0], fresh.notes[1], fresh.dependencies, selected);
      const verified = await this.read();
      if (!this.current(g)) return;
      fresh.guard(); verified.guard();
      if (!same(fresh, verified)) { this.invalidate(); return; }
      this.publish({ stage: "ready", input: verified, plan });
    } catch (e) {
      if (this.current(g)) {
        if (e instanceof ArchiveError) this.publish({ stage: "error", input, error: e.reason });
        else this.invalidate();
      }
    }
  }
}
