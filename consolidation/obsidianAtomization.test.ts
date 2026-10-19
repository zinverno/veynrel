import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, TFolder: class {}, parseLinktext: (s: string) => ({ path: s.split(/[\^#]/u)[0] }) }));
import { TFile, TFolder } from "obsidian";
import type { App, CachedMetadata } from "obsidian";
import { readAtomizationObservation } from "./obsidianAtomization";
function fixture() {
  const source = Object.assign(new TFile(), { path: "Sources/Original.md", extension: "md", stat: { ctime: 1, mtime: 2, size: 3 } });
  const other = Object.assign(new TFile(), { path: "Other.md", extension: "md", stat: { ctime: 1, mtime: 2, size: 3 } });
  const root = Object.assign(new TFolder(), { path: "/" }); const parent = Object.assign(new TFolder(), { path: "Atoms" });
  const files = [source, other, parent], cache: CachedMetadata = { sections: [] };
  const exists = vi.fn(async () => false);
  const readText = vi.fn(async () => "unread fixture"), stat = vi.fn(async (path: string) => {
    const file = files.find(f => f instanceof TFile && f.path === path);
    return file instanceof TFile ? { type: "file", ...file.stat } : null;
  });
  const app = { vault: { configDir: "custom-config", getAllLoadedFiles: () => files, getRoot: () => root,
    getFileByPath: (p: string) => files.find(f => f instanceof TFile && f.path === p),
    getAbstractFileByPath: (p: string) => files.find(f => f.path === p), read: readText, adapter: { exists, stat } },
    metadataCache: { resolvedLinks: {}, unresolvedLinks: {}, getFileCache: (_file?: TFile) => cache, getFirstLinkpathDest: () => source } };
  return { source, other, files, cache, app, exists, readText, stat, read: () => readAtomizationObservation(app as unknown as App, "Atoms/New atom.md", source.path) };
}
describe("native atomization observation", () => {
  it("only queries metadata and existence, with source resolution from the future path", async () => {
    const f = fixture(); const resolver = vi.spyOn(f.app.metadataCache, "getFirstLinkpathDest");
    expect(await f.read()).toMatchObject({ absent: true, parentExists: true, sourceLink: "Sources/Original", metadataComplete: true, linkConflicts: [] });
    expect(f.exists).toHaveBeenCalledWith("Atoms/New atom.md"); expect(resolver).toHaveBeenCalledWith("Sources/Original", "Atoms/New atom.md");
    expect(f.readText).not.toHaveBeenCalled(); expect(f.stat).not.toHaveBeenCalled();
  });
  it.each(["links", "embeds", "frontmatterLinks"] as const)("detects %s capture even without resolved cache entries", async key => {
    const f = fixture(); Object.assign(f.cache, { [key]: [{ link: "new%20atom#Heading", original: "[[new atom#Heading]]" }] });
    expect((await f.read()).linkConflicts).toContain("Other.md");
  });
  it.each(["resolvedLinks", "unresolvedLinks"] as const)("captures existing %s and changes to observations", async key => {
    const f = fixture(); const before = await f.read(); f.app.metadataCache[key] = { "Other.md": { "New atom": 1 } };
    const after = await f.read(); expect(after.linkConflicts).toContain("Other.md"); expect(after.dependencies).not.toEqual(before.dependencies);
  });
  it("refuses alias collisions", async () => {
    const f = fixture(); f.cache.frontmatter = { aliases: ["NEW ATOM"] }; expect((await f.read()).linkConflicts).toContain("Other.md");
  });
  it("missing metadata and unresolvable source fail closed", async () => {
    const f = fixture(); f.app.metadataCache.getFileCache = () => null!; f.app.metadataCache.getFirstLinkpathDest = () => null!;
    expect(await f.read()).toMatchObject({ metadataComplete: false, sourceLink: "" });
  });
  it.each([0, 3])("missing sections on an unrelated %i-byte note are not evidence of no dependencies", async size => {
    const f = fixture(); f.other.stat.size = size;
    f.app.metadataCache.getFileCache = (file?: TFile) => file === f.other ? {} : f.cache;
    const observation = await f.read();
    expect(observation.linkConflicts).toEqual([]);
    expect(observation.metadataComplete).toBe(false);
  });
  it("checks adapter existence even when vault inventory has not caught up", async () => {
    const f = fixture(); f.exists.mockResolvedValue(true); expect((await f.read()).absent).toBe(false);
  });
  it("requires an existing, unambiguous parent folder", async () => {
    const f = fixture(); f.files.pop(); expect((await f.read()).parentExists).toBe(false);
    f.files.push(Object.assign(new TFolder(), { path: "Atoms" }), Object.assign(new TFolder(), { path: "ATOMS" }));
    expect((await f.read()).parentExists).toBe(false);
  });
  it("records identity, stats and metadata changes even with unchanged links", async () => {
    const f = fixture(); const before = await f.read(); f.cache.tags = []; f.other.stat.mtime++;
    expect((await f.read()).inventory).not.toEqual(before.inventory);
  });
});

function emptyFixture() {
  const f = fixture(); f.other.stat.size = 0; f.readText.mockResolvedValue("");
  f.app.metadataCache.getFileCache = (file?: TFile) => file === f.other ? {} : f.cache;
  return f;
}
describe("verified empty-note exception", () => {
  it("proves only the unknown empty note without reading normal metadata-backed notes", async () => {
    const f = emptyFixture(), result = await f.read();
    expect(result.metadataComplete).toBe(true);
    expect(result.inventory.find(i => i.path === f.other.path)).toMatchObject({ emptyVerified: true, size: 0 });
    expect(f.readText.mock.calls).toEqual([[f.other]]);
    expect(f.stat.mock.calls).toEqual([[f.other.path], [f.other.path], [f.other.path]]);
    expect(f.app.metadataCache.getFileCache(f.other)).toEqual({});
  });
  it.each(["text", "whitespace", "missing", "properties", "links", "resolved", "unresolved", "disk", "read-error"])("refuses %s despite apparent zero native size", kind => {
    const f = emptyFixture();
    if (kind === "text" || kind === "whitespace") f.readText.mockResolvedValue(kind === "text" ? "Text" : "\r\n");
    if (kind === "missing") f.app.metadataCache.getFileCache = () => null!;
    if (kind === "properties" || kind === "links") f.app.metadataCache.getFileCache = () => kind === "properties" ? { frontmatter: {} } : { links: [] };
    if (kind === "resolved" || kind === "unresolved") f.app.metadataCache[kind === "resolved" ? "resolvedLinks" : "unresolvedLinks"] = { "Other.md": { Target: 1 } };
    if (kind === "disk") f.stat.mockResolvedValue({ type: "file", ...f.other.stat, size: 10 });
    if (kind === "read-error") f.readText.mockRejectedValue(new Error("read"));
    return expect(f.read()).resolves.toMatchObject({ metadataComplete: false });
  });
  it.each(["identity", "path", "ctime", "mtime", "size", "cache", "dependency", "late"])("refuses %s changes during the proof", async kind => {
    const f = emptyFixture();
    const mutate = () => {
      if (kind === "identity") f.files[1] = Object.assign(new TFile(), f.other);
      if (kind === "path") f.other.path = "Renamed.md";
      if (["ctime", "mtime", "size", "late"].includes(kind)) f.other.stat[kind === "late" ? "mtime" : kind as "ctime" | "mtime" | "size"]++;
      if (kind === "cache") f.app.metadataCache.getFileCache = () => ({ sections: [] });
      if (kind === "dependency") f.app.metadataCache.unresolvedLinks = { "Other.md": { Later: 1 } };
    };
    if (kind === "late") f.exists.mockImplementation(async () => { mutate(); return false; });
    else f.readText.mockImplementation(async () => { mutate(); return ""; });
    expect((await f.read()).metadataComplete).toBe(false);
  });
  it("refuses nonempty notes without sections without reading their Markdown", async () => {
    const f = emptyFixture(); f.other.stat.size = 20;
    expect((await f.read()).metadataComplete).toBe(false); expect(f.readText).not.toHaveBeenCalled();
  });
  it.each(["footnotes", "footnoteRefs", "referenceLinks"] as const)("refuses parsed %s on an apparently empty note", async field => {
    const f = emptyFixture();
    f.app.metadataCache.getFileCache = (file?: TFile) => file === f.other ? { [field]: [] } : f.cache;
    expect((await f.read()).metadataComplete).toBe(false); expect(f.readText).not.toHaveBeenCalled();
  });
  it("rechecks the empty file on disk after the asynchronous destination observation", async () => {
    const f = emptyFixture();
    f.exists.mockImplementation(async () => { f.stat.mockResolvedValue({ type: "file", ...f.other.stat, size: 20 }); return false; });
    expect((await f.read()).metadataComplete).toBe(false);
  });
  it("accepts stable native bookkeeping only with the same exact empty-byte proof", async () => {
    const f = emptyFixture();
    f.app.metadataCache.getFileCache = (file?: TFile) => file === f.other ? { v: 1 } as CachedMetadata : f.cache;
    expect((await f.read()).metadataComplete).toBe(true); expect(f.readText).toHaveBeenCalledOnce();
    f.readText.mockImplementation(async () => { f.app.metadataCache.getFileCache = () => ({ v: 2 } as CachedMetadata); return ""; });
    expect((await f.read()).metadataComplete).toBe(false);
  });
});

it("checks both literal percent filenames and decoded link tokens", async () => {
  const f = fixture(); Object.assign(f.cache, { links: [{ link: "Percent%20atom", original: "[[Percent%20atom]]" }] });
  const literal = await readAtomizationObservation(f.app as unknown as App, "Atoms/Percent%20atom.md", f.source.path);
  const decoded = await readAtomizationObservation(f.app as unknown as App, "Atoms/Percent atom.md", f.source.path);
  expect(literal.linkConflicts).toContain("Other.md"); expect(decoded.linkConflicts).toContain("Other.md");
});
