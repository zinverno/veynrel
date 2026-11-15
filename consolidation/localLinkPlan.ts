import { isCanonicalMarkdownPath } from "../chunking/reconstructChunks";
import { ChangePlanError, requireLinkRange } from "./changePlan";
import type { ChangePlan, PlanRange } from "./changePlan";
import type { PlannerRead } from "./changePlannerSession";

export type SingleWritePlan = Pick<ChangePlan, "operation" | "sourcePath" | "targetPath" | "source" | "target" | "selection" | "edit" | "before" | "after" | "affectedLinks">;
export interface LocalLinkPlan extends SingleWritePlan {
  operation: "add_link";
  origin: "user";
  sourceCreated: number;
  targetCreated: number;
  structure: string;
}
export function localLinkStructure(read: PlannerRead): string {
  return JSON.stringify(read.pair.map((note, i) => ({ path: note.path, cache: note.cache, references: note.references, linktext: read.linktexts[i] }))
    .sort((a, b) => a.path.localeCompare(b.path)));
}
/** A user-selected link, never a semantic recommendation or a broken-link repair. */
export function buildLocalLinkPlan(read: PlannerRead, side: 0 | 1, selection: PlanRange | null, confirmed: boolean): LocalLinkPlan {
  if (side !== 0 && side !== 1 || read.pair[0].path === read.pair[1].path || read.pair.some(note =>
    !isCanonicalMarkdownPath(note.path) || note.path.split("/").some(part => part.startsWith(".")) ||
    note.content.length > 200000 || note.bytes > 800000 || !Number.isFinite(note.created))) throw new ChangePlanError("source");
  if (!selection || !confirmed) throw new ChangePlanError("confirmation");
  const source = read.pair[side], target = read.pair[side === 0 ? 1 : 0], linktext = read.linktexts[side === 0 ? 1 : 0];
  requireLinkRange(read.pair, side, selection, linktext);
  const added = `[[${linktext}]]`, edit = { start: selection.end, end: selection.end, removed: "", inserted: ` ${added}` };
  return { operation: "add_link", origin: "user", sourcePath: source.path, targetPath: target.path,
    source, target, sourceCreated: source.created!, targetCreated: target.created!, structure: localLinkStructure(read),
    selection: { ...selection }, edit, before: source.content,
    after: source.content.slice(0, edit.start) + edit.inserted + source.content.slice(edit.end),
    affectedLinks: { added, target: target.path, preserved: source.references.map(ref => ({ ...ref })) } };
}
