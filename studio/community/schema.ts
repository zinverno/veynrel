import { ensure, freeze, hash, object, parseRecipe, text } from "../recipe";
import type { Recipe } from "../recipe";

export const COMMUNITY_SITE = "https://zinverno.github.io/veynrel-recipes/";
export const COMMUNITY_SOURCE = "https://zinverno.github.io/veynrel-recipes/catalog/v1/";
export const COMMUNITY_INDEX = `${COMMUNITY_SOURCE}index.json`;
export const COMMUNITY_CONTRIBUTE = "https://github.com/zinverno/veynrel-recipes/blob/main/CONTRIBUTING.md";
export const COMMUNITY_LIMITS = Object.freeze({ index: 512_000, entry: 64_000, publication: 256_000, recipe: 96_000, entries: 100, cachedRecipes: 16, cache: 2_500_000 });
export const CATEGORIES = ["learning", "work", "writing", "knowledge", "daily"] as const;
type Localized = { en: string; ru: string };
export interface CatalogEntry {
  id: string; version: string; name: Localized; description: Localized;
  author: { name: string; url: string }; category: typeof CATEGORIES[number]; tags: string[];
  compatibility: { recipeSchema: 1; studioApi: 1 };
  purpose: Localized; operations: ("replace" | "append")[]; limitations: Localized;
  examples: { input: Localized; output: Localized };
  recipeUrl: string; sha256: string;
}
export interface Catalog { schemaVersion: 1; entries: CatalogEntry[] }
export interface CommunityPreview { entry: CatalogEntry; recipe: Recipe; raw: string }
export const bytes = (raw: string): number => new TextEncoder().encode(raw).length;
export const publicId = (v: unknown): v is string => typeof v === "string" && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(v) && v.length <= 48;
export const semver = (v: unknown): v is string => typeof v === "string" && /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/u.test(v);
// Recipe v1 accepts stable SemVer only; prereleases/ranges are deliberately rejected.
export function compareVersions(a: string, b: string): number {
  ensure(semver(a) && semver(b), "recipe");
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}
function localized(v: unknown, max: number): boolean { return object(v, ["en", "ru"]) && text(v.en, max) && text(v.ru, max); }
export function recipeUrl(id: string, version: string): string {
  ensure(publicId(id) && semver(version), "recipe"); return `${COMMUNITY_SOURCE}recipes/${id}/${version}.json`;
}
export function recipePage(entry: CatalogEntry): string { return `${COMMUNITY_SITE}recipes/${entry.id}/${entry.version}/`; }
export function allowedResource(url: string): boolean {
  if (url === COMMUNITY_INDEX) return true;
  if (!url.startsWith(`${COMMUNITY_SOURCE}recipes/`)) return false;
  const parts = url.slice(`${COMMUNITY_SOURCE}recipes/`.length).split("/");
  return parts.length === 2 && publicId(parts[0]) && parts[1].endsWith(".json") && semver(parts[1].slice(0, -5)) && url === recipeUrl(parts[0], parts[1].slice(0, -5));
}
export function validateEntry(v: unknown): CatalogEntry {
  ensure(object(v, ["id", "version", "name", "description", "author", "category", "tags", "compatibility", "purpose", "operations", "limitations", "examples", "recipeUrl", "sha256"]), "recipe");
  ensure(publicId(v.id) && semver(v.version) && localized(v.name, 120) && localized(v.description, 1200), "recipe");
  ensure(object(v.author, ["name", "url"]) && text(v.author.name, 100) && typeof v.author.url === "string" && /^https:\/\/github\.com\/[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/u.test(v.author.url), "recipe");
  ensure(typeof v.category === "string" && (CATEGORIES as readonly string[]).includes(v.category) && Array.isArray(v.tags) && v.tags.length > 0 && v.tags.length <= 8 && v.tags.every(t => text(t, 40)) && new Set(v.tags).size === v.tags.length, "recipe");
  ensure(object(v.compatibility, ["recipeSchema", "studioApi"]) && v.compatibility.recipeSchema === 1 && v.compatibility.studioApi === 1, "recipe");
  ensure(localized(v.purpose, 1200) && localized(v.limitations, 2000) && Array.isArray(v.operations) && v.operations.length === 1 && typeof v.operations[0] === "string" && ["replace", "append"].includes(v.operations[0]), "recipe");
  ensure(object(v.examples, ["input", "output"]) && localized(v.examples.input, 6000) && localized(v.examples.output, 6000), "recipe");
  ensure(v.recipeUrl === recipeUrl(v.id, v.version) && hash(v.sha256), "recipe");
  ensure(bytes(JSON.stringify(v)) <= COMMUNITY_LIMITS.entry, "size");
  return freeze(JSON.parse(JSON.stringify(v)) as CatalogEntry);
}
export function parseCatalog(raw: string): Catalog {
  ensure(bytes(raw) <= COMMUNITY_LIMITS.index, "size"); const v: unknown = JSON.parse(raw);
  ensure(object(v, ["schemaVersion", "entries"]) && v.schemaVersion === 1 && Array.isArray(v.entries) && v.entries.length <= COMMUNITY_LIMITS.entries, "recipe");
  const entries = v.entries.map(validateEntry);
  ensure(new Set(entries.map(e => `${e.id}@${e.version}`)).size === entries.length, "conflict");
  return freeze({ schemaVersion: 1, entries });
}
export async function sha256(raw: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))), b => b.toString(16).padStart(2, "0")).join("");
}
export async function verifyRecipe(entry: CatalogEntry, raw: string): Promise<CommunityPreview> {
  const e = validateEntry(entry); ensure(bytes(raw) <= COMMUNITY_LIMITS.recipe, "size");
  ensure(await sha256(raw) === e.sha256, "conflict"); const r = parseRecipe(raw);
  ensure(r.source === "user" && r.id === `user.${e.id}` && r.version === e.version &&
    JSON.stringify(r.name) === JSON.stringify(e.name) && JSON.stringify(r.description) === JSON.stringify(e.description) &&
    e.operations[0] === r.output.action, "recipe");
  return freeze({ entry: e, recipe: r, raw });
}
