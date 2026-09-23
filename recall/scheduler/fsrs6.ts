import { isTimestamp } from "../../health/domain/validation";
import { DAY_MS, FSRS6_PARAMETERS as w, MIN_STABILITY, RECALL_POLICY, VEYNREL_RECALL_SCHEDULER } from "./policy";
import { RECALL_RATINGS } from "./types";
import type { RecallRating, RecallRatingOutcome, RecallSchedule } from "./types";
import { isRecallRating, isRecallSchedule } from "./validation";

// Independently expressed FSRS-6 equations; pinned reference/golden provenance lives in the scheduler doc.
const DECAY = -w[20];
const FACTOR = 0.9 ** (1 / DECAY) - 1;
const GRADES = { again: 1, hard: 2, good: 3, easy: 4 } as const;
const clampDifficulty = (difficulty: number) => Math.min(10, Math.max(1, difficulty));
const initialDifficulty = (grade: number) => w[4] - Math.exp(w[5] * (grade - 1)) + 1;
const elapsedDays = (lastReviewAt: number, at: number) => Math.max(0, Math.floor((at - lastReviewAt) / DAY_MS));
const forgettingCurve = (stability: number, days: number) => (1 + FACTOR * days / stability) ** DECAY;

export function createInitialSchedule(firstSeenAt: number): RecallSchedule {
  if (!isTimestamp(firstSeenAt)) throw new Error("Invalid Recall discovery time.");
  return { ...VEYNREL_RECALL_SCHEDULER, phase: "learning", step: 0, dueAt: firstSeenAt, reviewCount: 0, lapseCount: 0 };
}

export function getRetrievability(schedule: RecallSchedule, at: number): number | undefined {
  validateInput(schedule, at);
  if (schedule.lastReviewAt === undefined || schedule.stability === undefined) return undefined;
  return forgettingCurve(schedule.stability, elapsedDays(schedule.lastReviewAt, at));
}

/** Inverse forgetting curve, rounded like the pinned reference (nearest integer, ties to even). */
export function nextIntervalDays(stability: number): number {
  if (!Number.isFinite(stability) || stability < MIN_STABILITY) throw new Error("Invalid Recall stability.");
  const days = stability / FACTOR * (RECALL_POLICY.desiredRetention ** (1 / DECAY) - 1);
  if (!Number.isFinite(days)) throw new Error("Non-finite Recall interval.");
  const floor = Math.floor(days);
  const rounded = days - floor === 0.5 ? floor + floor % 2 : Math.round(days);
  return Math.min(RECALL_POLICY.maximumIntervalDays, Math.max(1, rounded));
}

export function rateSchedule(schedule: RecallSchedule, rating: RecallRating, reviewedAt: number): RecallRatingOutcome {
  validateInput(schedule, reviewedAt);
  if (!isRecallRating(rating)) throw new Error("Invalid Recall rating.");
  if (schedule.lastReviewAt !== undefined && reviewedAt <= schedule.lastReviewAt) throw new Error("Stale Recall review.");
  const grade = GRADES[rating];
  const retrievabilityBefore = getRetrievability(schedule, reviewedAt);
  let stability: number;
  let difficulty: number;
  if (schedule.stability === undefined || schedule.difficulty === undefined || schedule.lastReviewAt === undefined) {
    stability = w[grade - 1];
    difficulty = clampDifficulty(initialDifficulty(grade));
  } else {
    const s = schedule.stability;
    const d = schedule.difficulty;
    const r = retrievabilityBefore!;
    if (elapsedDays(schedule.lastReviewAt, reviewedAt) === 0) {
      const multiplier = Math.exp(w[17] * (grade - 3 + w[18])) * s ** -w[19];
      stability = s * (grade >= 2 ? Math.max(1, multiplier) : multiplier);
    } else if (rating === "again") {
      const lapse = w[11] * d ** -w[12] * ((s + 1) ** w[13] - 1) * Math.exp((1 - r) * w[14]);
      stability = Math.min(lapse, s / Math.exp(w[17] * w[18]));
    } else {
      const hardPenalty = rating === "hard" ? w[15] : 1;
      const easyBonus = rating === "easy" ? w[16] : 1;
      stability = s * (1 + Math.exp(w[8]) * (11 - d) * s ** -w[9] *
        (Math.exp((1 - r) * w[10]) - 1) * hardPenalty * easyBonus);
    }
    const damped = d - w[6] * (grade - 3) * (10 - d) / 9;
    // FSRS mean reversion uses the raw initial Easy difficulty, before its display-range clamp.
    difficulty = clampDifficulty(w[7] * initialDifficulty(4) + (1 - w[7]) * damped);
  }
  stability = Math.max(MIN_STABILITY, stability);
  let phase = schedule.phase;
  let step = schedule.step;
  let intervalMs: number;
  if (phase === "review") {
    if (rating === "again") { phase = "relearning"; step = 0; intervalMs = RECALL_POLICY.relearningStepsMs[0]; }
    else intervalMs = nextIntervalDays(stability) * DAY_MS;
  } else {
    const steps = phase === "learning" ? RECALL_POLICY.learningStepsMs : RECALL_POLICY.relearningStepsMs;
    if (rating === "again") { step = 0; intervalMs = steps[0]; }
    else if (rating === "hard") {
      intervalMs = step === 0 ? (steps.length === 1 ? steps[0] * 1.5 : (steps[0] + steps[1]) / 2) : steps[step!];
    } else if (rating === "good" && step! + 1 < steps.length) { step = step! + 1; intervalMs = steps[step]; }
    else { phase = "review"; step = undefined; intervalMs = nextIntervalDays(stability) * DAY_MS; }
  }
  const next: RecallSchedule = { ...VEYNREL_RECALL_SCHEDULER, phase, ...(step === undefined ? {} : { step }),
    dueAt: reviewedAt + intervalMs, lastReviewAt: reviewedAt, stability, difficulty,
    reviewCount: schedule.reviewCount + 1,
    lapseCount: schedule.lapseCount + (schedule.phase === "review" && rating === "again" ? 1 : 0), lastRating: rating };
  if (!isRecallSchedule(next)) throw new Error("Invalid Recall scheduling result.");
  return { rating, schedule: next, intervalMs, ...(retrievabilityBefore === undefined ? {} : { retrievabilityBefore }) };
}

export function previewRatings(schedule: RecallSchedule, reviewedAt: number): Record<RecallRating, RecallRatingOutcome> {
  return Object.fromEntries(RECALL_RATINGS.map((rating) => [rating, rateSchedule(schedule, rating, reviewedAt)])) as
    Record<RecallRating, RecallRatingOutcome>;
}

function validateInput(schedule: RecallSchedule, at: number): void {
  if (!isRecallSchedule(schedule)) throw new Error("Invalid Recall schedule.");
  if (!isTimestamp(at)) throw new Error("Invalid Recall review time.");
}
