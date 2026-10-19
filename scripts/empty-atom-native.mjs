// Owned synthetic vault only. Real Vault.process; the only scripted model is the prior relationship control.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {safeApplyHarness} from './safe-apply-native.mjs';
export async function emptyAtomScenario(context){
  const {ev,wait,cdp,root,vault,ROOT,restart,focusMain}=context,checks=[],cases=[];
  let h,paths,target,plan,id,before;
  const allMarkdown=()=>Object.fromEntries(fs.readdirSync(vault,{recursive:true}).filter(p=>p.endsWith('.md')).sort().map(p=>[p,fs.readFileSync(vault+'/'+p).toString('base64')]));
  const unchanged=()=>{const after=allMarkdown();assert.deepEqual(Object.keys(after),Object.keys(before));for(const p of Object.keys(before))if(p!==target)assert.equal(after[p],before[p],p);};
  const pass=async(name,expr)=>{assert(await ev(expr),name);checks.push(name);console.log(name);};
  const shot=async name=>fs.writeFileSync(root+'/'+name+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const field=(name,value,event='change')=>ev(`{const e=document.querySelector('[data-planner-field=${name}]');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('${event}'));}void 0`);
  const instrument=()=>ev(`window.atomIO={process:[],forbidden:[],journal:0};
    if(!window.atomOriginalProcess){atomOriginalProcess=app.vault.process.bind(app.vault);app.vault.process=(f,cb)=>{atomIO.process.push(f.path);return atomOriginalProcess(f,cb)}}
    if(!window.atomIOInstalled){atomIOInstalled=true;for(const key of ['create','modify','delete','trash','rename','createFolder','append']){const fn=app.vault[key].bind(app.vault);app.vault[key]=(...args)=>{atomIO.forbidden.push(key);return fn(...args)}}
    const write=app.vault.adapter.write.bind(app.vault.adapter);app.vault.adapter.write=(p,s,...args)=>{if(p.endsWith('.md'))atomIO.forbidden.push('adapter.write:'+p);if(p.includes('/consolidation-empty-atom-operations/'))atomIO.journal++;return write(p,s,...args)}}void 0`);
  const setup=async(name,{language='en',level=0,conditional=false,crlf=false,restartEmpty=false}={})=>{
    paths=[`EmptyAtom/${name}/Source.md`,`EmptyAtom/${name}/Comparison.md`];target=`EmptyAtom/${name}/Атом 🪶 ${name}.md`;h=safeApplyHarness(context,paths);
    const fact=language==='ru'?'Синяя метка 🪶 é обозначает завершённое испытание.':'A blue mark 🪶 é denotes a completed trial.';
    const condition=language==='ru'?'Только при сухой поверхности: синяя метка предположительно обозначает завершённое испытание.':'Only when the surface is dry: a blue mark may denote a completed trial.';
    h.fixture.a=level?'# Scope\n\nOnly trial A.\n\n## Conditions\n\nOnly if dry.\n\n### Observation\n\n'+fact+'\n':conditional?condition:fact;
    if(crlf)h.fixture.a=h.fixture.a.replace(/\n/g,'\r\n');h.fixture.b='An amber mark denotes a pending trial.';
    h.fixture.response={relation:'related_distinct',claims:[{id:'c',kind:'comparison',text:'Different observations.',quoteA:level?fact:h.fixture.a,quoteB:h.fixture.b}],explanation:{text:'Scripted extraction control.',evidence:['c']},recommendation:{action:'manual_review',reason:'User reviews semantic independence.',evidence:['c']},alternatives:[],limitations:['Synthetic control; not model quality evidence.']};
    await h.setup();
    await ev("window.atomQuietAt=Date.now();window.atomQuiet=app.metadataCache.on('resolved',()=>{atomQuietAt=Date.now()});window.atomQuietChanged=app.metadataCache.on('changed',()=>{atomQuietAt=Date.now()});void 0");
    fs.writeFileSync(vault+'/'+target,'');
    await wait(`!!app.vault.getFileByPath(${JSON.stringify(target)})&&!!app.metadataCache.getFileCache(app.vault.getFileByPath(${JSON.stringify(target)}))`);
    if(restartEmpty){await restart();await h.setup();await wait(`app.metadataCache.getFileCache(app.vault.getFileByPath(${JSON.stringify(target)}))?.v===1`);}
    if(!restartEmpty){await wait('Date.now()-atomQuietAt>600');await ev('app.metadataCache.offref(atomQuiet);app.metadataCache.offref(atomQuietChanged);void 0');}
    await wait('!plugin.safeApply.busy');await instrument();
    await focusMain();await ev(`engine.inspectPair({leftPath:${JSON.stringify(paths[0])},rightPath:${JSON.stringify(paths[1])}})`);await wait("document.querySelectorAll('.ai-pair-note').length===2");
    await h.click('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");await h.click('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-planner-action=open]')");
    await h.click('[data-planner-action=open]');await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='choosing'");
    await ev('window.atomSession=[...engine.pairInspectors].at(-1).planner;window.atomAnalysis=[...engine.pairInspectors].at(-1).relationship.analysisSource;window.atomCalls=safeTest.calls;void 0');
    await field('operation','write_atom_to_empty_note');await field('empty-source','0');
    const options=await ev("[...document.querySelector('[data-planner-field=empty-selection]').options].map(o=>({value:o.value,text:o.textContent}))");
    const selection=options.find(o=>level?o.text.includes(': '+'#'.repeat(level)+' '):o.value!=='')?.value;
    assert(selection!==undefined,'native candidate');await field('empty-selection',selection);await field('empty-target',target);await field('empty-title',language==='ru'?'Наблюдение испытания':'Trial observation','input');
    await pass(name+': all confirmations initially unchecked',"[...document.querySelectorAll('[data-planner-field^=empty-][type=checkbox]')].every(e=>!e.checked)");
    for(const key of ['unitConfirmed','contextConfirmed','manualConfirmed','titleConfirmed','sourceConfirmed','dependenciesReviewed','targetConfirmed'])await h.click(`[data-planner-field=empty-${key}]`);
    await h.click('[data-empty-atom-action=build]');await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage!=='loading'");
    const stage=await ev('atomSession.view.stage');if(stage!=='ready')fs.writeFileSync(root+'/plan-failure.json',JSON.stringify(await ev(`({view:atomSession.view,target:${JSON.stringify(target)},files:app.vault.getMarkdownFiles().map(f=>({path:f.path,stat:f.stat,cache:app.metadataCache.getFileCache(f)}))})`),null,2));assert.equal(stage,'ready');
    plan=await ev('atomSession.view.emptyAtomPlan');before=allMarkdown();fs.writeFileSync(root+'/'+name+'-plan.json',JSON.stringify(plan,null,2));
    await pass(name+': planning has no Markdown/journal/provider write',"atomIO.process.length===0&&atomIO.forbidden.length===0&&atomIO.journal===0&&safeTest.calls===atomCalls&&io.network===0");
  };
  const review=async()=>{
    await h.click('[data-empty-atom-action=review]');await wait("!!document.querySelector('.ai-empty-atom-apply [data-empty-atom-apply=confirm],.ai-empty-atom-apply [role=alert]')&&!plugin.safeApply.busy");
    const error=await ev("document.querySelector('.ai-empty-atom-apply [role=alert]')?.textContent");assert(!error,error);
    id=await ev('[...plugin.safeApply.emptyAtom.tickets.keys()].at(-1).id');
  };
  const confirm=async()=>{
    await h.click('.ai-empty-atom-apply [data-empty-atom-apply=confirm]');await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-empty-atom-apply [data-empty-atom-apply=history]')");
    const error=await ev("document.querySelector('.ai-empty-atom-apply [role=alert]')?.textContent");if(error)fs.writeFileSync(root+'/apply-failure.json',JSON.stringify(await ev(`(async()=>({error:${JSON.stringify(error)},rows:await plugin.safeApply.emptyAtom.history(),target:app.metadataCache.getFileCache(app.vault.getFileByPath(${JSON.stringify(target)})),io:atomIO}))()`),null,2));assert(!error,error);
  };
  const history=()=>h.history();
  const row=()=>`document.querySelector('[data-operation-id="${id}"]')`;
  const undo=async()=>{
    await history();await h.click(`[data-operation-id="${id}"] [data-empty-atom-apply=undoReview]`);await wait("!!document.querySelector('.ai-empty-atom-apply [data-empty-atom-apply=confirm],.ai-empty-atom-apply [role=alert]')");
    assert.equal(fs.readFileSync(vault+'/'+target,'utf8'),plan.target.after);await confirm();assert.equal(fs.readFileSync(vault+'/'+target,'utf8'),'');unchanged();
    await history();await pass('Undo leaves the file and has no repeat button',`${row()}?.dataset.emptyAtomState==='undone'&&!${row()}?.querySelector('[data-empty-atom-apply=undoReview]')`);
    await pass('Repeated Undo is refused without another process call',`(async()=>{const n=atomIO.process.length;try{await plugin.safeApply.emptyAtom.reviewUndo(${JSON.stringify(id)},()=>true);return false}catch{return atomIO.process.length===n}})()`);
  };
  for(const language of ['en','ru']){
    h??=safeApplyHarness(context);await h.closeAll();await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'));}void 0`);
    await ev('plugin.settingsSave');await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await ev('app.setting.close();void 0');
    for(const kind of ['paragraph','conditional','H1','H2','H3']){
      await setup(language+'-'+kind,{language,conditional:kind==='conditional',level:kind.startsWith('H')?Number(kind[1]):0,crlf:language==='ru'});await review();
      await pass('Separate review includes complete source pair, target before/after, additions and diff',"document.querySelectorAll('.ai-empty-atom-apply .ai-proposal-diff').length===1&&document.querySelectorAll('.ai-empty-atom-apply pre').length>=7&&atomIO.process.length===0&&atomIO.journal===0&&safeTest.calls===atomCalls");
      if(kind==='paragraph')for(const theme of ['theme-light','theme-dark'])for(const width of [1200,390]){
        await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');void 0`);
        await pass(`${language} ${theme} ${width}: literal localized review fits`,"[...document.querySelectorAll('.ai-empty-atom-apply,.ai-empty-atom-apply pre,.ai-empty-atom-apply .ai-proposal-diff')].every(e=>e.scrollWidth<=e.clientWidth+1)&&!document.querySelector('.ai-empty-atom-apply').textContent.includes('@emptyAtom.')");await shot(`empty-atom-${language}-${theme}-${width}`);
      }
      await confirm();assert.equal(fs.readFileSync(vault+'/'+target,'utf8'),plan.target.after);unchanged();
      await pass('Only existing target reaches Vault.process; no create/delete/adapter Markdown write',`JSON.stringify(atomIO.process)===JSON.stringify([${JSON.stringify(target)}])&&atomIO.forbidden.length===0&&safeTest.calls===atomCalls&&io.network===0`);
      await restart();await instrument();await history();await pass('Applied survives SIGKILL/restart without background writes',`${row()}?.dataset.emptyAtomState==='applied'&&!!${row()}?.querySelector('[data-empty-atom-apply=undoReview]')&&atomIO.process.length===0&&atomIO.forbidden.length===0`);
      await undo();cases.push({language,kind,path:target,afterSha256:createHash('sha256').update(plan.target.after).digest('hex'),result:'PASS'});
    }
  }
  await setup('native-empty-v1-cache',{restartEmpty:true});
  await pass('Exact empty target after restart has native cache {v:1}',`JSON.stringify(app.metadataCache.getFileCache(app.vault.getFileByPath(${JSON.stringify(target)})))==='{"v":1}'`);
  await review();await confirm();await undo();

  await setup('cancel-late-read');
  await ev("window.atomRead=app.vault.read.bind(app.vault);window.atomReadRelease=null;app.vault.read=async f=>{app.vault.read=atomRead;await new Promise(r=>{atomReadRelease=r});return atomRead(f)};void 0");
  await h.click('[data-empty-atom-action=review]');await wait('!!atomReadRelease');
  await ev("document.querySelector('.ai-empty-atom-apply').closest('.modal').querySelector('.modal-close-button,.modal-header-button').click();atomReadRelease();void 0");await wait('!plugin.safeApply.busy');
  await pass('Close during actual Vault.read discards late consent and writes nothing',"!document.querySelector('.ai-empty-atom-apply')&&plugin.safeApply.emptyAtom.tickets.size===0&&atomIO.process.length===0&&atomIO.journal===0");
  await review();await h.click('.ai-empty-atom-apply [data-empty-atom-apply=cancel]');await field('empty-title','Changed heading','input');
  await pass('Reopening/cancelling and changing selection clears every confirmation',"!atomSession.view.emptyAtomPlan&&[...document.querySelectorAll('[data-planner-field^=empty-][type=checkbox]')].every(e=>!e.checked)&&plugin.safeApply.emptyAtom.tickets.size===0&&atomIO.journal===0");

  for(const kind of ['target-edit','source-edit','replace','rename','cache-loss']){
    await setup('refuse-'+kind);await review();const unchangedTarget=fs.readFileSync(vault+'/'+target),originalTarget=target;
    if(kind==='target-edit')fs.writeFileSync(vault+'/'+target,'USER CONTENT after consent.');
    if(kind==='source-edit')fs.appendFileSync(vault+'/'+paths[0],'\nUSER source edit.');
    if(kind==='replace'){fs.renameSync(vault+'/'+target,vault+'/'+target+'.old');fs.writeFileSync(vault+'/'+target,'USER replacement.');}
    if(kind==='rename'){fs.renameSync(vault+'/'+target,vault+'/'+target+'.moved');}
    if(kind==='cache-loss')await ev(`window.atomCache=app.metadataCache.getFileCache;app.metadataCache.getFileCache=f=>f.path===${JSON.stringify(target)}?null:atomCache.call(app.metadataCache,f);app.metadataCache.trigger('changed',app.vault.getFileByPath(${JSON.stringify(target)}),'',{});void 0`);
    await wait("!!document.querySelector('.ai-empty-atom-apply [role=alert]')");
    await pass(kind+': consent revoked before any process or journal',"!document.querySelector('.ai-empty-atom-apply [data-empty-atom-apply=confirm]')&&atomIO.process.length===0&&atomIO.journal===0");
    if(kind==='cache-loss')await ev('app.metadataCache.getFileCache=atomCache;void 0');
    if(!['target-edit','replace','rename'].includes(kind))assert.deepEqual(fs.readFileSync(vault+'/'+originalTarget),unchangedTarget);
  }
  for(const kind of ['target-edit','source-edit','incoming','replace','rename']){
    await setup('undo-refuse-'+kind);await review();await confirm();await h.closeAll();
    if(kind==='target-edit')fs.appendFileSync(vault+'/'+target,'\nUser after Apply.');
    if(kind==='source-edit')fs.appendFileSync(vault+'/'+paths[1],'\nUser source edit.');
    if(kind==='incoming')fs.writeFileSync(vault+'/Incoming '+kind+'.md','Uses [['+target.slice(0,-3)+']].');
    if(kind==='replace'){fs.renameSync(vault+'/'+target,vault+'/'+target+'.old');fs.writeFileSync(vault+'/'+target,plan.target.after);}
    if(kind==='rename')fs.renameSync(vault+'/'+target,vault+'/'+target+'.moved');
    await ev('new Promise(r=>setTimeout(r,300))');await history();
    await pass(kind+': old Undo refused; completed paths released',`(async()=>{const r=(await plugin.safeApply.emptyAtom.history()).find(r=>r.id===${JSON.stringify(id)});return !r.canUndo&&!r.blocking&&!${row()}?.querySelector('[data-empty-atom-apply=undoReview]')})()`);
  }
  for(const popout of [false,true])for(const participant of [0,1,2]){
    await setup(`editor-${popout}-${participant}`);const path=[target,...paths][participant];
    await ev(`(async()=>{window.atomEditor=app.workspace.getLeaf(${popout?"'window'":"true"});await atomEditor.openFile(app.vault.getFileByPath(${JSON.stringify(path)}));})()`);
    await focusMain();await h.click('[data-empty-atom-action=review]');await wait("!!document.querySelector('.ai-empty-atom-apply [role=alert]')");
    await pass(`${popout?'Popout':'Main'} participant ${participant}: saved editor blocks review`,"/редактор|editor/i.test(document.querySelector('.ai-empty-atom-apply [role=alert]').textContent)&&atomIO.process.length===0&&atomIO.journal===0");
    if(popout&&participant===0)await shot('empty-atom-popout-refusal');await ev('atomEditor.detach();void 0');await focusMain();
  }
  await setup('competing-windows');await review();await ev('window.atomFirst=[...plugin.safeApply.emptyAtom.tickets.keys()].at(-1);void 0');
  // Open a second real desktop window with no affected editor. Both review tickets share the plugin owner.
  await ev("window.atomWindowLeaf=app.workspace.getLeaf('window');void 0");await wait('activeWindow!==window&&!activeWindow.closed');
  await h.click('[data-empty-atom-action=review]');await wait("activeDocument!==document&&!!activeDocument.querySelector('.ai-empty-atom-apply [data-empty-atom-apply=confirm]')");
  await ev("window.atomOtherDocument=activeDocument;document.querySelector('.ai-empty-atom-apply [data-empty-atom-apply=confirm]').click();atomOtherDocument.querySelector('.ai-empty-atom-apply [data-empty-atom-apply=confirm]').click();void 0");await wait('!plugin.safeApply.busy');
  await pass('Two competing review windows produce one process call; duplicate tickets are spent',`(async()=>{let reason;try{await plugin.safeApply.emptyAtom.execute(atomFirst)}catch(e){reason=e.reason}return atomIO.process.length===1&&reason==='used'&&atomIO.forbidden.length===0})()`);
  assert.equal(fs.readFileSync(vault+'/'+target,'utf8'),plan.target.after);unchanged();await ev('atomWindowLeaf.detach();void 0');await focusMain();await undo();

  for(const stage of ['before-journal','first-copy','second-copy','before-process','after-process','torn-applied','undo-intent','after-undo','torn-undone']){
    await setup('crash-'+stage);await review();
    const reversing=['undo-intent','after-undo','torn-undone'].includes(stage);
    if(reversing){await confirm();await history();await h.click(`[data-operation-id="${id}"] [data-empty-atom-apply=undoReview]`);await wait("!!document.querySelector('.ai-empty-atom-apply [data-empty-atom-apply=confirm]')");}
    await ev(`window.atomCrash=false;window.atomPause=()=>{atomCrash=true;return new Promise(()=>{})};
      {const executor=plugin.safeApply.emptyAtom,j=executor.journal,prepare=j.prepare.bind(j),mark=j.mark.bind(j),process=executor.port.process.bind(executor.port),write=j.adapter.write.bind(j.adapter);
      ${stage==='before-journal'?"j.prepare=()=>atomPause();":''}
      ${stage==='first-copy'?"j.adapter.write=async(p,s,...args)=>{await write(p,s,...args);if(p.endsWith('/record.json'))await atomPause()};":''}
      ${stage==='second-copy'?"j.prepare=async r=>{await prepare(r);await atomPause()};":''}
      ${['before-process','undo-intent'].includes(stage)?"executor.port.process=()=>atomPause();":''}
      ${['after-process','after-undo'].includes(stage)?"executor.port.process=async(...args)=>{await process(...args);await atomPause()};":''}
      ${['torn-applied','torn-undone'].includes(stage)?`j.adapter.write=async(p,s,...args)=>{if(p.includes('/mark-')&&JSON.parse(s).state==='${stage==='torn-applied'?'applied':'undone'}'){await write(p,'{');await atomPause()}else await write(p,s,...args)};`:''}
      }void 0`);
    await h.click('.ai-empty-atom-apply [data-empty-atom-apply=confirm]');await wait('atomCrash');
    const frozen=allMarkdown(),journal=vault+'/.obsidian/plugins/ai-knowledge-hub/consolidation-empty-atom-operations',entry=journal+'/'+id;
    const raw=fs.existsSync(entry)?Object.fromEntries(fs.readdirSync(entry).map(p=>[p,fs.readFileSync(entry+'/'+p).toString('base64')])):{};
    await restart();await instrument();await history();assert.deepEqual(allMarkdown(),frozen);unchanged();
    if(fs.existsSync(entry))assert.deepEqual(Object.fromEntries(fs.readdirSync(entry).map(p=>[p,fs.readFileSync(entry+'/'+p).toString('base64')])),raw);
    await pass(stage+': actual SIGKILL preserves evidence and never writes recovery',`(async()=>{const r=(await plugin.safeApply.emptyAtom.history()).find(r=>r.id===${JSON.stringify(id)});return (!r||!r.canUndo&&r.blocking)&&atomIO.process.length===0&&atomIO.forbidden.length===0&&atomIO.journal===0})()`);
    if(['after-process','torn-undone'].includes(stage))await shot('empty-atom-recovery-'+stage);
    fs.mkdirSync(root+'/crash-evidence',{recursive:true});if(fs.existsSync(entry))fs.renameSync(entry,root+'/crash-evidence/'+stage);
    cases.push({stage,result:'PASS',markdownWritesOnRestart:0,evidenceFiles:Object.keys(raw)});
  }
  await pass('Legacy command remains registered and automatic creation remains outside executor',"!!app.commands.commands['ai-knowledge-hub:ai-atomize-note']&&io.network===0");
  return {status:'PASS',checks,cases,artifactSha256:createHash('sha256').update(fs.readFileSync(ROOT+'/main.js')).digest('hex'),limits:'Linux desktop synthetic vault; no paid providers. Vault.process coordinates Obsidian, not independent processes. Undo clears, never deletes.'};
}
