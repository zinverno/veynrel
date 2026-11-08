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
    backupOriginal: vi.fn(async (_raw: string) => {}),
    read: vi.fn(async () => bytes),
    write: vi.fn(async (raw: string) => { bytes = raw; }),
    bytes: () => bytes,
  };
}

/** The on-disk v1-v3 shape, deliberately without any v4 metadata. */
export function legacyCandidate(question = "Q", path = "A.md") {
  const { id, fingerprint, question: q, answer } = candidate(question, path);
  return { id, fingerprint, path, question: q, answer };
}
export function upgraded<T extends { cards: Record<string, object> }>(snapshot: T) {
  return { ...snapshot, version: 4, cards: Object.fromEntries(Object.entries(snapshot.cards).map(([id, card]) =>
    [id, { ...card, ...createRecallCandidate(card as import("./domain/card").RecallCardSource) }])) };
}
