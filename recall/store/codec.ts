import { hasOnlyKeys, isRecord, isTimestamp } from "../../health/domain/validation";
import { MAX_RECALL_CARDS } from "../domain/card";
import { isRecallCard } from "../domain/validation";
import { MAX_RECALL_STORAGE_LENGTH, RECALL_SCHEMA_VERSION } from "./types";
import type { RecallCardsSnapshot, RecallLoadStatus } from "./types";

export function isRecallSnapshot(value: unknown): value is RecallCardsSnapshot {
  if (!isRecord(value) || !hasOnlyKeys(value, ["version", "updatedAt", "cards"]) ||
      value.version !== RECALL_SCHEMA_VERSION || !isTimestamp(value.updatedAt) || !isRecord(value.cards)) return false;
  const updatedAt = value.updatedAt;
  return Object.keys(value.cards).length <= MAX_RECALL_CARDS && Object.entries(value.cards).every(([id, card]) =>
    isRecallCard(card) && id === card.id && card.lastSeenAt <= updatedAt);
}

/** Version dispatch is the migration boundary. V1 has no predecessor to migrate. Never downgrade. */
export function decodeRecall(raw: string | null): { status: RecallLoadStatus; data?: RecallCardsSnapshot } {
  if (raw === null) return { status: "missing" };
  if (raw.length > MAX_RECALL_STORAGE_LENGTH) return { status: "invalid" };
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; } catch { return { status: "invalid" }; }
  if (isRecord(value) && typeof value.version === "number" && Number.isSafeInteger(value.version) && value.version > 1) {
    return { status: "unsupported" };
  }
  return isRecallSnapshot(value) ? { status: "loaded", data: value } : { status: "invalid" };
}

export function serializeRecall(snapshot: RecallCardsSnapshot): string {
  if (!isRecallSnapshot(snapshot)) throw new Error("Invalid Recall snapshot.");
  const raw = JSON.stringify(snapshot, (_key, item: unknown) => isRecord(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item, 2) + "\n";
  if (raw.length > MAX_RECALL_STORAGE_LENGTH) throw new Error("Recall storage limit exceeded.");
  return raw;
}
