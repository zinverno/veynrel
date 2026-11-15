import type { CachedMetadata } from "obsidian";
import { isCanonicalMarkdownPath } from "../chunking/reconstructChunks";
import { hasOnlyKeys, isRecord, isTimestamp } from "../health/domain/validation";
import { paragraphRanges, requirePlainParagraph } from "./changePlan";
import type { PlanNote, PlanRange } from "./changePlan";
import { requireSafe } from "./operationJournal";

export class LocalNoteError extends Error {
  constructor(readonly reason: "tag_exists" | "tag_rule") { super(reason); }
}
export interface LocalSource {
  path: string; created: number; modified: number; bytes: number; content: string;
}
export type LocalChoice = { kind: "add_inline_tag"; tag: string; range: PlanRange } |
  { kind: "repair_wikilink"; range: PlanRange; target: LocalSource };
export interface LocalNotePlan {
  version: 1; source: LocalSource; metadata: CachedMetadata; authority: string;
  choice: LocalChoice; after: string; edit: { start: number; end: number; removed: string; inserted: string };
}
export const localBytes = (s: string): number => new TextEncoder().encode(s).length;
export function localPath(path: unknown): path is string {
  return typeof path === "string" && isCanonicalMarkdownPath(path) &&
    !path.split("/").some(p => p.startsWith(".") || p === "node_modules");
}
export function localTag(tag: string): boolean {
  // shortcut: conservative Unicode letters/numbers subset; symbols need native parser acceptance tests.
  return tag.length <= 128 && /^[\p{L}\p{M}\p{N}_-]+(?:\/[\p{L}\p{M}\p{N}_-]+)*$/u.test(tag) &&
    /[^\p{N}/]/u.test(tag) && !/^flashcards(?:\/|$)/iu.test(tag);
}
export function simpleWiki(token: string): boolean {
  return /^\[\[[^[\]#|^\\\r\n]+\]\]$/u.test(token) &&
    Array.from(token).every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127) && token.slice(2, -2).trim() === token.slice(2, -2);
}
function sourceValid(n: LocalSource): void {
  requireSafe(isRecord(n) && hasOnlyKeys(n, ["path", "created", "modified", "bytes", "content"]) && localPath(n.path) &&
    isTimestamp(n.created) && isTimestamp(n.modified) && typeof n.content === "string" && n.content.length <= 200000 &&
    n.bytes === localBytes(n.content) && !n.content.startsWith("\uFEFF"), "stale");
}
function frontmatterEnd(content: string): number {
  if (!/^---\r?\n/u.test(content)) return 0;
  const close = /\r?\n---(?:\r?\n|$)/u.exec(content.slice(content.indexOf("\n") + 1));
  requireSafe(close, "stale");
  return content.indexOf("\n") + 1 + close.index + close[0].length;
}
function note(source: LocalSource, cache: CachedMetadata): PlanNote {
  return { ...source, file: {} as PlanNote["file"], cache, references: [], created: source.created };
}
/** Read-only, intentionally small YAML subset. Nothing is reserialized or edited. */
function yamlTags(source: string, cache: CachedMetadata): string[] {
  if (!/^---\r?\n/u.test(source)) { requireSafe(!cache.frontmatter && !cache.frontmatterPosition, "stale"); return []; }
  const lines = source.split(/\r?\n/u), end = lines.indexOf("---", 1);
  requireSafe(end > 0 && cache.frontmatter && cache.frontmatterPosition, "stale");
  const tags: string[] = [], keys = new Set<string>(); let inTags = false;
  for (const line of lines.slice(1, end)) {
    if (!line.trim()) continue;
    const item = /^ {2}- ([\p{L}\p{M}\p{N}_/-]+)$/u.exec(line);
    if (inTags && item) { tags.push(item[1]); continue; }
    const field = /^([\p{L}\p{N}_-]+):(?: ([\p{L}\p{M}\p{N}_/ .-]+))?$/u.exec(line);
    requireSafe(field && !keys.has(field[1].toLowerCase()), "stale");
    keys.add(field[1].toLowerCase()); inTags = field[1] === "tags";
    // Aliases, flow collections, anchors, folded scalars and quoted/ambiguous YAML are refused intact.
    requireSafe(field[1].toLowerCase() !== "tag" && (field[1].toLowerCase() !== "tags" || field[1] === "tags"), "stale");
    if (inTags && field[2]) { requireSafe(localTag(field[2]), "stale"); tags.push(field[2]); }
  }
  const cached: unknown = cache.frontmatter.tags;
  const values = cached === undefined ? [] : typeof cached === "string" ? [cached] : cached;
  requireSafe(Array.isArray(values) && values.every(v => typeof v === "string") && JSON.stringify(values) === JSON.stringify(tags), "stale");
  return tags;
}
export function tagRanges(source: LocalSource, cache: CachedMetadata): PlanRange[] {
  return paragraphRanges(note(source, cache)).filter(range => {
    try { requirePlainParagraph(note(source, cache), range); return true; } catch { return false; }
  });
}
export function repairRanges(source: LocalSource, cache: CachedMetadata): PlanRange[] {
  // shortcut: rich Markdown/code/comments are refused until independently supported native range contracts exist.
  if (/[`~<>\\%]/u.test(source.content)) return [];
  return (cache.links ?? []).flatMap(link => {
    const start = link.position.start.offset, end = link.position.end.offset;
    const text = source.content.slice(start, end), range = { start, end, text };
    const paragraph = cache.sections?.find(s => s.type === "paragraph" && s.position.start.offset <= start && s.position.end.offset >= end);
    return start >= frontmatterEnd(source.content) && paragraph && simpleWiki(text) && link.original === text && link.link === text.slice(2, -2) &&
      source.content[start - 1] !== "!" && !source.content.slice(paragraph.position.start.offset, paragraph.position.end.offset).split(/\r?\n/u).some(l => /^(?: {4}|\t)/u.test(l)) ? [range] : [];
  });
}
export function buildLocalNotePlan(source: LocalSource, metadata: CachedMetadata, authority: string, choice: LocalChoice): LocalNotePlan {
  sourceValid(source);
  requireSafe(isRecord(metadata) && Array.isArray(metadata.sections) && typeof authority === "string" && authority.length <= 600000 &&
    isRecord(choice) && isRecord(choice.range) && hasOnlyKeys(choice.range, ["start", "end", "text"]), "stale");
  const r = choice.range;
  requireSafe(r.start >= frontmatterEnd(source.content), "stale");
  requireSafe(Number.isSafeInteger(r.start) && Number.isSafeInteger(r.end) && r.start >= 0 && r.end > r.start &&
    r.end <= source.content.length && r.text === source.content.slice(r.start, r.end), "stale");
  let edit: LocalNotePlan["edit"];
  if (choice.kind === "add_inline_tag") {
    requireSafe(hasOnlyKeys(choice, ["kind", "tag", "range"]) && typeof choice.tag === "string" && localTag(choice.tag) &&
      !/^#{1,6}\s+flashcards\b/imu.test(source.content) && !/#flashcards(?:\/|\b)/iu.test(source.content), "stale");
    const tag = choice.tag.toLowerCase(), existing = yamlTags(source.content, metadata);
    requireSafe(!/[`~<>\\%]/u.test(source.content) && !existing.some(t => /^flashcards(?:\/|$)/iu.test(t)), "stale");
    if (existing.some(t => t.toLowerCase() === tag) ||
      ((metadata as CachedMetadata).tags ?? []).some(t => t.tag.toLowerCase() === `#${tag}`) || source.content.toLowerCase().includes(`#${tag}`)) throw new LocalNoteError("tag_exists");
    requirePlainParagraph(note(source, metadata), r);
    edit = { start: r.end, end: r.end, removed: "", inserted: ` #${choice.tag}` };
  } else {
    requireSafe(choice.kind === "repair_wikilink" && hasOnlyKeys(choice, ["kind", "range", "target"]), "stale");
    sourceValid(choice.target);
    requireSafe(choice.target.path !== source.path && repairRanges(source, metadata).some(p => JSON.stringify(p) === JSON.stringify(r)), "stale");
    const token = `[[${choice.target.path.slice(0, -3)}]]`;
    requireSafe(simpleWiki(token) && token !== r.text, "stale");
    edit = { start: r.start, end: r.end, removed: r.text, inserted: token };
  }
  return { version: 1, source, metadata, authority, choice, edit,
    after: source.content.slice(0, edit.start) + edit.inserted + source.content.slice(edit.end) };
}
export function validateLocalNotePlan(value: unknown): asserts value is LocalNotePlan {
  requireSafe(isRecord(value) && hasOnlyKeys(value, ["version", "source", "metadata", "authority", "choice", "edit", "after"]) && value.version === 1, "storage");
  const p = value as unknown as LocalNotePlan;
  const rebuilt = buildLocalNotePlan(p.source, p.metadata, p.authority, p.choice);
  requireSafe(JSON.stringify(rebuilt) === JSON.stringify(p), "storage");
}
