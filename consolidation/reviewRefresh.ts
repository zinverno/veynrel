import type { App } from "obsidian";
import type { ReviewOperation } from "../health/workbench/reviewFacts";
import type { OperationRecord } from "./operationJournal";
import type { MultiRecord } from "./multiFileJournal";
import type { MergeRecord } from "./mergeJournal";
import type { GroupRecord } from "./groupJournal";
import type { BundleRecord } from "./bundleJournal";
import type { EmptyAtomRecord } from "./emptyAtomJournal";
type ReviewRecord = OperationRecord | MultiRecord | MergeRecord | GroupRecord | BundleRecord | EmptyAtomRecord;
const listeners = new WeakMap<App, Set<(paths?: readonly string[]) => void>>();
const outcomes = new WeakMap<App, Map<string, ReviewOperation>>();
export function subscribeReviewRefresh(app: App, listener: (paths?: readonly string[]) => void): () => void {
  const set = listeners.get(app) ?? new Set<(paths?: readonly string[]) => void>();
  listeners.set(app, set);
  set.add(listener); return () => { set.delete(listener); };
}
export function reviewOutcome(record: ReviewRecord, state: string): ReviewOperation {
  const paths = "sourcePath" in record ? [record.sourcePath, record.targetPath] : "files" in record ? record.files.map(f => f.path) :
    "canonical" in record ? [record.canonical.path, record.secondary.path] : "sources" in record.plan ? record.plan.sources.map(n => n.path) :
    [record.plan.canonical.path, record.plan.secondary.path];
  return { id: record.id, paths, created: record.createdAt, operation: record.operation, state };
}
function remember(app: App, outcome: ReviewOperation): void {
  let cache = outcomes.get(app); if (!cache) outcomes.set(app, cache = new Map<string, ReviewOperation>());
  const created = Math.max(outcome.created, cache.get(outcome.id)?.created ?? 0);
  cache.set(outcome.id, { ...outcome, created, paths: [...outcome.paths] });
  if (cache.size > 128) cache.delete([...cache.values()].sort((a, b) => a.created - b.created)[0].id);
}
/** Only actual executor success or explicitly opened, checked History populates this UI cache. */
export function refreshReviewFacts(app: App, outcome?: ReviewOperation): void {
  if (outcome) remember(app, outcome);
  for (const listener of listeners.get(app) ?? []) { try { listener(outcome?.paths); } catch { /* UI failure cannot change an execution outcome. */ } }
}
export function checkedReviewHistory(app: App, rows: readonly { record?: ReviewRecord; state: string }[]): void {
  for (const row of rows) if (row.record) remember(app, reviewOutcome(row.record, row.state));
  refreshReviewFacts(app);
}
/** No executor lock, journal scan, source IO, consent or authority on background refresh. */
export function reviewOutcomeSnapshot(app: App): readonly ReviewOperation[] { return [...outcomes.get(app)?.values() ?? []]; }
