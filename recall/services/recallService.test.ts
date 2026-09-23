import type { TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { ObsidianRecallSource } from "../source/obsidianRecallSource";
import { RecallService, RecallScanAlreadyRunningError } from "./recallService";
import { RecallStorageBlockedError } from "../store/types";
import { candidate, gate, memoryStorage, signal } from "../testSupport";

function fixture(initial: string | null = null) {
  const files = [{ path: "A.md", stat: { mtime: 100, size: 100 } } as TFile];
  const vault = { configDir: ".private", getMarkdownFiles: vi.fn(() => files),
    read: vi.fn(async (_file: TFile) => "PRIVATE NOTE BODY\n## Flashcards\n#flashcards\n\nQ::A\n\n## Private\nSECRET::BODY"),
    modify: vi.fn(), create: vi.fn(), delete: vi.fn(), rename: vi.fn(), process: vi.fn() };
  const storage = memoryStorage(initial); const source = new ObsidianRecallSource(vault); let now = 100;
  const clock = vi.fn(() => now);
  const service = new RecallService(storage, source, clock);
  return { files, vault, storage, source, service, clock, time: (value: number) => { now = value; } };
}

describe("Recall explicit inventory service", () => {
  it("constructs with zero IO, initializes metadata only and scans only on explicit request", async () => {
    const f = fixture(); expect(f.storage.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
    await expect(f.service.scan(signal())).rejects.toThrow("not initialized");
    expect(await f.service.initialize()).toEqual({ status: "missing", writable: true });
    await f.service.initialize(); expect(f.storage.read).toHaveBeenCalledTimes(1);
    expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled(); expect(f.storage.write).not.toHaveBeenCalled();
    expect(await f.service.scan(signal())).toMatchObject({ cardsSeen: 1, created: 1, updated: 0, retired: 0, committed: true, complete: true, freshness: "verified", observedAt: 100 });
    expect(f.vault.read).toHaveBeenCalledTimes(1); expect(f.vault.getMarkdownFiles).toHaveBeenCalledTimes(2); expect(f.storage.write).toHaveBeenCalledTimes(1);
    expect(f.service.getCard(candidate().id)).toMatchObject({ question: "Q", answer: "A", state: "active" });
    expect(f.storage.bytes()).not.toMatch(/PRIVATE|SECRET|NOTE BODY/);
    for (const method of ["modify", "create", "delete", "rename", "process"] as const) expect(f.vault[method]).not.toHaveBeenCalled();
  });

  it("uses one observation for all cards and preserves firstSeen across retirement/recurrence and restart", async () => {
    const f = fixture(); await f.service.initialize(); await f.service.scan(signal());
    f.time(200); f.vault.read.mockResolvedValue("No cards");
    expect(await f.service.scan(signal())).toMatchObject({ retired: 1, committed: true });
    const next = new RecallService(f.storage, f.source, () => 300); await next.initialize();
    f.vault.read.mockResolvedValue("## Flashcards\nQ::A\nAnother::A");
    expect(await next.scan(signal())).toMatchObject({ observedAt: 300, created: 1, updated: 1, retired: 0 });
    expect(next.listCards().map((card) => card.lastSeenAt)).toEqual([300, 300]);
    expect(next.getCard(candidate().id)?.firstSeenAt).toBe(100);
  });

  it.each(["read", "parser"])("keeps missing cards active on incomplete %s coverage", async (kind) => {
    const f = fixture(); await f.service.initialize(); await f.service.scan(signal()); f.time(200);
    if (kind === "read") f.vault.read.mockRejectedValueOnce(new Error("private"));
    else f.vault.read.mockResolvedValueOnce("## Flashcards\nBad::");
    expect(await f.service.scan(signal())).toMatchObject({ cardsSeen: 0, created: 0, updated: 0, retired: 0, complete: false, committed: true });
    expect(f.service.getCard(candidate().id)).toMatchObject({ state: "active", lastSeenAt: 100 });
  });

  it.each(["mtime", "rename", "add", "remove"])("refuses the whole reconciliation when inventory changes immediately before commit (%s)", async (change) => {
    const f = fixture(); await f.service.initialize(); await f.service.scan(signal()); f.time(200);
    const bytes = f.storage.bytes(), cards = f.service.listCards();
    f.vault.read.mockResolvedValue("## Flashcards\nQ::A\nNew::A");
    const revision = f.source.captureRevision.bind(f.source);
    vi.spyOn(f.source, "captureRevision").mockImplementationOnce(async (abort) => {
      if (change === "mtime") f.files[0].stat.mtime++;
      if (change === "rename") f.files[0].path = "Renamed.md";
      if (change === "add") f.files.push({ path: "Added.md", stat: { mtime: 100, size: 0 } } as TFile);
      if (change === "remove") f.files.pop();
      return revision(abort);
    });
    expect(await f.service.scan(signal())).toMatchObject({ cardsSeen: 2, created: 0, updated: 0, retired: 0, complete: false, committed: false,
      freshness: "stale", diagnostics: [{ code: "stale-inventory" }] });
    expect(f.service.listCards()).toEqual(cards); expect(f.storage.bytes()).toBe(bytes); expect(f.storage.write).toHaveBeenCalledTimes(1);
  });

  it("failed final enumeration cannot reconcile an empty inventory", async () => {
    const f = fixture(); await f.service.initialize(); await f.service.scan(signal()); const bytes = f.storage.bytes();
    f.vault.read.mockResolvedValue("No cards");
    vi.spyOn(f.source, "captureRevision").mockRejectedValueOnce(new Error("PRIVATE"));
    expect(await f.service.scan(signal())).toMatchObject({ committed: false, complete: false, freshness: "unavailable", retired: 0, diagnostics: [{ code: "inventory-unavailable" }] });
    expect(f.storage.bytes()).toBe(bytes);
  });

  it("rejects overlapping scans and releases exclusivity after cancellation", async () => {
    const f = fixture(); await f.service.initialize(); const hold = gate(), entered = gate();
    f.vault.read.mockImplementationOnce(async () => { entered.release(); await hold.promise; return "## Flashcards\nQ::A"; });
    const abort = new AbortController(); const pending = f.service.scan(abort.signal); await entered.promise;
    await expect(f.service.scan(signal())).rejects.toBeInstanceOf(RecallScanAlreadyRunningError);
    abort.abort(); await expect(pending).rejects.toMatchObject({ name: "AbortError" }); hold.release();
    expect(f.storage.write).not.toHaveBeenCalled(); expect(f.service.listCards()).toEqual([]);
    expect(await f.service.scan(signal())).toMatchObject({ committed: true, created: 1 });
  });

  it.each(["before-scan", "before-commit"])("cancels %s without published state, writes or retirement", async (when) => {
    const f = fixture(); await f.service.initialize(); await f.service.scan(signal()); const bytes = f.storage.bytes(), abort = new AbortController();
    f.vault.read.mockResolvedValue("No cards");
    if (when === "before-scan") abort.abort();
    else {
      const revision = f.source.captureRevision.bind(f.source);
      vi.spyOn(f.source, "captureRevision").mockImplementationOnce(async (sig) => { const result = await revision(sig); abort.abort(); return result; });
    }
    await expect(f.service.scan(abort.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(f.storage.bytes()).toBe(bytes); expect(f.service.getCard(candidate().id)?.state).toBe("active");
    expect(f.storage.write).toHaveBeenCalledTimes(1);
  });

  it("returns truthful committed outcome if cancellation arrives after durable write", async () => {
    const f = fixture(); await f.service.initialize(); const abort = new AbortController(); const write = f.storage.write;
    f.storage.write = vi.fn(async (raw) => { await write(raw); abort.abort(); });
    expect(await f.service.scan(abort.signal)).toMatchObject({ committed: true, created: 1, complete: true });
    expect(f.service.listCards()).toHaveLength(1);
  });

  it.each([["{", "invalid"], ['{"version":200}', "unsupported"]])("does not scan or overwrite poisoned metadata %j", async (raw, status) => {
    const f = fixture(raw); expect(await f.service.initialize()).toEqual({ status, writable: false });
    await expect(f.service.scan(signal())).rejects.toBeInstanceOf(RecallStorageBlockedError);
    await expect(f.service.reviewCard(candidate().id, "good", 200)).rejects.toBeInstanceOf(RecallStorageBlockedError);
    expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled();
    expect(f.storage.write).not.toHaveBeenCalled(); expect(f.storage.bytes()).toBe(raw);
  });

  it("handles unavailable metadata and failed writes without false publication", async () => {
    const unavailable = fixture(); unavailable.storage.read.mockRejectedValueOnce(new Error("private"));
    expect(await unavailable.service.initialize()).toEqual({ status: "unavailable", writable: false });
    await expect(unavailable.service.scan(signal())).rejects.toBeInstanceOf(RecallStorageBlockedError);
    expect(unavailable.vault.read).not.toHaveBeenCalled();
    const f = fixture(); await f.service.initialize(); await f.service.scan(signal()); const cards = f.service.listCards();
    f.vault.read.mockResolvedValue("No cards"); f.storage.write.mockRejectedValueOnce(new Error("private"));
    await expect(f.service.scan(signal())).rejects.toThrow("could not be saved"); expect(f.service.listCards()).toEqual(cards);
  });

  it("deduplicates scan-level repeated candidates with a bounded diagnostic", async () => {
    const f = fixture(); await f.service.initialize(); const inventory = await f.source.capture(signal());
    vi.spyOn(f.source, "capture").mockResolvedValue({ ...inventory, cards: [candidate(), candidate()] });
    expect(await f.service.scan(signal())).toMatchObject({ cardsSeen: 1, created: 1, diagnostics: [{ code: "duplicate-card", path: "A.md" }] });
  });

  it("is independent of installed external review plugins and their metadata", async () => {
    const absent = fixture(), installed = fixture();
    installed.files.push({ path: ".private/plugins/external-review/notes.md", stat: { mtime: 900, size: 100 } } as TFile);
    for (const f of [absent, installed]) {
      await f.service.initialize(); await f.service.scan(signal()); await f.service.reviewCard(candidate().id, "easy", 200);
    }
    expect(absent.service.listCards()).toEqual(installed.service.listCards());
    expect(absent.storage.bytes()).toBe(installed.storage.bytes());
    expect(installed.vault.read.mock.calls.map(([file]) => file.path)).toEqual(["A.md"]);
  });

  it("clamps a backwards clock to durable observation and rejects invalid clocks", async () => {
    const f = fixture(); await f.service.initialize(); await f.service.scan(signal()); f.time(50);
    expect(await f.service.scan(signal())).toMatchObject({ observedAt: 100 });
    f.time(NaN); await expect(f.service.scan(signal())).rejects.toThrow("Invalid Recall observation");
  });

  it("returns getter copies that cannot mutate durable state", async () => {
    const f = fixture(); await f.service.initialize(); await f.service.scan(signal()); const bytes = f.storage.bytes();
    const card = f.service.getCard(candidate().id)!; (card as { answer: string }).answer = "Tampered";
    const list = f.service.listCards(); (list[0] as { question: string }).question = "Changed"; list.length = 0;
    expect(f.service.getCard(candidate().id)?.answer).toBe("A"); expect(f.service.listCards()).toHaveLength(1); expect(f.storage.bytes()).toBe(bytes);
  });
});

describe("Recall review service APIs", () => {
  it("previews all four ratings without IO and commits exactly the selected preview", async () => {
    const f = fixture(); await f.service.initialize(); await f.service.scan(signal());
    const id = candidate().id, before = f.service.getCard(id), bytes = f.storage.bytes();
    const previews = f.service.previewCard(id, 200);
    expect(Object.keys(previews)).toEqual(["again", "hard", "good", "easy"]);
    expect(f.service.getRetrievability(id, 200)).toBeUndefined();
    expect(f.service.getCard(id)).toEqual(before); expect(f.storage.bytes()).toBe(bytes);
    expect(f.storage.write).toHaveBeenCalledTimes(1);
    expect(await f.service.reviewCard(id, "good", 200)).toEqual(previews.good);
    expect(f.service.getRetrievability(id, 201)).toBe(1);
    expect(f.vault.read).toHaveBeenCalledTimes(1);
  });

  it("returns due cards in due-time then ID order, excludes retired cards and reports active phase counts", async () => {
    const f = fixture(); f.vault.read.mockResolvedValue("## Flashcards\nQ::A\nLearning::A\nReview::A\nLapse::A\nRetired::A");
    await f.service.initialize(); await f.service.scan(signal());
    expect(f.service.listDue(99)).toEqual([]);
    expect(f.service.listDue(100).map((card) => card.id)).toEqual(f.service.listCards().map((card) => card.id).sort());
    await f.service.reviewCard(candidate("Learning").id, "good", 200);
    for (const question of ["Review", "Lapse", "Retired"]) await f.service.reviewCard(candidate(question).id, "easy", 200);
    await f.service.reviewCard(candidate("Lapse").id, "again", 300);
    f.time(400); f.vault.read.mockResolvedValue("## Flashcards\nQ::A\nLearning::A\nReview::A\nLapse::A"); await f.service.scan(signal());
    expect(f.service.getSummary(500)).toEqual({ active: 4, due: 1, new: 1, learning: 2, review: 1, relearning: 1 });
    expect(f.service.listDue(500).map((card) => card.id)).toEqual([candidate().id]);
    expect(f.service.listDue(1e12).map((card) => card.question)).toEqual(["Q", "Learning", "Lapse", "Review"]);
    expect(f.service.listDue(1e12, 2).map((card) => card.question)).toEqual(["Q", "Learning"]);
    expect(f.service.listDue(1e12, 0)).toEqual([]);
    const summary = f.service.getSummary(500); summary.active = 90; expect(f.service.getSummary(500).active).toBe(4);
  });

  it("rejects stale inventory captured before a committed review without losing memory or retiring absence", async () => {
    const f = fixture(); await f.service.initialize(); await f.service.scan(signal()); f.time(150);
    const entered = gate(), hold = gate();
    f.vault.read.mockImplementationOnce(async () => { entered.release(); await hold.promise; return "## Flashcards\nNew::A"; });
    const scan = f.service.scan(signal()); await entered.promise;
    const review = await f.service.reviewCard(candidate().id, "easy", 200), bytes = f.storage.bytes();
    hold.release(); await expect(scan).rejects.toThrow("Stale Recall observation");
    expect(f.service.listCards()).toHaveLength(1);
    expect(f.service.getCard(candidate().id)).toMatchObject({ state: "active", schedule: review.schedule, lastSeenAt: 100 });
    expect(f.storage.bytes()).toBe(bytes); expect(f.storage.write).toHaveBeenCalledTimes(2);
  });

  it("preserves a review committed during capture when the inventory observation is not older", async () => {
    const f = fixture(); await f.service.initialize(); await f.service.scan(signal()); f.time(300);
    const entered = gate(), hold = gate();
    f.vault.read.mockImplementationOnce(async () => { entered.release(); await hold.promise; return "## Flashcards\nQ::A"; });
    const scan = f.service.scan(signal()); await entered.promise;
    const review = await f.service.reviewCard(candidate().id, "easy", 200);
    hold.release(); expect(await scan).toMatchObject({ committed: true, updated: 1 });
    expect(f.service.getCard(candidate().id)).toMatchObject({ lastSeenAt: 300, schedule: review.schedule });
  });

  it("excludes retirement without discarding overdue memory, then restores due status on recurrence", async () => {
    const f = fixture(); await f.service.initialize(); await f.service.scan(signal());
    const id = candidate().id, outcome = await f.service.reviewCard(id, "again", 200);
    f.time(300); f.vault.read.mockResolvedValue("No cards"); await f.service.scan(signal());
    expect(f.service.listDue(1e12)).toEqual([]); expect(f.service.getSummary(1e12).active).toBe(0);
    expect(() => f.service.previewCard(id, 1e12)).toThrow("Retired");
    await expect(f.service.reviewCard(id, "good", 1e12)).rejects.toThrow("Retired");
    f.time(100_000); f.vault.read.mockResolvedValue("## Flashcards\nQ::A"); await f.service.scan(signal());
    expect(f.service.listDue(100_000)).toHaveLength(1); expect(f.service.getCard(id)?.schedule).toEqual(outcome.schedule);
    await f.service.reviewCard(id, "good", 100_001);
    expect(f.service.getCard(id)?.schedule.reviewCount).toBe(2);
  });

  it("returns independent nested schedules from queues, getters and previews", async () => {
    const f = fixture(); await f.service.initialize(); await f.service.scan(signal()); const id = candidate().id, before = f.service.getCard(id);
    Object.assign(f.service.listDue(100)[0].schedule, { dueAt: 0 });
    Object.assign(f.service.listCards()[0].schedule, { reviewCount: 80 });
    Object.assign(f.service.getCard(id)!.schedule, { phase: "review" });
    const previews = f.service.previewCard(id, 200); Object.assign(previews.easy.schedule, { stability: 900 });
    expect(f.service.getCard(id)).toEqual(before); expect(f.service.previewCard(id, 200).easy.schedule.stability).toBe(8.2956);
  });

  it("runs preview, review and queue queries with zero network or Markdown reads/writes", async () => {
    const f = fixture(); await f.service.initialize(); await f.service.scan(signal());
    f.vault.read.mockClear(); f.vault.getMarkdownFiles.mockClear();
    const network = vi.fn().mockRejectedValue(new Error("Unexpected network"));
    vi.stubGlobal("fetch", network);
    try {
      f.service.previewCard(candidate().id, 200); await f.service.reviewCard(candidate().id, "good", 200);
      f.service.getRetrievability(candidate().id, 300); f.service.listDue(300); f.service.getSummary(300);
      expect(network).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
      for (const method of ["modify", "create", "delete", "rename", "process"] as const) expect(f.vault[method]).not.toHaveBeenCalled();
      expect(f.storage.write).toHaveBeenCalledTimes(2);
    } finally { vi.unstubAllGlobals(); }
  });

  it("validates query times, queue limits and missing IDs", async () => {
    const f = fixture(); await f.service.initialize();
    for (const at of [NaN, Infinity, -1, 0.5]) {
      expect(() => f.service.listDue(at)).toThrow(); expect(() => f.service.getSummary(at)).toThrow();
    }
    for (const limit of [-1, 0.5, NaN, Infinity, 10001]) expect(() => f.service.listDue(100, limit)).toThrow();
    expect(() => f.service.previewCard(candidate().id, 100)).toThrow("does not exist");
    expect(() => f.service.getRetrievability(candidate().id, 100)).toThrow("does not exist");
    expect(() => f.service.previewCard("__proto__", 100)).toThrow("Invalid Recall ID");
    expect(f.storage.write).not.toHaveBeenCalled();
  });
});
