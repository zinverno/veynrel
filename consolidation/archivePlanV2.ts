import type { PlanNote, PlanPair, PlanRange } from "./changePlan";
import type { GroupRecord, GroupEntry } from "./groupJournal";
import type { BundleRecord, BundleEntry } from "./bundleJournal";
import { contextGroups, groupHeadings, groupRange, validateGroupSection } from "./groupStructure";
import { contextBundleCandidates } from "./contextBundleStructure";
import { archiveMark, ARCHIVE_LIMITATIONS, ArchiveError } from "./archivePlan";
import type { ArchiveChoice, ArchiveDependencies, ArchiveDisposition } from "./archivePlan";

export type ArchiveParent = GroupRecord | BundleRecord;
export interface ArchiveParentRead {
  record: ArchiveParent; entry: GroupEntry | BundleEntry; recordHash: string;
  notes: PlanPair; guard(): void;
}
export interface ArchiveDependenciesV2 extends ArchiveDependencies {
  issues: string[];
  targets: { from: string; kind: "link" | "embed" | "property"; original: string; target: string | null; subpath: string }[];
}
export interface ArchivePart {
  range: PlanRange; kind: "copied" | "uncopied" | "dependency" | "separator";
  copied: boolean; section: string | null; context: PlanRange;
}
export interface ArchiveChoiceV2 extends ArchiveChoice { unknownDependenciesAccepted: boolean }
/** Structural parent evidence is never a MergeRecord or an Archive Apply v1 capability. */
export interface ArchivePlanV2 {
  version: 2; operation: "structural_archive_in_place_plan"; readOnly: true; status: "archived";
  provenance: { operation: ArchiveParent["operation"]; id: string; recordHash: string; parent: ArchiveParent; receipt: GroupEntry["receipts"][number] };
  canonical: { path: string; created: number; modified: number; bytes: number; content: string; hash: string };
  secondary: { path: string; created: number; modified: number; bytes: number; before: string; after: string; beforeHash: string };
  copied: PlanRange[]; retained: PlanRange[]; partition: ArchivePart[];
  preservation: (ArchivePart & { disposition: Exclude<ArchiveDisposition, "consolidate"> })[];
  dependencies: ArchiveDependenciesV2[];
  confirmation: { limitationsReviewed: true; unknownDependenciesAccepted: true; semanticCompletenessProven: false };
  limitations: readonly string[];
  edit: { start: number; end: number; removed: ""; inserted: string };
}
const exact = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function requirePartition(value: unknown): asserts value { if (!value) throw new ArchiveError("basis"); }
export function archiveSourceRanges(record: ArchiveParent): { copied: PlanRange[]; retained: PlanRange[] } {
  return record.operation === "copy_context_group" ? record.plan.group : { copied: [record.plan.bundle.range], retained: record.plan.bundle.retained };
}

/** Exact cover, including whitespace. Native sections and saved structural provenance must agree. */
export function archivePartition(record: ArchiveParent, secondary: PlanNote): ArchivePart[] {
  const text = record.plan.secondary.content;
  requirePartition(secondary.content === text);
  try {
    const headings = groupHeadings(secondary);
    if (record.operation === "copy_context_group") {
      requirePartition(exact(contextGroups(secondary).groups.find(g => g.range.start === record.plan.group.range.start), record.plan.group));
      // shortcut: retained rich Group syntax is refused until it has a complete structural validator.
      validateGroupSection(secondary, groupRange(text, 0, text.length), headings);
    } else {
      requirePartition(exact(contextBundleCandidates(secondary).find(b => b.core.start === record.plan.bundle.core.start), record.plan.bundle));
    }
  } catch { throw new ArchiveError("basis"); }
  const { copied, retained } = archiveSourceRanges(record);
  const cover = [...copied.map(range => ({ range, copied: true })), ...retained.map(range => ({ range, copied: false }))].sort((a, b) => a.range.start - b.range.start);
  let cursor = 0;
  for (const { range: r } of cover) {
    requirePartition(Number.isSafeInteger(r.start) && Number.isSafeInteger(r.end) && r.start === cursor && r.end > r.start && r.end <= text.length && r.text === text.slice(r.start, r.end));
    cursor = r.end;
  }
  requirePartition(cursor === text.length);
  const sections = secondary.cache!.sections!;
  const boundaries = [...new Set([0, text.length, ...cover.flatMap(c => [c.range.start, c.range.end]),
    ...sections.flatMap(s => [s.position.start.offset, s.position.end.offset])])].sort((a, b) => a - b);
  const parts: ArchivePart[] = [];
  let c = 0, s = 0;
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i], end = boundaries[i + 1], range = groupRange(text, start, end);
    while (cover[c].range.end <= start) c++;
    while (s < sections.length && sections[s].position.end.offset <= start) s++;
    const section = sections[s]?.position.start.offset <= start ? sections[s].type : null;
    const context = groupRange(text, sections[Math.max(0, s - 1)]?.position.start.offset ?? 0,
      sections[Math.min(sections.length - 1, s + 1)]?.position.end.offset ?? text.length);
    const copied = cover[c].copied;
    parts.push({ range, copied, section, context, kind: !range.text.trim() ? "separator" : copied ? "copied" : section === "paragraph" ? "uncopied" : "dependency" });
  }
  requirePartition(parts.map(p => p.range.text).join("") === text);
  return parts;
}
export const archiveReviewParts = (parts: ArchivePart[]) => parts.filter(p => !p.copied && p.kind !== "separator");

export function buildArchivePlanV2(input: ArchiveParentRead & { dependencies: ArchiveDependenciesV2[] }, choice: ArchiveChoiceV2): ArchivePlanV2 {
  const { record, notes: [c, s] } = input, partition = archivePartition(record, s), fragments = archiveReviewParts(partition);
  input.guard();
  requirePartition(!input.entry.damaged && exact(input.entry.record, record) && input.entry.receipts.length > 0 &&
    input.entry.receipts.every(r => r.state === "applied" && r.hash === record.hashes.after && r.modified === c.modified && r.bytes === c.bytes) &&
    c.path === record.plan.canonical.path && c.created === record.plan.canonical.identity.created && c.content === record.plan.canonical.after &&
    s.path === record.plan.secondary.path && s.created === record.plan.secondary.identity.created && s.modified === record.plan.secondary.identity.modified && s.bytes === record.plan.secondary.identity.bytes);
  if (choice.status !== "archived" || !choice.limitationsReviewed || !choice.unknownDependenciesAccepted || choice.dispositions.length !== fragments.length) throw new ArchiveError("review");
  const preservation = fragments.map((p, i) => {
    const selection = choice.dispositions[i];
    if (!exact(selection?.range, p.range)) throw new ArchiveError("review");
    if (selection.disposition === "consolidate") throw new ArchiveError("consolidate");
    if (selection.disposition !== "represented" && selection.disposition !== "retained") throw new ArchiveError("review");
    return { ...p, disposition: selection.disposition };
  });
  const edit = archiveMark(s, c.path), after = s.content.slice(0, edit.start) + edit.inserted + s.content.slice(edit.end);
  return { version: 2, operation: "structural_archive_in_place_plan", readOnly: true, status: "archived",
    provenance: { operation: record.operation, id: record.id, recordHash: input.recordHash, parent: record, receipt: input.entry.receipts[0] },
    canonical: { path: c.path, created: c.created, modified: c.modified, bytes: c.bytes, content: c.content, hash: record.hashes.after },
    secondary: { path: s.path, created: s.created, modified: s.modified, bytes: s.bytes, before: s.content, after, beforeHash: record.hashes.secondary },
    ...archiveSourceRanges(record), partition, preservation, dependencies: input.dependencies,
    confirmation: { limitationsReviewed: true, unknownDependenciesAccepted: true, semanticCompletenessProven: false },
    limitations: [...ARCHIVE_LIMITATIONS.filter(l => l !== "semantic_review_unavailable"), "single_parent_only", "retained_group_rich_syntax_unsupported", "parent_undo_requires_complete_archive_chain",
      ...record.plan.provenance.analysis.limitations], edit };
}
