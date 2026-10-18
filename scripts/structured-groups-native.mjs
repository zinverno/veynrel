// Synthetic-only native MetadataCache and UI. Scripted Analyzer controls, zero model requests.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {sha256} from './consolidation-evaluation-metrics.mjs';
import {safeApplyHarness} from './safe-apply-native.mjs';

export async function structuredGroupsScenario(context) {
  const {ev,wait,cdp,focusMain,root,vault,ROOT,paths}=context,h=safeApplyHarness(context),checks=[],rows=[],protectedRefusals=[],uiPlans=[];
  const corpusBytes=fs.readFileSync(ROOT+'/tests/fixtures/consolidation-realistic-v1.json'),corpus=JSON.parse(corpusBytes);
  assert.equal(sha256(corpusBytes),JSON.parse(fs.readFileSync(ROOT+'/docs/consolidation-realistic-evidence/freeze.json')).corpusSha256,'PR92 corpus must remain frozen');
  const fixture={paths:['Groups/A/Note.md','Groups/B/Note.md'],notes:[
    '# Existing guide\r\n\r\nShared scoped fact.\r\n\r\n## Practice\r\n\r\n### Trial\r\n\r\nThe blue envelope marks a completed trial.\r\n',
    '# Workshop guide\r\n\r\nShared scoped fact.\r\n\r\n## Practice\r\n\r\n### Trial\r\n\r\nНаблюдение 🪶 é: the amber envelope marks a pending trial.\r\n\r\nA second observation stays in the same group.\r\n\r\n## Practice\r\n\r\nAn unrelated sibling exercise stays here.\r\n'],
    controlResponse:{relation:'partial_overlap',explanation:{text:'Shared scope, different trials.',evidence:['s']},claims:[{id:'s',kind:'shared',text:'Shared fact.',quoteA:'Shared scoped fact.',quoteB:'Shared scoped fact.'}],recommendation:{action:'consider_merge',reason:'Review complete context.',evidence:['s']},alternatives:[],limitations:['Synthetic exercise; semantic independence is not proven.']}};
  const protectedCases=['07','08','09','22'].map(id=>{const c=corpus.cases.find(c=>c.id===id);return {...c,id:'wrapped-'+id,paths:c.paths.map(p=>p.replace('Realistic/','Wrapped/')),notes:c.notes.map(text=>'# Protected context\n\n'+text)}});
  const originals=new Map([...corpus.cases,fixture,...protectedCases].flatMap(c=>c.paths.map((p,i)=>[p,Buffer.from(c.notes[i])])));
  const field=(name,value)=>ev(`{const e=document.querySelector('[data-planner-field=${name}]');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change'));}void 0`);
  const pass=async(name,expr)=>{assert(await ev(expr),name);checks.push(name);console.log(name)};
  const stage=s=>wait(`document.querySelector('[data-planner-stage]')?.dataset.plannerStage===${JSON.stringify(s)}`);
  const shot=async name=>fs.writeFileSync(root+'/group-'+name+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const disk=()=>new Map([...originals.keys()].map(p=>[p,fs.readFileSync(vault+'/'+p)]));
  const journals=()=>Object.fromEntries(fs.readdirSync(vault+'/.obsidian/plugins/ai-knowledge-hub',{recursive:true}).filter(p=>p.startsWith('consolidation-')&&fs.statSync(vault+'/.obsidian/plugins/ai-knowledge-hub/'+p).isFile()).map(p=>[p,sha256(fs.readFileSync(vault+'/.obsidian/plugins/ai-knowledge-hub/'+p))]));
  await h.closeAll();await ev('app.workspace.getLeavesOfType("markdown").forEach(l=>l.detach());void 0');
  await ev(`window.groupReady={seen:new Set(),resolved:false};groupReady.ref=app.metadataCache.on('changed',f=>groupReady.seen.add(f.path));groupReady.done=app.metadataCache.on('resolved',()=>{if(groupReady.seen.size>=${originals.size})groupReady.resolved=true});void 0`);
  for(const[p,bytes]of originals){fs.mkdirSync(vault+'/'+p.slice(0,p.lastIndexOf('/')),{recursive:true});fs.writeFileSync(vault+'/'+p,bytes)}
  await wait('groupReady.resolved');await ev('app.metadataCache.offref(groupReady.ref);app.metadataCache.offref(groupReady.done);void 0');
  const helpers=await build({absWorkingDir:ROOT,stdin:{resolveDir:ROOT,contents:`export {contextGroups} from './consolidation/groupStructure';export {buildGroupPlan,emptyGroupChoice} from './consolidation/groupPlan';export {mergeBlockFailure,mergeHints,buildMergePlan} from './consolidation/mergePlan';export {paragraphRanges,requirePlainParagraph} from './consolidation/changePlan';`},bundle:true,write:false,format:'iife',globalName:'GroupHelpers',plugins:[{name:'unused-import',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'unused'}));b.onLoad({filter:/.*/,namespace:'unused'},()=>({contents:'export class TFile {}'}));}}]});
  await ev(helpers.outputFiles[0].text);
  await ev(`window.groupOriginal={factory:engine.relationshipSession,settings:{provider:plugin.settings.provider,model:plugin.settings.model,apiKey:plugin.settings.apiKey,baseUrl:plugin.settings.baseUrl},adapter:{},rename:app.vault.rename};window.groupIO={journal:0,calls:0};
    for(const key of ['write','append','copy','rename','remove','mkdir']){groupOriginal.adapter[key]=app.vault.adapter[key];app.vault.adapter[key]=function(...args){if(args.some(a=>typeof a==='string'&&/consolidation-(?:operations|multi-operations|merge-operations|archive-operations)/.test(a)))groupIO.journal++;return groupOriginal.adapter[key].apply(this,args)}}
    app.vault.rename=function(...args){io.write++;return groupOriginal.rename.apply(this,args)};
    engine.relationshipSession=paths=>{const s=groupOriginal.factory(paths);s.deps.complete=async()=>{groupIO.calls++;return JSON.stringify(window.groupResponse)};return s};
    Object.assign(plugin.settings,{provider:'custom',model:'offline-control-NOT-a-model',apiKey:'synthetic-only',baseUrl:'https://example.invalid/v1'});void 0`);
  const beforeJournal=journals();
  const open=async c=>{
    await h.closeAll();await focusMain();await ev(`window.groupResponse=${JSON.stringify(c.controlResponse)};engine.inspectPair({leftPath:${JSON.stringify(c.paths[0])},rightPath:${JSON.stringify(c.paths[1])}})`);
    await wait("document.querySelectorAll('.ai-pair-note').length===2");await h.click('[data-relationship-action=analyze]');
    await wait("['consent','error'].includes(document.querySelector('[data-relationship-stage]')?.dataset.relationshipStage)");
    if(await ev("document.querySelector('[data-relationship-stage]').dataset.relationshipStage==='error'"))return false;
    await h.click('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-planner-action=open]')");
    await h.click('[data-planner-action=open]');await stage('choosing');await ev('window.groupSession=[...engine.pairInspectors].at(-1).planner;window.groupCalls=groupIO.calls;void 0');
    await field('operation','copy_context_group');return true;
  };
  const choose=async(canonical,start)=>{
    await field('group-canonical',canonical);await field('group-selection',start);await h.click('[data-planner-field=group-groupConfirmed]');
    await field('group-representation','original_heading_branch');await h.click('[data-planner-field=group-contextConfirmed]');
    await field('group-dependencies','reviewed');await field('group-insertion',await ev(`groupSession.view.input.pair[${canonical}].content.length`));
    await pass('Insertion remains separately unconfirmed',"document.querySelector('[data-group-action=build]').disabled");await h.click('[data-planner-field=group-insertionConfirmed]');
  };
  try {
    for(const c of corpus.cases){
      const row={id:c.id,plainPlan:false,groupPlan:false,groups:[],review:'No desired heading transfer'};rows.push(row);
      if(!await open(c)){row.refusal='analysis-input-limit';continue}
      const data=await ev(`(()=>{const pair=groupSession.view.input.pair,analysis=groupSession.analysis,canonical=${c.gold.canonical},side=1-canonical,desired=${JSON.stringify(c.gold.desiredTransfers)};
        const hints=GroupHelpers.mergeHints(analysis.result,pair),ranges=GroupHelpers.paragraphRanges(pair[side]),transfers=desired.map(text=>ranges.find(r=>r.text===text));
        const out={plainPlan:false,groups:[],structureFailure:null,paragraphs:ranges.map(r=>({start:r.start,end:r.end,failure:GroupHelpers.mergeBlockFailure(pair[side],r,hints,side)??null}))};
        try{const anchor=GroupHelpers.paragraphRanges(pair[canonical]).find(r=>{try{GroupHelpers.requirePlainParagraph(pair[canonical],r);return true}catch{return false}});if(desired.length&&transfers.every(Boolean)&&anchor){GroupHelpers.buildMergePlan(analysis,pair,{operation:'merge_knowledge',canonical,transfers:transfers.map(range=>({range,contextReviewed:true})),insertion:anchor,insertionConfirmed:true});out.plainPlan=true}}catch(e){out.plainFailure=e.reason}
        try{const s=GroupHelpers.contextGroups(pair[side]);out.headings=s.headings;out.groups=s.groups.map(g=>({start:g.range.start,end:g.range.end,path:g.path.map(i=>s.headings[i].title),failure:g.failure??null,context:g.context,range:g.range}));}catch(e){out.structureFailure=e.reason}
        return out;})()`);Object.assign(row,data);
      if(['05','06','19'].includes(c.id)){
        const desired=c.gold.desiredTransfers[0],group=row.groups.filter(g=>g.range.text.includes(desired)).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0];assert(group);
        row.selectedStart=group.start;row.review=['05','19'].includes(c.id)?'unresolved external card dependency':'reviewed full original context branch';
        await choose(c.gold.canonical,group.start);
        if(['05','19'].includes(c.id)){
          await field('group-dependencies','unresolved');await pass(c.id+': incomplete external context blocks publication',"document.querySelector('[data-group-action=build]').disabled&&!groupSession.view.groupPlan");
          row.refusal='dependencies';await ev("document.querySelector('[data-planner-field=group-dependencies]').scrollIntoView({block:'center'});void 0");await shot('incomplete-'+c.id);
        } else {
          await h.click('[data-group-action=build]');await stage('ready');row.groupPlan=true;row.plan=await ev('groupSession.view.groupPlan');
          assert(row.plan.group.range.text.includes(desired));assert(!row.plan.canonical.after.includes('## Хранение\n\nРешения упражнения нумеруются по порядку встречи.\n\n## Обсуждение'));
        }
      } else if(['07','08','09','22','23'].includes(c.id)) {assert.equal(row.groups.length,0);row.refusal='no-heading-group';}
      await pass(c.id+': no extra completion, writes or journals','groupIO.calls===groupCalls&&io.write===0&&groupIO.journal===0&&io.network===0');
    }
    assert.equal(rows.filter(r=>r.plainPlan).length,4);assert.equal(rows.filter(r=>r.groupPlan).length,1);
    for(const language of ['en','ru']){
      await h.closeAll();await ev('app.setting.open();app.setting.openTabById("ai-knowledge-hub");void 0');
      await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value=${JSON.stringify(language)};e.dispatchEvent(new Event('change'));}void 0`);
      await ev('plugin.settingsSave');await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await ev('app.setting.close();void 0');await focusMain();
      await open(fixture);const start=await ev('GroupHelpers.contextGroups(groupSession.view.input.pair[1]).groups[2].range.start');await choose(0,start);
      await ev("document.querySelector('[data-group-tree]').scrollIntoView({block:'start'});void 0");await shot(language+'-tree-context');
      await ev("document.querySelector('[data-group-action=build]').focus();void 0");await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});await stage('ready');uiPlans.push({language,canonical:0,plan:await ev('groupSession.view.groupPlan')});
      await pass(language+': full source/after/diff and no Apply route',"document.querySelector('[data-group-text=after]').textContent===groupSession.view.groupPlan.canonical.after&&document.querySelector('[data-group-text=before]').textContent===groupSession.view.groupPlan.canonical.before&&!!document.querySelector('[data-group-plan] .ai-proposal-diff')&&!document.querySelector('.ai-change-planner [data-safe-action],.ai-change-planner [data-multi-action],.ai-change-planner [data-merge-apply-action]')");
      for(const theme of ['theme-light','theme-dark'])for(const width of [1200,390]){
        await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
        await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');document.querySelector('[data-group-plan]').scrollIntoView({block:'start'});void 0`);
        await pass(`${language} ${theme} ${width}: fits and localizes`,"[...document.querySelectorAll('.ai-change-planner,.ai-change-planner select,.ai-change-planner pre,.ai-change-planner .ai-proposal-diff')].every(e=>e.scrollWidth<=e.clientWidth+1)&&!/@(?:group|planner|merge)\./.test(document.querySelector('.ai-change-planner').textContent)");await shot(`${language}-${theme}-${width}`);
      }
      await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
      await ev("for(const key of ['before','after'])document.querySelector('[data-group-text='+key+']').parentElement.open=true;document.querySelector('[data-group-plan]').scrollIntoView({block:'start'});void 0");await shot(language+'-before-after');
      await ev("document.querySelector('[data-group-plan] .ai-proposal-diff').scrollIntoView({block:'center'});void 0");await shot(language+'-diff');
      await field('group-canonical',1);await pass('Canonical re-selection clears whole plan and confirmations',"!groupSession.view.groupPlan&&document.querySelector('[data-planner-field=group-selection]').value===''");
      await choose(1,await ev('GroupHelpers.contextGroups(groupSession.view.input.pair[0]).groups[2].range.start'));await h.click('[data-group-action=build]');await stage('ready');uiPlans.push({language,canonical:1,plan:await ev('groupSession.view.groupPlan')});
      await pass('Both canonical directions preserve full CRLF originals',"groupSession.view.groupPlan.group.copied.every(r=>groupSession.view.groupPlan.canonical.after.includes(r.text))&&groupSession.view.groupPlan.insertion.separator==='\\r\\n\\r\\n'");
      await h.click('[data-group-action=cancel]');await stage('cancelled');
    }
    for(const c of protectedCases){
      await open(c);await field('group-canonical',c.gold.canonical);
      const refusal=await ev(`(()=>{try{return {failures:GroupHelpers.contextGroups(groupSession.view.input.pair[${1-c.gold.canonical}]).groups.map(g=>g.failure??null)}}catch(e){return {error:e.reason,metadata:groupSession.view.input.pair[${1-c.gold.canonical}].cache}}})()`);
      assert(refusal.error||refusal.failures.every(Boolean));protectedRefusals.push({id:c.id,...refusal});
      if(!refusal.error)await field('group-selection',0);
      await pass(c.id+': adding a heading does not authorize protected dependencies','!groupSession.view.groupPlan');
      await ev("(document.querySelector('[data-group-text=selected]')??document.querySelector('[data-planner-field=group-canonical]')).scrollIntoView({block:'start'});void 0");await shot(c.id);
    }
    const distinct=structuredClone(fixture);distinct.controlResponse.relation='related_distinct';distinct.controlResponse.recommendation.action='manual_review';
    await open(distinct);await choose(0,await ev('GroupHelpers.contextGroups(groupSession.view.input.pair[1]).groups[2].range.start'));
    await pass('Related but distinct requires a separate intentional-copy decision',"document.querySelector('[data-group-action=build]').disabled&&!document.querySelector('[data-planner-field=group-distinctIntent]').checked");
    await h.click('[data-planner-field=group-distinctIntent]');await h.click('[data-group-action=build]');await stage('ready');
    await pass('Explicit distinct branch plan keeps manual-review provenance',"groupSession.view.groupPlan.provenance.analysis.recommendation.action==='manual_review'");
    const conflict=structuredClone(fixture);conflict.controlResponse.relation='conflicting';conflict.controlResponse.claims[0].kind='conflict';conflict.controlResponse.recommendation.action='manual_review';
    await open(conflict);await choose(0,await ev('GroupHelpers.contextGroups(groupSession.view.input.pair[1]).groups[2].range.start'));
    await h.click('[data-group-action=build]');await stage('error');await pass('Semantic conflict cannot be authorized by structural choices',"groupSession.view.groupError==='semantic'&&!groupSession.view.groupPlan");
    await ev("document.querySelector('[data-planner-stage]').scrollIntoView({block:'start'});void 0");await shot('semantic-refusal');
    // Hold final reread: cancel and close must suppress a late result.
    for(const action of ['cancel','close']){
      await open(fixture);await choose(0,await ev('GroupHelpers.contextGroups(groupSession.view.input.pair[1]).groups[2].range.start'));
      await ev("window.groupRead=groupSession.deps.read;window.groupReads=0;delete window.releaseGroup;groupSession.deps.read=()=>++groupReads===2?new Promise(r=>window.releaseGroup=()=>groupRead().then(r)):groupRead();void 0");
      await h.click('[data-group-action=build]');await wait('!!window.releaseGroup');
      if(action==='cancel')await h.click('[data-planner-action=cancel]');else await h.closeAll();
      await ev('releaseGroup();void 0');await ev('new Promise(r=>setTimeout(r,50))');
      await pass(action+': late read cannot publish a GroupPlan','!groupSession.view.groupPlan&&!document.querySelector("[data-group-plan]")');
    }
    assert.deepEqual(disk(),originals);assert.deepEqual(journals(),beforeJournal);
    for(const side of [0,1]){
      await open(fixture);await choose(0,await ev('GroupHelpers.contextGroups(groupSession.view.input.pair[1]).groups[2].range.start'));
      fs.appendFileSync(vault+'/'+fixture.paths[side],'\r\nLater synthetic user edit.\r\n');
      await wait("document.querySelector('[data-relationship-stage]')?.dataset.relationshipStage==='stale'");
      await pass('Source '+side+' edit destroys the whole group session','!groupSession.view.groupPlan&&groupSession.view.stage==="idle"');
      // Synthetic fixture restoration is outside the product; retain evidence that planners did not write.
      fs.writeFileSync(vault+'/'+fixture.paths[side],originals.get(fixture.paths[side]));
      await wait(`app.vault.read(app.vault.getFileByPath(${JSON.stringify(fixture.paths[side])})).then(t=>t===${JSON.stringify(fixture.notes[side])})`);
      await ev('new Promise(r=>setTimeout(r,500))');
    }
    assert.deepEqual(disk(),originals);assert.deepEqual(journals(),beforeJournal);
    await pass('All '+originals.size+' originals byte-identical; zero Markdown writers, journal mutations or network','io.write===0&&groupIO.journal===0&&io.network===0');
    return {status:'PASS',corpusSha256:sha256(corpusBytes),artifactSha256:sha256(fs.readFileSync(ROOT+'/main.js')),checks,rows,protectedRefusals,uiPlans,io:await ev('({writers:io.write,journals:groupIO.journal,network:io.network,scriptedAnalyzerCompletions:groupIO.calls})'),limits:'Scripted Analyzer controls, AI-curated corpus, explicit test review decisions, not measured LLM quality. MetadataCache and UTF-16 ranges are native. Linux desktop 390px emulation, no physical mobile or screen reader. No Group Apply exists.'};
  } finally {
    await h.closeAll();await ev('engine.relationshipSession=groupOriginal.factory;Object.assign(plugin.settings,groupOriginal.settings);Object.assign(app.vault.adapter,groupOriginal.adapter);app.vault.rename=groupOriginal.rename;void 0');
    await focusMain();await ev(`engine.inspectPair({leftPath:${JSON.stringify(paths[0])},rightPath:${JSON.stringify(paths[1])}})`);await wait("document.querySelectorAll('.ai-pair-note').length===2");
  }
}
