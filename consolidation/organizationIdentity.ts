import { hasOnlyKeys, isRecord, isVaultPath } from "../health/domain/validation";
import { stableHash } from "../utils/stableHash";
import { requireTaxonomyProfile, taxonomyToken } from "./taxonomyProfile";
import type { TagTaxonomyProfile } from "./taxonomyProfile";
import type { OrganizationDefinitions } from "./organizationProfile";
import type { WorkspaceScope } from "../health/workspace/vaultScope";

export interface OrganizationAuthority {
  version: 2; kind: "prefix" | "type"; value: string; scope: WorkspaceScope; exclusions: string[];
  categories: TagTaxonomyProfile["categories"]; conventions: OrganizationDefinitions["conventions"];
}
export interface OrganizationDecision { authority: OrganizationAuthority; state: "dismissed" | "deferred" }
export const authorityKey = (authority: OrganizationAuthority): string => JSON.stringify(authority);
export const organizationId = (authority: OrganizationAuthority): string => "org2:" + stableHash(authorityKey(authority));
/** Full canonical authority, not its UI hash, binds a persisted decision. */
export function organizationAuthority(kind: "prefix" | "type", value: string, scope: WorkspaceScope, exclusions: readonly string[], profile: TagTaxonomyProfile | null, definitions: OrganizationDefinitions | null): OrganizationAuthority {
  return { version: 2, kind, value, scope: scope.kind === "all" ? { kind: "all" } : { kind: "folder", path: scope.path }, exclusions: [...new Set(exclusions)].sort(),
    categories: kind === "prefix" ? (profile?.categories ?? []).filter(c => c.prefixes.includes(value)).map(c => ({ id: c.id, name: c.name, purpose: c.purpose, multiplicity: c.multiplicity, interpretation: c.interpretation, prefixes: [value], tags: [] })).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : [],
    conventions: kind === "type" ? (definitions?.conventions ?? []).filter(c => c.subject === "type" && c.value === value).map(c => ({ subject: c.subject, value: c.value, description: c.description })) : [],
  };
}
export function validOrganizationAuthority(value: unknown): value is OrganizationAuthority {
  try {
    if (!isRecord(value) || !hasOnlyKeys(value, ["version", "kind", "value", "scope", "exclusions", "categories", "conventions"]) || value.version !== 2 ||
      !["prefix", "type"].includes(value.kind as string) || typeof value.value !== "string" || !value.value.trim() || value.value.length > 512 ||
      !isRecord(value.scope) || !(value.scope.kind === "all" && hasOnlyKeys(value.scope, ["kind"]) || value.scope.kind === "folder" && hasOnlyKeys(value.scope, ["kind", "path"]) && isVaultPath(value.scope.path)) ||
      !Array.isArray(value.exclusions) || !value.exclusions.every(isVaultPath) ||
      !Array.isArray(value.conventions) || value.conventions.length > 1 || JSON.stringify(value).length > 32768) return false;
    const a = value as unknown as OrganizationAuthority;
    if (a.kind === "prefix" && (!taxonomyToken(a.value) || a.value.includes("/"))) return false;
    const profile = requireTaxonomyProfile({ version: 1, categories: a.categories });
    for (const c of a.conventions) if (!isRecord(c) || !hasOnlyKeys(c, ["subject", "value", "description"]) || c.subject !== "type" || c.value !== a.value || typeof c.description !== "string" || !c.description.trim() || c.description.length > 1000) return false;
    const rebuilt = organizationAuthority(a.kind, a.value, a.scope, a.exclusions, profile, { version: 1, profile, tags: [], conventions: a.conventions });
    return authorityKey(rebuilt) === authorityKey(a);
  } catch { return false; }
}
