// Actual Obsidian, new synthetic vault, explicit synthetic completions only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {safeApplyHarness} from './safe-apply-native.mjs';

export async function unifiedUxScenario(context) {
  const {ev,wait,cdp,root,vault,paths,focusMain,restart}=context;
  const h=safeApplyHarness(context,paths),checks=[],snapshots=[];
  const hash=b=>createHash('sha256').update(b).digest('hex');
  const disk=()=>Object.fromEntries(fs.readdirSync(vault,{recursive:true}).filter(p=>fs.statSync(vault+'/'+p).isFile()&&(p.endsWith('.md')||p.includes('/consolidation-'))).sort().map(p=>{const s=fs.statSync(vault+'/'+p);return[p,{sha256:hash(fs.readFileSync(vault+'/'+p)),size:s.size,mtime:s.mtimeMs}]}));
  const pass=async(name,expression)=>{assert(await ev(expression),name);checks.push(name);console.log(name);};
  const shot=async name=>fs.writeFileSync(root+'/'+name+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const field=(key,value)=>ev(`{const e=document.querySelector('[data-planner-field=${key}]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change'));}void 0`);
  const locale=async language=>{
    await h.closeAll();await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'));}void 0`);
    await ev('plugin.settingsSave');await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await ev('app.setting.close();void 0');await focusMain();
  };
  const discover=async()=>{
    await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health');void 0");
    await wait("!!app.workspace.getLeavesOfType('veynrel-health')[0]?.view.contentEl.querySelector('[data-health-action=nav-discover]')");
    await ev("window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;hv.contentEl.querySelector('[data-health-action=nav-discover]').click();void 0");
  };
  const pair=async()=>{await discover();await h.click('[data-health-action=discover-duplicates]');await wait("document.querySelectorAll('.ai-semantic-duplicate-card button').length===2");await ev("document.querySelectorAll('.ai-semantic-duplicate-card button')[1].click();void 0");await wait("document.querySelectorAll('.ai-pair-note').length===2");};
  const choose=async()=>{
    await h.click('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");
    await pass('Outgoing data review is separate from model consent',"document.querySelector('[data-relationship-stage]').dataset.relationshipStage==='consent'&&safeTest.calls===0");
    await h.click('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-planner-action=open]')");await h.click('[data-planner-action=open]');await wait("!!document.querySelector('[data-planner-field=operation]')");
    await pass('Human action groups, no model-selected operation',"document.querySelectorAll('[data-planner-field=operation] optgroup').length===4&&document.querySelector('[data-planner-field=operation]').value===''&&safeTest.calls===1");
  };
  const screenshots=async(language,stage,selector)=>{
    for(const theme of ['theme-light','theme-dark'])for(const width of [1200,390]){
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');document.querySelector(${JSON.stringify(selector)}).scrollTop=0;void 0`);
      if(stage==='actions')await ev("document.querySelector('[data-planner-field=operation]').scrollIntoView({block:'center'});void 0");
      await pass(`${language} ${theme} ${width} ${stage}: no overflow or missing translation`, `(()=>{const e=document.querySelector(${JSON.stringify(selector)});return e.scrollWidth<=e.clientWidth+1&&!/@ux\.|@safeApply\./.test(e.textContent)})()`);
      await shot(`ux-${stage}-${language}-${theme}-${width}`);
    }
  };
  await h.setup();await ev('plugin.settings.semantic.enabled=false;plugin.settings.apiKey="";engine.refreshSemanticStatus();void 0');await discover();
  const empty=disk();await h.click('[data-health-action=consolidation-history]');await wait("!!document.querySelector('.ai-operation-history [data-safe-action=refresh]')");
  await pass('History opens without index, API key or Analyzer',"!plugin.settings.semantic.enabled&&plugin.settings.apiKey===''&&safeTest.calls===0&&io.network===0&&!document.querySelector('[data-operation-id]')");assert.deepEqual(disk(),empty);
  await h.closeAll();await ev('plugin.settings.semantic.enabled=true;engine.refreshSemanticStatus();void 0');
  for(const language of ['en','ru']){
    await locale(language);await h.setup('\nUX '+language+'\n');const before=disk();await pair();await choose();
    await screenshots(language,'actions','.ai-pair-inspector');
    await field('operation','no_change');await pass('Leave unchanged has no Apply',"!document.querySelector('[data-safe-action=review]')");
    await field('operation','atomization_preview');await pass('Read-only atomization stays separate from writing',"!document.querySelector('[data-empty-atom-apply=review]')&&!document.querySelector('[data-safe-action=review]')");
    await field('operation','add_link');await field('range','0');await h.click('[data-planner-field=confirm]');await h.click('[data-planner-action=build]');await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='ready'");
    await ev('window.safePlan=[...engine.pairInspectors].at(-1).planner.view.plan;void 0');await h.review();
    assert.deepEqual(disk(),before);await pass('Plan and final review perform no Markdown/journal write or additional model call',"safeTest.calls===1&&io.network===0&&!!document.querySelector('.ai-safe-apply .ai-proposal-diff')&&[...document.querySelectorAll('.ai-safe-apply details')].every(e=>!e.open)");
    await screenshots(language,'review','.ai-safe-apply');
    // Test native keyboard activation of a disclosure, then Escape without granting consent.
    await ev("document.querySelector('.ai-safe-apply summary').focus();void 0");
    for(const type of ['keyDown','keyUp'])await cdp('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',...(type==='keyDown'?{text:'\r'}:{})});
    await pass('Keyboard expands literal Before text',"document.querySelector('.ai-safe-apply details').open&&document.querySelector('.ai-safe-apply pre').textContent===safePlan.before");
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});await wait("!document.querySelector('.ai-safe-apply')");assert.deepEqual(disk(),before);
    await h.review();await ev("window.uxProcess=0;window.uxOriginal=app.vault.process;app.vault.process=function(...args){uxProcess++;return uxOriginal.apply(this,args)};{const control=document.querySelector('.ai-safe-apply [data-safe-action=confirm]');control.click();control.click();}void 0");
    await wait("!!document.querySelector('.ai-safe-apply [data-safe-action=undo]')&&!plugin.safeApply.busy");await pass('Double click dispatches one native write; success follows executor',"uxProcess===1&&safeTest.calls===1&&document.activeElement.getAttribute('role')==='status'");
    assert.equal(fs.readFileSync(vault+'/'+await ev('safePlan.sourcePath'),'utf8'),await ev('safePlan.after'));await ev('app.vault.process=uxOriginal;void 0');
    await h.click('.ai-safe-apply [data-safe-action=history]');await wait("!!document.querySelector('.ai-operation-history [data-safe-action=undo]')");
    await pass('Result goes to one history, consumed consent is closed',"document.querySelectorAll('.ai-operation-history').length===1&&!document.querySelector('.ai-safe-apply')");await screenshots(language,'history','.ai-operation-history');
    await h.click('.ai-operation-history [data-safe-action=undo]');await wait("!!document.querySelector('.ai-safe-apply [data-safe-action=undoConfirm]')");
    await ev('window.uxUndoWritten=false;window.uxUndoOriginal=app.vault.process;window.uxUndoGate=new Promise(r=>window.uxUndoRelease=r);app.vault.process=async function(...args){const result=await uxUndoOriginal.apply(this,args);uxUndoWritten=true;await uxUndoGate;return result};void 0');
    await h.click('.ai-safe-apply [data-safe-action=undoConfirm]');await wait('uxUndoWritten');
    await wait("!!document.querySelector('.ai-operation-history [data-safe-action=refresh]')&&!document.querySelector('.ai-operation-history [data-safe-action=undo]')");
    await pass('Lower history invalidation cannot steal focus while Undo writes',"document.querySelector('.ai-safe-apply').contains(document.activeElement)&&document.activeElement.getAttribute('role')==='status'");
    await ev('uxUndoRelease();app.vault.process=uxUndoOriginal;void 0');await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-safe-apply [data-safe-action=history]')");
    await h.click('.ai-safe-apply [data-safe-action=history]');await wait("!!document.querySelector('[data-operation-state=undone]')");
    assert.equal(fs.readFileSync(vault+'/'+await ev('safePlan.sourcePath'),'utf8'),await ev('safePlan.before'));await pass('Undo returns to existing history once and restores exact original',"document.querySelectorAll('.ai-operation-history').length===1&&!document.querySelector('.ai-safe-apply')&&io.network===0");
    snapshots.push({language,before,after:disk()});
  }
  await h.setup('\nStale review\n');await h.plan();await h.review();const journalBefore=disk();
  fs.appendFileSync(vault+'/'+await ev('safePlan.sourcePath'),'\nUSER EDIT\n');await wait("!!document.querySelector('.ai-safe-apply [role=alert]')");
  await pass('Changing a reviewed note revokes Apply visibly',"!document.querySelector('.ai-safe-apply [data-safe-action=confirm]')");
  const onlyJ=x=>Object.fromEntries(Object.entries(x).filter(([p])=>p.includes('/consolidation-')));assert.deepEqual(onlyJ(disk()),onlyJ(journalBefore));await shot('ux-stale-review');
  await h.setup('\nCancelled model\n');await pair();
  await h.click('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");
  await ev('{const session=[...engine.pairInspectors].at(-1).relationship;session.deps.complete=()=>new Promise(r=>window.uxLate=()=>r(JSON.stringify(safeTest.response)));}void 0');
  await h.click('[data-relationship-action=confirm]');await wait("document.querySelector('[data-relationship-stage]')?.dataset.relationshipStage==='running'");
  await h.click('[data-relationship-action=cancel]');await ev('uxLate();void 0');await pass('Cancelled late model result cannot restore action selection',"document.querySelector('[data-relationship-stage]').dataset.relationshipStage==='cancelled'&&!document.querySelector('[data-planner-action=open]')");
  await h.closeAll();await pair();
  await h.click('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");await ev('[...engine.pairInspectors].at(-1).relationship.deps.complete=async()=>{throw Error("synthetic refusal")};void 0');await h.click('[data-relationship-action=confirm]');await wait("document.querySelector('[data-relationship-stage]')?.dataset.relationshipStage==='error'");await shot('ux-provider-error');
  const journal=vault+'/.obsidian/plugins/ai-knowledge-hub/consolidation-operations',id=fs.readdirSync(journal)[0];fs.writeFileSync(journal+'/'+id+'/record.json','{torn');const damaged=disk();
  await restart();await h.history();await pass('Restarted damaged journal exposes manual recovery, never automatic Undo',`(()=>{const r=document.querySelector('[data-operation-id="${id}"]');return r?.dataset.operationState==='conflict'&&!r.querySelector('[data-safe-action=undo]')})()`);assert.deepEqual(disk(),damaged);await shot('ux-damaged-history');
  fs.writeFileSync(root+'/ux-disk-evidence.json',JSON.stringify(snapshots,null,2)+'\n');
  return {status:'PASS',checks,artifactSha256:hash(fs.readFileSync(vault+'/.obsidian/plugins/ai-knowledge-hub/main.js')),limits:'Fresh synthetic Linux desktop. 390 px is a narrow desktop window, not mobile acceptance. Explicit Analyzer responses are local fixtures, not a live provider. No real vault, screen reader or custom-theme acceptance.'};
}
