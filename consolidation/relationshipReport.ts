import manifest from "../manifest.json";
import { ACTIONS, RELATIONS, RELATIONSHIP_SINGLE_SCHEMA } from "./relationshipContract";
import { EVIDENCE_ISSUE_CODES } from "./relationshipDiagnostics";
import type { RelationshipView } from "./relationshipSession";

export interface RelationshipAttempt { provider: string; model: string; dispatched: boolean; completed: boolean }
const stages = {
  source: "source", tooLarge: "source", configuration: "configuration", invalidResponse: "json_contract",
  unverifiedEvidence: "evidence", inconsistent: "consistency", transport: "transport", timeout: "transport",
  aborted: "transport", network: "transport", http: "transport", provider: "transport", emptyResponse: "completion",
  invalidEnvelope: "completion", outputLimit: "completion", refused: "completion", unexpectedCompletion: "completion",
} as const;
const field = /^(response|catalog|relation|explanation(?:\.evidence)?|recommendation(?:\.evidence|\.action)?|alternatives\[[0-2]\](?:\.evidence|\.action)?|claims\[[0-7]\]\.(?:quote[AB]|evidence[AB]|kind))$/;

/** Deliberate allowlist, not serialization/redaction of raw responses or session settings. */
export function relationshipReport(view: RelationshipView, attempt?: RelationshipAttempt) {
  const reason = view.error && Object.prototype.hasOwnProperty.call(stages, view.error) ? view.error : undefined;
  return {
    version: manifest.version, build: "unknown", wireSchema: RELATIONSHIP_SINGLE_SCHEMA,
    provider: attempt && ["openrouter", "openai", "custom", "ollama"].includes(attempt.provider) ? attempt.provider : "unknown",
    model: attempt && /^(?!sk-|Bearer)[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(attempt.model) && !attempt.model.includes("://") ? attempt.model : "unknown",
    stage: reason ? stages[reason] : "unknown", code: reason ?? "unknown",
    dispatchAttempted: attempt?.dispatched ?? false,
    finishReason: attempt?.completed ? "stop" : reason === "outputLimit" ? "length" : "unknown",
    notPerformed: ["accepted_result", "recommendation_preflight", "planning", "apply"],
    issues: (view.diagnostics ?? []).filter(d => EVIDENCE_ISSUE_CODES.includes(d.code)).slice(0, 32).map(d => ({
      field: field.test(d.field) ? d.field : "unknown", code: d.code,
      ...(RELATIONS.includes(d.relation as never) ? { relation: d.relation } : {}),
      ...(ACTIONS.includes(d.action as never) ? { action: d.action } : {}),
      ...(d.side === "A" || d.side === "B" ? { side: d.side } : {}),
      ...(["string", "number", "boolean", "null", "array", "object", "undefined"].includes(d.receivedType ?? "") ? { receivedType: d.receivedType } : {}),
      ...(Number.isSafeInteger(d.matches) && d.matches! >= 0 ? { matches: d.matches } : {}),
    })),
  };
}
