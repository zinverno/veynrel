import { describe, expect, it } from "vitest";
import reference from "../../tests/fixtures/fsrs6-reference.json";
import { createInitialSchedule, getRetrievability, nextIntervalDays, previewRatings, rateSchedule } from "./fsrs6";
import { DAY_MS, FSRS6_PARAMETERS, RECALL_POLICY } from "./policy";
import { RECALL_RATINGS } from "./types";
import type { RecallRating, RecallRatingOutcome, RecallSchedule } from "./types";
import { isRecallSchedule } from "./validation";

function expectOutcome(actual: RecallRatingOutcome, expected: RecallRatingOutcome): void {
  const { stability, difficulty, ...schedule } = actual.schedule;
  const { stability: expectedStability, difficulty: expectedDifficulty, ...expectedSchedule } = expected.schedule;
  expect(schedule).toEqual(expectedSchedule);
  expect(stability! / expectedStability!).toBeCloseTo(1, 12);
  expect(difficulty).toBeCloseTo(expectedDifficulty!, 12);
  expect(actual.rating).toBe(expected.rating);
  expect(actual.intervalMs).toBe(expected.intervalMs);
  if (expected.retrievabilityBefore === undefined) expect(actual.retrievabilityBefore).toBeUndefined();
  else expect(actual.retrievabilityBefore).toBeCloseTo(expected.retrievabilityBefore, 12);
}

describe("FSRS-6 parity with pinned py-fsrs 6.3.2 (static, no Python or network at test time)", () => {
  it("uses the exact reference parameters and Veynrel policy", () => {
    expect(reference.reference.commit).toBe("9446cb06605c597a063aeee49f7d188d42e34dc2");
    expect(FSRS6_PARAMETERS).toEqual(reference.parameters);
    expect(reference.policy).toMatchObject(RECALL_POLICY);
  });

  it.each(reference.scenarios)("matches $name", (scenario) => {
    let schedule = scenario.initial as RecallSchedule;
    expect(isRecallSchedule(schedule)).toBe(true);
    for (const review of scenario.reviews) {
      const rating = review.rating as RecallRating;
      const before = JSON.stringify(schedule);
      const preview = previewRatings(schedule, review.reviewedAt);
      const actual = rateSchedule(schedule, rating, review.reviewedAt);
      expectOutcome(actual, review.expected as RecallRatingOutcome);
      expect(JSON.stringify(actual)).toBe(JSON.stringify(preview[rating]));
      expect(JSON.stringify(actual)).toBe(JSON.stringify(rateSchedule(schedule, rating, review.reviewedAt)));
      expect(JSON.stringify(schedule)).toBe(before);
      expect(isRecallSchedule(actual.schedule)).toBe(true);
      schedule = actual.schedule;
    }
  });

  it.each(reference.retrievability)("matches retrievability $name", ({ schedule, at, expected }) => {
    const actual = getRetrievability(schedule as RecallSchedule, at);
    if (expected === null) expect(actual).toBeUndefined();
    else {
      expect(actual).toBeCloseTo(expected, 12);
      expect(actual).toBeGreaterThanOrEqual(0); expect(actual).toBeLessThanOrEqual(1);
    }
  });

  it.each(reference.intervals)("matches bounded, half-even interval at stability $stability", ({ stability, days }) => {
    expect(nextIntervalDays(stability)).toBe(days);
  });
});

describe("Recall scheduler contracts", () => {
  const firstSeen = 1_000;
  const initial = createInitialSchedule(firstSeen);
  const reviewed = rateSchedule(initial, "easy", firstSeen).schedule;

  it("starts due immediately with no memory and returns independent rating previews", () => {
    expect(initial).toEqual({ algorithm: "fsrs-6", policyVersion: 1, phase: "learning", step: 0,
      dueAt: firstSeen, reviewCount: 0, lapseCount: 0 });
    const preview = previewRatings(Object.freeze(initial), firstSeen);
    expect(Object.keys(preview)).toEqual(RECALL_RATINGS);
    Object.assign(preview.again.schedule, { reviewCount: 900 });
    expect(preview.good.schedule.reviewCount).toBe(1);
    expect(initial.reviewCount).toBe(0);
  });

  it("counts only Review Again as a lapse, including early same-day reviews", () => {
    expect(rateSchedule(initial, "again", firstSeen).schedule.lapseCount).toBe(0);
    const lapse = rateSchedule(reviewed, "again", firstSeen + 1).schedule;
    expect(lapse).toMatchObject({ phase: "relearning", step: 0, reviewCount: 2, lapseCount: 1 });
    expect(rateSchedule(lapse, "again", firstSeen + 2).schedule).toMatchObject({ reviewCount: 3, lapseCount: 1 });
  });

  it.each([firstSeen - 1, firstSeen])("rejects a stale/double review at %s", (at) => {
    expect(() => rateSchedule(reviewed, "good", at)).toThrow("Stale");
    expect(() => previewRatings(reviewed, at)).toThrow("Stale");
  });

  it.each([-1, NaN, Infinity, 0.5, 8_640_000_000_000_001])("rejects invalid epoch time %s", (at) => {
    expect(() => createInitialSchedule(at)).toThrow();
    expect(() => rateSchedule(initial, "good", at)).toThrow();
    expect(() => getRetrievability(initial, at)).toThrow();
  });

  it.each(["fail", "Good", 3, null])("rejects invalid public rating %s", (rating) => {
    expect(() => rateSchedule(initial, rating as RecallRating, firstSeen)).toThrow("rating");
  });

  it.each([NaN, Infinity, -1, 0, 0.0009])("rejects invalid stability %s", (stability) => {
    expect(() => nextIntervalDays(stability)).toThrow();
    expect(() => rateSchedule({ ...reviewed, stability }, "good", firstSeen + DAY_MS)).toThrow();
  });

  it("detects counter and timestamp overflow without producing corrupt state", () => {
    expect(() => rateSchedule({ ...reviewed, reviewCount: Number.MAX_SAFE_INTEGER }, "good", firstSeen + 1)).toThrow();
    expect(() => rateSchedule(initial, "easy", 8_640_000_000_000_000)).toThrow();
  });
});
