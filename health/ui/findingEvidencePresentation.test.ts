import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ getLanguage: () => "en" }));
import { setLanguage } from "../../i18n";
import { findingEvidencePresentation } from "./findingEvidencePresentation";
import { inboxFinding } from "./testSupport";
import type { FindingEvidence } from "../domain/finding";

const degree: FindingEvidence[] = [{ kind: "incoming-count", value: 0 }, { kind: "outgoing-count", value: 3 }];
const cases: Array<[string, FindingEvidence[], string[], string[]]> = [
  ["broken-link", [{ kind: "source-path", path: "Notes/A.md" }, { kind: "target", value: "Retrieval {n}" }, { kind: "occurrence-count", value: 3 }],
    ["Missing target: Retrieval {n}", "Occurrences: 3"], ["Не найден адресат ссылки: Retrieval {n}", "Вхождений: 3"]],
  ...["orphan-note", "no-incoming-links", "no-outgoing-links"].map((type): [string, FindingEvidence[], string[], string[]] =>
    [type, degree, ["Incoming links: 0", "Outgoing links: 3"], ["Входящих ссылок: 0", "Исходящих ссылок: 3"]]),
  ...["empty-note", "near-empty-note"].map((type): [string, FindingEvidence[], string[], string[]] =>
    [type, [{ kind: "meaningful-character-count", value: 0 }], ["Letters and numbers in the note body: 0"], ["Букв и цифр в основном тексте: 0"]]),
  ["exact-duplicate-group", [{ kind: "member-count", value: 3 }],
    ["3 notes contain exactly the same normalized Markdown content, including properties."], ["Заметок с полностью одинаковым нормализованным Markdown, включая свойства: 3."]],
  ["duplicate-title-group", [{ kind: "basename", value: "Тема" }, { kind: "member-count", value: 3 }],
    ["3 notes share the same filename without its extension.", "Name: Тема"], ["Заметок с одинаковым именем файла без расширения: 3.", "Имя: Тема"]],
  ["isolated-graph-component", [{ kind: "component-size", value: 7 }, { kind: "primary-component-size", value: 248 }],
    ["7 notes form a disconnected group.", "Main connected group: 248 notes."], ["Заметок в обособленной группе: 7.", "Заметок в основной связанной группе: 248."]],
];

describe("localized evidence allowlist", () => {
  it.each([[0.971, 97], [0.975, 98], [1, 100], [-1, -100]] as const)("presents score %s as rounded similarity %s, not probability", (score, percentage) => {
    const finding = inboxFinding({ source: "semantic", type: "semantic-duplicate", notePaths: ["A.md", "B.md"], evidence: [{ kind: "similarity-score", value: score }] });
    setLanguage("en"); expect(findingEvidencePresentation(finding)).toMatchObject({ facts: [`Semantic similarity: ${percentage}%`], affectedCount: 2 });
    setLanguage("ru"); expect(findingEvidencePresentation(finding).facts).toEqual([`Сходство по смыслу: ${percentage}%`]);
  });
  it.each([NaN, Infinity, 1.1, -1.1, "0.97"])("does not clamp invalid persisted score %s into a plausible percentage", (value) => {
    expect(findingEvidencePresentation(inboxFinding({ source: "semantic", type: "semantic-duplicate", evidence: [{ kind: "similarity-score", value }] })).facts).toEqual([]);
  });
  it.each(cases)("presents every current %s fact in EN/RU without changing identity or evidence", (type, evidence, en, ru) => {
    const finding = inboxFinding({ type, evidence }); const before = structuredClone(finding);
    setLanguage("en"); expect(findingEvidencePresentation(finding).facts).toEqual(en);
    setLanguage("ru"); expect(findingEvidencePresentation(finding).facts).toEqual(ru);
    expect(finding).toEqual(before);
  });
  it.each(["en", "ru"] as const)("combines truncation metadata and incomplete degree in %s without dumping fields", (language) => {
    setLanguage(language);
    for (const [type, key] of [["broken-link", "target"], ["duplicate-title-group", "basename"]]) {
      const finding = inboxFinding({ type, evidence: [{ kind: key, value: "Long target" }, { kind: `${key}-length`, value: 1000 },
        { kind: `${key}-truncated`, value: true }, { kind: "secret-debug-value", value: "hidden" }] });
      const presentation = findingEvidencePresentation(finding);
      expect(presentation.facts).toHaveLength(1); expect(presentation.facts[0]).toContain("Long target…");
      expect(JSON.stringify(presentation)).not.toMatch(/1000|length|truncated|secret-debug|hidden|true/u);
    }
    const incomplete = findingEvidencePresentation(inboxFinding({ type: "no-outgoing-links", evidence: [
      ...degree, { kind: "incoming-count-complete", value: false }] }));
    expect(incomplete.facts).toHaveLength(3);
    expect(incomplete.facts[1]).toBe(language === "en" ? "Incoming-link count may be incomplete." : "Число входящих ссылок может быть неполным.");
    expect(JSON.stringify(incomplete)).not.toMatch(/incoming-count-complete|false/u);
  });
  it.each(["exact-duplicate-group", "duplicate-title-group", "isolated-graph-component"])("uses the true size for capped %s", (type) => {
    setLanguage("en");
    const finding = inboxFinding({ type, notePaths: Array.from({ length: 100 }, (_, i) => `${i}.md`), evidence: [
      { kind: type === "isolated-graph-component" ? "component-size" : "member-count", value: 105 }, { kind: "represented-path-count", value: 100 }] });
    expect(findingEvidencePresentation(finding)).toMatchObject({ affectedCount: 105, representativeSummary: "Showing 100 representative paths" });
  });
  it("does not interpret unknown/nonlocal evidence, wrong values or arbitrary action descriptors", () => {
    setLanguage("en");
    for (const finding of [inboxFinding({ type: "future-type" }), inboxFinding({ source: "semantic" }),
      inboxFinding({ evidence: [{ kind: "target", value: false }, { kind: "occurrence-count", value: -1 }] })]) {
      expect(findingEvidencePresentation(finding).facts).toEqual([]);
    }
  });
});
