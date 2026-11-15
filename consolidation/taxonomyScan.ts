import { includesScope } from "../health/workspace/vaultScope";
import type { WorkspaceScope } from "../health/workspace/vaultScope";
import { OrganizationCollector } from "./organizationAudit";
import type { OrganizationSnapshot } from "./organizationAudit";
import { getAllTags } from "obsidian";
import type { App, TFile } from "obsidian";
import { isCanonicalMarkdownPath } from "../chunking/reconstructChunks";
import { isDeepAuditFile } from "../deep/deepScope";
import { taxonomyToken, TaxonomyError } from "./taxonomyProfile";

export interface TaxonomyInventory {
  state: "complete" | "cancelled" | "stale" | "limited" | "failed";
  organization?: OrganizationSnapshot;
  total: number;
  eligible: number; excluded: number; processed: number; unavailable: number; empty: number;
  tags: { tag: string; notes: number }[];
}
export const TAXONOMY_TAG_LIMIT = 20000;
export function taxonomyExclusions(text: string): string[] {
  const paths = text.split("\n").map(path => path.trim().replace(/\/$/, "")).filter(Boolean);
  if (paths.some(path => !isCanonicalMarkdownPath(`${path}/_.md`))) throw new TaxonomyError("invalid");
  return paths;
}
export function taxonomyFileEligible(app: App, file: TFile, excluded: string[]): boolean {
  return isCanonicalMarkdownPath(file.path) && isDeepAuditFile(app, file) &&
    !file.path.split("/").some(part => part.startsWith(".") || ["templates", "шаблоны", "backup", "backups", "резервные копии", "node_modules"].includes(part.toLowerCase())) &&
    !excluded.some(path => file.path === path || file.path.startsWith(`${path}/`));
}
/** Explicit metadata-only snapshot. Listeners detect races only for this scan's lifetime. */
export async function scanTaxonomy(app: App, excluded: string[], signal: AbortSignal,
  progress: (processed: number, total: number) => void, yieldUi = () => new Promise<void>(resolve => window.setTimeout(resolve, 0)),
  organizationScope?: WorkspaceScope): Promise<TaxonomyInventory> {
  const organization = organizationScope ? new OrganizationCollector(organizationScope, excluded) : undefined;
  const cleanup: (() => void)[] = [];
  let stale = false, limited = false;
  const changed = () => { stale = true; };
  const counts = new Map<string, number>();
  const result: TaxonomyInventory = { state: "complete", total: 0, eligible: 0, excluded: 0, processed: 0, unavailable: 0, empty: 0, tags: [] };
  if (signal.aborted) { result.state = "cancelled"; if (organization) result.organization = organization.finish(result); return result; }
  let sliceStarted = performance.now();
  try {
    for (const ref of [app.vault.on("create", changed), app.vault.on("modify", changed), app.vault.on("delete", changed), app.vault.on("rename", changed)]) cleanup.push(() => app.vault.offref(ref));
    if (app.metadataCache) {
      const changedRef = app.metadataCache.on("changed", changed), resolvedRef = app.metadataCache.on("resolved", changed);
      cleanup.push(() => app.metadataCache.offref(changedRef), () => app.metadataCache.offref(resolvedRef));
    }
    // Obsidian owns enumeration; all subsequent processing yields between bounded batches.
    const files = app.vault.getMarkdownFiles().filter(file => !organizationScope || includesScope(organizationScope, file.path));
    if (organization) files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    if (organizationScope?.kind === "folder" && (organizationScope.missing || !isCanonicalMarkdownPath(organizationScope.path + "/_.md") ||
      !app.vault.getAllFolders().some(folder => folder.path === organizationScope.path))) {
      result.state = "failed"; organization!.reason("scope-missing"); result.organization = organization!.finish(result); return result;
    }
    result.total = files.length;
    for (let i = 0; i < files.length; i++) {
      if (signal.aborted) break;
      if (organization && i >= 20000) { limited = true; break; }
      const file = files[i];
      if (!taxonomyFileEligible(app, file, excluded)) result.excluded++;
      else {
        result.eligible++;
        try {
          const cache = app.metadataCache?.getFileCache(file);
          if (organization && ["organization-registry", "instructions", "prompt"].includes(cache?.frontmatter?.["veynrel-service"] as string)) {
            result.eligible--; result.excluded++;
            if (i % 50 === 49) { progress(i + 1, files.length); await yieldUi(); }
            continue;
          }
          if (!cache) { result.unavailable++; organization?.observe(file, null, new Set()); }
          else {
            const tags = getAllTags(cache) ?? [];
            if (tags.length > 10000) { limited = true; break; }
            const unique = new Set(tags.map(tag => tag.startsWith("#") ? tag.slice(1) : tag));
            let added = 0, checked = 0;
            for (const tag of unique) {
              if (!counts.has(tag)) added++;
              if (!taxonomyToken(tag) || tag.split("/").length > 32 || counts.size + added > TAXONOMY_TAG_LIMIT) { limited = true; break; }
              if (++checked % 250 === 0) { progress(i, files.length); await yieldUi(); sliceStarted = performance.now(); if (signal.aborted) break; }
            }
            if (signal.aborted || limited) break;
            if (!unique.size) result.empty++;
            for (const tag of unique) counts.set(tag, (counts.get(tag) ?? 0) + 1);
            organization?.observe(file, cache, unique);
          }
        } catch { result.unavailable++; organization?.observe(file, null, new Set()); }
        result.processed++;
      }
      if (limited) break;
      if (i % 50 === 49 || performance.now() - sliceStarted >= 8) { progress(i + 1, files.length); await yieldUi(); sliceStarted = performance.now(); }
    }
    progress(result.processed + result.excluded, files.length);
    await yieldUi();
    result.state = signal.aborted ? "cancelled" : stale ? "stale" : limited ? "limited" : "complete";
    result.tags = [...counts].map(([tag, notes]) => ({ tag, notes })).sort((a, b) => a.tag.localeCompare(b.tag));
    if (organization) result.organization = organization.finish(result);
    return result;
  } finally { for (const remove of cleanup) remove(); }
}
