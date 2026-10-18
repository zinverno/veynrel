import type { PlanNote, PlanRange } from "./changePlan";
import { requirePlainParagraph } from "./changePlan";
import { groupHeadings, groupRange } from "./groupStructure";

export type BundleKind = "code_explanation" | "list_context" | "quotation_attribution";
export type BundleFailure = "source" | "metadata" | "range" | "protected" | "heading" | "fence" | "list" | "quotation" | "context" | "dependencies" | "semantic" | "intent" | "confirmation" | "analysis";
export class ContextBundleError extends Error { constructor(readonly reason: BundleFailure) { super(reason); } }
export function requireBundle(value: unknown, reason: BundleFailure): asserts value { if (!value) throw new ContextBundleError(reason); }
export interface BundleCandidate {
  kind: BundleKind; core: PlanRange; before: PlanRange[]; after: PlanRange[];
  range: PlanRange; blocks: { role: "context_before" | "core" | "context_after"; range: PlanRange }[];
  retained: PlanRange[]; failure?: BundleFailure;
}
const kindFor = (type: string): BundleKind | undefined => type === "code" ? "code_explanation" : type === "list" ? "list_context" : type === "blockquote" ? "quotation_attribution" : undefined;
const address = /(?:\b[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\bmailto:)/iu;
const overlap = (r: PlanRange, start: number, end: number) => r.start < end && start < r.end;
function structure(note: PlanNote): void {
  try { requireBundle(groupHeadings(note).length === 0, "heading"); }
  catch (e) { if (e instanceof ContextBundleError) throw e; throw new ContextBundleError("metadata"); }
  requireBundle(!note.cache!.frontmatterPosition && !note.cache!.frontmatter, "context");
  for (const item of note.cache!.listItems ?? []) {
    const a = item.position?.start?.offset, b = item.position?.end?.offset;
    requireBundle(Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b > a && b <= note.content.length &&
      note.cache!.sections!.some(s => s.type === "list" && s.position.start.offset <= a && s.position.end.offset >= b), "metadata");
  }
}
function plain(note: PlanNote, range: PlanRange): void {
  try { requirePlainParagraph(note, range); } catch { throw new ContextBundleError("protected"); }
  requireBundle(!address.test(range.text), "protected");
}
function inline(text: string, reason: BundleFailure): void {
  requireBundle(!!text.trim() && !/[[\]`~<>\\^$*_#|%]/u.test(text) && !address.test(text) &&
    !/^(?:\s|[-+](?:\s|$)|\d+[.)](?:\s|$)|[-= \t]+$)/u.test(text), reason);
}
function protectedContent(note: PlanNote, r: PlanRange): void {
  const c = note.cache!;
  const items = [...(c.links ?? []), ...(c.embeds ?? []), ...(c.tags ?? []), ...(c.footnotes ?? []), ...(c.footnoteRefs ?? []),
    ...(c.referenceLinks ?? []), ...Object.values(c.blocks ?? {})];
  requireBundle(!items.some(x => overlap(r, x.position.start.offset, x.position.end.offset)) &&
    !c.sections!.some(s => s.id && overlap(r, s.position.start.offset, s.position.end.offset)), "protected");
}
function fenced(r: PlanRange): void {
  const lines = r.text.split(/\r?\n/u), first = /^(`{3,}|~{3,})([A-Za-z0-9_+-]*)[ \t]*$/u.exec(lines[0]);
  requireBundle(first && lines.length >= 3, "fence");
  const close = new RegExp(`^${first[1][0]}{${first[1].length},}[ \\t]*$`, "u");
  requireBundle(close.test(lines[lines.length - 1]) && lines.slice(1, -1).some(x => x.trim()) &&
    !lines.slice(1, -1).some(x => /^[ \t]*(?:`{3,}|~{3,})/u.test(x)), "fence");
  requireBundle(!address.test(r.text) && !/!\[|\[\[|\[\^|(?:^|\s)\^[\w-]+/u.test(r.text), "protected");
}
function list(note: PlanNote, r: PlanRange): void {
  const lines = r.text.split(/\r?\n/u), matches = lines.map(x => /^(?:([-+*])|([1-9][0-9]*)([.)])) (\S.*)$/u.exec(x));
  requireBundle(matches.every(Boolean), "list");
  const first = matches[0]!; let offset = r.start;
  const native = (note.cache!.listItems ?? []).filter(x => overlap(r, x.position.start.offset, x.position.end.offset));
  requireBundle(native.length === lines.length && native.length > 0, "metadata");
  for (const [i, match] of matches.entries()) {
    const m = match!, item = native[i], end = offset + lines[i].length;
    requireBundle((first[1] ? m[1] === first[1] : !m[1] && m[3] === first[3] && Number(m[2]) === i + 1) &&
      !item.id && item.task === undefined && item.parent === -native[0].position.start.line &&
      item.position.start.offset === offset && item.position.end.offset === end && !/^(?:\.{3}|…)/u.test(m[4]), "list");
    inline(m[4], "protected"); offset = end + (note.content.slice(end, end + 2) === "\r\n" ? 2 : 1);
  }
}
function quotation(r: PlanRange): void {
  for (const line of r.text.split(/\r?\n/u)) {
    requireBundle(line.startsWith("> "), "quotation"); inline(line.slice(2), "quotation");
  }
}

/** Structural proposals only. Every context paragraph remains unselected until the user chooses it. */
export function contextBundleCandidates(note: PlanNote): BundleCandidate[] {
  structure(note);
  const sections = note.cache!.sections!;
  const range = (i: number) => groupRange(note.content, sections[i].position.start.offset, sections[i].position.end.offset);
  return sections.flatMap((s, i) => {
    const kind = kindFor(s.type); if (!kind) return [];
    let first = i, last = i;
    while (first > 0 && sections[first - 1].type === "paragraph") first--;
    while (last + 1 < sections.length && sections[last + 1].type === "paragraph") last++;
    const core = range(i), before = sections.slice(first, i).map((_, j) => range(first + j)), after = sections.slice(i + 1, last + 1).map((_, j) => range(i + 1 + j));
    const envelope = groupRange(note.content, range(first).start, range(last).end);
    const candidate: BundleCandidate = { kind, core, before, after, range: envelope,
      blocks: [...before.map(range => ({ role: "context_before" as const, range })), { role: "core", range: core }, ...after.map(range => ({ role: "context_after" as const, range }))],
      retained: [groupRange(note.content, 0, envelope.start), groupRange(note.content, envelope.end, note.content.length)].filter(r => r.end > r.start) };
    try {
      requireBundle((core.start === 0 || note.content[core.start - 1] === "\n") &&
        (core.end === note.content.length || /^[\r\n]/u.test(note.content.slice(core.end))), "metadata");
      protectedContent(note, envelope);
      if (kind === "code_explanation") fenced(core); else if (kind === "list_context") list(note, core); else quotation(core);
      requireBundle(before.length > 0 && after.length > 0, "context");
      for (const r of [...before, ...after]) plain(note, r);
      // shortcut: shared context between multiple structured cores needs a separate dependency policy.
      requireBundle(first === 0 && last === sections.length - 1, "dependencies");
    } catch (e) { candidate.failure = e instanceof ContextBundleError ? e.reason : "metadata"; }
    return [candidate];
  });
}
export function contextBundleDestination(note: PlanNote): void {
  structure(note);
  requireBundle(note.cache!.sections!.length > 0, "context");
  // shortcut: heading-free plain canonical only; mixed destination structures need their own EOF policy.
  for (const s of note.cache!.sections!) {
    requireBundle(s.type === "paragraph", "context");
    plain(note, groupRange(note.content, s.position.start.offset, s.position.end.offset));
  }
}
