import { parseLinktext } from "obsidian";
import type { App } from "obsidian";
import { readRelationshipPair } from "./relationshipSession";
import type { RelationshipAnalysis } from "./relationshipSession";
import { buildChangePlan, ChangePlanError } from "./changePlan";
import type { ChangePlan, PlanChoice, PlanFailure, PlanPair, PlanNote } from "./changePlan";
import { sameSavedNote } from "./savedNote";
import { buildMultiFilePlan, MultiFilePlanError } from "./multiFilePlan";
import type { MultiFileChoice, MultiFilePlan } from "./multiFilePlan";
import { buildMergePlan, MergePlanError } from "./mergePlan";
import type { MergeChoice, MergeFailure, MergeIncoming, MergePlan } from "./mergePlan";
import { buildGroupPlan, validateGroupPlan } from "./groupPlan";
import type { GroupChoice, GroupPlan } from "./groupPlan";
import { GroupPlanError } from "./groupStructure";
import type { GroupFailure } from "./groupStructure";

export interface PlannerRead { pair: PlanPair; linktexts: readonly [string, string] }
export interface PlannerDependencies {
  analysis(): RelationshipAnalysis | undefined;
  read(): Promise<PlannerRead>;
  incoming?(): MergeIncoming;
}
export interface PlannerView {
  stage: "idle" | "loading" | "choosing" | "ready" | "error" | "stale" | "cancelled";
  input?: PlannerRead;
  plan?: ChangePlan;
  multiPlan?: MultiFilePlan;
  mergePlan?: MergePlan;
  mergeError?: MergeFailure;
  groupPlan?: GroupPlan;
  groupError?: GroupFailure;
  error?: PlanFailure;
  errorSide?: 0 | 1;
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
    return { ...note, created: note.file.stat.ctime, cache: cache ? JSON.parse(JSON.stringify(cache)) as PlanNote["cache"] : null, references };
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
function sameMultiRead(a: PlannerRead, b: PlannerRead): boolean {
  return sameRead(a, b) && a.pair.every((note, i) => note.created === b.pair[i].created &&
    b.pair[i].file.stat.ctime === note.created && b.pair[i].file.path === note.path &&
    b.pair[i].file.stat.mtime === note.modified && b.pair[i].file.stat.size === note.bytes);
}

/** Disposable local planning. There is deliberately no write, provider or apply port. */
export class ChangePlannerSession {
  view: PlannerView = { stage: "idle" };
  onChange: () => void = () => {};
  private generation = 0;
  private multiGeneration?: number;
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
    if (!this.closed && this.busy && this.multiGeneration === this.generation) { this.invalidate(); return; }
    if (!this.closed && !this.busy && this.view.input) this.publish({ stage: "choosing", input: this.view.input });
  }
  async buildGroup(choice: GroupChoice): Promise<void> {
    if (this.closed || this.busy || !this.view.input || !this.analysis) return;
    const input = this.view.input, generation = ++this.generation;
    this.multiGeneration = generation;
    const selected = JSON.parse(JSON.stringify(choice)) as GroupChoice;
    this.publish({ stage: "loading" });
    try {
      const fresh = await this.deps.read(), incoming = this.deps.incoming?.() ?? [null, null] as const;
      if (!this.current(generation)) return;
      if (!sameMultiRead(input, fresh)) { this.invalidate(); return; }
      const plan = buildGroupPlan(this.analysis, fresh.pair, selected, fresh.linktexts, incoming);
      const verified = await this.deps.read(), incomingAfter = this.deps.incoming?.() ?? [null, null] as const;
      if (!this.current(generation)) return;
      if (!sameMultiRead(fresh, verified) || JSON.stringify(incoming) !== JSON.stringify(incomingAfter)) { this.invalidate(); return; }
      const groupPlan = validateGroupPlan(plan, this.analysis, verified.pair, selected, verified.linktexts, incomingAfter);
      this.publish({ stage: "ready", input: verified, groupPlan });
    } catch (e) {
      if (!this.current(generation)) return;
      const reason = e instanceof GroupPlanError ? e.reason : "source";
      if (reason === "source" || reason === "analysis") { this.invalidate(); return; }
      this.publish({ stage: "error", input, groupError: reason });
    }
  }
  async buildMerge(choice: MergeChoice): Promise<void> {
    if (this.closed || this.busy || !this.view.input || !this.analysis) return;
    const input = this.view.input, generation = ++this.generation;
    this.multiGeneration = generation;
    const selected = JSON.parse(JSON.stringify(choice)) as MergeChoice;
    this.publish({ stage: "loading" });
    try {
      const fresh = await this.deps.read(), incoming = this.deps.incoming?.() ?? [null, null] as const;
      if (!this.current(generation)) return;
      if (!sameMultiRead(input, fresh)) { this.invalidate(); return; }
      const mergePlan = buildMergePlan(this.analysis, fresh.pair, selected, incoming);
      const verified = await this.deps.read(), incomingAfter = this.deps.incoming?.() ?? [null, null] as const;
      if (!this.current(generation)) return;
      if (!sameMultiRead(fresh, verified) || JSON.stringify(incoming) !== JSON.stringify(incomingAfter)) { this.invalidate(); return; }
      this.publish({ stage: "ready", input: verified, mergePlan });
    } catch (e) {
      if (this.current(generation)) this.publish({ stage: "error", input,
        mergeError: e instanceof MergePlanError || e instanceof ChangePlanError ? e.reason : "source" });
    }
  }
  async buildMulti(choice: MultiFileChoice): Promise<void> {
    if (this.closed || this.busy || !this.view.input || !this.analysis) return;
    const input = this.view.input, generation = ++this.generation;
    this.multiGeneration = generation;
    const selected: MultiFileChoice = { operation: choice.operation,
      selections: [choice.selections[0] ? { ...choice.selections[0] } : null, choice.selections[1] ? { ...choice.selections[1] } : null],
      confirmed: [...choice.confirmed] };
    this.publish({ stage: "loading" });
    try {
      const fresh = await this.deps.read();
      if (!this.current(generation)) return;
      if (!sameMultiRead(input, fresh)) { this.invalidate(); return; }
      const multiPlan = buildMultiFilePlan(this.analysis, fresh.pair, selected, fresh.linktexts);
      const verified = await this.deps.read();
      if (!this.current(generation)) return;
      if (!sameMultiRead(fresh, verified)) { this.invalidate(); return; }
      this.publish({ stage: "ready", input: verified, multiPlan });
    } catch (error) {
      if (this.current(generation)) {
        const reason = error instanceof ChangePlanError ? error.reason : "source";
        this.publish({ stage: "error", input: reason === "source" ? undefined : input, error: reason,
          errorSide: error instanceof MultiFilePlanError ? error.side : undefined });
      }
    }
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
