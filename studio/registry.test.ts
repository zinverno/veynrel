import { describe, expect, it, vi } from "vitest";
import { RecipeRegistry } from "./registry";
import { StudioStorage } from "./storage";
import { testAdapter } from "./testAdapter";
import { BUILTIN_RECIPES } from "./builtins";

function fixture() { const disk = testAdapter(), storage = new StudioStorage(disk.adapter, ".custom", "ai-knowledge-hub"); return { ...disk, storage, registry: new RecipeRegistry(storage) }; }
describe("Studio local registry", () => {
  it("loads new builtin versions without rewriting existing user copies", async () => {
    const f = fixture(), old = { ...f.registry.duplicate(BUILTIN_RECIPES[1]), version: "1.0.0", steps: [{ type: "llm_transform" as const, prompt: "Owner's unchanged older prompt." }] as [{ type: "llm_transform"; prompt: string }] };
    await f.registry.add(old); const before = new Map(f.files); vi.mocked(f.adapter.write).mockClear();
    const loaded = new RecipeRegistry(f.storage); await loaded.load();
    expect(loaded.list().find(r => r.id === old.id)).toEqual(old); expect(f.files).toEqual(before); expect(f.adapter.write).not.toHaveBeenCalled();
    expect(loaded.list().filter(r => r.source === "builtin").map(r => [r.id, r.version])).toEqual([
      ["builtin.smart-format", "1.0.1"], ["builtin.training-journal", "1.0.1"], ["builtin.nutrition-journal", "1.0.1"],
    ]);
  });
  it("passive load is read-only, isolated from data.json and Markdown", async () => {
    const f = fixture(); await f.registry.load(); expect(f.registry.list()).toHaveLength(3);
    expect(f.adapter.write).not.toHaveBeenCalled(); expect(f.adapter.read).not.toHaveBeenCalled(); expect(f.adapter.mkdir).not.toHaveBeenCalled();
    expect(f.registry.path).toBe(".custom/plugins/ai-knowledge-hub/studio/recipes.json");
  });
  it("creates, reloads, edits, exports/imports and removes with strict expected revisions", async () => {
    const f = fixture(), recipe = f.registry.duplicate(BUILTIN_RECIPES[0]);
    await f.registry.add(recipe); const loaded = new RecipeRegistry(f.storage); await loaded.load(); expect(loaded.list()).toContainEqual(recipe);
    const edited = { ...recipe, version: "1.0.1" }; await loaded.edit(edited, recipe);
    await expect(loaded.edit(recipe, recipe)).rejects.toThrow("conflict");
    const raw = loaded.export(edited); await loaded.remove(edited); await loaded.import(raw); expect(loaded.list()).toContainEqual(edited);
    await expect(loaded.import(raw)).rejects.toThrow("conflict");
    expect(() => loaded.remove(BUILTIN_RECIPES[0])).toThrow();
  });
  it("serializes concurrent mutations without losing records", async () => {
    const f = fixture(); await Promise.all([f.registry.add(f.registry.duplicate(BUILTIN_RECIPES[0])), f.registry.add(f.registry.duplicate(BUILTIN_RECIPES[1]))]);
    expect(f.registry.list()).toHaveLength(5);
  });
  it.each(["{", '{"schemaVersion":2,"recipes":[]}', '{"schemaVersion":1,"recipes":[],"execute":"x"}'])("retains corrupt and future-version stores: %s", async raw => {
    const f = fixture(); f.files.set(f.registry.path, raw); await f.registry.load(); expect(f.registry.state).toBe("damaged");
    await expect(f.registry.add(f.registry.duplicate(BUILTIN_RECIPES[0]))).rejects.toThrow("storage"); expect(f.files.get(f.registry.path)).toBe(raw);
    expect(f.adapter.write).not.toHaveBeenCalled();
  });
  it("preserves damaged original and restores a valid backup only on explicit recovery", async () => {
    const f = fixture(); const r = f.registry.duplicate(BUILTIN_RECIPES[0]); await f.registry.add(r); await f.registry.edit({ ...r, version: "1.1.0" }, r);
    f.files.set(f.registry.path, "torn"); const loaded = new RecipeRegistry(f.storage); await loaded.load();
    const backups = await loaded.backups(); expect(backups).toHaveLength(1); await loaded.recover(backups[0].path);
    expect(loaded.list()).toContainEqual(r); expect([...f.files.values()]).toContain("torn");
  });
  it("failed rename and restart never load empty or discard the previous library", async () => {
    const f = fixture(), r = f.registry.duplicate(BUILTIN_RECIPES[0]); await f.registry.add(r);
    const original = vi.mocked(f.adapter.rename).getMockImplementation()!; vi.mocked(f.adapter.rename).mockImplementationOnce(original).mockRejectedValueOnce(Error("disk"));
    await expect(f.registry.remove(r)).rejects.toThrow("storage");
    const loaded = new RecipeRegistry(f.storage); await loaded.load(); expect(loaded.state).toBe("damaged");
    await loaded.recover((await loaded.backups())[0].path); expect(loaded.list()).toContainEqual(r);
  });
  it("detects external registry edits instead of overwriting them", async () => {
    const f = fixture(); await f.registry.load(); f.files.set(f.registry.path, '{"schemaVersion":1,"recipes":[]}');
    await expect(f.registry.add(f.registry.duplicate(BUILTIN_RECIPES[0]))).rejects.toThrow("storage");
    expect(f.adapter.rename).not.toHaveBeenCalled();
  });
});
