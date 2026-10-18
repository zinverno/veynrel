// Synthetic Linux Obsidian acceptance: real Vault.process/DataAdapter, owned-process SIGKILL, fake analysis only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {safeApplyHarness} from './safe-apply-native.mjs';

export async function bundleApplyScenario(context) {
  const {ev,wait,cdp,root,vault,ROOT,restart,focusMain}=context, checks=[];
  const corpusBytes=fs.readFileSync(ROOT+'/tests/fixtures/consolidation-realistic-v1.json');
  const corpus=JSON.parse(corpusBytes);
  assert.equal(createHash('sha256').update(corpusBytes).digest('hex'),'dc7cfdf692791552abd9b06c128f6a2c78f666882b159412b647ef747ef0cda8');
  const journal=vault+'/.obsidian/plugins/ai-knowledge-hub/consolidation-bundle-operations';
  let h, paths, plan, id, allBefore, secondaryStat;
  const allMarkdown=()=>Object.fromEntries(fs.readdirSync(vault,{recursive:true}).filter(p=>p.endsWith(".md")).sort().map(p=>[p,fs.readFileSync(vault+"/"+p).toString("base64")]));
  const otherFilesUnchanged=()=>{const saved=allMarkdown();delete saved[plan.canonical.path];const before={...allBefore};delete before[plan.canonical.path];assert.deepEqual(saved,before);const stat=fs.statSync(vault+"/"+plan.secondary.path);assert.deepEqual([stat.birthtimeMs,stat.mtimeMs,stat.size],secondaryStat)};
  const pass=async(name,expr)=>{assert(await ev(expr),name);checks.push(name);console.log(name);};
  const disk=()=>paths.map(p=>fs.readFileSync(vault+'/'+p));
  const originals=()=>paths.map(p=>Buffer.from(p===plan.canonical.path?plan.canonical.before:plan.secondary.content));
  const applied=()=>paths.map(p=>Buffer.from(p===plan.canonical.path?plan.canonical.after:plan.secondary.content));
  const shot=async name=>fs.writeFileSync(root+'/'+name+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const field=(name,value)=>ev(`{const e=document.querySelector('[data-planner-field=${name}]');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change'));}void 0`);
  const history=async()=>{await h.closeAll();await wait('!plugin.safeApply.busy');await ev("app.commands.executeCommandById('ai-knowledge-hub:consolidation-operation-history');void 0");await wait("!!document.querySelector('.ai-operation-history [data-safe-action=refresh]')");};
  const recordId=()=>{otherFilesUnchanged();return ev(`(async()=> (await plugin.safeApply.bundle.journal.entries()).find(e=>e.record?.plan.canonical.path===${JSON.stringify(plan.canonical.path)})?.id)()`);};
  const row=()=>`document.querySelector('[data-operation-id="${id}"]')`;
  const journalHashes=()=>Object.fromEntries((fs.existsSync(journal)?fs.readdirSync(journal,{recursive:true}):[]).filter(p=>fs.statSync(journal+'/'+p).isFile()).sort().map(p=>[p,createHash('sha256').update(fs.readFileSync(journal+'/'+p)).digest('hex')]));
  const setup=async(name,{canonical=0,caseId='07',crlf=false}={})=>{
    const c=corpus.cases.find(c=>c.id===caseId);
    paths=[`BundleApply/${name}/Теория/Same name.md`,`BundleApply/${name}/Practice/Same name.md`];h=safeApplyHarness(context,paths);
    const notes=canonical===0?c.notes:[...c.notes].reverse();
    const response=structuredClone(c.controlResponse);
    if(canonical===1)for(const claim of response.claims){[claim.quoteA,claim.quoteB]=[claim.quoteB,claim.quoteA];claim.kind=claim.kind.replace(/_a$/,'_temp').replace(/_b$/,'_a').replace(/_temp$/,'_b')}
    if(crlf)for(const claim of response.claims)for(const key of ['quoteA','quoteB'])if(claim[key])claim[key]=claim[key].replace(/\n/g,'\r\n');
    h.fixture.a=crlf?notes[0].replace(/\n/g,'\r\n'):notes[0];h.fixture.b=crlf?notes[1].replace(/\n/g,'\r\n'):notes[1];h.fixture.response=response;
    await h.setup();await wait(`!!app.metadataCache.getFileCache(app.vault.getFileByPath(${JSON.stringify(paths[1])}))?.sections`);
    await focusMain();await ev(`engine.inspectPair({leftPath:${JSON.stringify(paths[0])},rightPath:${JSON.stringify(paths[1])}})`);await wait("document.querySelectorAll('.ai-pair-note').length===2");
    await h.click('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");await h.click('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-planner-action=open]')");
    await h.click('[data-planner-action=open]');await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='choosing'");
    await ev('window.bundleSession=[...engine.pairInspectors].at(-1).planner;window.bundleAnalysis=[...engine.pairInspectors].at(-1).relationship.analysisSource;void 0');
    await field('operation','copy_context_bundle');await field('bundle-canonical',canonical);
    await field('bundle-kind',({'07':'code_explanation','08':'list_context','09':'quotation_attribution'})[caseId]??'code_explanation');
    if(!['07','08','09'].includes(caseId))return;
    await field('bundle-selection',await ev("document.querySelector('[data-planner-field=bundle-selection]').options[1].value"));
    for(const key of await ev("[...document.querySelectorAll('[data-planner-field^=bundle-context-]')].map(e=>e.dataset.plannerField)"))await h.click(`[data-planner-field=${key}]`);
    await h.click('[data-planner-field=bundle-boundariesConfirmed]');await h.click('[data-planner-field=bundle-contextConfirmed]');
    await field('bundle-dependencies','reviewed');await field('bundle-insertion',await ev(`bundleSession.view.input.pair[${canonical}].content.length`));await h.click('[data-planner-field=bundle-insertionConfirmed]');
    await h.click('[data-bundle-action=build]');await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='ready'");
    await ev('window.bundlePlan=bundleSession.view.bundlePlan;window.bundleCalls=safeTest.calls;void 0');plan=await ev('bundlePlan');assert.deepEqual(disk(),originals());allBefore=allMarkdown();const stat=fs.statSync(vault+'/'+plan.secondary.path);secondaryStat=[stat.birthtimeMs,stat.mtimeMs,stat.size];
    fs.writeFileSync(root+'/'+name+'-plan.json',JSON.stringify(plan,null,2));
    await ev("window.bundleProcessPaths=[];if(!window.bundleOriginalProcess){bundleOriginalProcess=app.vault.process.bind(app.vault);app.vault.process=(f,cb)=>{bundleProcessPaths.push(f.path);return bundleOriginalProcess(f,cb)}};void 0");
  };
  const review=async()=>{
    const count=await ev("document.querySelectorAll('.ai-bundle-apply').length");await h.click('[data-bundle-apply-action=review]');
    await wait(`document.querySelectorAll('.ai-bundle-apply').length===${count+1}&&!![...document.querySelectorAll('.ai-bundle-apply')].at(-1)?.querySelector('[data-bundle-apply-action=confirm]')&&!plugin.safeApply.busy`);
  };
  const confirm=async()=>{await h.click('.ai-bundle-apply [data-bundle-apply-action=confirm]');await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-bundle-apply [data-bundle-apply-action=history]')");};
  const reverse=async()=>{
    await history();await ev("{const n=plugin.safeApply.bundle.native,fn=n.undo.bind(n);n.undo=async(...args)=>{try{return await fn(...args)}catch(e){window.undoFailure={reason:e.reason,stack:e.stack};throw e}}}void 0");await h.click(`[data-operation-id="${id}"] [data-bundle-apply-action=undoReview]`);
    await wait("!!document.querySelector('.ai-bundle-apply [data-bundle-apply-action=confirm],.ai-bundle-apply [role=alert]')");
    if(await ev('!!window.undoFailure'))fs.writeFileSync(root+'/undo-failure.json',JSON.stringify(await ev(`({failure:undoFailure,files:${JSON.stringify(paths)}.map(p=>({path:p,stat:app.vault.getFileByPath(p).stat,cache:app.metadataCache.getFileCache(app.vault.getFileByPath(p))})),text:document.querySelector('.ai-bundle-apply').textContent})`),null,2));
    await wait("!!document.querySelector('.ai-bundle-apply [data-bundle-apply-action=confirm]')");
    await pass('Undo preview reverses only canonical; secondary remains literal',`document.querySelector('.ai-bundle-apply [data-bundle-apply-text=before]').textContent===${JSON.stringify(plan.canonical.after)}&&document.querySelector('.ai-bundle-apply [data-bundle-apply-text=after]').textContent===${JSON.stringify(plan.canonical.before)}&&document.querySelector('.ai-bundle-apply [data-bundle-apply-text=secondary]').textContent===${JSON.stringify(plan.secondary.content)}`);
    assert.deepEqual(disk(),applied());await confirm();assert.deepEqual(disk(),originals());otherFilesUnchanged();
  };
  if(process.argv.includes('--bundle-completion')) {
    const rows=[];
    for(const edited of ['canonical','secondary','none']) {
      await setup('completed-'+edited);await review();
      await ev('window.oldBundleApply=[...plugin.safeApply.bundle.tickets.keys()].at(-1);void 0');await confirm();id=await recordId();
      const evidence=journalHashes();assert.deepEqual(disk(),applied());
      await wait(`app.metadataCache.getFileCache(app.vault.getFileByPath(${JSON.stringify(plan.canonical.path)}))?.sections?.at(-1)?.position.end.offset===${plan.canonical.after.length}`);
      await ev(`(async()=>{window.oldBundleUndo=await plugin.safeApply.bundle.reviewUndo(${JSON.stringify(id)},()=>true)})()`);
      await h.closeAll();
      if(edited!=='none') {
        const path=plan[edited].path,text=fs.readFileSync(vault+'/'+path,'utf8')+'\n\nUSER EDIT: новая проверенная заметка.\n';
        await ev(`window.editReady=false;window.editRef=app.metadataCache.on('changed',(f,data)=>{if(f.path===${JSON.stringify(path)}&&data===${JSON.stringify(text)})editReady=true});void 0`);
        fs.writeFileSync(vault+'/'+path,text);await wait('editReady');await ev('app.metadataCache.offref(editRef);void 0');
      }
      const before=disk();
      if(edited!=='none')await pass(edited+': edited source revokes old Undo consent',`plugin.safeApply.bundle.execute(oldBundleUndo).then(()=>false,()=>true)`);
      await restart();assert.deepEqual(disk(),before);assert.deepEqual(journalHashes(),evidence);
      await pass(edited+': terminal operation releases both paths after restart',`(async()=>{const r=(await plugin.safeApply.bundle.history()).find(e=>e.id===${JSON.stringify(id)});await plugin.safeApply.bundle.blockers(${JSON.stringify(paths)});return r.blocking===false&&r.canUndo===${edited==='none'}})()`);
      if(edited!=='none')await pass(edited+': fresh old Undo review refuses changed sources',`plugin.safeApply.bundle.reviewUndo(${JSON.stringify(id)},()=>true).then(()=>false,()=>true)`);
      else await ev(`(async()=>{window.oldBundleUndo=await plugin.safeApply.bundle.reviewUndo(${JSON.stringify(id)},()=>true)})()`);
      // Fresh scripted analysis quotes a context paragraph occurring once in each current source.
      const quote=plan.bundle.blocks.find(b=>b.role==='context_before'&&b.range.start>0).range.text;
      const response={relation:'partial_overlap',explanation:{text:'Synthetic current-source control.',evidence:['shared']},claims:[{id:'shared',kind:'shared',text:'Shared scoped context.',quoteA:quote,quoteB:quote}],recommendation:{action:'add_link',reason:'Link the current notes.',evidence:['shared']},alternatives:[],limitations:['Scripted control, not a model-quality evaluation.']};
      await ev(`window.safeTest={calls:0,response:${JSON.stringify(response)}};Object.assign(plugin.settings,{provider:'custom',model:'synthetic-safe-apply',apiKey:'synthetic-only',baseUrl:'https://example.invalid/v1'});window.safeBaseFactory=engine.relationshipSession;engine.relationshipSession=paths=>{const s=safeBaseFactory(paths);s.deps.complete=async()=>{safeTest.calls++;return JSON.stringify(safeTest.response)};return s};void 0`);
      await h.plan();await h.review();
      const single=await ev('({before:safePlan.before,after:safePlan.after,sourcePath:safePlan.sourcePath})');assert.equal(single.before,before[0].toString());
      await pass(edited+': current Single-file review succeeds without Markdown writes',`!!document.querySelector('.ai-safe-apply [data-safe-action=confirm]')&&safeTest.calls===1`);
      assert.deepEqual(disk(),before);assert.deepEqual(journalHashes(),evidence);await shot('bundle-completed-'+edited+'-review');
      await h.click('.ai-safe-apply [data-safe-action=confirm]');await wait("!!document.querySelector('.ai-safe-apply [data-safe-action=undo]')&&!plugin.safeApply.busy");
      const after=disk();assert.equal(after[0].toString(),single.after);assert.equal(after[1].toString(),before[1].toString());
      if(edited==='none')await pass('Old Undo ticket cannot overwrite a subsequent Single-file Apply',`plugin.safeApply.bundle.execute(oldBundleUndo).then(()=>false,()=>true)`);
      await pass(edited+': new Apply preserves all current text and invalidates old Bundle Undo',`plugin.safeApply.bundle.reviewUndo(${JSON.stringify(id)},()=>true).then(()=>false,()=>true)`);
      await pass(edited+': completed ID cannot be prepared twice or used by Archive Eligibility',`(async()=>{const r=(await plugin.safeApply.bundle.journal.entries()).find(e=>e.id===${JSON.stringify(id)}).record;const used=await plugin.safeApply.bundle.journal.prepare(r).then(()=>false,e=>e.reason==='used');const archive=await plugin.safeApply.merge.readApplied(r.id,()=>true).then(()=>false,()=>true);return used&&archive})()`);
      assert.deepEqual(disk(),after);assert.deepEqual(journalHashes(),evidence);
      await h.history();await pass(edited+': history keeps evidence, disables old Undo and does not reserve paths',`(async()=>{const r=(await plugin.safeApply.bundle.history()).find(e=>e.id===${JSON.stringify(id)});return !r.canUndo&&!r.blocking&&${row()}?.dataset.bundleState==='conflict'&&!${row()}?.querySelector('[data-bundle-apply-action=undoReview]')})()`);
      await ev(`${row()}.scrollIntoView({block:'start'});void 0`);await shot('bundle-completed-'+edited+'-history');
      rows.push({edited,id,paths,before:before.map(b=>b.toString()),after:after.map(b=>b.toString()),bundleEvidence:evidence});
      await pass(edited+': no paid or additional model requests','io.network===0&&safeTest.calls===1');
    }
    fs.writeFileSync(root+'/bundle-completion-cases.json',JSON.stringify(rows,null,2)+'\n');
    return {status:'PASS',checks,artifactSha256:createHash('sha256').update(fs.readFileSync(ROOT+'/main.js')).digest('hex'),
      limits:'Targeted synthetic Linux desktop: real Vault.process, manual filesystem edits, SIGKILL/restart and fresh explicit consent. Scripted current-source analysis; no paid models. Full visual/fault matrix remains in the original PR95 evidence.'};
  }
  for(const language of ['en','ru'])for(const caseId of ['07','08','09']) {
    h??=safeApplyHarness(context);await h.closeAll();await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'));}void 0`);
    await ev('plugin.settingsSave');await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await ev('app.setting.close();void 0');
    await setup('success-'+language+'-'+caseId,{caseId,canonical:language==='en'?0:1,crlf:language==='ru'});await review();
    await pass(language+': full before/after, copied ranges, secondary and literal diff precede consent',"document.querySelectorAll('.ai-bundle-apply .ai-proposal-diff').length===1&&['before','after','secondary'].every(k=>document.querySelector('.ai-bundle-apply [data-bundle-apply-text='+k+']')?.parentElement.open)&&document.querySelector('.ai-bundle-apply [data-bundle-apply-text=before]').textContent===bundlePlan.canonical.before&&document.querySelector('.ai-bundle-apply [data-bundle-apply-text=after]').textContent===bundlePlan.canonical.after&&document.querySelector('.ai-bundle-apply [data-bundle-apply-text=secondary]').textContent===bundlePlan.secondary.content&&document.querySelector('.ai-bundle-apply [data-bundle-apply-text=insertion]').textContent===JSON.stringify(bundlePlan.insertion,null,2)&&safeTest.calls===bundleCalls&&bundleProcessPaths.length===0");
    assert.deepEqual(disk(),originals());
    for(const theme of ['theme-light','theme-dark'])for(const width of [1200,390]) {
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');document.querySelector('.ai-bundle-apply').scrollTop=0;void 0`);
      await pass(`${language} ${theme} ${width}: localized consent, full sources and diff fit`,"[...document.querySelectorAll('.ai-bundle-apply,.ai-bundle-apply pre,.ai-bundle-apply .ai-proposal-diff')].every(e=>e.scrollWidth<=e.clientWidth+1)&&!document.querySelector('.ai-bundle-apply').textContent.includes('@bundleApply.')&&!document.querySelector('.ai-bundle-apply img,.ai-bundle-apply iframe')");await shot(`bundle-apply-${language}-${caseId}-${theme}-${width}`);
    }
    await ev("document.querySelector('.ai-bundle-apply .ai-proposal-diff').scrollIntoView({block:'center'});void 0");await shot('bundle-apply-diff-'+language+'-'+caseId);
    await ev("document.querySelector('.ai-bundle-apply [data-bundle-apply-action=confirm]').focus();void 0");await shot('bundle-apply-confirm-'+language+'-'+caseId);
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});
    await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-bundle-apply [data-bundle-apply-action=history]')");
    if(!disk().every((v,i)=>v.equals(applied()[i])))fs.writeFileSync(root+'/bundle-write-diagnostic.json',JSON.stringify(await ev("({text:document.querySelector('.ai-bundle-apply')?.textContent,plan:bundlePlan,stat:bundleAnalysis.pair.map(n=>n.file.stat)})"),null,2));
    assert.deepEqual(disk(),applied());id=await recordId();
    await pass('Only canonical is sent to real Vault.process, no extra completion',`JSON.stringify(bundleProcessPaths)===JSON.stringify([${JSON.stringify(plan.canonical.path)}])&&safeTest.calls===bundleCalls`);
    const beforeRestart=disk();await restart();assert.deepEqual(disk(),beforeRestart);await history();
    await pass(language+': applied journal survives restart, no automatic Undo',`${row()}?.dataset.bundleState==='applied'&&!!${row()}?.querySelector('[data-bundle-apply-action=undoReview]')`);
    await reverse();await history();await pass('Explicit Undo restores canonical exactly; no repeated Undo',`${row()}?.dataset.bundleState==='undone'&&!${row()}?.querySelector('[data-bundle-apply-action=undoReview]')`);
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
  for(const point of ['before-backup','first-backup','both-backups','before-write','after-write','torn-applied','undo-intent','undo-after-write','torn-undone']) {
    await setup(point);await review();
    if(point.startsWith('undo')||point==='torn-undone') {await confirm();id=await recordId();await history();await h.click(`[data-operation-id="${id}"] [data-bundle-apply-action=undoReview]`);await wait("!!document.querySelector('.ai-bundle-apply [data-bundle-apply-action=confirm]')");}
    await ev(`window.killReached=false;
      ${point==='before-backup'?"plugin.safeApply.bundle.journal.prepare=async()=>{killReached=true;return new Promise(()=>{})};":''}
      ${point==='undo-intent'?"{const j=plugin.safeApply.bundle.journal,fn=j.mark.bind(j);j.mark=async(...a)=>{await fn(...a);if(a[1]==='undo_intent'){killReached=true;return new Promise(()=>{})}}};":''}
      ${point==='before-write'?"plugin.safeApply.port.process=async()=>{killReached=true;return new Promise(()=>{})};":''}
      ${['first-backup','both-backups'].includes(point)?`{const a=app.vault.adapter,k='${point==='first-backup'?'write':'copy'}',fn=a[k].bind(a);a[k]=async(...args)=>{const result=await fn(...args);if(args.some(v=>typeof v==='string'&&v.includes('/consolidation-bundle-operations/')&&v.endsWith('${point==='first-backup'?'record.json':'backup.json'}'))){killReached=true;return new Promise(()=>{})}return result}};`:''}
      ${['after-write','undo-after-write'].includes(point)?`{const fn=plugin.safeApply.bundle.journal.mark.bind(plugin.safeApply.bundle.journal);plugin.safeApply.bundle.journal.mark=async(r,s,n)=>{if(s==='${point==='after-write'?'applied':'undone'}'){killReached=true;return new Promise(()=>{})}return fn(r,s,n)}};`:''}
      ${point.startsWith('torn-')?`{const fn=app.vault.adapter.write.bind(app.vault.adapter);app.vault.adapter.write=async(p,data,...rest)=>{if(p.includes('/consolidation-bundle-operations/')&&p.includes('/mark-')&&JSON.parse(data).state==='${point==='torn-applied'?'applied':'undone'}'){await fn(p,data.slice(0,24),...rest);killReached=true;return new Promise(()=>{})}return fn(p,data,...rest)}};`:''}
      void 0`);
    await h.click('.ai-bundle-apply [data-bundle-apply-action=confirm]');await wait('killReached');id=await recordId();
    const hashes=journalHashes();const beforeRestart=disk();assert.equal(beforeRestart[paths.indexOf(plan.secondary.path)].toString(),plan.secondary.content);
    await restart();assert.deepEqual(disk(),beforeRestart);assert.deepEqual(journalHashes(),hashes);await history();
    if(point==='before-backup'){assert.equal(id,undefined);checks.push('SIGKILL before backup: no journal or Markdown change');continue}
    const expected=['undo-after-write','torn-undone'].includes(point)?'undone':['after-write','torn-applied','undo-intent'].includes(point)?'applied':'prepared';
    await pass(`SIGKILL ${point}: actual ${expected}, startup writes nothing`,`${row()}?.dataset.bundleState==='${expected}'`);
    await ev(`${row()}.scrollIntoView({block:'start'});void 0`);await shot('bundle-recovery-'+point);
    if(point==='after-write'||point==='undo-intent'){await reverse();checks.push('Explicit Undo after SIGKILL without applied marker restores original canonical only');}
    if(point.startsWith('torn-')||point==='first-backup')await pass('Damaged evidence blocks automatic Undo and keeps full backup visible',`!${row()}?.querySelector('[data-bundle-apply-action=undoReview]')&&!!${row()}?.querySelector('pre')`);
  }
  // Real IO error, not a simulated successful backup.
  await setup('backup-error');await review();
  await ev("window.copyOriginal=app.vault.adapter.copy;app.vault.adapter.copy=async()=>{throw Error('synthetic backup failure')};void 0");await confirm();
  assert.deepEqual(disk(),originals());await pass('Backup error refuses all Markdown writes',"bundleProcessPaths.length===0&&!!document.querySelector('.ai-bundle-apply [role=alert]')");await ev('app.vault.adapter.copy=copyOriginal;void 0');
  for(const side of [0,1]) {
    await setup('later-edit-'+side);await review();await confirm();id=await recordId();await h.closeAll();fs.appendFileSync(vault+'/'+paths[side],'\nUSER CONTENT\n');
    await wait(`app.vault.read(app.vault.getFileByPath(${JSON.stringify(paths[side])})).then(t=>t.endsWith('USER CONTENT\\n'))`);const edited=disk();await history();
    await pass(`Later source ${side} edit refuses Undo and preserves recovery text`,`${row()}?.dataset.bundleState==='conflict'&&!${row()}?.querySelector('[data-bundle-apply-action=undoReview]')&&!!${row()}?.querySelector('pre')`);assert.deepEqual(disk(),edited);
  }
  await setup('two-confirmations');await review();await review();
  await ev("window.heldProcess=plugin.safeApply.port.process.bind(plugin.safeApply.port);plugin.safeApply.port.process=async(...args)=>{await new Promise(r=>window.releaseBundle=r);return heldProcess(...args)};void 0");
  await h.click('.ai-bundle-apply [data-bundle-apply-action=confirm]');await wait('!!window.releaseBundle');await h.click('.ai-bundle-apply [data-bundle-apply-action=confirm]');
  await wait("!!document.querySelector('.ai-bundle-apply [role=alert]')");await pass('All old Undo and resolution entrypoints share the bundle execution lock',"Promise.all([()=>plugin.safeApply.reviewUndo('x',()=>true),()=>plugin.safeApply.multi.reviewUndo('x',()=>true),()=>plugin.safeApply.merge.reviewUndo('x',()=>true),()=>plugin.safeApply.archive.reviewUndo('x',()=>true),()=>plugin.safeApply.reviewResolution('x',()=>true)].map(f=>f().then(()=>false,e=>e.reason==='busy'))).then(a=>a.every(Boolean))");
  await pass('Competing confirmation window cannot enter shared executor',"plugin.safeApply.busy&&bundleProcessPaths.length===0");
  await ev('releaseBundle();void 0');await wait('!plugin.safeApply.busy');assert.deepEqual(disk(),applied());await ev('plugin.safeApply.port.process=heldProcess;delete window.releaseBundle;void 0');
  for(const kind of ['single','multi']) {
    await setup('shared-lock-'+kind);await review();
    await ev(`(async()=>{window.otherPlanner=new bundleSession.constructor(bundleSession.deps);await otherPlanner.prepare();const pair=otherPlanner.view.input.pair;
      const ranges=pair.map(n=>{const s=n.cache.sections.find(s=>s.type==='paragraph');return {start:s.position.start.offset,end:s.position.end.offset,text:n.content.slice(s.position.start.offset,s.position.end.offset)}});
      ${kind==='single'?"await otherPlanner.build({operation:'add_link',source:0,selection:ranges[0],confirmed:true});window.otherTicket=await plugin.safeApply.review(otherPlanner.view.plan,bundleAnalysis,()=>true);":"await otherPlanner.buildMulti({operation:'add_reciprocal_links',selections:ranges,confirmed:[true,true]});window.otherTicket=await plugin.safeApply.multi.review(otherPlanner.view.multiPlan,bundleAnalysis,()=>true);"}
    })()`);
    await ev("window.heldProcess=plugin.safeApply.port.process.bind(plugin.safeApply.port);plugin.safeApply.port.process=async(...args)=>{await new Promise(r=>window.releaseBundle=r);return heldProcess(...args)};void 0");
    await h.click('.ai-bundle-apply [data-bundle-apply-action=confirm]');await wait('!!window.releaseBundle');
    await pass(kind+': old executor shares Bundle execution lock',`plugin.safeApply${kind==='multi'?'.multi.execute':'.apply'}(otherTicket).then(()=>false,e=>e.reason==='busy')`);
    await ev('releaseBundle();void 0');await wait('!plugin.safeApply.busy');assert.deepEqual(disk(),applied());await ev('plugin.safeApply.port.process=heldProcess;delete window.releaseBundle;void 0');
  }
  // Native editor/popout presence; do not rely on a timer racing an autosave.
  for(const popout of [false,true])for(const side of [0,1]) {
    await setup(`editor-${popout}-${side}`);await review();await h.click('.ai-bundle-apply [data-bundle-apply-action=cancel]');
    await ev(`(async()=>{window.editorLeaf=app.workspace.getLeaf(${popout?"'window'":"true"});await editorLeaf.openFile(app.vault.getFileByPath(${JSON.stringify(paths[side])}));})()`);
    await wait(`editorLeaf.view.file?.path===${JSON.stringify(paths[side])}`);await focusMain();await h.click('[data-bundle-apply-action=review]');await wait("!!document.querySelector('.ai-bundle-apply [role=alert]')");
    await pass(`${popout?'Popout':'Main window'} source ${side} refuses consent`,"/редактор|editor/i.test(document.querySelector('.ai-bundle-apply [role=alert]').textContent)");assert.deepEqual(disk(),originals());await shot(`bundle-editor-${popout}-${side}`);
    await h.closeAll();await ev('editorLeaf.detach();void 0');await focusMain();
  }
  // A global incident in either older journal blocks Bundle after review, without a write.
  for(const family of ['consolidation-operations','consolidation-multi-operations','consolidation-merge-operations','consolidation-archive-operations','consolidation-bundle-operations']) {
    await setup(family+'-block');await review();const dir=vault+'/.obsidian/plugins/ai-knowledge-hub/'+family;fs.mkdirSync(dir,{recursive:true});const file=dir+'/synthetic-unknown.json';fs.writeFileSync(file,'{}');
    await confirm();await pass(family+': global journal incident checked after consent',"!!document.querySelector('.ai-bundle-apply [role=alert]')&&bundleProcessPaths.length===0");assert.deepEqual(disk(),originals());
    // Remove only the fixture-created incident, never product recovery data.
    fs.unlinkSync(file);
  }
  for(const caseId of ['05','19','22','23']){
    await setup('refusal-'+caseId,{caseId});const saved=disk(),hashes=journalHashes();
    await pass(caseId+': unsupported source has no executable bundle',"document.querySelector('[data-bundle-action=build]').disabled&&!document.querySelector('[data-bundle-apply-action=review]')");
    await shot('bundle-refusal-'+caseId);assert.deepEqual(disk(),saved);assert.deepEqual(journalHashes(),hashes);
  }
  await pass('No paid/network calls in Bundle Apply native scenarios','io.network===0');
  return {status:'PASS',checks,artifactSha256:createHash('sha256').update(fs.readFileSync(ROOT+'/main.js')).digest('hex'),
    limits:'Synthetic Linux desktop including real popout editors; 390 px is a desktop viewport, not physical mobile. SIGKILL of the owned process, not power loss. No fsync/ACID/filesystem atomicity or cross-process vault lock claim. Torn journal markers deliberately require manual review. Fake analysis, no provider quality or semantic-completeness claim.'};
}
