import { isCanonicalMarkdownPath } from "../chunking/reconstructChunks";
import { stableHash } from "../utils/stableHash";
import type { PlanPair, PlanRange } from "./changePlan";
import type { RelationshipAnalysis } from "./relationshipSession";
import { validateRelationshipResponse } from "./relationshipContract";
import { sameSavedNote } from "./savedNote";
import { mergeHints } from "./mergePlan";
import type { MergeIdentity, MergeIncoming, MergePlan } from "./mergePlan";
import { contextGroups, groupDestination, GroupPlanError, requireGroup } from "./groupStructure";
import type { ContextGroup, GroupHeading } from "./groupStructure";

export interface GroupChoice {
  operation: "copy_context_group"; canonical: 0 | 1 | null; group: PlanRange | null;
  representation: "original_heading_branch" | null; insertion: number | null;
  groupConfirmed: boolean; contextConfirmed: boolean; insertionConfirmed: boolean;
  dependencies: "reviewed" | "unresolved" | null; distinctIntent: boolean;
}
export const emptyGroupChoice = (): GroupChoice => ({ operation: "copy_context_group", canonical: null, group: null,
  representation: null, insertion: null, groupConfirmed: false, contextConfirmed: false, insertionConfirmed: false, dependencies: null, distinctIntent: false });
/** Read-only, deliberately incompatible with every executor and journal operation. Never a write authorization. */
export interface GroupPlan {
  version: 1; operation: "copy_context_group"; readOnly: true;
  canonical: { path: string; identity: MergeIdentity; before: string; after: string };
  secondary: { path: string; identity: MergeIdentity; content: string; unchanged: true };
  hierarchy: { source: GroupHeading[]; destination: GroupHeading[]; inserted: { level: number; text: string; sourceOffset: number; destinationOffset: number }[] };
  group: ContextGroup;
  insertion: { point: number; representation: "original_heading_branch"; separator: string; edit: { start: number; end: number; removed: ""; inserted: string } };
  confirmations: GroupChoice;
  dependencies: MergePlan["dependencies"];
  resolver: readonly [string, string];
  refusals: [];
  provenance: { origin: "relationship_analyzer"; provider: string; model: string; analysis: RelationshipAnalysis["result"] };
  limitations: readonly ["read_only_no_executor", "secondary_unchanged", "metadata_may_lag", "dependencies_not_scanned", "semantic_equivalence_unverified", "user_review_not_proof", "no_archive_eligibility"];
}
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
export function buildGroupPlan(analysis: RelationshipAnalysis, pair: PlanPair, choice: GroupChoice,
  resolver: readonly [string, string], incoming: MergeIncoming = [null, null]): GroupPlan {
  requireGroup(choice.operation === "copy_context_group" && (choice.canonical === 0 || choice.canonical === 1), "confirmation");
  requireGroup(pair.length === 2 && pair[0].path !== pair[1].path && pair[0].file !== pair[1].file, "source");
  pair.forEach((n, i) => requireGroup(sameSavedNote(n, analysis.pair[i]) && isCanonicalMarkdownPath(n.path) &&
    !n.path.split("/").some(p => p.startsWith(".")) && n.file.path === n.path && n.created !== undefined &&
    n.created === n.file.stat.ctime && n.modified === n.file.stat.mtime && n.bytes === n.file.stat.size, "source"));
  let result: RelationshipAnalysis["result"];
  try { result = validateRelationshipResponse(JSON.stringify(analysis.result), pair[0].content, pair[1].content); }
  catch { throw new GroupPlanError("analysis"); }
  requireGroup(!["conflicting", "unrelated", "insufficient_context"].includes(result.relation) &&
    !result.claims.some(c => c.kind === "conflict" || c.kind === "version_difference"), "semantic");
  requireGroup(result.relation !== "related_distinct" || choice.distinctIntent === true, "intent");
  requireGroup(choice.group && choice.groupConfirmed === true && choice.contextConfirmed === true && choice.insertionConfirmed === true &&
    choice.representation === "original_heading_branch", "confirmation");
  requireGroup(choice.dependencies === "reviewed", "dependencies");
  const canonical = pair[choice.canonical], side = choice.canonical === 0 ? 1 : 0, secondary = pair[side];
  const structure = contextGroups(secondary), group = structure.groups.find(g => JSON.stringify(g.range) === JSON.stringify(choice.group));
  requireGroup(group, "range"); requireGroup(!group.failure, group.failure ?? "range");
  // Context claims describe unknown semantic dependencies; headings alone cannot discharge them.
  requireGroup(!mergeHints(result, pair).some(h => h.side === side && h.kind === `context_${side === 0 ? "a" : "b"}` &&
    group.copied.some(r => r.start < h.range.end && h.range.start < r.end)), "context");
  groupDestination(canonical);
  requireGroup(choice.insertion === canonical.content.length, "hierarchy");
  const newline = canonical.content.includes("\r\n") ? "\r\n" : "\n", separator = newline.repeat(2);
  const inserted = separator + group.copied.map(r => r.text).join(separator), point = canonical.content.length;
  const identity = (i: 0 | 1): MergeIdentity => ({ created: pair[i].created!, modified: pair[i].modified, bytes: pair[i].bytes, contentHash: stableHash(pair[i].content) });
  let offset = point + separator.length;
  const insertedHierarchy = group.copied.flatMap(r => {
    const entries = structure.headings.filter(h => h.range.start >= r.start && h.range.end <= r.end).map(h => ({ level: h.level,
      text: h.range.text, sourceOffset: h.range.start, destinationOffset: offset + h.range.start - r.start }));
    offset += r.text.length + separator.length; return entries;
  });
  return copy({ version: 1, operation: "copy_context_group", readOnly: true,
    canonical: { path: canonical.path, identity: identity(choice.canonical), before: canonical.content, after: canonical.content + inserted },
    secondary: { path: secondary.path, identity: identity(side), content: secondary.content, unchanged: true },
    hierarchy: { source: structure.headings, destination: contextGroups(canonical).headings, inserted: insertedHierarchy }, group,
    insertion: { point, representation: "original_heading_branch", separator, edit: { start: point, end: point, removed: "", inserted } },
    confirmations: choice, dependencies: pair.map((n, i) => ({ path: n.path, metadata: n.cache, outgoing: n.references, incoming: incoming[i] })),
    resolver, refusals: [], provenance: { origin: "relationship_analyzer", provider: analysis.provider, model: analysis.model, analysis: result },
    limitations: ["read_only_no_executor", "secondary_unchanged", "metadata_may_lag", "dependencies_not_scanned", "semantic_equivalence_unverified", "user_review_not_proof", "no_archive_eligibility"] });
}
/** Rebuild, not a permissive JSON cast. Caller must supply freshly read native identities, metadata and analysis. */
export function validateGroupPlan(value: unknown, analysis: RelationshipAnalysis, pair: PlanPair, choice: GroupChoice,
  resolver: readonly [string, string], incoming: MergeIncoming = [null, null]): GroupPlan {
  const expected = buildGroupPlan(analysis, pair, choice, resolver, incoming);
  requireGroup(JSON.stringify(value) === JSON.stringify(expected), "source");
  return expected;
}
