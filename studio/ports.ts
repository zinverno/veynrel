import type { SavedNote } from "../consolidation/savedNote";

export interface StudioSource extends SavedNote { created: number }
export interface StudioNotePort {
  read(path: string): Promise<StudioSource | null>;
  guard(note: StudioSource): void;
  process(note: StudioSource, before: string, after: string, check: () => void): Promise<void>;
}
export type StudioState = "idle" | "preparing" | "prepared" | "generating" | "review" | "applying" | "partial" | "completed" | "failed" | "cancelled" | "interrupted";
export interface ReviewRow {
  path: string; before: string; after: string | null; action: "replace" | "append";
  status: "generated" | "failed" | "cancelled"; reason?: string;
}
export interface ReviewSession { id: string; recipeId: string; recipeVersion: string; rows: readonly ReviewRow[] }
export type ApplyOutcome = "applied" | "skipped" | "conflict" | "failed" | "unconfirmed";
export interface ApplyResult { path: string; outcome: ApplyOutcome; reason?: string }
