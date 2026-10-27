import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Recipe } from "../recipe";
import { BUILTIN_RECIPES } from "../builtins";
import { RecipeRegistry } from "../registry";
import { StudioStorage } from "../storage";
import { testAdapter } from "../testAdapter";
import { CommunityCatalog } from "./catalog";
import { CommunityInstaller } from "./install";
import { publicationPackage } from "./publication";
import { allowedResource, COMMUNITY_INDEX, COMMUNITY_LIMITS, compareVersions, parseCatalog, recipeUrl, sha256, validateEntry, verifyRecipe } from "./schema";
import type { CatalogEntry } from "./schema";
import { CommunityNetworkError } from "./transport";

const raw = readFileSync(new URL("./fixtures/recipe.json", import.meta.url), "utf8");
const entry = JSON.parse(readFileSync(new URL("./fixtures/entry.json", import.meta.url), "utf8")) as CatalogEntry;
const index = JSON.stringify({ schemaVersion: 1, entries: [entry] });
function fixture() {
  const disk = testAdapter(), storage = new StudioStorage(disk.adapter, ".test-config", "test-plugin"), registry = new RecipeRegistry(storage);
  const get = vi.fn(async (url: string, _max: number) => url === COMMUNITY_INDEX ? index : raw), transport = { get };
  return { ...disk, storage, registry, get, transport, catalog: new CommunityCatalog(storage, transport), installer: new CommunityInstaller(storage, registry) };
}
async function nextVersion() {
  const recipe = { ...(JSON.parse(raw) as Recipe), version: "1.10.0", steps: [{ type: "llm_transform", prompt: "New instructions" }], constraints: ["New constraint"], output: { format: "markdown", action: "append" } };
  const nextRaw = JSON.stringify(recipe), nextEntry = { ...entry, version: recipe.version, operations: ["append" as const], recipeUrl: recipeUrl(entry.id, recipe.version), sha256: await sha256(nextRaw) };
  return verifyRecipe(nextEntry, nextRaw);
}
describe("strict public Community v1 boundary", () => {
  it("accepts the real catalog fixture and SHA-256 without granting builtin identity", async () => {
    expect(parseCatalog(index).entries).toEqual([entry]); const p = await verifyRecipe(entry, raw); expect(p.recipe.source).toBe("user"); expect(Object.isFrozen(p)).toBe(true);
  });
  it.each([
    { extra: true }, { id: "../local" }, { id: "x".repeat(49) }, { version: "1.01.0" }, { version: "1.0" }, { version: "latest" }, { version: "1.0.0-rc.1" },
    { author: { name: "Author", url: "http://127.0.0.1" } }, { author: { name: "Author", url: "https://github.com/a?token=x" } },
    { compatibility: { recipeSchema: 2, studioApi: 1 } }, { compatibility: { recipeSchema: 1, studioApi: 99 } }, { tags: ["a", "a"] }, { tags: [7] },
    { operations: ["shell"] }, { operations: ["replace", "append"] }, { examples: { input: { en: "", ru: "x" }, output: { en: "x", ru: "x" } } },
    { name: { en: "x", ru: "x", de: "x" } }, { sha256: "f".repeat(63) }, { limitations: { en: "x".repeat(2001), ru: "x" } },
  ])("rejects unsupported fields %j", patch => expect(() => validateEntry({ ...entry, ...patch })).toThrow());
  it.each(["http://127.0.0.1/x", "https://localhost/x", "https://169.254.169.254/latest", "https://zinverno.github.io.evil/veynrel-recipes/catalog/v1/index.json", `${COMMUNITY_INDEX}?q=x`, `${COMMUNITY_INDEX}#x`, entry.recipeUrl.replace("/recipes/", "/recipes/../"), entry.recipeUrl.replace("lecture", "%6cecture"), entry.recipeUrl.replace("https://", "https://user:pass@"), entry.recipeUrl.replace("github.io/", "github.io:443/"), entry.recipeUrl.replace("/recipes/", "//recipes/")])("refuses noncanonical URLs before transport: %s", url => {
    expect(allowedResource(url)).toBe(false); expect(() => validateEntry({ ...entry, recipeUrl: url })).toThrow();
  });
  it("rejects malformed JSON, unknown catalog schema, duplicates and UTF-8 size overflow", () => {
    for (const r of ["{", JSON.stringify({ schemaVersion: 2, entries: [] }), JSON.stringify({ schemaVersion: 1, entries: [entry, entry] }), "я".repeat(COMMUNITY_LIMITS.index), JSON.stringify({ schemaVersion: 1, entries: [], extra: true })]) expect(() => parseCatalog(r)).toThrow();
  });
  it("compares numeric SemVer, never lexicographically", () => { expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0); expect(compareVersions("2.0.0", "1.999.9")).toBeGreaterThan(0); expect(compareVersions("1.0.0", "1.0.0")).toBe(0); });
  it("caps total multibyte entry bytes consistently with publication archives", () => {
    const example = { en: "界".repeat(6000), ru: "界".repeat(6000) };
    expect(() => validateEntry({ ...entry, examples: { input: example, output: example } })).toThrow("size");
  });
  it("rejects mismatched hashes, identity, builtin impersonation, executable steps and inconsistent operations", async () => {
    await expect(verifyRecipe(entry, raw + " ")).rejects.toThrow();
    for (const patch of [{ source: "builtin", id: "builtin.lecture-outline" }, { id: "user.other" }, { version: "1.0.1" }, { steps: [{ type: "http", url: "https://internal" }] }, { steps: [{ type: "javascript", prompt: "alert(1)" }] }, { output: { format: "markdown", action: "append" } }]) {
      const bad = JSON.stringify({ ...(JSON.parse(raw) as Recipe), ...patch }); await expect(verifyRecipe({ ...entry, sha256: await sha256(bad) }, bad)).rejects.toThrow();
    }
  });
});
describe("bounded explicit catalog and cache", () => {
  it("construction, registry and provenance load make no HTTP call or Markdown read", async () => {
    const f = fixture(); await f.registry.load(); await f.installer.load(); expect(f.get).not.toHaveBeenCalled();
    await f.catalog.refresh(); expect(f.get).toHaveBeenCalledTimes(1); expect(f.catalog.state).toBe("ready"); await f.catalog.preview(entry);
    expect(f.adapter.read).not.toHaveBeenCalledWith(expect.stringMatching(/\.md$/u)); expect(f.get.mock.calls.every(c => c.length === 2)).toBe(true);
  });
  it("uses verified stale cache across restart when offline, including downloaded Recipe", async () => {
    const f = fixture(); await f.catalog.refresh(); await f.catalog.preview(entry);
    f.get.mockRejectedValue(new CommunityNetworkError()); const loaded = new CommunityCatalog(f.storage, f.transport); await loaded.refresh();
    expect(loaded.state).toBe("cached"); expect((await loaded.preview(entry)).raw).toBe(raw); expect(f.get).toHaveBeenCalledTimes(3);
  });
  it("shows offline/error/empty and ignores torn or tampered cache", async () => {
    const f = fixture(); f.get.mockRejectedValue(new CommunityNetworkError()); await f.catalog.refresh(); expect(f.catalog.state).toBe("offline");
    f.files.set(`${f.storage.root}/community-cache.json`, "torn"); const damaged = new CommunityCatalog(f.storage, f.transport); await damaged.refresh(); expect(damaged.cacheWarning).toBe(true); expect(damaged.catalog).toBeUndefined();
    f.get.mockResolvedValue("{"); await damaged.refresh(); expect(damaged.state).toBe("error");
    f.get.mockResolvedValue('{"schemaVersion":1,"entries":[]}'); await damaged.refresh(); expect(damaged.state).toBe("empty");
  });
  it("does not trust hash-corrupt cached Recipe or changed index hashes", async () => {
    const f = fixture(); await f.catalog.refresh(); await f.catalog.preview(entry);
    const path = `${f.storage.root}/community-cache.json`, cache = JSON.parse(f.files.get(path)!) as { recipes: { raw: string }[] }; cache.recipes[0].raw += " "; f.files.set(path, JSON.stringify(cache));
    f.get.mockRejectedValue(new CommunityNetworkError()); const loaded = new CommunityCatalog(f.storage, f.transport); await loaded.refresh(); expect(loaded.catalog).toBeUndefined(); expect(loaded.cacheWarning).toBe(true);
    const changed = { ...entry, sha256: "0".repeat(64) }; f.get.mockResolvedValue(JSON.stringify({ schemaVersion: 1, entries: [changed] })); await f.catalog.refresh();
    f.get.mockResolvedValue(raw); await expect(f.catalog.preview(changed)).rejects.toThrow();
  });
  it("rejects a stale or arbitrary preview entry without requesting its URL", async () => {
    const f = fixture(); await expect(f.catalog.preview(entry)).rejects.toThrow(); expect(f.get).not.toHaveBeenCalled();
  });
  it("a late preview cannot corrupt a cache refreshed by another tab", async () => {
    const f = fixture(); await f.catalog.refresh(); let finish!: (raw: string) => void;
    f.get.mockImplementation(async url => url === COMMUNITY_INDEX ? '{"schemaVersion":1,"entries":[]}' : new Promise<string>(resolve => { finish = resolve; }));
    const preview = f.catalog.preview(entry); await f.catalog.refresh(); finish(raw); await expect(preview).rejects.toThrow("stale");
    f.get.mockRejectedValue(new CommunityNetworkError()); const restart = new CommunityCatalog(f.storage, f.transport); await restart.refresh();
    expect(restart.state).toBe("cached"); expect(restart.cacheWarning).toBe(false); expect(restart.catalog?.entries).toEqual([]);
  });
});
describe("separate origins and safe local installation", () => {
  it("installs idempotently, preserves old registry users and survives restart without execution", async () => {
    const f = fixture(), old = f.registry.duplicate(BUILTIN_RECIPES[0]); await f.registry.add(old);
    const preview = await verifyRecipe(entry, raw), local = await f.installer.install(preview, undefined, "replace");
    expect(local.id).toBe("user.community.lecture-outline"); expect(local.source).toBe("user"); const writes = vi.mocked(f.adapter.write).mock.calls.length;
    await f.installer.install(preview, local, "replace"); expect(vi.mocked(f.adapter.write).mock.calls).toHaveLength(writes);
    const registry = new RecipeRegistry(f.storage), installer = new CommunityInstaller(f.storage, registry); await installer.load();
    expect(installer.installed(entry.id)?.modified).toBe(false); expect(registry.list()).toContainEqual(old); expect(registry.list()).toContainEqual(local); expect(f.get).not.toHaveBeenCalled();
    expect([...f.files.keys()].every(p => p.startsWith(f.storage.root) && !p.endsWith(".md"))).toBe(true);
  });
  it("refuses preexisting user ID collision and stale consent without overwriting", async () => {
    const f = fixture(), preview = await verifyRecipe(entry, raw), collision = { ...preview.recipe, id: `user.community.${entry.id}` }; await f.registry.add(collision);
    await expect(f.installer.install(preview, undefined, "replace")).rejects.toThrow("conflict");
    await expect(f.installer.install(preview, collision, "replace")).rejects.toThrow("conflict"); expect(f.registry.list()).toContainEqual(collision);
  });
  it("updates only on explicit install and preserves locally edited copy when requested", async () => {
    const f = fixture(), local = await f.installer.install(await verifyRecipe(entry, raw), undefined, "replace");
    const edited = { ...local, steps: [{ type: "llm_transform" as const, prompt: "My personal edit" }] as [{ type: "llm_transform"; prompt: string }] };
    await f.registry.edit(edited, local); expect(f.installer.installed(entry.id)?.modified).toBe(true);
    const next = await nextVersion(); await expect(f.installer.install(next, local, "replace")).rejects.toThrow("conflict");
    const updated = await f.installer.install(next, edited, "keep-copy"); expect(updated.version).toBe("1.10.0"); expect(updated.output.action).toBe("append");
    expect(f.registry.list().filter(r => r.steps[0].prompt === "My personal edit")).toHaveLength(1); expect(f.installer.installed(entry.id)?.modified).toBe(false);
  });
  it("explicitly restores the same modified version; catalog removal never deletes it", async () => {
    const f = fixture(), p = await verifyRecipe(entry, raw), local = await f.installer.install(p, undefined, "replace");
    const edited = { ...local, description: { en: "My edit", ru: "Моя правка" } }; await f.registry.edit(edited, local);
    await f.installer.install(p, edited, "replace"); f.get.mockResolvedValue('{"schemaVersion":1,"entries":[]}'); await f.catalog.refresh(); expect(f.registry.list()).toContainEqual(local);
  });
  it("blocks community installs on torn origins or interrupted transactions while preserving local recipes", async () => {
    const f = fixture(), p = await verifyRecipe(entry, raw), local = await f.installer.install(p, undefined, "replace");
    const origin = [...f.files.keys()].find(p => p.includes("community-installs") && p.endsWith(".json"))!; f.files.set(origin, "torn");
    const loaded = new CommunityInstaller(f.storage, f.registry); await loaded.load(); expect(loaded.state).toBe("damaged"); await expect(loaded.install(p, local, "replace")).rejects.toThrow(); expect(f.registry.list()).toContainEqual(local);
  });
  it("a failure after registry save never silently resumes installation on restart", async () => {
    const f = fixture(), original = vi.mocked(f.adapter.write).getMockImplementation()!;
    vi.mocked(f.adapter.write).mockImplementation(async (path, value) => { if (path.endsWith(".done")) throw Error("disk"); return original(path, value); });
    await expect(f.installer.install(await verifyRecipe(entry, raw), undefined, "replace")).rejects.toThrow();
    const loaded = new CommunityInstaller(f.storage, new RecipeRegistry(f.storage)); await loaded.load(); expect(loaded.state).toBe("damaged"); expect(f.registry.list().some(r => r.id === `user.community.${entry.id}`)).toBe(true);
  });
  it("damaged legacy registry blocks installs and preserves original bytes", async () => {
    const f = fixture(); f.files.set(f.registry.path, "torn-old-registry"); await expect(f.installer.install(await verifyRecipe(entry, raw), undefined, "replace")).rejects.toThrow(); expect(f.files.get(f.registry.path)).toBe("torn-old-registry");
  });
  it("full library refuses before intent and permits retry after freeing a slot", async () => {
    const f = fixture(); f.files.set(f.registry.path, JSON.stringify({ schemaVersion: 1, recipes: Array.from({ length: 100 }, () => f.registry.duplicate(BUILTIN_RECIPES[0])) }));
    const p = await verifyRecipe(entry, raw); await expect(f.installer.install(p, undefined, "replace")).rejects.toThrow("size");
    expect(f.installer.state).toBe("ready"); expect([...f.files.keys()].some(p => p.includes("community-installs"))).toBe(false);
    await f.registry.remove(f.registry.list().find(r => r.source === "user")!); await f.installer.install(p, undefined, "replace"); expect(f.installer.installed(entry.id)).toBeDefined();
    const installed = f.installer.installed(entry.id)!; const edited = { ...installed.recipe, description: { en: "Edit", ru: "Правка" } }; await f.registry.edit(edited, installed.recipe);
    await expect(f.installer.install(await nextVersion(), edited, "keep-copy")).rejects.toThrow("size"); expect(f.installer.state).toBe("ready");
  });
});
describe("explicit safe publication", () => {
  it("includes only recipe and author metadata; strips local identity and default additional instructions", async () => {
    const f = fixture(), local = f.registry.duplicate((await verifyRecipe(entry, raw)).recipe);
    const { id, author, category, tags, purpose, limitations, examples } = entry;
    const packed = await publicationPackage({ ...local, parameters: { language: "source", instructions: "PRIVATE DEFAULT" } }, { id, author, category, tags, purpose, limitations, examples });
    expect(packed).not.toContain("PRIVATE DEFAULT"); expect(packed).not.toContain(local.id); const parsed = JSON.parse(packed) as { entry: CatalogEntry; recipe: string }; await verifyRecipe(parsed.entry, parsed.recipe); expect(f.adapter.read).not.toHaveBeenCalled();
    await expect(publicationPackage(local, { id, author, category, tags, purpose, limitations, examples: { input: { en: "", ru: "" }, output: examples.output } })).rejects.toThrow();
  });
});
