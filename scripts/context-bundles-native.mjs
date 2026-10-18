// Synthetic-only native MetadataCache and UI. Scripted Analyzer controls, zero model requests.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {sha256} from './consolidation-evaluation-metrics.mjs';
import {safeApplyHarness} from './safe-apply-native.mjs';

export async function contextBundlesScenario(context) {
  const {ev,wait,cdp,focusMain,root,vault,ROOT,paths}=context,h=safeApplyHarness(context),checks=[],rows=[],refusals=[],uiPlans=[];
  const corpusBytes=fs.readFileSync(ROOT+'/tests/fixtures/consolidation-realistic-v1.json'),corpus=JSON.parse(corpusBytes);
  assert.equal(sha256(corpusBytes),JSON.parse(fs.readFileSync(ROOT+'/docs/consolidation-realistic-evidence/freeze.json')).corpusSha256,'PR92 corpus must remain frozen');
  const fixture={paths:['Bundles/A/Note.md','Bundles/B/Note.md'],notes:[
    'Shared scoped fact.\r\n\r\nExisting observation.\r\n',
    'Shared scoped fact.\r\n\r\nThe following toy code illustrates a counterexample, not a general rule.\r\n\r\n```text\r\nКириллица 🪶 é\r\n```\r\n\r\nIts result applies only within the toy exercise.\r\n'],
    controlResponse:{relation:'partial_overlap',explanation:{text:'Shared scope with a toy example.',evidence:['s']},claims:[{id:'s',kind:'shared',text:'Shared fact.',quoteA:'Shared scoped fact.',quoteB:'Shared scoped fact.'}],recommendation:{action:'consider_merge',reason:'Review complete context.',evidence:['s']},alternatives:[],limitations:['Manual context role checks do not prove completeness.']}};
  const reversed={...fixture,paths:['Bundles/Reverse/A.md','Bundles/Reverse/B.md'],notes:[...fixture.notes].reverse()};
  const refusedCores=['> - Nested item.','>     indented code','> --- ','> -- -','1. 1. Nested item.','1. First.\n   Continuation.','> Claim [^orphan].','```js\nreturn 1;'];
  const refused=refusedCores.map((core,i)=>({...fixture,id:'protected-'+i,paths:['Bundles/Refused'+i+'/A.md','Bundles/Refused'+i+'/B.md'],notes:[fixture.notes[0],'Shared scoped fact.\n\nScope and attribution.\n\n'+core+'\n\nClaim status remains unverified.\n']}));
  const originals=new Map([...corpus.cases,fixture,reversed,...refused].flatMap(c=>c.paths.map((p,i)=>[p,Buffer.from(c.notes[i])])));
  const field=(name,value)=>ev(`{const e=document.querySelector('[data-planner-field=${name}]');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change'));}void 0`);
  const pass=async(name,expr)=>{assert(await ev(expr),name);checks.push(name);console.log(name)};
  const stage=s=>wait(`document.querySelector('[data-planner-stage]')?.dataset.plannerStage===${JSON.stringify(s)}`);
  const shot=async name=>fs.writeFileSync(root+'/bundle-'+name+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const disk=()=>new Map([...originals.keys()].map(p=>[p,fs.readFileSync(vault+'/'+p)]));
  const journals=()=>Object.fromEntries(fs.readdirSync(vault+'/.obsidian/plugins/ai-knowledge-hub',{recursive:true}).filter(p=>p.startsWith('consolidation-')&&fs.statSync(vault+'/.obsidian/plugins/ai-knowledge-hub/'+p).isFile()).map(p=>[p,sha256(fs.readFileSync(vault+'/.obsidian/plugins/ai-knowledge-hub/'+p))]));
  await h.closeAll();await ev('app.workspace.getLeavesOfType("markdown").forEach(l=>l.detach());void 0');
  await ev(`window.bundleReady={seen:new Set(),resolved:false};bundleReady.ref=app.metadataCache.on('changed',f=>bundleReady.seen.add(f.path));bundleReady.done=app.metadataCache.on('resolved',()=>{if(bundleReady.seen.size>=${originals.size})bundleReady.resolved=true});void 0`);
  for(const[p,bytes]of originals){fs.mkdirSync(vault+'/'+p.slice(0,p.lastIndexOf('/')),{recursive:true});fs.writeFileSync(vault+'/'+p,bytes)}
  await wait('bundleReady.resolved');await ev('app.metadataCache.offref(bundleReady.ref);app.metadataCache.offref(bundleReady.done);void 0');
  const helpers=await build({absWorkingDir:ROOT,stdin:{resolveDir:ROOT,contents:`export {contextGroups} from './consolidation/groupStructure';export {buildGroupPlan,emptyGroupChoice} from './consolidation/groupPlan';export {contextBundleCandidates} from './consolidation/contextBundleStructure';export {buildContextBundlePlan,emptyBundleChoice} from './consolidation/contextBundlePlan';export {mergeBlockFailure,mergeHints,buildMergePlan} from './consolidation/mergePlan';export {paragraphRanges,requirePlainParagraph} from './consolidation/changePlan';`},bundle:true,write:false,format:'iife',globalName:'BundleHelpers',plugins:[{name:'unused-import',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'unused'}));b.onLoad({filter:/.*/,namespace:'unused'},()=>({contents:'export class TFile {}'}));}}]});
  await ev(helpers.outputFiles[0].text);
  await ev(`window.bundleOriginal={factory:engine.relationshipSession,settings:{provider:plugin.settings.provider,model:plugin.settings.model,apiKey:plugin.settings.apiKey,baseUrl:plugin.settings.baseUrl},adapter:{},rename:app.vault.rename};window.bundleIO={journal:0,calls:0};
    for(const key of ['write','append','copy','rename','remove','mkdir']){bundleOriginal.adapter[key]=app.vault.adapter[key];app.vault.adapter[key]=function(...args){if(args.some(a=>typeof a==='string'&&/consolidation-(?:operations|multi-operations|merge-operations|archive-operations)/.test(a)))bundleIO.journal++;return bundleOriginal.adapter[key].apply(this,args)}}
    app.vault.rename=function(...args){io.write++;return bundleOriginal.rename.apply(this,args)};
    engine.relationshipSession=paths=>{const s=bundleOriginal.factory(paths);s.deps.complete=async()=>{bundleIO.calls++;return JSON.stringify(window.bundleResponse)};return s};
    Object.assign(plugin.settings,{provider:'custom',model:'offline-control-NOT-a-model',apiKey:'synthetic-only',baseUrl:'https://example.invalid/v1'});void 0`);
  const beforeJournal=journals();
  const open=async c=>{
    await h.closeAll();await focusMain();await ev(`window.bundleResponse=${JSON.stringify(c.controlResponse)};engine.inspectPair({leftPath:${JSON.stringify(c.paths[0])},rightPath:${JSON.stringify(c.paths[1])}})`);
    await wait("document.querySelectorAll('.ai-pair-note').length===2");await h.click('[data-relationship-action=analyze]');
    await wait("['consent','error'].includes(document.querySelector('[data-relationship-stage]')?.dataset.relationshipStage)");
    if(await ev("document.querySelector('[data-relationship-stage]').dataset.relationshipStage==='error'"))return false;
    await h.click('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-planner-action=open]')");
    await h.click('[data-planner-action=open]');await stage('choosing');await ev('window.bundleSession=[...engine.pairInspectors].at(-1).planner;window.bundleCalls=bundleIO.calls;void 0');
    await field('operation','copy_context_bundle');return true;
  };
  const choose=async(canonical=0)=>{
    await field('bundle-canonical',canonical);
    const candidate=await ev(`BundleHelpers.contextBundleCandidates(bundleSession.view.input.pair[${1-canonical}])[0]`);assert(candidate);assert(!candidate.failure,JSON.stringify(candidate));
    await field('bundle-kind',candidate.kind);await field('bundle-selection',candidate.core.start);
    await pass('All context paragraphs start unselected',"[...document.querySelectorAll('[data-planner-field^=bundle-context-]')].every(e=>!e.checked)");
    for(const r of [...candidate.before,...candidate.after])await h.click('[data-planner-field=bundle-context-'+r.start+']');
    await h.click('[data-planner-field=bundle-boundariesConfirmed]');await h.click('[data-planner-field=bundle-contextConfirmed]');
    await field('bundle-dependencies','reviewed');await field('bundle-insertion',await ev(`bundleSession.view.input.pair[${canonical}].content.length`));
    await pass('Insertion requires independent confirmation',"document.querySelector('[data-bundle-action=build]').disabled");
    await h.click('[data-planner-field=bundle-insertionConfirmed]');return candidate;
  };
  const publish=async()=>{await h.click('[data-bundle-action=build]');await stage('ready');return ev('bundleSession.view.bundlePlan')};
  try {
    for(const c of corpus.cases){
      const row={id:c.id,plainPlan:false,groupPlan:false,bundlePlan:false};rows.push(row);
      if(!await open(c)){row.refusal='analysis-input-limit';continue}
      Object.assign(row,await ev(`(()=>{const pair=bundleSession.view.input.pair,analysis=bundleSession.analysis,canonical=${c.gold.canonical},side=1-canonical,desired=${JSON.stringify(c.gold.desiredTransfers)};
        const ranges=BundleHelpers.paragraphRanges(pair[side]),transfers=desired.map(text=>ranges.find(r=>r.text===text));const out={candidates:[]};
        try{const anchor=BundleHelpers.paragraphRanges(pair[canonical]).find(r=>{try{BundleHelpers.requirePlainParagraph(pair[canonical],r);return true}catch{return false}});if(desired.length&&transfers.every(Boolean)&&anchor){BundleHelpers.buildMergePlan(analysis,pair,{operation:'merge_knowledge',canonical,transfers:transfers.map(range=>({range,contextReviewed:true})),insertion:anchor,insertionConfirmed:true});out.plainPlan=true}}catch(e){out.plainFailure=e.reason}
        try{out.candidates=BundleHelpers.contextBundleCandidates(pair[side])}catch(e){out.refusal=e.reason}return out})()`));
      if(['07','08','09'].includes(c.id)){
        await choose(c.gold.canonical);row.plan=await publish();row.bundlePlan=true;
        assert.equal(row.plan.bundle.range.text,c.notes[1-c.gold.canonical].trimEnd());
        assert.equal(row.plan.secondary.content,c.notes[1-c.gold.canonical]);
      }else if(c.id==='06'){
        await ev(`{const pair=bundleSession.view.input.pair,canonical=${c.gold.canonical},g=BundleHelpers.contextGroups(pair[1-canonical]).groups.filter(g=>g.range.text.includes(${JSON.stringify(c.gold.desiredTransfers[0])})).sort((a,b)=>(a.range.end-a.range.start)-(b.range.end-b.range.start))[0];void bundleSession.buildGroup({...BundleHelpers.emptyGroupChoice(),canonical,group:g.range,representation:'original_heading_branch',dependencies:'reviewed',groupConfirmed:true,contextConfirmed:true,insertion:pair[canonical].content.length,insertionConfirmed:true})}void 0`);
        await stage('ready');row.groupPlan=true;row.group=await ev('bundleSession.view.groupPlan');
      }else if(['05','19','22','23'].includes(c.id)){
        assert(!row.candidates.some(c=>!c.failure));row.refusal??=row.candidates[0]?.failure??'no-supported-core';
        await field('bundle-canonical',c.gold.canonical);await field('bundle-kind','code_explanation');
        await pass(c.id+': no automatic bundle permission','!bundleSession.view.bundlePlan&&document.querySelector("[data-bundle-action=build]").disabled');
        await ev("document.querySelector('[data-planner-field=bundle-canonical]').scrollIntoView({block:'start'});void 0");await shot('refusal-'+c.id);
      }
      await pass(c.id+': no additional analysis, writer or journal','bundleIO.calls===bundleCalls&&io.write===0&&bundleIO.journal===0&&io.network===0');
    }
    assert.equal(rows.filter(r=>r.plainPlan).length,4);assert.equal(rows.filter(r=>r.groupPlan).length,1);assert.equal(rows.filter(r=>r.bundlePlan).length,3);
    for(const language of ['en','ru']){
      await h.closeAll();await ev('app.setting.open();app.setting.openTabById("ai-knowledge-hub");void 0');
      await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value=${JSON.stringify(language)};e.dispatchEvent(new Event('change'));}void 0`);
      await ev('plugin.settingsSave');await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await ev('app.setting.close();void 0');await focusMain();
      for(const id of ['07','08','09']){
        const c=corpus.cases.find(c=>c.id===id);await open(c);await choose(c.gold.canonical);
        await ev("document.querySelector('[data-planner-field=bundle-boundariesConfirmed]').scrollIntoView({block:'center'});void 0");await shot(language+'-'+id+'-context');
        await ev("document.querySelector('[data-bundle-action=build]').focus();void 0");await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});await stage('ready');
        uiPlans.push({language,id,plan:await ev('bundleSession.view.bundlePlan')});
        await pass(language+' '+id+': exact full sources and before/after/diff, no Apply',"document.querySelector('[data-bundle-text=before]').textContent===bundleSession.view.bundlePlan.canonical.before&&document.querySelector('[data-bundle-text=after]').textContent===bundleSession.view.bundlePlan.canonical.after&&document.querySelector('[data-bundle-text=source-1]').textContent===bundleSession.view.bundlePlan.secondary.content&&!!document.querySelector('[data-bundle-plan] .ai-proposal-diff')&&!document.querySelector('.ai-change-planner [data-safe-action],.ai-change-planner [data-multi-action],.ai-change-planner [data-merge-apply-action]')");
        await ev("for(const key of ['before','after'])document.querySelector('[data-bundle-text='+key+']').parentElement.open=true;void 0");
        for(const theme of ['theme-light','theme-dark'])for(const width of [1200,390]){
          await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
          await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');document.querySelector('[data-bundle-plan]').scrollIntoView({block:'start'});void 0`);
          await pass(`${language} ${id} ${theme} ${width}: localized and fits`,"[...document.querySelectorAll('.ai-change-planner,.ai-change-planner select,.ai-change-planner pre,.ai-change-planner .ai-proposal-diff')].every(e=>e.scrollWidth<=e.clientWidth+1)&&!/@(?:bundle|planner|merge)\./.test(document.querySelector('.ai-change-planner').textContent)");await shot(`${language}-${id}-${theme}-${width}`);
        }
        await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
        await ev("document.querySelector('[data-bundle-plan] .ai-proposal-diff').scrollIntoView({block:'center'});void 0");await shot(language+'-'+id+'-diff');
        await field('bundle-selection',await ev('bundleSession.view.bundlePlan.bundle.core.start'));
        await pass('Reselection clears the complete plan and confirmations',"!bundleSession.view.bundlePlan&&!document.querySelector('[data-planner-field=bundle-contextConfirmed]').checked&&!document.querySelector('[data-planner-field=bundle-insertionConfirmed]').checked");
      }
    }
    for(const [c,canonical] of [[fixture,0],[reversed,1]]){
      await open(c);await choose(canonical);const p=await publish();uiPlans.push({canonical,plan:p});
      assert(p.canonical.after.includes('Кириллица 🪶 é\r\n'));assert.equal(p.insertion.separator,'\r\n\r\n');
      await pass('CRLF Unicode and both canonical choices preserve exact blocks','bundleSession.view.bundlePlan.bundle.blocks.every(b=>bundleSession.view.bundlePlan.canonical.after.includes(b.range.text))');
    }
    for(const c of refused){
      await open(c);await field('bundle-canonical',0);
      const result=await ev(`(()=>{try{return {candidates:BundleHelpers.contextBundleCandidates(bundleSession.view.input.pair[1])}}catch(e){return {error:e.reason}}})()`);
      assert(result.error||result.candidates.length>0&&result.candidates.every(c=>c.failure));refusals.push({id:c.id,...result});
      await field('bundle-kind',result.candidates?.[0]?.kind??'quotation_attribution');
      if(result.candidates?.length)await field('bundle-selection',result.candidates[0].core.start);
      await pass(c.id+': dependent markup refused by native structure','!bundleSession.view.bundlePlan&&document.querySelector("[data-bundle-action=build]").disabled');
    }
    const distinct=structuredClone(fixture);distinct.controlResponse.relation='related_distinct';distinct.controlResponse.recommendation.action='manual_review';
    await open(distinct);await choose();await pass('Related distinct needs separate intent',"document.querySelector('[data-bundle-action=build]').disabled");
    await h.click('[data-planner-field=bundle-distinctIntent]');await publish();await pass('Distinct plan keeps original manual-review provenance',"bundleSession.view.bundlePlan.provenance.analysis.recommendation.action==='manual_review'");
    const conflict=structuredClone(fixture);conflict.controlResponse.relation='conflicting';conflict.controlResponse.claims[0].kind='conflict';conflict.controlResponse.recommendation.action='manual_review';
    await open(conflict);await choose();await h.click('[data-bundle-action=build]');await stage('error');
    await pass('Conflict cannot be discharged by structural confirmation',"bundleSession.view.bundleError==='semantic'&&!bundleSession.view.bundlePlan");
    await ev("document.querySelector('[data-planner-stage]').scrollIntoView({block:'start'});void 0");await shot('semantic-refusal');
    await open(fixture);await choose();await field('bundle-dependencies','unresolved');await pass('Unresolved external context blocks build',"document.querySelector('[data-bundle-action=build]').disabled");
    for(const action of ['cancel','close']){
      await open(fixture);await choose();
      await ev("window.bundleRead=bundleSession.deps.read;window.bundleReads=0;delete window.releaseBundle;bundleSession.deps.read=()=>++bundleReads===2?new Promise(r=>window.releaseBundle=()=>bundleRead().then(r)):bundleRead();void 0");
      await h.click('[data-bundle-action=build]');await wait('!!window.releaseBundle');
      if(action==='cancel')await h.click('[data-planner-action=cancel]');else await h.closeAll();
      await ev('releaseBundle();void 0');await ev('new Promise(r=>setTimeout(r,50))');
      await pass(action+': late final read cannot restore a plan','!bundleSession.view.bundlePlan&&!document.querySelector("[data-bundle-plan]")');
    }
    assert.deepEqual(disk(),originals);assert.deepEqual(journals(),beforeJournal);
    for(const side of [0,1]){
      await open(fixture);await choose();fs.appendFileSync(vault+'/'+fixture.paths[side],'\r\nLater synthetic user edit.\r\n');
      await wait("document.querySelector('[data-relationship-stage]')?.dataset.relationshipStage==='stale'");
      await pass('Source '+side+' edit invalidates the whole session','!bundleSession.view.bundlePlan&&bundleSession.view.stage==="idle"');
      fs.writeFileSync(vault+'/'+fixture.paths[side],originals.get(fixture.paths[side]));
      await wait(`app.vault.read(app.vault.getFileByPath(${JSON.stringify(fixture.paths[side])})).then(t=>t===${JSON.stringify(fixture.notes[side])})`);await ev('new Promise(r=>setTimeout(r,500))');
    }
    assert.deepEqual(disk(),originals);assert.deepEqual(journals(),beforeJournal);
    await pass('All '+originals.size+' synthetic files byte-identical; zero writes/journals/network','io.write===0&&bundleIO.journal===0&&io.network===0');
    return {status:'PASS',corpusSha256:sha256(corpusBytes),artifactSha256:sha256(fs.readFileSync(ROOT+'/main.js')),checks,rows,refusals,uiPlans,io:await ev('({writers:io.write,journals:bundleIO.journal,network:io.network,scriptedAnalyzerCompletions:bundleIO.calls})'),limits:'Native MetadataCache, TFile, resolver and UI; scripted Analyzer controls, AI-curated frozen references, manual synthetic context-role decisions. Not LLM quality or semantic proof. 390px desktop emulation, no physical mobile or screen reader. No ContextBundle Apply exists.'};
  } finally {
    await h.closeAll();await ev('engine.relationshipSession=bundleOriginal.factory;Object.assign(plugin.settings,bundleOriginal.settings);Object.assign(app.vault.adapter,bundleOriginal.adapter);app.vault.rename=bundleOriginal.rename;void 0');
    await focusMain();await ev(`engine.inspectPair({leftPath:${JSON.stringify(paths[0])},rightPath:${JSON.stringify(paths[1])}})`);await wait("document.querySelectorAll('.ai-pair-note').length===2");
  }
}
