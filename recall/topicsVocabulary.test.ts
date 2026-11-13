import { describe, expect, it, vi } from "vitest";
import { parseMarkdownFlashcards } from "./parser/markdownFlashcards";
import { createRecallCandidate } from "./domain/identity";
import { matchesRecallScope } from "./domain/topics";
import { RecallStore } from "./store/recallStore";
import { RecallService } from "./services/recallService";
import { ObsidianRecallSource } from "./source/obsidianRecallSource";
import { decodeRecall } from "./store/codec";
import { candidate, gate, legacyCandidate, memoryStorage, request, signal } from "./testSupport";
import { createInitialSchedule, rateSchedule } from "./scheduler/fsrs6";
import { productFixture } from "./product/testSupport";

// Host-decoder fixture for these plain scalars/inline lists. Native smoke uses Obsidian parseYaml.
const parseYaml = (text: string): unknown => Object.fromEntries(text.split("\n").filter(line => line.includes(":"))
  .map(line => {
    const separator = line.indexOf(":"), key = line.slice(0, separator), value = line.slice(separator + 1).trim();
    return [key, value.startsWith("[") ? value.slice(1, -1).split(",").map(item => item.trim()) : value];
  }));

const vocabulary = (body = "luggage::багаж\nboarding pass::посадочный талон", direction = "both", tag = "flashcards/languages/en/travel", language = "en") =>
  `---\nveynrel-recall: vocabulary\nrecall-language: ${language}\nrecall-translation-language: ru\nrecall-direction: ${direction}\ntype: my-own-type\ntags: [${tag}, ordinary/travel]\n---\n\n## Vocabulary\n${body}\n`;
const parse = (content: string, path = "Words.md") => parseMarkdownFlashcards(path, content, signal(), parseYaml);

describe("study topics and opt-in vocabulary", () => {
  it.each(["\n", "\r\n"])("preserves legacy IDs, strips multiple study tags and matches parent boundaries (%j)", async eol => {
    const result = await parse(`\uFEFF# Title\n\n## Flashcards\n#flashcards/DB/indexes #Flashcards/SQL Q::A\nLegacy::A\n#ordinary/topic Other::A\n`.replace(/\n/gu, eol));
    expect(result.complete).toBe(true); const card = result.cards[0];
    expect(card.id).toBe(createRecallCandidate({ path: "Words.md", question: "Q", answer: "A" }).id);
    expect(card.studyTags).toEqual(["flashcards/DB/indexes", "Flashcards/SQL"]);
    expect(matchesRecallScope(card, { tag: "flashcards/db" })).toBe(true);
    expect(matchesRecallScope(card, { tag: "flashcards/d" })).toBe(false);
    expect(matchesRecallScope({ ...card, studyTags: ["flashcards/db2"] }, { tag: "flashcards/db" })).toBe(false);
    expect(result.cards[2].question).toBe("#ordinary/topic Other");
    expect(matchesRecallScope(result.cards[1], { tag: "" })).toBe(true);
  });

  it("unions tags on identical study text without creating a second schedule", async () => {
    const result = await parse("## Flashcards\n#flashcards/a Q::A\n#flashcards/b Q::A\n#FLASHCARDS/A Q::A");
    expect(result.cards).toHaveLength(1); expect(result.cards[0].studyTags).toEqual(["flashcards/a", "flashcards/b"]);
  });

  it("reads words, phrases, homonyms, diacritics, punctuation, multiple meanings and RTL literally", async () => {
    const body = "café::кафе, кофейня\ncan't wait!::не могу дождаться!\nbank::банк\nbank::берег\nשלום::мир; привет";
    const result = await parse(vocabulary(body));
    expect(result.complete).toBe(true); expect(result.cards).toHaveLength(10);
    expect(new Set(result.cards.map(card => card.id)).size).toBe(10);
    expect(result.cards.find(card => card.question === "café")?.answer).toBe("кафе, кофейня");
    expect(result.cards.filter(card => card.vocabulary?.direction === "reverse")).toHaveLength(5);
    expect(result.cards.every(card => card.kind === "vocabulary" && card.studyTags.join() === "flashcards/languages/en/travel")).toBe(true);
  });

  it("does not treat ordinary note tags or prose pairs as vocabulary; default is forward", async () => {
    expect((await parse("---\ntags: [flashcards/en]\n---\n## Vocabulary\nluggage::багаж")).cards).toEqual([]);
    const text = vocabulary().replace("recall-direction: both\n", "") + "\n## Other\nOutside::No\n";
    expect((await parse(text)).cards).toHaveLength(2);
    expect((await parse(text)).cards.every(card => card.vocabulary?.direction === "forward")).toBe(true);
  });

  it.each(["recall-language: en", "recall-translation-language: ru", "tags: [flashcards/languages/en/travel, ordinary/travel]"])("fails incomplete vocabulary properties safely: %s", async key => {
    const result = await parse(vocabulary().replace(key, ""));
    expect(result.complete).toBe(false); expect(result.cards).toEqual([]); expect(result.diagnostics[0].code).toBe("invalid-vocabulary");
  });

  it("marks a vocabulary line without a delimiter incomplete, so absence cannot retire history", async () => {
    const result = await parse(vocabulary("luggage багаж", "forward"));
    expect(result).toMatchObject({ complete: false, cards: [], diagnostics: [{ code: "malformed-card", path: "Words.md", line: 11 }] });
    const store = new RecallStore(memoryStorage()); await store.load();
    await store.reconcile(request((await parse(vocabulary())).cards));
    await store.reconcileNote("Words.md", result.cards, result.complete, 200);
    expect(store.listCards({ state: "active" })).toHaveLength(4);
  });

  it.each(["## Words", "## vocabulary", "```\n## Vocabulary"])("diagnoses an unrecognized vocabulary section without retiring progress: %s", async heading => {
    const store = new RecallStore(memoryStorage()); await store.load();
    await store.reconcile(request((await parse(vocabulary())).cards));
    const before = store.listCards();
    const result = await parse(vocabulary().replace("## Vocabulary", heading));
    expect(result).toMatchObject({ complete: false, cards: [] });
    expect(result.diagnostics).toContainEqual({ code: "invalid-vocabulary", path: "Words.md" });
    await store.reconcileNote("Words.md", result.cards, result.complete, 200);
    expect(store.listCards()).toEqual(before);
  });

  it("allows an explicitly empty Vocabulary section to retire removed entries", async () => {
    const result = await parse(vocabulary(""));
    expect(result).toMatchObject({ complete: true, cards: [], diagnostics: [] });
  });

  it("ignores fenced/commented/indented/other sections and reports malformed entries by line", async () => {
    const result = await parse(vocabulary("good::да\nmissing::\n```\nhidden::нет\n```\n<!-- hidden::нет -->\n    code::нет\n## Next\nother::нет"));
    expect(result.complete).toBe(false); expect(result.cards).toHaveLength(2);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "malformed-card", path: "Words.md", line: 12 }));
  });
});

describe("one store, stable history and scoped queues", () => {
  it("retains independent directions across retag, reorder, rename, disable, Undo/Redo and restart", async () => {
    const storage = memoryStorage(), store = new RecallStore(storage); await store.load();
    const first = (await parse(vocabulary())).cards;
    await store.reconcileNote("Words.md", first, true, 100);
    const forward = first.find(card => card.question === "luggage")!, reverse = first.find(card => card.answer === "luggage")!;
    await store.reviewCard(forward.id, "easy", 200); await store.reviewCard(reverse.id, "again", 201);
    const schedules = store.listCards().map(card => [card.id, card.schedule]);
    await store.renameNote("Words.md", "Moved/Words.md");
    const changed = (await parse(vocabulary("boarding pass::посадочный талон\nluggage::багаж", "both", "flashcards/new"), "Moved/Words.md")).cards;
    await store.reconcileNote("Moved/Words.md", changed, true, 300);
    expect(store.listCards().map(card => [card.id, card.schedule])).toEqual(schedules);
    expect(store.listCards().every(card => card.path === "Moved/Words.md" && card.studyTags[0] === "flashcards/new")).toBe(true);
    await store.reconcileNote("Moved/Words.md", changed.filter(card => card.vocabulary?.direction === "forward"), true, 400);
    expect(store.getCard(reverse.id)?.state).toBe("retired");
    await store.reconcileNote("Moved/Words.md", [], true, 500);
    expect(store.listCards({ state: "active" })).toEqual([]);
    await store.reconcileNote("Moved/Words.md", changed, true, 600);
    const restarted = new RecallStore(storage); await restarted.load();
    expect(restarted.listCards().map(card => [card.id, card.schedule])).toEqual(schedules);
    expect(restarted.getCard(forward.id)?.schedule).not.toEqual(restarted.getCard(reverse.id)?.schedule);
    const edited = (await parse(vocabulary("luggage::чемоданы", "both", "flashcards/new"), "Moved/Words.md")).cards;
    await restarted.reconcileNote("Moved/Words.md", edited, true, 700);
    expect(restarted.getCard(forward.id)?.state).toBe("retired");
    expect(restarted.listCards({ state: "active" }).every(card => card.schedule.reviewCount === 0)).toBe(true);
  });

  it("does not merge identical entries from different notes or ambiguous renames", async () => {
    const store = new RecallStore(memoryStorage()); await store.load();
    const a = (await parse(vocabulary(), "A.md")).cards, b = (await parse(vocabulary(), "B.md")).cards;
    await store.reconcile(request([...a, ...b]));
    expect(store.listCards()).toHaveLength(8);
    await expect(store.renameNote("A.md", "B.md")).rejects.toThrow("Ambiguous");
    expect(store.listCards({ path: "A.md" })).toHaveLength(4);
    const c = (await parse(vocabulary(undefined, "both", undefined, "de"), "A.md")).cards;
    await store.reconcileNote("A.md", c, true, 200);
    expect(store.listCards({ state: "retired", path: "A.md" })).toHaveLength(4);
  });

  it("preserves unseen cards on partial note capture and only reconciles the selected complete source", async () => {
    const store = new RecallStore(memoryStorage()); await store.load();
    const cards = (await parse(vocabulary())).cards;
    await store.reconcile(request([...cards, candidate("Other", "Other.md")]));
    const partial = await parse(vocabulary("luggage::багаж\nbroken::"));
    await store.reconcileNote("Words.md", partial.cards, partial.complete, 200);
    expect(store.listCards({ state: "active" })).toHaveLength(5);
    await store.reconcileNote("Words.md", [], true, 300);
    expect(store.listCards({ state: "active" }).map(card => card.path)).toEqual(["Other.md"]);
  });

  it("filters before limit and uses the same scope for summary and nextDue without source reads", async () => {
    const cards = [...(await parse("## Flashcards\n#flashcards/db2 Wrong::A\n#flashcards/db/indexes Right::A", "Study.md")).cards,
      ...(await parse(vocabulary())).cards];
    const source = { capture: vi.fn(async () => ({ cards, complete: true, diagnostics: [], diagnosticsTruncated: 0, revision: "r", coverage: { notesRead: 2, notesSeen: 2, noteListComplete: true } })),
      captureRevision: vi.fn(async () => "r"), captureNote: vi.fn(async () => ({ cards, isCurrent: () => true })) };
    const service = new RecallService(memoryStorage(), source, () => 100); await service.initialize(); await service.scan(signal());
    for (const scope of [{ tag: "flashcards/db" }, { kind: "vocabulary" as const, language: "en", path: "Words.md" }, { tag: "missing" }]) {
      const expected = cards.filter(card => matchesRecallScope(card, scope));
      expect(service.listDue(100, 1, scope).map(card => card.id)).toEqual(expected.map(card => card.id).sort().slice(0, 1));
      expect(service.getSummary(100, scope).active).toBe(expected.length);
      expect(service.getNextDueAt(scope)).toBe(expected.length ? 100 : undefined);
    }
    expect(source.capture).toHaveBeenCalledTimes(1); expect(source.captureNote).not.toHaveBeenCalled();
  });

  it("blocks a deleted/changed source at presentation and rating, with no stale schedule write", async () => {
    const f = productFixture(); await f.product.initialize(); await f.product.refreshCards();
    await f.product.startSession(); f.time(200); f.product.revealAnswer(); const writes = f.adapter.write.mock.calls.length;
    f.vault.read.mockResolvedValue("No cards"); await f.product.rate("good");
    expect(f.adapter.write).toHaveBeenCalledTimes(writes); expect(f.service().listCards()[0].schedule.reviewCount).toBe(0);
    f.product.endSession(); await f.product.startSession(); expect(f.product.getSnapshot().error).toBe("source");
  });

  it("refuses a retagged card before the modified-note debounce and keeps Health global", async () => {
    const f = productFixture(); f.vault.read.mockResolvedValue("## Flashcards\n#flashcards/a Question::SECRET ANSWER");
    await f.product.initialize(); await f.product.refreshCards(); f.product.setScope({ tag: "flashcards/a" }); await f.product.startSession();
    f.time(200); f.product.revealAnswer();
    f.vault.read.mockResolvedValue("## Flashcards\n#flashcards/b Question::SECRET ANSWER");
    await f.product.rate("good"); expect(f.service().listCards()[0].schedule.reviewCount).toBe(0);
    f.product.endSession(); await f.product.startSession(); expect(f.product.getSnapshot().error).toBe("source");
    f.product.setScope({ tag: "flashcards/missing" });
    expect(f.product.getSnapshot()).toMatchObject({ summary: { active: 0 }, globalSummary: { active: 1 } });
  });

  it("discards late start and scope transitions without resurrecting a previous card", async () => {
    const f = productFixture(); await f.product.initialize(); await f.product.refreshCards();
    const entered = gate(), hold = gate(); f.vault.read.mockImplementationOnce(async () => { entered.release(); await hold.promise; return "## Flashcards\nQuestion::SECRET ANSWER"; });
    const pending = f.product.startSession(); await entered.promise; await f.product.startSession(); f.product.endSession(); hold.release(); await pending;
    expect(f.product.getSnapshot().session).toBeUndefined();
    f.product.setScope({ tag: "flashcards/other" }); await f.product.startSession();
    expect(f.product.getSnapshot()).toMatchObject({ summary: { active: 0, due: 0 }, session: { complete: true } });
  });

  it("rejects unsaved/divergent buffers without reading any other note", async () => {
    const f = productFixture(), matches = vi.fn(() => false);
    const source = new ObsidianRecallSource(f.app.vault, matches, parseYaml);
    await expect(source.captureNote("A.md", signal())).rejects.toThrow();
    expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled(); expect(f.vault.read).toHaveBeenCalledTimes(1);
  });
});

describe("v4 migration backup", () => {
  it.each([1, 2, 3])("preserves original v%s bytes and schedules before first write", async version => {
    const card = legacyCandidate(), schedule = rateSchedule(createInitialSchedule(10), "easy", 20).schedule;
    const raw = JSON.stringify({ version, updatedAt: 100, cards: { [card.id]: { ...card, state: "active", firstSeenAt: 10, lastSeenAt: 90,
      ...(version === 1 ? {} : { schedule }) } } }, null, 3) + "  \n";
    const storage = memoryStorage(raw), store = new RecallStore(storage); await store.load();
    expect(storage.write).not.toHaveBeenCalled(); expect(storage.backupOriginal).not.toHaveBeenCalled();
    const previous = store.getCard(card.id)!;
    expect(previous).toMatchObject({ id: card.id, kind: "study", studyTags: [], sourceKey: "A.md", schedule: version === 1 ? createInitialSchedule(10) : schedule });
    await store.reconcileNote("A.md", [candidate()], true, 200);
    expect(storage.write).not.toHaveBeenCalled(); expect(storage.backupOriginal).not.toHaveBeenCalled();
    expect(storage.bytes()).toBe(raw);
    await store.reconcileNote("A.md", [createRecallCandidate({ ...candidate(), studyTags: ["flashcards/new"] })], true, 201);
    expect(storage.backupOriginal).toHaveBeenCalledExactlyOnceWith(raw);
    expect(storage.backupOriginal.mock.invocationCallOrder[0]).toBeLessThan(storage.write.mock.invocationCallOrder[0]);
    expect(store.getCard(card.id)?.schedule).toEqual(previous.schedule);
    expect(decodeRecall(storage.bytes()).data?.version).toBe(4);
  });

  it("blocks migration writes if the original cannot be backed up", async () => {
    const raw = '{"version":3,"updatedAt":0,"cards":{}}', storage = memoryStorage(raw), store = new RecallStore(storage);
    storage.backupOriginal.mockRejectedValueOnce(new Error("disk full")); await store.load();
    await expect(store.admit([candidate()], 100)).rejects.toThrow();
    expect(storage.bytes()).toBe(raw); expect(storage.write).not.toHaveBeenCalled(); expect(store.getLoadResult().writable).toBe(false);
  });
});
