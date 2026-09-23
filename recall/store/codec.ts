import { hasOnlyKeys, isRecord, isTimestamp } from "../../health/domain/validation";
import { MAX_RECALL_CARDS } from "../domain/card";
import { isRecallCard, isRecallCardV1 } from "../domain/validation";
import { createInitialSchedule } from "../scheduler/fsrs6";
import { VEYNREL_RECALL_SCHEDULER } from "../scheduler/policy";
import { MAX_RECALL_STORAGE_LENGTH, RECALL_SCHEMA_VERSION } from "./types";
import type { RecallCardsSnapshot, RecallLoadStatus } from "./types";

export function isRecallSnapshot(value: unknown): value is RecallCardsSnapshot {
  if (!isRecord(value) || !hasOnlyKeys(value, ["version", "updatedAt", "cards"]) ||
      value.version !== RECALL_SCHEMA_VERSION || !isTimestamp(value.updatedAt) || !isRecord(value.cards)) return false;
  const updatedAt = value.updatedAt;
  return Object.keys(value.cards).length <= MAX_RECALL_CARDS && Object.entries(value.cards).every(([id, card]) =>
    isRecallCard(card) && id === card.id && card.lastSeenAt <= updatedAt &&
    (card.schedule.lastReviewAt === undefined || card.schedule.lastReviewAt <= updatedAt));
}

/** Version dispatch is the migration boundary. Loading/migrating never writes or downgrades. */
export function decodeRecall(raw: string | null): { status: RecallLoadStatus; data?: RecallCardsSnapshot } {
  if (raw === null) return { status: "missing" };
  if (raw.length > MAX_RECALL_STORAGE_LENGTH) return { status: "invalid" };
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; } catch { return { status: "invalid" }; }
  if (isRecord(value) && typeof value.version === "number" && Number.isSafeInteger(value.version) && value.version > RECALL_SCHEMA_VERSION) {
    return { status: "unsupported" };
  }
  if (isRecord(value) && value.version === 1) return migrateV1(value);
  if (isRecord(value) && value.version === 2 && isRecord(value.cards) && Object.keys(value.cards).length <= MAX_RECALL_CARDS &&
      Object.values(value.cards).some((card) => isRecord(card) && isRecord(card.schedule) && unsupportedScheduler(card.schedule))) {
    return { status: "unsupported" };
  }
  return isRecallSnapshot(value) ? { status: "loaded", data: value } : { status: "invalid" };
}

function unsupportedScheduler(schedule: Record<string, unknown>): boolean {
  return (typeof schedule.algorithm === "string" && schedule.algorithm.length > 0 && schedule.algorithm !== VEYNREL_RECALL_SCHEDULER.algorithm) ||
    (typeof schedule.policyVersion === "number" && Number.isSafeInteger(schedule.policyVersion) && schedule.policyVersion > 0 &&
      schedule.policyVersion !== VEYNREL_RECALL_SCHEDULER.policyVersion);
}

function migrateV1(value: Record<string, unknown>): ReturnType<typeof decodeRecall> {
  if (!hasOnlyKeys(value, ["version", "updatedAt", "cards"]) || !isTimestamp(value.updatedAt) || !isRecord(value.cards) ||
      Object.keys(value.cards).length > MAX_RECALL_CARDS) return { status: "invalid" };
  const cards: RecallCardsSnapshot["cards"] = {};
  for (const [id, card] of Object.entries(value.cards)) {
    if (!isRecallCardV1(card) || id !== card.id || card.lastSeenAt > value.updatedAt) return { status: "invalid" };
    cards[id] = { ...card, schedule: createInitialSchedule(card.firstSeenAt) };
  }
  return { status: "loaded", data: { version: RECALL_SCHEMA_VERSION, updatedAt: value.updatedAt, cards } };
}

export function serializeRecall(snapshot: RecallCardsSnapshot): string {
  if (!isRecallSnapshot(snapshot)) throw new Error("Invalid Recall snapshot.");
  const raw = JSON.stringify(snapshot, (_key, item: unknown) => isRecord(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item, 2) + "\n";
  if (raw.length > MAX_RECALL_STORAGE_LENGTH) throw new Error("Recall storage limit exceeded.");
  return raw;
}
