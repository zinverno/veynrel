import { reviewSummary, diagnosticPanel, historyHeading, historyUnavailable, focusStatus } from "./consolidationUx";
import { App, Modal } from "obsidian";
import { t as tr } from "../i18n";
import { SafeApplyError } from "./operationJournal";
import type { EmptyAtomApply, EmptyAtomHistory, EmptyAtomReview } from "./emptyAtomApply";
import type { EmptyAtomRecord } from "./emptyAtomJournal";
import { atomText } from "./emptyAtomPlannerView";
import { renderPlanDiff } from "./planDiffView";
const button=(root:HTMLElement,key:string,action:()=>void)=>{
  const b=root.createEl("button",{text:tr(`@emptyAtom.${key}`),attr:{type:"button","data-empty-atom-apply":key}});b.addEventListener("click",action);return b;
};
function preview(root:HTMLElement,r:EmptyAtomRecord,undo=false):void {
  const p=r.plan;reviewSummary(root,[p.target.path],p.sources.map(n=>n.path),undo);
  root.createEl("p",{text:tr("@emptyAtom.scope")});root.createEl("p",{text:tr("@emptyAtom.limits")});
  if(undo)root.createEl("p",{text:tr("@emptyAtom.undoScope")});
  for(const n of p.sources){root.createEl("h4",{text:n.path});atomText(root,"@atom.original",n.markdown);}
  atomText(root,"@atom.unit",`${p.selected.range.start}–${p.selected.range.end}\n${p.selected.range.text}`,true);
  atomText(root,"@atom.context",p.context.map(c=>`${c.start}–${c.end}\n${c.text}`).join("\n\n"),true);
  atomText(root,"@atom.additions",p.additions.title+p.additions.separator+p.additions.source,true);
  const before=undo?p.target.after:"",after=undo?"":p.target.after;
  atomText(root,"@planner.before",before);atomText(root,"@planner.after",after);renderPlanDiff(root,before,after);
  diagnosticPanel(root).createEl("p",{text:`SHA-256: ${r.hashes.after}`,cls:"ai-pair-path"});
  for(const limit of p.provenance.analysis.limitations)root.createEl("p",{text:limit});
}
/** A private one-use ticket. Any observed change revokes it, including while the initial read is pending. */
export class EmptyAtomApplyModal extends Modal {
  private pending: Promise<void> = Promise.resolve();
  private active=false;private valid=false;private busy=false;private review?:EmptyAtomReview;
  private readonly cleanup:(()=>void)[]=[];
  constructor(app:App,private readonly service:EmptyAtomApply,private readonly prepare:(current:()=>boolean)=>Promise<EmptyAtomReview>,
    private readonly history:()=>void,private readonly release:()=>void=()=>{}){super(app);}
  onOpen():void {
    this.active=true;this.valid=true;this.modalEl.addClass("ai-pair-inspector-modal");this.contentEl.addClass("ai-change-planner","ai-empty-atom-apply");
    this.titleEl.setText(tr("@emptyAtom.review"));this.contentEl.createEl("p",{text:tr("@safeApply.checking"),attr:{role:"status"}});
    const invalidate=()=>{this.valid=false;if(this.review)this.service.discard(this.review);if(!this.busy)this.error(new SafeApplyError("stale"));};
    for(const ref of [this.app.vault.on("create",invalidate),this.app.vault.on("modify",invalidate),this.app.vault.on("delete",invalidate),this.app.vault.on("rename",invalidate)])this.cleanup.push(()=>this.app.vault.offref(ref));
    for(const ref of [this.app.metadataCache.on("changed",invalidate),this.app.metadataCache.on("resolved",invalidate)])this.cleanup.push(()=>this.app.metadataCache.offref(ref));
    this.pending=this.load();
  }
  private async load():Promise<void>{
    try{
      const review=await this.prepare(()=>this.active&&this.valid);
      if(!this.active||!this.valid){this.service.discard(review);return;}
      this.review=review;this.contentEl.empty();this.titleEl.setText(tr(review.action==="undo"?"@emptyAtom.undoReview":"@emptyAtom.review"));
      preview(this.contentEl,review.record,review.action==="undo");this.contentEl.createEl("p",{text:tr("@emptyAtom.closeScope")});
      button(this.contentEl,"confirm",()=>{if(!this.busy)this.pending=this.commit();}).setText(tr(review.action==="undo"?"@emptyAtom.undoConfirm":"@emptyAtom.confirm"));
      button(this.contentEl,"cancel",()=>this.close());focusStatus(this.contentEl);
    }catch(e){this.error(e);}
  }
  private error(e:unknown):void{
    if(!this.active)return;this.contentEl.empty();this.contentEl.createEl("p",{text:tr(`@safeApply.error.${e instanceof SafeApplyError?e.reason:"stale"}`),attr:{role:"alert"}});
    this.contentEl.createEl("p",{text:tr("@emptyAtom.failure")});button(this.contentEl,"history",()=>{this.close();void this.pending.then(this.history);});focusStatus(this.contentEl);
  }
  private async commit():Promise<void>{
    if(!this.active||!this.valid||this.busy||!this.review)return;
    this.busy=true;this.contentEl.empty();this.contentEl.createEl("p",{text:tr("@safeApply.working"),attr:{role:"status","aria-live":"polite"}}); focusStatus(this.contentEl);
    try{
      await this.service.execute(this.review);if(!this.active)return;
      this.contentEl.empty();this.contentEl.createEl("p",{text:tr(this.review.action==="apply"?"@emptyAtom.applied":"@emptyAtom.undone"),attr:{role:"status"}});button(this.contentEl,"history",()=>{this.close();void this.pending.then(this.history);});focusStatus(this.contentEl);
    }catch(e){this.error(e);}finally{this.busy=false;for(const off of this.cleanup.splice(0))off();}
  }
  onClose():void{this.active=false;this.valid=false;for(const off of this.cleanup.splice(0))off();if(this.review)this.service.discard(this.review);this.contentEl.empty();void this.pending.then(this.release);}
}
export function renderEmptyAtomHistory(root:HTMLElement,row:EmptyAtomHistory,review:()=>void):void{
  const card=root.createEl("section",{cls:"ai-semantic-result-card",attr:{"data-empty-atom-state":row.state,"data-operation-id":row.id}});
  historyHeading(card, tr("@emptyAtom.operation"), row.record ? [...row.record.plan.sources.map(n => n.path), row.record.plan.target.path] : [], row.record?.createdAt);
  card.createEl("p",{text:tr(`@safeApply.state.${row.state}`),attr:{role:"status"}});const diagnostic=diagnosticPanel(card,row.id);
  card.createEl("p",{text:tr(`@journal.source.${row.targetState}`)});
  if(row.recovered)card.createEl("p",{text:tr("@safeApply.recovered")});if(row.damaged)card.createEl("p",{text:tr("@safeApply.damaged")});
  if(!row.canUndo&&row.state!=="undone")card.createEl("p",{text:tr("@journal.manual")});
  if(row.editorBlocked)card.createEl("p",{text:tr("@safeApply.error.editor")});
  card.createEl("p",{text:tr(row.blocking?row.scope==="global"||!row.record?"@journal.scope.global":"@journal.scope.local":"@emptyAtom.completed")});
  for(const issue of row.issues)diagnostic.createEl("p",{text:issue});
  if(row.record){const details=card.createEl("details");details.createEl("summary",{text:tr("@safeApply.preview")});preview(details,row.record);}
  historyUnavailable(card,row.canUndo,row.state,row.editorBlocked||row.damaged);
  if(row.canUndo)button(card,"undoReview",review);
}
