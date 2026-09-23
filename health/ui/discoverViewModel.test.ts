import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ getLanguage: () => "en" }));
import { setLanguage } from "../../i18n";
import type { SemanticIntelligenceSnapshot } from "../semanticIntelligencePort";
import { discoverViewModel } from "./discoverViewModel";

const snapshot: SemanticIntelligenceSnapshot = { enabled: true, state: "configured", provider: "openrouter",
  providerLabel: "OpenRouter", model: "test-model", vectorCount: 0, indexRequired: false, busy: false };
beforeEach(() => setLanguage("en"));

describe("Discover presentation from cached semantic capability", () => {
  it.each([
    ["disabled", ["enable"]], ["configured", ["check", "build", "change"]], ["busy", []],
    ["incompatible", ["rebuild", "change"]], ["error", ["check", "change"]],
  ] as const)("%s has recovery/setup actions and no usage workflows", (state, actions) => {
    const model = discoverViewModel({ ...snapshot, state, busy: state === "busy" });
    expect(model.state).toBe(state); expect(model.actions.map((action) => action.id)).toEqual(actions);
    expect(model.workflows).toEqual([]);
  });
  it("known-empty index requires explicit Build and cannot search", () => {
    const model = discoverViewModel({ ...snapshot, indexRequired: true });
    expect(model.status).toBe("Index required"); expect(model.actions.map((action) => action.id)).toEqual(["build", "change"]);
    expect(model.workflows).toEqual([]); expect(model.vectors).toBeUndefined();
  });
  it("Ready exposes exactly three workflows and safe capability details", () => {
    const model = discoverViewModel({ ...snapshot, state: "ready", vectorCount: 12431 });
    expect(model.workflows.map((workflow) => workflow.id)).toEqual(["search", "related", "duplicates"]);
    expect(model.workflows.every((workflow) => workflow.label && workflow.description)).toBe(true);
    expect(model.actions).toEqual([]); expect(model.details).toBe("OpenRouter · test-model"); expect(model.vectors).toBe("12431 vectors");
    expect(JSON.stringify(model)).not.toMatch(/embeddingSpaceId|generation|dimensions|threshold|apiKey|Ask/u);
  });
  it.each(["en", "ru"] as const)("all states/workflows use %s copy without leaking extra provider fields", (language) => {
    setLanguage(language);
    for (const state of ["disabled", "configured", "ready", "busy", "incompatible", "error"] as const) {
      const unsafe = { ...snapshot, state, busy: state === "busy", vectorCount: 1,
        rawError: "synthetic-private-response", apiKey: "synthetic-private-key" };
      const serialized = JSON.stringify(discoverViewModel(unsafe));
      expect(serialized).not.toMatch(/@discover|@semantic|synthetic-private/u);
      if (state === "ready") expect(serialized).toContain("OpenRouter · test-model");
    }
    expect(discoverViewModel().status).toBe(language === "en" ? "Semantic Intelligence required" : "Нужны семантические возможности");
  });
  it("describes the current operation without fake progress", () => {
    const model = discoverViewModel({ ...snapshot, state: "busy", busy: true, operation: "build" });
    expect(model.status).toBe("Building semantic index…"); expect(JSON.stringify(model)).not.toContain("%");
  });
});
