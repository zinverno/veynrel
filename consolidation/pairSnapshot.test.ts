import { afterEach, describe, expect, it, vi } from "vitest";
import type { App, CachedMetadata } from "obsidian";

vi.mock("obsidian", () => ({
  TFile: class {},
  parseFrontMatterTags: vi.fn((frontmatter?: { tags?: string[] }) => frontmatter?.tags?.map(tag => `#${tag}`) ?? null),
  requestUrl: vi.fn(),
}));
import { TFile, parseFrontMatterTags, requestUrl } from "obsidian";
import { PAIR_PREVIEW_LIMIT, readPairNote } from "./pairSnapshot";

function fixture() {
  const a = Object.assign(new TFile(), { path: "one/Same.md", basename: "Same", stat: { mtime: 1, size: 100 } });
  const b = Object.assign(new TFile(), { path: "two/Same.md", basename: "Same", stat: { mtime: 2, size: 70 } });
  const files = new Map([[a.path, a], [b.path, b]]);
  const bodies = new Map([[a.path, '---\ntags: [front]\n---\n# Own heading\nOwn #inline\n![[two/Same]]\n[[Elsewhere]]'], [b.path, 'ONLY B OWNS THIS TEXT']]);
  const metadata: CachedMetadata = {
    frontmatter: { tags: ["front"] }, tags: [{ tag: "#inline" } as never],
    links: [{ original: "[[Elsewhere]]" } as never], embeds: [{ original: "![[two/Same]]" } as never],
    frontmatterLinks: [{ key: "related", original: "[[Related]]" } as never],
    headings: [{ level: 1, heading: "Own heading" } as never], blocks: { own: {} as never },
    sections: [{ type: "heading", position: { start: { line: 3 }, end: { line: 3 } } } as never],
  };
  const app = {
    vault: {
      getFileByPath: vi.fn((path: string) => files.get(path) ?? null),
      read: vi.fn(async (file: TFile) => bodies.get(file.path)!),
      getMarkdownFiles: vi.fn(), cachedRead: vi.fn(), modify: vi.fn(), create: vi.fn(), delete: vi.fn(),
      adapter: { read: vi.fn(), write: vi.fn() },
    },
    metadataCache: {
      getFileCache: vi.fn((): CachedMetadata | null => metadata),
      resolvedLinks: { [a.path]: { [b.path]: 1 }, "deleted.md": { [a.path]: 1 } } as Record<string, Record<string, number>> | undefined,
    },
  };
  return { app, a, b, files, bodies, metadata, read: (path: string) => readPairNote(app as unknown as App, path) };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("read-only pair snapshots", () => {
  it("reads only the two exact paths with distinct current source, tags and embed references", async () => {
    const f = fixture(); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const [a, b] = await Promise.all([f.read(f.a.path), f.read(f.b.path)]);
    expect(a).toMatchObject({ state: "ready", path: "one/Same.md", name: "Same", preview: f.bodies.get(f.a.path), bytes: 100 });
    expect(b).toMatchObject({ state: "ready", path: "two/Same.md", name: "Same", preview: "ONLY B OWNS THIS TEXT" });
    expect(a.preview).not.toContain(b.preview);
    expect(a.characters).toBe(f.bodies.get(f.a.path)!.length);
    expect(parseFrontMatterTags).toHaveBeenCalledWith(f.metadata.frontmatter);
    expect(a.metadata).toMatchObject({
      frontmatterTags: { items: ["#front"], total: 1 }, inlineTags: { items: ["#inline"] },
      links: { items: ["[[Elsewhere]]"] }, embeds: { items: ["![[two/Same]]"] },
      propertyLinks: { items: ["related: [[Related]]"] }, headings: { items: ["# Own heading"] },
      blocks: { items: ["own"] }, properties: { items: ["tags"] }, sections: { items: ["heading: 4–4"] },
    });
    expect(a.incoming).toEqual({ items: [], total: 0 });
    expect(b.incoming).toEqual({ items: ["one/Same.md"], total: 1 });
    expect(f.app.vault.read.mock.calls.map(([file]) => file.path)).toEqual([f.a.path, f.b.path]);
    for (const spy of [fetch, requestUrl, f.app.vault.getMarkdownFiles, f.app.vault.cachedRead,
      f.app.vault.modify, f.app.vault.create, f.app.vault.delete, f.app.vault.adapter.read, f.app.vault.adapter.write]) expect(spy).not.toHaveBeenCalled();
  });

  it.each(["../secret.md", "/absolute.md", "C:/outside.md", "folder/../note.md", "folder\\note.md", "bad\0.md", "image.png"])("rejects unsafe or non-Markdown path %s before IO", async path => {
    const f = fixture(); expect(await f.read(path)).toEqual({ path, state: "missing" });
    expect(f.app.vault.getFileByPath).not.toHaveBeenCalled(); expect(f.app.vault.read).not.toHaveBeenCalled();
  });

  it("shows a missing side without losing the other note and never falls back to a basename", async () => {
    const f = fixture(); f.files.delete(f.a.path);
    expect(await f.read(f.a.path)).toEqual({ path: f.a.path, state: "missing" });
    expect(await f.read(f.b.path)).toMatchObject({ state: "ready" });
    expect(f.app.vault.read).toHaveBeenCalledOnce();
  });

  it.each(["modify", "delete", "rename", "replace"])("rejects a %s during asynchronous read", async action => {
    const f = fixture();
    f.app.vault.read.mockImplementationOnce(async () => {
      if (action === "modify") f.a.stat.mtime++;
      if (action === "delete") f.files.delete(f.a.path);
      if (action === "rename") f.a.path = "moved.md";
      if (action === "replace") f.files.set(f.a.path, Object.assign(new TFile(), f.a));
      return "old text";
    });
    expect(await f.read("one/Same.md")).toEqual({ path: "one/Same.md", state: "changed" });
  });

  it("reads changed content on each explicit refresh, and isolates a read error", async () => {
    const f = fixture(); await f.read(f.a.path);
    f.bodies.set(f.a.path, "new saved text"); f.a.stat.mtime++;
    expect(await f.read(f.a.path)).toMatchObject({ preview: "new saved text", modified: 2 });
    f.app.vault.read.mockRejectedValueOnce(Error("private system error"));
    expect(await f.read(f.a.path)).toEqual({ path: f.a.path, state: "error" });
    expect(await f.read(f.b.path)).toMatchObject({ state: "ready" });
  });

  it("keeps missing or broken metadata unknown without hiding source", async () => {
    const f = fixture(); f.app.metadataCache.getFileCache.mockReturnValue(null); f.app.metadataCache.resolvedLinks = undefined;
    expect(await f.read(f.a.path)).toMatchObject({ state: "ready", preview: f.bodies.get(f.a.path) });
    expect((await f.read(f.a.path)).metadata).toBeUndefined(); expect((await f.read(f.a.path)).incoming).toBeUndefined();
    f.app.metadataCache.getFileCache.mockImplementation(() => { throw Error("cache unavailable"); });
    expect((await f.read(f.a.path)).state).toBe("ready");
    expect(await readPairNote({ vault: f.app.vault } as unknown as App, f.a.path)).toMatchObject({ state: "ready" });
  });

  it("bounds long source and metadata, preserves Unicode, and supports an empty file", async () => {
    const f = fixture(); f.bodies.set(f.a.path, "x".repeat(PAIR_PREVIEW_LIMIT - 1) + "😀" + "x".repeat(50000));
    f.metadata.headings = Array.from({ length: 200 }, () => ({ heading: "heading", level: 1 }) as never);
    const a = await f.read(f.a.path);
    expect(a.preview).toBe("x".repeat(PAIR_PREVIEW_LIMIT - 1)); expect(a.characters).toBe(PAIR_PREVIEW_LIMIT + 50001);
    expect(a.metadata!.headings.items).toHaveLength(100); expect(a.metadata!.headings.total).toBe(200);
    f.bodies.set(f.a.path, ""); f.a.stat.size = 0;
    expect(await f.read(f.a.path)).toMatchObject({ state: "ready", preview: "", characters: 0, bytes: 0 });
  });
});
