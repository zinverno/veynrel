import { appendFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App, CachedMetadata } from "obsidian";
vi.mock("obsidian", () => ({ getAllTags: (cache: CachedMetadata) => (cache.tags ?? []).map(row => row.tag) }));
import { scanTaxonomy } from "./taxonomyScan";
import { organizationSuggestions } from "./organizationAudit";
import type { WorkspaceScope } from "../health/workspace/vaultScope";
import type { TagTaxonomyProfile } from "./taxonomyProfile";

beforeEach(() => vi.stubGlobal("window", { setTimeout }));
afterEach(() => vi.unstubAllGlobals());
const tag = (value: string) => ({ tag: value, position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 1, offset: 1 } } });
function fixture(count = 6) {
  const listeners = new Set<() => void>();
  const events = { on: (_name: string, fn: () => void) => { listeners.add(fn); return fn; }, offref: (fn: () => void) => listeners.delete(fn) };
  const files = Array.from({ length: count }, (_, i) => ({ path: "Notes/" + i + ".md", basename: String(i), stat: { ctime: i, mtime: 100, size: 10 } }));
  const caches = new Map<string, CachedMetadata | null>(files.map(file => [file.path, { tags: [tag("#topic/native"), tag("#flashcards/study")], frontmatter: { type: "journal", custom: true } }]));
  const app = { vault: { ...events, configDir: ".obsidian", getAllFolders: () => [{ path: "Notes" }], getMarkdownFiles: vi.fn(() => files), read: vi.fn(), cachedRead: vi.fn(), modify: vi.fn(), create: vi.fn() },
    metadataCache: { ...events, getFileCache: vi.fn((file: { path: string }) => caches.get(file.path) ?? null) } };
  return { app, files, caches, listeners, scan: (scope: WorkspaceScope = { kind: "all" }, excluded: string[] = [], signal = new AbortController().signal, yieldUi = async () => {}) => scanTaxonomy(app as unknown as App, excluded, signal, vi.fn(), yieldUi, scope) };
}

describe("R04 reuses the taxonomy scanner for an advisory organization snapshot", () => {
  it("A: empty vault has no invented taxonomy or problems", async () => {
    const f = fixture(0), result = await f.scan();
    expect(result).toMatchObject({ total: 0, tags: [], organization: { state: "complete", sources: [], folders: [], types: [] } });
    expect(organizationSuggestions(result, null, null, [])).toEqual([]);
  });
  it("B: tagless journals and unconventional folder names remain useful observations, not problems", async () => {
    const f = fixture(4);
    for (const file of f.files) { file.path = file.path.replace("Notes/", "!My deliberate mess/"); f.caches.set(file.path, {}); }
    const result = await f.scan();
    expect(result.organization).toMatchObject({ state: "complete", metadataFreshness: "unverified", folders: [{ value: "!My deliberate mess", notes: 4 }], noPropertiesCount: 4, noTypeCount: 4 });
    expect(result.empty).toBe(4); expect(organizationSuggestions(result, null, null, [])).toEqual([]);
    expect(f.app.vault.read).not.toHaveBeenCalled(); expect(f.app.vault.modify).not.toHaveBeenCalled();
  });
  it("C: literal counts, deduplicated prefixes, bounded examples, type and source revision", async () => {
    const f = fixture(), result = await f.scan(), s = result.organization!;
    expect(s).toMatchObject({ state: "complete", types: [{ value: "journal", notes: 6 }], reasons: ["cache-freshness-unverified"] });
    expect(s.properties).toContainEqual({ value: "type", notes: 6, examples: f.files.slice(0, 5).map(f => f.path) });
    expect(s.sources[0]).toEqual({ path: "Notes/0.md", identity: "Notes/0.md:0", mtime: 100, size: 10, metadata: "available" });
    expect(s.revision).toHaveLength(16); expect(s.finishedAt).toBeGreaterThanOrEqual(s.startedAt);
    const suggestions = organizationSuggestions(result, null, null, []);
    expect(suggestions.map(s => s.value)).toEqual(["topic", "journal"]); expect(suggestions.every(s => s.origin === "hypothesis" && s.denominator === 6)).toBe(true);
    expect(suggestions.some(s => s.value === "flashcards")).toBe(false);
    expect(f.listeners.size).toBe(0);
  });
  it("D: confirmed rules have priority, rescans do not replace them and dismissed unchanged suggestions stay dismissed", async () => {
    const f = fixture(); f.caches.get("Notes/0.md")!.tags!.push(tag("#RareAllowed"));
    const result = await f.scan(); expect(result.tags).toContainEqual({ tag: "RareAllowed", notes: 1 });
    const profile: TagTaxonomyProfile = { version: 1, categories: [{ id: "mine", name: "My meaning", purpose: "other", multiplicity: "multiple", interpretation: "global", prefixes: ["topic"], tags: ["RareAllowed"] }] };
    const before = structuredClone(profile), suggestions = organizationSuggestions(result, profile, null, []);
    expect(suggestions[0].origin).toBe("rule");
    expect(organizationSuggestions(await f.scan(), profile, null, suggestions.map(s => s.id))).toEqual([]);
    expect(profile).toEqual(before);
    f.files.reverse();
    const reordered = await f.scan();
    expect(organizationSuggestions(reordered, profile, null, suggestions.map(s => s.id))).toEqual([]);
    expect(reordered.organization!.revision).toBe(result.organization!.revision);
  });
  it("scope includes descendants, excludes sibling prefixes and exposes exact denominators", async () => {
    const f = fixture(); f.files[0].path = "Notes/deep/A.md"; f.caches.set(f.files[0].path, {});
    f.files[1].path = "NotesElse/B.md"; f.files[2].path = "Else/C.md";
    const result = await f.scan({ kind: "folder", path: "Notes" }, ["Notes/3.md"]);
    expect(result).toMatchObject({ total: 4, processed: 3, excluded: 1 });
    expect(f.app.metadataCache.getFileCache.mock.calls.map(([f]) => f.path)).toEqual(["Notes/4.md", "Notes/5.md", "Notes/deep/A.md"]);
  });
  it.each(["Gone", "../Notes"])("missing/invalid folder %s cannot look like a complete empty vault", async path => {
    const snapshot = (await fixture().scan({ kind: "folder", path })).organization!;
    expect(snapshot.state).toBe("failed"); expect(snapshot.reasons).toContain("scope-missing");
  });
  it("G: missing/malformed cache is unknown, not a negative fact, and suppresses suggestions", async () => {
    const f = fixture(); f.caches.set("Notes/0.md", null); f.caches.set("Notes/1.md", { frontmatter: [] as never });
    const result = await f.scan();
    expect(result).toMatchObject({ unavailable: 1, organization: { state: "partial", noPropertiesCount: 0 } });
    expect(result.organization!.reasons).toEqual(expect.arrayContaining(["metadata-unavailable", "malformed-properties"]));
    expect(organizationSuggestions(result, null, null, [])).toEqual([]);
  });
  it("H: excludes service files/registry paths and preserves ordinary explicit negative controls", async () => {
    const f = fixture(); f.files[0].path = "node_modules/A.md"; f.files[1].path = "Templates/B.md"; f.files[2].path = ".obsidian/C.md";
    f.caches.set("Notes/3.md", { frontmatter: { "veynrel-service": "prompt" } });
    const result = await f.scan({ kind: "all" }, ["Notes/4.md"]);
    expect(result).toMatchObject({ total: 6, excluded: 5, processed: 1 });
    expect(result.organization!.sources.map(s => s.path)).toEqual(["Notes/5.md"]);
  });
  it.each(["cancelled", "stale"])("H: %s cannot publish complete suggestions", async state => {
    const f = fixture(1000), abort = new AbortController();
    const result = await f.scan({ kind: "all" }, [], abort.signal, async () => { if (state === "cancelled") abort.abort(); else f.listeners.forEach(fn => fn()); });
    expect(result.organization!.state).toBe(state); expect(organizationSuggestions(result, null, null, [])).toEqual([]); expect(f.listeners.size).toBe(0);
    if (state === "cancelled") expect(result.processed).toBeLessThan(1000);
  });
  it("similar spellings and case are never synonyms; tiny vault needs no organization", async () => {
    const f = fixture(2); f.caches.set("Notes/0.md", { tags: [tag("#topic/affect"), tag("#Topic/effect")] });
    const result = await f.scan(); expect(result.tags.map(t => t.tag)).toEqual(expect.arrayContaining(["topic/affect", "Topic/effect"]));
    expect(organizationSuggestions(result, null, null, [])).toEqual([]);
  });
  it.each([1000, 5000])("F: %i-note metadata scenario yields and remains bounded without source reads", async count => {
    const f = fixture(count), yieldUi = vi.fn(async () => {}), started = performance.now(), memory = process.memoryUsage().heapUsed;
    const result = await f.scan({ kind: "all" }, [], new AbortController().signal, yieldUi);
    expect(result.organization!.state).toBe("complete"); expect(result.processed).toBe(count); expect(yieldUi.mock.calls.length).toBeGreaterThanOrEqual(count / 50);
    expect(result.organization!.tagExamples["topic/native"]).toHaveLength(5); expect(f.app.vault.read).not.toHaveBeenCalled();
    const metrics = { organizationMetadataFixture: count, elapsedMs: performance.now() - started, heapDeltaBytes: process.memoryUsage().heapUsed - memory, yields: yieldUi.mock.calls.length };
    const output = process.env.VEYNREL_R04_METRICS;
    if (output) { expect(output).toMatch(/^\/tmp\/veynrel-r04-[a-z0-9-]+\.jsonl$/u); appendFileSync(output, JSON.stringify(metrics) + "\n"); }
  });
});
