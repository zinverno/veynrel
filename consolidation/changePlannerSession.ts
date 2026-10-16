import { parseLinktext } from "obsidian";
import type { App } from "obsidian";
import { readRelationshipPair } from "./relationshipSession";
import type { RelationshipAnalysis } from "./relationshipSession";
import { buildChangePlan, ChangePlanError } from "./changePlan";
import type { ChangePlan, PlanChoice, PlanFailure, PlanPair, PlanNote } from "./changePlan";
import { sameSavedNote } from "./savedNote";

export interface PlannerRead { pair: PlanPair; linktexts: readonly [string, string] }
export interface PlannerDependencies {
  analysis(): RelationshipAnalysis | undefined;
  read(): Promise<PlannerRead>;
}
export interface PlannerView {
  stage: "idle" | "loading" | "choosing" | "ready" | "error" | "stale" | "cancelled";
  input?: PlannerRead;
  plan?: ChangePlan;
  error?: PlanFailure;
}
/** Public Obsidian APIs; only the two selected sources and their caches are consulted. */
export async function readPlannerPair(app: App, paths: readonly [string, string]): Promise<PlannerRead> {
  const pair = await readRelationshipPair(app, paths);
  if (pair.some(note => app.vault.getFileByPath(note.path) !== note.file || note.file.path !== note.path ||
    note.file.stat.mtime !== note.modified || note.file.stat.size !== note.bytes)) throw new ChangePlanError("source");
  const notes = pair.map(note => {
    const cache = app.metadataCache?.getFileCache(note.file);
    const references: PlanNote["references"] = [];
    for (const [kind, items] of [["link", cache?.links], ["embed", cache?.embeds], ["property", cache?.frontmatterLinks]] as const) {
      for (const item of items ?? []) references.push({ kind, original: item.original,
        target: app.metadataCache.getFirstLinkpathDest(parseLinktext(item.link).path, note.path)?.path ?? null });
    }
    return { ...note, cache: cache ? JSON.parse(JSON.stringify(cache)) as PlanNote["cache"] : null, references };
  }) as unknown as PlanPair;
  // Full vault-relative paths preserve homonyms. Resolve each token from its actual source before allowing it.
  const linktexts = pair.map((target, i) => {
    const text = target.path.slice(0, -3), from = pair[i === 0 ? 1 : 0].path;
    return app.metadataCache?.getFirstLinkpathDest(text, from) === target.file ? text : "";
  }) as [string, string];
  return { pair: notes, linktexts };
}
function sameRead(a: PlannerRead, b: PlannerRead): boolean {
  return a.pair.every((note, i) => sameSavedNote(note, b.pair[i]) &&
    JSON.stringify(note.cache) === JSON.stringify(b.pair[i].cache) && JSON.stringify(note.references) === JSON.stringify(b.pair[i].references)) &&
    JSON.stringify(a.linktexts) === JSON.stringify(b.linktexts);
}

/** Disposable local planning. There is deliberately no write, provider or apply port. */
export class ChangePlannerSession {
  view: PlannerView = { stage: "idle" };
  onChange: () => void = () => {};
  private generation = 0;
  private closed = false;
  private analysis?: RelationshipAnalysis;
  constructor(private readonly deps: PlannerDependencies) {}
  get busy(): boolean { return this.view.stage === "loading"; }
  private publish(view: PlannerView): void { if (!this.closed) { this.view = view; this.onChange(); } }
  private current(generation: number): boolean {
    if (this.closed || this.generation !== generation) return false;
    if (this.deps.analysis() !== this.analysis) { this.invalidate(); return false; }
    return true;
  }
  invalidate(): void { this.generation++; this.analysis = undefined; this.publish({ stage: "stale" }); }
  cancel(): void { this.generation++; this.analysis = undefined; this.publish({ stage: "cancelled" }); }
  close(): void { this.closed = true; this.generation++; this.analysis = undefined; this.view = { stage: "idle" }; this.onChange = () => {}; }
  changeSelection(): void {
    if (!this.closed && !this.busy && this.view.input) this.publish({ stage: "choosing", input: this.view.input });
  }
  async prepare(): Promise<void> {
    if (this.closed || this.busy) return;
    this.analysis = this.deps.analysis();
    if (!this.analysis) { this.invalidate(); return; }
    const generation = ++this.generation;
    this.publish({ stage: "loading" });
    try {
      const input = await this.deps.read();
      if (!this.current(generation)) return;
      if (!input.pair.every((note, i) => sameSavedNote(note, this.analysis!.pair[i]))) { this.invalidate(); return; }
      this.publish({ stage: "choosing", input });
    } catch { if (this.current(generation)) this.publish({ stage: "error", error: "source" }); }
  }
  async build(choice: PlanChoice): Promise<void> {
    if (this.closed || this.busy || !this.view.input || !this.analysis) return;
    const input = this.view.input, generation = ++this.generation;
    this.publish({ stage: "loading" });
    try {
      const fresh = await this.deps.read();
      if (!this.current(generation)) return;
      if (!sameRead(input, fresh)) { this.invalidate(); return; }
      const plan = buildChangePlan(this.analysis, fresh.pair, choice, fresh.linktexts[choice.source === 0 ? 1 : 0]);
      this.publish({ stage: "ready", input: fresh, plan });
    } catch (error) {
      if (this.current(generation)) {
        const reason = error instanceof ChangePlanError ? error.reason : "source";
        this.publish({ stage: "error", input: reason === "source" ? undefined : input, error: reason });
      }
    }
  }
}
