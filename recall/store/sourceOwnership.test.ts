import { describe, expect, it } from "vitest";
import { createRecallCandidate } from "../domain/identity";
import { createInitialSchedule } from "../scheduler/fsrs6";
import { memoryStorage, request } from "../testSupport";
import { RecallStore } from "./recallStore";

function entries(path: string, kind: string, words = ["luggage", "old"]) {
  const directions: ("forward" | "reverse")[] = kind === "both" ? ["forward", "reverse"] : ["forward"];
  return words.flatMap(question => kind === "study"
    ? [createRecallCandidate({ path, question, answer: `meaning of ${question}` })]
    : directions.map(direction =>
      createRecallCandidate({ path, kind: "vocabulary", question: direction === "forward" ? question : `meaning of ${question}`,
        answer: direction === "forward" ? `meaning of ${question}` : question, studyTags: ["flashcards/languages/en"],
        vocabulary: { language: "en", translationLanguage: "ru", direction } })));
}

describe("Recall source ownership after path reuse", () => {
  it.each(["study", "forward", "both"].flatMap(kind => ["targeted", "full"].map(refresh => ({ kind, refresh }))))(
    "keeps independent histories through path reuse, retirement, restart and repeated renames ($kind / $refresh)", async ({ kind, refresh }) => {
      const storage = memoryStorage();
      let store = new RecallStore(storage); await store.load();
      const original = entries("Words.md", kind);
      await store.reconcileNote("Words.md", original, true, 100);
      for (const [index, card] of original.entries()) await store.reviewCard(card.id, "easy", 200 + index);
      const history = store.listCards().map(card => [card.id, card.schedule]);
      await store.reconcileNote("Words.md", entries("Words.md", kind, ["luggage"]), true, 300);
      await store.renameNote("Words.md", "Archive/Words.md");
      const moved = entries("Archive/Words.md", kind, ["luggage"]), fresh = entries("Words.md", kind, ["luggage", "new"]);
      if (refresh === "targeted") await store.reconcileNote("Words.md", fresh, true, 400);
      else await store.reconcile(request([...fresh, ...moved], 400));
      expect(store.listCards({ path: "Archive/Words.md" }).map(card => [card.id, card.schedule])).toEqual(history);
      const independent = store.listCards({ path: "Words.md" });
      expect(independent).toHaveLength(fresh.length);
      expect(independent.every(card => card.schedule.reviewCount === 0 && card.firstSeenAt === 400)).toBe(true);
      expect(independent.every(card => !original.some(old => old.id === card.id))).toBe(true);
      expect(new Set(independent.map(card => card.sourceKey)).size).toBe(1);
      await store.reconcile(request([...moved, ...fresh], 500));
      store = new RecallStore(storage); expect((await store.load()).status).toBe("loaded");
      await store.renameNote("Words.md", "New Words.md");
      await store.renameNote("Archive/Words.md", "Words.md");
      await store.renameNote("Words.md", "Again.md"); await store.renameNote("Again.md", "Words.md");
      await store.reconcile(request([...original, ...entries("New Words.md", kind, ["luggage", "new"])], 600));
      expect(store.listCards({ path: "Words.md" }).map(card => [card.id, card.schedule])).toEqual(history);
      expect(store.listCards({ path: "New Words.md" }).map(card => card.id)).toEqual(independent.map(card => card.id));
      expect(store.listCards({ state: "active" })).toHaveLength(original.length + fresh.length);
    });

  it("reserves an independent anchor before the reused path contains overlapping text", async () => {
    const store = new RecallStore(memoryStorage()); await store.load();
    await store.reconcileNote("Words.md", entries("Words.md", "both", ["luggage"]), true, 100);
    await store.renameNote("Words.md", "Archive.md");
    await store.reconcileNote("Words.md", entries("Words.md", "both", ["new"]), true, 200);
    const anchor = store.listCards({ path: "Words.md" })[0].sourceKey;
    expect(anchor).not.toBe("Words.md");
    await store.reconcileNote("Words.md", entries("Words.md", "both", ["new", "luggage"]), true, 300);
    expect(store.listCards({ path: "Words.md" }).every(card => card.sourceKey === anchor)).toBe(true);
    expect(store.listCards({ state: "active" })).toHaveLength(6);
  });

  it("retains existing v4 IDs even if the old writer already shared an anchor across disjoint sources", async () => {
    const old = createRecallCandidate({ path: "Archive.md", sourceKey: "Words.md", question: "old", answer: "A" });
    const reused = createRecallCandidate({ path: "Words.md", question: "new", answer: "A" });
    const raw = JSON.stringify({ version: 4, updatedAt: 100, cards: Object.fromEntries([old, reused].map(card =>
      [card.id, { ...card, state: "active", firstSeenAt: 100, lastSeenAt: 100, schedule: createInitialSchedule(100) }])) });
    const storage = memoryStorage(raw);
    let store = new RecallStore(storage); expect((await store.load()).status).toBe("loaded");
    await store.reviewCard(old.id, "easy", 200); await store.reviewCard(reused.id, "good", 201);
    const history = [store.getCard(old.id)!.schedule, store.getCard(reused.id)!.schedule];
    const both = ["old", "new"].flatMap(question => ["Words.md", "Archive.md"].map(path => createRecallCandidate({ path, question, answer: "A" })));
    await store.reconcile(request(both, 300));
    store = new RecallStore(storage); await store.load(); await store.reconcile(request(both, 400));
    expect(store.listCards({ state: "active" })).toHaveLength(4);
    expect([store.getCard(old.id)!.schedule, store.getCard(reused.id)!.schedule]).toEqual(history);
    expect(store.listCards().filter(card => ![old.id, reused.id].includes(card.id)).every(card => card.schedule.reviewCount === 0)).toBe(true);
    expect(storage.backupOriginal).not.toHaveBeenCalled();
  });

  it("rejects ambiguous existing histories instead of choosing one or overwriting it", async () => {
    const cards = ["A.md", "B.md"].map(sourceKey => createRecallCandidate({ path: "Words.md", sourceKey, question: "Q", answer: "A" }));
    const raw = JSON.stringify({ version: 4, updatedAt: 100, cards: Object.fromEntries(cards.map(card =>
      [card.id, { ...card, state: "active", firstSeenAt: 100, lastSeenAt: 100, schedule: createInitialSchedule(100) }])) });
    const storage = memoryStorage(raw), store = new RecallStore(storage); await store.load();
    await expect(store.reconcileNote("Words.md", [createRecallCandidate({ path: "Words.md", question: "Q", answer: "A" })], true, 200)).rejects.toThrow("Ambiguous");
    expect(storage.bytes()).toBe(raw); expect(storage.write).not.toHaveBeenCalled();
  });

  it("still verifies freshness and cancellation for a no-op without publishing or migrating", async () => {
    const storage = memoryStorage(), store = new RecallStore(storage); await store.load();
    const revision = store.getRevision();
    await expect(store.reconcileNote("Plain.md", [], false, 200, { beforeCommit: async () => { throw new Error("Stale source"); } })).rejects.toThrow("Stale");
    const abort = new AbortController();
    await expect(store.reconcileNote("Plain.md", [], true, 300, { signal: abort.signal, beforeCommit: async () => { abort.abort(); } })).rejects.toThrow();
    expect(store.getLoadResult().status).toBe("missing"); expect(store.getRevision()).toBe(revision);
    expect(store.getUpdatedAt()).toBe(0); expect(storage.write).not.toHaveBeenCalled();
  });
});
