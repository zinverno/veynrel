import { describe, expect, it, vi } from "vitest";
import type { CachedMetadata } from "obsidian";
import { buildLocalNotePlan, localBytes, localTag, repairRanges, validateLocalNotePlan } from "./localNotePlan";
import type { LocalSource } from "./localNotePlan";
vi.mock("obsidian", () => ({ TFile: class {} }));
const pos = (offset: number) => ({ offset, line: 0, col: offset });
function fixture(content = "Простой абзац.\r\n\r\n[[Missing]] and [[Missing]]\r\n") {
  const source: LocalSource = { path: "Source.md", created: 1, modified: 2, bytes: localBytes(content), content };
  const end = content.indexOf("\r"), start = content.indexOf("[[");
  const links = [...content.matchAll(/\[\[Missing\]\]/gu)].map(m => ({ original: m[0], link: "Missing", position: { start: pos(m.index!), end: pos(m.index! + m[0].length) } }));
  const metadata: CachedMetadata = { sections: [{ type: "paragraph", position: { start: pos(0), end: pos(end) } },
    { type: "paragraph", position: { start: pos(start), end: pos(content.length - 2) } }], links };
  const range = { start: 0, end, text: content.slice(0, end) };
  return { source, metadata, range };
}
describe("bounded local note transforms", () => {
  it("adds one explicit tag without changing CRLF or Unicode; validates exact journal transform", () => {
    const f = fixture(), p = buildLocalNotePlan(f.source, f.metadata, "rules", { kind: "add_inline_tag", tag: "тема/Редкий", range: f.range });
    expect(p.after).toBe("Простой абзац. #тема/Редкий\r\n\r\n[[Missing]] and [[Missing]]\r\n");
    expect(() => validateLocalNotePlan(p)).not.toThrow();
    expect(() => validateLocalNotePlan({ ...p, after: "arbitrary" })).toThrow();
  });
  it("replaces only the explicitly selected second identical occurrence", () => {
    const f = fixture(), ranges = repairRanges(f.source, f.metadata);
    const p = buildLocalNotePlan(f.source, f.metadata, "", { kind: "repair_wikilink", range: ranges[1], target: { ...f.source, path: "Other/Target.md" } });
    expect(p.after).toBe("Простой абзац.\r\n\r\n[[Missing]] and [[Other/Target]]\r\n");
    expect(() => validateLocalNotePlan(p)).not.toThrow();
    expect(() => validateLocalNotePlan({ ...p, choice: { ...p.choice, arbitrary: true } })).toThrow();
  });
  it.each(["123", "topic//empty", "bad tag", "bad#tag", "flashcards", "Flashcards/topic", "bad:tag", "a\\b"])("refuses unsupported tag %s", tag => expect(localTag(tag)).toBe(false));
  it.each(["Rare_Tag", "-", "тема/Мир", "123/a", "Unusual-Category"])("accepts explicit syntax without guessing meaning %s", tag => expect(localTag(tag)).toBe(true));
  it.each(["#topic/rare", "#TOPIC/RARE", "code #topic/rare", "#topic/rare/child"])("does not infer absence from an incomplete cache: %s", text => {
    const f = fixture(); f.source.content += text; f.source.bytes = localBytes(f.source.content);
    expect(() => buildLocalNotePlan(f.source, f.metadata, "", { kind: "add_inline_tag", tag: "topic/rare", range: f.range })).toThrow();
  });
  it("refuses missing sections, stale range, unknown keys, and a stripped BOM byte mismatch", () => {
    const f = fixture(), choice = { kind: "add_inline_tag" as const, tag: "test", range: f.range };
    expect(() => buildLocalNotePlan(f.source, {}, "", choice)).toThrow();
    expect(() => buildLocalNotePlan({ ...f.source, bytes: f.source.bytes + 3 }, f.metadata, "", choice)).toThrow();
    expect(() => buildLocalNotePlan(f.source, f.metadata, "", { ...choice, range: { ...f.range, start: 1 } })).toThrow();
  });
  it.each(["![[Missing]]", "[[Missing|Alias]]", "[[Missing#Heading]]", "[[Missing^block]]", "`[[Missing]]`", "```\n[[Missing]]\n```"])("refuses protected occurrence %s", content => {
    const f = fixture(content + "\r\n"); expect(repairRanges(f.source, f.metadata)).toEqual([]);
  });
  it.each(["tags: topic/rare", "tags:\n  - topic/rare", "tags: TOPIC/RARE"])("sees an existing YAML tag: %s", yaml => {
    const content = `---\n${yaml}\n---\n\nPlain.`, start = content.indexOf("Plain."), source = { ...fixture().source, content, bytes: localBytes(content) };
    const tags = yaml.includes("TOPIC") ? "TOPIC/RARE" : yaml.includes("  -") ? ["topic/rare"] : "topic/rare";
    const cache = { frontmatter: { tags }, frontmatterPosition: { start: pos(0), end: pos(start - 2) }, sections: [{ type: "paragraph", position: { start: pos(start), end: pos(content.length) } }] };
    expect(() => buildLocalNotePlan(source, cache, "", { kind: "add_inline_tag", tag: "topic/rare", range: { start, end: content.length, text: "Plain." } })).toThrow();
  });
  it("preserves a simple YAML list and adds an unrelated allowed-unused tag", () => {
    const content = "---\r\ntitle: Example\r\ntags:\r\n  - rare/allowed\r\n---\r\n\r\nPlain.", start = content.indexOf("Plain.");
    const source = { ...fixture().source, content, bytes: localBytes(content) };
    const metadata = { frontmatter: { tags: ["rare/allowed"], title: "Example" }, frontmatterPosition: { start: pos(0), end: pos(start - 4) },
      sections: [{ type: "paragraph", position: { start: pos(start), end: pos(content.length) } }] };
    const p = buildLocalNotePlan(source, metadata, "", { kind: "add_inline_tag", tag: "unused", range: { start, end: content.length, text: "Plain." } });
    expect(p.after).toBe(content + " #unused");
  });
  it.each(["tags: [a, b]", "tags: &anchor\n  - x", "title: |\n  multiline", "title: \"quoted\"", "tags: a\ntags: b", "Tag: hidden"])("refuses ambiguous YAML intact: %s", yaml => {
    const content = `---\n${yaml}\n---\n\nPlain.`, start = content.indexOf("Plain.");
    const source = { ...fixture().source, content, bytes: localBytes(content) }, metadata = { frontmatter: {}, frontmatterPosition: { start: pos(0), end: pos(start - 2) },
      sections: [{ type: "paragraph", position: { start: pos(start), end: pos(content.length) } }] };
    expect(() => buildLocalNotePlan(source, metadata, "", { kind: "add_inline_tag", tag: "new", range: { start, end: content.length, text: "Plain." } })).toThrow();
  });

});
