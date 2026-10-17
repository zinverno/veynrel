import { parseYaml } from "obsidian";
import { isRecord } from "../health/domain/validation";
import type { PlanNote, PlanRange, PlanReference } from "./changePlan";
import type { MergeRecord, MergeReceipt } from "./mergeJournal";

export type ArchiveDisposition = "represented" | "retained" | "consolidate";
export interface ArchiveFragment { range: PlanRange; context: PlanRange }
export interface ArchiveDependencies {
  path: string; outgoing: PlanReference[];
  incoming: { path: string; count: number; references: PlanReference[]; metadataAvailable: boolean }[] | null;
}
export const ARCHIVE_LIMITATIONS = ["copy_not_redundancy", "semantic_review_unavailable", "contradictions_versions", "headings_examples",
  "metadata_incomplete", "unknown_dependencies", "soft_only", "read_only"] as const;
export interface ArchiveChoice {
  status: "archived" | null;
  dispositions: { range: PlanRange; disposition: ArchiveDisposition }[];
  limitationsReviewed: boolean;
}
export interface ArchivePlan {
  version: 1; operation: "archive_in_place_plan"; status: "archived";
  secondary: { path: string; created: number; modified: number; bytes: number; before: string; after: string; beforeHash: string };
  canonical: { path: string; created: number; modified: number; bytes: number; content: string; hash: string };
  provenance: { operation: MergeRecord["operation"]; id: string; createdAt: number; recordHash: string; receipt: MergeReceipt };
  copied: MergeRecord["transfers"];
  preservation: (ArchiveFragment & { disposition: "represented" | "retained" })[];
  dependencies: ArchiveDependencies[];
  confirmation: { limitationsReviewed: true };
  limitations: typeof ARCHIVE_LIMITATIONS;
  edit: { start: number; end: number; removed: ""; inserted: string };
}
export class ArchiveError extends Error {
  constructor(readonly reason: "basis" | "stale" | "review" | "consolidate" | "frontmatter" | "properties" | "link") { super(reason); }
}
function requireArchive(test: unknown, reason: ArchiveError["reason"]): asserts test { if (!test) throw new ArchiveError(reason); }
const range = (text: string, start: number, end: number): PlanRange => ({ start, end, text: text.slice(start, end) });

/** Partition every non-whitespace character of the uncopied source, even when native sections are incomplete. */
export function archiveFragments(record: MergeRecord, note: PlanNote): ArchiveFragment[] {
  const text = record.secondary.content;
  const sections = (note.cache?.sections ?? []).map(s => s.position).filter(p =>
    Number.isSafeInteger(p.start.offset) && Number.isSafeInteger(p.end.offset) && p.start.offset >= 0 && p.end.offset > p.start.offset && p.end.offset <= text.length)
    .sort((a, b) => a.start.offset - b.start.offset);
  const endings = [...sections].sort((a, b) => a.end.offset - b.end.offset);
  const boundaries = [...new Set([0, text.length, ...record.transfers.flatMap(t => [t.range.start, t.range.end]),
    ...sections.flatMap(p => [p.start.offset, p.end.offset])])].sort((a, b) => a - b);
  const fragments: ArchiveFragment[] = [];
  let previous = -1, next = 0, copied = 0;
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i], end = boundaries[i + 1];
    while (copied < record.transfers.length && record.transfers[copied].range.end <= start) copied++;
    while (previous + 1 < endings.length && endings[previous + 1].end.offset <= start) previous++;
    while (next < sections.length && sections[next].start.offset < end) next++;
    const transfer = record.transfers[copied]?.range;
    if (!text.slice(start, end).trim() || transfer && start >= transfer.start && end <= transfer.end) continue;
    fragments.push({ range: range(text, start, end), context: range(text,
      endings[previous]?.start.offset ?? boundaries[Math.max(0, i - 1)], sections[next]?.end.offset ?? boundaries[Math.min(boundaries.length - 1, i + 2)]) });
  }
  return fragments;
}

function yamlRecord(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = parseYaml(text);
    requireArchive(parsed == null || isRecord(parsed), "frontmatter");
    return parsed ?? {};
  } catch { throw new ArchiveError("frontmatter"); }
}
/** Insert literal YAML lines; never serialize or rewrite the user's YAML. */
export function archiveMark(note: PlanNote, canonical: string): ArchivePlan["edit"] {
  requireArchive(!/[[\]|#^\\\r\n]/u.test(canonical), "link");
  const text = note.content, newline = text.includes("\r\n") ? "\r\n" : "\n";
  const mark = `veynrel_archive_status: archived${newline}veynrel_canonical: ${JSON.stringify(`[[${canonical.slice(0, -3)}]]`)}${newline}`;
  requireArchive(!text.startsWith("\uFEFF"), "frontmatter");
  const opening = /^---\r?\n/u.exec(text);
  if (!opening) {
    requireArchive(!/^\s*---/u.test(text) && !note.cache?.frontmatter && !note.cache?.frontmatterPosition, "frontmatter");
    return { start: 0, end: 0, removed: "", inserted: `---${newline}${mark}---${newline}` };
  }
  const close = /^---(?:\r?\n|$)/gmu; close.lastIndex = opening[0].length;
  const closing = close.exec(text); requireArchive(closing, "frontmatter");
  const yaml = text.slice(opening[0].length, closing.index), parsed = yamlRecord(yaml);
  // shortcut: unusual YAML keys, directives, anchors and tags are refused; expand only with native fixtures.
  const keys: string[] = [];
  for (const line of yaml.split(/\r?\n/u)) {
    requireArchive(!/(?:^|\s)[&*!][^\s]|<<\s*:/u.test(line) && !line.includes("\t"), "frontmatter");
    if (!line.trim() || /^\s*#/u.test(line) || /^\s/u.test(line)) continue;
    const key = /^([A-Za-z_][A-Za-z0-9_-]*):(?:\s|$)/u.exec(line);
    requireArchive(key && !keys.includes(key[1]), "frontmatter"); keys.push(key[1]);
  }
  requireArchive(!Object.keys(parsed).some(k => /^veynrel(?:$|[_-])/iu.test(k)), "properties");
  requireArchive(note.cache?.frontmatterPosition?.start.offset === 0 && note.cache.frontmatterPosition.end.offset === closing.index + 3 &&
    note.cache.frontmatter && JSON.stringify(Object.fromEntries(Object.entries(note.cache.frontmatter).filter(([k]) => k !== "position"))) === JSON.stringify(parsed), "frontmatter");
  const after = yamlRecord(yaml + mark);
  requireArchive(after.veynrel_archive_status === "archived" && after.veynrel_canonical === `[[${canonical.slice(0, -3)}]]`, "frontmatter");
  delete after.veynrel_archive_status; delete after.veynrel_canonical;
  requireArchive(JSON.stringify(after) === JSON.stringify(parsed), "frontmatter");
  return { start: closing.index, end: closing.index, removed: "", inserted: mark };
}

export function buildArchivePlan(record: MergeRecord, receipt: MergeReceipt, recordHash: string,
  canonical: PlanNote, secondary: PlanNote, dependencies: ArchiveDependencies[], choice: ArchiveChoice): ArchivePlan {
  const fragments = archiveFragments(record, secondary);
  requireArchive(choice.status === "archived" && choice.limitationsReviewed && choice.dispositions.length === fragments.length, "review");
  const preservation = fragments.map((f, i) => {
    const selected = choice.dispositions[i];
    requireArchive(JSON.stringify(selected?.range) === JSON.stringify(f.range), "review");
    requireArchive(selected.disposition !== "consolidate", "consolidate");
    requireArchive(selected.disposition === "represented" || selected.disposition === "retained", "review");
    return { ...f, disposition: selected.disposition };
  });
  const edit = archiveMark(secondary, canonical.path), after = secondary.content.slice(0, edit.start) + edit.inserted + secondary.content.slice(edit.end);
  return { version: 1, operation: "archive_in_place_plan", status: "archived",
    secondary: { path: secondary.path, created: secondary.created!, modified: secondary.modified, bytes: secondary.bytes,
      before: secondary.content, after, beforeHash: record.secondary.hash },
    canonical: { path: canonical.path, created: canonical.created!, modified: canonical.modified, bytes: canonical.bytes, content: canonical.content, hash: record.canonical.afterHash },
    provenance: { operation: record.operation, id: record.id, createdAt: record.createdAt, recordHash, receipt }, copied: record.transfers,
    preservation, dependencies, confirmation: { limitationsReviewed: true }, limitations: ARCHIVE_LIMITATIONS, edit };
}
