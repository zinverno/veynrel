import type { RecallGenerationOptions } from "../authoring";
export type RecallAuthoringError = "unconfigured" | "source-unavailable" | "generation-failed" | "conflict" | "markdown-save-failed" | "source-too-long" | "insufficient-material" | "invalid-output" | "invalid-options" | "source-unsaved";
export type RecallAuthoringResult =
  | { readonly status: "success"; readonly cardCount: number }
  | { readonly status: "partial"; readonly cardCount: number; readonly reason: "recall-update-failed" | "editor-save-failed"; readonly needsRecovery: boolean }
  | { readonly status: "error"; readonly reason: RecallAuthoringError };

/** Safe product projection. No contents, prompts, credentials, URLs or provider responses. */
export interface RecallAuthoringSnapshot {
  readonly state: "idle" | "confirming" | "generating" | "ingesting" | "success" | "error";
  readonly configured: boolean;
  readonly sourcePath?: string;
  readonly local: boolean;
  readonly providerLabel: string;
  readonly inputLimit: number;
  readonly options?: RecallGenerationOptions;
  readonly prompt?: string;
  readonly tags?: readonly string[];
  readonly selectionLength?: number;
  readonly result?: RecallAuthoringResult;
}

export interface RecallAuthoringPort {
  configure?(options: Partial<RecallGenerationOptions>): void;
  savePrompt?(prompt?: string): Promise<void>;
  getSnapshot(): RecallAuthoringSnapshot;
  requestGeneration(): void;
  cancelConfirmation(): void;
  generate(): Promise<RecallAuthoringResult | undefined>;
  subscribe(listener: () => void): () => void;
}
