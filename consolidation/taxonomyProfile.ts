import { taxonomyToken } from "../utils/taxonomyToken";
export { taxonomyToken } from "../utils/taxonomyToken";
export const TAXONOMY_PURPOSES = ["role", "difficulty", "domain", "topic", "other"] as const;
export type TaxonomyPurpose = typeof TAXONOMY_PURPOSES[number];
export interface TaxonomyCategory {
  id: string;
  name: string;
  purpose: TaxonomyPurpose;
  multiplicity: "one_primary" | "multiple";
  interpretation: "global" | "domain";
  /** Literal first-level prefixes, without #. Values are never treated as synonyms. */
  prefixes: string[];
  /** Explicitly assigned flat tags, without #. */
  tags: string[];
}
export interface TagTaxonomyProfile { version: 1; categories: TaxonomyCategory[] }
export interface TaxonomyProfilePort {
  get(): TagTaxonomyProfile | null;
  subscribe(listener: () => void): () => void;
  save(next: TagTaxonomyProfile, expected: TagTaxonomyProfile | null, signal: AbortSignal): Promise<void>;
}
export class TaxonomyError extends Error {
  constructor(readonly reason: "invalid" | "conflict" | "cancelled" | "save" | "scan") { super(reason); }
}

function keys(value: unknown, fields: string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === fields.length && fields.every(key => Object.prototype.hasOwnProperty.call(value, key));
}
export function requireTaxonomyProfile(value: unknown): TagTaxonomyProfile {
  const valid = (condition: unknown) => { if (!condition) throw new TaxonomyError("invalid"); };
  valid(keys(value, ["version", "categories"]));
  const root = value as Record<string, unknown>;
  valid(root.version === 1 && Array.isArray(root.categories) && root.categories.length <= 64);
  const ids = new Set<string>(), names = new Set<string>(), prefixes = new Set<string>(), tags = new Set<string>();
  for (const item of root.categories as unknown[]) {
    valid(keys(item, ["id", "name", "purpose", "multiplicity", "interpretation", "prefixes", "tags"]));
    const category = item as Record<string, unknown>;
    valid(typeof category.id === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(category.id));
    valid(typeof category.name === "string" && category.name === category.name.trim() && category.name.length > 0 && category.name.length <= 100);
    valid(TAXONOMY_PURPOSES.includes(category.purpose as TaxonomyPurpose));
    valid(category.multiplicity === "one_primary" || category.multiplicity === "multiple");
    valid(category.interpretation === "global" || category.interpretation === "domain");
    if (ids.has(category.id as string) || names.has(category.name as string)) throw new TaxonomyError("conflict");
    ids.add(category.id as string); names.add(category.name as string);
    for (const [field, used] of [["prefixes", prefixes], ["tags", tags]] as const) {
      const values = category[field];
      valid(Array.isArray(values) && values.length <= 100);
      for (const token of values as unknown[]) {
        valid(taxonomyToken(token) && !token.includes("/"));
        if (used.has(token as string)) throw new TaxonomyError("conflict");
        used.add(token as string);
      }
    }
  }
  valid(JSON.stringify(value).length <= 131072);
  return structuredClone(value as TagTaxonomyProfile);
}
/** Absent, future or corrupt profiles do not prevent old installations loading. */
export function parseTaxonomyProfile(value: unknown): TagTaxonomyProfile | null {
  if (value == null) return null;
  try { return requireTaxonomyProfile(value); } catch { return null; }
}
export function categoryDefaults(purpose: TaxonomyPurpose): Pick<TaxonomyCategory, "purpose" | "multiplicity" | "interpretation"> {
  return { purpose, multiplicity: purpose === "role" || purpose === "difficulty" ? "one_primary" : "multiple",
    interpretation: purpose === "difficulty" ? "domain" : "global" };
}
export function nextCategoryId(categories: TaxonomyCategory[]): string {
  let n = 1; while (categories.some(category => category.id === `category-${n}`)) n++;
  return `category-${n}`;
}
export function suggestTaxonomy(tags: readonly string[], current: TaxonomyCategory[]): TaxonomyCategory[] {
  const used = new Set(current.flatMap(category => category.prefixes));
  const result: TaxonomyCategory[] = [];
  const meanings: Record<string, TaxonomyPurpose> = { role: "role", "роль": "role", difficulty: "difficulty", "сложность": "difficulty",
    domain: "domain", "область": "domain", topic: "topic", "тема": "topic", "тематика": "topic" };
  for (const prefix of new Set(tags.filter(tag => tag.includes("/")).map(tag => tag.split("/")[0]))) {
    if (current.length + result.length >= 64) break;
    if (used.has(prefix)) continue;
    const name = prefix.slice(0, 100);
    const purpose = Object.prototype.hasOwnProperty.call(meanings, prefix.toLowerCase()) ? meanings[prefix.toLowerCase()] : "other";
    result.push({ id: nextCategoryId([...current, ...result]), name, ...categoryDefaults(purpose), prefixes: [prefix], tags: [] });
  }
  return result;
}
export function categoryForTag(tag: string, categories: TaxonomyCategory[]): TaxonomyCategory | undefined {
  return categories.find(category => tag.includes("/") ? category.prefixes.includes(tag.split("/")[0]) : category.tags.includes(tag));
}
