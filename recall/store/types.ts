import type { RecallCard, RecallCardCandidate } from "../domain/card";

export const RECALL_SCHEMA_VERSION = 4 as const;
export const MAX_RECALL_STORAGE_LENGTH = 32 * 1024 * 1024;

/** The only file is recall/cards.json. Null means missing; read errors must throw. */
export interface RecallStoragePort {
  read(): Promise<string | null>;
  /** Required before rewriting a loaded legacy schema; preserve exact original contents. */
  backupOriginal?(contents: string): Promise<void>;
  write(contents: string): Promise<void>;
}

export interface RecallCardsSnapshot {
  version: typeof RECALL_SCHEMA_VERSION;
  updatedAt: number;
  /** Absent in legacy/targeted-only inventories. Only a complete vault scan establishes coverage. */
  inventoryCompletedAt?: number;
  cards: Record<string, RecallCard>;
}

export type RecallLoadStatus = "loaded" | "missing" | "invalid" | "unsupported" | "unavailable";
export interface RecallLoadResult { status: RecallLoadStatus; writable: boolean }
export interface RecallCardFilter { state?: RecallCard["state"]; path?: string }
export interface RecallReconcileRequest {
  candidates: readonly RecallCardCandidate[];
  complete: boolean;
  /** Only this fully captured note may retire absent cards. */
  path?: string;
  observedAt: number;
}
export interface RecallReconcileResult { created: number; updated: number; retired: number }
export interface RecallCommitOptions {
  signal?: AbortSignal;
  /** Inside the serialized store queue, after validation/serialization and immediately before write. */
  beforeCommit?: () => Promise<void>;
}

export class RecallStorageBlockedError extends Error {
  constructor(readonly status: RecallLoadStatus) { super(`Recall storage is write-blocked (${status}).`); }
}
export class RecallStorageWriteError extends Error {
  constructor() { super("Recall storage could not be saved. Reload metadata before retrying."); }
}
