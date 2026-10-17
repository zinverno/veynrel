// Synthetic-only, local read-only MergePlan acceptance. Fake analysis; no executor or paid provider.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {safeApplyHarness} from './safe-apply-native.mjs';

export async function mergePlannerScenario(context) {
  const {ev,wait,cdp,focusMain,root,vault,ROOT,paths}=context,checks=[];
  const fixture=JSON.parse(fs.readFileSync(ROOT+'/tests/fixtures/merge-planner.json','utf8'));
  const h=safeApplyHarness(context,fixture.paths),{a,b,click,closeAll}=h;
  const pass=async(name,expr)=>{assert(await ev(expr),name);checks.push(name);console.log(name);};
  const field=(name,value)=>ev(`{const e=document.querySelector('[data-planner-field=${name}]');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change'));}void 0`);
  const stage=name=>wait(`document.querySelector('[data-planner-stage]')?.dataset.plannerStage===${JSON.stringify(name)}`);
  const shot=async name=>fs.writeFileSync(root+'/'+name+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const setup=async(left=fixture.a,right=fixture.b,response=fixture.response)=>{
    Object.assign(h.fixture,{a:left,b:right,response});await h.setup();
    await wait(`!!app.metadataCache.getFileCache(app.vault.getFileByPath(${JSON.stringify(b)}))?.sections`);
  };
  const open=async()=>{
    await focusMain();await ev(`engine.inspectPair({leftPath:${JSON.stringify(a)},rightPath:${JSON.stringify(b)}})`);await wait("document.querySelectorAll('.ai-pair-note').length===2");
    await click('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");await click('[data-relationship-action=confirm]');
    await wait("!!document.querySelector('[data-planner-action=open]')");await ev('window.mergeCalls=safeTest.calls;window.mergeReads=io.read.length;void 0');
    await click('[data-planner-action=open]');await stage('choosing');await ev('window.mergeSession=[...engine.pairInspectors].at(-1).planner;void 0');
    await field('operation','merge_knowledge');
    await pass('Merge choice reads no additional notes or model; canonical choice starts empty',"safeTest.calls===mergeCalls&&io.read.length===mergeReads+2&&document.querySelector('[data-planner-field=merge-canonical]').value===''&&document.querySelector('[data-merge-action=build]').disabled");
  };
  const choose=async(canonical=0,block=1,anchor=0)=>{
    await field('merge-canonical',canonical);
    const eligible=await ev("[...document.querySelectorAll('[data-planner-field^=merge-transfer-]')].map(e=>({key:e.dataset.plannerField,disabled:e.disabled}))");
    assert(!eligible[block].disabled,'chosen block eligible');await click(`[data-planner-field=${eligible[block].key}]`);await field('merge-location',anchor);
    await pass('Exact copied block and insertion point require manual confirmation',"document.querySelector('[data-merge-action=build]').disabled&&!document.querySelector('[data-planner-field=merge-confirm]').checked");
    await click('[data-planner-field=merge-confirm]');
  };
  const build=async()=>{await click('[data-merge-action=build]');await stage('ready');};
  const saved=()=>[fs.readFileSync(vault+'/'+a,'utf8'),fs.readFileSync(vault+'/'+b,'utf8')];
  await ev(`window.mergeOriginal={settings:{provider:plugin.settings.provider,model:plugin.settings.model,apiKey:plugin.settings.apiKey,baseUrl:plugin.settings.baseUrl},factory:engine.relationshipSession,write:app.vault.adapter.write,copy:app.vault.adapter.copy};window.mergeIO={journal:0};
    for(const key of ['write','copy'])app.vault.adapter[key]=function(...args){if(args.some(a=>typeof a==='string'&&(a.includes('/consolidation-operations/')||a.includes('/consolidation-multi-operations/'))))mergeIO.journal++;return mergeOriginal[key].apply(this,args)};void 0`);
  try {
    for(const language of ['en','ru']) {
      await closeAll();await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
      await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'));}void 0`);
      await ev('plugin.settingsSave');await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await ev('app.setting.close();void 0');
      await setup();await open();await choose();
      await pass('Model context is retained and cannot silently become a selected transfer',"[...document.querySelectorAll('[data-planner-field^=merge-transfer-]')][2].disabled");
      await ev("document.querySelector('[data-merge-action=build]').focus();void 0");
      await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});await stage('ready');
      await pass(language+': full before/after, exact splice, complete retained source and no Apply',`mergeSession.view.mergePlan.canonical.path===${JSON.stringify(a)}&&mergeSession.view.mergePlan.secondary.path===${JSON.stringify(b)}&&mergeSession.view.mergePlan.retained.map(f=>f.range.text).join('')===mergeSession.view.mergePlan.secondary.content&&!mergeSession.view.plan&&!mergeSession.view.multiPlan&&document.querySelectorAll('[data-merge-plan] .ai-proposal-diff').length===1&&!document.querySelector('.ai-change-planner [data-safe-action],.ai-change-planner [data-multi-action]')&&mergeSession.view.mergePlan.canonical.after===mergeSession.view.mergePlan.canonical.before.slice(0,mergeSession.view.mergePlan.insertion.edit.start)+mergeSession.view.mergePlan.insertion.edit.inserted+mergeSession.view.mergePlan.canonical.before.slice(mergeSession.view.mergePlan.insertion.edit.end)`);
      assert.deepEqual(saved(),[fixture.a,fixture.b]);await pass('Final reread checks only both selected sources; no new LLM call','io.read.length===mergeReads+6&&safeTest.calls===mergeCalls');
      for(const theme of ['theme-light','theme-dark'])for(const width of [1200,390]) {
        await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
        await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');document.querySelector('[data-merge-plan]').scrollIntoView({block:'start'});void 0`);
        await pass(`${language} ${theme} ${width}: localized plan fits and stays literal`,"[...document.querySelectorAll('.ai-change-planner,.ai-change-planner select,.ai-change-planner pre,.ai-change-planner .ai-proposal-diff')].every(e=>e.scrollWidth<=e.clientWidth+1)&&!document.querySelector('.ai-change-planner img,.ai-change-planner iframe,.ai-change-planner script')&&!/(@merge\.|@planner\.|@relationship\.)/.test(document.querySelector('.ai-change-planner').textContent)");await shot(`merge-${language}-${theme}-${width}`);
      }
      await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
      await ev("for(const e of document.querySelectorAll('[data-merge-text=before],[data-merge-text=after]'))e.parentElement.open=true;document.querySelector('[data-merge-plan]').scrollIntoView({block:'start'});void 0");await shot(`merge-${language}-before-after`);
      await ev("document.querySelector('[data-merge-plan] .ai-proposal-diff').scrollIntoView({block:'center'});void 0");await shot(`merge-${language}-diff`);
      await field('merge-canonical',1);
      await pass('Switching canonical invalidates the whole plan and clears blocks and location',"!mergeSession.view.mergePlan&&document.querySelector('[data-planner-field=merge-location]').value===''&&[...document.querySelectorAll('[data-planner-field^=merge-transfer-]')].every(e=>!e.checked)");
      await choose(1,4,1);await build();
      await pass('The second repeated paragraph is selected by native offsets; both sources stay complete',`mergeSession.view.mergePlan.transfers[0].range.start===${fixture.a.lastIndexOf('Repeated observation.')}&&mergeSession.view.mergePlan.secondary.content===${JSON.stringify(fixture.a)}`);assert.deepEqual(saved(),[fixture.a,fixture.b]);
      await click('[data-merge-action=cancel]');await stage('cancelled');await pass('Declining leaves no plan','!mergeSession.view.mergePlan');
    }
    const richA='---\nauthor: Synthetic author\n---\n# Canonical context\n\n'+fixture.a+'\n[[Missing source]]\n![[Missing embed]]\n';
    const richB='---\ntags: [test]\n---\n\n'+fixture.b+'\n# Different heading\n\nA heading dependent explanation.\n\n[[Missing attribution]]\n\n![[Missing example]]\n';
    await setup(richA,richB);await open();await choose();await build();
    await pass('Canonical frontmatter/headings/links/embeds and whole secondary survive in preview',`mergeSession.view.mergePlan.canonical.after.startsWith(${JSON.stringify('---\nauthor: Synthetic author\n---\n# Canonical context')})&&mergeSession.view.mergePlan.canonical.after.endsWith(${JSON.stringify('[[Missing source]]\n![[Missing embed]]\n')})&&mergeSession.view.mergePlan.secondary.content===${JSON.stringify(richB)}`);
    await pass('Heading, link and embed dependent source blocks are disabled',"[...document.querySelectorAll('[data-merge-block]')].filter(e=>/heading dependent|Missing attribution|Missing example/.test(e.textContent)).every(e=>e.closest('section').querySelector('input').disabled)");
    assert.deepEqual(saved(),[richA,richB]);await shot('merge-structural-refusals');
    for(const kind of ['conflict','version_difference']) {
      const response=structuredClone(fixture.response);response.relation='conflicting';response.claims[0].kind=kind;response.claims[0].quoteB='Cached results must never be reused.';
      response.recommendation={action:'manual_review',reason:'Incompatible conditions require manual review.',evidence:['shared']};response.alternatives=[];
      const right=fixture.b.replace('A cache keeps reusable results.','Cached results must never be reused.');
      await setup(fixture.a,right,response);await open();await choose();await click('[data-merge-action=build]');await stage('error');
      await pass(kind+': no plan and no automatic resolution',"mergeSession.view.mergeError==='conflict'&&!mergeSession.view.mergePlan");assert.deepEqual(saved(),[fixture.a,right]);await shot('merge-refuse-'+kind);
    }
    for(const side of [0,1]) {
      await setup();await open();await choose();fs.appendFileSync(vault+'/'+[a,b][side],'\nLATER USER CONTENT\n');
      await wait("document.querySelector('[data-relationship-stage]')?.dataset.relationshipStage==='stale'&&!document.querySelector('[data-planner-stage]')");
      await pass(`Saved source ${side} edit closes and clears merge session`,'mergeSession.view.stage==="idle"&&!mergeSession.view.mergePlan');
    }
    await setup();await open();await choose();
    await ev("window.mergeRead=mergeSession.deps.read;window.mergeCount=0;mergeSession.deps.read=()=>{mergeCount++;if(mergeCount===2)return new Promise(r=>window.releaseMerge=()=>mergeRead().then(r));return mergeRead()};void 0");
    await ev("{const b=document.querySelector('[data-merge-action=build]');b.click();b.click();}void 0");await wait('!!window.releaseMerge');
    await ev("window.mergeCache=app.metadataCache.getFileCache;app.metadataCache.getFileCache=function(f){const c=mergeCache.call(this,f);return c?{...c,headings:[]}:c};releaseMerge();void 0");await stage('stale');
    await pass('Metadata changed before publication rejects the whole plan; double click does not start another build','!mergeSession.view.mergePlan&&mergeCount===2');
    await ev('app.metadataCache.getFileCache=mergeCache;delete window.releaseMerge;void 0');
    await setup();await open();await choose();
    await ev("window.mergeRead=mergeSession.deps.read;window.mergeCount=0;mergeSession.deps.read=()=>{mergeCount++;if(mergeCount===2)return new Promise(r=>window.releaseMerge=()=>mergeRead().then(r));return mergeRead()};void 0");
    await click('[data-merge-action=build]');await wait('!!window.releaseMerge');await closeAll();await ev('releaseMerge();void 0');await ev('new Promise(r=>setTimeout(r,50))');
    await pass('Close during verification blocks late publication','mergeSession.view.stage==="idle"&&!mergeSession.view.mergePlan&&!document.querySelector("[data-merge-plan]")');
    await setup();await open();await choose();await build();await click('[data-relationship-action=analyze]');
    await wait("document.querySelector('[data-relationship-stage]')?.dataset.relationshipStage==='consent'");
    await pass('New analysis request removes the plan and waits for new LLM consent','!mergeSession.view.mergePlan&&!document.querySelector("[data-merge-plan]")&&safeTest.calls===mergeCalls');
    assert.deepEqual(saved(),[fixture.a,fixture.b]);
    await pass('No Markdown writes, either journal family, executor calls or network in merge planning','io.write===0&&io.network===0&&mergeIO.journal===0');
    return {status:'PASS',checks,artifactSha256:createHash('sha256').update(fs.readFileSync(ROOT+'/main.js')).digest('hex'),limits:'Synthetic Linux desktop with native source/cache/resolver APIs; fake model responses. No Merge executor, paid model, physical mobile, screen reader or external dependency completeness claim.'};
  } finally {
    await closeAll();await ev('Object.assign(plugin.settings,mergeOriginal.settings);engine.relationshipSession=mergeOriginal.factory;app.vault.adapter.write=mergeOriginal.write;app.vault.adapter.copy=mergeOriginal.copy;if(window.mergeCache)app.metadataCache.getFileCache=mergeCache;void 0');
    await focusMain();await ev(`engine.inspectPair({leftPath:${JSON.stringify(paths[0])},rightPath:${JSON.stringify(paths[1])}})`);await wait("document.querySelectorAll('.ai-pair-note').length===2");
  }
}
