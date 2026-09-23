import { hasOnlyKeys, isRecord, isTimestamp } from "../../health/domain/validation";
import { MIN_STABILITY, RECALL_POLICY, VEYNREL_RECALL_SCHEDULER } from "./policy";
import { RECALL_RATINGS } from "./types";
import type { RecallRating, RecallSchedule } from "./types";

export function isRecallRating(value: unknown): value is RecallRating {
  return RECALL_RATINGS.some((rating) => rating === value);
}

export function isRecallSchedule(value: unknown): value is RecallSchedule {
  if (!isRecord(value) || !hasOnlyKeys(value, ["algorithm", "policyVersion", "phase", "step", "dueAt", "lastReviewAt",
    "stability", "difficulty", "reviewCount", "lapseCount", "lastRating"]) ||
    value.algorithm !== VEYNREL_RECALL_SCHEDULER.algorithm || value.policyVersion !== VEYNREL_RECALL_SCHEDULER.policyVersion ||
    !isTimestamp(value.dueAt) || !isCounter(value.reviewCount) || !isCounter(value.lapseCount)) return false;
  if (value.phase === "review") {
    if (value.step !== undefined) return false;
  } else if (value.phase === "learning" || value.phase === "relearning") {
    const steps = value.phase === "learning" ? RECALL_POLICY.learningStepsMs : RECALL_POLICY.relearningStepsMs;
    if (!isCounter(value.step) || value.step >= steps.length) return false;
  } else return false;
  if (value.reviewCount === 0) {
    return value.phase === "learning" && value.step === 0 && value.lapseCount === 0 &&
      value.lastReviewAt === undefined && value.stability === undefined && value.difficulty === undefined && value.lastRating === undefined;
  }
  return isTimestamp(value.lastReviewAt) && value.dueAt > value.lastReviewAt && isRecallRating(value.lastRating) &&
    typeof value.stability === "number" && Number.isFinite(value.stability) && value.stability >= MIN_STABILITY &&
    typeof value.difficulty === "number" && Number.isFinite(value.difficulty) && value.difficulty >= 1 && value.difficulty <= 10 &&
    value.lapseCount < value.reviewCount && (value.phase !== "learning" || value.lapseCount === 0) &&
    (value.phase !== "relearning" || value.lapseCount > 0);
}

function isCounter(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
