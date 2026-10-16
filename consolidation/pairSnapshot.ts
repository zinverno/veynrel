import { TFile, parseFrontMatterTags } from "obsidian";
import type { App, CachedMetadata } from "obsidian";
import { isCanonicalMarkdownPath } from "../chunking/reconstructChunks";

export const PAIR_PREVIEW_LIMIT = 12000;
export const PAIR_LIST_LIMIT = 100;

export interface InspectorList {
  items: string[];
  total: number;
}

export interface PairNoteSnapshot {
  path: string;
  state: "ready" | "missing" | "changed" | "error";
  name?: string;
  preview?: string;
  characters?: number;
  bytes?: number;
  modified?: number;
  metadata?: Record<"frontmatterTags" | "inlineTags" | "links" | "propertyLinks" | "embeds" | "headings" | "blocks" | "properties" | "sections", InspectorList>;
  incoming?: InspectorList;
}

function list(values: string[]): InspectorList {
  return { items: values.slice(0, PAIR_LIST_LIMIT), total: values.length };
}

function structure(cache: CachedMetadata): PairNoteSnapshot["metadata"] {
  return {
    frontmatterTags: list(parseFrontMatterTags(cache.frontmatter) ?? []),
    inlineTags: list((cache.tags ?? []).map(tag => tag.tag)),
    links: list((cache.links ?? []).map(link => link.original)),
    propertyLinks: list((cache.frontmatterLinks ?? []).map(link => `${link.key}: ${link.original}`)),
    embeds: list((cache.embeds ?? []).map(embed => embed.original)),
    headings: list((cache.headings ?? []).map(heading => `${"#".repeat(heading.level)} ${heading.heading}`)),
    blocks: list(Object.keys(cache.blocks ?? {})),
    properties: list(Object.keys(cache.frontmatter ?? {}).filter(key => key !== "position")),
    sections: list((cache.sections ?? []).map(section => `${section.type}: ${section.position.start.line + 1}–${section.position.end.line + 1}`)),
  };
}

/** Explicit reads of selected saved files only. Never expand embeds or use indexed previews. */
export async function readPairNote(app: App, path: string): Promise<PairNoteSnapshot> {
  if (!isCanonicalMarkdownPath(path)) return { path, state: "missing" };
  try {
    const file = app.vault.getFileByPath(path);
    if (!(file instanceof TFile) || file.path !== path) return { path, state: "missing" };
    const { mtime, size } = file.stat;
    const content = await app.vault.read(file);
    if (app.vault.getFileByPath(path) !== file || file.path !== path || file.stat.mtime !== mtime || file.stat.size !== size) {
      return { path, state: "changed" };
    }
    let end = Math.min(content.length, PAIR_PREVIEW_LIMIT);
    // Keep a surrogate pair intact at the preview boundary.
    if (end < content.length && /[\uD800-\uDBFF]/.test(content[end - 1])) end--;
    const snapshot: PairNoteSnapshot = {
      path, state: "ready", name: file.basename, preview: content.slice(0, end),
      characters: content.length, bytes: size, modified: mtime,
    };
    try {
      const cache = app.metadataCache?.getFileCache(file);
      if (cache) snapshot.metadata = structure(cache);
    } catch { /* Source remains readable when Obsidian metadata is unavailable. */ }
    try {
      const resolved = app.metadataCache?.resolvedLinks;
      if (resolved) snapshot.incoming = list(Object.keys(resolved).filter(source =>
        isCanonicalMarkdownPath(source) && Object.prototype.hasOwnProperty.call(resolved[source], path) &&
        resolved[source][path] > 0 && app.vault.getFileByPath(source)?.path === source));
    } catch { /* Missing backlink data is unknown, never a confirmed zero. */ }
    return snapshot;
  } catch {
    return { path, state: "error" };
  }
}
