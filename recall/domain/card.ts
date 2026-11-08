import type { RecallKind, VocabularyMetadata } from "./topics";
import type { RecallSchedule } from "../scheduler/types";

export interface RecallCardSource {
  readonly path: string;
  readonly question: string;
  readonly answer: string;
  readonly kind?: RecallKind;
  readonly studyTags?: readonly string[];
  readonly vocabulary?: VocabularyMetadata;
  readonly sourceKey?: string;
}

/** Plain, immutable extraction; lifecycle belongs to the store. */
export interface RecallCardCandidate extends RecallCardSource {
  readonly kind: RecallKind;
  readonly studyTags: readonly string[];
  readonly sourceKey: string;
  readonly id: string;
  readonly fingerprint: string;
}

export interface RecallCard extends RecallCardCandidate {
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
  readonly state: "active" | "retired";
  readonly schedule: RecallSchedule;
}

export function copyRecallCard(card: RecallCard): RecallCard {
  return { ...card, studyTags: [...card.studyTags], ...(card.vocabulary ? { vocabulary: { ...card.vocabulary } } : {}), schedule: { ...card.schedule } };
}

export const MAX_QUESTION_LENGTH = 2000;
export const MAX_ANSWER_LENGTH = 8000;
export const MAX_RECALL_CARDS = 10000;
export const MAX_NOTE_LENGTH = 2 * 1024 * 1024;

export type RecallDiagnosticCode = "duplicate-card" | "malformed-card" | "oversized-card" | "oversized-note" |
  "invalid-note" | "content-unavailable" | "note-changed" | "unclosed-frontmatter" | "unclosed-fence" | "unclosed-comment" |
  "invalid-vocabulary" | "inventory-limit" | "card-limit" | "stale-inventory" | "inventory-unavailable";

/** Codes and optional canonical paths only; never raw lines or exception messages. */
export interface RecallDiagnostic {
  readonly code: RecallDiagnosticCode;
  readonly path?: string;
  readonly line?: number;
}

export interface RecallExtraction {
  readonly cards: readonly RecallCardCandidate[];
  readonly diagnostics: readonly RecallDiagnostic[];
  readonly diagnosticsTruncated: number;
  readonly complete: boolean;
}
