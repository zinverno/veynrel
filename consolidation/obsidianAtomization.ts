import { parseLinktext, TFile, TFolder } from "obsidian";
import type { App } from "obsidian";
import { stableHash } from "../utils/stableHash";
import { atomIdentity, atomKey, validateAtomizationPath } from "./atomizationPlan";
import type { AtomizationObservation } from "./atomizationPlan";

/** Metadata-only inventory. No other Markdown reads, provider, journal or file-creation capability. */
export async function readAtomizationObservation(app: App, path: string, source: string): Promise<AtomizationObservation> {
  validateAtomizationPath(path, app.vault.configDir);
  const files = app.vault.getAllLoadedFiles().slice().sort((a, b) => a.path.localeCompare(b.path));
  const stem = atomKey(path.slice(0, -3)), basename = stem.split("/").pop()!;
  const conflicts = new Set<string>(); let metadataComplete = !!app.metadataCache?.resolvedLinks && !!app.metadataCache?.unresolvedLinks;
  const matches = (token: string) => {
    let decoded = token;
    try { decoded = decodeURIComponent(token); } catch { metadataComplete = false; }
    return [token, decoded].some(value => {
      const parsed = atomKey(parseLinktext(value).path).replace(/\.md$/u, "");
      return parsed === stem || parsed.split("/").pop() === basename;
    });
  };
  const inventory = files.map(file => {
    if (!(file instanceof TFile)) return { path: file.path, identity: atomIdentity(file), folder: file instanceof TFolder };
    const cache = file.extension.toLowerCase() === "md" ? app.metadataCache.getFileCache(file) : undefined;
    if (file.extension.toLowerCase() === "md" && !cache?.sections) metadataComplete = false;
    for (const link of [...(cache?.links ?? []), ...(cache?.embeds ?? []), ...(cache?.frontmatterLinks ?? [])]) {
      if (matches(link.link)) conflicts.add(file.path);
    }
    const aliases: unknown = cache?.frontmatter?.aliases ?? cache?.frontmatter?.alias;
    for (const alias of Array.isArray(aliases) ? aliases : typeof aliases === "string" ? [aliases] : []) {
      if (typeof alias === "string" && matches(alias)) conflicts.add(file.path);
    }
    return { path: file.path, identity: atomIdentity(file), folder: false, ctime: file.stat.ctime, mtime: file.stat.mtime,
      size: file.stat.size, metadataHash: stableHash(JSON.stringify(cache ?? null)) };
  });
  for (const map of [app.metadataCache.resolvedLinks, app.metadataCache.unresolvedLinks]) {
    for (const [from, links] of Object.entries(map ?? {})) for (const target of Object.keys(links)) if (matches(target)) conflicts.add(from);
  }
  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const parentFile = parent ? app.vault.getAbstractFileByPath(parent) : app.vault.getRoot();
  const parentKey = atomKey(parent);
  const parentExists = parentFile instanceof TFolder && (parent === "" || parentFile.path === parent) &&
    !inventory.some(f => atomKey(f.path) === parentKey && f.path !== parent);
  const sourceFile = app.vault.getFileByPath(source), sourceLink = source.slice(0, -3);
  const linkResolves = sourceFile instanceof TFile && app.metadataCache.getFirstLinkpathDest(sourceLink, path) === sourceFile;
  const dependencies = JSON.parse(JSON.stringify({ resolved: app.metadataCache.resolvedLinks ?? null,
    unresolved: app.metadataCache.unresolvedLinks ?? null })) as AtomizationObservation["dependencies"];
  const absent = !app.vault.getAbstractFileByPath(path) && !await app.vault.adapter.exists(path);
  return { path, absent, parentExists, configDir: app.vault.configDir, sourceLink: linkResolves ? sourceLink : "",
    inventory, linkConflicts: [...conflicts].sort(), metadataComplete, dependencies };
}
