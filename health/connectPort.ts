/** Sanitized product state. Credentials and mirror contents never enter this contract. */
export type ConnectState = "disabled" | "unconfigured" | "configured" | "ready" | "syncing" | "error";
export type ConnectOperation = "connect" | "check" | "sync" | "disable";
export type ConnectError = "invalid" | "authentication" | "protocol" | "unreachable" | "server" | "save" | "changed" | "semantic-required" | "busy";
export interface ConnectSnapshot {
  state: ConnectState;
  enabled: boolean;
  busy: boolean;
  operation?: ConnectOperation;
  local: boolean;
  endpointLabel: string;
  semanticEnabled: boolean;
  semanticReady: boolean;
  mirrorKnownReady: boolean;
  lastSuccessAt?: number;
  error?: ConnectError;
}

/** Transient editing values, used only by the setup form. */
export interface ConnectDraft { mode: "local" | "remote"; endpoint: string; token: string }
export interface ConnectSyncConfirmation { local: boolean; endpointLabel: string }
export type ConnectResult = { ok: true } | { ok: false; reason: ConnectError };

export interface ConnectPort {
  getSnapshot(): ConnectSnapshot;
  createDraft(mode: ConnectDraft["mode"]): ConnectDraft;
  connect(draft: ConnectDraft): Promise<ConnectResult>;
  check(): Promise<ConnectResult>;
  createSyncConfirmation(): ConnectSyncConfirmation | undefined;
  sync(confirmation: ConnectSyncConfirmation): Promise<ConnectResult>;
  disable(): Promise<ConnectResult>;
  openProposalReview(): void;
  subscribe(listener: () => void): () => void;
}
