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
  const editor=await safeApplyEditorScenario(context);checks.push(...editor.checks);
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
  return {status:'PASS',checks,editorCases:editor.cases,artifactSha256:createHash('sha256').update(fs.readFileSync(ROOT+'/main.js')).digest('hex'),
    limits:'Synthetic Linux desktop, public native Vault.process/DataAdapter; SIGKILL process interruption, not physical power failure. No mobile, multi-process vault access, custom editor, screen reader or live provider acceptance.'};
}


/** Isolate the editor guard from native autosave; do not race a timer to assert an error word. */
export async function safeApplyEditorScenario(context) {
  const {ev,wait,cdp,root,vault}=context, {a,setup,plan,closeAll}=safeApplyHarness(context), checks=[], cases=[];
  const journal=vault+'/.obsidian/plugins/ai-knowledge-hub/consolidation-operations';
  const journalHashes=()=>Object.fromEntries((fs.existsSync(journal)?fs.readdirSync(journal,{recursive:true}):[])
    .filter(p=>fs.statSync(journal+'/'+p).isFile()).sort().map(p=>[p,createHash('sha256').update(fs.readFileSync(journal+'/'+p)).digest('hex')]));
  for(const mode of ['clean','dirty','autosaved']) {
    await setup('\nEditor '+mode+' scenario.\n');await plan();
    const before={markdown:fs.readFileSync(vault+'/'+a,'utf8'),journal:journalHashes(),entries:await ev("(async()=>{return (await plugin.safeApply.journal.entries()).map(e=>({id:e.id,scope:e.scope,damaged:e.damaged,resolved:!!e.resolution,issues:e.issues,marks:e.marks}))})()")};
    assert(before.entries.every(e=>!e.damaged||e.resolved),'Editor fixture must not contain an unresolved journal incident');
    // Public host APIs only; wrappers are restored and any queued native save released in finally.
    await ev(`window.editorProbe={mode:${JSON.stringify(mode)},events:[],snapshots:[],process:0,held:false,saved:false,cacheChanged:false};
      window.editorSnapshot=label=>editorProbe.snapshots.push({label,time:performance.now(),
        notes:[safePlan.source,safePlan.target].map(n=>({path:n.path,stat:{...n.file.stat},expectedModified:n.modified,expectedBytes:n.bytes,
          sameFile:app.vault.getFileByPath(n.path)===n.file,cacheMatchesPlan:JSON.stringify(app.metadataCache.getFileCache(n.file))===JSON.stringify(n.cache)})),
        editors:app.workspace.getLeavesOfType('markdown').map(l=>({path:l.view.file?.path,buffer:l.view.editor?.getValue(),viewData:l.view.getViewData?.()}))});
      editorProbe.original={modify:app.vault.modify,process:app.vault.process,check:plugin.safeApply.port.check};
      editorProbe.gate=new Promise(resolve=>editorProbe.releaseSave=resolve);
      app.vault.modify=async function(f,data,...rest){
        if(f.path!==safePlan.sourcePath)return editorProbe.original.modify.call(this,f,data,...rest);
        editorProbe.events.push({event:'native-save-request',time:performance.now(),data});
        if(editorProbe.mode==='dirty'){editorProbe.held=true;await editorProbe.gate;}
        const result=await editorProbe.original.modify.call(this,f,data,...rest);editorProbe.saved=true;
        editorProbe.events.push({event:'native-save-complete',time:performance.now()});return result;
      };
      app.vault.process=function(...args){editorProbe.process++;return editorProbe.original.process.apply(this,args)};
      editorProbe.cacheRef=app.metadataCache.on('changed',(f,data)=>{if(f.path===safePlan.sourcePath&&data==='UNSAVED USER BUFFER')editorProbe.cacheChanged=true});
      plugin.safeApply.port.check=async function(...args){editorSnapshot('check-start');
        try{if(editorProbe.mode==='autosaved')await new Promise(resolve=>editorProbe.resumeReview=resolve);
          editorSnapshot('check-sources');return await editorProbe.original.check.apply(this,args);
        }catch(e){editorProbe.error={name:e.constructor.name,reason:e.reason,message:e.message};editorSnapshot('check-failed');throw e}};
      editorSnapshot('before-open');void 0`);
    try {
      await ev(`app.workspace.getLeaf('tab').openFile(app.vault.getFileByPath(${JSON.stringify(a)}))`);
      await wait(`app.workspace.getLeavesOfType('markdown').some(l=>l.view.file?.path===${JSON.stringify(a)}&&l.view.editor?.getValue()===safePlan.before)`);
      // Capture the explicit user action before changing the editor; autosaved mode pauses its check, not its result.
      await ev(`editorSnapshot('opened');window.editorReviewButton=document.querySelector('[data-safe-action=review]');
        if(editorProbe.mode!=='clean')app.workspace.getLeavesOfType('markdown').find(l=>l.view.file?.path===safePlan.sourcePath).view.editor.setValue('UNSAVED USER BUFFER');
        editorSnapshot('buffer-set');if(editorProbe.mode!=='dirty')editorReviewButton.click();void 0`);
      if(mode==='dirty') {
        await wait('editorProbe.held');
        assert.equal(fs.readFileSync(vault+'/'+a,'utf8'),before.markdown);
        await ev('editorReviewButton.click();void 0');
      } else if(mode==='autosaved') {
        await wait('!!editorProbe.resumeReview&&editorProbe.saved&&editorProbe.cacheChanged');
        assert.equal(fs.readFileSync(vault+'/'+a,'utf8'),'UNSAVED USER BUFFER');
        await ev('editorSnapshot("autosaved");editorProbe.resumeReview();void 0');
      }
      await wait("!!document.querySelector('.ai-safe-apply [role=alert]')");
      const observed=await ev("editorSnapshot('refused');({error:editorProbe.error,snapshots:editorProbe.snapshots,events:editorProbe.events,process:editorProbe.process,held:editorProbe.held,saved:editorProbe.saved,cacheChanged:editorProbe.cacheChanged,message:document.querySelector('.ai-safe-apply [role=alert]').textContent,confirm:!!document.querySelector('.ai-safe-apply [data-safe-action=confirm]')})");
      const after={markdown:fs.readFileSync(vault+'/'+a,'utf8'),journal:journalHashes()};
      cases.push({mode,before,observed,after});fs.writeFileSync(root+'/safe-editor-cases.json',JSON.stringify(cases,null,2)+'\n');
      assert.deepEqual(observed.error,{name:mode==='autosaved'?'ChangePlanError':'SafeApplyError',reason:mode==='autosaved'?'source':'editor',message:mode==='autosaved'?'source':'editor'});
      assert.match(observed.message,mode==='autosaved'?/Требуется новый план|Prepare a new plan/:/редактор|editor/);
      assert.equal(observed.process,0);assert.equal(observed.confirm,false);assert.deepEqual(after.journal,before.journal);
      assert.equal(after.markdown,mode==='autosaved'?'UNSAVED USER BUFFER':before.markdown);
      const source=observed.snapshots.at(-1).notes[0], editor=observed.snapshots.at(-1).editors.find(e=>e.path===a);
      assert(source.sameFile);assert.equal(editor.buffer,mode==='clean'?before.markdown:'UNSAVED USER BUFFER');assert.equal(editor.viewData,editor.buffer);
      assert.equal(source.stat.mtime===source.expectedModified,mode!=='autosaved');
      assert.equal(source.cacheMatchesPlan,mode!=='autosaved');
      assert.equal(observed.saved,mode==='autosaved');assert.equal(observed.held,mode==='dirty');
      fs.writeFileSync(root+'/safe-editor-'+mode+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
      const name=mode==='dirty'?'Open native Markdown editor blocks automatic write':mode==='clean'?'Even a saved open editor blocks automatic write':'Native autosave invalidates the old plan before the editor guard, without executor writes';
      checks.push(name);console.log(name);
    } finally {
      await ev('app.vault.modify=editorProbe.original.modify;app.vault.process=editorProbe.original.process;plugin.safeApply.port.check=editorProbe.original.check;app.metadataCache.offref(editorProbe.cacheRef);editorProbe.releaseSave();editorProbe.resumeReview?.();void 0');
      if(mode==='dirty'&&await ev('editorProbe.held'))await wait('editorProbe.saved');
      await closeAll();
    }
  }
  return {status:'PASS',checks,cases};
}
