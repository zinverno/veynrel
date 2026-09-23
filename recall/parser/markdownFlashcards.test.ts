import { describe, expect, it } from "vitest";
import { MAX_ANSWER_LENGTH, MAX_NOTE_LENGTH, MAX_QUESTION_LENGTH, MAX_RECALL_CARDS } from "../domain/card";
import { parseMarkdownFlashcards } from "./markdownFlashcards";

const parse = (content: string, path = "Notes/Test.md", signal?: AbortSignal) => parseMarkdownFlashcards(path, content, signal);
const section = (text = "What is X::Y\nWhy Z::Because Q") => `## Flashcards\n#flashcards\n\n${text}`;

describe("Recall Markdown extraction", () => {
  it("extracts the existing generated section with blanks, marker and EOF", async () => {
    const result = await parse(`Body with unrelated foo::bar.\n\n${section()}\n\n`);
    expect(result.cards.map(({ question, answer }) => [question, answer])).toEqual([["What is X", "Y"], ["Why Z", "Because Q"]]);
    expect(result).toMatchObject({ complete: true, diagnostics: [], diagnosticsTruncated: 0 });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.cards)).toBe(true);
    expect(Object.isFrozen(result.cards[0])).toBe(true);
  });

  it.each(["# Next", "## Next", "Next\n---", "Next\n==="])("ends at same/higher heading %j", async (next) => {
    const result = await parse(`${section("Q::A")}\n${next}\nNot a card::outside`);
    expect(result.cards.map((card) => card.question)).toEqual(["Q"]);
  });

  it("keeps nested sections, and supports repeated sections without changing original section level", async () => {
    const result = await parse(`${section("One::A")}\n### Details\nTwo::B\n### Flashcards\nThree::C\n## End\nOutside::X\n${section("Four::D")}`);
    expect(result.cards.map((card) => card.question)).toEqual(["One", "Two", "Three", "Four"]);
  });

  it.each(["# Flashcards", "### Flashcards", "  ## Flashcards ###", "##\tFlashcards\t"])("narrowly normalizes ATX heading %j", async (heading) => {
    expect((await parse(`${heading}\nQ::A`)).cards).toHaveLength(1);
  });

  it.each(["foo::bar", "#flashcards\nfoo::bar", "## flashcards\nfoo::bar", "## Флешкарты\nfoo::bar", "## Flashcards extra\nfoo::bar",
    "## **Flashcards**\nfoo::bar", "Flashcards\n---\nfoo::bar"])("ignores non-generated scope %j", async (body) => {
    expect((await parse(body)).cards).toEqual([]);
  });

  it.each(["```", "~~~", "````"])("ignores code fence %j, fake headings and shorter/nonmatching closes", async (fence) => {
    const result = await parse(`${fence}md\n## Flashcards\nHidden::A\n${fence}\n${section("One::A")}\n${fence}js\nFake::B\n## End\n${fence[0].repeat(2)}\nStill hidden::C\n${fence[0] === "`" ? "~~~" : "```"}\nHidden too::D\n${fence}\nTwo::B`);
    expect(result.cards.map((card) => card.question)).toEqual(["One", "Two"]);
    expect(result.complete).toBe(true);
  });

  it("ignores indented code and HTML comments", async () => {
    const result = await parse(`${section("Q::A")}\n    Code::No\n\tCode::No\n<!--\nHidden::No\n## End\n-->\n<!-- Hidden::No -->\nReal::Yes`);
    expect(result.cards.map((card) => card.question)).toEqual(["Q", "Real"]);
  });

  it.each(["---", "..."])("ignores frontmatter through %j", async (close) => {
    const result = await parse(`\uFEFF---\n## Flashcards\nsecret::not a card\n${close}\n${section("Q::A")}`);
    expect(result.cards.map((card) => card.question)).toEqual(["Q"]);
    expect(result.complete).toBe(true);
  });

  it("does not expose frontmatter with trailing delimiter whitespace as cards", async () => {
    const result = await parse(`--- \t\n## Flashcards\nHidden::No\n--- \n${section("Q::A")}`);
    expect(result.cards.map((card) => card.question)).toEqual(["Q"]);
    expect(result.complete).toBe(true);
  });

  it.each([["---\n## Flashcards\nQ::A", "unclosed-frontmatter"], ["```\n## Flashcards\nQ::A", "unclosed-fence"],
    ["<!--\n## Flashcards\nQ::A", "unclosed-comment"]])("marks unsafe unclosed input incomplete", async (body, code) => {
    const result = await parse(body);
    expect(result).toMatchObject({ cards: [], complete: false, diagnostics: [{ code, path: "Notes/Test.md" }] });
  });

  it.each(["::A", "Q::", "  ::  ", "Q::bad\0answer", "Q::line\u2028break"])("rejects malformed explicit card %j without hiding incomplete coverage", async (line) => {
    const result = await parse(section(`Valid::Yes\n${line}`));
    expect(result.cards).toHaveLength(1);
    expect(result).toMatchObject({ complete: false, diagnostics: [{ code: "malformed-card" }] });
    expect(JSON.stringify(result.diagnostics)).not.toContain(line);
  });

  it("uses first :: as the only structural boundary, preserving later separators", async () => {
    const result = await parse(section("Why::Because A::B\nColon:::"));
    expect(result.cards.map(({ question, answer }) => [question, answer])).toEqual([["Why", "Because A::B"], ["Colon", ":"]]);
  });

  it("accepts exact bounds and diagnoses oversized explicit text", async () => {
    const q = "Q".repeat(MAX_QUESTION_LENGTH), a = "A".repeat(MAX_ANSWER_LENGTH);
    expect((await parse(section(`${q}::${a}`))).cards).toHaveLength(1);
    for (const line of [`${q}Q::A`, `Q::${a}A`]) {
      expect(await parse(section(line))).toMatchObject({ cards: [], complete: false, diagnostics: [{ code: "oversized-card" }] });
    }
    expect(await parse("a".repeat(MAX_NOTE_LENGTH + 1))).toMatchObject({ complete: false, diagnostics: [{ code: "oversized-note" }] });
  });

  it.each(["\r\n", "\r", "\n"])("normalizes line endings %j, preserves Unicode, Markdown, case, punctuation and internal whitespace", async (eol) => {
    const result = await parse(section("  Что такое **X**? :: Ответ — 日本語 😀  \nQ\tQ::A  A").replace(/\n/gu, eol));
    expect(result.cards.map(({ question, answer }) => [question, answer])).toEqual([["Что такое **X**?", "Ответ — 日本語 😀"], ["Q\tQ", "A  A"]]);
  });

  it("deduplicates normalized identical cards across sections without ordinal identities", async () => {
    const result = await parse(`${section("Q::A\n Q :: A ")}\n## End\n${section("Q::A")}`);
    expect(result.cards).toHaveLength(1);
    expect(result).toMatchObject({ complete: true, diagnostics: [{ code: "duplicate-card" }, { code: "duplicate-card" }] });
  });

  it("bounds diagnostics during collection and preserves the dropped count", async () => {
    const result = await parse(section(Array.from({ length: 105 }, () => "Q::").join("\n")));
    expect(result.diagnostics).toHaveLength(100);
    expect(result.diagnosticsTruncated).toBe(5);
    expect(result.complete).toBe(false);
  });

  it("bounds extracted cards without declaring complete coverage", async () => {
    const result = await parse(section(Array.from({ length: MAX_RECALL_CARDS + 1 }, (_, i) => `${i}::A`).join("\n")));
    expect(result.cards).toHaveLength(MAX_RECALL_CARDS);
    expect(result.complete).toBe(false);
    expect(result.diagnostics).toContainEqual({ code: "card-limit", path: "Notes/Test.md" });
  });

  it.each(["../X.md", "/X.md", "X.txt", "a//B.md", "a/../B.md"])("rejects invalid note source %j", async (path) => {
    expect(await parse(section(), path)).toMatchObject({ cards: [], complete: false, diagnostics: [{ code: "invalid-note" }] });
  });

  it("aborts before parsing and during CPU traversal with no partial result", async () => {
    const before = new AbortController(); before.abort("private reason");
    await expect(parse(section(), "X.md", before.signal)).rejects.toMatchObject({ name: "AbortError", message: "Recall inventory was cancelled." });
    const during = new AbortController();
    const pending = parse(section("Q::A\n".repeat(2000)), "X.md", during.signal);
    setTimeout(() => during.abort(), 0);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
