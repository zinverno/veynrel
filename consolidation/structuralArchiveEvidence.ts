import type { CachedMetadata } from "obsidian";
import { parseYaml } from "obsidian";
import type { ArchiveParent, ArchivePlanV2 } from "./archivePlanV2";
import type { StructuralArchiveRecord, StructuralArchiveReceipt } from "./structuralArchiveJournal";
import { isRecord } from "../health/domain/validation";
import { requireSafe } from "./operationJournal";

/** Restart changes cache.v and object key order, never public metadata or array order. */
export function structuralEvidence(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => isRecord(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
}
export function structuralMetadata(cache: CachedMetadata): CachedMetadata {
  const copy = { ...cache } as CachedMetadata & { v?: unknown }; delete copy.v; return copy;
}
export interface StructuralRestoration {
  archiveId: string; modified: number; evidence: string;
  record: StructuralArchiveRecord; receipt: StructuralArchiveReceipt;
}
export function restorationModified(parent: ArchiveParent, restoration?: StructuralRestoration): number {
  if (!restoration) return parent.plan.secondary.identity.modified;
  requireSafe(structuralEvidence(restoration.record.parent) === structuralEvidence(parent) && restoration.archiveId === restoration.record.id &&
    restoration.receipt.state === "undone" && restoration.modified === restoration.receipt.modified, "archive_chain");
  return restoration.modified;
}

/** Current parent grammars have no YAML. Remove only the proven prefix from cache coordinates. */
export function unarchiveMetadata(cache: CachedMetadata, p: ArchivePlanV2): CachedMetadata {
  requireSafe(p.edit.start === 0 && p.edit.end === 0 && p.secondary.after === p.edit.inserted + p.secondary.before, "conflict");
  const text = p.edit.inserted, length = text.length, lines = text.split("\n").length - 1;
  const expected = { veynrel_archive_status: "archived", veynrel_canonical: `[[${p.canonical.path.slice(0, -3)}]]` };
  requireSafe(structuralEvidence(parseYaml(text.replace(/^---\r?\n/u, "").replace(/---\r?\n$/u, ""))) === structuralEvidence(expected) &&
    structuralEvidence(cache.frontmatter) === structuralEvidence(expected) && cache.frontmatterPosition?.start.offset === 0 &&
    cache.frontmatterPosition.end.offset === length - (text.endsWith("\r\n") ? 2 : 1), "conflict");
  const refs = cache.frontmatterLinks;
  requireSafe(refs?.length === 1 && refs[0].key === "veynrel_canonical" && refs[0].link === p.canonical.path.slice(0, -3) &&
    refs[0].original === expected.veynrel_canonical, "conflict");
  const copy = JSON.parse(JSON.stringify(cache)) as CachedMetadata;
  delete copy.frontmatter; delete copy.frontmatterPosition; delete copy.frontmatterLinks;
  // Obsidian includes one YAML section; a second or misplaced YAML section is a conflict.
  requireSafe(copy.sections?.filter(s => s.type === "yaml").length === 1 && copy.sections[0].type === "yaml" &&
    copy.sections[0].position.start.offset === 0 && copy.sections[0].position.end.offset === cache.frontmatterPosition.end.offset, "conflict");
  copy.sections = copy.sections.slice(1);
  const shift = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(shift); return; }
    if (!isRecord(v)) return;
    if (typeof v.offset === "number" && typeof v.line === "number" && typeof v.col === "number") {
      requireSafe(v.offset >= length && v.line >= lines, "conflict"); v.offset -= length; v.line -= lines;
    } else Object.values(v).forEach(shift);
  };
  shift(copy);
  for (const item of copy.listItems ?? []) {
    requireSafe(Math.abs(item.parent) >= lines, "conflict");
    item.parent += item.parent < 0 ? lines : -lines;
  }
  return copy;
}
