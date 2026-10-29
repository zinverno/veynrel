import { ApiRequestError, StructuredOutputUnavailableError } from "../api";
import { StudioError } from "./recipe";
import type { StudioErrorCode } from "./recipe";

/** Keep only safe categories, never provider messages, headers or response bodies. */
export function providerError(error: unknown): StudioErrorCode {
  if (error instanceof StudioError) return error.code;
  if (error instanceof StructuredOutputUnavailableError) return "capabilities";
  if (error instanceof Error && error.name === "TimeoutError") return "timeout";
  if (error instanceof Error && error.name === "AbortError") return "aborted";
  if (error instanceof ApiRequestError) {
    if (error.reason === "http" || error.reason === "network") return error.reason;
    if (error.reason === "invalidEnvelope" || error.reason === "emptyResponse") return "response";
  }
  return "provider";
}
