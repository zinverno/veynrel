import type { PlanNote, PlanRange } from "./changePlan";
import { requirePlainParagraph } from "./changePlan";

export type GroupFailure = "source" | "metadata" | "range" | "protected" | "hierarchy" | "context" | "semantic" | "intent" | "confirmation" | "dependencies" | "analysis";
export class GroupPlanError extends Error { constructor(readonly reason: GroupFailure) { super(reason); } }
export function requireGroup(value: unknown, reason: GroupFailure): asserts value { if (!value) throw new GroupPlanError(reason); }
export interface GroupHeading { level: number; title: string; range: PlanRange; end: number; parent: number | null }
export interface ContextGroup {
  heading: number; path: number[]; range: PlanRange;
  context: PlanRange[]; copied: PlanRange[]; retained: PlanRange[];
  failure?: GroupFailure;
}
export const groupRange = (text: string, start: number, end: number): PlanRange => ({ start, end, text: text.slice(start, end) });
const sameRange = (a: PlanRange, b: PlanRange) => a.start === b.start && a.end === b.end;
const intersects = (a: PlanRange, b: PlanRange) => a.start < b.end && b.start < a.end;
const externalAddress = /(?:\b[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\bmailto:)/iu;
function protectedRanges(note: PlanNote): PlanRange[] {
  const cache = note.cache!;
  const positions = [...(cache.frontmatterPosition ? [cache.frontmatterPosition] : []),
    ...[...(cache.links ?? []), ...(cache.embeds ?? []), ...(cache.tags ?? []), ...(cache.footnotes ?? []),
      ...(cache.footnoteRefs ?? []), ...(cache.referenceLinks ?? []), ...Object.values(cache.blocks ?? {})].map(x => x.position)];
  return positions.map(p => {
    requireGroup(p && Number.isInteger(p.start?.offset) && Number.isInteger(p.end?.offset) && p.start.offset >= 0 &&
      p.end.offset > p.start.offset && p.end.offset <= note.content.length, "metadata");
    return groupRange(note.content, p.start.offset, p.end.offset);
  });
}

/** Native ranges are authoritative; the literal checks detect incomplete, overlapping or stale cache coverage. */
export function groupHeadings(note: PlanNote): GroupHeading[] {
  const { cache, content } = note;
  requireGroup(cache?.sections, "metadata");
  protectedRanges(note);
  let end = 0;
  for (const s of cache.sections) {
    const a = s.position.start.offset, b = s.position.end.offset;
    requireGroup(Number.isInteger(a) && Number.isInteger(b) && a >= end && b > a && b <= content.length &&
      /^\s*$/u.test(content.slice(end, a)), "metadata");
    end = b;
  }
  requireGroup(/^\s*$/u.test(content.slice(end)), "metadata");
  const headings = (cache.headings ?? []).map(h => ({ level: h.level, title: h.heading,
    range: groupRange(content, h.position.start.offset, h.position.end.offset), end: content.length, parent: null as number | null }));
  const sections = cache.sections.filter(s => s.type === "heading");
  requireGroup(headings.length === sections.length, "metadata");
  const stack: number[] = [];
  headings.forEach((h, i) => {
    const s = sections[i], literal = /^(#{1,3})[ \t]+([^\r\n]+)$/u.exec(h.range.text);
    requireGroup(s && sameRange(h.range, { start: s.position.start.offset, end: s.position.end.offset, text: "" }), "metadata");
    // shortcut: only unadorned ATX H1–H3; Setext, closing hashes and inline markup need a separate policy.
    requireGroup(literal && literal[1].length === h.level && literal[2] === h.title &&
      !/[[\]`~<>\\^$*_#|%]/u.test(h.title) && !externalAddress.test(h.title) &&
      (h.range.start === 0 || content[h.range.start - 1] === "\n") &&
      (h.range.end === content.length || /^[\r\n]/u.test(content.slice(h.range.end))), "hierarchy");
    while (stack.length && headings[stack[stack.length - 1]].level >= h.level) stack.pop();
    h.parent = stack.length ? stack[stack.length - 1] : null;
    requireGroup(h.level === (h.parent === null ? 1 : headings[h.parent].level + 1), "hierarchy");
    h.end = headings.slice(i + 1).find(next => next.level <= h.level)?.range.start ?? content.length;
    stack.push(i);
  });
  return headings;
}

/** Check all characters in a transferred range, including native protected metadata and whitespace gaps. */
export function validateGroupSection(note: PlanNote, range: PlanRange, headings: GroupHeading[]): void {
  const cache = note.cache!;
  requireGroup(!protectedRanges(note).some(p => intersects(range, p)), "protected");
  const sections = cache.sections!.filter(s => intersects(range, groupRange(note.content, s.position.start.offset, s.position.end.offset)));
  requireGroup(sections.length > 0, "range");
  for (const s of sections) {
    const r = groupRange(note.content, s.position.start.offset, s.position.end.offset);
    requireGroup(r.start >= range.start && r.end <= range.end && !s.id, "range");
    if (s.type === "heading") requireGroup(headings.some(h => sameRange(h.range, r)), "metadata");
    else {
      requireGroup(s.type === "paragraph", "protected");
      try { requirePlainParagraph(note, r); } catch { throw new GroupPlanError("protected"); }
      requireGroup(!externalAddress.test(r.text), "protected");
    }
  }
}

export function contextGroups(note: PlanNote): { headings: GroupHeading[]; groups: ContextGroup[] } {
  const headings = groupHeadings(note);
  return { headings, groups: headings.map((h, index) => {
    const path = [index]; let p = h.parent;
    while (p !== null) { path.unshift(p); p = headings[p].parent; }
    const context = path.slice(0, -1).map(i => groupRange(note.content, headings[i].range.start,
      headings.find((child, j) => j > i && child.parent === i)?.range.start ?? headings[i].end));
    const range = groupRange(note.content, h.range.start, h.end), copied = [...context, range];
    const retained: PlanRange[] = []; let offset = 0;
    for (const r of copied) { if (r.start > offset) retained.push(groupRange(note.content, offset, r.start)); offset = r.end; }
    if (offset < note.content.length) retained.push(groupRange(note.content, offset, note.content.length));
    const group: ContextGroup = { heading: index, path, range, context, copied, retained };
    try {
      for (const r of copied) validateGroupSection(note, r, headings);
      requireGroup(note.cache!.sections!.some(s => s.type === "paragraph" && s.position.start.offset >= range.start && s.position.end.offset <= range.end), "range");
      // A file preamble or properties can qualify every section; never silently leave them behind.
      requireGroup(!note.content.slice(0, headings[0].range.start).trim(), "context");
    } catch (e) { group.failure = e instanceof GroupPlanError ? e.reason : "metadata"; }
    return group;
  }) };
}

/** v1 inserts a standalone original H1 branch at EOF only, never inside an existing section. */
export function groupDestination(note: PlanNote): void {
  groupHeadings(note);
  const sections = note.cache!.sections!, last = sections[sections.length - 1];
  requireGroup(last, "hierarchy");
  if (last.type === "heading") return;
  requireGroup(last.type === "paragraph", "hierarchy");
  try { requirePlainParagraph(note, groupRange(note.content, last.position.start.offset, last.position.end.offset)); }
  catch { throw new GroupPlanError("hierarchy"); }
}
