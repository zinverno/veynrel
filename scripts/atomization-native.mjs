// Native synthetic acceptance. Scripted Analyzer transport is explicitly not model-quality evidence.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {sha256} from './consolidation-evaluation-metrics.mjs';
import {safeApplyHarness} from './safe-apply-native.mjs';

export async function atomizationScenario(context) {
  const {ev,wait,cdp,focusMain,root,vault,ROOT,paths}=context,h=safeApplyHarness(context),checks=[],rows=[],uiPlans=[];
  const fixture=JSON.parse(fs.readFileSync(ROOT+'/tests/fixtures/atomization-v1.json'));
  const comparison='An amber envelope marks a pending trial.',comparisonPath='Atomization/Comparison.md';
  const files=new Map(fixture.cases.map(c=>['Atomization/'+c.id+'.md',c.text]));
  files.set(comparisonPath,comparison);files.set('Atomization/Occupied.md','An existing note.');
  files.set('Atomization/Linker.md','[[Future atom]]\n\n[[Nested/Other atom#Scope]]\n\n[[Percent%20atom]]');
  const disk=()=>Object.fromEntries(fs.readdirSync(vault,{recursive:true}).filter(p=>p.endsWith('.md')||/consolidation-/.test(p)).filter(p=>fs.statSync(vault+'/'+p).isFile()).sort().map(p=>[p,sha256(fs.readFileSync(vault+'/'+p))]));
  await h.closeAll();await ev('app.workspace.getLeavesOfType("markdown").forEach(l=>l.detach());void 0');
  await ev(`window.atomCache={seen:new Set(),resolved:false};atomCache.changed=app.metadataCache.on('changed',f=>atomCache.seen.add(f.path));atomCache.done=app.metadataCache.on('resolved',()=>{if(atomCache.seen.size>=${files.size})atomCache.resolved=true});void 0`);
  for(const[p,text]of files){fs.mkdirSync(vault+'/'+p.slice(0,p.lastIndexOf('/')),{recursive:true});fs.writeFileSync(vault+'/'+p,text)}
  fs.mkdirSync(vault+'/Atoms');
  await wait('atomCache.resolved');await ev('app.metadataCache.offref(atomCache.changed);app.metadataCache.offref(atomCache.done);void 0');
  const before=disk();
  const helpers=await build({absWorkingDir:ROOT,stdin:{resolveDir:ROOT,contents:"export {atomizationCandidates} from './consolidation/atomizationPlan';"},bundle:true,write:false,format:'iife',globalName:'AtomHelpers',plugins:[{name:'unused',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'unused'}));b.onLoad({filter:/.*/,namespace:'unused'},()=>({contents:'export class TFile {}'}));}}]});
  await ev(helpers.outputFiles[0].text);
  await ev(`window.atomOriginal={factory:engine.relationshipSession,settings:{provider:plugin.settings.provider,model:plugin.settings.model,apiKey:plugin.settings.apiKey,baseUrl:plugin.settings.baseUrl},adapter:{},rename:app.vault.rename};window.atomIO={journals:0,markdown:0,completions:0};
    for(const key of ['write','writeBinary','append','copy','rename','remove','mkdir','rmdir']){atomOriginal.adapter[key]=app.vault.adapter[key];app.vault.adapter[key]=function(...args){if(args.some(a=>typeof a==='string'&&/consolidation-/.test(a)))atomIO.journals++;if(args.some(a=>typeof a==='string'&&/\\.md$/i.test(a)))atomIO.markdown++;return atomOriginal.adapter[key].apply(this,args)}}
    app.vault.rename=function(...args){io.write++;return atomOriginal.rename.apply(this,args)};
    engine.relationshipSession=paths=>{const s=atomOriginal.factory(paths);s.deps.complete=async()=>{atomIO.completions++;return JSON.stringify(window.atomResponse)};return s};
    Object.assign(plugin.settings,{provider:'custom',model:'offline-control-NOT-a-model',apiKey:'synthetic-only',baseUrl:'https://example.invalid/v1'});void 0`);
  const field=(name,value,event='change')=>ev(`{const e=document.querySelector('[data-planner-field="${name}"]');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('${event}'));}void 0`);
  const pass=async(name,expr)=>{assert(await ev(expr),name);checks.push(name);console.log(name)};
  const stage=s=>wait(`document.querySelector('[data-planner-stage]')?.dataset.plannerStage===${JSON.stringify(s)}`);
  const shot=async name=>fs.writeFileSync(root+'/atom-'+name+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const open=async(c=fixture.cases[0],hint=false)=>{
    await h.closeAll();await focusMain();
    const claim={id:'c',kind:c.semantic?'version_difference':hint?'standalone_a':'comparison',text:'Synthetic control; review context.',quoteA:c.text,quoteB:hint?null:comparison};
    const response={relation:c.semantic??'related_distinct',claims:[claim],explanation:{text:'Synthetic observations for context review.',evidence:['c']},recommendation:{action:hint?'consider_atomize':'manual_review',reason:'Explicit review required.',evidence:['c']},alternatives:[],limitations:['Synthetic control, not a semantic proof.']};
    await ev(`window.atomResponse=${JSON.stringify(response)};engine.inspectPair({leftPath:${JSON.stringify('Atomization/'+c.id+'.md')},rightPath:${JSON.stringify(comparisonPath)}})`);
    await wait("document.querySelectorAll('.ai-pair-note').length===2");await h.click('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");
    await h.click('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-planner-action=open]')");await h.click('[data-planner-action=open]');await stage('choosing');
    await ev('window.atomSession=[...engine.pairInspectors].at(-1).planner;window.atomCalls=atomIO.completions;window.atomReadStart=io.read.length;void 0');
    await field('operation','atomization_preview');await field('atom-source',0);
  };
  const choose=async(c=fixture.cases[0],path='Atoms/New verified atom.md')=>{
    const candidates=await ev('AtomHelpers.atomizationCandidates(atomSession.view.input.pair[0])');
    const index=candidates.findLastIndex(x=>!x.failure);assert(index>=0,c.id+': safe candidate');
    await field('atom-selection',index);await field('atom-title','Verified observation','input');await field('atom-path',path,'input');
    for(const key of ['unitConfirmed','contextConfirmed','titleConfirmed','sourceConfirmed','dependenciesReviewed'])await h.click('[data-planner-field=atom-'+key+']');
    if(await ev('!!document.querySelector("[data-planner-field=atom-manualConfirmed]")')){
      await pass('Manual selection requires separate unselected context consent',"document.querySelector('[data-atom-action=build]').disabled&&!document.querySelector('[data-planner-field=atom-manualConfirmed]').checked");
      await h.click('[data-planner-field=atom-manualConfirmed]');
    }
  };
  const zero=()=>pass('Planning: no new completions, Markdown writes, journals or network','atomIO.completions===atomCalls&&io.write===0&&atomIO.markdown===0&&atomIO.journals===0&&io.network===0');
  try {
    for(const c of fixture.cases){
      await open(c); const candidates=await ev('AtomHelpers.atomizationCandidates(atomSession.view.input.pair[0])');
      const row={id:c.id,candidates};rows.push(row);
      if(c.accepted||c.semantic){
        await choose(c);await h.click('[data-atom-action=build]');await stage(c.semantic?'error':'ready');
        if(c.semantic){row.refusal=await ev('atomSession.view.atomizationError');assert.equal(row.refusal,'semantic')}
        else {row.plan=await ev('atomSession.view.atomizationPlan');assert.equal(row.plan.source.markdown,c.text);assert.equal(row.plan.source.remaining,c.text);assert.equal(row.plan.selected.kind,c.accepted);}
      }else {assert(candidates.every(x=>x.failure));await pass(c.id+': no structurally safe candidate',"document.querySelector('[data-atom-action=build]').disabled&&!atomSession.view.atomizationPlan")}
      await zero();
      await pass('Only the two selected saved notes are read',`io.read.slice(atomReadStart).every(p=>${JSON.stringify(['Atomization/'+c.id+'.md',comparisonPath])}.includes(p))`);
    }
    await open(fixture.cases[0],true);await choose();await h.click('[data-atom-action=build]');await stage('ready');
    await pass('Standalone Analyzer evidence is a hint over whole native bounds',"atomSession.view.atomizationPlan.provenance.origin==='relationship_hint'&&atomSession.view.atomizationPlan.selected.range.text===atomSession.view.input.pair[0].content&&!document.querySelector('[data-planner-field=atom-manualConfirmed]')");await zero();
    for(const language of ['en','ru']){
      await h.closeAll();await ev('app.setting.open();app.setting.openTabById("ai-knowledge-hub");void 0');
      await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'));}void 0`);
      await ev('plugin.settingsSave');await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await ev('app.setting.close();void 0');await focusMain();
      const c=fixture.cases.find(c=>c.id==='unicode-crlf');await open(c,true);
      await pass('Nothing is preconfirmed',"[...document.querySelectorAll('.ai-change-planner input[type=checkbox]')].every(e=>!e.checked)");
      await choose(c);await ev("document.querySelector('[data-atom-action=build]').focus();void 0");await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});await stage('ready');
      uiPlans.push({language,plan:await ev('atomSession.view.atomizationPlan')});
      await pass('Full preview, source and origin link; no Apply control',"document.querySelector('[data-atom-text=preview]').textContent===atomSession.view.atomizationPlan.destination.markdown&&document.querySelector('[data-atom-text=original]').textContent===atomSession.view.atomizationPlan.source.markdown&&document.querySelector('[data-atom-text=remaining]').textContent===atomSession.view.atomizationPlan.source.markdown&&!document.querySelector('.ai-change-planner [data-safe-action],.ai-change-planner [data-group-apply-action],.ai-change-planner [data-bundle-apply-action]')");
      for(const theme of ['theme-light','theme-dark'])for(const width of [1200,390]){
        await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
        await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');document.querySelector('[data-atom-plan]').scrollIntoView({block:'start'});void 0`);
        await pass(`${language} ${theme} ${width}: fits and localizes`,"[...document.querySelectorAll('.ai-change-planner,.ai-change-planner select,.ai-change-planner pre,.ai-change-planner input[type=text]')].every(e=>e.scrollWidth<=e.clientWidth+1)&&!/@(?:atom|planner)\./.test(document.querySelector('.ai-change-planner').textContent)");await shot(`${language}-${theme}-${width}`);
      }
      await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
      await ev("document.querySelector('[data-atom-text=context]').scrollIntoView({block:'center'});void 0");await shot(language+'-context');
      await ev("{const e=document.querySelector('[data-planner-field=atom-title]');e.focus();e.setSelectionRange(4,4);}void 0");
      await cdp('Input.insertText',{text:'X'});
      await pass('Typing preserves keyboard focus and caret while clearing confirmations',"document.activeElement?.dataset.plannerField==='atom-title'&&document.activeElement.selectionStart===5&&!atomSession.view.atomizationPlan");
      await field('atom-title','Changed title','input');await pass('Typing immediately clears plan and every confirmation',"!atomSession.view.atomizationPlan&&[...document.querySelectorAll('.ai-change-planner input[type=checkbox]')].every(e=>!e.checked)");
      await h.click('[data-atom-action=cancel]');await stage('cancelled');await h.click('[data-planner-action=prepare]');await stage('choosing');await field('operation','atomization_preview');
      await pass('Reopening has empty path, title, source and confirmations',"document.querySelector('[data-planner-field=atom-path]').value===''&&document.querySelector('[data-planner-field=atom-title]').value===''&&document.querySelector('[data-planner-field=atom-source]').value===''&&[...document.querySelectorAll('.ai-change-planner input[type=checkbox]')].every(e=>!e.checked)");
      await zero();
    }
    for(const[path,reason]of [['Atoms/OCCUPIED.md','occupied'],['Atomization/Occupied.md','occupied'],['Atoms/Future atom.md','link'],['Atoms/Other atom.md','link'],['Atoms/Percent%20atom.md','link'],['.obsidian/Atom.md','path'],['Missing/Atom.md','path'],['Atoms/../Atom.md','path']]){
      await open();await choose(fixture.cases[0],path);await h.click('[data-atom-action=build]');await stage('error');
      assert.equal(await ev('atomSession.view.atomizationError'),reason);rows.push({path,refusal:reason});await zero();
    }
    await ev("document.querySelector('[data-planner-stage]').scrollIntoView({block:'start'});void 0");await shot('path-refusal');
    for(const action of ['cancel','close','changeSelection']){
      await open();await choose();
      await ev("window.atomRead=atomSession.deps.read;window.atomReads=0;delete window.releaseAtom;atomSession.deps.read=()=>++atomReads===2?new Promise(r=>window.releaseAtom=()=>atomRead().then(r)):atomRead();void 0");
      await h.click('[data-atom-action=build]');await wait('!!window.releaseAtom');
      if(action==='cancel')await h.click('[data-planner-action=cancel]');else if(action==='close')await h.closeAll();else await ev('atomSession.changeSelection();void 0');
      await ev('releaseAtom();void 0');await ev('new Promise(r=>setTimeout(r,50))');
      await pass(action+': late read cannot restore a plan','!atomSession.view.atomizationPlan&&!document.querySelector("[data-atom-plan]")');await zero();
    }
    await open();await choose();
    await ev("window.atomGetCache=app.metadataCache.getFileCache;app.metadataCache.getFileCache=function(f){return f.path==='Atomization/fact.md'?null:atomGetCache.call(this,f)};void 0");
    await h.click('[data-atom-action=build]');await stage('stale');await pass('MetadataCache loss invalidates selected plan','!atomSession.view.atomizationPlan');
    await ev('app.metadataCache.getFileCache=atomGetCache;void 0');await zero();
    await open();await choose();fs.appendFileSync(vault+'/Atomization/fact.md','\n\nLater synthetic user edit.');
    await wait("document.querySelector('[data-relationship-stage]')?.dataset.relationshipStage==='stale'");
    await pass('Saved source edit invalidates Analyzer and destroys planner','!atomSession.view.atomizationPlan&&atomSession.view.stage==="idle"');
    fs.writeFileSync(vault+'/Atomization/fact.md',files.get('Atomization/fact.md'));await ev('new Promise(r=>setTimeout(r,700))');
    assert.deepEqual(disk(),before);await zero();
    await pass('Legacy command ID is still registered',"!!app.commands.commands['ai-knowledge-hub:ai-atomize-note']");
    return {status:'PASS',checks,rows,uiPlans,io:await ev('({writers:io.write,markdownAdapterWrites:atomIO.markdown,journalWrites:atomIO.journals,network:io.network,scriptedAnalyzerCompletions:atomIO.completions})'),
      allMarkdownAndJournalsUnchanged:true,artifactSha256:sha256(fs.readFileSync(ROOT+'/main.js')),fixtureSha256:sha256(fs.readFileSync(ROOT+'/tests/fixtures/atomization-v1.json')),
      limits:'Linux native Obsidian, default themes, 390px desktop emulation. Synthetic controls and manual choices are not LLM quality or semantic proof. No OS-wide network interception, physical mobile or screen-reader test.'};
  } finally {
    await h.closeAll();await ev('engine.relationshipSession=atomOriginal.factory;Object.assign(plugin.settings,atomOriginal.settings);Object.assign(app.vault.adapter,atomOriginal.adapter);app.vault.rename=atomOriginal.rename;void 0');
    await focusMain();await ev(`engine.inspectPair({leftPath:${JSON.stringify(paths[0])},rightPath:${JSON.stringify(paths[1])}})`);await wait("document.querySelectorAll('.ai-pair-note').length===2");
  }
}
