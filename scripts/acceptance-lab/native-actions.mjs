import fs from 'node:fs';
import assert from 'node:assert/strict';
import {sha} from './generate.mjs';

// Local completion fixtures enter the real contract. All writes and Undo use native review controls.
export async function labActions(c) {
  const {ev,wait,cdp,shot,pass,manifest,report,vault,root,click,field,planner,history,restart,close,locale}=c;
  const snapshot=()=>Object.fromEntries(manifest.notes.map(n=>[n.path,sha(fs.readFileSync(vault+'/'+n.path))]));
  const initial=snapshot();report.actions=[];
  const select=async(key,index=1)=>field(key,await ev(`document.querySelector('[data-planner-field="${key}"]').options[${index}].value`));
  const choose=async(selector,value)=>ev(`{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing selector');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change'));}void 0`);
  const checkbox=key=>click(`[data-planner-field="${key}"]`);
  const ready=async()=>{await wait("labPlanner.view.stage!=='loading'");assert.equal(await ev('labPlanner.view.stage'),'ready',JSON.stringify(await ev('({stage:labPlanner.view.stage,error:labPlanner.view.error})')));};
  const noChangeExcept=allowed=>{const after=snapshot();for(const[p,h]of Object.entries(initial))if(!allowed.includes(p))assert.equal(after[p],h,p);};
  const configs={
    single:{modal:'.ai-safe-apply',attr:'data-safe-action',review:'[data-safe-action=review]',service:'',undo:'undo',undoConfirm:'undoConfirm',state:'safeState'},
    multi:{modal:'.ai-multi-apply',attr:'data-multi-action',review:'[data-multi-action=review]',service:'.multi',undo:'action.undo',state:'multiState'},
    merge:{modal:'.ai-merge-apply',attr:'data-merge-apply-action',review:'[data-merge-apply-action=review]',service:'.merge',undo:'undoReview',state:'mergeState'},
    group:{modal:'.ai-group-apply',attr:'data-group-apply-action',review:'[data-group-apply-action=review]',service:'.group',undo:'undoReview',state:'groupState'},
    bundle:{modal:'.ai-bundle-apply',attr:'data-bundle-apply-action',review:'[data-bundle-apply-action=review]',service:'.bundle',undo:'undoReview',state:'bundleState'},
    empty_atom:{modal:'.ai-empty-atom-apply',attr:'data-empty-atom-apply',review:'[data-empty-atom-action=review]',service:'.emptyAtom',undo:'undoReview',state:'emptyAtomState'},
    archive:{modal:'.ai-archive-apply',attr:'data-archive-apply-action',review:'[data-archive-action=applyReview]',service:'.archive',undo:'undoReview',state:'archiveState'},
    structural:{modal:'.ai-structural-archive-apply',attr:'data-structural-archive-action',review:'[data-structural-archive-action=review]',service:'.structuralArchive',undo:'undoReview',state:'structuralArchiveState',ack:'[data-structural-archive-ack]'}
  };
  const reviewReady=async cfg=>{await wait(`!plugin.safeApply.busy&&!!document.querySelector('${cfg.modal} [${cfg.attr}=confirm],${cfg.modal} [${cfg.attr}=undoConfirm],${cfg.modal} [role=alert]')`);assert(!await ev(`document.querySelector('${cfg.modal} [role=alert]')?.textContent`),await ev(`document.querySelector('${cfg.modal}')?.textContent`));};
  const finish=async(cfg,undo=false)=>{if(cfg.ack)await click(cfg.ack);await click(`${cfg.modal} [${cfg.attr}=${undo?(cfg.undoConfirm??'confirm'):'confirm'}]`);await wait(`!plugin.safeApply.busy&&!!document.querySelector('${cfg.modal} [${cfg.attr}=history]')`);assert(!await ev(`document.querySelector('${cfg.modal} [role=alert]')?.textContent`));};
  const undo=async(cfg,id)=>{await history();await click(`[data-operation-id="${id}"] [${cfg.attr}="${cfg.undo}"]`);await reviewReady(cfg);const before=snapshot();await shot('undo-'+id);assert.deepEqual(snapshot(),before);await finish(cfg,true);};
  const review=async(cfg,label)=>{
    const before=snapshot(),writes=await ev('io.process.length');await click(cfg.review);await reviewReady(cfg);
    const id=await ev(`[...plugin.safeApply${cfg.service}.tickets.keys()].at(-1).id`);assert(id);
    for(const theme of ['theme-light','theme-dark'])for(const width of [1650,390]) {
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:920,deviceScaleFactor:1,mobile:false});await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');document.querySelector('${cfg.modal}').scrollTop=0;void 0`);
      await pass(`${label} ${theme} ${width}: review fits, sticky actions remain reachable`, `(()=>{const e=document.querySelector('${cfg.modal}'),b=e.querySelector('[${cfg.attr}=confirm]'),r=b.getBoundingClientRect();return e.scrollWidth<=e.clientWidth+1&&r.bottom<=innerHeight&&r.top>=0&&!/@(?:safeApply|multiSafe|mergeApply|groupApply|bundleApply|emptyAtomApply|archiveApply)\./.test(e.textContent)})()`);
      await shot(`${label}-${theme}-${width}`);
    }
    assert.deepEqual(snapshot(),before);assert.equal(await ev('io.process.length'),writes);return id;
  };
  const archive=async(parentKind,parentId,parentPlan)=>{
    const structural=parentKind!=='merge',cfg=configs[structural?'structural':'archive'],before=snapshot();
    await history();await click(`[data-operation-id="${parentId}"] [${structural?'data-archive-v2-action':'data-archive-action'}=open]`);await wait("document.querySelector('[data-archive-stage]')?.dataset.archiveStage==='choosing'");
    const count=await ev("document.querySelectorAll('[data-archive-fragment]').length");
    // Uncopied material stays in the secondary note; no claim of semantic completeness.
    for(let i=0;i<count;i++)await choose(`[data-archive-fragment="${i}"]`,'retained');
    await choose('[data-archive-status]','archived');await click('[data-archive-ack]');if(structural)await click('[data-archive-unknown]');await click('[data-archive-action=build]');await wait("['ready','error','stale'].includes(document.querySelector('[data-archive-stage]')?.dataset.archiveStage)");
    assert.equal(await ev("document.querySelector('[data-archive-stage]').dataset.archiveStage"),'ready');
    const plan=await ev("JSON.parse(document.querySelector('[data-archive-text=json]').textContent)");fs.writeFileSync(root+'/archive-'+parentKind+'-plan.json',JSON.stringify(plan,null,2));assert.deepEqual(snapshot(),before);
    const id=await review(cfg,'archive-'+parentKind);await finish(cfg);assert.equal(fs.readFileSync(vault+'/'+plan.secondary.path,'utf8'),plan.secondary.after);assert.equal(fs.readFileSync(vault+'/'+parentPlan.canonical.path,'utf8'),parentPlan.canonical.after);
    await restart();assert.equal(fs.readFileSync(vault+'/'+plan.secondary.path,'utf8'),plan.secondary.after);await history();
    await wait(`!!document.querySelector('[data-operation-id="${id}"]')`);
    await pass('Archive '+parentKind+' survives restart and blocks parent Undo',`!!document.querySelector('[data-operation-id="${parentId}"]')&&!document.querySelector('[data-operation-id="${parentId}"] [${configs[parentKind].attr}=undoReview]')&&io.process.length===0`);
    await undo(cfg,id);assert.deepEqual(snapshot(),before);await pass('Archive '+parentKind+' Undo restores exact secondary Markdown');report.actions.push({kind:'archive-'+parentKind,id,result:'PASS'});
  };
  for(const language of ['en','ru']) {
    await locale(language);
    for(const kind of ['single','multi','merge','group','bundle','atomization','empty_atom','refusal']) {
      const s=manifest.scenarios.find(s=>s.id===kind);assert(s);await planner(s);const modelCalls=await ev('io.model');
      if(kind==='single') {await field('operation','add_link');await field('range','0');await checkbox('confirm');await click('[data-planner-action=build]');}
      if(kind==='multi') {await field('operation','add_reciprocal_links');await field('range-0','1');await field('range-1','0');await checkbox('confirm-0');await checkbox('confirm-1');await click('[data-planner-action=buildMulti]');}
      if(kind==='merge') {await field('operation','merge_knowledge');await field('merge-canonical','0');await checkbox(await ev("[...document.querySelectorAll('[data-planner-field^=merge-transfer-]')][1].dataset.plannerField"));await field('merge-location','0');await checkbox('merge-confirm');await click('[data-merge-action=build]');}
      if(kind==='group') {await field('operation','copy_context_group');await field('group-canonical','0');await select('group-selection',3);await checkbox('group-groupConfirmed');await field('group-representation','original_heading_branch');await checkbox('group-contextConfirmed');await field('group-dependencies','reviewed');await field('group-insertion',await ev('labPlanner.view.input.pair[0].content.length'));await checkbox('group-insertionConfirmed');await click('[data-group-action=build]');}
      if(kind==='bundle') {await field('operation','copy_context_bundle');await field('bundle-canonical','0');await field('bundle-kind','code_explanation');await select('bundle-selection');for(const key of await ev("[...document.querySelectorAll('[data-planner-field^=bundle-context-]')].map(e=>e.dataset.plannerField)"))await checkbox(key);await checkbox('bundle-boundariesConfirmed');await checkbox('bundle-contextConfirmed');await field('bundle-dependencies','reviewed');await field('bundle-insertion',await ev('labPlanner.view.input.pair[0].content.length'));await checkbox('bundle-insertionConfirmed');await click('[data-bundle-action=build]');}
      if(['atomization','empty_atom'].includes(kind)) {
        const prefix=kind==='atomization'?'atom':'empty';await field('operation',kind==='atomization'?'atomization_preview':'write_atom_to_empty_note');await field(prefix+'-source','0');await select(prefix+'-selection');
        if(prefix==='empty')await field('empty-target',s.target);else await field('atom-path','Лаборатория/Предпросмотр без создания.md','input');await field(prefix+'-title','Часовой пояс в отчёте','input');
        for(const key of await ev(`[...document.querySelectorAll('[data-planner-field^=${prefix}-][type=checkbox]')].map(e=>e.dataset.plannerField)`))await checkbox(key);
        await click(`[data-${prefix==='atom'?'atom':'empty-atom'}-action=build]`);
      }
      if(kind==='refusal') {
        await field('operation','copy_context_group');await field('group-canonical','0');
        await pass(language+' unsupported structure refuses Group before selection or Apply',"document.querySelector('[data-group-action=build]').disabled&&!document.querySelector('[data-planner-field=group-selection]')&&!document.querySelector('[data-group-apply-action=review]')");await shot('refusal-'+language);assert.deepEqual(snapshot(),initial);report.actions.push({language,kind,result:'REFUSED_AS_EXPECTED',reason:'Native MetadataCache cannot establish exact structural coverage'});continue;
      }
      await ready();assert.deepEqual(snapshot(),initial);const key=({single:'plan',multi:'multiPlan',merge:'mergePlan',group:'groupPlan',bundle:'bundlePlan',atomization:'atomizationPlan',empty_atom:'emptyAtomPlan'})[kind];const plan=await ev(`JSON.parse(JSON.stringify(labPlanner.view.${key},(k,v)=>k==='file'?undefined:v))`);assert(plan);fs.writeFileSync(root+'/'+language+'-'+kind+'-plan.json',JSON.stringify(plan,null,2));
      if(kind==='atomization'){await pass(language+' Atomization Preview creates no file',"!!document.querySelector('[data-atom-plan]')&&!document.querySelector('[data-empty-atom-action=review]')");assert.deepEqual(snapshot(),initial);await shot('atomization-'+language);report.actions.push({language,kind,result:'PREVIEW_ONLY'});continue;}
      const cfg=configs[kind],id=await review(cfg,language+'-'+kind);await finish(cfg);
      if(kind==='single')assert.equal(fs.readFileSync(vault+'/'+plan.sourcePath,'utf8'),plan.after);
      else if(kind==='multi')for(const f of plan.files)assert.equal(fs.readFileSync(vault+'/'+f.path,'utf8'),f.after);
      else if(kind==='empty_atom')assert.equal(fs.readFileSync(vault+'/'+plan.target.path,'utf8'),plan.target.after);
      else {assert.equal(fs.readFileSync(vault+'/'+plan.canonical.path,'utf8'),plan.canonical.after);assert.equal(fs.readFileSync(vault+'/'+plan.secondary.path,'utf8'),plan.secondary.content);}
      noChangeExcept(kind==='multi'?s.paths:[kind==='single'?plan.sourcePath:kind==='empty_atom'?plan.target.path:plan.canonical.path]);
      await pass(language+' '+kind+' real Apply writes only allowed paths without extra model calls',`io.model===${modelCalls}&&io.network===0`);
      if(language==='en'&&['merge','group','bundle'].includes(kind))await archive(kind,id,plan);
      if(kind==='multi'){const before=snapshot();await restart();assert.deepEqual(snapshot(),before);await pass(language+' Multi Apply survives restart without automatic writes','io.process.length===0');}
      await undo(cfg,id);assert.deepEqual(snapshot(),initial);await pass(language+' '+kind+' explicit Undo restores all 1000 files byte for byte');report.actions.push({language,kind,id,result:'APPLY_UNDO_PASS'});
    }
  }
  await close();await cdp('Emulation.clearDeviceMetricsOverride');
}
