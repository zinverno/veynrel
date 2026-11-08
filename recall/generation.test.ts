import { describe, expect, it, vi } from "vitest";
import { DEFAULT_GENERATION_OPTIONS, generateRecall, parseRecallOutput, prepareRecallSource, serializeRecallInsertion } from "./authoring";
import { parseMarkdownFlashcards } from "./parser/markdownFlashcards";

const prompt = "USER OVERRIDE";
describe("Recall source, generation contract and exact insertion", () => {
  it("excludes previous Flashcards and properties, retains other sections and never silently truncates", () => {
    const source = "---\ntags: [private]\n---\n# Lesson\nCondition: only when X is absent.\n## Flashcards\nOld::Answer\n### Nested\nOld2::Answer\n## Further\nA different idea.\n";
    expect(prepareRecallSource(source)).toBe("# Lesson\nCondition: only when X is absent.\n## Further\nA different idea.\n");
    expect(() => prepareRecallSource("x".repeat(32001))).toThrow("source-too-long");
    expect(prepareRecallSource("x".repeat(32001) + "\nChosen section.", "Chosen section.")).toBe("Chosen section.");
    expect(() => prepareRecallSource(source, "Old::Answer")).toThrow();
  });
  it.each(["", "   ", "## Flashcards\nOld::A", "---\ntitle: empty\n---\n"])("does not send empty study material %j", async source => {
    const call = vi.fn(); await expect(generateRecall(source, prompt, DEFAULT_GENERATION_OPTIONS, call)).rejects.toThrow("insufficient-material");
    expect(call).not.toHaveBeenCalled();
  });
  it("reports excessive length before any transport call", async () => {
    const call = vi.fn(); await expect(generateRecall("x".repeat(32001), prompt, DEFAULT_GENERATION_OPTIONS, call)).rejects.toThrow("source-too-long");
    expect(call).not.toHaveBeenCalled();
  });
  it.each(["", "No cards here", "Q::", "::A", "Q::A::B", "#flashcards/attack Q::A", "Q::A\nBroken", "Q\u0000::A", "Q".repeat(2001) + "::A", "Q::" + "A".repeat(8001), "```\nQ::A\n```", "Q::<!-- hidden -->", "Question::A\n---"])("rejects malformed/model-controlled syntax %j without repair", async raw => {
    const call = vi.fn(async () => raw);
    await expect(generateRecall("Supported source", prompt, DEFAULT_GENERATION_OPTIONS, call)).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("uses the override, applies user tags in serialization and deduplicates only the new exact response", async () => {
    const call = vi.fn(async (_system: string, _source: string) => "Q::A\nQ::A\nAnother::B");
    const generated = await generateRecall("Source", prompt, { ...DEFAULT_GENERATION_OPTIONS, tag: "flashcards/db", count: 5 }, call);
    expect(call.mock.calls[0][0]).toContain(prompt); expect(generated.cardCount).toBe(2);
    const parsed = await parseMarkdownFlashcards("A.md", generated.newContent);
    expect(parsed.complete).toBe(true); expect(parsed.cards.every(card => card.studyTags[0] === "flashcards/db")).toBe(true);
    expect(await parseRecallOutput("Q::A", 5)).toEqual(["Q::A"]);
    await expect(parseRecallOutput("Q::A\nR::B", 1)).rejects.toThrow();
  });
  it.each(["\n", "\r\n"])("inserts once in the first suitable section preserving every old character (%j)", async eol => {
    const source = "\uFEFF---\ntype: personal\n---\n# Lesson  \nFacts.  \n```md\n## Flashcards\nHidden::A\n```\n<!--\n## Flashcards\nHidden::A\n-->\n## Flashcards\nOld::A  \n## Next\nKeep  \n## Flashcards\nAlso old::B\n  ".replace(/\n/gu, eol);
    const { at, text, newContent } = serializeRecallInsertion(source, ["New::C"], "flashcards/test");
    expect(newContent.slice(0, at) + newContent.slice(at + text.length)).toBe(source);
    expect(newContent.indexOf("New::C")).toBeLessThan(newContent.indexOf("## Next"));
    expect(newContent.endsWith(`Also old::B${eol}  `)).toBe(true);
    expect((await parseMarkdownFlashcards("A.md", newContent)).cards.map(card => card.question)).toEqual(["Old", "New", "Also old"]);
  });
  it.each(["```\ncode", "<!-- comment", "<!-- closed --> <!-- open\n## Flashcards", "---\nfrontmatter"])("refuses insertion into unclosed Markdown %j", source => {
    expect(() => serializeRecallInsertion(source, ["Q::A"], "")).toThrow();
  });
});
