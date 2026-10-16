import { describe, expect, it, vi } from "vitest";
import cases from "../tests/fixtures/tag-recommendations.json";
import type { TagTaxonomyProfile } from "./taxonomyProfile";
import type { TagRecommendations } from "./tagRecommendationContract";
import { TAG_LIMITS, validateTagInput, validateTagResponse, validNewTag } from "./tagRecommendationContract";
import { analyzeTags, prepareTagAnalysis } from "./tagAnalyzer";
function fixture(name = "theory_with_small_example") {
  const item = structuredClone(cases.find(item => item.name === name)!);
  return { input: { content: item.content, profile: item.profile as TagTaxonomyProfile, tags: item.tags }, response: item.response as TagRecommendations };
}
describe("tag recommendation contract (synthetic responses, not model quality)", () => {
  it.each(cases)("accepts supported $name", item => {
    const f = fixture(item.name);
    expect(validateTagResponse(JSON.stringify(f.response), f.input)).toEqual(f.response);
  });
  it("reuses a content-only analyzer without file or settings owners, sending source without expanded embeds", async () => {
    const f = fixture(), prepared = prepareTagAnalysis(f.input, "ru"), transport = vi.fn(async () => JSON.stringify(f.response));
    expect(transport).not.toHaveBeenCalled();
    expect(JSON.parse(prepared.user)).toEqual({ source: f.input.content, confirmedProfile: f.input.profile, observedTags: f.input.tags });
    expect(prepared.system).toContain("does not make the main role practical");
    expect(await analyzeTags(prepared, transport)).toEqual(f.response); expect(transport).toHaveBeenCalledOnce();
    f.input.profile.categories[0].name = "mutation"; expect(prepared.input.profile.categories[0].name).not.toBe("mutation");
  });
  it.each(["invalid", "```json\n{}\n```", "null", "[]", '{"categories":[],"limitations":[]}'])("rejects invalid JSON/schema %s", raw => {
    expect(() => validateTagResponse(raw, fixture().input)).toThrow();
  });
  it.each(["missing", "ambiguous", "false"])("rejects %s evidence and never normalizes excerpts", mode => {
    const f = fixture();
    if (mode === "missing") f.response.categories[0].quote = null;
    if (mode === "ambiguous") f.input.content += f.response.categories[0].quote;
    if (mode === "false") f.response.categories[0].existing[0].evidence.quote = "invented";
    expect(() => validateTagResponse(JSON.stringify(f.response), f.input)).toThrow("evidence");
  });
  it("requires genuine observed tags owned by the confirmed category", () => {
    const f = fixture(); f.response.categories[0].existing[0].tag = "role/invented";
    expect(() => validateTagResponse(JSON.stringify(f.response), f.input)).toThrow("policy");
    f.input.tags.push("topic/known"); f.response.categories[0].existing[0].tag = "topic/known";
    expect(() => validateTagResponse(JSON.stringify(f.response), f.input)).toThrow("policy");
  });
  it.each(["тема/данные", "ТЕМА/ДАННЫЕ", "#тема/новый", "тема//новый", "unknown/new", "123", "тема/has space"])("rejects duplicate/invalid/unbound new tag %s", tag => {
    const f = fixture("justified_new_tag"); f.response.categories[0].proposed[0].tag = tag;
    expect(() => validateTagResponse(JSON.stringify(f.response), f.input)).toThrow("policy");
  });
  it("requires nearest observed comparisons and explicit limitations for a new tag", () => {
    const f = fixture("justified_new_tag"); f.response.categories[0].proposed[0].nearest = [];
    expect(() => validateTagResponse(JSON.stringify(f.response), f.input)).toThrow("policy");
    const g = fixture("justified_new_tag"); g.response.categories[0].proposed[0].limitations = [];
    expect(() => validateTagResponse(JSON.stringify(g.response), g.input)).toThrow();
  });
  it("enforces strict role and permits user-confirmed flexible role", () => {
    const f = fixture(); f.response.categories[0].existing.push({ ...f.response.categories[0].existing[0], tag: "роль/практика" });
    expect(() => validateTagResponse(JSON.stringify(f.response), f.input)).toThrow("policy");
    f.input.profile.categories[0].multiplicity = "multiple";
    expect(validateTagResponse(JSON.stringify(f.response), f.input).categories[0].existing).toHaveLength(2);
  });
  it("does not force categories or permit tags in an abstention", () => {
    const f = fixture(); f.response.categories[0].status = "none";
    expect(() => validateTagResponse(JSON.stringify(f.response), f.input)).toThrow("policy");
    f.response.categories[0].existing = []; expect(validateTagResponse(JSON.stringify(f.response), f.input).categories[0].status).toBe("none");
  });
  it("requires grounded domain and prerequisites for relative difficulty; global policy can omit domain", () => {
    const f = fixture("programming_difficulty"); f.response.categories[0].basis!.domain = null;
    expect(() => validateTagResponse(JSON.stringify(f.response), f.input)).toThrow();
    f.input.profile.categories[0].interpretation = "global";
    expect(validateTagResponse(JSON.stringify(f.response), f.input).categories[0].basis!.domain).toBeNull();
    f.response.categories[0].basis!.prerequisites!.quote = "word count";
    expect(() => validateTagResponse(JSON.stringify(f.response), f.input)).toThrow("evidence");
  });
  it("rejects unknown keys, categories, duplicates and confidence claims", () => {
    const f = fixture();
    expect(() => validateTagResponse(JSON.stringify({ ...f.response, confidence: 99 }), f.input)).toThrow();
    f.response.categories[0].categoryId = "new_category"; expect(() => validateTagResponse(JSON.stringify(f.response), f.input)).toThrow("policy");
    const g = fixture(); g.response.categories.push(g.response.categories[0]); expect(() => validateTagResponse(JSON.stringify(g.response), g.input)).toThrow("policy");
    const h = fixture(); h.response.categories[0].explanation = "99% correct"; expect(() => validateTagResponse(JSON.stringify(h.response), h.input)).toThrow();
  });
  it("rejects duplicate JSON keys, including escaped aliases, without misreading punctuation in prose", () => {
    const f = fixture(), raw = JSON.stringify(f.response);
    expect(() => validateTagResponse(raw.replace('"status":"recommend"', '"status":"none","status":"recommend"'), f.input)).toThrow("invalidResponse");
    expect(() => validateTagResponse(raw.replace('"status":"recommend"', '"st\\u0061tus":"none","status":"recommend"'), f.input)).toThrow("invalidResponse");
    f.response.categories[0].explanation = 'Quoted "key": {nested} is prose, not JSON structure.';
    expect(validateTagResponse(JSON.stringify(f.response), f.input)).toEqual(f.response);
  });
  it("bounds whole content and dictionary, never truncating them", () => {
    const f = fixture();
    expect(() => validateTagInput({ ...f.input, content: "x".repeat(TAG_LIMITS.characters + 1) })).toThrow("tooLarge");
    expect(() => validateTagInput({ ...f.input, tags: Array.from({ length: 501 }, (_, i) => `topic/t${i}`) })).toThrow("tooLarge");
    expect(() => validateTagInput({ ...f.input, profile: { version: 1, categories: [] } })).toThrow("profile");
    expect(validNewTag("тема/English_2")).toBe(true);
  });
});
