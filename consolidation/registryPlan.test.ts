import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {} }));
import { buildRegistryPlan, registryDefinitionsAfter, RegistryUnchangedError, validateRegistryPlan } from "./registryPlan";
import { organizationDocument, parseOrganizationDocument } from "./organizationProfile";
import { localBytes } from "./localNotePlan";
import type { OrganizationDefinitions } from "./organizationProfile";
const definitions: OrganizationDefinitions = { version: 1, profile: { version: 1, categories: [{ id: "mine", name: "Темы", purpose: "topic", multiplicity: "multiple", interpretation: "global", prefixes: ["Тема"], tags: ["Rare"] }] },
  tags: [{ tag: "Rare", state: "allowed", description: "Unused but deliberate" }, { tag: "flashcards/Study", state: "allowed", description: "Study only" }],
  conventions: [{ subject: "folder", value: "!My order", description: "Deliberate exception" }] };
const source = (content = organizationDocument(null, definitions)) => ({ path: "Rules.md", content, bytes: localBytes(content), created: 1, modified: 2 });
const add = { kind: "tag" as const, key: null, value: { tag: "тема/Ёж", state: "allowed" as const, description: "Future use" } };
describe("one strictly reconstructed registry definition patch", () => {
  it("does not turn editing status/description into a silent tag rename or category ID replacement", () => {
    expect(() => buildRegistryPlan(source(), { kind: "tag", key: "Rare", value: { ...definitions.tags[0], tag: "rare" } })).toThrow();
    expect(() => buildRegistryPlan(source(), { kind: "category", key: "mine", value: { ...definitions.profile.categories[0], id: "other" } })).toThrow();
  });
  it("a category set reordering alone is not a substantive change", () => {
    const defs = structuredClone(definitions); defs.profile.categories[0].tags = ["A", "B"];
    const next = { ...defs.profile.categories[0], tags: ["B", "A"] };
    expect(() => buildRegistryPlan(source(organizationDocument(null, defs)), { kind: "category", key: "mine", value: next })).toThrow(RegistryUnchangedError);
  });
  it.each(["\n", "\r\n"])("preserves all surrounding Markdown and %j line endings, including YAML and Unicode", newline => {
    const before = '---\ntitle: "My rules: Ё"\ncustom: [a, b]\n---\n\n# User explanation\n<!-- keep -->\n\n```veynrel-organization\n' + JSON.stringify(definitions) + '\n```\n\nAfter: [[Folder/Note|alias]] and `code`.\n';
    const n = source(before.replace(/\n/g, newline)), p = buildRegistryPlan(n, add);
    expect(p.after.slice(0, p.edit.start)).toBe(n.content.slice(0, p.edit.start));
    expect(p.after.slice(p.edit.start + p.edit.inserted.length)).toBe(n.content.slice(p.edit.end));
    expect(parseOrganizationDocument(p.after).tags).toEqual([...definitions.tags, add.value]);
    expect(parseOrganizationDocument(p.after).profile).toEqual(definitions.profile);
    expect(parseOrganizationDocument(p.after).conventions).toEqual(definitions.conventions);
    if (newline === "\r\n") expect(p.edit.inserted.replace(/\r\n/g, "")).not.toContain("\n");
    validateRegistryPlan(p);
  });
  it("changes one status/description, never normalizes spelling or unused/flashcards definitions", () => {
    const p = buildRegistryPlan(source(), { kind: "tag", key: "Rare", value: { ...definitions.tags[0], state: "deprecated", description: "Retained" } });
    expect(parseOrganizationDocument(p.after).tags).toEqual([{ tag: "Rare", state: "deprecated", description: "Retained" }, definitions.tags[1]]);
    expect(parseOrganizationDocument(p.after).profile).toEqual(definitions.profile);
  });
  it("edits conventions and categories through their existing validators; preserves other definitions", () => {
    const next = registryDefinitionsAfter(definitions, { kind: "convention", key: JSON.stringify(["folder", "!My order"]), value: { subject: "type", value: "Diary", description: "For personal records" } });
    expect(next.tags).toEqual(definitions.tags); expect(next.profile).toEqual(definitions.profile);
    const category = { ...definitions.profile.categories[0], name: "My terms" };
    expect(registryDefinitionsAfter(next, { kind: "category", key: "mine", value: category }).profile.categories).toEqual([category]);
    expect(() => registryDefinitionsAfter(next, { kind: "category", key: "mine", value: { ...category, prefixes: ["nested/prefix"] } })).toThrow();
  });
  it("only removes an explicitly named existing definition, never its note usages or other definitions", () => {
    const p = buildRegistryPlan(source(), { kind: "tag", key: "Rare", value: null });
    expect(parseOrganizationDocument(p.after).tags).toEqual([definitions.tags[1]]);
    expect(parseOrganizationDocument(p.after).profile).toEqual(definitions.profile);
    expect(() => buildRegistryPlan(source(), { kind: "tag", key: "missing", value: null })).toThrow();
    expect(() => buildRegistryPlan(source(), { kind: "tag", key: null, value: null })).toThrow();
  });
  it("semantic no-op including object key reordering refuses before any write plan", () => {
    expect(() => buildRegistryPlan(source(), { kind: "tag", key: "Rare", value: { description: "Unused but deliberate", state: "allowed", tag: "Rare" } })).toThrow(RegistryUnchangedError);
  });
  it.each([
    (s: string) => s + s,
    (s: string) => s.replace('"version": 1', '"version": 1, "version": 1'),
    (s: string) => s.replace('"version": 1', '"version": 22'),
    (s: string) => s.replace('"tags": [', '"tags": [undefined,'),
    (s: string) => '\uFEFF' + s,
    (s: string) => '````markdown\n' + s + '\n````',
    (s: string) => s.replace('```veynrel-organization', '    ```veynrel-organization'),
    (s: string) => s.replace('```veynrel-organization', '```veynrel-organization extra'),
    (s: string) => s.replace(/```\n$/, '````\n'),
    (s: string) => s + '\n~~~unclosed\n',
    (s: string) => 'x'.repeat(262144) + s,
  ])("refuses ambiguous or unsupported documents (%#) without destructive recovery", transform => {
    expect(() => buildRegistryPlan(source(transform(organizationDocument(null, definitions))), add)).toThrow();
  });
  it("a valid JSON hash or after string cannot authorize another patch", () => {
    const p = buildRegistryPlan(source(), add);
    expect(() => validateRegistryPlan({ ...p, after: p.after + 'lost context' })).toThrow();
    expect(() => validateRegistryPlan({ ...p, edit: { ...p.edit, start: 0 } })).toThrow();
    expect(() => buildRegistryPlan({ ...source(), bytes: 1 }, add)).toThrow();
  });
});
