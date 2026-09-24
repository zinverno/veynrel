export type CompanionClientErrorCode =
  | "CONFIGURATION_ERROR"
  | "AUTH_REQUIRED"
  | "PROTOCOL_VERSION_MISMATCH"
  | "DESCRIPTOR_MISMATCH"
  | "STALE_GENERATION"
  | "INVALID_RESPONSE"
  | "TIMEOUT"
  | "ABORTED"
  | "UNREACHABLE"
  | "SERVER_ERROR";

export class CompanionClientError extends Error {
  constructor(readonly code: CompanionClientErrorCode, readonly status = 0) {
    super(`Companion request failed (${code}).`);
    this.name = code === "TIMEOUT" ? "TimeoutError" : "CompanionClientError";
  }
}
