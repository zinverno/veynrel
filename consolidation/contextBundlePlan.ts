import { isCanonicalMarkdownPath } from "../chunking/reconstructChunks";
import { stableHash } from "../utils/stableHash";
import type { PlanPair, PlanRange } from "./changePlan";
import type { RelationshipAnalysis } from "./relationshipSession";
import { validateRelationshipResponse } from "./relationshipContract";
import { sameSavedNote } from "./savedNote";
import type { MergeIncoming, MergePlan } from "./mergePlan";
import { contextBundleCandidates, contextBundleDestination, ContextBundleError, requireBundle } from "./contextBundleStructure";
import type { BundleCandidate, BundleKind } from "./contextBundleStructure";

export interface ContextBundleChoice {
  operation: "copy_context_bundle"; canonical: 0 | 1 | null; kind: BundleKind | null; core: PlanRange | null;
  context: PlanRange[]; boundariesConfirmed: boolean; contextConfirmed: boolean;
  dependencies: "reviewed" | "unresolved" | null; insertion: number | null; insertionConfirmed: boolean; distinctIntent: boolean;
}
export const emptyBundleChoice = (): ContextBundleChoice => ({ operation: "copy_context_bundle", canonical: null, kind: null, core: null,
  context: [], boundariesConfirmed: false, contextConfirmed: false, dependencies: null, insertion: null, insertionConfirmed: false, distinctIntent: false });
/** A preview contract with no execution or persistence port. */
export interface ContextBundlePlan {
  version: 1; operation: "copy_context_bundle"; readOnly: true; kind: BundleKind;
  canonical: MergePlan["canonical"]; secondary: MergePlan["secondary"];
  bundle: BundleCandidate;
  insertion: { point: number; separator: string; edit: { start: number; end: number; removed: ""; inserted: string } };
  confirmations: ContextBundleChoice; dependencies: MergePlan["dependencies"]; resolver: readonly [string, string];
  provenance: { origin: "relationship_analyzer"; provider: string; model: string; analysis: RelationshipAnalysis["result"] };
  limitations: readonly ["read_only_no_executor", "secondary_unchanged", "metadata_may_lag", "external_sources_unverified", "user_context_roles_not_proof", "semantic_equivalence_unverified", "no_archive_eligibility"];
}
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
export function buildContextBundlePlan(analysis: RelationshipAnalysis, pair: PlanPair, choice: ContextBundleChoice,
  resolver: readonly [string, string], incoming: MergeIncoming = [null, null]): ContextBundlePlan {
  requireBundle(choice.operation === "copy_context_bundle" && (choice.canonical === 0 || choice.canonical === 1), "confirmation");
  requireBundle(pair.length === 2 && pair[0].path !== pair[1].path && pair[0].file !== pair[1].file, "source");
  pair.forEach((n, i) => requireBundle(sameSavedNote(n, analysis.pair[i]) && isCanonicalMarkdownPath(n.path) &&
    !n.path.split("/").some(p => p.startsWith(".")) && n.file.path === n.path && n.created !== undefined &&
    n.created === n.file.stat.ctime && n.modified === n.file.stat.mtime && n.bytes === n.file.stat.size, "source"));
  let result: RelationshipAnalysis["result"];
  try { result = validateRelationshipResponse(JSON.stringify(analysis.result), pair[0].content, pair[1].content); }
  catch { throw new ContextBundleError("analysis"); }
  requireBundle(!["conflicting", "unrelated", "insufficient_context"].includes(result.relation) &&
    !result.claims.some(c => c.kind === "conflict" || c.kind === "version_difference"), "semantic");
  requireBundle(result.relation !== "related_distinct" || choice.distinctIntent === true, "intent");
  requireBundle(choice.boundariesConfirmed === true && choice.contextConfirmed === true && choice.insertionConfirmed === true, "confirmation");
  requireBundle(choice.dependencies === "reviewed", "dependencies");
  const canonical = pair[choice.canonical], side = choice.canonical === 0 ? 1 : 0, secondary = pair[side];
  const bundle = contextBundleCandidates(secondary).find(c => c.kind === choice.kind && JSON.stringify(c.core) === JSON.stringify(choice.core));
  requireBundle(bundle, "range"); requireBundle(!bundle.failure, bundle.failure ?? "range");
  requireBundle(JSON.stringify(choice.context) === JSON.stringify([...bundle.before, ...bundle.after]), "context");
  contextBundleDestination(canonical); requireBundle(choice.insertion === canonical.content.length, "range");
  const point = canonical.content.length, separator = (canonical.content.includes("\r\n") ? "\r\n" : "\n").repeat(2), inserted = separator + bundle.range.text;
  const identity = (i: 0 | 1) => ({ created: pair[i].created!, modified: pair[i].modified, bytes: pair[i].bytes, contentHash: stableHash(pair[i].content) });
  return copy({ version: 1, operation: "copy_context_bundle", readOnly: true, kind: bundle.kind,
    canonical: { path: canonical.path, identity: identity(choice.canonical), before: canonical.content, after: canonical.content + inserted },
    secondary: { path: secondary.path, identity: identity(side), content: secondary.content, unchanged: true }, bundle,
    insertion: { point, separator, edit: { start: point, end: point, removed: "", inserted } }, confirmations: choice,
    dependencies: pair.map((n, i) => ({ path: n.path, metadata: n.cache, outgoing: n.references, incoming: incoming[i] })), resolver,
    provenance: { origin: "relationship_analyzer", provider: analysis.provider, model: analysis.model, analysis: result },
    limitations: ["read_only_no_executor", "secondary_unchanged", "metadata_may_lag", "external_sources_unverified", "user_context_roles_not_proof", "semantic_equivalence_unverified", "no_archive_eligibility"] });
}
export function validateContextBundlePlan(value: unknown, analysis: RelationshipAnalysis, pair: PlanPair, choice: ContextBundleChoice,
  resolver: readonly [string, string], incoming: MergeIncoming = [null, null]): ContextBundlePlan {
  const expected = buildContextBundlePlan(analysis, pair, choice, resolver, incoming);
  requireBundle(JSON.stringify(value) === JSON.stringify(expected), "source"); return expected;
}
