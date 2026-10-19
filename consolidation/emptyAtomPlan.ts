import type { CachedMetadata } from "obsidian";
import type { PlanNote, PlanPair } from "./changePlan";
import type { RelationshipAnalysis } from "./relationshipSession";
import { atomizationUnit, atomKey, emptyAtomizationChoice, requireAtom, validateAtomizationPath } from "./atomizationPlan";
import type { AtomizationChoice, AtomizationCandidate } from "./atomizationPlan";

export interface EmptyAtomChoice extends Omit<AtomizationChoice, "operation"> {
  operation: "write_atom_to_empty_note"; targetConfirmed: boolean;
}
export const emptyAtomChoice = (): EmptyAtomChoice => ({ ...emptyAtomizationChoice(), operation: "write_atom_to_empty_note", targetConfirmed: false });
export interface AtomNoteEvidence {
  path: string; created: number; modified: number; bytes: number; markdown: string;
  metadata: CachedMetadata | null; references: PlanNote["references"];
}
export interface EmptyAtomObservation { configDir: string; sourceLink: string; dependencyHash: string }
/** Durable evidence is independent of session-local WeakMap tokens. A plan alone is never write consent. */
export interface AtomizationPlanV2 {
  version: 2; operation: "write_atom_to_empty_note";
  sources: [AtomNoteEvidence, AtomNoteEvidence];
  target: AtomNoteEvidence & { before: ""; after: string };
  selected: AtomizationCandidate; context: AtomizationCandidate["context"]; remaining: string;
  additions: { title: string; source: string; separator: string };
  confirmations: EmptyAtomChoice; observation: EmptyAtomObservation;
  provenance: { origin: "relationship_hint" | "manual_review"; provider: string; model: string; analysis: RelationshipAnalysis["result"]; hintIds: string[] };
  limitations: readonly string[];
}
export const EMPTY_ATOM_LIMITATIONS = ["existing_empty_target_only", "sources_unchanged", "undo_clears_never_deletes",
  "semantic_independence_is_user_judgment", "unknown_external_dependencies", "independent_processes_not_locked"] as const;
export const atomCanonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, (item as Record<string, unknown>)[key]])) : item);
/** Native restart bookkeeping is not content metadata; every other field remains evidence. */
export function atomMetadata(cache: CachedMetadata | null): CachedMetadata | null {
  if (!cache) return null;
  const result = { ...cache } as Record<string, unknown>; delete result.v;
  return JSON.parse(atomCanonical(result)) as CachedMetadata;
}
export function emptyAtomMetadata(cache: CachedMetadata | null): boolean {
  return cache !== null && Object.keys(atomMetadata(cache)!).length === 0;
}
export const atomEvidence = (note: PlanNote): AtomNoteEvidence => ({ path: note.path, created: note.created!, modified: note.modified,
  bytes: note.bytes, markdown: note.content, metadata: atomMetadata(note.cache), references: JSON.parse(JSON.stringify(note.references)) as PlanNote["references"] });

export function buildEmptyAtomPlan(analysis: RelationshipAnalysis, pair: PlanPair, target: PlanNote, choice: EmptyAtomChoice,
  observation: EmptyAtomObservation): AtomizationPlanV2 {
  requireAtom(atomCanonical(Object.keys(choice).sort()) === atomCanonical(Object.keys(emptyAtomChoice()).sort()) &&
    choice.operation === "write_atom_to_empty_note" && choice.targetConfirmed === true && choice.dependenciesReviewed === true, "confirmation");
  const unit = atomizationUnit(analysis, pair, choice, observation.configDir);
  requireAtom(!/(?:\b[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\bmailto:)/iu.test(choice.title), "confirmation");
  validateAtomizationPath(target.path, observation.configDir);
  requireAtom(target.path === choice.path && target.file.path === target.path && !pair.some(n => n.file === target.file || atomKey(n.path) === atomKey(target.path)) &&
    target.content === "" && target.bytes === 0 && target.created === target.file.stat.ctime && target.modified === target.file.stat.mtime && target.file.stat.size === 0, "source");
  requireAtom(emptyAtomMetadata(target.cache) && target.references.length === 0, "metadata");
  requireAtom(observation.sourceLink === unit.note.path.slice(0, -3) && /^[a-f0-9]{64}$/u.test(observation.dependencyHash), "dependencies");
  return JSON.parse(JSON.stringify({ version: 2, operation: "write_atom_to_empty_note", sources: pair.map(atomEvidence),
    target: { ...atomEvidence(target), before: "", after: unit.markdown }, selected: unit.selected, context: unit.selected.context,
    remaining: unit.note.content, additions: { title: unit.title, source: unit.source, separator: unit.separator },
    confirmations: choice, observation, provenance: { origin: unit.hintIds.length ? "relationship_hint" : "manual_review",
      provider: analysis.provider, model: analysis.model, analysis: unit.result, hintIds: unit.hintIds }, limitations: EMPTY_ATOM_LIMITATIONS })) as AtomizationPlanV2;
}
export function validateEmptyAtomPlan(value: unknown, analysis: RelationshipAnalysis, pair: PlanPair, target: PlanNote,
  choice: EmptyAtomChoice, observation: EmptyAtomObservation): AtomizationPlanV2 {
  const rebuilt = buildEmptyAtomPlan(analysis, pair, target, choice, observation);
  requireAtom(atomCanonical(value) === atomCanonical(rebuilt), "source"); return rebuilt;
}
