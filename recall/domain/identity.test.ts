import { describe, expect, it } from "vitest";
import { stableHash } from "../../utils/stableHash";
import { createRecallCandidate, isRecallId } from "./identity";
import { isRecallCandidate } from "./validation";
import { parseMarkdownFlashcards } from "../parser/markdownFlashcards";

const source = { path: "Notes/База.md", question: "What is X?", answer: "Y 😀" };

describe("Recall identity v1", () => {
  it("uses exact versioned tuple and the existing stableHash, trimming only outer whitespace", () => {
    const card = createRecallCandidate(source);
    expect(card).toEqual(createRecallCandidate({ ...source, question: ` \r\n${source.question}\r`, answer: ` ${source.answer} ` }));
    expect(card.fingerprint).toBe(`v1:${JSON.stringify([source.path, source.question, source.answer])}`);
    expect(card.id).toBe(`recall-${stableHash(card.fingerprint)}`);
    expect(isRecallId(card.id)).toBe(true);
    expect(isRecallCandidate(card)).toBe(true);
  });

  it.each([{ path: "Notes/Renamed.md" }, { question: "What is Z?" }, { answer: "Z 😀" }, { question: "what is X?" },
    { question: "What is X!" }, { path: "notes/База.md" }, { answer: "Y  😀" }])("changes identity for %j", (change) => {
    expect(createRecallCandidate({ ...source, ...change }).id).not.toBe(createRecallCandidate(source).id);
  });

  it("does not Unicode-fold canonically equivalent text", () => {
    expect(createRecallCandidate({ ...source, answer: "é" }).id).not.toBe(createRecallCandidate({ ...source, answer: "e\u0301" }).id);
  });

  it("keeps IDs when cards are reordered or unrelated prose changes", async () => {
    const one = await parseMarkdownFlashcards(source.path, "Body\n## Flashcards\nOne::A\nTwo::B");
    const two = await parseMarkdownFlashcards(source.path, "New body\n\n## Flashcards\nTwo::B\n\nOne::A");
    expect(one.cards.map((card) => card.id).sort()).toEqual(two.cards.map((card) => card.id).sort());
  });

  it.each(["finding-0123456789abcdef", "recall-ABCDEF0123456789", "recall-1", "recall-0123456789abcdef\n", "__proto__"])("rejects ID %j", (id) => {
    expect(isRecallId(id)).toBe(false);
  });
});
