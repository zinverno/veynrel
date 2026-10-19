import { parseLinktext, TFile, TFolder } from "obsidian";
import type { App } from "obsidian";
import { stableHash } from "../utils/stableHash";
import { atomIdentity, atomKey, validateAtomizationPath } from "./atomizationPlan";
import type { AtomizationObservation } from "./atomizationPlan";

/** Only zero-byte notes with an empty native cache are eligible for the exact-read exception. */
async function verifyEmptyNote(app: App, file: TFile): Promise<{ guard(): boolean; diskMatches(): Promise<boolean> } | null> {
  const path = file.path, before = { ...file.stat };
  const cacheStamp = JSON.stringify(app.metadataCache.getFileCache(file));
  const emptyCache = () => {
    const cache = app.metadataCache.getFileCache(file);
    // Native caches can carry bookkeeping (e.g. after restart). Exact bytes, not that bookkeeping, prove emptiness.
    return cache !== null && cache !== undefined && JSON.stringify(cache) === cacheStamp &&
      [cache.sections, cache.links, cache.embeds, cache.frontmatterLinks, cache.frontmatter, cache.frontmatterPosition,
        cache.headings, cache.listItems, cache.tags, cache.blocks, cache.footnotes, cache.footnoteRefs, cache.referenceLinks].every(value => value === undefined) &&
      !!app.metadataCache.resolvedLinks && !!app.metadataCache.unresolvedLinks &&
      Object.keys(app.metadataCache.resolvedLinks[path] ?? {}).length === 0 &&
      Object.keys(app.metadataCache.unresolvedLinks[path] ?? {}).length === 0;
  };
  const guard = () => app.vault.getFileByPath(path) === file && file.path === path && before.size === 0 &&
    file.stat.ctime === before.ctime && file.stat.mtime === before.mtime && file.stat.size === before.size && emptyCache();
  const diskMatches = async () => {
    const stat = await app.vault.adapter.stat(path);
    return stat?.type === "file" && stat.ctime === before.ctime && stat.mtime === before.mtime && stat.size === 0;
  };
  try {
    if (!guard() || !await diskMatches() || !guard()) return null;
    const content = await app.vault.read(file);
    if (content !== "" || !guard() || !await diskMatches() || !guard()) return null;
    return { guard, diskMatches };
  } catch { return null; }
}

/** Metadata scan, with guarded exact reads only for otherwise unclassifiable empty notes. */
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
  const inventory: AtomizationObservation["inventory"] = [], emptyProofs: NonNullable<Awaited<ReturnType<typeof verifyEmptyNote>>>[] = [];
  for (const file of files) {
    if (!(file instanceof TFile)) { inventory.push({ path: file.path, identity: atomIdentity(file), folder: file instanceof TFolder }); continue; }
    const cache = file.extension.toLowerCase() === "md" ? app.metadataCache.getFileCache(file) : undefined;
    let emptyVerified: true | undefined;
    if (file.extension.toLowerCase() === "md" && !cache?.sections) {
      const proof = await verifyEmptyNote(app, file);
      if (proof) { emptyProofs.push(proof); emptyVerified = true; }
      else metadataComplete = false;
    }
    for (const link of [...(cache?.links ?? []), ...(cache?.embeds ?? []), ...(cache?.frontmatterLinks ?? [])]) {
      if (matches(link.link)) conflicts.add(file.path);
    }
    const aliases: unknown = cache?.frontmatter?.aliases ?? cache?.frontmatter?.alias;
    for (const alias of Array.isArray(aliases) ? aliases : typeof aliases === "string" ? [aliases] : []) {
      if (typeof alias === "string" && matches(alias)) conflicts.add(file.path);
    }
    inventory.push({ path: file.path, identity: atomIdentity(file), folder: false, ctime: file.stat.ctime, mtime: file.stat.mtime,
      size: file.stat.size, metadataHash: stableHash(JSON.stringify(cache ?? null)), ...(emptyVerified ? { emptyVerified } : {}) });
  }
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
  for (const proof of emptyProofs) {
    try { if (!await proof.diskMatches()) metadataComplete = false; } catch { metadataComplete = false; }
  }
  if (!emptyProofs.every(proof => proof.guard())) metadataComplete = false;
  return { path, absent, parentExists, configDir: app.vault.configDir, sourceLink: linkResolves ? sourceLink : "",
    inventory, linkConflicts: [...conflicts].sort(), metadataComplete, dependencies };
}
