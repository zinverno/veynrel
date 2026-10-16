import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
vi.mock("obsidian", () => ({ getAllTags: vi.fn() }));
import { getAllTags } from "obsidian";
import { scanTaxonomy, taxonomyExclusions } from "./taxonomyScan";
import { collectDeepAuditFiles } from "../deep/deepScope";
beforeEach(() => { vi.stubGlobal("window", { setTimeout }); });
afterEach(() => { vi.unstubAllGlobals(); });

function events() {
  const listeners = new Map<string, Set<() => void>>();
  return { listeners, on: (name: string, fn: () => void) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(fn); return { name, fn }; },
    offref: ({ name, fn }: { name: string; fn: () => void }) => { listeners.get(name)!.delete(fn); },
    emit: (name: string) => { for (const fn of listeners.get(name) ?? []) fn(); } };
}
function fixture(paths = ["A.md", "B.md", "Empty.md", "Unknown.md"]) {
  const vaultEvents = events(), metadataEvents = events();
  const caches = new Map(paths.map((path, i) => [path, i === 3 ? null : { tags: i < 2 ? [{ tag: "#role/theory" }, { tag: "#role/theory" }, { tag: "#роль/теория" }] : [], frontmatter: { tags: i === 0 ? ["role/theory", "Flat", "domain/programming/tools"] : [] } }]));
  vi.mocked(getAllTags).mockImplementation(cache => [...(cache.tags ?? []).map(tag => tag.tag), ...(cache.frontmatter?.tags as string[] ?? []).map(tag => `#${tag}`)]);
  const app = { vault: { ...vaultEvents, configDir: "Config", getMarkdownFiles: vi.fn(() => paths.map(path => ({ path, basename: path.split("/").pop()!.replace(/\.md$/, "") }))),
    read: vi.fn(), cachedRead: vi.fn(), modify: vi.fn(), create: vi.fn(), adapter: { read: vi.fn(), write: vi.fn() } },
    metadataCache: { ...metadataEvents, getFileCache: vi.fn((file: { path: string }) => caches.get(file.path)) } };
  return { app, vaultEvents, metadataEvents, caches, run: (signal = new AbortController().signal, yieldUi = async () => {}) => scanTaxonomy(app as unknown as App, [], signal, vi.fn(), yieldUi) };
}

describe("explicit metadata-only taxonomy inventory", () => {
  it("counts notes, deduplicates inline/frontmatter occurrences, retains Cyrillic and flat/nested tags", async () => {
    const f = fixture(); const result = await f.run();
    expect(result).toMatchObject({ state: "complete", total: 4, processed: 4, unavailable: 1, empty: 1 });
    expect(new Map(result.tags.map(item => [item.tag, item.notes]))).toEqual(new Map([["role/theory", 2], ["роль/теория", 2], ["Flat", 1], ["domain/programming/tools", 1]]));
    for (const call of [f.app.vault.read, f.app.vault.cachedRead, f.app.vault.modify, f.app.vault.create, f.app.vault.adapter.read, f.app.vault.adapter.write]) expect(call).not.toHaveBeenCalled();
    expect([...f.vaultEvents.listeners.values(), ...f.metadataEvents.listeners.values()].every(set => !set.size)).toBe(true);
  });
  it("distinguishes unavailable MetadataCache from empty cached lists", async () => {
    const f = fixture(); Object.assign(f.app, { metadataCache: undefined });
    expect(await f.run()).toMatchObject({ processed: 4, unavailable: 4, empty: 0, tags: [] });
  });
  it("excludes config, hidden/service/backup paths and rejects traversal without changing Deep scope", async () => {
    const paths = ["A.md", "Config/private.md", "templates/A.md", ".ai-backup/A.md", "Nested/.secret/A.md", "Backups/A.md", "Шаблоны/A.md", "/outside.md", "../outside.md", "private/A.md"];
    const f = fixture(paths);
    const result = await scanTaxonomy(f.app as unknown as App, taxonomyExclusions("private/"), new AbortController().signal, vi.fn());
    expect(result).toMatchObject({ processed: 1, excluded: 9 });
    expect(f.app.metadataCache.getFileCache.mock.calls.map(([file]) => file.path)).toEqual(["A.md"]);
    expect(() => taxonomyExclusions("/outside\n../private")).toThrow("invalid");
    expect(collectDeepAuditFiles(f.app as unknown as App).map(file => file.path)).toEqual(paths.filter(path => !["Config/private.md", "templates/A.md", ".ai-backup/A.md"].includes(path)));
  });
  it.each(["cancel", "vault", "cache"])("labels %s during batched work and removes listeners", async mode => {
    const f = fixture(Array.from({ length: 125 }, (_, i) => `${i}.md`)), abort = new AbortController(); let yields = 0;
    const result = await f.run(abort.signal, async () => { yields++; if (mode === "cancel") abort.abort(); else if (mode === "vault") f.vaultEvents.emit("modify"); else f.metadataEvents.emit("resolved"); });
    expect(yields).toBeGreaterThan(0); expect(result.state).toBe(mode === "cancel" ? "cancelled" : "stale");
    if (mode === "cancel") { expect(result.processed).toBeGreaterThan(0); expect(result.processed).toBeLessThan(125); }
    else expect(result.processed).toBe(125);
    expect([...f.vaultEvents.listeners.values(), ...f.metadataEvents.listeners.values()].every(set => !set.size)).toBe(true);
  });
  it("marks oversized/malformed cached tags as incomplete rather than proposing full coverage", async () => {
    const f = fixture(); vi.mocked(getAllTags).mockReturnValue(["#bad//tag"]);
    expect(await f.run()).toMatchObject({ state: "limited", tags: [] });
  });
  it("cancels before enumeration and also yields inside a tag-heavy note", async () => {
    const f = fixture(), before = new AbortController(); before.abort();
    expect((await f.run(before.signal)).state).toBe("cancelled"); expect(f.app.vault.getMarkdownFiles).not.toHaveBeenCalled();
    vi.mocked(getAllTags).mockReturnValue(Array.from({ length: 1000 }, (_, i) => `#role/value-${i}`));
    const abort = new AbortController(), result = await f.run(abort.signal, async () => { abort.abort(); });
    expect(result).toMatchObject({ state: "cancelled", processed: 0, tags: [] });
  });
});
