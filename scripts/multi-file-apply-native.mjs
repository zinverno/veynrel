// Only isolated synthetic vaults. Real Vault.process/DataAdapter and owned-process SIGKILL; fake analysis only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {safeApplyHarness} from './safe-apply-native.mjs';
export async function multiFileApplyScenario(context) {
  const {ev,wait,cdp,root,vault,ROOT,restart,focusMain}=context,checks=[];
  const concurrencyOnly=process.argv.includes('--multi-concurrency-only');
  const journal=vault+'/.obsidian/plugins/ai-knowledge-hub/consolidation-multi-operations';
  const pass=async(name,expr)=>{assert(await ev(expr),name);checks.push(name);console.log(name);};
  const shot=async name=>fs.writeFileSync(root+'/'+name+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  let h,paths,plan,id;
  const history=async()=>{await h.closeAll();await wait('!plugin.safeApply.busy');await ev("app.commands.executeCommandById('ai-knowledge-hub:consolidation-operation-history');void 0");await wait("!!document.querySelector('.ai-operation-history [data-safe-action=refresh]')");};
  const recordId=()=>ev('(async()=> (await plugin.safeApply.multi.journal.entries()).find(e=>e.record?.files[0].path===multiPlan.participants[0])?.id)()');
  const setup=async name=>{
    paths=[`Multi/${name}/A/Same note.md`,`Multi/${name}/Б/Same note.md`];h=safeApplyHarness(context,paths);await h.setup();
    await wait(`!!app.metadataCache.getFileCache(app.vault.getFileByPath(${JSON.stringify(paths[1])}))?.sections`);
    await focusMain();await ev(`engine.inspectPair({leftPath:${JSON.stringify(paths[0])},rightPath:${JSON.stringify(paths[1])}})`);await wait("document.querySelectorAll('.ai-pair-note').length===2");
    await h.click('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");await h.click('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-planner-action=open]')");
    await h.click('[data-planner-action=open]');await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='choosing'");
    for(const[key,value]of[['operation','add_reciprocal_links'],['range-0','1'],['range-1','0']])await ev(`{const el=document.querySelector('[data-planner-field=${key}]');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change'));}void 0`);
    await h.click('[data-planner-field=confirm-0]');await h.click('[data-planner-field=confirm-1]');await h.click('[data-planner-action=buildMulti]');await wait("!!document.querySelector('[data-multi-plan]')");
    await ev('window.multiPlan=[...engine.pairInspectors].at(-1).planner.view.multiPlan;window.multiCalls=safeTest.calls;void 0');plan=await ev('multiPlan');
    await ev(`window.multiTrace=[];if(!window.multiStepBase){multiStepBase=plugin.safeApply.multi.native.step.bind(plugin.safeApply.multi.native);plugin.safeApply.multi.native.step=async(...args)=>{try{return await multiStepBase(...args)}catch(e){multiTrace.push({reason:e.reason,error:String(e),next:args[4],expected:args[1],atFailure:args[2].map((n,i)=>({sameFile:app.vault.getFileByPath(n.path)===n.file,created:n.file.stat.ctime,expectedCreated:args[0].files[i].created,cache:!!app.metadataCache.getFileCache(n.file),resolved:app.metadataCache.getFirstLinkpathDest(n.path.slice(0,-3),args[0].files[i===0?1:0].path)===n.file})),pinned:args[2].map(n=>({path:n.path,modified:n.modified,bytes:n.bytes,stat:n.file.stat})),saved:await Promise.all(args[0].files.map(async f=>({path:f.path,text:await app.vault.read(app.vault.getFileByPath(f.path)),stat:app.vault.getFileByPath(f.path).stat}))),cache:args[5]?args[0].files.map((f,i)=>JSON.stringify(app.metadataCache.getFileCache(app.vault.getFileByPath(f.path)))===JSON.stringify(args[3]?.pair[i].cache)):null});throw e}}}void 0`);
  };
  const review=async()=>{
    const count=await ev("document.querySelectorAll('.ai-multi-apply').length");await h.click('[data-multi-action=review]');
    await wait(`document.querySelectorAll('.ai-multi-apply').length===${count+1}&&!![...document.querySelectorAll('.ai-multi-apply')].at(-1)?.querySelector('[data-multi-action=confirm]')&&!plugin.safeApply.busy`);
  };
  const confirm=async()=>{await h.click('.ai-multi-apply [data-multi-action=confirm]');await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-multi-apply [data-multi-action=history]')");};
  const read=()=>paths.map(p=>fs.readFileSync(vault+'/'+p,'utf8'));
  const singleReview=()=>ev(`(async()=>{const f=multiPlan.files[0],target=multiPlan.files[1],analysis=[...engine.pairInspectors].at(-1).relationship.analysisSource;
    const p={operation:'add_link',sourcePath:f.path,targetPath:target.path,source:analysis.pair[0],target:analysis.pair[1],before:f.before,after:f.after,sourceHash:f.identity.contentHash,targetHash:target.identity.contentHash,selection:f.userSelection.range,edit:f.edits[0],affectedLinks:{added:f.links.added,target:target.path,preserved:f.links.preserved},provenance:{...multiPlan.provenance,userOperation:'add_link'},limitations:[],modelLimitations:[]};
    try{window.multiSingleTicket=await plugin.safeApply.review(p,analysis,()=>true);return 'ready'}catch(e){return e.reason}})()`);
  const reverse=async(targetId=id)=>{
    await history();await h.click(`[data-operation-id="${targetId}"] [data-multi-action^="action."]`);
    await wait("!!document.querySelector('.ai-multi-apply [data-multi-action=confirm]')");await confirm();
  };
  for(const language of concurrencyOnly?[]:['en','ru']) {
    h??=safeApplyHarness(context);await h.closeAll();await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'));}void 0`);
    await ev('plugin.settingsSave');await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await ev('app.setting.close();void 0');
    await setup('success-'+language);await review();
    await pass(language+': final separate consent shows both literal diffs; no completion or write',"document.querySelectorAll('.ai-multi-apply [data-multi-preview]').length===2&&document.querySelectorAll('.ai-multi-apply .ai-proposal-diff').length===2&&safeTest.calls===multiCalls&&!document.querySelector('.ai-multi-apply img,.ai-multi-apply iframe')");
    assert.deepEqual(read(),plan.files.map(f=>f.before));
    for(const theme of ['theme-light','theme-dark'])for(const width of [1200,390]) {
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');void 0`);
      await pass(`${language} ${theme} ${width}: consent fits and is translated`,"[...document.querySelectorAll('.ai-multi-apply,.ai-multi-apply pre,.ai-multi-apply .ai-proposal-diff')].every(e=>e.scrollWidth<=e.clientWidth+1)&&!document.querySelector('.ai-multi-apply').textContent.includes('@multiSafe.')");
      await shot(`multi-apply-${language}-${theme}-${width}`);
    }
    await ev("document.querySelector('.ai-multi-apply [data-multi-action=confirm]').focus();void 0");
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});
    await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-multi-apply [data-multi-action=history]')");
    if(JSON.stringify(read())!==JSON.stringify(plan.files.map(f=>f.after)))fs.writeFileSync(root+'/write-diagnostic.json',JSON.stringify(await ev("({trace:multiTrace,ui:document.querySelector('.ai-multi-apply')?.textContent})"),null,2));
    assert.deepEqual(read(),plan.files.map(f=>f.after));id=await recordId();
    await pass('Native reciprocal writes survive their own inspector invalidation without extra LLM','safeTest.calls===multiCalls');
    await restart();await history();
    await pass(language+': one applied operation survives restart',`document.querySelector('[data-operation-id="${id}"]')?.dataset.multiState==='applied'`);
    await reverse();assert.deepEqual(read(),plan.files.map(f=>f.before));await history();
    await pass('Full native Undo restores both original sources once',`document.querySelector('[data-operation-id="${id}"]')?.dataset.multiState==='undone'&&!document.querySelector('[data-operation-id="${id}"] [data-multi-action]')`);
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
  // Kill at actual IO boundaries; no recovery action runs automatically on restart.
  for(const point of concurrencyOnly?[]:['first-backup','both-backups','before-a','after-a','before-b','after-b','torn-success','undo-b','compensate-a']) {
    await setup(point);await review();
    if(point==='undo-b') {await confirm();id=await recordId();await history();await h.click(`[data-operation-id="${id}"] [data-multi-action]`);await wait("!!document.querySelector('.ai-multi-apply [data-multi-action=confirm]')");}
    if(point==='compensate-a') {
      await ev("window.savedMark=plugin.safeApply.multi.journal.mark.bind(plugin.safeApply.multi.journal);plugin.safeApply.multi.journal.mark=async(r,s)=>{if(s==='apply_a')throw Error('synthetic fault');return savedMark(r,s)};void 0");
      await confirm();id=await recordId();await ev('plugin.safeApply.multi.journal.mark=savedMark;void 0');await history();await h.click(`[data-operation-id="${id}"] [data-multi-action]`);await wait("!!document.querySelector('.ai-multi-apply [data-multi-action=confirm]')");
    }
    await ev(`window.killReached=false;window.nativeProcess=plugin.safeApply.port.process.bind(plugin.safeApply.port);window.processCount=0;
      ${['before-a','before-b'].includes(point)?`plugin.safeApply.port.process=async(...args)=>{if(processCount++===${point==='before-a'?0:1}){killReached=true;return new Promise(()=>{})}return nativeProcess(...args)};`:''}
      ${['first-backup','both-backups'].includes(point)?`{const a=app.vault.adapter,k='${point==='first-backup'?'write':'copy'}',fn=a[k].bind(a);a[k]=async(...args)=>{const result=await fn(...args);if(args.some(v=>typeof v==='string'&&v.includes('/consolidation-multi-operations/')&&v.endsWith('${point==='first-backup'?'record.json':'backup.json'}'))){killReached=true;return new Promise(()=>{})}return result}};`:''}
      ${['after-a','after-b','undo-b','compensate-a'].includes(point)?`{const fn=plugin.safeApply.multi.journal.mark.bind(plugin.safeApply.multi.journal);plugin.safeApply.multi.journal.mark=async(r,s)=>{if(s==='${({'after-a':'apply_a','after-b':'apply_b','undo-b':'undo_b','compensate-a':'undo_a'})[point]}'){killReached=true;return new Promise(()=>{})}return fn(r,s)}};`:''}
      ${point==='torn-success'?`{const fn=app.vault.adapter.write.bind(app.vault.adapter);app.vault.adapter.write=async(p,data,...rest)=>{if(p.includes('/consolidation-multi-operations/')&&p.includes('/mark-')&&JSON.parse(data).state==='applied'){await fn(p,data.slice(0,24),...rest);killReached=true;return new Promise(()=>{})}return fn(p,data,...rest)}};`:''}
      void 0`);
    await h.click('.ai-multi-apply [data-multi-action=confirm]');await wait('killReached');id=await recordId();
    const beforeRestart=read();await restart();assert.deepEqual(read(),beforeRestart);await history();
    const expected=['first-backup'].includes(point)?'conflict':['both-backups','before-a'].includes(point)?'prepared':['after-a','before-b'].includes(point)?'partial':point==='undo-b'?'undo_partial':point==='compensate-a'?'undone':'applied';
    await pass(`SIGKILL ${point}: actual ${expected}, no automatic rewrite`, `document.querySelector('[data-operation-id="${id}"]')?.dataset.multiState==='${expected}'`);
    await ev(`document.querySelector('[data-operation-id="${id}"]').scrollIntoView({block:'start'});void 0`);await shot('multi-recovery-'+point);
    if(['partial','undo_partial','applied'].includes(expected)) {await reverse();assert.deepEqual(read(),plan.files.map(f=>f.before));checks.push(point+': separately confirmed compensation/undo restores both originals');}
  }
  await setup('shared-lock');await review();await review();assert.equal(await singleReview(),'ready');
  await ev("window.heldProcess=plugin.safeApply.port.process.bind(plugin.safeApply.port);window.holdOnce=true;plugin.safeApply.port.process=async(...args)=>{if(holdOnce){holdOnce=false;await new Promise(r=>window.releaseShared=r)}return heldProcess(...args)};void 0");
  await h.click('.ai-multi-apply [data-multi-action=confirm]');await wait('!!window.releaseShared');
  await pass('Single-file Apply shares the in-flight multi-file lock',"plugin.safeApply.apply(multiSingleTicket).then(()=>false,e=>e.reason==='busy')");
  await h.click('.ai-multi-apply [data-multi-action=confirm]');
  await wait("!!document.querySelector('.ai-multi-apply [role=alert]')");
  await pass('Second simultaneous consent window cannot dispatch another operation',"plugin.safeApply.busy&&document.querySelectorAll('.ai-multi-apply').length===2");
  await ev('releaseShared();void 0');await wait('!plugin.safeApply.busy');assert.deepEqual(read(),plan.files.map(f=>f.after));
  await ev('plugin.safeApply.port.process=heldProcess;delete window.releaseShared;void 0');id=await recordId();
  await pass('Concurrent confirmations produce one shared journal entry',`(async()=> (await plugin.safeApply.multi.journal.entries()).filter(e=>e.record?.files[0].path===${JSON.stringify(paths[0])}).length===1)()`);
  await setup('user-conflict');await review();
  await ev(`{const fn=plugin.safeApply.multi.journal.mark.bind(plugin.safeApply.multi.journal);window.userConflictMark=fn;plugin.safeApply.multi.journal.mark=async(r,s)=>{if(s==='apply_a')throw Error('synthetic B unavailable');return fn(r,s)}};void 0`);
  await confirm();id=await recordId();await h.closeAll();fs.appendFileSync(vault+'/'+paths[1],'\nLATER USER EDIT\n');
  await wait(`app.vault.read(app.vault.getFileByPath(${JSON.stringify(paths[1])})).then(t=>t.includes('LATER USER EDIT'))`);await history();
  fs.writeFileSync(root+'/conflict-observation.json',JSON.stringify(await ev(`({state:document.querySelector('[data-operation-id="${id}"]')?.dataset.multiState,actions:document.querySelectorAll('[data-operation-id="${id}"] [data-multi-action]').length,sources:[...document.querySelectorAll('[data-operation-id="${id}"] pre.ai-pair-source')].map(e=>e.textContent)})`),null,2));
  await pass('Later B edit blocks compensation; both originals remain available',`document.querySelector('[data-operation-id="${id}"]')?.dataset.multiState==='conflict'&&!document.querySelector('[data-operation-id="${id}"] [data-multi-action]')&&JSON.stringify([...document.querySelectorAll('[data-operation-id="${id}"] pre.ai-pair-source')].map(e=>e.textContent))===JSON.stringify(${JSON.stringify(plan.files.flatMap(f=>[f.before,f.after]))})`);
  assert(read()[1].includes('LATER USER EDIT'));await shot('multi-user-conflict');
  // Full recovery run restarts; the separate lock-only run restores its synthetic hook in place.
  if(concurrencyOnly) await ev('plugin.safeApply.multi.journal.mark=userConflictMark;void 0'); else await restart();
  await setup('editors');await review();await h.click('.ai-multi-apply [data-multi-action=cancel]');
  await ev(`app.workspace.getLeaf(false).openFile(app.vault.getFileByPath(${JSON.stringify(paths[0])}))`);await wait(`app.workspace.getActiveFile()?.path===${JSON.stringify(paths[0])}`);
  await h.click('[data-multi-action=review]');await wait("!!document.querySelector('.ai-multi-apply [role=alert]')");
  await pass('Open native Markdown editor refuses final review before journal or writes',"/редактор|editor/i.test(document.querySelector('.ai-multi-apply [role=alert]').textContent)");assert.deepEqual(read(),plan.files.map(f=>f.before));
  await h.closeAll();await ev('app.workspace.getLeavesOfType("markdown").forEach(l=>l.detach());void 0');
  // An intact legacy operation still uses the same service/history after v2 incidents on independent paths.
  const old=safeApplyHarness(context,['Multi-legacy/A.md','Multi-legacy/B.md']);await old.setup();await old.plan();await old.apply();
  await old.history();await pass('Legacy v1 and shared v2 operations coexist in one history',"!!document.querySelector('[data-operation-state=applied]')&&!!document.querySelector('[data-multi-state]')");
  const first=fs.readdirSync(journal).find(n=>fs.existsSync(journal+'/'+n+'/backup.json'));
  fs.writeFileSync(journal+'/'+first+'/record.json','{');fs.writeFileSync(journal+'/'+first+'/backup.json','{');await history();
  await pass('Both corrupt shared backups retain a visible global conflict',`document.querySelector('[data-operation-id="${first}"]')?.dataset.multiState==='conflict'&&!document.querySelector('[data-operation-id="${first}"] [data-multi-action]')`);
  await setup('global-blocked');await h.click('[data-multi-action=review]');await wait("!!document.querySelector('.ai-multi-apply [role=alert]')");
  assert.equal(await singleReview(),'storage');assert.deepEqual(read(),plan.files.map(f=>f.before));
  await pass('Unknown shared scope blocks both executor families without new Markdown',"!plugin.safeApply.busy");
  await pass('No provider request in shared apply/recovery/undo', 'io.network===0');
  return {status:'PASS',checks,artifactSha256:createHash('sha256').update(fs.readFileSync(ROOT+'/main.js')).digest('hex'),limits:'Synthetic Linux desktop, owned process SIGKILL, native Vault.process and DataAdapter. No physical power loss, independent process, mobile hardware or live provider coverage.'};
}
