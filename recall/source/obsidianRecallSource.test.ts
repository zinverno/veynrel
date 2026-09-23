import type { TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { MAX_RECALL_NOTES, ObsidianRecallSource, RECALL_READ_CONCURRENCY } from "./obsidianRecallSource";
import { MAX_NOTE_LENGTH } from "../domain/card";
import { signal } from "../testSupport";

function fixture(paths = ["B.md", "A.md"]) {
  const files = paths.map((path) => ({ path, stat: { mtime: 100, size: 30 } } as TFile));
  const vault = { configDir: ".custom", getMarkdownFiles: vi.fn(() => files),
    read: vi.fn(async (_file: TFile) => "PRIVATE BODY\n## Flashcards\nQ::A") };
  return { files, vault, source: new ObsidianRecallSource(vault) };
}

describe("Recall Obsidian read source", () => {
  it("does no work on construction, reads each note once, retains only immutable cards and a revision", async () => {
    const f = fixture(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled();
    const result = await f.source.capture(signal());
    expect(result.cards.map((card) => card.path)).toEqual(["A.md", "B.md"]);
    expect(result).toMatchObject({ complete: true, coverage: { notesSeen: 2, notesRead: 2, noteListComplete: true }, diagnostics: [] });
    expect(f.vault.read).toHaveBeenCalledTimes(2);
    expect(result.revision).toBe(await f.source.captureRevision(signal()));
    expect(f.vault.read).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain("PRIVATE BODY");
    expect(Object.isFrozen(result.cards[0])).toBe(true); expect(Object.isFrozen(result.coverage)).toBe(true);
  });

  it("excludes config and all backup directories, includes Templates and ordinary backup-like file names", async () => {
    const f = fixture([".custom/inside.md", ".CUSTOM/plugins/external/inside.md", ".ai-backup/a.md", ".ai-backup-123/a.md",
      "Nested/.ai-backup-123/a.md", "Templates/a.md", ".ai-backup-plan.md", "Normal.md"]);
    const result = await f.source.capture(signal());
    expect(result.cards.map((card) => card.path)).toEqual([".ai-backup-plan.md", "Normal.md", "Templates/a.md"]);
    expect(result.complete).toBe(true); expect(f.vault.read).toHaveBeenCalledTimes(3);
  });

  it("does not read invalid/duplicate paths or invalid stat data, and marks the note list incomplete", async () => {
    const f = fixture(["../Bad.md", "A.md", "A.md", "B.md"]); f.files[3].stat.mtime = NaN;
    const result = await f.source.capture(signal());
    expect(result.cards).toHaveLength(1); expect(result.complete).toBe(false);
    expect(result.coverage.noteListComplete).toBe(false); expect(f.vault.read).toHaveBeenCalledTimes(1);
    expect(result.diagnostics).toEqual([{ code: "invalid-note" }, { code: "invalid-note", path: "A.md" }, { code: "invalid-note", path: "B.md" }]);
  });

  it("keeps successful notes when another read fails and never includes raw exceptions", async () => {
    const f = fixture(); f.vault.read.mockImplementation(async (file) => {
      if (file.path === "A.md") throw new Error("PRIVATE BODY ERROR"); return "## Flashcards\nQ::A";
    });
    const result = await f.source.capture(signal());
    expect(result.cards.map((card) => card.path)).toEqual(["B.md"]);
    expect(result).toMatchObject({ complete: false, diagnostics: [{ code: "content-unavailable", path: "A.md" }], coverage: { notesRead: 1 } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });

  it.each(["path", "mtime", "size"])("marks a note changed during read (%s) unavailable", async (change) => {
    const f = fixture(["A.md"]); f.vault.read.mockImplementation(async (file) => {
      if (change === "path") file.path = "Renamed.md";
      else if (change === "mtime") file.stat.mtime++;
      else file.stat.size++;
      return "## Flashcards\nQ::A";
    });
    const result = await f.source.capture(signal());
    expect(result).toMatchObject({ cards: [], complete: false, diagnostics: [{ code: "note-changed", path: "A.md" }] });
  });

  it("detects changes before a queued read starts", async () => {
    const f = fixture(["A.md", "B.md"]);
    f.vault.read.mockImplementation(async () => { f.files[1].stat.mtime++; return "## Flashcards\nQ::A"; });
    const result = await f.source.capture(signal());
    expect(f.vault.read).toHaveBeenCalledTimes(1); expect(result.cards).toHaveLength(1);
    expect(result.diagnostics).toEqual([{ code: "note-changed", path: "B.md" }]); expect(result.complete).toBe(false);
  });

  it("skips oversized files before read and also bounds contents returned with inaccurate size", async () => {
    const f = fixture(["A.md", "B.md"]); f.files[0].stat.size = MAX_NOTE_LENGTH + 1;
    f.vault.read.mockResolvedValue("X".repeat(MAX_NOTE_LENGTH + 1));
    const result = await f.source.capture(signal());
    expect(f.vault.read).toHaveBeenCalledTimes(1); expect(result.cards).toEqual([]); expect(result.complete).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toEqual(["oversized-note", "oversized-note"]);
  });

  it("bounds reads and aborts pending uninterruptible Vault.read calls without scheduling more", async () => {
    const f = fixture(Array.from({ length: 40 }, (_, i) => `${i}.md`));
    f.vault.read.mockImplementation(() => new Promise<string>(() => {}));
    const abort = new AbortController(); const pending = f.source.capture(abort.signal);
    expect(f.vault.read).toHaveBeenCalledTimes(RECALL_READ_CONCURRENCY); abort.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(f.vault.read).toHaveBeenCalledTimes(RECALL_READ_CONCURRENCY);
  });

  it("merges in deterministic path order despite out-of-order read completion", async () => {
    const f = fixture(Array.from({ length: 19 }, (_, i) => `${i}.md`).reverse()); let active = 0, maximum = 0;
    f.vault.read.mockImplementation(async (file) => {
      active++; maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => setTimeout(resolve, file.path === "0.md" ? 10 : 0));
      active--; return "## Flashcards\nQ::A";
    });
    const result = await f.source.capture(signal());
    expect(result.cards.map((card) => card.path)).toEqual(f.files.map((file) => file.path).sort());
    expect(maximum).toBe(RECALL_READ_CONCURRENCY); expect(active).toBe(0);
  });

  it("bounds read count and marks a limited inventory incomplete", async () => {
    const f = fixture(Array.from({ length: MAX_RECALL_NOTES + 1 }, (_, i) => `${i}.md`)); f.vault.read.mockResolvedValue("No cards");
    const result = await f.source.capture(signal());
    expect(result.complete).toBe(false); expect(result.coverage.noteListComplete).toBe(false);
    expect(f.vault.read).toHaveBeenCalledTimes(MAX_RECALL_NOTES);
    expect(result.diagnostics).toEqual([{ code: "inventory-limit" }]);
  });

  it("bounds aggregate diagnostics in deterministic order", async () => {
    const f = fixture(Array.from({ length: 104 }, (_, i) => `${i.toString().padStart(3, "0")}.md`));
    f.vault.read.mockRejectedValue(new Error("PRIVATE"));
    const result = await f.source.capture(signal());
    expect(result.diagnostics).toHaveLength(100); expect(result.diagnosticsTruncated).toBe(4);
    expect(result.diagnostics[0].path).toBe("000.md"); expect(result.diagnostics[99].path).toBe("099.md"); expect(result.complete).toBe(false);
  });

  it("revision is independent of enumeration order and changes on addition/removal/rename/mtime/size", async () => {
    const f = fixture(); const before = await f.source.captureRevision(signal());
    f.files.reverse(); expect(await f.source.captureRevision(signal())).toBe(before);
    f.files[0].stat.mtime++; expect(await f.source.captureRevision(signal())).not.toBe(before); f.files[0].stat.mtime--;
    f.files[0].path = "New.md"; expect(await f.source.captureRevision(signal())).not.toBe(before); f.files[0].path = "A.md";
    f.files[0].stat.size++; expect(await f.source.captureRevision(signal())).not.toBe(before); f.files[0].stat.size--;
    const removed = f.files.pop()!; expect(await f.source.captureRevision(signal())).not.toBe(before);
    f.files.push(removed); expect(await f.source.captureRevision(signal())).toBe(before);
    expect(f.vault.read).not.toHaveBeenCalled();
  });

  it("pre-abort and failed enumeration produce no reads and no fake empty successful inventory", async () => {
    const f = fixture(); const abort = new AbortController(); abort.abort();
    await expect(f.source.capture(abort.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
    f.vault.getMarkdownFiles.mockImplementation(() => { throw new Error("PRIVATE"); });
    await expect(f.source.capture(signal())).rejects.toThrow("inventory is unavailable"); expect(f.vault.read).not.toHaveBeenCalled();
  });
});
