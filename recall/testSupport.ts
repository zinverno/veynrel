import { vi } from "vitest";
import { createRecallCandidate } from "./domain/identity";
import type { RecallCardCandidate } from "./domain/card";

export const signal = () => new AbortController().signal;
export const candidate = (question = "Q", path = "A.md") => createRecallCandidate({ path, question, answer: "A" });
export const request = (candidates: readonly RecallCardCandidate[], observedAt = 100, complete = true) => ({ candidates, observedAt, complete });

export function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

export function memoryStorage(initial: string | null = null) {
  let bytes = initial;
  return {
    read: vi.fn(async () => bytes),
    write: vi.fn(async (raw: string) => { bytes = raw; }),
    bytes: () => bytes,
  };
}
