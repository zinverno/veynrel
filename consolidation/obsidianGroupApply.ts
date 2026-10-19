import { restorationModified } from "./structuralArchiveEvidence";
import { checkStructuralRestoration } from "./obsidianStructuralArchiveState";
import type { App } from "obsidian";
import type { GroupPort } from "./groupApply";
import type { SafeApplyPort } from "./safeApply";
import type { PlanPair } from "./changePlan";
import { readPlannerPair } from "./changePlannerSession";
import { validateGroupPlan } from "./groupPlan";
import { groupHeadings, contextGroups, validateGroupSection, groupRange } from "./groupStructure";
import { guardMergePair, readMergeIncoming } from "./obsidianMergeApply";
import { sameSavedNote } from "./savedNote";
import { requireSafe } from "./operationJournal";

// Restart adds private cache.v and can reorder keys; preserve every public value and array order.
const persistedMetadata = (cache: unknown) => {
  const copy = { ...cache as Record<string, unknown> }; delete copy.v;
  return JSON.stringify(copy, (_key, value: unknown) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, (value as Record<string, unknown>)[key]])) : value);
};

/** Native authority is always fresh; journal-reconstructed identities never enter this port. */
export function obsidianGroupPort(app: App, port: SafeApplyPort): GroupPort {
  const read = async (paths: readonly [string,string], pinned?: PlanPair) => {
    const result=await readPlannerPair(app,paths),incoming=readMergeIncoming(app,paths);
    requireSafe(result.pair.every(n=>n.cache?.sections),"stale");
    if(pinned) requireSafe(result.pair.every((n,i)=>sameSavedNote(n,pinned[i]) && n.created===pinned[i].created &&
      JSON.stringify(n.cache)===JSON.stringify(pinned[i].cache) && JSON.stringify(n.references)===JSON.stringify(pinned[i].references)),"stale");
    const base=guardMergePair(app,port,result.pair,incoming);
    const guard=()=>{base();requireSafe(result.pair.every((n,i)=>app.metadataCache.getFirstLinkpathDest(n.path.slice(0,-3),paths[1-i])===n.file),"stale");};
    guard();return {...result,incoming,guard};
  };
  return {
    async check(plan,analysis,pinned){
      const side=plan.confirmations.canonical;requireSafe(side===0||side===1,"stale");
      const checked=await read([analysis.pair[0].path,analysis.pair[1].path],pinned?(side===0?pinned:[pinned[1],pinned[0]]):undefined);
      const guard=()=>{checked.guard();validateGroupPlan(plan,analysis,checked.pair,plan.confirmations,checked.linktexts,checked.incoming);};
      guard();return {notes:[checked.pair[side],checked.pair[1-side]],guard};
    },
    async undo(record,pinned,restoration){
      const p=record.plan,c=p.canonical,s=p.secondary,checked=await read([c.path,s.path],pinned),[canonical,secondary]=checked.pair;
      const side=p.confirmations.canonical!;
      requireSafe(canonical.created===c.identity.created && canonical.content===c.after && canonical.bytes===new TextEncoder().encode(c.after).length &&
        secondary.created===s.identity.created && secondary.modified===restorationModified(record,restoration) && secondary.bytes===s.identity.bytes && secondary.content===s.content &&
        persistedMetadata(secondary.cache)===persistedMetadata(p.dependencies[1-side].metadata) &&
        JSON.stringify(secondary.references)===JSON.stringify(p.dependencies[1-side].outgoing) &&
        JSON.stringify(canonical.references)===JSON.stringify(p.dependencies[side].outgoing) &&
        JSON.stringify(checked.incoming)===JSON.stringify([p.dependencies[side].incoming,p.dependencies[1-side].incoming]) &&
        JSON.stringify(checked.linktexts)===JSON.stringify([p.resolver[side],p.resolver[1-side]]),"conflict");
      const original = p.dependencies[side].metadata!;
      const prefix = { ...canonical.cache,
        headings: (canonical.cache!.headings ?? []).filter(h => h.position.end.offset <= p.insertion.point),
        sections: canonical.cache!.sections!.filter(s => s.position.end.offset <= p.insertion.point) };
      requireSafe(persistedMetadata(prefix) === persistedMetadata({ ...original, headings: original.headings ?? [] }), "conflict");
      requireSafe(JSON.stringify(contextGroups(secondary).groups.find(g => g.range.start === p.group.range.start)) === JSON.stringify(p.group), "conflict");
      const expected = [
        ...p.hierarchy.destination.map(h => ({level:h.level,text:h.range.text,start:h.range.start})),
        ...p.hierarchy.inserted.map(h => ({level:h.level,text:h.text,start:h.destinationOffset})),
      ];
      const headings = groupHeadings(canonical);
      requireSafe(JSON.stringify(headings.map(h => ({level:h.level,text:h.range.text,start:h.range.start}))) === JSON.stringify(expected), "conflict");
      let cursor = p.insertion.point + p.insertion.separator.length;
      for (const source of p.group.copied) {
        const target = groupRange(canonical.content, cursor, cursor + source.text.length);
        validateGroupSection(canonical, target, headings);
        const sections = (note: typeof canonical, start: number, end: number) => note.cache!.sections!
          .filter(s => s.position.start.offset >= start && s.position.end.offset <= end)
          .map(s => ({type:s.type,start:s.position.start.offset-start,end:s.position.end.offset-start,id:s.id}));
        requireSafe(JSON.stringify(sections(canonical, target.start, target.end)) === JSON.stringify(sections(secondary, source.start, source.end)), "conflict");
        cursor = target.end + p.insertion.separator.length;
      }
      const restoredGuard=restoration?await checkStructuralRestoration(app,port,checked.pair,restoration):undefined;
      const guard=()=>{checked.guard();restoredGuard?.();};guard();return {notes:checked.pair,guard};
    },
  };
}
