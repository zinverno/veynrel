import type { CachedMetadata } from "obsidian";
import type { SavedNote } from "./savedNote";
import { sameSavedNote } from "./savedNote";
import type { RelationshipAnalysis } from "./relationshipSession";
import type { RelationshipRecommendation } from "./relationshipContract";
import { stableHash } from "../utils/stableHash";

export type PlanOperation = "add_link" | "replace_with_embed" | "no_change";
export type PlanFailure = "source" | "metadata" | "range" | "protected" | "recommendation" | "evidence" | "existing" | "cycle" | "dependencies" | "link" | "confirmation";
export class ChangePlanError extends Error { constructor(readonly reason: PlanFailure) { super(reason); } }
export interface PlanRange { start: number; end: number; text: string }
export interface PlanReference { kind: "link" | "embed" | "property"; original: string; target: string | null }
export interface PlanNote extends SavedNote { cache: CachedMetadata | null; references: PlanReference[]; created?: number }
export type PlanPair = readonly [PlanNote, PlanNote];
export interface PlanChoice { operation: PlanOperation; source: 0 | 1; selection: PlanRange | null; confirmed: boolean }
export interface ChangePlan {
  operation: PlanOperation;
  sourcePath: string;
  targetPath: string;
  source: SavedNote;
  target: SavedNote;
  sourceHash: string;
  targetHash: string;
  selection: PlanRange | null;
  edit: { start: number; end: number; removed: string; inserted: string } | null;
  before: string;
  after: string;
  affectedLinks: { added: string | null; target: string; preserved: PlanReference[] };
  provenance: { origin: "relationship_analyzer"; provider: string; model: string; recommendation: RelationshipRecommendation; userOperation: PlanOperation };
  limitations: readonly ["saved_sources_only", "metadata_may_lag", "semantic_preservation_unverified", "dependencies_not_scanned", "requires_separate_apply_review"];
  modelLimitations: string[];
}
function requirePlan(condition: unknown, reason: PlanFailure): asserts condition { if (!condition) throw new ChangePlanError(reason); }
const overlaps = (a: PlanRange, start: number, end: number) => a.start < end && a.end > start;

/** Only native whole paragraph boundaries. No model-derived selection or Markdown parser. */
export function paragraphRanges(note: PlanNote): PlanRange[] {
  const cache = note.cache;
  if (!cache?.sections) return [];
  return cache.sections.filter(section => section.type === "paragraph").map(section => ({
    start: section.position.start.offset, end: section.position.end.offset,
    text: note.content.slice(section.position.start.offset, section.position.end.offset),
  }));
}
export function requirePlainParagraph(note: PlanNote, selection: PlanRange): void {
  const cache = note.cache;
  requirePlan(cache?.sections, "metadata");
  requirePlan(Number.isInteger(selection.start) && Number.isInteger(selection.end) && selection.start >= 0 &&
    selection.end > selection.start && selection.end <= note.content.length &&
    note.content.slice(selection.start, selection.end) === selection.text && paragraphRanges(note).some(range =>
      range.start === selection.start && range.end === selection.end && range.text === selection.text), "range");
  const protectedPositions = [cache.frontmatterPosition, ...cache.sections.filter(s => s.type !== "paragraph" || s.id).map(s => s.position),
    ...[...(cache.links ?? []), ...(cache.embeds ?? []), ...(cache.tags ?? []), ...(cache.footnotes ?? []),
      ...(cache.footnoteRefs ?? []), ...(cache.referenceLinks ?? []), ...Object.values(cache.blocks ?? {})].map(item => item.position)];
  requirePlan(!protectedPositions.some(pos => pos && overlaps(selection, pos.start.offset, pos.end.offset)), "protected");
  // shortcut: v1 edits plain paragraphs only; allow richer inline syntax only with native structural tests.
  requirePlan(selection.text.trim().length > 0 && !/[[\]`~<>\\^$*_#|%]|https?:\/\//iu.test(selection.text) &&
    !selection.text.split(/\r?\n/u).some(line => /^(?:\s{4}|\t|\s*(?:[-+*=]|\d+[.)])\s)/u.test(line) || /^[-=]{2,}$/u.test(line.trim())) &&
    (selection.start === 0 || note.content[selection.start - 1] === "\n") &&
    (selection.end === note.content.length || /^[\r\n]/u.test(note.content.slice(selection.end))), "protected");
}
export function permittedEmbed(analysis: RelationshipAnalysis, side: 0 | 1): RelationshipRecommendation | undefined {
  const action = side === 0 ? "consider_embed_b_in_a" : "consider_embed_a_in_b";
  return [analysis.result.recommendation, ...analysis.result.alternatives].find(item => item.action === action);
}
/** A single checked splice; never applies, persists, renders or asks a model to edit Markdown. */
export function buildChangePlan(analysis: RelationshipAnalysis, pair: PlanPair, choice: PlanChoice, linktext: string): ChangePlan {
  requirePlan(pair.every((note, i) => sameSavedNote(note, analysis.pair[i])), "source");
  requirePlan(choice.source === 0 || choice.source === 1, "source");
  requirePlan(["add_link", "replace_with_embed", "no_change"].includes(choice.operation), "recommendation");
  const source = pair[choice.source], target = pair[choice.source === 0 ? 1 : 0];
  requirePlan(source.path !== target.path, "source");
  let edit: ChangePlan["edit"] = null, recommendation = analysis.result.recommendation;
  let added: string | null = null;
  if (choice.operation !== "no_change") {
    requirePlan(choice.selection && choice.confirmed, "confirmation");
    requirePlan(source.cache && target.cache, "metadata");
    requirePlainParagraph(source, choice.selection);
    requirePlan(linktext === target.path.slice(0, -3) && linktext.length > 0 && !/[[\]#|^\\]/u.test(linktext) && [...linktext].every(char => char.charCodeAt(0) >= 32), "link");
    requirePlan(!source.references.some(ref => ref.target === target.path), "existing");
    if (choice.operation === "replace_with_embed") {
      const offered = permittedEmbed(analysis, choice.source);
      requirePlan(offered && ["same_information", "partial_overlap"].includes(analysis.result.relation), "recommendation");
      recommendation = offered;
      const quoteFor = (claim: RelationshipAnalysis["result"]["claims"][number]) => choice.source === 0 ? claim.quoteA : claim.quoteB;
      requirePlan(analysis.result.claims.some(claim => claim.kind === "shared" && offered.evidence.includes(claim.id) &&
        quoteFor(claim) && choice.selection!.text.includes(quoteFor(claim)!)), "evidence");
      const suffix = choice.source === 0 ? "_a" : "_b";
      for (const claim of analysis.result.claims.filter(claim => claim.kind.endsWith(suffix))) {
        const quote = quoteFor(claim);
        if (quote) requirePlan(!overlaps(choice.selection, source.content.indexOf(quote), source.content.indexOf(quote) + quote.length), "protected");
      }
      requirePlan(!target.references.some(ref => ref.kind === "embed" && ref.target === source.path), "cycle");
      // shortcut: reject any target transclusion; transitive cycles need a separately bounded dependency review.
      requirePlan(!target.references.some(ref => ref.kind === "embed") && !target.content.includes("!["), "dependencies");
      added = `![[${linktext}]]`;
      edit = { start: choice.selection.start, end: choice.selection.end, removed: choice.selection.text, inserted: added };
    } else {
      added = `[[${linktext}]]`;
      edit = { start: choice.selection.end, end: choice.selection.end, removed: "", inserted: ` ${added}` };
    }
  }
  const after = edit ? source.content.slice(0, edit.start) + edit.inserted + source.content.slice(edit.end) : source.content;
  return { operation: choice.operation, sourcePath: source.path, targetPath: target.path, source, target,
    sourceHash: stableHash(source.content), targetHash: stableHash(target.content), selection: choice.operation === "no_change" ? null : choice.selection,
    edit, before: source.content, after, affectedLinks: { added, target: target.path, preserved: source.references },
    provenance: { origin: "relationship_analyzer", provider: analysis.provider, model: analysis.model, recommendation, userOperation: choice.operation },
    limitations: ["saved_sources_only", "metadata_may_lag", "semantic_preservation_unverified", "dependencies_not_scanned", "requires_separate_apply_review"],
    modelLimitations: [...analysis.result.limitations] };
}
