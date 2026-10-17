import { isCanonicalMarkdownPath } from "../chunking/reconstructChunks";
import { stableHash } from "../utils/stableHash";
import { ChangePlanError, requirePlainParagraph } from "./changePlan";
import type { PlanFailure, PlanNote, PlanPair, PlanRange, PlanReference } from "./changePlan";
import { sameSavedNote } from "./savedNote";
import { validateRelationshipResponse } from "./relationshipContract";
import type { RelationshipClaim, RelationshipResult } from "./relationshipContract";
import type { RelationshipAnalysis } from "./relationshipSession";
import type { InspectorList } from "./pairSnapshot";

export type MergeFailure = PlanFailure | "heading" | "context" | "neighbor" | "conflict" | "analysis";
export class MergePlanError extends Error { constructor(readonly reason: MergeFailure) { super(reason); } }
export type MergeIncoming = readonly [InspectorList | null, InspectorList | null];
export interface MergeChoice {
  operation: "merge_knowledge";
  canonical: 0 | 1 | null;
  transfers: readonly { range: PlanRange; contextReviewed: boolean }[];
  insertion: PlanRange | null;
  insertionConfirmed: boolean;
}
export interface MergeHint { id: string; kind: RelationshipClaim["kind"]; text: string; side: 0 | 1; range: PlanRange }
export interface MergeIdentity { created: number; modified: number; bytes: number; contentHash: string }
/** A separate serializable read-only contract. Neither Safe Apply executor accepts this operation. */
export interface MergePlan {
  version: 1; operation: "merge_knowledge";
  canonical: { path: string; identity: MergeIdentity; before: string; after: string };
  secondary: { path: string; identity: MergeIdentity; content: string; unchanged: true };
  transfers: readonly { range: PlanRange; contextReviewed: true }[];
  insertion: { anchor: PlanRange; confirmed: true; edit: { start: number; end: number; removed: ""; inserted: string } };
  retained: readonly { range: PlanRange; copied: boolean; claimIds: string[] }[];
  hints: MergeHint[];
  dependencies: readonly { path: string; metadata: PlanNote["cache"]; outgoing: PlanReference[]; incoming: InspectorList | null }[];
  provenance: { origin: "relationship_analyzer"; provider: string; model: string; relation: RelationshipResult["relation"];
    recommendation: RelationshipResult["recommendation"]; userCanonical: 0 | 1 };
  limitations: readonly ["secondary_unchanged", "metadata_may_lag", "incoming_kinds_unknown", "dependencies_not_scanned", "context_review_not_proof", "merge_executor_unavailable"];
  modelLimitations: string[];
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function requireMerge(value: unknown, reason: MergeFailure): asserts value { if (!value) throw new MergePlanError(reason); }
const intersects = (a: PlanRange, b: PlanRange) => a.start < b.end && a.end > b.start;

/** Quotes are hints, never selected paragraph boundaries. Ambiguous/unmatched quotes produce no candidate. */
export function mergeHints(result: RelationshipResult, pair: PlanPair): MergeHint[] {
  return result.claims.flatMap(claim => ([0, 1] as const).flatMap(side => {
    const quote = side === 0 ? claim.quoteA : claim.quoteB, source = pair[side].content;
    if (!quote) return [];
    const start = source.indexOf(quote);
    return start < 0 || source.indexOf(quote, start + 1) !== -1 ? [] :
      [{ id: claim.id, kind: claim.kind, text: claim.text, side, range: { start, end: start + quote.length, text: quote } }];
  }));
}
/** Conservative portability check, in addition to the shared native whole-paragraph guard. */
export function mergeBlockFailure(note: PlanNote, range: PlanRange, hints: readonly MergeHint[], side: 0 | 1): MergeFailure | undefined {
  try { requirePlainParagraph(note, range); } catch (e) { return e instanceof ChangePlanError ? e.reason : "metadata"; }
  const sections = note.cache!.sections!;
  if ((note.cache!.headings ?? []).some(h => h.position.start.offset < range.end) ||
    sections.some(s => s.type === "heading" && s.position.start.offset < range.end)) return "heading";
  if (hints.some(h => h.side === side && h.kind === (side === 0 ? "context_a" : "context_b") && intersects(h.range, range))) return "context";
  const at = sections.findIndex(s => s.position.start.offset === range.start && s.position.end.offset === range.end);
  // shortcut: neighbouring structured material may supply attribution/context; rich dependency groups need a later contract.
  for (const s of [sections[at - 1], sections[at + 1]]) {
    if (!s) continue;
    if (s.type !== "paragraph") return "neighbor";
    try { requirePlainParagraph(note, { start: s.position.start.offset, end: s.position.end.offset,
      text: note.content.slice(s.position.start.offset, s.position.end.offset) }); } catch { return "neighbor"; }
  }
  return undefined;
}
export function buildMergePlan(analysis: RelationshipAnalysis, pair: PlanPair, choice: MergeChoice,
  incoming: MergeIncoming = [null, null]): MergePlan {
  requireMerge(choice.operation === "merge_knowledge" && (choice.canonical === 0 || choice.canonical === 1), "confirmation");
  requireMerge(pair.length === 2 && pair[0].path !== pair[1].path && pair[0].file !== pair[1].file, "source");
  for (const [i, n] of pair.entries()) {
    requireMerge(sameSavedNote(n, analysis.pair[i]) && isCanonicalMarkdownPath(n.path) && !n.path.split("/").some(p => p.startsWith(".")) &&
      n.file.path === n.path && n.created !== undefined && n.created === n.file.stat.ctime && n.modified === n.file.stat.mtime && n.bytes === n.file.stat.size, "source");
    requireMerge(n.cache?.sections, "metadata");
  }
  let result: RelationshipResult;
  try { result = validateRelationshipResponse(JSON.stringify(analysis.result), pair[0].content, pair[1].content); }
  catch { throw new MergePlanError("analysis"); }
  requireMerge(!["conflicting", "insufficient_context", "unrelated"].includes(result.relation) &&
    !result.claims.some(c => c.kind === "conflict" || c.kind === "version_difference"), "conflict");
  requireMerge(choice.transfers.length > 0 && choice.transfers.every(t => t.contextReviewed === true) && choice.insertion && choice.insertionConfirmed === true, "confirmation");
  const canonical = pair[choice.canonical], side = choice.canonical === 0 ? 1 : 0, secondary = pair[side], hints = mergeHints(result, pair);
  requirePlainParagraph(canonical, choice.insertion);
  const transfers = choice.transfers.map(t => ({ range: { ...t.range }, contextReviewed: true as const })).sort((a, b) => a.range.start - b.range.start);
  for (const [i, t] of transfers.entries()) {
    const failure = mergeBlockFailure(secondary, t.range, hints, side); requireMerge(!failure, failure ?? "range");
    requireMerge(i === 0 || transfers[i - 1].range.end <= t.range.start, "range");
  }
  const newline = canonical.content.includes("\r\n") ? "\r\n" : "\n";
  const inserted = newline.repeat(2) + transfers.map(t => t.range.text).join(newline.repeat(2)), point = choice.insertion.end;
  const retained: MergePlan["retained"][number][] = [];
  const fragment = (start: number, end: number, copied: boolean) => {
    if (end <= start) return;
    const range = { start, end, text: secondary.content.slice(start, end) };
    retained.push({ range, copied, claimIds: hints.filter(h => h.side === side && intersects(h.range, range)).map(h => h.id) });
  };
  let offset = 0;
  for (const t of transfers) { fragment(offset, t.range.start, false); fragment(t.range.start, t.range.end, true); offset = t.range.end; }
  fragment(offset, secondary.content.length, false);
  const identity = (n: PlanNote): MergeIdentity => ({ created: n.created!, modified: n.modified, bytes: n.bytes, contentHash: stableHash(n.content) });
  return { version: 1, operation: "merge_knowledge",
    canonical: { path: canonical.path, identity: identity(canonical), before: canonical.content,
      after: canonical.content.slice(0, point) + inserted + canonical.content.slice(point) },
    secondary: { path: secondary.path, identity: identity(secondary), content: secondary.content, unchanged: true }, transfers,
    insertion: { anchor: { ...choice.insertion }, confirmed: true, edit: { start: point, end: point, removed: "", inserted } },
    retained, hints: copy(hints), dependencies: pair.map((n, i) => ({ path: n.path, metadata: copy(n.cache), outgoing: copy(n.references), incoming: copy(incoming[i]) })),
    provenance: { origin: "relationship_analyzer", provider: analysis.provider, model: analysis.model, relation: result.relation,
      recommendation: copy(result.recommendation), userCanonical: choice.canonical },
    limitations: ["secondary_unchanged", "metadata_may_lag", "incoming_kinds_unknown", "dependencies_not_scanned", "context_review_not_proof", "merge_executor_unavailable"],
    modelLimitations: [...result.limitations] };
}
