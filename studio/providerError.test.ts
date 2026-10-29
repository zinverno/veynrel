import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ getLanguage: () => "en", requestUrl: vi.fn() }));
import { ApiRequestError, StructuredOutputUnavailableError } from "../api";
import { providerError } from "./providerError";
import { StudioError } from "./recipe";
import { errorMessage } from "./messages";
import { setLanguage } from "../i18n";

describe("safe Studio transport error categories", () => {
  it.each([
    [Object.assign(Error("private-body"), { name: "TimeoutError" }), "timeout"],
    [Object.assign(Error("private-body"), { name: "AbortError" }), "aborted"],
    [new ApiRequestError("http", "private-body", 401), "http"],
    [new ApiRequestError("network", "private-body"), "network"],
    [new ApiRequestError("invalidEnvelope", "private-body"), "response"],
    [new ApiRequestError("emptyResponse", "private-body"), "response"],
    [new ApiRequestError("refused", "private-body"), "provider"],
    [new StructuredOutputUnavailableError(), "capabilities"],
    [new StudioError("cancelled"), "cancelled"],
    [Error("private-body"), "provider"],
  ])("preserves a safe category without copying private messages", (error, expected) => {
    const code = providerError(error); expect(code).toBe(expected);
    for (const language of ["en", "ru"] as const) {
      setLanguage(language); expect(errorMessage(code)).not.toContain("private-body"); expect(errorMessage(code)).not.toBe(errorMessage("storage"));
    }
    setLanguage("auto");
  });
});
