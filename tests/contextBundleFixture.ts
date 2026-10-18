import type { PlanPair } from "../consolidation/changePlan";
import type { PlannerRead } from "../consolidation/changePlannerSession";
import type { RelationshipAnalysis } from "../consolidation/relationshipSession";
import type { ContextBundleChoice } from "../consolidation/contextBundlePlan";
import { emptyBundleChoice } from "../consolidation/contextBundlePlan";
import { contextBundleCandidates } from "../consolidation/contextBundleStructure";
import { mergeNote } from "./mergeFixture";

/** Hand-authored section fixtures only; native acceptance uses real MetadataCache. */
export function bundleNote(path: string, text: string) {
  const n = mergeNote(path, text);
  const point = (offset: number) => ({offset, line: text.slice(0,offset).split("\n").length-1, col: offset-text.lastIndexOf("\n",offset-1)-1});
  for (const s of n.cache!.sections!) {
    s.position = {start:point(s.position.start.offset),end:point(s.position.end.offset)};
    const literal=text.slice(s.position.start.offset,s.position.end.offset);
    if (/^(?:`{3,}|~{3,})/u.test(literal)) s.type="code";
    else if (/^(?:[-+*] |[0-9]+[.)] )/u.test(literal)) {
      s.type="list";let at=s.position.start.offset;
      n.cache!.listItems ??= [];
      for(const line of literal.split(/\r?\n/u)) {
        n.cache!.listItems.push({parent:-s.position.start.line,position:{start:point(at),end:point(at+line.length)}});
        at+=line.length+(text.slice(at+line.length,at+line.length+2)==="\r\n"?2:1);
      }
    } else if(literal.startsWith(">")) s.type="blockquote";
    else if(literal.startsWith("# ")) {s.type="heading";n.cache!.headings??=[];n.cache!.headings.push({heading:literal.slice(2),level:1,position:s.position});}
  }
  return n;
}
export function bundleFixture(core="```js\nreturn freeSlots > 0;\n```", canonical: 0|1=0, newline="\n") {
  const a="Shared scoped fact.\n\nExisting observation.\n",b=`Shared scoped fact.\n\nThe following example applies only to the toy exercise.\n\n${core}\n\nThis observation does not establish a general rule.\n`;
  const pair=(canonical===0?[a,b]:[b,a]).map((t,i)=>bundleNote(`${i}/Note.md`,t.replace(/\n/gu,newline))) as unknown as PlanPair;
  const analysis:RelationshipAnalysis={pair:[{...pair[0]},{...pair[1]}],provider:"offline",model:"control",result:{
    relation:"partial_overlap",explanation:{text:"Shared scope.",evidence:["s"]},claims:[{id:"s",kind:"shared",text:"Shared.",quoteA:"Shared scoped fact.",quoteB:"Shared scoped fact."}],
    recommendation:{action:"consider_merge",reason:"Review context.",evidence:["s"]},alternatives:[],limitations:["Context roles require manual review."]}};
  const candidate=contextBundleCandidates(pair[1-canonical])[0];
  const choice:ContextBundleChoice={...emptyBundleChoice(),canonical,kind:candidate.kind,core:candidate.core,context:[...candidate.before,...candidate.after],
    boundariesConfirmed:true,contextConfirmed:true,dependencies:"reviewed" as const,insertion:pair[canonical].content.length,insertionConfirmed:true};
  const read:PlannerRead={pair,linktexts:["0/Note","1/Note"]};return {pair,analysis,choice,read};
}
