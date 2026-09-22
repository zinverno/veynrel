import { describe, expect, it, vi } from "vitest";
import type { TFile } from "obsidian";
import { createLocalVaultRevision, sameLocalVaultRevision } from "./localVaultRevision";
import { ObsidianLocalVaultSource } from "./obsidianLocalVaultSource";
import { LocalScanCoordinator } from "./localScanCoordinator";

vi.mock("obsidian", () => ({ parseLinktext: (text: string) => ({ path: text, subpath: "" }) }));
const notes = [{ path: "A.md", mtime: 100 }, { path: "B.md", mtime: 200 }];

describe("local vault revision", () => {
  it("is order independent, versioned and does not contain note paths or bodies", () => {
    const revision = createLocalVaultRevision(notes);
    expect(revision).toEqual(createLocalVaultRevision([...notes].reverse()));
    expect(revision.signature).toMatch(/^v1:\d+:[a-f0-9]{16}:[a-f0-9]{16}$/u);
    expect(revision.noteCount).toBe(2);
  });
  it.each([
    [...notes, { path: "C.md", mtime: 100 }], notes.slice(1),
    [{ ...notes[0], path: "Renamed.md" }, notes[1]], [{ ...notes[0], mtime: 101 }, notes[1]],
  ].map((changed) => ({ changed })))("detects addition/deletion/rename/mtime change", ({ changed }) => {
    expect(sameLocalVaultRevision(createLocalVaultRevision(notes), createLocalVaultRevision(changed))).toBe(false);
  });
  it("never calls two incomplete enumerations fresh", () => {
    const revision = createLocalVaultRevision(notes, false);
    expect(sameLocalVaultRevision(revision, revision)).toBe(false);
  });
  it("rejects duplicate paths and invalid inventory", () => {
    expect(() => createLocalVaultRevision([...notes, notes[0]])).toThrow("Duplicate");
    expect(() => createLocalVaultRevision([{ path: "../A.md", mtime: 10 }])).toThrow();
    expect(() => createLocalVaultRevision([{ path: "A.md", mtime: NaN }])).toThrow();
  });
  it("uses exactly the snapshot scope and performs no content or metadata reads in the probe", async () => {
    const files = ["B.md", ".config/private.md", ".ai-backup-1/A.md", "Ignore/A.md", "Templates/A.md", "A.md"].map((path) =>
      ({ path, basename: path.slice(path.lastIndexOf("/") + 1, -3), stat: { mtime: 100 } }) as TFile);
    const app = { vault: { configDir: ".config", getMarkdownFiles: vi.fn(() => files), read: vi.fn(async () => "Body") },
      metadataCache: { getFileCache: vi.fn(() => ({})), getFirstLinkpathDest: vi.fn(() => null) } };
    const source = new ObsidianLocalVaultSource(app, { includes: (path) => !path.startsWith("Ignore/") });
    const signal = new AbortController().signal;
    const revision = await source.captureRevision(signal);
    expect(revision.noteCount).toBe(3);
    expect(app.vault.read).not.toHaveBeenCalled();
    expect(app.metadataCache.getFileCache).not.toHaveBeenCalled();
    const analysis = await new LocalScanCoordinator(source).analyze(signal);
    expect(analysis.revision).toEqual(revision);
    expect(app.vault.read).toHaveBeenCalledTimes(3);
    files[0].stat.mtime++;
    expect(sameLocalVaultRevision(analysis.revision, await source.captureRevision(signal))).toBe(false);
    files.push({ ...files[0], path: "../Invalid.md" });
    expect((await source.captureRevision(signal)).complete).toBe(false);
    const cancelled = new AbortController(); cancelled.abort();
    await expect(source.captureRevision(cancelled.signal)).rejects.toMatchObject({ name: "AbortError" });
    app.vault.getMarkdownFiles.mockImplementation(() => { throw new Error("private content"); });
    await expect(source.captureRevision(signal)).rejects.toThrow("could not obtain");
  });
});
