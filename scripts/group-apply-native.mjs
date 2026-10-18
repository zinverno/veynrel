// Synthetic Linux Obsidian acceptance: real Vault.process/DataAdapter, owned-process SIGKILL, fake analysis only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {safeApplyHarness} from './safe-apply-native.mjs';

export async function groupApplyScenario(context) {
  const {ev,wait,cdp,root,vault,ROOT,restart,focusMain}=context, checks=[];
  const corpusBytes=fs.readFileSync(ROOT+'/tests/fixtures/consolidation-realistic-v1.json');
  const corpus=JSON.parse(corpusBytes);
  assert.equal(createHash('sha256').update(corpusBytes).digest('hex'),'dc7cfdf692791552abd9b06c128f6a2c78f666882b159412b647ef747ef0cda8');
  const journal=vault+'/.obsidian/plugins/ai-knowledge-hub/consolidation-group-operations';
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
  const recordId=()=>{otherFilesUnchanged();return ev(`(async()=> (await plugin.safeApply.group.journal.entries()).find(e=>e.record?.plan.canonical.path===${JSON.stringify(plan.canonical.path)})?.id)()`);};
  const row=()=>`document.querySelector('[data-operation-id="${id}"]')`;
  const journalHashes=()=>Object.fromEntries((fs.existsSync(journal)?fs.readdirSync(journal,{recursive:true}):[]).filter(p=>fs.statSync(journal+'/'+p).isFile()).sort().map(p=>[p,createHash('sha256').update(fs.readFileSync(journal+'/'+p)).digest('hex')]));
  const setup=async(name,{canonical=1,caseId='06',crlf=false,level=3}={})=>{
    const c=caseId==='english'?{
      notes:['# Source guide\n\nShared scoped fact.\n\n## Practice\n\nConditions apply to this demonstration only.\n\n### Trial\n\nObservation 🪶 é.\n\n## Practice\n\n### Trial\n\nRetained sibling observation.\n',
        '---\ntitle: Keep\ntags: [synthetic]\nrelated: "[[Absent synthetic source]]"\n---\n\n# Existing guide\n\nShared scoped fact.\n\n## Existing scope\n\n[[Absent synthetic source]]\n\nAn existing observation.'],
      controlResponse:{relation:'partial_overlap',explanation:{text:'Scripted group control.',evidence:['s']},claims:[{id:'s',kind:'shared',text:'Limited shared fact.',quoteA:'Shared scoped fact.',quoteB:'Shared scoped fact.'}],recommendation:{action:'consider_merge',reason:'Review context.',evidence:['s']},alternatives:[],limitations:['Synthetic control; semantic completeness is not established.']}
    }:corpus.cases.find(c=>c.id===caseId);
    paths=[`GroupApply/${name}/Теория/Same name.md`,`GroupApply/${name}/Practice/Same name.md`];h=safeApplyHarness(context,paths);
    const flip=['06','english'].includes(caseId)&&canonical===0;const notes=flip?[...c.notes].reverse():c.notes;
    const response=structuredClone(c.controlResponse);
    if(flip)for(const claim of response.claims){[claim.quoteA,claim.quoteB]=[claim.quoteB,claim.quoteA];claim.kind=claim.kind.replace(/_a$/,'_temp').replace(/_b$/,'_a').replace(/_temp$/,'_b')}
    if(crlf)for(const claim of response.claims)for(const key of ['quoteA','quoteB'])if(claim[key])claim[key]=claim[key].replace(/\n/g,'\r\n');
    h.fixture.a=crlf?notes[0].replace(/\n/g,'\r\n'):notes[0];h.fixture.b=crlf?notes[1].replace(/\n/g,'\r\n'):notes[1];h.fixture.response=response;
    await h.setup();await wait('!plugin.safeApply.busy');await wait(`!!app.metadataCache.getFileCache(app.vault.getFileByPath(${JSON.stringify(paths[1])}))?.sections`);
    await focusMain();await ev(`engine.inspectPair({leftPath:${JSON.stringify(paths[0])},rightPath:${JSON.stringify(paths[1])}})`);await wait("document.querySelectorAll('.ai-pair-note').length===2");
    await h.click('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");await h.click('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-planner-action=open]')");
    await h.click('[data-planner-action=open]');await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='choosing'");
    await ev('window.groupSession=[...engine.pairInspectors].at(-1).planner;window.groupAnalysis=[...engine.pairInspectors].at(-1).relationship.analysisSource;void 0');
    await field('operation','copy_context_group');await field('group-canonical',canonical);
    if(!['06','english'].includes(caseId))return;
    await field('group-selection',await ev(`document.querySelector('[data-planner-field=group-selection]').options[${level}].value`));
    await h.click('[data-planner-field=group-groupConfirmed]');await field('group-representation','original_heading_branch');
    await h.click('[data-planner-field=group-contextConfirmed]');
    await field('group-dependencies','reviewed');await field('group-insertion',await ev(`groupSession.view.input.pair[${canonical}].content.length`));await h.click('[data-planner-field=group-insertionConfirmed]');
    await h.click('[data-group-action=build]');await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='ready'");
    await ev('window.groupPlan=groupSession.view.groupPlan;window.groupCalls=safeTest.calls;void 0');plan=await ev('groupPlan');assert.deepEqual(disk(),originals());allBefore=allMarkdown();const stat=fs.statSync(vault+'/'+plan.secondary.path);secondaryStat=[stat.birthtimeMs,stat.mtimeMs,stat.size];
    fs.writeFileSync(root+'/'+name+'-plan.json',JSON.stringify(plan,null,2));
    await ev("window.groupProcessPaths=[];if(!window.groupOriginalProcess){groupOriginalProcess=app.vault.process.bind(app.vault);app.vault.process=(f,cb)=>{groupProcessPaths.push(f.path);return groupOriginalProcess(f,cb)}};void 0");
  };
  const review=async()=>{
    await wait("!plugin.safeApply.busy");
    const count=await ev("document.querySelectorAll('.ai-group-apply').length");await h.click('[data-group-apply-action=review]');
    await wait(`document.querySelectorAll('.ai-group-apply').length===${count+1}&&!![...document.querySelectorAll('.ai-group-apply')].at(-1)?.querySelector('[data-group-apply-action=confirm],[role=alert]')&&!plugin.safeApply.busy`);
    const error=await ev("[...document.querySelectorAll('.ai-group-apply')].at(-1)?.querySelector('[role=alert]')?.textContent");
    if(error){fs.writeFileSync(root+'/review-failure.json',JSON.stringify({error,paths,details:await ev("(async()=>({busy:plugin.safeApply.busy,stage:groupSession.view.stage,group:(await plugin.safeApply.group.history()).map(r=>({id:r.id,path:r.record?.plan.canonical.path,scope:r.scope,state:r.state,blocking:r.blocking,issues:r.issues}))}))()")},null,2));throw Error(error);}

  };
  const confirm=async()=>{await h.click('.ai-group-apply [data-group-apply-action=confirm]');await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-group-apply [data-group-apply-action=history]')");};
  const reverse=async()=>{
    await history();await ev("{const n=plugin.safeApply.group.native,fn=n.undo.bind(n);n.undo=async(...args)=>{try{return await fn(...args)}catch(e){window.undoFailure={reason:e.reason,stack:e.stack};throw e}}}void 0");await h.click(`[data-operation-id="${id}"] [data-group-apply-action=undoReview]`);
    await wait("!!document.querySelector('.ai-group-apply [data-group-apply-action=confirm],.ai-group-apply [role=alert]')");
    if(await ev('!!window.undoFailure'))fs.writeFileSync(root+'/undo-failure.json',JSON.stringify(await ev(`({failure:undoFailure,files:${JSON.stringify(paths)}.map(p=>({path:p,stat:app.vault.getFileByPath(p).stat,cache:app.metadataCache.getFileCache(app.vault.getFileByPath(p))})),text:document.querySelector('.ai-group-apply').textContent})`),null,2));
    await wait("!!document.querySelector('.ai-group-apply [data-group-apply-action=confirm]')");
    await pass('Undo preview reverses only canonical; secondary remains literal',`document.querySelector('.ai-group-apply [data-group-apply-text=before]').textContent===${JSON.stringify(plan.canonical.after)}&&document.querySelector('.ai-group-apply [data-group-apply-text=after]').textContent===${JSON.stringify(plan.canonical.before)}&&document.querySelector('.ai-group-apply [data-group-apply-text=secondary]').textContent===${JSON.stringify(plan.secondary.content)}`);
    assert.deepEqual(disk(),applied());await confirm();assert.deepEqual(disk(),originals());otherFilesUnchanged();
  };
  const refusals=async()=>{
    for(const caseId of ['05','19','22','23']){
      await setup('refusal-'+caseId,{caseId,canonical:caseId==='19'?1:0});const saved=disk(),hashes=journalHashes();
      if(['05','19'].includes(caseId)){
        await field('group-selection',await ev("[...document.querySelector('[data-planner-field=group-selection]').options].at(-1).value"));
        await h.click('[data-planner-field=group-groupConfirmed]');await field('group-representation','original_heading_branch');await h.click('[data-planner-field=group-contextConfirmed]');
        await field('group-dependencies','unresolved');await field('group-insertion',await ev(`groupSession.view.input.pair[${caseId==='19'?1:0}].content.length`));await h.click('[data-planner-field=group-insertionConfirmed]');
        await pass(caseId+': chosen full group still refuses unresolved external evidence',"document.querySelector('[data-planner-field=group-dependencies]').value==='unresolved'&&document.querySelector('[data-group-text=selected]')?.textContent.length>0");
      }
      await pass(caseId+': unsupported source has no executable group',"document.querySelector('[data-group-action=build]').disabled&&!document.querySelector('[data-group-apply-action=review]')");
      await ev("document.querySelector('[data-group-action=build]').scrollIntoView({block:'center'});void 0");
      await shot('group-refusal-'+caseId);assert.deepEqual(disk(),saved);assert.deepEqual(journalHashes(),hashes);
    }
  };
  if(process.argv.includes('--group-refusals')) {
    await refusals();await pass('Refusal-only native review writes no Markdown/journal or paid request','io.network===0');
    return {status:'PASS',checks,artifactSha256:createHash('sha256').update(fs.readFileSync(ROOT+'/main.js')).digest('hex'),limits:'Explicit selected context + unresolved dependency refusal; synthetic native metadata, no writer or provider request.'};
  }
  for(const language of ['en','ru'])for(const level of [1,2,3]) {
    h??=safeApplyHarness(context);await h.closeAll();await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'));}void 0`);
    await ev('plugin.settingsSave');await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await ev('app.setting.close();void 0');
    await setup('success-'+language+'-H'+level,{caseId:language==='en'?'english':'06',level,canonical:language==='en'?0:1,crlf:language==='ru'});await review();
    await pass(language+': full before/after, copied ranges, secondary and literal diff precede consent',"document.querySelectorAll('.ai-group-apply .ai-proposal-diff').length===1&&['before','after','secondary'].every(k=>document.querySelector('.ai-group-apply [data-group-apply-text='+k+']')?.parentElement.open)&&document.querySelector('.ai-group-apply [data-group-apply-text=before]').textContent===groupPlan.canonical.before&&document.querySelector('.ai-group-apply [data-group-apply-text=after]').textContent===groupPlan.canonical.after&&document.querySelector('.ai-group-apply [data-group-apply-text=secondary]').textContent===groupPlan.secondary.content&&document.querySelector('.ai-group-apply [data-group-apply-text=insertion]').textContent===JSON.stringify(groupPlan.insertion,null,2)&&safeTest.calls===groupCalls&&groupProcessPaths.length===0");
    assert.deepEqual(disk(),originals());
    for(const theme of ['theme-light','theme-dark'])for(const width of [1200,390]) {
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');document.querySelector('.ai-group-apply').scrollTop=0;void 0`);
      await pass(`${language} ${theme} ${width}: localized consent, full sources and diff fit`,"[...document.querySelectorAll('.ai-group-apply,.ai-group-apply pre,.ai-group-apply .ai-proposal-diff')].every(e=>e.scrollWidth<=e.clientWidth+1)&&!document.querySelector('.ai-group-apply').textContent.includes('@groupApply.')&&!document.querySelector('.ai-group-apply img,.ai-group-apply iframe')");await shot(`group-apply-${language}-${level}-${theme}-${width}`);
    }
    await ev("document.querySelector('.ai-group-apply .ai-proposal-diff').scrollIntoView({block:'center'});void 0");await shot('group-apply-diff-'+language+'-'+level);
    await ev("document.querySelector('.ai-group-apply [data-group-apply-action=confirm]').focus();void 0");await shot('group-apply-confirm-'+language+'-'+level);
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});
    await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-group-apply [data-group-apply-action=history]')");
    if(!disk().every((v,i)=>v.equals(applied()[i])))fs.writeFileSync(root+'/group-write-diagnostic.json',JSON.stringify(await ev("({text:document.querySelector('.ai-group-apply')?.textContent,plan:groupPlan,stat:groupAnalysis.pair.map(n=>n.file.stat)})"),null,2));
    assert.deepEqual(disk(),applied());id=await recordId();
    await pass('Only canonical is sent to real Vault.process, no extra completion',`JSON.stringify(groupProcessPaths)===JSON.stringify([${JSON.stringify(plan.canonical.path)}])&&safeTest.calls===groupCalls`);
    const beforeRestart=disk();await restart();assert.deepEqual(disk(),beforeRestart);await history();
    await pass(language+': applied journal survives restart, no automatic Undo',`${row()}?.dataset.groupState==='applied'&&!!${row()}?.querySelector('[data-group-apply-action=undoReview]')`);
    await reverse();await history();await pass('Explicit Undo restores canonical exactly; no repeated Undo',`${row()}?.dataset.groupState==='undone'&&!${row()}?.querySelector('[data-group-apply-action=undoReview]')`);
  }
    const rows=[];
    for(const edited of ['canonical','secondary','none']) {
      await setup('completed-'+edited,{canonical:0});await review();
      await ev('window.oldGroupApply=[...plugin.safeApply.group.tickets.keys()].at(-1);void 0');await confirm();id=await recordId();
      const evidence=journalHashes();assert.deepEqual(disk(),applied());
      await wait(`app.metadataCache.getFileCache(app.vault.getFileByPath(${JSON.stringify(plan.canonical.path)}))?.sections?.at(-1)?.position.end.offset===${plan.canonical.after.trimEnd().length}`);
      await ev(`(async()=>{window.oldGroupUndo=await plugin.safeApply.group.reviewUndo(${JSON.stringify(id)},()=>true)})()`);
      await h.closeAll();
      if(edited!=='none') {
        const path=plan[edited].path,text=fs.readFileSync(vault+'/'+path,'utf8')+'\n\nUSER EDIT: новая проверенная заметка.\n';
        await ev(`window.editReady=false;window.editRef=app.metadataCache.on('changed',(f,data)=>{if(f.path===${JSON.stringify(path)}&&data===${JSON.stringify(text)})editReady=true});void 0`);
        fs.writeFileSync(vault+'/'+path,text);await wait('editReady');await ev('app.metadataCache.offref(editRef);void 0');
      }
      const before=disk();
      if(edited!=='none')await pass(edited+': edited source revokes old Undo consent',`plugin.safeApply.group.execute(oldGroupUndo).then(()=>false,()=>true)`);
      await restart();assert.deepEqual(disk(),before);assert.deepEqual(journalHashes(),evidence);
      await pass(edited+': terminal operation releases both paths after restart',`(async()=>{const r=(await plugin.safeApply.group.history()).find(e=>e.id===${JSON.stringify(id)});await plugin.safeApply.group.blockers(${JSON.stringify(paths)});return r.blocking===false&&r.canUndo===${edited==='none'}})()`);
      if(edited!=='none')await pass(edited+': fresh old Undo review refuses changed sources',`plugin.safeApply.group.reviewUndo(${JSON.stringify(id)},()=>true).then(()=>false,()=>true)`);
      else await ev(`(async()=>{window.oldGroupUndo=await plugin.safeApply.group.reviewUndo(${JSON.stringify(id)},()=>true)})()`);
      // Fresh scripted analysis quotes a context paragraph occurring once in each current source.
      const quote=plan.group.range.text.split(/\r?\n\r?\n/).find(t=>t.trim()&&!t.startsWith('#')).trim();
      const response={relation:'partial_overlap',explanation:{text:'Synthetic current-source control.',evidence:['shared']},claims:[{id:'shared',kind:'shared',text:'Shared scoped context.',quoteA:quote,quoteB:quote}],recommendation:{action:'add_link',reason:'Link the current notes.',evidence:['shared']},alternatives:[],limitations:['Scripted control, not a model-quality evaluation.']};
      await ev(`window.safeTest={calls:0,response:${JSON.stringify(response)}};Object.assign(plugin.settings,{provider:'custom',model:'synthetic-safe-apply',apiKey:'synthetic-only',baseUrl:'https://example.invalid/v1'});window.safeBaseFactory=engine.relationshipSession;engine.relationshipSession=paths=>{const s=safeBaseFactory(paths);s.deps.complete=async()=>{safeTest.calls++;return JSON.stringify(safeTest.response)};return s};void 0`);
      await h.plan();await h.review();
      const single=await ev('({before:safePlan.before,after:safePlan.after,sourcePath:safePlan.sourcePath})');assert.equal(single.before,before[0].toString());
      await pass(edited+': current Single-file review succeeds without Markdown writes',`!!document.querySelector('.ai-safe-apply [data-safe-action=confirm]')&&safeTest.calls===1`);
      assert.deepEqual(disk(),before);assert.deepEqual(journalHashes(),evidence);await shot('group-completed-'+edited+'-review');
      await h.click('.ai-safe-apply [data-safe-action=confirm]');await wait("!!document.querySelector('.ai-safe-apply [data-safe-action=undo]')&&!plugin.safeApply.busy");
      const after=disk();assert.equal(after[0].toString(),single.after);assert.equal(after[1].toString(),before[1].toString());
      if(edited==='none')await pass('Old Undo ticket cannot overwrite a subsequent Single-file Apply',`plugin.safeApply.group.execute(oldGroupUndo).then(()=>false,()=>true)`);
      await pass(edited+': new Apply preserves all current text and invalidates old Group Undo',`plugin.safeApply.group.reviewUndo(${JSON.stringify(id)},()=>true).then(()=>false,()=>true)`);
      await pass(edited+': completed ID cannot be prepared twice or used by Archive Eligibility',`(async()=>{const r=(await plugin.safeApply.group.journal.entries()).find(e=>e.id===${JSON.stringify(id)}).record;const used=await plugin.safeApply.group.journal.prepare(r).then(()=>false,e=>e.reason==='used');const archive=await plugin.safeApply.merge.readApplied(r.id,()=>true).then(()=>false,()=>true);return used&&archive})()`);
      assert.deepEqual(disk(),after);assert.deepEqual(journalHashes(),evidence);
      await h.history();await pass(edited+': history keeps evidence, disables old Undo and does not reserve paths',`(async()=>{const r=(await plugin.safeApply.group.history()).find(e=>e.id===${JSON.stringify(id)});return !r.canUndo&&!r.blocking&&${row()}?.dataset.groupState==='conflict'&&!${row()}?.querySelector('[data-group-apply-action=undoReview]')})()`);
      await ev(`${row()}.scrollIntoView({block:'start'});void 0`);await shot('group-completed-'+edited+'-history');
      rows.push({edited,id,paths,before:before.map(b=>b.toString()),after:after.map(b=>b.toString()),groupEvidence:evidence});
      await pass(edited+': no paid or additional model requests','io.network===0&&safeTest.calls===1');
    }
    fs.writeFileSync(root+'/group-completion-cases.json',JSON.stringify(rows,null,2)+'\n');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
  for(const point of ['before-backup','first-backup','both-backups','before-write','after-write','torn-applied','undo-intent','undo-after-write','torn-undone']) {
    await setup(point);await review();
    if(point.startsWith('undo')||point==='torn-undone') {await confirm();id=await recordId();await history();await h.click(`[data-operation-id="${id}"] [data-group-apply-action=undoReview]`);await wait("!!document.querySelector('.ai-group-apply [data-group-apply-action=confirm]')");}
    await ev(`window.killReached=false;
      ${point==='before-backup'?"plugin.safeApply.group.journal.prepare=async()=>{killReached=true;return new Promise(()=>{})};":''}
      ${point==='undo-intent'?"{const j=plugin.safeApply.group.journal,fn=j.mark.bind(j);j.mark=async(...a)=>{await fn(...a);if(a[1]==='undo_intent'){killReached=true;return new Promise(()=>{})}}};":''}
      ${point==='before-write'?"plugin.safeApply.port.process=async()=>{killReached=true;return new Promise(()=>{})};":''}
      ${['first-backup','both-backups'].includes(point)?`{const a=app.vault.adapter,k='${point==='first-backup'?'write':'copy'}',fn=a[k].bind(a);a[k]=async(...args)=>{const result=await fn(...args);if(args.some(v=>typeof v==='string'&&v.includes('/consolidation-group-operations/')&&v.endsWith('${point==='first-backup'?'record.json':'backup.json'}'))){killReached=true;return new Promise(()=>{})}return result}};`:''}
      ${['after-write','undo-after-write'].includes(point)?`{const fn=plugin.safeApply.group.journal.mark.bind(plugin.safeApply.group.journal);plugin.safeApply.group.journal.mark=async(r,s,n)=>{if(s==='${point==='after-write'?'applied':'undone'}'){killReached=true;return new Promise(()=>{})}return fn(r,s,n)}};`:''}
      ${point.startsWith('torn-')?`{const fn=app.vault.adapter.write.bind(app.vault.adapter);app.vault.adapter.write=async(p,data,...rest)=>{if(p.includes('/consolidation-group-operations/')&&p.includes('/mark-')&&JSON.parse(data).state==='${point==='torn-applied'?'applied':'undone'}'){await fn(p,data.slice(0,24),...rest);killReached=true;return new Promise(()=>{})}return fn(p,data,...rest)}};`:''}
      void 0`);
    await h.click('.ai-group-apply [data-group-apply-action=confirm]');await wait('killReached');id=await recordId();
    const hashes=journalHashes();const beforeRestart=disk();assert.equal(beforeRestart[paths.indexOf(plan.secondary.path)].toString(),plan.secondary.content);
    await restart();assert.deepEqual(disk(),beforeRestart);assert.deepEqual(journalHashes(),hashes);await history();
    if(point==='before-backup'){assert.equal(id,undefined);checks.push('SIGKILL before backup: no journal or Markdown change');continue}
    const expected=['undo-after-write','torn-undone'].includes(point)?'undone':['after-write','torn-applied','undo-intent'].includes(point)?'applied':'prepared';
    await pass(`SIGKILL ${point}: actual ${expected}, startup writes nothing`,`${row()}?.dataset.groupState==='${expected}'`);
    await ev(`${row()}.scrollIntoView({block:'start'});void 0`);await shot('group-recovery-'+point);
    if(point==='after-write'||point==='undo-intent'){await reverse();checks.push('Explicit Undo after SIGKILL without applied marker restores original canonical only');}
    if(point.startsWith('torn-')||point==='first-backup')await pass('Damaged evidence blocks automatic Undo and keeps full backup visible',`!${row()}?.querySelector('[data-group-apply-action=undoReview]')&&!!${row()}?.querySelector('pre')`);
  }
  // Real IO error, not a simulated successful backup.
  await setup('backup-error');await review();
  await ev("window.copyOriginal=app.vault.adapter.copy;app.vault.adapter.copy=async()=>{throw Error('synthetic backup failure')};void 0");await confirm();
  assert.deepEqual(disk(),originals());await pass('Backup error refuses all Markdown writes',"groupProcessPaths.length===0&&!!document.querySelector('.ai-group-apply [role=alert]')");await ev('app.vault.adapter.copy=copyOriginal;void 0');
  for(const side of [0,1]) {
    await setup('later-edit-'+side);await review();await confirm();id=await recordId();await h.closeAll();fs.appendFileSync(vault+'/'+paths[side],'\nUSER CONTENT\n');
    await wait(`app.vault.read(app.vault.getFileByPath(${JSON.stringify(paths[side])})).then(t=>t.endsWith('USER CONTENT\\n'))`);const edited=disk();await history();
    await pass(`Later source ${side} edit refuses Undo and preserves recovery text`,`${row()}?.dataset.groupState==='conflict'&&!${row()}?.querySelector('[data-group-apply-action=undoReview]')&&!!${row()}?.querySelector('pre')`);assert.deepEqual(disk(),edited);
  }
  await setup('two-confirmations');await review();await review();
  await ev("window.heldProcess=plugin.safeApply.port.process.bind(plugin.safeApply.port);plugin.safeApply.port.process=async(...args)=>{await new Promise(r=>window.releaseGroup=r);return heldProcess(...args)};void 0");
  await h.click('.ai-group-apply [data-group-apply-action=confirm]');await wait('!!window.releaseGroup');await h.click('.ai-group-apply [data-group-apply-action=confirm]');
  await wait("!!document.querySelector('.ai-group-apply [role=alert]')");await pass('All old Undo and resolution entrypoints share the group execution lock',"Promise.all([()=>plugin.safeApply.reviewUndo('x',()=>true),()=>plugin.safeApply.multi.reviewUndo('x',()=>true),()=>plugin.safeApply.merge.reviewUndo('x',()=>true),()=>plugin.safeApply.archive.reviewUndo('x',()=>true),()=>plugin.safeApply.bundle.reviewUndo('x',()=>true),()=>plugin.safeApply.reviewResolution('x',()=>true)].map(f=>f().then(()=>false,e=>e.reason==='busy'))).then(a=>a.every(Boolean))");
  await pass('Competing confirmation window cannot enter shared executor',"plugin.safeApply.busy&&groupProcessPaths.length===0");
  await ev('releaseGroup();void 0');await wait('!plugin.safeApply.busy');assert.deepEqual(disk(),applied());await ev('plugin.safeApply.port.process=heldProcess;delete window.releaseGroup;void 0');
  for(const kind of ['single','multi']) {
    await setup('shared-lock-'+kind);await review();
    await ev(`(async()=>{window.otherPlanner=new groupSession.constructor(groupSession.deps);await otherPlanner.prepare();const pair=otherPlanner.view.input.pair;
      const ranges=pair.map(n=>{const s=n.cache.sections.find(s=>s.type==='paragraph');return {start:s.position.start.offset,end:s.position.end.offset,text:n.content.slice(s.position.start.offset,s.position.end.offset)}});
      ${kind==='single'?"await otherPlanner.build({operation:'add_link',source:0,selection:ranges[0],confirmed:true});window.otherTicket=await plugin.safeApply.review(otherPlanner.view.plan,groupAnalysis,()=>true);":"await otherPlanner.buildMulti({operation:'add_reciprocal_links',selections:ranges,confirmed:[true,true]});window.otherTicket=await plugin.safeApply.multi.review(otherPlanner.view.multiPlan,groupAnalysis,()=>true);"}
    })()`);
    await ev("window.heldProcess=plugin.safeApply.port.process.bind(plugin.safeApply.port);plugin.safeApply.port.process=async(...args)=>{await new Promise(r=>window.releaseGroup=r);return heldProcess(...args)};void 0");
    await h.click('.ai-group-apply [data-group-apply-action=confirm]');await wait('!!window.releaseGroup');
    await pass(kind+': old executor shares Group execution lock',`plugin.safeApply${kind==='multi'?'.multi.execute':'.apply'}(otherTicket).then(()=>false,e=>e.reason==='busy')`);
    await ev('releaseGroup();void 0');await wait('!plugin.safeApply.busy');assert.deepEqual(disk(),applied());await ev('plugin.safeApply.port.process=heldProcess;delete window.releaseGroup;void 0');
  }
  // Native editor/popout presence; do not rely on a timer racing an autosave.
  for(const popout of [false,true])for(const side of [0,1]) {
    await setup(`editor-${popout}-${side}`);await review();await h.click('.ai-group-apply [data-group-apply-action=cancel]');
    await ev(`(async()=>{window.editorLeaf=app.workspace.getLeaf(${popout?"'window'":"true"});await editorLeaf.openFile(app.vault.getFileByPath(${JSON.stringify(paths[side])}));})()`);
    await wait(`editorLeaf.view.file?.path===${JSON.stringify(paths[side])}`);await focusMain();await h.click('[data-group-apply-action=review]');await wait("!!document.querySelector('.ai-group-apply [role=alert]')");
    await pass(`${popout?'Popout':'Main window'} source ${side} refuses consent`,"/редактор|editor/i.test(document.querySelector('.ai-group-apply [role=alert]').textContent)");assert.deepEqual(disk(),originals());await shot(`group-editor-${popout}-${side}`);
    await h.closeAll();await ev('editorLeaf.detach();void 0');await focusMain();
  }
  // A global incident in either older journal blocks Group after review, without a write.
  for(const family of ['consolidation-operations','consolidation-multi-operations','consolidation-merge-operations','consolidation-archive-operations','consolidation-bundle-operations','consolidation-group-operations']) {
    await setup(family+'-block');await review();const dir=vault+'/.obsidian/plugins/ai-knowledge-hub/'+family;fs.mkdirSync(dir,{recursive:true});const file=dir+'/synthetic-unknown.json';fs.writeFileSync(file,'{}');
    await confirm();await pass(family+': global journal incident checked after consent',"!!document.querySelector('.ai-group-apply [role=alert]')&&groupProcessPaths.length===0");assert.deepEqual(disk(),originals());
    // Remove only the fixture-created incident, never product recovery data.
    fs.unlinkSync(file);
  }
  await refusals();
  await pass('No paid/network calls in Group Apply native scenarios','io.network===0');
  return {status:'PASS',checks,artifactSha256:createHash('sha256').update(fs.readFileSync(ROOT+'/main.js')).digest('hex'),
    limits:'Synthetic Linux desktop including real popout editors; 390 px is a desktop viewport, not physical mobile. SIGKILL of the owned process, not power loss. No fsync/ACID/filesystem atomicity or cross-process vault lock claim. Torn journal markers deliberately require manual review. Fake analysis, no provider quality or semantic-completeness claim.'};
}
