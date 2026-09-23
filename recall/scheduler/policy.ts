/** FSRS-6 defaults; provenance and the fixed Veynrel policy are documented in docs/recall-fsrs-scheduler.md. */
export const FSRS6_PARAMETERS = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
  1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
] as const);

export const VEYNREL_RECALL_SCHEDULER = Object.freeze({ algorithm: "fsrs-6", policyVersion: 1 } as const);
export const RECALL_POLICY = Object.freeze({
  desiredRetention: 0.90,
  learningStepsMs: Object.freeze([60_000, 600_000]),
  relearningStepsMs: Object.freeze([600_000]),
  maximumIntervalDays: 36500,
  fuzzing: false,
});
export const DAY_MS = 86_400_000;
export const MIN_STABILITY = 0.001;
