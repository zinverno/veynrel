import type { RecallExtraction } from "../domain/card";

export interface RecallCoverage {
  notesSeen: number;
  notesRead: number;
  noteListComplete: boolean;
}
export interface RecallInventory extends RecallExtraction {
  /** Sorted path/mtime inventory; transient, never stored with cards. */
  readonly revision: string;
  readonly coverage: Readonly<RecallCoverage>;
}
export interface RecallSource {
  capture(signal: AbortSignal): Promise<RecallInventory>;
  captureRevision(signal: AbortSignal): Promise<string>;
  captureNote(path: string, signal: AbortSignal): Promise<{ cards: RecallExtraction["cards"]; isCurrent(): boolean }>;
}
export class RecallSourceUnavailableError extends Error {
  constructor() { super("Recall Markdown inventory is unavailable."); }
}
