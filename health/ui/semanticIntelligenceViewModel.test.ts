import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ getLanguage: () => "en" }));
import { setLanguage } from "../../i18n";
import type { SemanticIntelligenceSnapshot } from "../semanticIntelligencePort";
import { semanticIntelligenceViewModel, semanticSetupCopy, semanticSetupError } from "./semanticIntelligenceViewModel";

const snapshot: SemanticIntelligenceSnapshot = { enabled: true, state: "configured", provider: "openrouter",
  providerLabel: "OpenRouter", model: "test-model", vectorCount: 0, indexRequired: false, busy: false };
beforeEach(() => setLanguage("en"));

describe("semantic capability presentation", () => {
  it.each([
    ["disabled", ["enable"]], ["configured", ["check", "build", "change"]], ["ready", ["search", "change"]],
    ["busy", []], ["incompatible", ["rebuild", "change"]], ["error", ["check", "change"]],
  ] as const)("%s offers only relevant actions", (state, expected) => {
    const model = semanticIntelligenceViewModel({ ...snapshot, state, busy: state === "busy" });
    expect(model.actions.map((action) => action.id)).toEqual(expected);
    expect(model.status).not.toContain("@semantic"); expect(model.description).not.toContain("@semantic");
  });
  it("distinguishes connected or known-empty from unchecked, and neither is Ready", () => {
    for (const model of [semanticIntelligenceViewModel(snapshot, true), semanticIntelligenceViewModel({ ...snapshot, indexRequired: true })]) {
      expect(model.status).toBe("Index required"); expect(model.actions.map((action) => action.id)).toEqual(["build", "change"]);
      expect(model.vectors).toBeUndefined();
    }
    expect(semanticIntelligenceViewModel(snapshot).status).toBe("Semantic Intelligence is configured");
  });
  it("shows no raw dimensions, generation or settings and no fake percentage", () => {
    const model = semanticIntelligenceViewModel({ ...snapshot, state: "ready", vectorCount: 25 });
    expect(model.details).toBe("OpenRouter · test-model"); expect(model.vectors).toBe("25 vectors");
    expect(JSON.stringify(model)).not.toMatch(/embeddingSpaceId|generation|dimensions|apiKey|%/u);
    expect(semanticIntelligenceViewModel({ ...snapshot, busy: true, state: "busy", operation: "build" }).status).toBe("Building semantic index…");
  });
  it.each(["en", "ru"] as const)("all setup privacy/errors have complete %s copy", (language) => {
    setLanguage(language);
    for (const mode of ["local", "cloud", "custom"] as const) {
      const copy = semanticSetupCopy(mode); expect(JSON.stringify(copy)).not.toContain("@semantic");
      for (const reason of ["invalid", "connection", "save", "busy"] as const) {
        expect(semanticSetupError({ ok: false, reason }, mode)).not.toContain("@semantic");
      }
    }
  });
});
