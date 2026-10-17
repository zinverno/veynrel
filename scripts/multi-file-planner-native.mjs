// Synthetic-only local planning through the existing Pair Inspector. No paid completions.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {safeApplyHarness} from './safe-apply-native.mjs';

export async function multiFilePlannerScenario(context) {
  const {ev,wait,cdp,focusMain,root,vault,ROOT,paths}=context, checks=[];
  const fixture=JSON.parse(fs.readFileSync(ROOT+'/tests/fixtures/multi-file-planner.json','utf8'));
  const h=safeApplyHarness(context,fixture.paths), {a,b,click,closeAll}=h;
  Object.assign(h.fixture,{a:fixture.a,b:fixture.b});
  const pass=async(name,expr)=>{assert(await ev(expr),name);checks.push(name);console.log(name);};
  const field=(name,value)=>ev(`{const e=document.querySelector('[data-planner-field=${name}]');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change'));}void 0`);
  const stage=name=>wait(`document.querySelector('[data-planner-stage]')?.dataset.plannerStage===${JSON.stringify(name)}`);
  const shot=async name=>fs.writeFileSync(root+'/'+name+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const setup=async(left=fixture.a,right=fixture.b)=>{Object.assign(h.fixture,{a:left,b:right});await h.setup();};
  const open=async()=>{
    await focusMain();await ev(`engine.inspectPair({leftPath:${JSON.stringify(a)},rightPath:${JSON.stringify(b)}})`);
    await wait("document.querySelectorAll('.ai-pair-note').length===2");
    await click('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");await click('[data-relationship-action=confirm]');
    await wait("!!document.querySelector('[data-planner-action=open]')");
    await ev('window.multiCalls=safeTest.calls;window.multiReads=io.read.length;void 0');
    await click('[data-planner-action=open]');await stage('choosing');
    await ev('window.multiSession=[...engine.pairInspectors].at(-1).planner;void 0');
    await field('operation','add_reciprocal_links');
    await pass('Combined choice is passive; preparation reads exactly the two selected notes', 'safeTest.calls===multiCalls&&io.read.length===multiReads+2');
  };
  const select=async(left=1,right=2)=>{
    await field('range-0',left);await field('range-1',right);
    await pass('Both exact selections require separate consent','document.querySelectorAll("[data-multi-selection]").length===2&&document.querySelector("[data-planner-action=buildMulti]").disabled');
    await click('[data-planner-field=confirm-0]');
    assert(await ev('document.querySelector("[data-planner-action=buildMulti]").disabled'));
    await click('[data-planner-field=confirm-1]');
  };
  const build=async()=>{await click('[data-planner-action=buildMulti]');await stage('ready');};
  const saved=()=>[fs.readFileSync(vault+'/'+a,'utf8'),fs.readFileSync(vault+'/'+b,'utf8')];
  await ev(`window.multiOriginal={settings:{provider:plugin.settings.provider,model:plugin.settings.model,apiKey:plugin.settings.apiKey,baseUrl:plugin.settings.baseUrl},factory:engine.relationshipSession,write:app.vault.adapter.write,copy:app.vault.adapter.copy,process:app.vault.process};
    window.multiIO={process:0,journal:0};app.vault.process=function(...args){multiIO.process++;return multiOriginal.process.apply(this,args)};
    for(const key of ['write','copy'])app.vault.adapter[key]=function(...args){if(args.some(a=>typeof a==='string'&&a.includes('/consolidation-operations/')))multiIO.journal++;return multiOriginal[key].apply(this,args)};void 0`);
  try {
    for(const language of ['en','ru']) {
      await closeAll();await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
      await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'));}void 0`);
      await ev('plugin.settingsSave');await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await ev('app.setting.close();void 0');
      await setup();await open();await select();
      await ev("document.querySelector('[data-planner-action=buildMulti]').focus();void 0");
      await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});await stage('ready');
      await pass(language+': one combined plan, two complete diffs, full paths and no Apply control',`multiSession.view.multiPlan.files.length===2&&!multiSession.view.plan&&document.querySelectorAll('[data-multi-file]').length===2&&document.querySelectorAll('[data-multi-file] .ai-proposal-diff').length===2&&!document.querySelector('.ai-change-planner [data-safe-action]')&&multiSession.view.multiPlan.files.every(f=>f.after===f.before.slice(0,f.edits[0].start)+f.edits[0].inserted+f.before.slice(f.edits[0].end))&&JSON.stringify(multiSession.view.multiPlan.participants)===JSON.stringify(${JSON.stringify([a,b])})`);
      assert.deepEqual(saved(),[fixture.a,fixture.b]);
      await pass('Full pre-publication reread and no additional completion', 'io.read.length===multiReads+6&&safeTest.calls===multiCalls');
      for(const theme of ['theme-light','theme-dark'])for(const width of [1200,390]) {
        await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
        await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');document.querySelector('[data-multi-plan]').scrollIntoView({block:'start'});void 0`);
        await pass(`${language} ${theme} ${width}: readable localized plan and literal diff`,"[...document.querySelectorAll('.ai-change-planner,.ai-change-planner select,.ai-change-planner pre,.ai-change-planner .ai-proposal-diff')].every(e=>e.scrollWidth<=e.clientWidth+1)&&!document.querySelector('.ai-change-planner img,.ai-change-planner iframe,.ai-change-planner script')&&!/(@multi\.|@planner\.)/.test(document.querySelector('.ai-change-planner').textContent)");
        await shot(`multi-${language}-${theme}-${width}`);
      }
      await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
      await ev("for(const e of document.querySelectorAll('[data-planner-text]'))e.parentElement.open=true;document.querySelector('[data-multi-file]').scrollIntoView({block:'start'});void 0");
      await shot(`multi-${language}-before-after`);
      await ev("for(const e of document.querySelectorAll('[data-planner-text]'))e.parentElement.open=false;void 0");
      for(const side of [0,1]) {
        await ev(`document.querySelectorAll('[data-multi-file] .ai-proposal-diff')[${side}].scrollIntoView({block:'center'});void 0`);
        await shot(`multi-${language}-diff-${side}`);
      }
      await field('range-1',1);
      await pass('Changing either side removes the whole plan and clears both confirmations',"!multiSession.view.multiPlan&&!document.querySelector('[data-multi-plan]')&&!document.querySelector('[data-planner-field=confirm-0]').checked&&!document.querySelector('[data-planner-field=confirm-1]').checked");
      await select(4,1);await build();
      await pass('Repeated identical paragraphs use only the explicitly selected occurrence',`multiSession.view.multiPlan.files[0].after.includes(${JSON.stringify('Repeated paragraph.\n\nRepeated paragraph. [['+b.slice(0,-3)+']]')})`);
      await click('[data-planner-action=cancel]');await stage('cancelled');await click('[data-planner-action=prepare]');await stage('choosing');await field('operation','add_reciprocal_links');
      await pass('Cancel/reprepare does not silently select replacement paragraphs',"document.querySelector('[data-planner-field=range-0]').value===''&&document.querySelector('[data-planner-field=range-1]').value===''&&document.querySelector('[data-planner-action=buildMulti]').disabled");
    }
    for(const side of [0,1,2]) {
      await setup(fixture.a+(side!==1?`\n[[${b.slice(0,-3)}]]\n`:''),fixture.b+(side!==0?`\n[[${a.slice(0,-3)}]]\n`:''));
      await open();await select();const before=saved();await click('[data-planner-action=buildMulti]');await stage('error');
      await pass(`Existing link on side ${side} refuses the whole plan`,'multiSession.view.error==="existing"&&!multiSession.view.multiPlan&&!multiSession.view.plan&&!document.querySelector("[data-multi-plan]")');assert.deepEqual(saved(),before);
    }
    await setup(fixture.a+'\nA `protected` paragraph.\n');await open();
    const protectedRange=await ev("[...document.querySelector('[data-planner-field=range-0]').options].find(o=>o.textContent.includes('protected')).value");
    await select(protectedRange,2);await click('[data-planner-action=buildMulti]');await stage('error');
    await pass('Protected inline code blocks both proposed changes','multiSession.view.error==="protected"&&!multiSession.view.multiPlan');await shot('multi-protected-refusal');
    for(const side of [0,1]) {
      await setup();await open();await select();fs.appendFileSync(vault+'/'+[a,b][side],'\nLater saved edit.\n');
      await wait("document.querySelector('[data-relationship-stage]')?.dataset.relationshipStage==='stale'&&!document.querySelector('[data-planner-stage]')");
      await pass(`Saved source ${side} change closes the planner and invalidates both selections`,'multiSession.view.stage==="idle"&&!multiSession.view.multiPlan&&!multiSession.view.input');
    }
    // Hold only the final verification read; public resolver changes must invalidate the combined result.
    await setup();await open();await select();
    await ev("window.multiRead=multiSession.deps.read;window.multiCount=0;multiSession.deps.read=()=>{multiCount++;if(multiCount===2)return new Promise(r=>window.releaseMulti=()=>multiRead().then(r));return multiRead()};void 0");
    await ev("{const b=document.querySelector('[data-planner-action=buildMulti]');b.click();b.click();}void 0");await wait('!!window.releaseMulti');
    await ev("window.multiResolver=app.metadataCache.getFirstLinkpathDest;app.metadataCache.getFirstLinkpathDest=()=>null;releaseMulti();void 0");await stage('stale');
    await pass('Changed native link resolution before publication refuses both files; duplicate click does not reread','multiCount===2&&!multiSession.view.multiPlan');
    await ev('app.metadataCache.getFirstLinkpathDest=multiResolver;delete window.releaseMulti;void 0');
    await setup();await open();await select();
    await ev("window.multiRead=multiSession.deps.read;window.multiCount=0;multiSession.deps.read=()=>{multiCount++;if(multiCount===2)return new Promise(r=>window.releaseMulti=()=>multiRead().then(r));return multiRead()};void 0");
    await click('[data-planner-action=buildMulti]');await wait('!!window.releaseMulti');await closeAll();await ev('releaseMulti();void 0');await ev('new Promise(r=>setTimeout(r,50))');
    await pass('Closing during final verification never republishes the old plan','!document.querySelector("[data-multi-plan]")&&multiSession.view.stage==="idle"&&!multiSession.view.multiPlan');
    await setup();await open();await select();await build();
    await click('[data-relationship-action=dismiss]');
    await pass('Dismissing Relationship Analyzer removes the complete plan','!document.querySelector("[data-multi-plan]")&&!multiSession.view.multiPlan');
    await setup();await open();await select();
    const moved=a.replace('.md',' moved.md');fs.renameSync(vault+'/'+a,vault+'/'+moved);
    await wait("document.querySelector('[data-relationship-stage]')?.dataset.relationshipStage==='stale'&&!document.querySelector('[data-planner-stage]')");
    await pass('Moving one participant closes the planner and invalidates the whole plan','multiSession.view.stage==="idle"&&!multiSession.view.multiPlan&&!multiSession.view.input');
    await closeAll();fs.renameSync(vault+'/'+moved,vault+'/'+a);await wait(`!!app.vault.getFileByPath(${JSON.stringify(a)})&&!app.vault.getFileByPath(${JSON.stringify(moved)})`);
    await pass('Planning makes no Vault writes, journal writes, executor calls or network requests','io.write===0&&io.network===0&&multiIO.process===0&&multiIO.journal===0');
    return {status:'PASS',checks,artifactSha256:createHash('sha256').update(fs.readFileSync(ROOT+'/main.js')).digest('hex'),
      limits:'Synthetic Linux desktop, native Markdown/cache/link resolution, fake relationship responses. No multi-file executor, live provider, physical mobile, custom editor or power-loss acceptance.'};
  } finally {
    await closeAll();
    await ev('Object.assign(plugin.settings,multiOriginal.settings);engine.relationshipSession=multiOriginal.factory;app.vault.adapter.write=multiOriginal.write;app.vault.adapter.copy=multiOriginal.copy;app.vault.process=multiOriginal.process;if(window.multiResolver)app.metadataCache.getFirstLinkpathDest=multiResolver;void 0');
    // Restore the original read-only inspector expected by the parent harness.
    await focusMain();await ev(`engine.inspectPair({leftPath:${JSON.stringify(paths[0])},rightPath:${JSON.stringify(paths[1])}})`);await wait("document.querySelectorAll('.ai-pair-note').length===2");
  }
}
