import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ getLanguage: () => "en" }));
import { setLanguage } from "../../i18n";
import { candidate } from "../store/testSupport";
import { findingPresentation } from "./findingPresentation";
import type { Finding } from "../domain/finding";

const types = ["broken-link", "orphan-note", "no-incoming-links", "no-outgoing-links", "empty-note", "near-empty-note",
  "exact-duplicate-group", "duplicate-title-group", "isolated-graph-component"];
function finding(type: string): Finding {
  return { ...candidate({ type, title: "Persisted title", explanation: "Persisted explanation" }), id: "finding-id", state: "open", firstSeenAt: 1, lastSeenAt: 1 };
}

describe("Finding presentation without identity changes", () => {
  it.each(types)("localizes %s in English and Russian and preserves the entire Finding", (type) => {
    const item = finding(type); const before = structuredClone(item);
    setLanguage("en"); const en = findingPresentation(item);
    setLanguage("ru"); const ru = findingPresentation(item);
    for (const presentation of [en, ru]) {
      expect(presentation.title.length).toBeGreaterThan(5); expect(presentation.explanation.length).toBeGreaterThan(15);
      expect(JSON.stringify(presentation)).not.toMatch(/@health\.|Persisted/u);
    }
    expect(ru.title).toMatch(/[А-Яа-яЁё]/u); expect(ru.explanation).toMatch(/[А-Яа-яЁё]/u);
    expect(en.title).not.toMatch(/[А-Яа-яЁё]/u); expect(en.explanation).not.toMatch(/[А-Яа-яЁё]/u);
    expect(ru.title).not.toBe(en.title); expect(ru.explanation).not.toBe(en.explanation);
    expect(item).toEqual(before); // Includes id, fingerprint, type, source, evidence and actions.
  });
  it.each(["en", "ru"] as const)("preserves unknown future types and nonlocal text in %s", (lang) => {
    setLanguage(lang);
    for (const item of [finding("future-finding"), { ...finding("orphan-note"), source: "semantic" as const }]) {
      expect(findingPresentation(item)).toEqual({ title: "Persisted title", explanation: "Persisted explanation" });
    }
  });
});
