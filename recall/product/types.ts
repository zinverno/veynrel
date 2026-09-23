import type { RecallRating } from "../scheduler/types";

export interface RecallSessionSnapshot {
  readonly reviewed: number;
  readonly complete: boolean;
  readonly card?: { readonly id: string; readonly path: string; readonly question: string; readonly answer?: string };
  readonly revealed: boolean;
  readonly previews?: readonly { readonly rating: RecallRating; readonly intervalMs: number }[];
}

export interface RecallProductSnapshot {
  readonly loadState: "uninitialized" | "loading" | "ready" | "invalid" | "unsupported" | "unavailable";
  readonly firstRun: boolean;
  readonly refreshing: boolean;
  readonly reviewSaving: boolean;
  readonly recovering: boolean;
  readonly canRecover: boolean;
  readonly confirmingRecovery: boolean;
  readonly summary?: { readonly active: number; readonly due: number; readonly new: number;
    readonly learning: number; readonly review: number; readonly relearning: number };
  readonly nextDueAt?: number;
  readonly session?: RecallSessionSnapshot;
  readonly inventoryResult?: { readonly complete: boolean; readonly committed: boolean; readonly active: number };
  readonly error?: "load" | "inventory" | "review" | "session" | "recovery" | "source";
}

/** The workspace consumes product state/actions, never storage, parsing or scheduler internals. */
export interface RecallProductPort {
  initialize(): Promise<void>;
  getSnapshot(): RecallProductSnapshot;
  refreshCards(): Promise<void>;
  startSession(): void;
  revealAnswer(): void;
  rate(rating: RecallRating): Promise<void>;
  endSession(): void;
  openSourceNote(): Promise<void>;
  retryLoad(): Promise<void>;
  requestRecovery(): void;
  cancelRecovery(): void;
  recoverStorage(): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export interface RecallRecoveryPort {
  canRecover(): Promise<boolean>;
  recover(): Promise<void>;
}
