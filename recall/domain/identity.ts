import { stableHash } from "../../utils/stableHash";
import { isVaultPath } from "../../health/domain/validation";
import { MAX_ANSWER_LENGTH, MAX_QUESTION_LENGTH } from "./card";
import type { RecallCardCandidate, RecallCardSource } from "./card";

export function isRecallPath(value: unknown): value is string {
  return isVaultPath(value) && /\.md$/iu.test(value);
}

export function normalizeCardText(value: string): string {
  return value.replace(/\r\n?/gu, "\n").trim();
}

export function isCardText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max &&
    value === normalizeCardText(value) && !Array.from(value).some((char) => {
      const code = char.charCodeAt(0);
      return (code < 32 && code !== 9) || code === 127 || code === 0x2028 || code === 0x2029;
    });
}

/** Exact canonical vault path; deliberately reject aliases instead of repairing them. */
export function createRecallCandidate(source: RecallCardSource): RecallCardCandidate {
  if (!source || !isRecallPath(source.path) || typeof source.question !== "string" || typeof source.answer !== "string") {
    throw new Error("Invalid Recall card source.");
  }
  const question = normalizeCardText(source.question);
  const answer = normalizeCardText(source.answer);
  if (!isCardText(question, MAX_QUESTION_LENGTH) || question.includes("::") || !isCardText(answer, MAX_ANSWER_LENGTH)) {
    throw new Error("Invalid Recall card text.");
  }
  const fingerprint = `v1:${JSON.stringify([source.path, question, answer])}`;
  return Object.freeze({ id: `recall-${stableHash(fingerprint)}`, fingerprint, path: source.path, question, answer });
}

export function isRecallId(value: unknown): value is string {
  return typeof value === "string" && /^recall-[0-9a-f]{16}$/u.test(value);
}
