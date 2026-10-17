// Synthetic Linux Obsidian acceptance: real Vault.process/DataAdapter, owned-process SIGKILL, fake analysis only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {safeApplyHarness} from './safe-apply-native.mjs';

export async function mergeApplyScenario(context) {
  const {ev,wait,cdp,root,vault,ROOT,restart,focusMain}=context, checks=[];
  const fixture=JSON.parse(fs.readFileSync(ROOT+'/tests/fixtures/merge-planner.json','utf8'));
  const journal=vault+'/.obsidian/plugins/ai-knowledge-hub/consolidation-merge-operations';
  let h, paths, plan, id;
  const pass=async(name,expr)=>{assert(await ev(expr),name);checks.push(name);console.log(name);};
  const disk=()=>paths.map(p=>fs.readFileSync(vault+'/'+p));
  const originals=()=>paths.map(p=>Buffer.from(p===plan.canonical.path?plan.canonical.before:plan.secondary.content));
  const applied=()=>paths.map(p=>Buffer.from(p===plan.canonical.path?plan.canonical.after:plan.secondary.content));
  const shot=async name=>fs.writeFileSync(root+'/'+name+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const field=(name,value)=>ev(`{const e=document.querySelector('[data-planner-field=${name}]');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change'));}void 0`);
  const history=async()=>{await h.closeAll();await wait('!plugin.safeApply.busy');await ev("app.commands.executeCommandById('ai-knowledge-hub:consolidation-operation-history');void 0");await wait("!!document.querySelector('.ai-operation-history [data-safe-action=refresh]')");};
  const recordId=()=>ev(`(async()=> (await plugin.safeApply.merge.journal.entries()).find(e=>e.record?.canonical.path===${JSON.stringify(plan.canonical.path)})?.id)()`);
  const row=()=>`document.querySelector('[data-operation-id="${id}"]')`;
  const setup=async(name,{canonical=0,count=1,crlf=false,rich=false}={})=>{
    paths=[`MergeApply/${name}/Теория/Same name.md`,`MergeApply/${name}/Practice/Same name.md`];h=safeApplyHarness(context,paths);
    Object.assign(h.fixture,fixture);
    if(crlf){h.fixture.a=fixture.a.replace(/\n/g,'\r\n')+'\r\nUnicode: 👩🏽‍💻 é 中文.\r\nSecond line.\r\n';h.fixture.b=fixture.b.replace(/\n/g,'\r\n');}
    if(rich)h.fixture.a='---\nauthor: Synthetic Ada\n---\n\n'+fixture.a+'\n[[Missing source]] ![[Missing embed]]\n';
    await h.setup();await wait(`!!app.metadataCache.getFileCache(app.vault.getFileByPath(${JSON.stringify(paths[1])}))?.sections`);
    await focusMain();await ev(`engine.inspectPair({leftPath:${JSON.stringify(paths[0])},rightPath:${JSON.stringify(paths[1])}})`);await wait("document.querySelectorAll('.ai-pair-note').length===2");
    await h.click('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");await h.click('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-planner-action=open]')");
    await h.click('[data-planner-action=open]');await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='choosing'");
    await ev('window.mergeSession=[...engine.pairInspectors].at(-1).planner;window.mergeAnalysis=[...engine.pairInspectors].at(-1).relationship.analysisSource;void 0');
    await field('operation','merge_knowledge');await field('merge-canonical',canonical);
    const eligible=await ev("[...document.querySelectorAll('[data-planner-field^=merge-transfer-]')].map(e=>({key:e.dataset.plannerField,disabled:e.disabled}))");
    const selected=[eligible[1],...(count>1?[eligible.at(-1)]:[])];
    for(const block of selected){assert(!block.disabled,'selected native whole paragraph');await h.click(`[data-planner-field=${block.key}]`);}
    await field('merge-location',0);await h.click('[data-planner-field=merge-confirm]');await h.click('[data-merge-action=build]');await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='ready'");
    await ev('window.mergePlan=mergeSession.view.mergePlan;window.mergeCalls=safeTest.calls;void 0');plan=await ev('mergePlan');assert.deepEqual(disk(),originals());
    // Observe only product process calls; fixture writes remain explicit Node filesystem setup.
    await ev("window.mergeProcessPaths=[];if(!window.mergeOriginalProcess){mergeOriginalProcess=app.vault.process.bind(app.vault);app.vault.process=(f,cb)=>{mergeProcessPaths.push(f.path);return mergeOriginalProcess(f,cb)}};void 0");
  };
  const review=async()=>{
    const count=await ev("document.querySelectorAll('.ai-merge-apply').length");await h.click('[data-merge-apply-action=review]');
    await wait(`document.querySelectorAll('.ai-merge-apply').length===${count+1}&&!![...document.querySelectorAll('.ai-merge-apply')].at(-1)?.querySelector('[data-merge-apply-action=confirm]')&&!plugin.safeApply.busy`);
  };
  const confirm=async()=>{await h.click('.ai-merge-apply [data-merge-apply-action=confirm]');await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-merge-apply [data-merge-apply-action=history]')");};
  const reverse=async()=>{
    await history();await h.click(`[data-operation-id="${id}"] [data-merge-apply-action=undoReview]`);await wait("!!document.querySelector('.ai-merge-apply [data-merge-apply-action=confirm]')");
    await pass('Undo preview reverses only canonical; secondary remains literal',`document.querySelector('.ai-merge-apply [data-merge-apply-text=before]').textContent===${JSON.stringify(plan.canonical.after)}&&document.querySelector('.ai-merge-apply [data-merge-apply-text=after]').textContent===${JSON.stringify(plan.canonical.before)}&&document.querySelector('.ai-merge-apply [data-merge-apply-text=secondary]').textContent===${JSON.stringify(plan.secondary.content)}`);
    assert.deepEqual(disk(),applied());await confirm();assert.deepEqual(disk(),originals());
  };
  for(const language of ['en','ru']) {
    h??=safeApplyHarness(context);await h.closeAll();await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'));}void 0`);
    await ev('plugin.settingsSave');await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await ev('app.setting.close();void 0');
    await setup('success-'+language,{canonical:language==='en'?0:1,count:language==='en'?1:2,crlf:language==='ru',rich:language==='en'});await review();
    await pass(language+': full before/after, copied ranges, secondary and literal diff precede consent',"document.querySelectorAll('.ai-merge-apply .ai-proposal-diff').length===1&&['before','after','secondary'].every(k=>document.querySelector('.ai-merge-apply [data-merge-apply-text='+k+']')?.parentElement.open)&&document.querySelector('.ai-merge-apply [data-merge-apply-text=before]').textContent===mergePlan.canonical.before&&document.querySelector('.ai-merge-apply [data-merge-apply-text=after]').textContent===mergePlan.canonical.after&&document.querySelector('.ai-merge-apply [data-merge-apply-text=secondary]').textContent===mergePlan.secondary.content&&document.querySelector('.ai-merge-apply [data-merge-apply-text=anchor]').textContent===mergePlan.insertion.anchor.text&&safeTest.calls===mergeCalls&&mergeProcessPaths.length===0");
    assert.deepEqual(disk(),originals());
    for(const theme of ['theme-light','theme-dark'])for(const width of [1200,390]) {
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');document.querySelector('.ai-merge-apply').scrollTop=0;void 0`);
      await pass(`${language} ${theme} ${width}: localized consent, full sources and diff fit`,"[...document.querySelectorAll('.ai-merge-apply,.ai-merge-apply pre,.ai-merge-apply .ai-proposal-diff')].every(e=>e.scrollWidth<=e.clientWidth+1)&&!document.querySelector('.ai-merge-apply').textContent.includes('@mergeApply.')&&!document.querySelector('.ai-merge-apply img,.ai-merge-apply iframe')");await shot(`merge-apply-${language}-${theme}-${width}`);
    }
    await ev("document.querySelector('.ai-merge-apply .ai-proposal-diff').scrollIntoView({block:'center'});void 0");await shot('merge-apply-diff-'+language);
    await ev("document.querySelector('.ai-merge-apply [data-merge-apply-action=confirm]').focus();void 0");await shot('merge-apply-confirm-'+language);
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});
    await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-merge-apply [data-merge-apply-action=history]')");
    if(!disk().every((v,i)=>v.equals(applied()[i])))fs.writeFileSync(root+'/merge-write-diagnostic.json',JSON.stringify(await ev("({text:document.querySelector('.ai-merge-apply')?.textContent,plan:mergePlan,stat:mergeAnalysis.pair.map(n=>n.file.stat)})"),null,2));
    assert.deepEqual(disk(),applied());id=await recordId();
    await pass('Only canonical is sent to real Vault.process, no extra completion',`JSON.stringify(mergeProcessPaths)===JSON.stringify([${JSON.stringify(plan.canonical.path)}])&&safeTest.calls===mergeCalls`);
    const beforeRestart=disk();await restart();assert.deepEqual(disk(),beforeRestart);await history();
    await pass(language+': applied journal survives restart, no automatic Undo',`${row()}?.dataset.mergeState==='applied'&&!!${row()}?.querySelector('[data-merge-apply-action=undoReview]')`);
    await reverse();await history();await pass('Explicit Undo restores canonical exactly; no repeated Undo',`${row()}?.dataset.mergeState==='undone'&&!${row()}?.querySelector('[data-merge-apply-action=undoReview]')`);
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
  for(const point of ['first-backup','both-backups','before-write','after-write','torn-applied','undo-after-write','torn-undone']) {
    await setup(point);await review();
    if(point.startsWith('undo')||point==='torn-undone') {await confirm();id=await recordId();await history();await h.click(`[data-operation-id="${id}"] [data-merge-apply-action=undoReview]`);await wait("!!document.querySelector('.ai-merge-apply [data-merge-apply-action=confirm]')");}
    await ev(`window.killReached=false;
      ${point==='before-write'?"plugin.safeApply.port.process=async()=>{killReached=true;return new Promise(()=>{})};":''}
      ${['first-backup','both-backups'].includes(point)?`{const a=app.vault.adapter,k='${point==='first-backup'?'write':'copy'}',fn=a[k].bind(a);a[k]=async(...args)=>{const result=await fn(...args);if(args.some(v=>typeof v==='string'&&v.includes('/consolidation-merge-operations/')&&v.endsWith('${point==='first-backup'?'record.json':'backup.json'}'))){killReached=true;return new Promise(()=>{})}return result}};`:''}
      ${['after-write','undo-after-write'].includes(point)?`{const fn=plugin.safeApply.merge.journal.mark.bind(plugin.safeApply.merge.journal);plugin.safeApply.merge.journal.mark=async(r,s,n)=>{if(s==='${point==='after-write'?'applied':'undone'}'){killReached=true;return new Promise(()=>{})}return fn(r,s,n)}};`:''}
      ${point.startsWith('torn-')?`{const fn=app.vault.adapter.write.bind(app.vault.adapter);app.vault.adapter.write=async(p,data,...rest)=>{if(p.includes('/consolidation-merge-operations/')&&p.includes('/mark-')&&JSON.parse(data).state==='${point==='torn-applied'?'applied':'undone'}'){await fn(p,data.slice(0,24),...rest);killReached=true;return new Promise(()=>{})}return fn(p,data,...rest)}};`:''}
      void 0`);
    await h.click('.ai-merge-apply [data-merge-apply-action=confirm]');await wait('killReached');id=await recordId();
    const beforeRestart=disk();assert.equal(beforeRestart[paths.indexOf(plan.secondary.path)].toString(),plan.secondary.content);
    await restart();assert.deepEqual(disk(),beforeRestart);await history();
    const expected=['undo-after-write','torn-undone'].includes(point)?'undone':['after-write','torn-applied'].includes(point)?'applied':'prepared';
    await pass(`SIGKILL ${point}: actual ${expected}, startup writes nothing`,`${row()}?.dataset.mergeState==='${expected}'`);
    await ev(`${row()}.scrollIntoView({block:'start'});void 0`);await shot('merge-recovery-'+point);
    if(point==='after-write'){await reverse();checks.push('Explicit Undo after SIGKILL without applied marker restores original canonical only');}
    if(point.startsWith('torn-')||point==='first-backup')await pass('Damaged evidence blocks automatic Undo and keeps full backup visible',`!${row()}?.querySelector('[data-merge-apply-action=undoReview]')&&!!${row()}?.querySelector('pre')`);
  }
  // Real IO error, not a simulated successful backup.
  await setup('backup-error');await review();
  await ev("window.copyOriginal=app.vault.adapter.copy;app.vault.adapter.copy=async()=>{throw Error('synthetic backup failure')};void 0");await confirm();
  assert.deepEqual(disk(),originals());await pass('Backup error refuses all Markdown writes',"mergeProcessPaths.length===0&&!!document.querySelector('.ai-merge-apply [role=alert]')");await ev('app.vault.adapter.copy=copyOriginal;void 0');
  for(const side of [0,1]) {
    await setup('later-edit-'+side);await review();await confirm();id=await recordId();await h.closeAll();fs.appendFileSync(vault+'/'+paths[side],'\nUSER CONTENT\n');
    await wait(`app.vault.read(app.vault.getFileByPath(${JSON.stringify(paths[side])})).then(t=>t.endsWith('USER CONTENT\\n'))`);const edited=disk();await history();
    await pass(`Later source ${side} edit refuses Undo and preserves recovery text`,`${row()}?.dataset.mergeState==='conflict'&&!${row()}?.querySelector('[data-merge-apply-action=undoReview]')&&!!${row()}?.querySelector('pre')`);assert.deepEqual(disk(),edited);
  }
  await setup('two-confirmations');await review();await review();
  await ev("window.heldProcess=plugin.safeApply.port.process.bind(plugin.safeApply.port);plugin.safeApply.port.process=async(...args)=>{await new Promise(r=>window.releaseMerge=r);return heldProcess(...args)};void 0");
  await h.click('.ai-merge-apply [data-merge-apply-action=confirm]');await wait('!!window.releaseMerge');await h.click('.ai-merge-apply [data-merge-apply-action=confirm]');
  await wait("!!document.querySelector('.ai-merge-apply [role=alert]')");await pass('Competing confirmation window cannot enter shared executor',"plugin.safeApply.busy&&mergeProcessPaths.length===0");
  await ev('releaseMerge();void 0');await wait('!plugin.safeApply.busy');assert.deepEqual(disk(),applied());await ev('plugin.safeApply.port.process=heldProcess;delete window.releaseMerge;void 0');
  for(const kind of ['single','multi']) {
    await setup('shared-lock-'+kind);await review();
    await ev(`(async()=>{window.otherPlanner=new mergeSession.constructor(mergeSession.deps);await otherPlanner.prepare();const pair=otherPlanner.view.input.pair;
      const ranges=pair.map(n=>{const s=n.cache.sections.find(s=>s.type==='paragraph');return {start:s.position.start.offset,end:s.position.end.offset,text:n.content.slice(s.position.start.offset,s.position.end.offset)}});
      ${kind==='single'?"await otherPlanner.build({operation:'add_link',source:0,selection:ranges[0],confirmed:true});window.otherTicket=await plugin.safeApply.review(otherPlanner.view.plan,mergeAnalysis,()=>true);":"await otherPlanner.buildMulti({operation:'add_reciprocal_links',selections:ranges,confirmed:[true,true]});window.otherTicket=await plugin.safeApply.multi.review(otherPlanner.view.multiPlan,mergeAnalysis,()=>true);"}
    })()`);
    await ev("window.heldProcess=plugin.safeApply.port.process.bind(plugin.safeApply.port);plugin.safeApply.port.process=async(...args)=>{await new Promise(r=>window.releaseMerge=r);return heldProcess(...args)};void 0");
    await h.click('.ai-merge-apply [data-merge-apply-action=confirm]');await wait('!!window.releaseMerge');
    await pass(kind+': old executor shares Merge execution lock',`plugin.safeApply${kind==='multi'?'.multi.execute':'.apply'}(otherTicket).then(()=>false,e=>e.reason==='busy')`);
    await ev('releaseMerge();void 0');await wait('!plugin.safeApply.busy');assert.deepEqual(disk(),applied());await ev('plugin.safeApply.port.process=heldProcess;delete window.releaseMerge;void 0');
  }
  // Native editor/popout presence; do not rely on a timer racing an autosave.
  for(const popout of [false,true])for(const side of [0,1]) {
    await setup(`editor-${popout}-${side}`);await review();await h.click('.ai-merge-apply [data-merge-apply-action=cancel]');
    await ev(`(async()=>{window.editorLeaf=app.workspace.getLeaf(${popout?"'window'":"true"});await editorLeaf.openFile(app.vault.getFileByPath(${JSON.stringify(paths[side])}));})()`);
    await wait(`editorLeaf.view.file?.path===${JSON.stringify(paths[side])}`);await focusMain();await h.click('[data-merge-apply-action=review]');await wait("!!document.querySelector('.ai-merge-apply [role=alert]')");
    await pass(`${popout?'Popout':'Main window'} source ${side} refuses consent`,"/редактор|editor/i.test(document.querySelector('.ai-merge-apply [role=alert]').textContent)");assert.deepEqual(disk(),originals());await shot(`merge-editor-${popout}-${side}`);
    await h.closeAll();await ev('editorLeaf.detach();void 0');await focusMain();
  }
  // A global incident in either older journal blocks Merge after review, without a write.
  for(const family of ['consolidation-operations','consolidation-multi-operations']) {
    await setup(family+'-block');await review();const dir=vault+'/.obsidian/plugins/ai-knowledge-hub/'+family;fs.mkdirSync(dir,{recursive:true});const file=dir+'/synthetic-unknown.json';fs.writeFileSync(file,'{}');
    await confirm();await pass(family+': global journal incident checked after consent',"!!document.querySelector('.ai-merge-apply [role=alert]')&&mergeProcessPaths.length===0");assert.deepEqual(disk(),originals());
    // Remove only the fixture-created incident, never product recovery data.
    fs.unlinkSync(file);
  }
  await pass('No paid/network calls in Merge Apply native scenarios','io.network===0');
  return {status:'PASS',checks,artifactSha256:createHash('sha256').update(fs.readFileSync(ROOT+'/main.js')).digest('hex'),
    limits:'Synthetic Linux desktop including real popout editors; 390 px is a desktop viewport, not physical mobile. SIGKILL of the owned process, not power loss. No fsync/ACID/filesystem atomicity or cross-process vault lock claim. Torn journal markers deliberately require manual review. Fake analysis, no provider quality or semantic-completeness claim.'};
}
