import { TFile } from "obsidian";
import type { App } from "obsidian";
import type { PlanNote, PlanPair } from "./changePlan";
import type { SafeApplyPort } from "./safeApply";
import type { AtomParticipants, EmptyAtomPort } from "./emptyAtomApply";
import type { AtomizationPlanV2 } from "./emptyAtomPlan";
import { atomCanonical, atomEvidence, atomMetadata, buildEmptyAtomPlan, validateEmptyAtomPlan } from "./emptyAtomPlan";
import { atomKey, validateAtomizationPath } from "./atomizationPlan";
import { readAtomizationObservation, verifyEmptyNote } from "./obsidianAtomization";
import { readPlannerPair } from "./changePlannerSession";
import { guardMergePair, readMergeIncoming } from "./obsidianMergeApply";
import { sameSavedNote } from "./savedNote";
import { checksum, requireSafe } from "./operationJournal";
import { groupHeadings } from "./groupStructure";

/** Public Vault APIs only; the exclusive-create experiment is intentionally not a dependency. */
export function obsidianEmptyAtomPort(app: App, port: SafeApplyPort): EmptyAtomPort {
  const files = () => app.vault.getAllLoadedFiles().slice().sort((a,b)=>a.path.localeCompare(b.path));
  const stamp = () => atomCanonical({ files: files().map(f=>({path:f.path,...(f instanceof TFile?{stat:{...f.stat},metadata:app.metadataCache.getFileCache(f)}:{})})),
    resolved: app.metadataCache.resolvedLinks, unresolved: app.metadataCache.unresolvedLinks, configDir: app.vault.configDir });
  const read = async (paths: readonly [string,string], destination: string, side: 0|1, empty: boolean, pinned?: AtomParticipants) => {
    validateAtomizationPath(destination,app.vault.configDir);
    const initial=stamp(), identities=files();
    const {pair}=await readPlannerPair(app,paths), saved=await port.read(destination);
    requireSafe(saved && saved.file instanceof TFile && !pair.some(n=>n.file===saved.file || n.path===saved.path),"stale");
    const cache=app.metadataCache.getFileCache(saved.file);
    requireSafe(cache,"stale");
    const target:PlanNote={...saved,created:saved.file.stat.ctime,cache:JSON.parse(JSON.stringify(cache)) as PlanNote["cache"],references:[]};
    const notes:AtomParticipants=[target,pair[0],pair[1]];
    if(pinned)requireSafe(notes.every((n,i)=>sameSavedNote(n,pinned[i]) && n.created===pinned[i].created && atomCanonical(n.cache)===atomCanonical(pinned[i].cache)),"stale");
    const proof=empty?await verifyEmptyNote(app,target.file):null;
    requireSafe(!empty || target.content==="" && target.bytes===0 && proof,"stale");
    for(const n of notes){
      const stat=await app.vault.adapter.stat(n.path);
      requireSafe(stat?.type==="file" && stat.ctime===n.created && stat.mtime===n.modified && stat.size===n.bytes && n.bytes===new TextEncoder().encode(n.content).length,"stale");
    }
    const observation=await readAtomizationObservation(app,destination,pair[side].path);
    requireSafe(!observation.absent && observation.parentExists && observation.metadataComplete && observation.sourceLink===pair[side].path.slice(0,-3) &&
      !observation.linkConflicts.filter(p=>p!==destination).length,"stale");
    const key=atomKey(destination),basename=key.split("/").pop()!.slice(0,-3);
    requireSafe(!observation.inventory.some(f=>f.path!==destination && (atomKey(f.path)===key || !f.folder && atomKey(f.path).split("/").pop()!.replace(/\.[^.]+$/u,"")===basename)),"stale");
    // Target's own expected write changes its metadata/outgoing link. All other observations must survive Undo.
    const inventory=files().filter(f=>f.path!==destination).map(f=>({path:f.path,...(f instanceof TFile?{stat:{...f.stat},metadata:atomMetadata(app.metadataCache.getFileCache(f))}:{folder:true})}));
    const dependencies=JSON.parse(JSON.stringify(observation.dependencies)) as {resolved:Record<string,unknown>;unresolved:Record<string,unknown>};
    delete dependencies.resolved[destination];delete dependencies.unresolved[destination];
    const dependencyHash=await checksum(atomCanonical({inventory,dependencies}));
    const pairGuard=guardMergePair(app,port,pair,readMergeIncoming(app,paths));
    const guard=()=>{
      requireSafe(initial===stamp() && files().length===identities.length && files().every((f,i)=>f===identities[i]),"stale");
      pairGuard();port.guard(target);
      requireSafe(target.file.stat.ctime===target.created && app.metadataCache.getFirstLinkpathDest(observation.sourceLink,destination)===pair[side].file,"stale");
      if(proof)requireSafe(proof.guard(),"stale");
    };
    guard();
    return {notes,pair,target,guard,observation:{configDir:app.vault.configDir,sourceLink:observation.sourceLink,dependencyHash}};
  };
  const originalSources = (plan:AtomizationPlanV2, pair:PlanPair) => requireSafe(pair.every((n,i)=>atomCanonical(atomEvidence(n))===atomCanonical(plan.sources[i])),"conflict");
  const filled = (plan:AtomizationPlanV2,target:PlanNote) => {
    const link=`[[${plan.observation.sourceLink}]]`,links=target.cache?.links;
    requireSafe(target.cache && Object.keys(target.cache).every(key=>["v","sections","headings","links"].includes(key)),"conflict");
    groupHeadings(target);
    requireSafe(target.content===plan.target.after && target.created===plan.target.created && target.cache?.sections?.length &&
      links?.length===1 && links[0].original===link && links[0].link===plan.observation.sourceLink &&
      links[0].position.start.offset===target.content.lastIndexOf(link) && links[0].position.end.offset===target.content.lastIndexOf(link)+link.length,"conflict");
  };
  const plan:EmptyAtomPort["plan"]=async(analysis,choice)=>{
    requireSafe(choice.side===0||choice.side===1,"stale");
    const checked=await read([analysis.pair[0].path,analysis.pair[1].path],choice.path,choice.side,true);
    const result=buildEmptyAtomPlan(analysis,checked.pair,checked.target,choice,checked.observation);
    checked.guard();return {plan:result,checked};
  };
  return {
    plan,
    async check(value,analysis,pinned){
      requireSafe(value.version===2 && (value.confirmations.side===0||value.confirmations.side===1),"stale");
      const checked=await read([analysis.pair[0].path,analysis.pair[1].path],value.target.path,value.confirmations.side,true,pinned);
      validateEmptyAtomPlan(value,analysis,checked.pair,checked.target,value.confirmations,checked.observation);
      const analysisStamp=atomCanonical({provider:analysis.provider,model:analysis.model,result:analysis.result});
      const guard=()=>{checked.guard();requireSafe(analysisStamp===atomCanonical({provider:analysis.provider,model:analysis.model,result:analysis.result}),"stale");
        validateEmptyAtomPlan(value,analysis,checked.pair,checked.target,value.confirmations,checked.observation);};
      guard();return {notes:checked.notes,guard};
    },
    async undo(record,pinned){
      const p=record.plan,checked=await read([p.sources[0].path,p.sources[1].path],p.target.path,p.confirmations.side!,false,pinned);
      originalSources(p,checked.pair);filled(p,checked.target);
      requireSafe(atomCanonical(checked.observation)===atomCanonical(p.observation),"conflict");
      checked.guard();return checked;
    },
    async finish(record,before,forward){
      const p=record.plan;let failure:unknown;
      // Obsidian may publish MetadataCache after process resolves. Only read while waiting; never retry a write.
      for(let attempt=0;attempt<80;attempt++){
        try{
          const checked=await read([p.sources[0].path,p.sources[1].path],p.target.path,p.confirmations.side!,!forward);
          requireSafe(checked.notes.every((n,i)=>n.file===before[i].file && n.created===before[i].created),"conflict");
          originalSources(p,checked.pair);
          if(forward)filled(p,checked.target);else requireSafe(checked.target.content==="" && checked.target.bytes===0,"conflict");
          requireSafe(atomCanonical(checked.observation)===atomCanonical(p.observation),"conflict");
          checked.guard();return checked;
        }catch(e){failure=e;}
        await new Promise(resolve=>window.setTimeout(resolve,25));
      }
      throw failure;
    },
  };
}
