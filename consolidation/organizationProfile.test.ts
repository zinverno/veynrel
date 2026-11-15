import { describe, expect, it } from "vitest";
import { organizationDocument, organizationPreferences, organizationTagState, parseOrganizationDocument } from "./organizationProfile";
const wrap = (value: unknown) => "# My definitions\n\n```veynrel-organization\n" + JSON.stringify(value) + "\n```\n";
const definitions = () => ({ version: 1, profile: { version: 1, categories: [] }, tags: [{ tag: "topic/rare", state: "allowed", description: "Deliberately rare" }], conventions: [{ subject: "folder", value: "!My own order", description: "Intentional" }] });
describe("optional Markdown organization definitions", () => {
  it("round-trips the legacy profile unchanged and preserves literal user definitions", () => {
    const value = definitions(); const content = wrap(value);
    expect(parseOrganizationDocument(content)).toEqual(value);
    expect(parseOrganizationDocument(organizationDocument(null))).toEqual({ version: 1, profile: { version: 1, categories: [] }, tags: [], conventions: [] });
    expect(parseOrganizationDocument(content.split("\n").join("\r\n"))).toEqual(value);
  });
  it.each(["", "```veynrel-organization\n{\n```", wrap(definitions()) + wrap(definitions()), wrap({ ...definitions(), unexpected: true }), wrap({ ...definitions(), tags: [{ tag: "bad//path", state: "allowed", description: "" }] })])("refuses malformed or ambiguous blocks", content => {
    expect(() => parseOrganizationDocument(content)).toThrow();
  });
  it("distinguishes unsupported versions, including future schemas, from malformed data", () => {
    expect(() => parseOrganizationDocument(wrap({ version: 2, futureRules: [] }))).toThrow("unsupported");
    expect(() => parseOrganizationDocument(wrap({ ...definitions(), version: "oops" }))).toThrow();
  });
  it("rejects duplicate keys and escaped aliases rather than discarding definitions", () => {
    const content = wrap(definitions()).replace('"version":1', '"version":1,"ver\\u0073ion":1');
    expect(() => parseOrganizationDocument(content)).toThrow("invalid");
  });
  it("keeps allowed unused, candidate, unknown, excluded and deprecated tags distinct", () => {
    const d = parseOrganizationDocument(wrap(definitions()));
    d.tags.push({ tag: "topic/old", state: "deprecated", description: "Old" }, { tag: "flashcards/private", state: "excluded", description: "Recall namespace" });
    const observed = new Set(["topic/used", "topic/old", "flashcards/private"]), candidates = new Set(["topic/new"]);
    expect(["topic/used", "topic/rare", "topic/new", "topic/raer", "topic/old", "flashcards/private"].map(tag => organizationTagState(tag, observed, d, candidates)))
      .toEqual(["observed", "allowed-unused", "candidate", "unknown", "deprecated", "excluded"]);
    expect(d.tags[0].tag).toBe("topic/rare");
  });
  it("bounds definitions/preferences and never persists observations or silently evicts decisions", () => {
    expect(organizationPreferences()).toEqual({ version: 1, registryPath: null, dismissed: [] });
    expect(() => organizationPreferences({ version: 1, registryPath: "../rules.md", dismissed: [] })).toThrow();
    expect(() => organizationPreferences({ version: 1, registryPath: null, dismissed: [], notes: [] })).toThrow();
    expect(() => organizationPreferences({ version: 1, registryPath: null, dismissed: Array.from({ length: 201 }, (_, i) => "org:" + i) })).toThrow();
    expect(() => parseOrganizationDocument(wrap({ ...definitions(), tags: Array.from({ length: 1001 }, (_, i) => ({ tag: "tag/" + i, state: "allowed", description: "" })) }))).toThrow("limit");
  });
});
