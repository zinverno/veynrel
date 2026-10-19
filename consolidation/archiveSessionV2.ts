import type { ArchiveChoiceV2, ArchiveDependenciesV2, ArchiveParentRead, ArchivePlanV2 } from "./archivePlanV2";
import { archivePartition, buildArchivePlanV2 } from "./archivePlanV2";
import { ArchiveError } from "./archivePlan";
import { sameSavedNote } from "./savedNote";

export interface ArchiveReadV2 extends ArchiveParentRead { dependencies: ArchiveDependenciesV2[] }
export interface ArchiveViewV2 {
  stage: "idle" | "loading" | "choosing" | "ready" | "error" | "stale" | "cancelled";
  input?: ArchiveReadV2; plan?: ArchivePlanV2; error?: ArchiveError["reason"];
}
function same(a: ArchiveReadV2, b: ArchiveReadV2): boolean {
  return a.record.operation === b.record.operation && a.record.id === b.record.id && a.recordHash === b.recordHash &&
    JSON.stringify(a.entry) === JSON.stringify(b.entry) && JSON.stringify(a.dependencies) === JSON.stringify(b.dependencies) &&
    a.notes.every((n, i) => sameSavedNote(n, b.notes[i]) && n.created === b.notes[i].created &&
      JSON.stringify(n.cache) === JSON.stringify(b.notes[i].cache) && JSON.stringify(n.references) === JSON.stringify(b.notes[i].references));
}
/** Ephemeral v2 review: no write port and no Archive Apply ticket. */
export class ArchiveSessionV2 {
  view: ArchiveViewV2 = { stage: "idle" };
  onChange: () => void = () => {};
  private generation = 0;
  private closed = false;
  constructor(private readonly read: () => Promise<ArchiveReadV2>) {}
  private publish(view: ArchiveViewV2): void { if (!this.closed) { this.view = view; this.onChange(); } }
  private current(g: number): boolean { return !this.closed && g === this.generation; }
  invalidate(): void { this.generation++; this.publish({ stage: "stale" }); }
  cancel(): void { this.generation++; this.publish({ stage: "cancelled" }); }
  close(): void { this.closed = true; this.generation++; this.view = { stage: "idle" }; this.onChange = () => {}; }
  changeSelection(): void {
    this.generation++;
    if (this.view.input) this.publish({ stage: "choosing", input: this.view.input }); else this.invalidate();
  }
  async prepare(): Promise<void> {
    if (this.closed || this.view.stage === "loading") return;
    const g = ++this.generation; this.publish({ stage: "loading" });
    try {
      const input = await this.read(); if (!this.current(g)) return;
      const verified = await this.read(); if (!this.current(g)) return;
      input.guard(); verified.guard();
      if (!same(input, verified)) { this.invalidate(); return; }
      archivePartition(verified.record, verified.notes[1]);
      this.publish({ stage: "choosing", input: verified });
    } catch { if (this.current(g)) this.publish({ stage: "error", error: "basis" }); }
  }
  async build(choice: ArchiveChoiceV2): Promise<void> {
    if (this.closed || this.view.stage === "loading" || !this.view.input) return;
    const input = this.view.input, g = ++this.generation, selected = JSON.parse(JSON.stringify(choice)) as ArchiveChoiceV2;
    this.publish({ stage: "loading", input });
    try {
      const fresh = await this.read(); if (!this.current(g)) return;
      input.guard(); fresh.guard();
      if (!same(input, fresh)) { this.invalidate(); return; }
      const plan = buildArchivePlanV2(fresh, selected);
      const verified = await this.read(); if (!this.current(g)) return;
      fresh.guard(); verified.guard();
      if (!same(fresh, verified)) { this.invalidate(); return; }
      this.publish({ stage: "ready", input: verified, plan });
    } catch (e) {
      if (this.current(g)) {
        if (e instanceof ArchiveError) this.publish({ stage: "error", input, error: e.reason }); else this.invalidate();
      }
    }
  }
}
