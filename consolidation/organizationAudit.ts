import type { CachedMetadata, TFile } from "obsidian";
import type { WorkspaceScope } from "../health/workspace/vaultScope";
import { stableHash } from "../utils/stableHash";
import type { TagTaxonomyProfile } from "./taxonomyProfile";
import type { TaxonomyInventory } from "./taxonomyScan";
import type { OrganizationDefinitions } from "./organizationProfile";

export interface OrganizationFact { value: string; notes: number; examples: string[] }
export interface OrganizationSnapshot {
  scope: WorkspaceScope; exclusions: string[];
  startedAt: number; finishedAt: number; revision: string;
  state: "complete" | "partial" | "stale" | "cancelled" | "failed";
  metadataFreshness: "unverified";
  sources: { path: string; identity: string; mtime: number; size: number; metadata: "available" | "unknown" }[];
  folders: OrganizationFact[]; prefixes: OrganizationFact[]; properties: OrganizationFact[]; types: OrganizationFact[];
  tagExamples: Record<string, string[]>;
  noTags: string[]; noProperties: string[]; noType: string[];
  noPropertiesCount: number; noTypeCount: number;
  reasons: string[];
}
export class OrganizationCollector {
  readonly snapshot: OrganizationSnapshot;
  private readonly groups = { folders: new Map<string, OrganizationFact>(), prefixes: new Map<string, OrganizationFact>(), properties: new Map<string, OrganizationFact>(), types: new Map<string, OrganizationFact>() };
  constructor(scope: WorkspaceScope, exclusions: string[]) {
    this.snapshot = { scope: structuredClone(scope), exclusions: [...exclusions], startedAt: Date.now(), finishedAt: 0, revision: "", state: "partial",
      metadataFreshness: "unverified", sources: [], folders: [], prefixes: [], properties: [], types: [], tagExamples: Object.create(null) as Record<string, string[]>,
      noTags: [], noProperties: [], noType: [], noPropertiesCount: 0, noTypeCount: 0, reasons: ["cache-freshness-unverified"] };
  }
  private add(group: Map<string, OrganizationFact>, value: string, path: string): void {
    if (!group.has(value) && group.size >= 5000) { this.reason("observation-limit"); return; }
    const fact = group.get(value) ?? { value, notes: 0, examples: [] };
    fact.notes++; if (fact.examples.length < 5) fact.examples.push(path); group.set(value, fact);
  }
  reason(reason: string): void { if (!this.snapshot.reasons.includes(reason)) this.snapshot.reasons.push(reason); }
  observe(file: TFile, cache: CachedMetadata | null, tags: ReadonlySet<string>): void {
    const s = this.snapshot, path = file.path;
    s.sources.push({ path, identity: path + ":" + file.stat?.ctime, mtime: file.stat?.mtime, size: file.stat?.size, metadata: cache ? "available" : "unknown" });
    this.add(this.groups.folders, path.slice(0, Math.max(0, path.lastIndexOf("/"))) || "/", path);
    if (!cache) { this.reason("metadata-unavailable"); return; }
    for (const prefix of new Set([...tags].filter(tag => tag.includes("/")).map(tag => tag.split("/")[0]))) this.add(this.groups.prefixes, prefix, path);
    for (const tag of tags) {
      const examples = s.tagExamples[tag] ??= []; if (examples.length < 5) examples.push(path);
    }
    if (!tags.size && s.noTags.length < 5) s.noTags.push(path);
    const frontmatter = cache.frontmatter;
    if (frontmatter !== undefined && (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter))) { this.reason("malformed-properties"); return; }
    const properties = Object.keys(frontmatter ?? {}).filter(key => key !== "position");
    if (properties.length > 256 || properties.some(key => key.length > 256)) { this.reason("property-limit"); return; }
    if (!properties.length) { s.noPropertiesCount++; if (s.noProperties.length < 5) s.noProperties.push(path); }
    for (const key of properties) this.add(this.groups.properties, key, path);
    if (!properties.includes("type")) { s.noTypeCount++; if (s.noType.length < 5) s.noType.push(path); }
    else if (typeof frontmatter?.type === "string" && frontmatter.type.trim() && frontmatter.type.length <= 256) this.add(this.groups.types, frontmatter.type, path);
    else this.reason("type-value-not-a-short-string");
  }
  finish(inventory: TaxonomyInventory): OrganizationSnapshot {
    const s = this.snapshot;
    for (const key of ["folders", "prefixes", "properties", "types"] as const) s[key] = [...this.groups[key].values()].sort((a, b) => b.notes - a.notes || a.value.localeCompare(b.value));
    s.finishedAt = Date.now();
    s.revision = stableHash(JSON.stringify([s.scope, s.exclusions, s.sources, inventory.tags, s.properties, s.types]));
    s.state = inventory.state === "cancelled" || inventory.state === "stale" || inventory.state === "failed" ? inventory.state
      : inventory.state === "limited" || inventory.unavailable > 0 || s.reasons.length > 1 || inventory.processed + inventory.excluded !== inventory.total ? "partial" : "complete";
    if (inventory.state === "limited") this.reason("scan-limit");
    return s;
  }
}
export interface OrganizationSuggestion {
  id: string; kind: "prefix" | "type"; value: string; notes: number; denominator: number; examples: string[];
  origin: "hypothesis" | "rule";
}
/** Bounded reuse suggestions, never new names, semantic equivalence or an organization score. */
export function organizationSuggestions(inventory: TaxonomyInventory, profile: TagTaxonomyProfile | null, definitions: OrganizationDefinitions | null, dismissed: readonly string[]): OrganizationSuggestion[] {
  const snapshot = inventory.organization;
  if (!snapshot || snapshot.state !== "complete" || inventory.processed < 3) return [];
  const suggestions: OrganizationSuggestion[] = [];
  for (const [kind, facts] of [["prefix", snapshot.prefixes], ["type", snapshot.types]] as const) {
    for (const fact of facts) {
      if (fact.notes < 3 || kind === "prefix" && fact.value === "flashcards") continue;
      if (kind === "prefix" && definitions?.tags.some(tag => tag.tag.startsWith(fact.value + "/") && tag.state !== "allowed")) continue;
      const rule = kind === "prefix" ? profile?.categories.some(category => category.prefixes.includes(fact.value))
        : definitions?.conventions.some(convention => convention.subject === "type" && convention.value === fact.value);
      const id = "org:" + stableHash(JSON.stringify([snapshot.scope, snapshot.exclusions, kind, fact, inventory.processed, rule]));
      if (!dismissed.includes(id)) suggestions.push({ id, kind, value: fact.value, notes: fact.notes, denominator: inventory.processed - inventory.unavailable, examples: fact.examples, origin: rule ? "rule" : "hypothesis" });
      if (suggestions.length === 3) return suggestions;
    }
  }
  return suggestions;
}
