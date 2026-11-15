import { isCanonicalMarkdownPath } from "../chunking/reconstructChunks";
import { requireTaxonomyProfile, taxonomyToken } from "./taxonomyProfile";
import type { TagTaxonomyProfile } from "./taxonomyProfile";

export interface OrganizationPreferences { version: 1; registryPath: string | null; dismissed: string[] }
export interface OrganizationDefinitions {
  version: 1;
  profile: TagTaxonomyProfile;
  tags: { tag: string; state: "allowed" | "excluded" | "deprecated"; description: string }[];
  conventions: { subject: "folder" | "property" | "type"; value: string; description: string }[];
}
export class OrganizationError extends Error {
  constructor(readonly reason: "invalid" | "unsupported" | "missing" | "changed" | "conflict" | "save" | "cancelled" | "limit") { super(reason); }
}
export const ORGANIZATION_DOCUMENT_LIMIT = 262144;
function object(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length ||
    !keys.every(key => Object.prototype.hasOwnProperty.call(value, key))) throw new OrganizationError("invalid");
}
function text(value: unknown, max: number, empty = false): asserts value is string {
  if (typeof value !== "string" || value.length > max || (!empty && !value.trim()) || Array.from(value).some(c => { const code = c.charCodeAt(0); return code === 127 || code < 32 && ![9, 10, 13].includes(code); })) throw new OrganizationError("invalid");
}
export function organizationPreferences(value?: unknown): OrganizationPreferences {
  if (value === undefined) return { version: 1, registryPath: null, dismissed: [] };
  object(value, ["version", "registryPath", "dismissed"]);
  if (value.version !== 1 || !(value.registryPath === null || typeof value.registryPath === "string" && isCanonicalMarkdownPath(value.registryPath)) ||
    !Array.isArray(value.dismissed) || value.dismissed.length > 200 || value.dismissed.some(id => typeof id !== "string" || !/^[a-z0-9:-]{1,100}$/i.test(id)) ||
    new Set(value.dismissed).size !== value.dismissed.length) throw new OrganizationError("invalid");
  return structuredClone(value as unknown as OrganizationPreferences);
}
export function requireOrganizationDefinitions(value: unknown): OrganizationDefinitions {
  if (value && typeof value === "object" && "version" in value && typeof value.version === "number" && value.version !== 1) throw new OrganizationError("unsupported");
  object(value, ["version", "profile", "tags", "conventions"]);
  if (value.version !== 1) throw new OrganizationError("unsupported");
  try { requireTaxonomyProfile(value.profile); } catch { throw new OrganizationError("invalid"); }
  if (!Array.isArray(value.tags) || value.tags.length > 1000 || !Array.isArray(value.conventions) || value.conventions.length > 100) throw new OrganizationError("limit");
  const tags = new Set<string>(), conventions = new Set<string>();
  for (const entry of value.tags) {
    object(entry, ["tag", "state", "description"]);
    if (!taxonomyToken(entry.tag) || tags.has(entry.tag) || !["allowed", "excluded", "deprecated"].includes(entry.state as string)) throw new OrganizationError("invalid");
    text(entry.description, 1000, true); tags.add(entry.tag);
  }
  for (const entry of value.conventions) {
    object(entry, ["subject", "value", "description"]);
    if (!["folder", "property", "type"].includes(entry.subject as string)) throw new OrganizationError("invalid");
    text(entry.value, 512); text(entry.description, 1000);
    const id = JSON.stringify([entry.subject, entry.value]);
    if (conventions.has(id)) throw new OrganizationError("invalid"); conventions.add(id);
  }
  if (JSON.stringify(value).length > ORGANIZATION_DOCUMENT_LIMIT) throw new OrganizationError("limit");
  return structuredClone(value as unknown as OrganizationDefinitions);
}
export function parseOrganizationDocument(content: string): OrganizationDefinitions {
  if (content.length > ORGANIZATION_DOCUMENT_LIMIT) throw new OrganizationError("limit");
  const blocks = [...content.matchAll(/^```veynrel-organization[ \t]*\r?\n([\s\S]*?)^```[ \t]*\r?$/gm)];
  if (blocks.length !== 1 || (content.match(/^```veynrel-organization\b/gm) ?? []).length !== 1) throw new OrganizationError("invalid");
  const raw = blocks[0][1];
  try {
    // Refuse duplicate JSON keys rather than silently keeping the last definition.
    const tokens = raw.match(/"(?:\\.|[^"\\])*"|[{}:]/g) ?? [], stack: Set<string>[] = [];
    tokens.forEach((token, i) => {
      if (token === "{") stack.push(new Set());
      else if (token === "}") stack.pop();
      else if (token.startsWith('"') && tokens[i + 1] === ":") {
        const key = JSON.parse(token) as string, fields = stack[stack.length - 1];
        if (!fields || fields.has(key)) throw new OrganizationError("invalid"); fields.add(key);
      }
    });
    return requireOrganizationDefinitions(JSON.parse(raw));
  } catch (error) { throw error instanceof OrganizationError ? error : new OrganizationError("invalid"); }
}
export function organizationDocument(profile: TagTaxonomyProfile | null, current?: OrganizationDefinitions): string {
  const definitions: OrganizationDefinitions = current ?? { version: 1, profile: profile ?? { version: 1, categories: [] }, tags: [], conventions: [] };
  return "---\nveynrel-service: organization-registry\n---\n\n# Organization rules\n\nUser-confirmed advisory definitions. No automatic note changes.\n\n```veynrel-organization\n" + JSON.stringify(definitions, null, 2) + "\n```\n";
}
export function organizationTagState(tag: string, observed: ReadonlySet<string>, definitions: OrganizationDefinitions, candidates: ReadonlySet<string> = new Set()): "observed" | "allowed-unused" | "candidate" | "unknown" | "excluded" | "deprecated" {
  const rule = definitions.tags.find(entry => entry.tag === tag);
  if (rule?.state === "excluded" || rule?.state === "deprecated") return rule.state;
  if (observed.has(tag)) return "observed";
  if (rule?.state === "allowed" || definitions.profile.categories.some(category => category.tags.includes(tag))) return "allowed-unused";
  return candidates.has(tag) ? "candidate" : "unknown";
}
