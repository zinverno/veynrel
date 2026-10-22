import type { App } from "obsidian";
import type { RelationshipPair } from "./relationshipSession";
import { sameSavedNote } from "./savedNote";
import { refreshReviewFacts } from "./reviewRefresh";
const records = new WeakMap<App, Map<string, RelationshipPair>>();
const key = (paths: readonly string[]) => JSON.stringify([...paths].sort());
/** Session-only user decision, separate from candidate sources and execution history. Never hides a pair. */
export function keepReviewSeparate(app: App, pair: RelationshipPair): void {
  let decisions = records.get(app); if (!decisions) records.set(app, decisions = new Map<string, RelationshipPair>());
  const id = key(pair.map(n => n.path)); decisions.delete(id);
  decisions.set(id, [{ ...pair[0] }, { ...pair[1] }]);
  // Bound retained snapshots; an evicted decision simply returns to unreviewed.
  if (decisions.size > 64) decisions.delete([...decisions.keys()][0]);
  refreshReviewFacts(app);
}
export function reviewKeptSeparate(app: App, pair: RelationshipPair): boolean {
  const previous = records.get(app)?.get(key(pair.map(n => n.path)));
  return !!previous && pair.every(n => previous.some(p => sameSavedNote(n, p)));
}
export function reopenReview(app: App, paths: readonly string[]): void {
  records.get(app)?.delete(key(paths)); refreshReviewFacts(app);
}
