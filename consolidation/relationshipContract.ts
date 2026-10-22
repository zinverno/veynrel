import { diagnoseRelationshipEvidence } from "./relationshipDiagnostics";
import type { EvidenceDiagnostic } from "./relationshipDiagnostics";

export const RELATIONSHIP_WIRE_SCHEMA = "veynrel.relationship.refs.v1";
export const RELATIONSHIP_SINGLE_SCHEMA = "veynrel.relationship.refs.v2";

export const RELATIONS = ["same_information", "partial_overlap", "related_distinct", "conflicting", "unrelated", "insufficient_context"] as const;
export const ACTIONS = ["consider_merge", "consider_embed_b_in_a", "consider_embed_a_in_b", "consider_atomize", "add_link", "no_change", "manual_review"] as const;
export const CLAIM_KINDS = ["shared", "unique_a", "unique_b", "context_a", "context_b", "standalone_a", "standalone_b", "conflict", "version_difference", "comparison"] as const;
export type Relation = typeof RELATIONS[number];
export type Action = typeof ACTIONS[number];
export type RelationshipClaim = {
  id: string;
  text: string;
} & (
  | { kind: "shared" | "conflict" | "version_difference" | "comparison"; quoteA: string; quoteB: string }
  | { kind: "unique_a" | "context_a" | "standalone_a"; quoteA: string; quoteB: string | null }
  | { kind: "unique_b" | "context_b" | "standalone_b"; quoteA: string | null; quoteB: string }
);
export interface RelationshipRecommendation { action: Action; reason: string; evidence: string[] }
export interface RelationshipResult {
  relation: Relation;
  explanation: { text: string; evidence: string[] };
  claims: RelationshipClaim[];
  recommendation: RelationshipRecommendation;
  alternatives: RelationshipRecommendation[];
  limitations: string[];
}
export type RelationshipFailure = "source" | "tooLarge" | "configuration" | "invalidResponse" | "unverifiedEvidence" | "inconsistent" | "transport"
  | "timeout" | "aborted" | "network" | "http" | "provider" | "emptyResponse" | "invalidEnvelope" | "outputLimit" | "refused" | "unexpectedCompletion";
export class RelationshipError extends Error {
  constructor(readonly reason: RelationshipFailure, readonly diagnostics: readonly EvidenceDiagnostic[] = []) { super(reason); }
}
function requireValid(ok: unknown, reason: RelationshipFailure = "invalidResponse"): asserts ok {
  if (!ok) throw new RelationshipError(reason);
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  requireValid(value !== null && typeof value === "object" && !Array.isArray(value));
  const result = value as Record<string, unknown>;
  requireValid(Object.keys(result).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(result, key)));
  return result;
}
function text(value: unknown, max = 1600): string {
  requireValid(typeof value === "string" && value.trim().length > 0 && value.length <= max);
  return value;
}
function prose(value: unknown): string {
  const result = text(value);
  requireValid(!/\d\s*(?:%|percent|процент)/iu.test(result));
  return result;
}
function array(value: unknown, max: number): unknown[] {
  requireValid(Array.isArray(value) && value.length <= max); return value;
}
function member<T extends string>(value: unknown, allowed: readonly T[]): T {
  requireValid(typeof value === "string" && allowed.includes(value as T)); return value as T;
}
function exactQuote(value: unknown, source: string): string {
  const quote = text(value, 1200), start = source.indexOf(quote);
  // Repeated snippets are ambiguous: the model must supply wider, unique context.
  requireValid(start >= 0 && source.indexOf(quote, start + 1) === -1, "unverifiedEvidence");
  return quote;
}
function optionalQuote(value: unknown, source: string): string | null {
  return value === null ? null : exactQuote(value, source);
}

/** Exact source presence is verified; the model's interpretation is never verified fact. */
export function validateRelationshipResponse(raw: string, a: string, b: string): RelationshipResult {
  try { return validateStrict(raw, a, b); }
  catch (error) {
    if (error instanceof RelationshipError) throw new RelationshipError(error.reason, diagnoseRelationshipEvidence(raw, a, b));
    throw error;
  }
}

function validateStrict(raw: string, a: string, b: string): RelationshipResult {
  requireValid(typeof raw === "string" && raw.length <= 64000);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new RelationshipError("invalidResponse"); }
  const root = object(parsed, ["relation", "explanation", "claims", "recommendation", "alternatives", "limitations"]);
  const relation = member(root.relation, RELATIONS);
  const ids = new Set<string>();
  const claims = array(root.claims, 8).map((value): RelationshipClaim => {
    const claim = object(value, ["id", "kind", "text", "quoteA", "quoteB"]);
    const id = text(claim.id, 32); requireValid(!ids.has(id)); ids.add(id);
    const kind = member(claim.kind, CLAIM_KINDS), common = { id, text: prose(claim.text) };
    switch (kind) {
      case "unique_a": case "context_a": case "standalone_a":
        return { ...common, kind, quoteA: exactQuote(claim.quoteA, a), quoteB: optionalQuote(claim.quoteB, b) };
      case "unique_b": case "context_b": case "standalone_b":
        return { ...common, kind, quoteA: optionalQuote(claim.quoteA, a), quoteB: exactQuote(claim.quoteB, b) };
      default:
        return { ...common, kind, quoteA: exactQuote(claim.quoteA, a), quoteB: exactQuote(claim.quoteB, b) };
    }
  });
  requireValid(relation === "insufficient_context" || claims.length > 0, "unverifiedEvidence");
  const evidence = (value: unknown): string[] => {
    const refs = array(value, 8).map(ref => text(ref, 32));
    requireValid((relation === "insufficient_context" || refs.length > 0) && refs.every(ref => ids.has(ref)) && new Set(refs).size === refs.length, "unverifiedEvidence");
    return refs;
  };
  const explanation = object(root.explanation, ["text", "evidence"]);
  const kinds = new Set(claims.map(claim => claim.kind));
  const conflict = kinds.has("conflict") || kinds.has("version_difference");
  requireValid(!conflict || ["conflicting", "insufficient_context"].includes(relation), "inconsistent");
  requireValid(relation !== "conflicting" || conflict, "inconsistent");
  requireValid(!["same_information", "partial_overlap"].includes(relation) || kinds.has("shared"), "inconsistent");
  requireValid(relation !== "same_information" || !claims.some(claim => /^(unique|context|standalone)_/.test(claim.kind)), "inconsistent");
  const recommendation = (value: unknown): RelationshipRecommendation => {
    const item = object(value, ["action", "reason", "evidence"]);
    const action = member(item.action, ACTIONS), refs = evidence(item.evidence);
    if (["conflicting", "unrelated", "insufficient_context"].includes(relation)) {
      requireValid(action === "no_change" || action === "manual_review", "inconsistent");
    }
    const supports = (kind: string) => claims.some(claim => refs.includes(claim.id) && claim.kind === kind);
    if (["consider_merge", "consider_embed_b_in_a", "consider_embed_a_in_b"].includes(action)) {
      requireValid(["same_information", "partial_overlap"].includes(relation) && supports("shared"), "inconsistent");
    }
    if (action === "consider_atomize") requireValid(supports("standalone_a") || supports("standalone_b"), "inconsistent");
    return { action, reason: prose(item.reason), evidence: refs };
  };
  const result: RelationshipResult = {
    relation, claims, explanation: { text: prose(explanation.text), evidence: evidence(explanation.evidence) },
    recommendation: recommendation(root.recommendation), alternatives: array(root.alternatives, 3).map(recommendation),
    limitations: array(root.limitations, 8).map(prose),
  };
  requireValid(new Set([result.recommendation.action, ...result.alternatives.map(item => item.action)]).size === result.alternatives.length + 1);
  return result;
}
