import { describe, expect, it } from "vitest";
import { categoryDefaults, categoryForTag, parseTaxonomyProfile, requireTaxonomyProfile, suggestTaxonomy } from "./taxonomyProfile";
import type { TagTaxonomyProfile } from "./taxonomyProfile";

export const taxonomyFixture = (): TagTaxonomyProfile => ({ version: 1, categories: [
  { id: "roles", name: "Роль", ...categoryDefaults("role"), prefixes: ["role", "тип"], tags: ["Практика"] },
  { id: "difficulty", name: "Сложность", ...categoryDefaults("difficulty"), prefixes: ["difficulty"], tags: [] },
] });

describe("confirmed taxonomy rules", () => {
  it("uses literal prefixes and independent dimensions without merging English/Russian values", () => {
    const proposals = suggestTaxonomy(["role/theory", "роль/теория", "тип/практика", "type/moc", "difficulty/basic", "domain/programming", "topic/cache", "Flat"], []);
    expect(proposals.map(item => item.name)).toEqual(["role", "роль", "тип", "type", "difficulty", "domain", "topic"]);
    expect(proposals.filter(item => ["тип", "type"].includes(item.name)).every(item => item.purpose === "other")).toBe(true);
    expect(proposals.find(item => item.name === "difficulty")).toMatchObject({ multiplicity: "one_primary", interpretation: "domain" });
    expect(proposals.find(item => item.name === "domain")).toMatchObject({ multiplicity: "multiple", interpretation: "global" });
    expect(proposals.every(item => !item.tags.length)).toBe(true);
  });
  it("stores a user-approved union of prefixes, exact flat assignments and editable preferences", () => {
    const value = taxonomyFixture(); value.categories[0].multiplicity = "multiple"; value.categories[1].interpretation = "global";
    const profile = requireTaxonomyProfile(value); expect(profile).toEqual(value); expect(profile).not.toBe(value);
    expect(categoryForTag("тип/теория", profile.categories)?.id).toBe("roles");
    expect(categoryForTag("Практика", profile.categories)?.id).toBe("roles");
    expect(categoryForTag("практика", profile.categories)).toBeUndefined();
    expect(categoryForTag("role", profile.categories)).toBeUndefined();
    expect(suggestTaxonomy(["role/new", "тип/new", "topic/new"], profile.categories).map(item => item.name)).toEqual(["topic"]);
  });
  it.each(["id", "name", "prefix", "tag"])("rejects conflicting %s assignments", field => {
    const profile = taxonomyFixture();
    if (field === "id") profile.categories[1].id = profile.categories[0].id;
    if (field === "name") profile.categories[1].name = profile.categories[0].name;
    if (field === "prefix") profile.categories[1].prefixes.push("role");
    if (field === "tag") profile.categories[1].tags.push("Практика");
    expect(() => requireTaxonomyProfile(profile)).toThrow("conflict");
  });
  it.each([null, undefined, {}, { version: 2, categories: [] }, { version: 1, categories: [], notes: "not rules" }])("ignores invalid/legacy profiles %j", value => {
    expect(parseTaxonomyProfile(value)).toBeNull();
  });
  it("rejects hierarchical flat assignments and incompatible policy enum values", () => {
    const value = taxonomyFixture(); value.categories[0].tags = ["role/theory"];
    expect(() => requireTaxonomyProfile(value)).toThrow("invalid");
    const invalid = { ...taxonomyFixture(), categories: [{ ...taxonomyFixture().categories[0], multiplicity: "mandatory_single" }] };
    expect(parseTaxonomyProfile(invalid)).toBeNull();
    expect(parseTaxonomyProfile({ ...taxonomyFixture(), categories: [{ ...taxonomyFixture().categories[0], purpose: "type" }] })).toBeNull();
  });
});
