import { categoryForTag, requireTaxonomyProfile, taxonomyToken } from "./taxonomyProfile";
import type { TagTaxonomyProfile } from "./taxonomyProfile";

export const TAG_LIMITS = { characters: 20000, tags: 500, categories: 16, requestBytes: 131072, responseCharacters: 64000 } as const;
export const TAG_OPTIONS = { maxTokens: 6000, temperature: 0 } as const;
export type TagFailure = "profile" | "inventory" | "source" | "tooLarge" | "configuration" | "invalidResponse" | "evidence" | "policy" | "transport";
export class TagRecommendationError extends Error { constructor(readonly reason: TagFailure) { super(reason); } }
/** No files, settings owner or transport: also usable with a future in-memory source. */
export interface TagAnalysisInput { content: string; profile: TagTaxonomyProfile; tags: string[] }
export interface TagEvidence { text: string; quote: string }
export interface TagSuggestion { tag: string; evidence: TagEvidence }
export interface NewTagSuggestion extends TagSuggestion { nearest: { tag: string; difference: string }[]; limitations: string[] }
export interface TagCategoryResult {
  categoryId: string;
  status: "recommend" | "none" | "insufficient_context";
  explanation: string;
  quote: string | null;
  existing: TagSuggestion[];
  proposed: NewTagSuggestion[];
  basis: { domain: TagEvidence | null; prerequisites: TagEvidence | null } | null;
}
export interface TagRecommendations { categories: TagCategoryResult[]; limitations: string[] }
function requireValue(condition: unknown, reason: TagFailure = "invalidResponse"): asserts condition {
  if (!condition) throw new TagRecommendationError(reason);
}
function object(value: unknown, fields: string[]): asserts value is Record<string, unknown> {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === fields.length && fields.every(key => Object.prototype.hasOwnProperty.call(value, key)));
}
function prose(value: unknown): asserts value is string {
  requireValue(typeof value === "string" && value.trim().length > 0 && value.length <= 1800 && !/\d\s*[%％]/u.test(value));
}
function array(value: unknown, max: number): asserts value is unknown[] { requireValue(Array.isArray(value) && value.length <= max); }
function limitations(value: unknown): void { array(value, 12); requireValue(value.length > 0); value.forEach(prose); }
function quote(value: unknown, source: string): void {
  requireValue(typeof value === "string" && value.trim().length > 0 && value.length <= 1200, "evidence");
  const start = source.indexOf(value);
  requireValue(start >= 0 && source.indexOf(value, start + 1) < 0, "evidence");
}
function evidence(value: unknown, source: string): void {
  object(value, ["text", "quote"]); prose(value.text); quote(value.quote, source);
}
// shortcut: new tags use a conservative Unicode letter/number subset; expand only with native syntax tests.
export function validNewTag(tag: string): boolean {
  return taxonomyToken(tag) && tag.length <= 128 && tag.split("/").length <= 8 &&
    /^[\p{L}\p{M}\p{N}_/-]+$/u.test(tag) && /[\p{L}_-]/u.test(tag);
}
export function validateTagInput(input: TagAnalysisInput): TagAnalysisInput {
  let profile: TagTaxonomyProfile;
  try { profile = requireTaxonomyProfile(input.profile); } catch { throw new TagRecommendationError("profile"); }
  requireValue(profile.categories.length > 0, "profile");
  requireValue(typeof input.content === "string" && Array.isArray(input.tags) && input.tags.every(taxonomyToken) && new Set(input.tags).size === input.tags.length, "inventory");
  requireValue(input.content.length <= TAG_LIMITS.characters && input.tags.length <= TAG_LIMITS.tags && profile.categories.length <= TAG_LIMITS.categories, "tooLarge");
  return { content: input.content, profile, tags: [...input.tags] };
}
export function validateTagResponse(raw: string, input: TagAnalysisInput): TagRecommendations {
  requireValue(raw.length <= TAG_LIMITS.responseCharacters);
  let root: unknown;
  try { root = JSON.parse(raw); } catch { throw new TagRecommendationError("invalidResponse"); }
  // JSON.parse accepts duplicate keys. Reject ambiguous objects before trusting the parsed response.
  const tokens = raw.match(/"(?:\\.|[^"\\])*"|[{}:]/g) ?? [], objects: Set<string>[] = [];
  tokens.forEach((token, i) => {
    if (token === "{") objects.push(new Set());
    else if (token === "}") objects.pop();
    else if (token.startsWith('"') && tokens[i + 1] === ":") {
      const key = JSON.parse(token) as string, fields = objects[objects.length - 1];
      requireValue(fields && !fields.has(key)); fields.add(key);
    }
  });
  object(root, ["categories", "limitations"]); array(root.categories, TAG_LIMITS.categories); limitations(root.limitations);
  requireValue(root.categories.length === input.profile.categories.length, "policy");
  const ids = new Set<string>(), recommended = new Set<string>(), observed = new Set(input.tags);
  const observedFolded = new Set(input.tags.map(tag => tag.toLowerCase()));
  for (const item of root.categories) {
    object(item, ["categoryId", "status", "explanation", "quote", "existing", "proposed", "basis"]);
    const category = input.profile.categories.find(category => category.id === item.categoryId);
    requireValue(category && !ids.has(category.id), "policy"); ids.add(category.id);
    requireValue(["recommend", "none", "insufficient_context"].includes(item.status as string)); prose(item.explanation);
    if (item.quote !== null || item.status !== "insufficient_context") quote(item.quote, input.content);
    array(item.existing, 5); array(item.proposed, 5);
    const count = item.existing.length + item.proposed.length;
    requireValue((item.status === "recommend") === (count > 0) && count <= (category.multiplicity === "one_primary" ? 1 : 5), "policy");
    if (count && (category.interpretation === "domain" || category.purpose === "difficulty")) {
      object(item.basis, ["domain", "prerequisites"]);
      if (category.interpretation === "domain" || item.basis.domain !== null) evidence(item.basis.domain, input.content);
      if (category.purpose === "difficulty" || item.basis.prerequisites !== null) evidence(item.basis.prerequisites, input.content);
    } else requireValue(item.basis === null, "policy");
    for (const [kind, suggestions] of [["existing", item.existing], ["proposed", item.proposed]] as const) {
      for (const suggestion of suggestions) {
        object(suggestion, kind === "existing" ? ["tag", "evidence"] : ["tag", "evidence", "nearest", "limitations"]);
        requireValue(typeof suggestion.tag === "string", "policy");
        const tag = suggestion.tag, owner = categoryForTag(tag, input.profile.categories);
        requireValue(!recommended.has(tag.toLowerCase()), "policy"); recommended.add(tag.toLowerCase());
        evidence(suggestion.evidence, input.content);
        if (kind === "existing") requireValue(observed.has(tag) && owner?.id === category.id, "policy");
        else {
          requireValue(validNewTag(tag) && !observedFolded.has(tag.toLowerCase()) && (!owner || owner.id === category.id), "policy");
          // Nested proposals must retain an explicitly confirmed prefix; unbound flat tags are proposals only.
          requireValue(!tag.includes("/") || owner?.id === category.id, "policy");
          array(suggestion.nearest, 3); limitations(suggestion.limitations);
          requireValue(input.tags.length === 0 || suggestion.nearest.length > 0, "policy");
          const nearest = new Set<string>();
          for (const entry of suggestion.nearest) {
            object(entry, ["tag", "difference"]);
            requireValue(typeof entry.tag === "string" && observed.has(entry.tag) && !nearest.has(entry.tag), "policy");
            nearest.add(entry.tag); prose(entry.difference);
          }
          const categoryTags = input.tags.filter(tag => categoryForTag(tag, input.profile.categories)?.id === category.id);
          requireValue(!categoryTags.length || categoryTags.some(tag => nearest.has(tag)), "policy");
        }
      }
    }
  }
  return root as unknown as TagRecommendations;
}
