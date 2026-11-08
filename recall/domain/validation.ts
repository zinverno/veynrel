import { hasOnlyKeys, isRecord, isTimestamp } from "../../health/domain/validation";
import { MAX_ANSWER_LENGTH, MAX_QUESTION_LENGTH } from "./card";
import type { RecallCard, RecallCardCandidate } from "./card";
import { createRecallCandidate, isCardText, isRecallId, isRecallPath } from "./identity";
import { isRecallSchedule } from "../scheduler/validation";

const LEGACY_SOURCE_KEYS = ["id", "fingerprint", "path", "question", "answer"];
const LEGACY_CARD_KEYS = [...LEGACY_SOURCE_KEYS, "firstSeenAt", "lastSeenAt", "state"];

const SOURCE_KEYS = [...LEGACY_SOURCE_KEYS, "kind", "studyTags", "vocabulary", "sourceKey"];
const CARD_KEYS = [...SOURCE_KEYS, "firstSeenAt", "lastSeenAt", "state"];

function hasValidIdentity(value: Record<string, unknown>, legacy = false): boolean {
  if (!isRecallId(value.id) || !isRecallPath(value.path) || !isCardText(value.question, MAX_QUESTION_LENGTH) ||
      value.question.includes("::") || !isCardText(value.answer, MAX_ANSWER_LENGTH)) return false;
  try {
    if (!legacy && (value.kind === undefined || value.sourceKey === undefined || !Array.isArray(value.studyTags))) return false;
    const expected = createRecallCandidate(legacy ? { path: value.path, question: value.question, answer: value.answer } : value as unknown as RecallCardCandidate);
    return value.fingerprint === expected.fingerprint && value.id === expected.id &&
      (legacy || JSON.stringify(value.studyTags) === JSON.stringify(expected.studyTags));
  } catch { return false; }
}

export function isRecallCandidate(value: unknown): value is RecallCardCandidate {
  return isRecord(value) && hasOnlyKeys(value, SOURCE_KEYS) && hasValidIdentity(value);
}

function hasValidCardMetadata(value: Record<string, unknown>, legacy = false): boolean {
  return hasValidIdentity(value, legacy) && isTimestamp(value.firstSeenAt) && isTimestamp(value.lastSeenAt) &&
    value.firstSeenAt <= value.lastSeenAt && (value.state === "active" || value.state === "retired");
}

/** The original, strict PR #37 contract, used only for read-only migration. */
export function isRecallCardV1(value: unknown): value is Omit<RecallCard, "schedule"> {
  return isRecord(value) && hasOnlyKeys(value, LEGACY_CARD_KEYS) && hasValidCardMetadata(value, true);
}

export function isRecallCard(value: unknown): value is RecallCard {
  return isRecord(value) && hasOnlyKeys(value, [...CARD_KEYS, "schedule"]) && hasValidCardMetadata(value) &&
    isRecallSchedule(value.schedule) && (value.schedule.reviewCount !== 0 || value.schedule.dueAt === value.firstSeenAt);
}

export function isRecallCardLegacy(value: unknown): value is RecallCard {
  return isRecord(value) && hasOnlyKeys(value, [...LEGACY_CARD_KEYS, "schedule"]) && hasValidCardMetadata(value, true) &&
    isRecallSchedule(value.schedule) && (value.schedule.reviewCount !== 0 || value.schedule.dueAt === value.firstSeenAt);
}
