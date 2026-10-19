import { t as tr } from "../i18n";
import type { ChangePlannerSession } from "./changePlannerSession";
import type { RelationshipAnalysis } from "./relationshipSession";
import { atomizationCandidates, atomizationHintIds } from "./atomizationPlan";
import { emptyAtomChoice } from "./emptyAtomPlan";
import type { AtomizationPlanV2, EmptyAtomChoice } from "./emptyAtomPlan";

export function atomText(root:HTMLElement,key:string,text:string,open=false):void {
  const panel=root.createEl("details");panel.open=open;panel.createEl("summary",{text:tr(key)});
  panel.createEl("pre",{text,cls:"ai-pair-source",attr:{tabindex:"0","data-empty-atom-text":key}});
}
const reset=(choice:EmptyAtomChoice):EmptyAtomChoice=>({...choice,unitConfirmed:false,contextConfirmed:false,manualConfirmed:false,
  titleConfirmed:false,sourceConfirmed:false,dependenciesReviewed:false,targetConfirmed:false});
/** The picker enumerates existing files; typing a title never creates or renames one. */
export function renderEmptyAtomPlanner(root:HTMLElement,session:ChangePlannerSession,analysis:RelationshipAnalysis,choice:EmptyAtomChoice,
  change:(choice:EmptyAtomChoice)=>void,review?: (plan:AtomizationPlanV2)=>void):void {
  const input=session.view.input;if(!input)return;
  const select=(key:string,values:[string,string][],value:string,update:(value:string)=>void)=>{
    const label=root.createEl("label",{cls:"ai-planner-location",text:tr(key)}),field=label.createEl("select",{attr:{"data-planner-field":`empty-${key.split(".").pop()}`}});
    field.createEl("option",{text:tr("@planner.choose"),value:""});for(const [value,text] of values)field.createEl("option",{value,text});
    field.value=value;field.addEventListener("change",()=>update(field.value));
  };
  select("@atom.source",input.pair.map((n,i)=>[String(i),n.path]),choice.side===null?"":String(choice.side),value=>change({...emptyAtomChoice(),side:value===""?null:value==="0"?0:1}));
  let candidates:ReturnType<typeof atomizationCandidates>=[];
  if(choice.side!==null){
    atomText(root,"@atom.original",input.pair[choice.side].content);
    try{candidates=atomizationCandidates(input.pair[choice.side]);}catch{root.createEl("p",{text:tr("@atom.error.metadata")});}
  }
  const index=candidates.findIndex(c=>c.kind===choice.kind&&JSON.stringify(c.range)===JSON.stringify(choice.range)),candidate=candidates[index];
  select("@atom.selection",candidates.map((c,i)=>[String(i),`${tr(`@atom.${c.kind}`)} ${c.range.start}–${c.range.end}: ${c.range.text.slice(0,80)}`]),index<0?"":String(index),value=>{
    const c=value===""?undefined:candidates[Number(value)];change(reset({...choice,kind:c?.kind??null,range:c?.range??null}));
  });
  for(const c of candidates.filter(c=>c.failure))root.createEl("p",{text:`${c.range.start}–${c.range.end}: ${tr(`@atom.error.${c.failure}`)}`});
  const hints=candidate&&choice.side!==null?atomizationHintIds(analysis,input.pair,choice.side,candidate):[];
  if(candidate){atomText(root,"@atom.unit",candidate.range.text,true);atomText(root,"@atom.context",candidate.context.map(c=>`${c.start}–${c.end}\n${c.text}`).join("\n\n"),true);}
  root.createEl("p",{text:tr(hints.length?"@atom.hint":"@atom.manual")});
  select("@emptyAtom.target",session.emptyTargets().map(p=>[p,p]),choice.path,path=>change(reset({...choice,path})));
  const label=root.createEl("label",{text:tr("@atom.title"),cls:"ai-planner-location"}),title=label.createEl("input",{type:"text",attr:{"data-planner-field":"empty-title"}});
  title.value=choice.title;title.addEventListener("input",()=>change(reset({...choice,title:title.value})));
  root.createEl("p",{text:tr("@emptyAtom.scope")});root.createEl("p",{text:tr("@atom.unknown")});
  if(choice.side!==null)atomText(root,"@atom.additions",`# ${choice.title}\n\nSource: [[${input.pair[choice.side].path.slice(0,-3)}]]`,true);
  const confirmations=["unitConfirmed","contextConfirmed",...(!hints.length?["manualConfirmed" as const]:[]),"titleConfirmed","sourceConfirmed","dependenciesReviewed","targetConfirmed"] as const;
  for(const key of confirmations){
    const label=root.createEl("label",{cls:"ai-planner-confirm"}),box=label.createEl("input",{type:"checkbox",attr:{"data-planner-field":`empty-${key}`}});
    box.checked=choice[key];label.createSpan({text:tr(key==="targetConfirmed"?"@emptyAtom.targetConfirmed":`@atom.${key}`)});
    box.addEventListener("change",()=>change({...choice,[key]:box.checked}));
  }
  const build=root.createEl("button",{text:tr("@planner.build"),attr:{type:"button","data-empty-atom-action":"build"}});
  build.disabled=!candidate||!!candidate.failure||!choice.path||!choice.title||confirmations.some(key=>!choice[key]);build.addEventListener("click",()=>{void session.buildEmptyAtom(choice);});
  root.createEl("button",{text:tr("@planner.cancel"),attr:{type:"button"}}).addEventListener("click",()=>session.cancel());
  const plan=session.view.emptyAtomPlan;if(!plan)return;
  const result=root.createDiv({attr:{"data-empty-atom-plan":""}});result.createEl("h4",{text:plan.target.path});
  atomText(result,"@atom.preview",plan.target.after,true);atomText(result,"@atom.remaining",plan.remaining);
  if(review)result.createEl("button",{text:tr("@emptyAtom.review"),attr:{type:"button","data-empty-atom-action":"review"}}).addEventListener("click",()=>review(plan));
}
