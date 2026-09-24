export type RecallAuthoringError = "unconfigured" | "source-unavailable" | "generation-failed" | "conflict" | "markdown-save-failed";
export type RecallAuthoringResult =
  | { readonly status: "success"; readonly cardCount: number }
  | { readonly status: "partial"; readonly cardCount: number; readonly reason: "recall-update-failed"; readonly needsRecovery: boolean }
  | { readonly status: "error"; readonly reason: RecallAuthoringError };

/** Safe product projection. No contents, prompts, credentials, URLs or provider responses. */
export interface RecallAuthoringSnapshot {
  readonly state: "idle" | "confirming" | "generating" | "ingesting" | "success" | "error";
  readonly configured: boolean;
  readonly sourcePath?: string;
  readonly local: boolean;
  readonly providerLabel: string;
  readonly inputLimit: number;
  readonly result?: RecallAuthoringResult;
}

export interface RecallAuthoringPort {
  getSnapshot(): RecallAuthoringSnapshot;
  requestGeneration(): void;
  cancelConfirmation(): void;
  generate(): Promise<RecallAuthoringResult | undefined>;
  subscribe(listener: () => void): () => void;
}
