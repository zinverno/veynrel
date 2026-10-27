import { describe, expect, it } from "vitest";
import { BUILTIN_RECIPES } from "./builtins";
import { parseRecipe, selectPaths, validateRecipe } from "./recipe";

describe("Studio declarative recipe boundary", () => {
  it("validates three frozen built-ins with explicit limits and no invented nutrition", () => {
    expect(BUILTIN_RECIPES).toHaveLength(3);
    for (const r of BUILTIN_RECIPES) { expect(validateRecipe(r)).toEqual(r); expect(Object.isFrozen(r.steps[0])).toBe(true); }
    expect(BUILTIN_RECIPES[2].steps[0].prompt).toContain("must remain unknown");
  });
  it.each([
    { schemaVersion: 2 }, { version: "latest" }, { id: "../../note" }, { id: "user.x" }, { source: "internet" },
    { input: { mode: "whole_vault" } }, { steps: [{ type: "shell", prompt: "echo" }] }, { steps: [{ type: "llm_transform", prompt: "x", url: "https://example.com" }] },
    { output: { format: "excalidraw", action: "replace" } }, { output: { format: "markdown", action: "delete" } },
    { parameters: { language: "ru", instructions: "", apiKey: "x" } }, { run: "eval(1)" }, { __extra: true },
    { limits: { maxInputCharacters: 1e8, maxOutputCharacters: 100, maxOutputTokens: 1000 } }, { constraints: [] },
    { name: { en: "x\0", ru: "x" } }, { steps: [{ type: "llm_transform", prompt: "x".repeat(8001) }] },
    { source: ["builtin"] }, { output: { format: "markdown", action: ["replace"] } },
    { parameters: { language: ["ru"], instructions: "" } },
  ])("rejects unsupported or unsafe fields %j", patch => {
    expect(() => validateRecipe({ ...BUILTIN_RECIPES[0], ...patch })).toThrow();
  });
  it("rejects malformed, oversized and prototype-shaped JSON", () => {
    for (const raw of ["{", " ".repeat(24001), '{"__proto__":{"run":"eval"}}']) expect(() => parseRecipe(raw)).toThrow();
  });
  it("selects exact paths, nested folders and equal basenames without IO", () => {
    const inventory = ["a/x.md", "a/nested/x.md", "ab/x.md", "b/x.md"];
    expect(selectPaths(inventory, { paths: ["b/x.md", "a/x.md", "a/x.md"] })).toEqual(["a/x.md", "b/x.md"]);
    expect(selectPaths(inventory, { folder: "a" })).toEqual(["a/nested/x.md", "a/x.md"]);
    expect(selectPaths(inventory, { paths: ["b/x.md"] })).toEqual(["b/x.md"]);
  });
  it("refuses empty, traversal, missing and oversized scopes without sampling", () => {
    for (const paths of [[], ["../x.md"], [".obsidian/x.md"], ["missing.md"]]) expect(() => selectPaths(["a.md"], { paths })).toThrow();
    expect(() => selectPaths(Array.from({ length: 21 }, (_, i) => `${i}.md`), { folder: "/" })).toThrow();
  });
});
