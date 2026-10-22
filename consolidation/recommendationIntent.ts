import type { Action, RelationshipRecommendation } from "./relationshipContract";
import type { RelationshipAnalysis } from "./relationshipSession";
import { paragraphRanges, permittedEmbed, requirePlainParagraph, requireChangeRange, ChangePlanError } from "./changePlan";
import type { PlanNote, PlanPair, PlanRange } from "./changePlan";
import { mergeBlockFailure, mergeHints } from "./mergePlan";
import { contextGroups, groupDestination } from "./groupStructure";
import { contextBundleCandidates, contextBundleDestination } from "./contextBundleStructure";
import { atomizationCandidates, atomizationHintIds } from "./atomizationPlan";
import type { ConsolidationAction } from "./consolidationActions";

export type IntentSelection = { origin: "primary" } | { origin: "alternative"; index: number } |
  { origin: "user"; action: Action | "add_reciprocal_links" | "write_atom_to_empty_note" };
export type CombineOperation = "merge_knowledge" | "copy_context_group" | "copy_context_bundle";
export interface CombineCapability { operation: CombineOperation; reason?: string }
export interface RecommendationIntent {
  family: "link" | "embed" | "combine" | "atom" | "keep" | "manual";
  operation: ConsolidationAction | null;
  origin: IntentSelection["origin"];
  reason: string;
  evidence: readonly string[];
  direction: 0 | 1 | null;
  missing: readonly string[];
  limitations: readonly string[];
  status: "unavailable" | "needs_input" | "draft_ready";
}

export function safeParagraphs(note: PlanNote): PlanRange[] {
  return paragraphRanges(note).filter(range => { try { requirePlainParagraph(note, range); return true; } catch { return false; } });
}

export function changeRangeOptions(analysis: RelationshipAnalysis, pair: PlanPair, operation: "add_link" | "replace_with_embed", side: 0 | 1,
  linktext = pair[side === 0 ? 1 : 0].path.slice(0, -3)): { ranges: PlanRange[]; reason?: string; reasons?: string[] } {
  const source = pair[side], target = pair[side === 0 ? 1 : 0];
  if (!source.cache?.sections || !target.cache?.sections) return { ranges: [], reason: "@planner.error.metadata" };
  if (source.references.some(ref => ref.target === target.path)) return { ranges: [], reason: "@planner.error.existing" };
  const failures = new Set<string>();
  const ranges = paragraphRanges(pair[side]).filter(range => {
    try { requireChangeRange(analysis, pair, operation, side, range, linktext); return true; }
    catch (error) { failures.add(`@planner.error.${error instanceof ChangePlanError ? error.reason : "metadata"}`); return false; }
  });
  // A protected first paragraph says nothing about other eligible paragraphs.
  const priority = ["metadata", "existing", "link", "cycle", "dependencies", "recommendation", "evidence", "protected", "range"];
  const reason = priority.map(key => `@planner.error.${key}`).find(key => failures.has(key));
  return { ranges, reason: ranges.length ? undefined : reason ?? "@planner.noParagraphs", reasons: ranges.length ? [] : [...failures] };
}

/** Capability hints only. No confirmations, plans, tickets, writes or model calls. */
export function combineCapabilities(analysis: RelationshipAnalysis, pair: PlanPair, canonical: 0 | 1): CombineCapability[] {
  const operations: CombineOperation[] = ["merge_knowledge", "copy_context_group", "copy_context_bundle"];
  if (!pair.every(n => n.cache?.sections)) return operations.map(operation => ({ operation, reason: "@planner.error.metadata" }));
  if (["conflicting", "unrelated", "insufficient_context"].includes(analysis.result.relation) ||
    analysis.result.claims.some(c => c.kind === "conflict" || c.kind === "version_difference"))
    return operations.map(operation => ({ operation, reason: "@merge.error.conflict" }));
  const side = canonical === 0 ? 1 : 0, source = pair[side], target = pair[canonical], hints = mergeHints(analysis.result, pair);
  const ranges = paragraphRanges(source), failures = ranges.map(r => mergeBlockFailure(source, r, hints, side));
  const merge = safeParagraphs(target).length && failures.some(f => !f);
  const result: CombineCapability[] = [{ operation: "merge_knowledge", reason: merge ? undefined :
    !safeParagraphs(target).length ? "@planner.noParagraphs" : failures[0] ? `@merge.error.${failures[0]}` : "@planner.noParagraphs" }];
  try {
    groupDestination(target);
    const groups = contextGroups(source).groups;
    const usable = groups.some(g => !g.failure && !hints.some(h => h.side === side && h.kind === `context_${side === 0 ? "a" : "b"}` &&
      g.copied.some(r => r.start < h.range.end && h.range.start < r.end)));
    result.push({ operation: "copy_context_group", reason: usable ? undefined : "@group.noGroups" });
  } catch { result.push({ operation: "copy_context_group", reason: "@intent.groupUnavailable" }); }
  try {
    contextBundleDestination(target);
    result.push({ operation: "copy_context_bundle", reason: contextBundleCandidates(source).some(c => !c.failure) ? undefined : "@bundle.none" });
  } catch { result.push({ operation: "copy_context_bundle", reason: "@intent.bundleUnavailable" }); }
  return result;
}

/** Input is the session's validated analysis; local metadata is re-read by the existing planner owner. */
export function recommendationIntent(analysis: RelationshipAnalysis, selection: IntentSelection, pair?: PlanPair, linktexts?: readonly [string, string]): RecommendationIntent {
  const item: RelationshipRecommendation | undefined = selection.origin === "primary" ? analysis.result.recommendation :
    selection.origin === "alternative" ? analysis.result.alternatives[selection.index] : undefined;
  const action = selection.origin === "user" ? selection.action : item?.action;
  const intent: RecommendationIntent = { family: "manual", operation: null, origin: selection.origin, reason: item?.reason ?? "",
    evidence: [...item?.evidence ?? []], direction: null, missing: [], limitations: [], status: "needs_input" };
  switch (action) {
    case "add_link": intent.family = "link"; intent.operation = "add_link"; intent.missing = ["direction", "location", "confirmation"]; break;
    case "add_reciprocal_links": intent.family = "link"; intent.operation = action; intent.missing = ["locations", "confirmation"]; break;
    case "consider_embed_b_in_a": case "consider_embed_a_in_b":
      intent.family = "embed"; intent.operation = "replace_with_embed"; intent.direction = action === "consider_embed_b_in_a" ? 0 : 1;
      intent.missing = ["range", "confirmation"]; break;
    case "consider_merge": intent.family = "combine"; intent.operation = "merge_knowledge"; intent.missing = ["canonical", "material", "confirmation"]; break;
    case "consider_atomize": case "write_atom_to_empty_note":
      intent.family = "atom"; intent.operation = action === "consider_atomize" ? "atomization_preview" : action;
      intent.missing = ["unit", "destination", "confirmation"]; break;
    case "no_change": intent.family = "keep"; intent.status = "draft_ready"; return intent;
    case "manual_review": intent.status = "draft_ready"; return intent;
    default: intent.status = "unavailable"; intent.limitations = ["@intent.unavailable"]; return intent;
  }
  const refuse = (reason: string, reasons: readonly string[] = []) => { intent.status = "unavailable"; intent.limitations = [...new Set([reason, ...reasons])]; return intent; };
  if (intent.family === "embed" && !permittedEmbed(analysis, intent.direction!)) return refuse("@planner.error.recommendation");
  if (!pair) return intent;
  if (!pair.every(n => n.cache?.sections)) return refuse("@planner.error.metadata");
  if (intent.family === "combine" && !([0, 1] as const).some(side => combineCapabilities(analysis, pair, side).some(c => !c.reason)))
    return refuse("@intent.combineUnavailable");
  if (intent.family === "link") {
    const options = ([0, 1] as const).map(side => changeRangeOptions(analysis, pair, "add_link", side, linktexts?.[side === 0 ? 1 : 0]));
    if (intent.operation === "add_reciprocal_links" ? options.some(o => !o.ranges.length) : options.every(o => !o.ranges.length))
      return refuse(options.find(o => o.reason)!.reason!);
  }
  if (intent.family === "embed") {
    const options = changeRangeOptions(analysis, pair, "replace_with_embed", intent.direction!, linktexts?.[intent.direction === 0 ? 1 : 0]);
    if (!options.ranges.length) return refuse(options.reason!, options.reasons);
  }
  if (intent.family === "atom" && selection.origin !== "user") {
    const sides = ([0, 1] as const).filter(side => {
      try { return atomizationCandidates(pair[side]).some(c => !c.failure && atomizationHintIds(analysis, pair, side, c).length); } catch { return false; }
    });
    if (!sides.length) return refuse("@intent.atomUnavailable");
    if (sides.length === 1) intent.direction = sides[0];
  }
  return intent;
}
