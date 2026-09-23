import { hasOnlyKeys, isRecord, isTimestamp } from "../../health/domain/validation";
import { MAX_ANSWER_LENGTH, MAX_QUESTION_LENGTH } from "./card";
import type { RecallCard, RecallCardCandidate } from "./card";
import { createRecallCandidate, isCardText, isRecallId, isRecallPath } from "./identity";

const SOURCE_KEYS = ["id", "fingerprint", "path", "question", "answer"];

function hasValidIdentity(value: Record<string, unknown>): boolean {
  if (!isRecallId(value.id) || !isRecallPath(value.path) || !isCardText(value.question, MAX_QUESTION_LENGTH) ||
      value.question.includes("::") || !isCardText(value.answer, MAX_ANSWER_LENGTH)) return false;
  const expected = createRecallCandidate({ path: value.path, question: value.question, answer: value.answer });
  return value.fingerprint === expected.fingerprint && value.id === expected.id;
}

export function isRecallCandidate(value: unknown): value is RecallCardCandidate {
  return isRecord(value) && hasOnlyKeys(value, SOURCE_KEYS) && hasValidIdentity(value);
}

export function isRecallCard(value: unknown): value is RecallCard {
  return isRecord(value) && hasOnlyKeys(value, [...SOURCE_KEYS, "firstSeenAt", "lastSeenAt", "state"]) &&
    hasValidIdentity(value) && isTimestamp(value.firstSeenAt) && isTimestamp(value.lastSeenAt) &&
    value.firstSeenAt <= value.lastSeenAt && (value.state === "active" || value.state === "retired");
}
