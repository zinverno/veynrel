import { describe, expect, it, vi } from "vitest";
import type { CachedMetadata, TFile } from "obsidian";
import { parseLinktext } from "obsidian";
import { LOCAL_READ_CONCURRENCY, ObsidianLocalVaultSource } from "./obsidianLocalVaultSource";
import { createLocalAnalysisContext } from "./localNoteGraph";

vi.mock("obsidian", () => ({ parseLinktext: vi.fn((link: string) => ({ path: link.split("#")[0], subpath: link.includes("#") ? link.slice(link.indexOf("#")) : "" })) }));

function file(path: string): TFile {
  return { path, basename: path.slice(path.lastIndexOf("/") + 1, -3), extension: path.split(".").at(-1), stat: { mtime: 100, ctime: 0, size: 0 } } as TFile;
}
function cache(links: string[] = []): CachedMetadata {
  return { links: links.map((link, i) => ({ link, original: `[[${link}]]`, position: { start: { line: i, col: 0, offset: i * 100 }, end: { line: i, col: 5, offset: i * 100 + 5 } } })) };
}
function fixture(paths = ["B.md", "A.md"]) {
  const files = paths.map(file);
  const caches = new Map(files.map((item) => [item.path, cache()]));
  const app = {
    vault: { configDir: ".custom", getMarkdownFiles: vi.fn(() => files), read: vi.fn(async (item: TFile) => `Content of ${item.path}`) },
    metadataCache: { getFileCache: vi.fn((item: TFile) => caches.get(item.path) ?? null),
      getFirstLinkpathDest: vi.fn((target: string, _source: string) => files.find((item) => item.path === target || item.basename === target) ?? null) },
  };
  return { files, caches, app, source: new ObsidianLocalVaultSource(app), signal: new AbortController().signal };
}

describe("Obsidian local vault source", () => {
  it("captures deterministic plain snapshots and reads each Markdown note once", async () => {
    const f = fixture();
    const result = await f.source.capture(f.signal);
    expect(result.notes.map((item) => item.path)).toEqual(["A.md", "B.md"]);
    expect(result.notes.map((item) => item.mtime)).toEqual([100, 100]);
    expect(f.app.vault.getMarkdownFiles).toHaveBeenCalledTimes(1);
    expect(f.app.vault.read).toHaveBeenCalledTimes(2);
    expect(result.notes[0]).toEqual({ path: "A.md", basename: "A", mtime: 100, content: "Content of A.md", contentAvailable: true, linksAvailable: true, resolvedOutgoing: [], unresolvedLinks: [] });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(result.coverage).toEqual({ noteListComplete: true, linksComplete: true, contentComplete: true });
  });

  it("resolves Markdown edges, excludes attachments/self/external links, aggregates unresolved targets", async () => {
    const f = fixture(["A.md", "B.md", "image.png", ".custom/private.md"]);
    f.caches.set("A.md", cache(["B#Heading", "B", "A", "#Local", "image.png", "Missing", " Missing ", "Other", "https://example.org", "mailto:test@example.org", "//example.org", ".custom/private.md"]));
    const result = await f.source.capture(f.signal);
    const a = result.notes[0];
    expect(a.resolvedOutgoing).toEqual(["B.md"]);
    expect(a.unresolvedLinks).toEqual([{ target: "Missing", count: 2 }, { target: "Other", count: 1 }]);
    expect(f.app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith("B", "A.md");
    expect(parseLinktext).toHaveBeenCalledWith("B#Heading");
    expect(result.notes).toHaveLength(2);
  });

  it("captures supported embed, frontmatter and reference-link caches", async () => {
    const f = fixture();
    const position = cache(["B"]).links![0].position;
    f.caches.set("A.md", { embeds: [{ link: "B", original: "![[B]]", position }], frontmatterLinks: [{ link: "Property target", original: "[[Property target]]", key: "related" }], referenceLinks: [{ link: "Reference target", id: "ref", position }] });
    const result = await f.source.capture(f.signal);
    expect(result.notes[0].resolvedOutgoing).toEqual(["B.md"]);
    expect(result.notes[0].unresolvedLinks.map((link) => link.target)).toEqual(["Property target", "Reference target"]);
  });

  it("marks missing or failed metadata partial, without inventing zero-degree facts", async () => {
    const f = fixture();
    f.caches.delete("A.md");
    f.caches.set("B.md", cache(["A"]));
    const result = await f.source.capture(f.signal);
    expect(result.notes[0].linksAvailable).toBe(false);
    expect(result.coverage.linksComplete).toBe(false);
    expect(result.coverage.contentComplete).toBe(true);
    expect(result.diagnostics).toEqual([{ code: "links-unavailable", path: "A.md", message: "Note link metadata is unavailable or invalid." }]);
    const context = await createLocalAnalysisContext(result, f.signal);
    expect(context.graph.complete).toBe(false);
    expect(context.graph.incoming["A.md"]).toEqual(["B.md"]);
    f.app.metadataCache.getFileCache.mockImplementationOnce(() => { throw new Error("Private note contents"); });
    expect(JSON.stringify((await f.source.capture(f.signal)).diagnostics)).not.toContain("Private note");
  });

  it("preserves successful reads when another read fails and reports no raw exception", async () => {
    const f = fixture();
    f.app.vault.read.mockImplementation(async (item) => { if (item.path === "A.md") throw new Error("SECRET note body"); return "B content"; });
    const result = await f.source.capture(f.signal);
    expect(result.notes[0].contentAvailable).toBe(false);
    expect(result.notes[0].content).toBeUndefined();
    expect(result.notes[1].content).toBe("B content");
    expect(result.coverage).toEqual({ noteListComplete: true, contentComplete: false, linksComplete: true });
    expect(JSON.stringify(result.diagnostics)).not.toContain("SECRET");
  });

  it("applies mandatory config/root-backup exclusions and optional narrowing without excluding templates", async () => {
    const f = fixture([".custom/x.md", ".CUSTOM/Y.md", ".ai-backup-123/x.md", ".ai-backup/x.md", "Notes/.ai-backup-123/x.md", "Templates/example.md", "Archive/x.md", ".ai-backup-plan.md"]);
    const source = new ObsidianLocalVaultSource(f.app, { includes: (path) => !path.startsWith("Archive/") });
    const result = await source.capture(f.signal);
    expect(result.notes.map((item) => item.path)).toEqual([".ai-backup-plan.md", "Notes/.ai-backup-123/x.md", "Templates/example.md"]);
    expect(result.coverage.noteListComplete).toBe(true);
    expect(f.app.vault.read).toHaveBeenCalledTimes(3);
  });

  it("does not read noncanonical paths and marks the note list partial", async () => {
    const f = fixture(["../A.md", "A.md"]);
    const result = await f.source.capture(f.signal);
    expect(result.notes).toHaveLength(1);
    expect(result.coverage.noteListComplete).toBe(false);
    expect(result.diagnostics[0].path).toBeUndefined();
    expect(f.app.vault.read).toHaveBeenCalledTimes(1);
  });

  it("detects per-note changes during capture", async () => {
    const f = fixture(["A.md"]);
    f.app.vault.read.mockImplementation(async (item) => { item.stat.mtime++; return "Changed"; });
    const result = await f.source.capture(f.signal);
    expect(result.notes[0]).toMatchObject({ mtime: 100, contentAvailable: false, linksAvailable: false });
    expect(result.notes[0].content).toBeUndefined();
    expect(result.coverage.contentComplete).toBe(false);
    expect(result.coverage.linksComplete).toBe(false);
  });

  it("bounds reads and aborts promptly without waiting for unresolved Vault reads", async () => {
    const f = fixture(Array.from({ length: 40 }, (_, i) => `Note-${i}.md`));
    f.app.vault.read.mockImplementation(() => new Promise<string>(() => {}));
    const controller = new AbortController();
    const pending = f.source.capture(controller.signal);
    expect(f.app.vault.read).toHaveBeenCalledTimes(LOCAL_READ_CONCURRENCY);
    controller.abort("Private reason");
    await expect(pending).rejects.toMatchObject({ name: "AbortError", message: "Local Health analysis was cancelled." });
    expect(f.app.vault.read).toHaveBeenCalledTimes(LOCAL_READ_CONCURRENCY);
  });

  it("handles pre-abort and note-list failure distinctly", async () => {
    const f = fixture();
    const controller = new AbortController(); controller.abort();
    await expect(f.source.capture(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(f.app.vault.getMarkdownFiles).not.toHaveBeenCalled();
    f.app.vault.getMarkdownFiles.mockImplementation(() => { throw new Error("Private"); });
    await expect(f.source.capture(f.signal)).rejects.toThrow("could not obtain");
  });

  it("keeps completed reads bounded and snapshot order independent of asynchronous completion", async () => {
    const f = fixture(Array.from({ length: 25 }, (_, i) => `N${i.toString().padStart(2, "0")}.md`).reverse());
    let active = 0;
    let maximum = 0;
    f.app.vault.read.mockImplementation(async (item) => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => setTimeout(resolve, item.path === "N00.md" ? 10 : 0));
      active--;
      return item.path;
    });
    const result = await f.source.capture(f.signal);
    expect(maximum).toBe(LOCAL_READ_CONCURRENCY);
    expect(active).toBe(0);
    expect(f.app.vault.read).toHaveBeenCalledTimes(25);
    expect(result.notes.map((item) => item.content)).toEqual([...f.files.map((item) => item.path)].sort());
  });

  it("bounds diagnostics and marks unusable link targets partial", async () => {
    const f = fixture(Array.from({ length: 103 }, (_, i) => `N${i}.md`));
    f.app.metadataCache.getFileCache.mockReturnValue(null);
    const result = await f.source.capture(f.signal);
    expect(result.diagnostics).toHaveLength(100);
    expect(result.diagnosticsTruncated).toBe(3);
    expect(result.coverage.linksComplete).toBe(false);
    const invalid = fixture(["A.md"]);
    invalid.caches.set("A.md", cache(["x".repeat(4097)]));
    expect((await invalid.source.capture(invalid.signal)).coverage.linksComplete).toBe(false);
  });
});
