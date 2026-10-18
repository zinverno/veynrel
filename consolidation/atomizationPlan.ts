import { isCanonicalMarkdownPath } from "../chunking/reconstructChunks";
import { stableHash } from "../utils/stableHash";
import type { PlanNote, PlanPair, PlanRange } from "./changePlan";
import { paragraphRanges } from "./changePlan";
import { contextGroups, validateGroupSection } from "./groupStructure";
import { mergeHints } from "./mergePlan";
import { validateRelationshipResponse } from "./relationshipContract";
import type { RelationshipAnalysis } from "./relationshipSession";
import { sameSavedNote } from "./savedNote";

export type AtomizationFailure = "source" | "metadata" | "range" | "protected" | "context" | "semantic" | "confirmation" | "path" | "occupied" | "link" | "dependencies" | "analysis";
export class AtomizationError extends Error { constructor(readonly reason: AtomizationFailure) { super(reason); } }
export function requireAtom(value: unknown, reason: AtomizationFailure): asserts value { if (!value) throw new AtomizationError(reason); }
export const atomKey = (s: string): string => s.normalize("NFKC").toLowerCase();
export interface AtomizationCandidate { kind: "paragraph" | "section"; range: PlanRange; context: PlanRange[]; failure?: AtomizationFailure }
export interface AtomizationChoice {
  operation: "atomization_preview"; side: 0 | 1 | null; kind: AtomizationCandidate["kind"] | null; range: PlanRange | null;
  title: string; path: string; unitConfirmed: boolean; contextConfirmed: boolean; manualConfirmed: boolean;
  titleConfirmed: boolean; sourceConfirmed: boolean; dependenciesReviewed: boolean;
}
export const emptyAtomizationChoice = (): AtomizationChoice => ({ operation: "atomization_preview", side: null, kind: null, range: null,
  title: "", path: "", unitConfirmed: false, contextConfirmed: false, manualConfirmed: false,
  titleConfirmed: false, sourceConfirmed: false, dependenciesReviewed: false });
export const resetAtomizationConfirmations = (choice: AtomizationChoice): AtomizationChoice => ({ ...choice,
  unitConfirmed: false, contextConfirmed: false, manualConfirmed: false, titleConfirmed: false, sourceConfirmed: false, dependenciesReviewed: false });
export interface AtomizationObservation {
  path: string; absent: boolean; parentExists: boolean; configDir: string; sourceLink: string;
  inventory: { path: string; identity: number; folder: boolean; ctime?: number; mtime?: number; size?: number; metadataHash?: string }[];
  linkConflicts: string[]; metadataComplete: boolean;
  dependencies: { resolved: unknown; unresolved: unknown };
}
const identities = new WeakMap<object, number>(); let nextIdentity = 0;
/** Session-local native object identity, serialized as a token; never a durable Apply authorization. */
export function atomIdentity(file: object): number {
  let id = identities.get(file); if (id === undefined) { id = ++nextIdentity; identities.set(file, id); } return id;
}
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
export interface AtomizationPlan {
  version: 1; operation: "atomization_preview"; readOnly: true;
  source: { path: string; identity: number; ctime: number; mtime: number; size: number; checksum: string; markdown: string; remaining: string };
  selected: AtomizationCandidate; context: PlanRange[];
  destination: { path: string; absent: true; markdown: string; observation: AtomizationObservation };
  additions: { title: string; source: string; separator: string; titleConfirmed: true; sourceConfirmed: true };
  confirmations: AtomizationChoice;
  basis: { path: string; identity: number; ctime: number; mtime: number; size: number; markdown: string; metadata: PlanNote["cache"]; references: PlanNote["references"] }[];
  provenance: { origin: "relationship_hint" | "manual_review"; provider: string; model: string; analysis: RelationshipAnalysis["result"]; hintIds: string[] };
  refusals: { range: PlanRange; reason: AtomizationFailure }[];
  limitations: readonly string[];
}
export const ATOMIZATION_LIMITATIONS = ["read_only_no_executor", "source_unchanged", "semantic_independence_is_user_judgment", "metadata_may_lag", "unknown_external_dependencies", "session_identity_only"] as const;

/** Whole native blocks only. A parent heading/preamble cannot silently disappear. */
export function atomizationCandidates(note: PlanNote): AtomizationCandidate[] {
  let structure: ReturnType<typeof contextGroups>;
  try { structure = contextGroups(note); } catch { throw new AtomizationError("metadata"); }
  const paragraphs: AtomizationCandidate[] = paragraphRanges(note).map(range => {
    const candidate: AtomizationCandidate = { kind: "paragraph", range, context: [] };
    try {
      validateGroupSection(note, range, structure.headings);
      requireAtom(!structure.headings.length && !note.cache?.frontmatter &&
        note.cache!.sections!.every(s => s.type === "paragraph"), "context");
      // shortcut: plain-text quotations need an attribution contract before paragraph extraction can support them.
      requireAtom(!/["“”«»]/u.test(range.text), "protected");
    } catch (e) { candidate.failure = e instanceof AtomizationError ? e.reason : "protected"; }
    return candidate;
  });
  return [...paragraphs, ...structure.groups.map((g): AtomizationCandidate => ({ kind: "section", range: g.range, context: g.context,
    failure: g.failure ? (g.failure === "hierarchy" || g.failure === "intent" ? "context" : g.failure) :
      g.copied.some(r => /["“”«»]/u.test(r.text)) ? "protected" : undefined }))];
}
export function atomizationHintIds(analysis: RelationshipAnalysis, pair: PlanPair, side: 0 | 1, candidate: AtomizationCandidate): string[] {
  return mergeHints(analysis.result, pair).filter(h => h.side === side && h.kind === (side === 0 ? "standalone_a" : "standalone_b") &&
    h.range.start >= candidate.range.start && h.range.end <= candidate.range.end).map(h => h.id);
}
export function validateAtomizationPath(path: string, configDir: string): void {
  const normalized = atomKey(path);
  requireAtom(isCanonicalMarkdownPath(path) && isCanonicalMarkdownPath(normalized) && path.endsWith(".md") && path.length <= 240 &&
    !/[\\:*?"<>|#^[\]]/u.test(normalized) && !/[\p{Cc}\p{Cf}]/u.test(path) &&
    normalized.split("/").every(p => p === p.trim() && !p.startsWith(".") && !p.endsWith(".") &&
      !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/iu.test(p) && atomKey(p) !== "node_modules") &&
    !atomKey(path).startsWith(atomKey(configDir) + "/"), "path");
}
export function buildAtomizationPlan(analysis: RelationshipAnalysis, pair: PlanPair, choice: AtomizationChoice, observation: AtomizationObservation): AtomizationPlan {
  requireAtom(JSON.stringify(Object.keys(choice).sort()) === JSON.stringify(Object.keys(emptyAtomizationChoice()).sort()), "confirmation");
  requireAtom(choice.operation === "atomization_preview" && (choice.side === 0 || choice.side === 1), "confirmation");
  requireAtom(pair.length === 2 && pair[0].path !== pair[1].path && pair[0].file !== pair[1].file, "source");
  pair.forEach((n, i) => {
    requireAtom(sameSavedNote(n, analysis.pair[i]) && n.file.path === n.path && n.created !== undefined &&
      n.created === n.file.stat.ctime && n.modified === n.file.stat.mtime && n.bytes === n.file.stat.size &&
      n.bytes === new TextEncoder().encode(n.content).byteLength, "source");
    validateAtomizationPath(n.path, observation.configDir); requireAtom(n.cache?.sections, "metadata");
  });
  let result: RelationshipAnalysis["result"];
  try { result = validateRelationshipResponse(JSON.stringify(analysis.result), pair[0].content, pair[1].content); }
  catch { throw new AtomizationError("analysis"); }
  requireAtom(!["conflicting", "insufficient_context"].includes(result.relation) &&
    !result.claims.some(c => c.kind === "conflict" || c.kind === "version_difference"), "semantic");
  const note = pair[choice.side], candidates = atomizationCandidates(note);
  const selected = candidates.find(c => c.kind === choice.kind && JSON.stringify(c.range) === JSON.stringify(choice.range));
  requireAtom(selected, "range"); requireAtom(!selected.failure, selected.failure ?? "range");
  const ranges = [...selected.context, selected.range];
  requireAtom(!mergeHints(result, pair).some(h => h.side === choice.side && h.kind === (choice.side === 0 ? "context_a" : "context_b") &&
    ranges.some(r => r.start < h.range.end && h.range.start < r.end)), "context");
  const hintIds = atomizationHintIds(analysis, pair, choice.side, selected);
  requireAtom(choice.unitConfirmed === true && choice.contextConfirmed === true && choice.titleConfirmed === true && choice.sourceConfirmed === true &&
    (hintIds.length > 0 || choice.manualConfirmed === true), "confirmation");
  requireAtom(choice.dependenciesReviewed === true && observation.metadataComplete, "dependencies");
  validateAtomizationPath(choice.path, observation.configDir);
  requireAtom(observation.path === choice.path && observation.parentExists, "path");
  const key = atomKey(choice.path), basename = key.split("/").pop()!.slice(0, -3);
  requireAtom(observation.absent && !observation.inventory.some(f => atomKey(f.path) === key || (!f.folder && atomKey(f.path).split("/").pop()!.replace(/\.[^.]+$/u, "") === basename)), "occupied");
  requireAtom(!observation.linkConflicts.length && observation.sourceLink === note.path.slice(0, -3), "link");
  requireAtom(choice.title.length > 0 && choice.title.length <= 160 && choice.title === choice.title.trim() &&
    !/[\p{Cc}\p{Cf}[\]`~<>\\^$*_#|%]/u.test(choice.title), "confirmation");
  const separator = (note.content.includes("\r\n") ? "\r\n" : "\n").repeat(2);
  const title = `# ${choice.title}`, source = `Source: [[${observation.sourceLink}]]`;
  const markdown = [title, ...ranges.map(r => r.text), source].join(separator);
  return copy({ version: 1, operation: "atomization_preview", readOnly: true,
    source: { path: note.path, identity: atomIdentity(note.file), ctime: note.created!, mtime: note.modified, size: note.bytes,
      checksum: stableHash(note.content), markdown: note.content, remaining: note.content }, selected, context: selected.context,
    destination: { path: choice.path, absent: true, markdown, observation },
    additions: { title, source, separator, titleConfirmed: true, sourceConfirmed: true }, confirmations: choice,
    basis: pair.map(n => ({ path: n.path, identity: atomIdentity(n.file), ctime: n.created!, mtime: n.modified, size: n.bytes,
      markdown: n.content, metadata: n.cache, references: n.references })),
    provenance: { origin: hintIds.length ? "relationship_hint" : "manual_review", provider: analysis.provider, model: analysis.model, analysis: result, hintIds },
    refusals: candidates.filter(c => c.failure).map(c => ({ range: c.range, reason: c.failure! })), limitations: ATOMIZATION_LIMITATIONS });
}
/** Strict read-only reconstruction; never casts untrusted JSON into an executable plan. */
export function validateAtomizationPlan(value: unknown, analysis: RelationshipAnalysis, pair: PlanPair, choice: AtomizationChoice, observation: AtomizationObservation): AtomizationPlan {
  const expected = buildAtomizationPlan(analysis, pair, choice, observation);
  requireAtom(JSON.stringify(value) === JSON.stringify(expected), "source"); return expected;
}
