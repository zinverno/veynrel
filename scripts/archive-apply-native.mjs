// Synthetic native Archive Apply/Undo: actual Vault.process and owned-process SIGKILL, never paid requests.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {safeApplyHarness} from './safe-apply-native.mjs';

export async function archiveApplyScenario(context) {
  const {ev,wait,cdp,root,vault,ROOT,restart,focusMain}=context, checks=[];
  const fixture=JSON.parse(fs.readFileSync(ROOT+'/tests/fixtures/merge-planner.json','utf8'));
  const journal=vault+'/.obsidian/plugins/ai-knowledge-hub/consolidation-archive-operations';
  const mergeJournal=vault+'/.obsidian/plugins/ai-knowledge-hub/consolidation-merge-operations';
  let h,paths,mergePlan,plan,parentId,id,scenario;
  const pass=async(name,expression)=>{assert(await ev(expression),name);checks.push(name);console.log(name);};
  const shot=async name=>fs.writeFileSync(root+'/'+name+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const field=(selector,value)=>ev(`{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change'));}void 0`);
  const disk=()=>paths.map(p=>fs.readFileSync(vault+'/'+p));
  const expected=(archived=false,merged=true)=>paths.map(p=>Buffer.from(p===mergePlan.canonical.path?(merged?mergePlan.canonical.after:mergePlan.canonical.before):(archived?plan.secondary.after:mergePlan.secondary.content)));
  const files=dir=>fs.existsSync(dir)?fs.readdirSync(dir,{recursive:true}).filter(p=>fs.statSync(dir+'/'+p).isFile()).sort().map(p=>[p,fs.readFileSync(dir+'/'+p)]):[];
  const unrelated=()=>files(vault).filter(([p])=>p.endsWith('.md')&&!paths.includes(p));
  const row=()=>`document.querySelector('[data-operation-id="${id}"]')`;
  const parentRow=()=>`document.querySelector('[data-operation-id="${parentId}"]')`;
  const findId=()=>ev(`(async()=> (await plugin.safeApply.archive.journal.entries()).find(e=>e.record?.plan.provenance.id===${JSON.stringify(parentId)})?.id)()`);
  const setup=async(name,{canonical=0,yaml='',crlf=false}={})=>{
    scenario=name;await ev('if(window.archiveWrites)archiveWrites.active=false;void 0');
    paths=[`ArchiveApply/${name}/Теория/Same name.md`,`ArchiveApply/${name}/Practice/Same name.md`];h=safeApplyHarness(context,paths);Object.assign(h.fixture,fixture);
    h.fixture[canonical===0?'b':'a']=yaml+h.fixture[canonical===0?'b':'a'];
    if(crlf)for(const k of ['a','b'])h.fixture[k]=h.fixture[k].replace(/\n/g,'\r\n')+'\r\nUnicode 👩🏽‍💻 é 中文.\r\n';
    await h.setup();await focusMain();await ev(`engine.inspectPair({leftPath:${JSON.stringify(paths[0])},rightPath:${JSON.stringify(paths[1])}})`);await wait("document.querySelectorAll('.ai-pair-note').length===2");
    await h.click('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");await h.click('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-planner-action=open]')");
    await h.click('[data-planner-action=open]');await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='choosing'");
    await field('[data-planner-field=operation]','merge_knowledge');await field('[data-planner-field=merge-canonical]',canonical);
    const transfer=await ev("[...document.querySelectorAll('[data-planner-field^=merge-transfer-]')][1].dataset.plannerField");
    await h.click(`[data-planner-field=${transfer}]`);await field('[data-planner-field=merge-location]',0);await h.click('[data-planner-field=merge-confirm]');await h.click('[data-merge-action=build]');
    await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='ready'");mergePlan=await ev('[...engine.pairInspectors].at(-1).planner.view.mergePlan');
    await h.click('[data-merge-apply-action=review]');await wait("!!document.querySelector('.ai-merge-apply [data-merge-apply-action=confirm]')");await h.click('.ai-merge-apply [data-merge-apply-action=confirm]');
    await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-merge-apply [data-merge-apply-action=history]')");assert.deepEqual(disk(),expected());
    parentId=await ev(`(async()=> (await plugin.safeApply.merge.journal.entries()).find(e=>e.record?.canonical.path===${JSON.stringify(mergePlan.canonical.path)})?.id)()`);assert(parentId);
    await h.history();await wait(`!!document.querySelector('[data-operation-id="${parentId}"] [data-archive-action=open]')`);await h.click(`[data-operation-id="${parentId}"] [data-archive-action=open]`);
    await wait("document.querySelector('.ai-archive-planner [data-archive-stage]')?.dataset.archiveStage==='choosing'");
    const count=await ev("document.querySelectorAll('.ai-archive-planner [data-archive-fragment]').length");assert(count>0);
    for(let i=0;i<count;i++)await field(`[data-archive-fragment="${i}"]`,i===0?'represented':'retained');
    await field('[data-archive-status]','archived');await h.click('[data-archive-ack]');await h.click('[data-archive-action=build]');await wait("document.querySelector('[data-archive-stage]')?.dataset.archiveStage==='ready'");
    plan=await ev("JSON.parse(document.querySelector('[data-archive-text=json]').textContent)");
    await observe();
  };
  const observe=()=>ev(`window.archiveWrites={active:true,paths:[],other:0,journal:0,calls:window.safeTest?.calls??0};
    if(!window.archiveWriteHooks){archiveWriteHooks=true;
      {const fn=app.vault.process.bind(app.vault);app.vault.process=(f,cb)=>{if(archiveWrites.active)archiveWrites.paths.push(f.path);return fn(f,cb)}}
      for(const k of ['modify','create','delete','rename','append']){const fn=app.vault[k].bind(app.vault);app.vault[k]=(...a)=>{if(archiveWrites.active)archiveWrites.other++;return fn(...a)}}
      for(const k of ['write','copy','mkdir','remove','rename','append']){const fn=app.vault.adapter[k].bind(app.vault.adapter);app.vault.adapter[k]=(...a)=>{if(archiveWrites.active&&a.some(p=>typeof p==='string'&&p.includes('consolidation-')))archiveWrites.journal++;return fn(...a)}}
    }void 0`);
  const review=async()=>{await h.click('[data-archive-action=applyReview]');await wait("!![...document.querySelectorAll('.ai-archive-apply')].at(-1)?.querySelector('[data-archive-apply-action=confirm]')&&!plugin.safeApply.busy");};
  const confirm=async()=>{await h.click('.ai-archive-apply [data-archive-apply-action=confirm]');await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-archive-apply [data-archive-apply-action=history]')");};
  const reverseReview=async()=>{await h.history();await h.click(`[data-operation-id="${id}"] [data-archive-apply-action=undoReview]`);await wait("!!document.querySelector('.ai-archive-apply [data-archive-apply-action=confirm]')");};
  const reverse=async()=>{await reverseReview();const before=disk(),evidence=files(journal);await pass('Separate Undo preview restores only secondary',`document.querySelector('.ai-archive-apply [data-archive-apply-text=before]').textContent===${JSON.stringify(plan.secondary.after)}&&document.querySelector('.ai-archive-apply [data-archive-apply-text=after]').textContent===${JSON.stringify(plan.secondary.before)}&&document.querySelector('.ai-archive-apply [data-archive-apply-text=canonical]').textContent===${JSON.stringify(plan.canonical.content)}`);assert.deepEqual(disk(),before);assert.deepEqual(files(journal),evidence);await shot('archive-undo-'+scenario);await confirm();assert.deepEqual(disk(),expected());};
  for(const language of ['en','ru']) {
    h??=safeApplyHarness(context);await h.closeAll();await ev("if(window.archiveWrites)archiveWrites.active=false;app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'));}void 0`);
    await ev('plugin.settingsSave');await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await ev('app.setting.close();void 0');
    await setup('success-'+language,{canonical:language==='en'?0:1,crlf:language==='ru',yaml:language==='ru'?'---\n# Keep comment\ntags: [one, two]\nrelated: "[[Missing]]"\n---\n\n':''});
    const parent=files(mergeJournal), others=unrelated(), evidence=files(journal);await review();
    await h.click('.ai-archive-apply [data-archive-apply-action=cancel]');
    await pass(language+': cancel consent leaves no Markdown or journal writes',"!document.querySelector('.ai-archive-apply')&&archiveWrites.paths.length===0&&archiveWrites.other===0&&archiveWrites.journal===0");
    assert.deepEqual(files(journal),evidence);assert.deepEqual(disk(),expected());await review();
    await pass(language+': full before/after, canonical, decisions and diff; review has zero writes/completions',`['before','after','canonical'].every(k=>document.querySelector('.ai-archive-apply [data-archive-apply-text='+k+']').parentElement.open)&&document.querySelector('.ai-archive-apply [data-archive-apply-text=before]').textContent===${JSON.stringify(plan.secondary.before)}&&document.querySelector('.ai-archive-apply [data-archive-apply-text=after]').textContent===${JSON.stringify(plan.secondary.after)}&&document.querySelectorAll('.ai-archive-apply [data-archive-apply-text=fragment]').length===${plan.preservation.length}&&!!document.querySelector('.ai-archive-apply .ai-proposal-diff')&&archiveWrites.paths.length===0&&archiveWrites.other===0&&archiveWrites.journal===0&&safeTest.calls===archiveWrites.calls`);
    assert.deepEqual(disk(),expected());assert.deepEqual(files(journal),evidence);
    for(const theme of ['theme-light','theme-dark'])for(const width of [1200,390]) {
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');document.querySelector('.ai-archive-apply').scrollTop=0;void 0`);
      await pass(`${language} ${theme} ${width}: translated full consent fits`,"[...document.querySelectorAll('.ai-archive-apply,.ai-archive-apply pre,.ai-archive-apply .ai-proposal-diff')].every(e=>e.scrollWidth<=e.clientWidth+1)&&!document.querySelector('.ai-archive-apply').textContent.includes('@archive')");await shot(`archive-apply-${language}-${theme}-${width}`);
    }
    await ev("document.querySelector('.ai-archive-apply .ai-proposal-diff').scrollIntoView({block:'center'});void 0");await shot('archive-apply-diff-'+language);
    await ev("document.querySelector('.ai-archive-apply [data-archive-apply-action=confirm]').focus();void 0");await shot('archive-apply-confirm-'+language);
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});
    await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-archive-apply [data-archive-apply-action=history]')");
    if(!disk().every((v,i)=>v.equals(expected(true)[i])))fs.writeFileSync(root+'/archive-write-diagnostic.json',JSON.stringify(await ev("(async()=>({text:document.querySelector('.ai-archive-apply')?.textContent,rows:await plugin.safeApply.archive.history()}))()"),null,2));
    assert.deepEqual(disk(),expected(true));assert.deepEqual(unrelated(),others);assert.deepEqual(files(mergeJournal),parent);id=await findId();assert(id);
    await pass('Only secondary reaches native Vault.process; canonical and other Markdown unchanged',`JSON.stringify(archiveWrites.paths)===JSON.stringify([${JSON.stringify(plan.secondary.path)}])&&archiveWrites.other===0&&safeTest.calls===archiveWrites.calls&&io.network===0`);
    const before=disk();await restart();assert.deepEqual(disk(),before);await observe();await h.history();
    await pass('Active archive blocks parent Merge Undo after restart',`${row()}?.dataset.archiveState==='applied'&&!${parentRow()}?.querySelector('[data-merge-apply-action=undoReview]')&&plugin.safeApply.merge.reviewUndo(${JSON.stringify(parentId)},()=>true).then(()=>false,e=>e.reason==='archive_active')`);
    await reverse();assert.deepEqual(files(mergeJournal),parent);assert.deepEqual(unrelated(),others);await restart();await h.history();
    await pass('Archive Undo receipt permits separate parent Undo after another restart',`${row()}?.dataset.archiveState==='undone'&&!${row()}?.querySelector('[data-archive-apply-action=undoReview]')&&!!${parentRow()}?.querySelector('[data-merge-apply-action=undoReview]')`);
    await ev(`${row()}.scrollIntoView({block:'start'});void 0`);await shot('archive-chain-'+language);
    await h.click(`[data-operation-id="${parentId}"] [data-merge-apply-action=undoReview]`);await wait("!!document.querySelector('.ai-merge-apply [data-merge-apply-action=confirm]')");await h.click('.ai-merge-apply [data-merge-apply-action=confirm]');await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-merge-apply [data-merge-apply-action=history]')");assert.deepEqual(disk(),expected(false,false));assert.deepEqual(unrelated(),others);
    checks.push(language+': complete Merge Apply → Archive Apply → Archive Undo → Merge Undo restores both originals');
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
  for(const point of ['before-backup','first-backup','both-backups','before-write','after-write','torn-applied','undo-intent','undo-after-write','torn-undone']) {
    await setup('crash-'+point);await review();
    if(point.startsWith('undo')||point==='torn-undone'){await confirm();id=await findId();await reverseReview();}
    const parent=files(mergeJournal),others=unrelated();
    await ev(`window.killReached=false;
      ${point==='before-backup'?"plugin.safeApply.archive.journal.prepare=async()=>{killReached=true;return new Promise(()=>{})};":''}
      ${point==='before-write'?"plugin.safeApply.port.process=async()=>{killReached=true;return new Promise(()=>{})};":''}
      ${['first-backup','both-backups'].includes(point)?`{const a=app.vault.adapter,k='${point==='first-backup'?'write':'copy'}',fn=a[k].bind(a);a[k]=async(...args)=>{const result=await fn(...args);if(args.some(v=>typeof v==='string'&&v.includes('/consolidation-archive-operations/')&&v.endsWith('${point==='first-backup'?'record.json':'backup.json'}'))){killReached=true;return new Promise(()=>{})}return result}};`:''}
      ${['after-write','undo-after-write','undo-intent'].includes(point)?`{const j=plugin.safeApply.archive.journal,fn=j.mark.bind(j);j.mark=async(r,s,n)=>{if(s==='${point==='after-write'?'applied':point==='undo-intent'?'undo_intent':'undone'}'){${point==='undo-intent'?'await fn(r,s,n);':''}killReached=true;return new Promise(()=>{})}return fn(r,s,n)}};`:''}
      ${point.startsWith('torn-')?`{const fn=app.vault.adapter.write.bind(app.vault.adapter);app.vault.adapter.write=async(p,data,...rest)=>{if(p.includes('/consolidation-archive-operations/')&&p.includes('/mark-')&&JSON.parse(data).state==='${point==='torn-applied'?'applied':'undone'}'){await fn(p,data.slice(0,24),...rest);killReached=true;return new Promise(()=>{})}return fn(p,data,...rest)}};`:''}void 0`);
    await h.click('.ai-archive-apply [data-archive-apply-action=confirm]');await wait('killReached');id=await findId();
    const before=disk(),evidence=files(journal);await restart();assert.deepEqual(disk(),before);assert.deepEqual(files(journal),evidence);assert.deepEqual(files(mergeJournal),parent);assert.deepEqual(unrelated(),others);await h.history();
    const state=['undo-after-write','torn-undone'].includes(point)?'undone':['after-write','torn-applied','undo-intent'].includes(point)?'applied':'prepared';
    if(point==='before-backup')await pass('SIGKILL before backups: no archive record or Markdown write',`${parentRow()}?.dataset.mergeState==='applied'&&!!${parentRow()}?.querySelector('[data-merge-apply-action=undoReview]')`);
    else {
      await pass(`SIGKILL ${point}: ${state}, no startup writes; parent blocked`,`${row()}?.dataset.archiveState==='${state}'&&!${parentRow()}?.querySelector('[data-merge-apply-action=undoReview]')`);
      await ev(`${row()}.scrollIntoView({block:'start'});void 0`);await shot('archive-recovery-'+point);
      if(point==='after-write'||point==='undo-intent') {
        await reverse();await h.history();
        await pass(point==='after-write'?'Recovered Archive Undo restores text but missing applied receipt blocks Merge Undo':'Explicit Undo after persisted intent completes the provable chain',point==='after-write'?`!${parentRow()}?.querySelector('[data-merge-apply-action=undoReview]')`:`!!${parentRow()}?.querySelector('[data-merge-apply-action=undoReview]')`);
      } else await pass(point+': no unsafe automatic Undo',`!${row()}?.querySelector('[data-archive-apply-action=undoReview]')`);
    }
    assert.deepEqual(files(mergeJournal),parent);assert.deepEqual(unrelated(),others);assert.equal(fs.readFileSync(vault+'/'+plan.canonical.path,'utf8'),plan.canonical.content);
  }
  await setup('backup-error');await review();await ev("window.oldCopy=app.vault.adapter.copy;app.vault.adapter.copy=async()=>{throw Error('synthetic backup failure')};void 0");await confirm();
  await pass('Failed backup writes no Markdown',"archiveWrites.paths.length===0&&!!document.querySelector('.ai-archive-apply [role=alert]')");assert.deepEqual(disk(),expected());await ev('app.vault.adapter.copy=oldCopy;void 0');
  for(const side of ['canonical','secondary'])for(const timing of ['consent','undo']) {
    await setup('edit-'+side+'-'+timing);await review();if(timing==='undo'){await confirm();id=await findId();}
    fs.appendFileSync(vault+'/'+plan[side].path,'\nUSER TEXT\n');await wait(`app.vault.read(app.vault.getFileByPath(${JSON.stringify(plan[side].path)})).then(t=>t.endsWith('USER TEXT\\n'))`);const before=disk();
    if(timing==='consent'){await confirm();await pass(side+' edit after consent refuses archive write',"!!document.querySelector('.ai-archive-apply [role=alert]')&&archiveWrites.paths.length===0");}
    else {await h.history();await pass(side+' edit blocks Archive Undo',`${row()}?.dataset.archiveState==='conflict'&&!${row()}?.querySelector('[data-archive-apply-action=undoReview]')`);}
    assert.deepEqual(disk(),before);await shot('archive-refusal-'+side+'-'+timing);
  }
  for(const popout of [false,true])for(const side of [0,1]) {
    await setup('editor-'+popout+'-'+side);await ev(`(async()=>{window.editorLeaf=app.workspace.getLeaf(${popout?"'window'":"true"});await editorLeaf.openFile(app.vault.getFileByPath(${JSON.stringify(paths[side])}));})()`);await wait(`editorLeaf.view.file?.path===${JSON.stringify(paths[side])}`);await focusMain();
    await h.click('[data-archive-action=applyReview]');await wait("!!document.querySelector('.ai-archive-apply [role=alert]')");await pass(`${popout?'Popout':'Main'} editor ${side} refuses archive consent`,"/редактор|editor/i.test(document.querySelector('.ai-archive-apply [role=alert]').textContent)&&archiveWrites.paths.length===0");assert.deepEqual(disk(),expected());await shot(`archive-editor-${popout}-${side}`);
    await h.closeAll();await ev('editorLeaf.detach();void 0');await focusMain();
  }
  for(const family of ['consolidation-operations','consolidation-multi-operations','consolidation-merge-operations','consolidation-archive-operations']) {
    await setup('block-'+family);await review();const dir=vault+'/.obsidian/plugins/ai-knowledge-hub/'+family;fs.mkdirSync(dir,{recursive:true});const incident=dir+'/synthetic-unknown.json';fs.writeFileSync(incident,'{}');await confirm();
    await pass(family+': global incident after consent blocks writing',"!!document.querySelector('.ai-archive-apply [role=alert]')&&archiveWrites.paths.length===0");assert.deepEqual(disk(),expected());fs.unlinkSync(incident);
  }
  await setup('parent-corrupt');await review();fs.writeFileSync(mergeJournal+'/'+parentId+'/backup.json','{partial');await confirm();
  await pass('Damaged parent recovery copy after consent prevents archive write',"!!document.querySelector('.ai-archive-apply [role=alert]')&&archiveWrites.paths.length===0");assert.deepEqual(disk(),expected());
  await setup('callback-conflict');await review();await ev("window.realArchiveProcess=app.vault.process;app.vault.process=(f,cb)=>realArchiveProcess(f,current=>cb(current+'\\nEXTERNAL RACE'));void 0");await confirm();assert.deepEqual(disk(),expected());
  await pass('Actual Vault.process callback refuses a different before',"!!document.querySelector('.ai-archive-apply [role=alert]')");await ev('app.vault.process=realArchiveProcess;void 0');
  await setup('two-windows');await review();await review();await ev("window.heldArchiveProcess=plugin.safeApply.port.process.bind(plugin.safeApply.port);plugin.safeApply.port.process=async(...a)=>{await new Promise(r=>window.releaseArchive=r);return heldArchiveProcess(...a)};void 0");
  await h.click('.ai-archive-apply [data-archive-apply-action=confirm]');await wait('!!window.releaseArchive');await h.click('.ai-archive-apply [data-archive-apply-action=confirm]');await wait("!!document.querySelector('.ai-archive-apply [role=alert]')");
  await pass('Second archive confirmation and all Undo/resolution services share the busy owner',`(async()=>{for(const run of [()=>plugin.safeApply.reviewUndo('id',()=>true),()=>plugin.safeApply.multi.reviewUndo('id',()=>true),()=>plugin.safeApply.merge.reviewUndo(${JSON.stringify(parentId)},()=>true),()=>plugin.safeApply.reviewResolution('id',()=>true)]){try{await run();return false}catch(e){if(e.reason!=='busy')return false}}return archiveWrites.paths.length===0})()`);
  await ev('releaseArchive();void 0');await wait('!plugin.safeApply.busy');assert.deepEqual(disk(),expected(true));await ev('plugin.safeApply.port.process=heldArchiveProcess;void 0');
  await pass('Archive scenarios made no paid/network requests','io.network===0&&safeTest.calls===archiveWrites.calls');
  return {status:'PASS',checks,artifactSha256:createHash('sha256').update(fs.readFileSync(ROOT+'/main.js')).digest('hex'),
    limits:'Synthetic Linux desktop with actual popouts, Vault.process and owned-process SIGKILL. 390 px is desktop emulation, not physical mobile. No paid model, other OS, custom theme or screen-reader acceptance; no filesystem atomicity/fsync/ACID or cross-process exclusion claim. Incomplete receipt chains intentionally block parent Merge Undo.'};
}
