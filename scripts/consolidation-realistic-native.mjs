// Native metadata and UI; completion transport alone is a scripted control, never a model result.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {sha256} from './consolidation-evaluation-metrics.mjs';
import {safeApplyHarness} from './safe-apply-native.mjs';

export async function realisticConsolidationScenario(context) {
  const {ev,wait,cdp,root,vault,ROOT,restart,focusMain}=context;
  const corpusBytes=fs.readFileSync(ROOT+'/tests/fixtures/consolidation-realistic-v1.json'),corpus=JSON.parse(corpusBytes);
  const h=safeApplyHarness(context),rows=[],cycles=[],checks=[],processPaths=[];
  const field=(selector,value)=>ev(`{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change'));}void 0`);
  const shot=async name=>fs.writeFileSync(root+'/realistic-'+name+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const check=async(name,expression)=>{assert(await ev(expression),name);checks.push(name);console.log(name);};
  const originals=new Map(corpus.cases.flatMap(c=>c.paths.map((p,i)=>[p,Buffer.from(c.notes[i])])));
  originals.set('References/Field register.md',Buffer.from('# Dating\n\nThis fictional register reports an uncertain date, not a verified attribution.\n'));
  originals.set('Realistic/Consumers/Guide.md',Buffer.from('---\nrelated: "[[Realistic/21/A/Note]]"\n---\n# Exercise guide\n\n![[Realistic/21/A/Note]]\n\n[[Realistic/10/B/Note]]\n'));
  const disk=()=>new Map([...originals.keys()].map(p=>[p,fs.readFileSync(vault+'/'+p)]));
  const journal=()=>Object.fromEntries(fs.readdirSync(vault+'/.obsidian/plugins/ai-knowledge-hub',{recursive:true})
    .filter(p=>p.startsWith('consolidation-')&&fs.statSync(vault+'/.obsidian/plugins/ai-knowledge-hub/'+p).isFile())
    .sort().map(p=>[p,sha256(fs.readFileSync(vault+'/.obsidian/plugins/ai-knowledge-hub/'+p))]));
  const report=()=>({status:'PASS',corpusSha256:sha256(corpusBytes),artifactSha256:sha256(fs.readFileSync(ROOT+'/main.js')),rows,cycles,checks,processPaths,
    limits:'Scripted completion controls; no model quality claim. Native Linux Obsidian, default themes, desktop 390px emulation. Timings exclude human reading, discovery ranking and external model latency. No paid calls, physical mobile or independent-process concurrency tests.'});
  await h.closeAll();await ev('app.workspace.getLeavesOfType("markdown").forEach(l=>l.detach());void 0');
  await ev(`window.corpusReady={seen:new Set(),resolved:false};corpusReady.ref=app.metadataCache.on('changed',f=>corpusReady.seen.add(f.path));corpusReady.done=app.metadataCache.on('resolved',()=>{if(corpusReady.seen.size>=${originals.size})corpusReady.resolved=true});void 0`);
  for(const[p,bytes]of originals){fs.mkdirSync(vault+'/'+p.slice(0,p.lastIndexOf('/')),{recursive:true});fs.writeFileSync(vault+'/'+p,bytes);}
  await wait('corpusReady.resolved');await ev('app.metadataCache.offref(corpusReady.ref);app.metadataCache.offref(corpusReady.done);void 0');
  const helpers=await build({absWorkingDir:ROOT,stdin:{resolveDir:ROOT,contents:`export {mergeBlockFailure,mergeHints} from './consolidation/mergePlan';export {paragraphRanges,requirePlainParagraph} from './consolidation/changePlan';`},bundle:true,write:false,format:'iife',globalName:'EvaluationHelpers',
    plugins:[{name:'unused-native-import',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'unused'}));b.onLoad({filter:/.*/,namespace:'unused'},()=>({contents:'export class TFile {}'}));}}]});
  const observe=async()=>{await ev(helpers.outputFiles[0].text);await ev(`window.realisticIO={process:[],other:0,completions:0};
    {const fn=app.vault.process.bind(app.vault);app.vault.process=(f,cb)=>{realisticIO.process.push(f.path);return fn(f,cb)}}
    for(const k of ['modify','create','delete','rename','append']){const fn=app.vault[k].bind(app.vault);app.vault[k]=(...a)=>{realisticIO.other++;return fn(...a)}}
    window.controlFactory=engine.relationshipSession;
    engine.relationshipSession=paths=>{const s=controlFactory(paths);s.deps.complete=async()=>{realisticIO.completions++;return JSON.stringify(window.controlResponse)};return s};
    Object.assign(plugin.settings,{provider:'custom',model:'offline-curated-control-NOT-a-model',apiKey:'synthetic-only',baseUrl:'https://example.invalid/v1'});void 0`);};
  await observe();
  const locale=async language=>{
    await h.closeAll();await ev('app.setting.open();app.setting.openTabById("ai-knowledge-hub");void 0');
    await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value=${JSON.stringify(language)};e.dispatchEvent(new Event('change'));}void 0`);
    await ev('plugin.settingsSave');await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await ev('app.setting.close();void 0');await focusMain();
  };
  let language;
  for(const c of corpus.cases) {
    if(language!==c.language){await locale(c.language);language=c.language;}else await h.closeAll();
    await focusMain();await ev(`window.controlResponse=${JSON.stringify(c.controlResponse)};void 0`);
    const before=disk(),beforeJournal=journal(),calls=await ev('realisticIO.completions'),processCount=await ev('realisticIO.process.length'),start=performance.now();
    await ev(`engine.inspectPair({leftPath:${JSON.stringify(c.paths[0])},rightPath:${JSON.stringify(c.paths[1])}})`);await wait("document.querySelectorAll('.ai-pair-note').length===2");
    await h.click('[data-relationship-action=analyze]');await wait("['consent','error'].includes(document.querySelector('[data-relationship-stage]')?.dataset.relationshipStage)");
    const row={id:c.id,title:c.title,language:c.language,analysis:false,mergePlan:false,paragraphs:[],desired:[],confirmations:0};rows.push(row);
    if(await ev("document.querySelector('[data-relationship-stage]').dataset.relationshipStage==='error'")) {
      row.refusal=await ev('[...engine.pairInspectors].at(-1).relationship.view.error');assert.equal(c.id,'18');assert.equal(row.refusal,'tooLarge');assert.equal(await ev('realisticIO.completions'),calls);await shot('input-limit-'+c.id);
    } else {
      await h.click('[data-relationship-action=confirm]');row.confirmations++;
      await wait("document.querySelector('[data-relationship-stage]')?.dataset.relationshipStage==='result'");row.analysis=true;
      await h.click('[data-planner-action=open]');await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='choosing'");
      await field('[data-planner-field=operation]','merge_knowledge');await field('[data-planner-field=merge-canonical]',c.gold.canonical);
      const metrics=await ev(`(()=>{const p=[...engine.pairInspectors].at(-1).planner;const pair=p.view.input.pair,side=${1-c.gold.canonical},hints=EvaluationHelpers.mergeHints(p.analysis.result,pair);
        return {paragraphs:EvaluationHelpers.paragraphRanges(pair[side]).map(r=>({...r,failure:EvaluationHelpers.mergeBlockFailure(pair[side],r,hints,side)??null})),
          anchors:EvaluationHelpers.paragraphRanges(pair[1-side]).map((r,index)=>{try{EvaluationHelpers.requirePlainParagraph(pair[1-side],r);return index}catch{return null}}).filter(x=>x!==null),
          nonParagraphSections:(pair[side].cache?.sections??[]).filter(s=>s.type!=='paragraph').map(s=>s.type),
          dependencies:pair.map(n=>({path:n.path,references:n.references,incoming:app.metadataCache.resolvedLinks?Object.keys(app.metadataCache.resolvedLinks).filter(p=>app.metadataCache.resolvedLinks[p][n.path]):null}))};})()`);
      Object.assign(row,metrics);row.desired=c.gold.desiredTransfers.map(text=>{const p=metrics.paragraphs.find(r=>r.text===text);return {text,start:p?.start??null,failure:p?p.failure:'not-paragraph'};});
      const selectable=row.desired.length&&row.desired.every(d=>!d.failure)&&row.anchors.length;
      if(selectable){
        for(const d of row.desired){await h.click(`[data-planner-field=merge-transfer-${d.start}]`);row.confirmations++;}
        await field('[data-planner-field=merge-location]',row.anchors[0]);await h.click('[data-planner-field=merge-confirm]');row.confirmations++;
        await h.click('[data-merge-action=build]');await wait("['ready','error'].includes(document.querySelector('[data-planner-stage]')?.dataset.plannerStage)");
        row.mergePlan=await ev("document.querySelector('[data-planner-stage]').dataset.plannerStage==='ready'");
        if(!row.mergePlan)row.refusal=await ev('[...engine.pairInspectors].at(-1).planner.view.mergeError');
      }else row.refusal=row.desired.length?[...new Set(row.desired.map(d=>d.failure).filter(Boolean))].join(','):'no-reference-transfer-intent';
      if(c.gold.neverMerge&&row.anchors.length&&row.paragraphs.some(p=>!p.failure)){
        const p=row.paragraphs.find(p=>!p.failure);
        await h.click(`[data-planner-field=merge-transfer-${p.start}]`);await field('[data-planner-field=merge-location]',row.anchors[0]);await h.click('[data-planner-field=merge-confirm]');await h.click('[data-merge-action=build]');
        await wait("['ready','error'].includes(document.querySelector('[data-planner-stage]')?.dataset.plannerStage)");
        row.manualOverrideProbe=await ev("(()=>{const v=[...engine.pairInspectors].at(-1).planner.view;return {stage:v.stage,reason:v.mergeError??null}})()");
      }
      assert.equal(await ev('realisticIO.completions'),calls+1);
      if(['05','07','11','19','23'].includes(c.id)){await ev("document.querySelector('[data-planner-field=merge-canonical]').scrollIntoView({block:'start'});void 0");await shot('refusal-'+c.id);}
    }
    row.automatedPairToPlanOrRefusalMs=Math.round(performance.now()-start);
    assert.deepEqual(disk(),before);assert.deepEqual(journal(),beforeJournal);assert.equal(await ev('realisticIO.other'),0);assert.equal(await ev('realisticIO.process.length'),processCount);
    checks.push(c.id+': analyzer/planner leave all Markdown and journals unchanged');
    if(c.gold.fullCycle){assert(row.mergePlan,c.id+': intended success');await fullCycle(c,row);}
    fs.writeFileSync(root+'/realistic-progress.json',JSON.stringify(report(),null,2)+'\n');console.log(c.id+': '+(row.mergePlan?'plan ready':row.refusal));
  }
  assert.deepEqual(disk(),originals);assert.deepEqual(processPaths,cycles.flatMap(c=>[c.canonical,c.secondary,c.secondary,c.canonical]));
  await check('All realistic notes and consumers restored byte-for-byte; no network','io.network===0&&realisticIO.other===0');
  return report();

  async function fullCycle(c,row) {
    const plan=await ev('[...engine.pairInspectors].at(-1).planner.view.mergePlan'), cycle={id:c.id,canonical:plan.canonical.path,secondary:plan.secondary.path,
      before:c.notes,merged:plan.canonical.after,preservation:[],confirmations:row.confirmations};cycles.push(cycle);
    const before=disk(),priorJournal=journal(),calls=await ev('realisticIO.completions');
    await h.click('[data-merge-apply-action=review]');await wait("!!document.querySelector('.ai-merge-apply [data-merge-apply-action=confirm]')");assert.deepEqual(disk(),before);assert.deepEqual(journal(),priorJournal);
    await h.click('.ai-merge-apply [data-merge-apply-action=confirm]');cycle.confirmations++;
    await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-merge-apply [data-merge-apply-action=history]')");
    assert.equal(fs.readFileSync(vault+'/'+plan.canonical.path,'utf8'),plan.canonical.after);assert.equal(fs.readFileSync(vault+'/'+plan.secondary.path,'utf8'),plan.secondary.content);
    const parentId=await ev(`(async()=> (await plugin.safeApply.merge.journal.entries()).find(e=>e.record?.canonical.path===${JSON.stringify(plan.canonical.path)})?.id)()`);assert(parentId);cycle.mergeOperationId=parentId;
    await h.history();await h.click(`[data-operation-id="${parentId}"] [data-archive-action=open]`);await wait("document.querySelector('[data-archive-stage]')?.dataset.archiveStage==='choosing'");
    const fragments=await ev("document.querySelectorAll('[data-archive-fragment]').length");
    // Keep every residual fragment in the secondary; no claim of redundancy is needed for in-place status.
    for(let i=0;i<fragments;i++){await field(`[data-archive-fragment="${i}"]`,'retained');cycle.confirmations++;}
    await field('[data-archive-status]','archived');await h.click('[data-archive-ack]');cycle.confirmations++;await h.click('[data-archive-action=build]');await wait("document.querySelector('[data-archive-stage]')?.dataset.archiveStage==='ready'");
    const archive=await ev("JSON.parse(document.querySelector('[data-archive-text=json]').textContent)");cycle.archived=archive.secondary.after;cycle.preservation=archive.preservation;cycle.dependencies=archive.dependencies;
    const parentEvidence=Object.fromEntries(Object.entries(journal()).filter(([p])=>p.startsWith('consolidation-merge-operations/'))),beforeArchive=disk(),beforeReview=journal();
    await h.click('[data-archive-action=applyReview]');await wait("!!document.querySelector('.ai-archive-apply [data-archive-apply-action=confirm]')");assert.deepEqual(disk(),beforeArchive);assert.deepEqual(journal(),beforeReview);
    await check(c.id+': exact full Archive before/after and diff',`document.querySelector('.ai-archive-apply [data-archive-apply-text=before]').textContent===${JSON.stringify(archive.secondary.before)}&&document.querySelector('.ai-archive-apply [data-archive-apply-text=after]').textContent===${JSON.stringify(archive.secondary.after)}&&!!document.querySelector('.ai-archive-apply .ai-proposal-diff')`);
    if(['03','21'].includes(c.id))for(const theme of ['theme-light','theme-dark'])for(const width of [1200,390]){
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');document.querySelector('.ai-archive-apply').scrollTop=0;void 0`);
      await check(`${c.language} ${theme} ${width}: full consent fits`,"[...document.querySelectorAll('.ai-archive-apply,.ai-archive-apply pre,.ai-archive-apply .ai-proposal-diff')].every(e=>e.scrollWidth<=e.clientWidth+1)");await shot(`${c.language}-${theme}-${width}`);
    }
    await ev("document.querySelector('.ai-archive-apply .ai-proposal-diff').scrollIntoView({block:'center'});void 0");await shot('diff-'+c.id);
    await ev("document.querySelector('.ai-archive-apply [data-archive-apply-action=confirm]').focus();void 0");await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});cycle.confirmations++;
    await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-archive-apply [data-archive-apply-action=history]')");
    assert.equal(fs.readFileSync(vault+'/'+plan.secondary.path,'utf8'),archive.secondary.after);assert.equal(fs.readFileSync(vault+'/'+plan.canonical.path,'utf8'),plan.canonical.after);
    const archiveId=await ev(`(async()=> (await plugin.safeApply.archive.journal.entries()).find(e=>e.record?.plan.provenance.id===${JSON.stringify(parentId)})?.id)()`);assert(archiveId);cycle.archiveOperationId=archiveId;
    assert.equal(await ev('realisticIO.completions'),calls);processPaths.push(...await ev('realisticIO.process'));await check(c.id+': before restart network tripwire is zero','io.network===0');
    await restart();await observe();await h.history();cycle.restarts=1;
    await check(c.id+': active archive blocks Merge Undo',`!document.querySelector('[data-operation-id="${parentId}"] [data-merge-apply-action=undoReview]')`);
    await h.click(`[data-operation-id="${archiveId}"] [data-archive-apply-action=undoReview]`);await wait("!!document.querySelector('.ai-archive-apply [data-archive-apply-action=confirm]')");await shot('undo-'+c.id);
    await h.click('.ai-archive-apply [data-archive-apply-action=confirm]');cycle.confirmations++;await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-archive-apply [data-archive-apply-action=history]')");
    assert.equal(fs.readFileSync(vault+'/'+plan.secondary.path,'utf8'),plan.secondary.content);
    assert.deepEqual(Object.fromEntries(Object.entries(journal()).filter(([p])=>p.startsWith('consolidation-merge-operations/'))),parentEvidence);
    processPaths.push(...await ev('realisticIO.process'));await check(c.id+': Undo network tripwire is zero','io.network===0');await restart();await observe();await h.history();cycle.restarts++;
    await h.click(`[data-operation-id="${parentId}"] [data-merge-apply-action=undoReview]`);await wait("!!document.querySelector('.ai-merge-apply [data-merge-apply-action=confirm]')");await h.click('.ai-merge-apply [data-merge-apply-action=confirm]');cycle.confirmations++;
    await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-merge-apply [data-merge-apply-action=history]')");assert.deepEqual(disk(),before);
    const writes=await ev('realisticIO.process');processPaths.push(...writes);await ev('realisticIO.process=[];void 0');
    cycle.originalSha256=c.paths.map(p=>sha256(originals.get(p)));cycle.restoredSha256=c.paths.map(p=>sha256(fs.readFileSync(vault+'/'+p)));cycle.byteExact=true;
    await check(c.id+': restarted Archive Undo → Merge Undo restores every original','realisticIO.completions===0&&realisticIO.other===0&&io.network===0');
    await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
  }
}
