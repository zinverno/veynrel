import type { RelationshipAnalysis } from "./relationshipSession";
import type { PlanPair } from "./changePlan";
import type { PlannerRead } from "./changePlannerSession";
import { sameSavedNote } from "./savedNote";
export interface RecommendationAvailability { state: "checking" | "ready" | "stale" | "metadata"; pair?: PlanPair; linktexts?: readonly [string, string] }
/** Read-only availability, never a plan or approval. Generation revokes every old callback. */
export class RecommendationPreflight {
  view: RecommendationAvailability = { state: "checking" };
  private generation = 0;
  private closed = false;
  constructor(private readonly read: () => Promise<PlannerRead>, private readonly changed: () => void) {}
  invalidate(): void { this.generation++; this.view = { state: "checking" }; if (!this.closed) this.changed(); }
  async check(analysis: RelationshipAnalysis, current: () => boolean): Promise<void> {
    if (this.closed) return;
    const generation = ++this.generation;
    this.view = { state: "checking" }; this.changed();
    let view: RecommendationAvailability;
    try {
      const { pair, linktexts } = await this.read();
      view = !pair.every((n, i) => sameSavedNote(n, analysis.pair[i])) ? { state: "stale" } :
        pair.every(n => n.cache?.sections) ? { state: "ready", pair, linktexts } : { state: "metadata" };
    } catch { view = { state: "metadata" }; }
    if (this.closed || generation !== this.generation || !current()) return;
    this.view = view; this.changed();
  }
  close(): void { this.closed = true; this.generation++; this.view = { state: "checking" }; }
}
