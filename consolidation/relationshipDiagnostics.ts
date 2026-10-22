import { ACTIONS, RELATIONS, CLAIM_KINDS } from "./relationshipContract";
export const EVIDENCE_ISSUE_CODES = ["quote_not_found", "quote_ambiguous", "quote_invalid",
  "evidence_missing", "evidence_unknown", "evidence_duplicate", "missing_standalone_evidence",
  "missing_shared_evidence", "action_relation_mismatch", "relation_evidence_mismatch",
  "reference_unknown", "reference_side_mismatch", "catalog_stale", "wire_schema_invalid", "invalid_enum"] as const;
export type EvidenceIssueCode = typeof EVIDENCE_ISSUE_CODES[number];
export interface EvidenceDiagnostic {
  field: string;
  code: EvidenceIssueCode;
  claimId?: string;
  side?: "A" | "B";
  matches?: number;
  relation?: typeof RELATIONS[number];
  action?: typeof ACTIONS[number];
  receivedType?: string;
}
const string = (v: unknown): string => typeof v === "string" ? v : "";
const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};

/** Read-only audit, never a validated result. No excerpts, paths or response bodies leave this function. */
export function diagnoseRelationshipEvidence(raw: string, a: string, b: string): EvidenceDiagnostic[] {
  if (typeof raw !== "string" || raw.length > 64000) return [];
  let root: Record<string, unknown>;
  try { root = record(JSON.parse(raw)); } catch { return []; }
  const issues: EvidenceDiagnostic[] = [];
  const claims = Array.isArray(root.claims) ? root.claims.slice(0, 8).map(record) : [];
  const enumeration = (value: unknown, values: readonly string[], field: string) => {
    if (!values.includes(string(value))) issues.push({ field, code: "invalid_enum",
      receivedType: value === null ? "null" : Array.isArray(value) ? "array" : typeof value });
  };
  enumeration(root.relation, RELATIONS, "relation");
  const kinds = new Set(claims.map(c => c.kind));
  for (const [i, c] of claims.entries()) {
    enumeration(c.kind, CLAIM_KINDS, `claims[${i}].kind`);
    const claimId = typeof c.id === "string" && /^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/.test(c.id) ? c.id : undefined;
    for (const [side, source] of [["A", a], ["B", b]] as const) {
      const quote = c[`quote${side}`], field = `claims[${i}].quote${side}`;
      const optional = side === "A" ? ["unique_b", "context_b", "standalone_b"] : ["unique_a", "context_a", "standalone_a"];
      if (quote === null && optional.includes(string(c.kind))) continue;
      if (typeof quote !== "string" || !quote.trim() || quote.length > 1200) { issues.push({ field, claimId, side, code: "quote_invalid" }); continue; }
      let matches = 0, at = -1;
      while ((at = source.indexOf(quote, at + 1)) !== -1) matches++;
      if (matches !== 1) issues.push({ field, claimId, side, matches, code: matches ? "quote_ambiguous" : "quote_not_found" });
    }
  }
  const alternatives: unknown[] = Array.isArray(root.alternatives) ? root.alternatives.slice(0, 3) : [];
  for (const [field, value] of [["explanation", root.explanation], ["recommendation", root.recommendation], ...alternatives.map((v, i) => [`alternatives[${i}]`, v])] as [string, unknown][]) {
    const item = record(value), refs = Array.isArray(item.evidence) ? item.evidence : [];
    if (field !== "explanation") enumeration(item.action, ACTIONS, `${field}.action`);
    if (!refs.length && root.relation !== "insufficient_context") issues.push({ field: `${field}.evidence`, code: "evidence_missing" });
    if (refs.some(id => !claims.some(c => c.id === id))) issues.push({ field: `${field}.evidence`, code: "evidence_unknown" });
    if (new Set(refs).size !== refs.length) issues.push({ field: `${field}.evidence`, code: "evidence_duplicate" });
    const supports = (kind: string) => claims.some(c => c.kind === kind && refs.includes(c.id));
    if (item.action === "consider_atomize" && !supports("standalone_a") && !supports("standalone_b")) issues.push({ field, code: "missing_standalone_evidence" });
    if (["consider_merge", "consider_embed_a_in_b", "consider_embed_b_in_a"].includes(string(item.action))) {
      if (!supports("shared")) issues.push({ field, code: "missing_shared_evidence" });
      if (!["same_information", "partial_overlap"].includes(string(root.relation))) issues.push({ field, code: "action_relation_mismatch" });
    }
    if (field !== "explanation" && ["conflicting", "unrelated", "insufficient_context"].includes(string(root.relation)) && !["manual_review", "no_change"].includes(string(item.action))) issues.push({ field, code: "action_relation_mismatch" });
  }
  const conflict = kinds.has("conflict") || kinds.has("version_difference");
  if ((conflict && !["conflicting", "insufficient_context"].includes(string(root.relation)))
    || (root.relation === "conflicting" && !conflict)
    || (["same_information", "partial_overlap"].includes(string(root.relation)) && !kinds.has("shared"))
    || (root.relation === "same_information" && claims.some(c => /^(unique|context|standalone)_/.test(string(c.kind)))))
    issues.push({ field: "relation", code: "relation_evidence_mismatch" });
  return issues.map(issue => {
    if (issue.code !== "action_relation_mismatch") return issue;
    const item = record(issue.field === "recommendation" ? root.recommendation : alternatives[Number(issue.field.match(/\d+/)?.[0])]);
    return { ...issue, ...(RELATIONS.includes(root.relation as never) ? { relation: root.relation as typeof RELATIONS[number] } : {}),
      ...(ACTIONS.includes(item.action as never) ? { action: item.action as typeof ACTIONS[number] } : {}) };
  });
}
