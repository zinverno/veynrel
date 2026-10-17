// Native disk writes and process-kill recovery, synthetic vault only. No paid completion.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export function safeApplyHarness({ev,wait,focusMain,vault,ROOT}, paths = ['Safe/English/Same.md', 'Safe/Русский/Same.md']) {
  const fixture=JSON.parse(fs.readFileSync(ROOT+'/tests/fixtures/change-planner.json','utf8'));
  const [a,b]=paths;
  const click=selector=>ev(`document.querySelector(${JSON.stringify(selector)}).click();void 0`);
  const closeAll=()=>ev("for(const e of [...document.querySelectorAll('.modal')].reverse())e.querySelector('.modal-close-button,.modal-header-button')?.click();void 0");
  const setup=async(suffix='')=>{
    await closeAll();
    await ev('app.workspace.getLeavesOfType("markdown").forEach(l=>l.detach());void 0');
    const data=fixture.a+suffix;
    await ev(`window.readyFiles={seen:new Set(),resolved:false};readyFiles.changed=app.metadataCache.on('changed',(f,data)=>{if((f.path===${JSON.stringify(a)}&&data===${JSON.stringify(data)})||(f.path===${JSON.stringify(b)}&&data===${JSON.stringify(fixture.b)}))readyFiles.seen.add(f.path)});readyFiles.done=app.metadataCache.on('resolved',()=>{if(readyFiles.seen.has(${JSON.stringify(a)}))readyFiles.resolved=true});void 0`);
    for(const[path,text]of[[a,data],[b,fixture.b]]){fs.mkdirSync(vault+'/'+path.slice(0,path.lastIndexOf('/')),{recursive:true});fs.writeFileSync(vault+'/'+path,text);}
    await wait('readyFiles.resolved');await ev('app.metadataCache.offref(readyFiles.changed);app.metadataCache.offref(readyFiles.done);void 0');
    await ev(`window.safeTest={calls:0,response:${JSON.stringify(fixture.response)}};Object.assign(plugin.settings,{provider:'custom',model:'synthetic-safe-apply',apiKey:'synthetic-only',baseUrl:'https://example.invalid/v1'});window.safeBaseFactory??=engine.relationshipSession;safeTest.factory=safeBaseFactory;engine.relationshipSession=paths=>{const s=safeTest.factory(paths);s.deps.complete=async()=>{safeTest.calls++;return JSON.stringify(safeTest.response)};return s;};void 0`);
  };
  const plan=async(operation='add_link')=>{
    await focusMain();await ev(`engine.inspectPair({leftPath:${JSON.stringify(a)},rightPath:${JSON.stringify(b)}})`);
    await wait("document.querySelectorAll('.ai-pair-note').length===2");
    await click('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");await click('[data-relationship-action=confirm]');
    await wait("!!document.querySelector('[data-planner-action=open]')");await click('[data-planner-action=open]');await wait("!!document.querySelector('[data-planner-field=operation]')");
    for(const[key,value]of[['operation',operation],['range','0']])await ev(`{const el=document.querySelector('[data-planner-field=${key}]');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change'));}void 0`);
    await click('[data-planner-field=confirm]');await click('[data-planner-action=build]');await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='ready'");
    await ev('window.safePlan=[...engine.pairInspectors].at(-1).planner.view.plan;void 0');
  };
  const review=async()=>{await click('[data-safe-action=review]');await wait("!!document.querySelector('.ai-safe-apply [data-safe-action=confirm]')");};
  // Closing an Undo child can start a read-only parent refresh; wait for the shared owner.
  const history=async()=>{await closeAll();await wait('!plugin.safeApply.busy');await ev("app.commands.executeCommandById('ai-knowledge-hub:consolidation-operation-history');void 0");await wait("!!document.querySelector('.ai-operation-history [data-safe-action=refresh]')");};
  const apply=async()=>{await review();await click('.ai-safe-apply [data-safe-action=confirm]');await wait("!!document.querySelector('.ai-safe-apply [data-safe-action=undo]')");};
  return {fixture,a,b,click,closeAll,setup,plan,review,history,apply};
}
export async function safeApplyScenario(context) {
  const {ev,wait,cdp,root,vault,ROOT,restart}=context;
  const {fixture,a,click,closeAll,setup,plan,review,history,apply}=safeApplyHarness(context);
  const checks=[];
  const pass=async(name,expr)=>{assert(await ev(expr),name);checks.push(name);console.log(name);};
  await setup();
  for(const language of ['en','ru']){
    await closeAll();await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'));}void 0`);
    await ev('plugin.settingsSave');await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await ev('app.setting.close();void 0');
    await plan('replace_with_embed');await review();
    await pass(language+': separate write consent, no note mutation or extra completion', `safeTest.calls===${language==='en'?1:2}&&app.vault.read(app.vault.getFileByPath(${JSON.stringify(a)})).then(t=>t===safePlan.before)`);
    for(const theme of ['theme-light','theme-dark'])for(const width of [1200,390]){
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');void 0`);
      await pass(language+' '+theme+' '+width+': consent and diff fit',"[...document.querySelectorAll('.ai-safe-apply,.ai-safe-apply pre,.ai-safe-apply .ai-proposal-diff')].every(e=>e.scrollWidth<=e.clientWidth+1)&&!document.querySelector('.ai-safe-apply img,.ai-safe-apply iframe')&&!document.querySelector('.ai-safe-apply').textContent.includes('@safeApply.')");
      fs.writeFileSync(`${root}/safe-${language}-${theme}-${width}.png`,Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
    }
  }
  await closeAll();await plan('add_link');await apply();
  assert.equal(fs.readFileSync(vault+'/'+a,'utf8'),await ev('safePlan.after'));checks.push('Native Vault.process writes the exact selected add_link plan');
  await pass('Apply makes no additional LLM call','safeTest.calls===3&&io.network===0');
  const firstId=await ev('(async()=>{return (await plugin.safeApply.history())[0].id})()');
  await restart();checks.push('Actual Obsidian process killed and restarted after apply');
  await history();await pass('Applied operation survives restart with Undo',"document.querySelector('[data-operation-state=applied]')?.querySelector('[data-safe-action=undo]')");
  await click('.ai-operation-history [data-safe-action=undo]');await wait("!!document.querySelector('.ai-safe-apply [data-safe-action=undoConfirm]')");await click('.ai-safe-apply [data-safe-action=undoConfirm]');
  await wait(`app.vault.read(app.vault.getFileByPath(${JSON.stringify(a)})).then(t=>t===${JSON.stringify(fixture.a)})`);
  assert.equal(fs.readFileSync(vault+'/'+a,'utf8'),fixture.a);checks.push('Undo after restart restores exact original saved Markdown');
  await setup('\nEmbed scenario.\n');await plan('replace_with_embed');await apply();
  assert(fs.readFileSync(vault+'/'+a,'utf8').startsWith('![[Safe/Русский/Same]]\n\nIn our classroom'));checks.push('Embed replacement preserves unique contextual example');
  // Later edits are made by the synthetic harness, never by the executor.
  await closeAll();fs.appendFileSync(vault+'/'+a,'\nLATER USER TEXT\n');
  await wait(`app.vault.read(app.vault.getFileByPath(${JSON.stringify(a)})).then(t=>t.includes('LATER USER TEXT'))`);await history();
  await pass('Later user changes produce conflict and preserve the backup',"!!document.querySelector('[data-operation-state=conflict]')&&!document.querySelector('[data-operation-state=conflict] [data-safe-action=undo]')");
  fs.writeFileSync(root+'/safe-conflict.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await setup('\nEditor scenario.\n');await plan();
  await ev(`app.workspace.getLeaf('tab').openFile(app.vault.getFileByPath(${JSON.stringify(a)}))`);
  await ev("app.workspace.getLeavesOfType('markdown')[0].view.editor.setValue('UNSAVED USER BUFFER');void 0");
  await click('[data-safe-action=review]');await wait("!!document.querySelector('.ai-safe-apply [role=alert]')");
  await pass('Open native Markdown editor blocks automatic write',"/редактор|editor/.test(document.querySelector('.ai-safe-apply [role=alert]').textContent)");
  for(const point of ['prepared','applied','undone']){
    await setup('\nCrash '+point+'.\n');await plan();
    if(point==='undone'){
      await apply();await click('.ai-safe-apply [data-safe-action=undo]');await wait("!!document.querySelector('.ai-safe-apply [data-safe-action=undoConfirm]')");
    }else await review();
    await ev(`window.crashReached=false;window.savedBefore=safePlan.before;window.savedAfter=safePlan.after;
      ${point==='prepared'?"plugin.safeApply.port.process=async()=>{crashReached=true;return new Promise(()=>{})}":`{const original=plugin.safeApply.journal.mark.bind(plugin.safeApply.journal);plugin.safeApply.journal.mark=async(r,state)=>{if(state==='${point}'){crashReached=true;return new Promise(()=>{})}return original(r,state)}}`};void 0`);
    await click('.ai-safe-apply [data-safe-action='+ (point==='undone'?'undoConfirm':'confirm')+']');await wait('crashReached');
    const before=await ev('savedBefore'),after=await ev('savedAfter');
    const crashId=await ev('(async()=>{return (await plugin.safeApply.journal.entries()).find(e=>e.record.before===savedBefore).id})()');
    assert.equal(fs.readFileSync(vault+'/'+a,'utf8'),point==='applied'?after:before);
    await restart();assert.equal(fs.readFileSync(vault+'/'+a,'utf8'),point==='applied'?after:before);await history();
    const expected=point==='prepared'?'prepared':point==='applied'?'applied':'undone';
    await pass('Process interruption at '+point+' recovers '+expected+' without rewriting',`(async()=>{const row=(await plugin.safeApply.history()).find(r=>r.id===${JSON.stringify(crashId)});return row.state==='${expected}'&&row.record.before===${JSON.stringify(before)}})()`);
    assert.equal(fs.readFileSync(vault+'/'+a,'utf8'),point==='applied'?after:before);
    fs.writeFileSync(root+'/safe-recovery-'+point+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  // Corrupt one copy, keep the second: do not silently discard the operation or original text.
  const journal=vault+'/.obsidian/plugins/ai-knowledge-hub/consolidation-operations';
  fs.writeFileSync(journal+'/'+firstId+'/record.json','{incomplete');await history();
  await pass('Damaged journal blocks automatic undo but surviving copy remains visible',"[...document.querySelectorAll('[data-operation-state=conflict]')].some(e=>/повреждена|damaged/.test(e.textContent)&&e.querySelector('pre'))");
  await pass('No paid network request during native apply, recovery or undo','io.network===0');
  return {status:'PASS',checks,artifactSha256:createHash('sha256').update(fs.readFileSync(ROOT+'/main.js')).digest('hex'),
    limits:'Synthetic Linux desktop, public native Vault.process/DataAdapter; SIGKILL process interruption, not physical power failure. No mobile, multi-process vault access, custom editor, screen reader or live provider acceptance.'};
}
