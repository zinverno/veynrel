import type { Finding, FindingAction, FindingCandidate, FindingEvidence, FindingSource } from "./finding";
import { findingIdFromFingerprint, isFindingId } from "./identity";
import { hasOnlyKeys, isFingerprint, isIdentifier, isOneOf, isRecord, isText, isTimestamp, isVaultPath, MAX_EVIDENCE_SNIPPET } from "./validation";

const CANDIDATE_KEYS = ["fingerprint", "analyzerId", "dimension", "type", "source", "impact", "confidence", "title", "explanation", "notePaths", "evidence", "actions"];

export function isFindingSource(value: unknown): value is FindingSource {
  return isOneOf(value, ["local", "semantic", "deep-ai", "recall"]);
}

export function isFindingAction(value: unknown): value is FindingAction {
  return isRecord(value) && hasOnlyKeys(value, ["kind", "label", "path", "relatedPath"]) &&
    isIdentifier(value.kind) && (value.label === undefined || isText(value.label, 200)) &&
    (value.path === undefined || isVaultPath(value.path)) &&
    (value.relatedPath === undefined || isVaultPath(value.relatedPath));
}

export function isFindingEvidence(value: unknown): value is FindingEvidence {
  return isRecord(value) && hasOnlyKeys(value, ["kind", "label", "value", "path", "relatedPath", "snippet"]) &&
    isIdentifier(value.kind) && (value.label === undefined || isText(value.label, 200)) &&
    (value.value === undefined || typeof value.value === "boolean" ||
      (typeof value.value === "number" && Number.isFinite(value.value)) || isText(value.value, 500)) &&
    (value.path === undefined || isVaultPath(value.path)) &&
    (value.relatedPath === undefined || isVaultPath(value.relatedPath)) &&
    (value.snippet === undefined || isText(value.snippet, MAX_EVIDENCE_SNIPPET));
}

function candidateFields(value: Record<string, unknown>): boolean {
  return isFingerprint(value.fingerprint) && isIdentifier(value.analyzerId) && isIdentifier(value.type) &&
    isOneOf(value.dimension, ["structure", "connections", "recall", "knowledge"]) &&
    isFindingSource(value.source) &&
    isOneOf(value.impact, ["info", "review", "attention"]) &&
    isOneOf(value.confidence, ["deterministic", "high", "medium"]) &&
    isText(value.title, 200) && isText(value.explanation, 2000) &&
    Array.isArray(value.notePaths) && value.notePaths.length <= 100 && Array.from(value.notePaths).every(isVaultPath) &&
    Array.isArray(value.evidence) && value.evidence.length <= 50 && Array.from(value.evidence).every(isFindingEvidence) &&
    Array.isArray(value.actions) && value.actions.length <= 20 && Array.from(value.actions).every(isFindingAction);
}

export function isFindingCandidate(value: unknown): value is FindingCandidate {
  return isRecord(value) && hasOnlyKeys(value, CANDIDATE_KEYS) && candidateFields(value);
}

export function isFinding(value: unknown): value is Finding {
  return isRecord(value) && hasOnlyKeys(value, [...CANDIDATE_KEYS, "id", "state", "firstSeenAt", "lastSeenAt", "snoozedUntil"]) &&
    candidateFields(value) && isFindingId(value.id) && isFingerprint(value.fingerprint) &&
    value.id === findingIdFromFingerprint(value.fingerprint) &&
    isOneOf(value.state, ["open", "snoozed", "dismissed", "resolved"]) &&
    isTimestamp(value.firstSeenAt) && isTimestamp(value.lastSeenAt) && value.firstSeenAt <= value.lastSeenAt &&
    (value.state === "snoozed" ? isTimestamp(value.snoozedUntil) : value.snoozedUntil === undefined);
}

export function cloneCandidate<T extends FindingCandidate>(value: T): T {
  return { ...value, notePaths: [...value.notePaths], evidence: value.evidence.map((item) => ({ ...item })), actions: value.actions.map((item) => ({ ...item })) };
}
