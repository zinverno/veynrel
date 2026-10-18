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
  const app = { vault: { configDir: "custom-config", getAllLoadedFiles: () => files, getRoot: () => root,
    getFileByPath: (p: string) => files.find(f => f instanceof TFile && f.path === p),
    getAbstractFileByPath: (p: string) => files.find(f => f.path === p), adapter: { exists } },
    metadataCache: { resolvedLinks: {}, unresolvedLinks: {}, getFileCache: () => cache, getFirstLinkpathDest: () => source } };
  return { source, other, files, cache, app, exists, read: () => readAtomizationObservation(app as unknown as App, "Atoms/New atom.md", source.path) };
}
describe("native atomization observation", () => {
  it("only queries metadata and existence, with source resolution from the future path", async () => {
    const f = fixture(); const resolver = vi.spyOn(f.app.metadataCache, "getFirstLinkpathDest");
    expect(await f.read()).toMatchObject({ absent: true, parentExists: true, sourceLink: "Sources/Original", metadataComplete: true, linkConflicts: [] });
    expect(f.exists).toHaveBeenCalledWith("Atoms/New atom.md"); expect(resolver).toHaveBeenCalledWith("Sources/Original", "Atoms/New atom.md");
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

it("checks both literal percent filenames and decoded link tokens", async () => {
  const f = fixture(); Object.assign(f.cache, { links: [{ link: "Percent%20atom", original: "[[Percent%20atom]]" }] });
  const literal = await readAtomizationObservation(f.app as unknown as App, "Atoms/Percent%20atom.md", f.source.path);
  const decoded = await readAtomizationObservation(f.app as unknown as App, "Atoms/Percent atom.md", f.source.path);
  expect(literal.linkConflicts).toContain("Other.md"); expect(decoded.linkConflicts).toContain("Other.md");
});
