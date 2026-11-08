import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appFixture } from "../../health/obsidian/testSupport";
import { candidate, memoryStorage, request } from "../testSupport";
import { RecallStore } from "../store/recallStore";
import { decodeRecall } from "../store/codec";
import { createObsidianRecallProduct } from "./obsidianRecallProduct";
import { cardsPath } from "./testSupport";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1000); vi.stubGlobal("window", { setTimeout, clearTimeout }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function fixture(raw?: string) {
  const f = appFixture();
  let body = "Only prose.";
  Object.assign(f.note.stat, { size: body.length });
  if (raw !== undefined) f.files.set(cardsPath, raw);
  const handlers = new Map<string, (file: typeof f.note) => void>();
  f.vault.on.mockImplementation((name: string, callback: (file: typeof f.note) => void) => { handlers.set(name, callback); });
  f.vault.read.mockImplementation(async () => body);
  Object.assign(f.workspace, { on: vi.fn(), offref: vi.fn(), getLeavesOfType: () => [] });
  const product = createObsidianRecallProduct(f.app, "ai-knowledge-hub", async () => true, yaml => ({
    "veynrel-recall": "vocabulary", "recall-language": "en", "recall-translation-language": "ru",
    "recall-direction": yaml.includes("recall-direction: both") ? "both" : "forward", tags: ["flashcards/languages/en"],
  }));
  const edit = async (content: string) => {
    body = content; f.note.stat.mtime++; Object.assign(f.note.stat, { size: body.length });
    handlers.get("modify")!(f.note);
    await vi.advanceTimersByTimeAsync(351);
    expect(product.getSnapshot().ingesting).toBe(false);
  };
  return { ...f, product, edit };
}

describe("saved-note events and Recall no-op persistence", () => {
  it.each([0, 1000])("does not rewrite metadata for three prose edits with %i existing cards", async size => {
    const seed = memoryStorage(), store = new RecallStore(seed); await store.load();
    if (size) await store.reconcile(request(Array.from({ length: size }, (_,i) => candidate(`Question ${i}`, "Study.md"))));
    const f = fixture(seed.bytes() ?? undefined); await f.product.initialize();
    for (let i = 0; i < 3; i++) await f.edit(`Only prose ${i}.`);
    const writes = f.adapter.write.mock.calls;
    expect({ writes: writes.length, bytes: writes.reduce((sum, [,raw]) => sum + new TextEncoder().encode(raw).length, 0) })
      .toEqual({ writes: 0, bytes: 0 });
    expect(f.product.getSnapshot()).toMatchObject({ firstRun: size === 0, totalActive: size, inventoryEstablished: size !== 0 });
    expect(f.files.get(cardsPath)).toBe(seed.bytes() ?? undefined);
    expect(f.vault.read).toHaveBeenCalledTimes(3);
    f.product.dispose();
  });

  it.each([1, 2, 3, 4])("does not migrate or back up schema v%i on an unrelated empty observation", async version => {
    const raw = JSON.stringify({ version, updatedAt: 0, cards: {} }), f = fixture(raw);
    await f.product.initialize(); await f.edit("Changed prose.");
    expect(f.adapter.write).not.toHaveBeenCalled(); expect(f.files.get(cardsPath)).toBe(raw);
    f.product.dispose();
  });

  it("discovers first cards, skips unchanged observations, and persists retag/removal/Undo/Redo", async () => {
    const f = fixture(); await f.product.initialize(); await f.edit("Only prose.");
    expect(f.product.getSnapshot().firstRun).toBe(true);
    await f.edit("## Flashcards\n#flashcards/one Q::A");
    const first = decodeRecall(f.files.get(cardsPath)!).data!;
    expect(f.product.getSnapshot().totalActive).toBe(1);
    f.adapter.write.mockClear();
    await f.edit("# Extra prose\n\n## Flashcards\n#flashcards/one Q::A");
    expect(f.adapter.write).not.toHaveBeenCalled();
    await f.product.startSession(); f.product.revealAnswer(); await f.product.rate("easy"); f.product.endSession();
    const reviewed = decodeRecall(f.files.get(cardsPath)!).data!;
    await f.edit("## Flashcards\n#flashcards/two Q::A");
    expect(f.product.getSnapshot().facets?.tags).toContain("flashcards/two");
    await f.edit("## Flashcards\n");
    expect(f.product.getSnapshot().totalActive).toBe(0);
    await f.edit("## Flashcards\n#flashcards/two Q::A");
    const restored = decodeRecall(f.files.get(cardsPath)!).data!;
    expect(Object.keys(restored.cards)).toEqual(Object.keys(first.cards));
    expect(Object.values(restored.cards)[0].schedule).toEqual(Object.values(reviewed.cards)[0].schedule);
    expect(f.product.getSnapshot().totalActive).toBe(1);
    f.product.dispose();
  });

  it("discovers vocabulary through saved events and preserves direction history on incomplete captures and reactivation", async () => {
    const f = fixture(); await f.product.initialize();
    const text = (direction: string, pair = "luggage::багаж") => `---\nveynrel-recall: vocabulary\nrecall-direction: ${direction}\n---\n## Vocabulary\n${pair}`;
    await f.edit(text("both"));
    const original = decodeRecall(f.files.get(cardsPath)!).data!.cards;
    expect(f.product.getSnapshot().totalActive).toBe(2);
    await f.edit(text("forward"));
    expect(f.product.getSnapshot().totalActive).toBe(1);
    f.adapter.write.mockClear();
    await f.edit(text("both", "luggage багаж"));
    expect(f.adapter.write).not.toHaveBeenCalled();
    expect(f.product.getSnapshot().totalActive).toBe(1);
    await f.edit(text("both"));
    expect(f.product.getSnapshot().totalActive).toBe(2);
    const current = decodeRecall(f.files.get(cardsPath)!).data!.cards;
    expect(Object.keys(current)).toEqual(Object.keys(original));
    for (const id of Object.keys(original)) expect(current[id].schedule).toEqual(original[id].schedule);
    f.product.dispose();
  });
});
