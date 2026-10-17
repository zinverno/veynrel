// Synthetic-only Archive Planner acceptance after real separately confirmed Merge Apply.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {safeApplyHarness} from './safe-apply-native.mjs';

export async function archivePlannerScenario(context) {
  const {ev,wait,cdp,root,vault,ROOT,restart,focusMain}=context, checks=[];
  const fixture=JSON.parse(fs.readFileSync(ROOT+'/tests/fixtures/merge-planner.json','utf8'));
  const journal=vault+'/.obsidian/plugins/ai-knowledge-hub/consolidation-merge-operations';
  let h, paths, mergePlan, id;
  const pass=async(name,expr)=>{assert(await ev(expr),name);checks.push(name);console.log(name);};
  const shot=async name=>fs.writeFileSync(root+'/'+name+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const field=(selector,value)=>ev(`{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change'));}void 0`);
  const disk=()=>paths.map(p=>fs.readFileSync(vault+'/'+p));
  const journalBytes=()=>fs.existsSync(journal)?fs.readdirSync(journal,{recursive:true}).filter(p=>fs.statSync(journal+'/'+p).isFile()).sort().map(p=>[p,fs.readFileSync(journal+'/'+p,'utf8')]):[];
  const row=()=>`[data-operation-id="${id}"]`;
  const setup=async(name,{canonical=0,yaml='',crlf=false,incomplete=false}={})=>{
    await ev('if(window.archiveIO)archiveIO.active=false;void 0');
    paths=[`Archive/${name}/Теория/Same name.md`,`Archive/${name}/Practice/Same name.md`];h=safeApplyHarness(context,paths);Object.assign(h.fixture,fixture);
    const key=canonical===0?'b':'a';h.fixture[key]=yaml+h.fixture[key];
    if(crlf)for(const k of ['a','b'])h.fixture[k]=h.fixture[k].replace(/\n/g,'\r\n')+'\r\nUnicode 👩🏽‍💻 é 中文.\r\n';
    await h.setup();await wait(`!!app.metadataCache.getFileCache(app.vault.getFileByPath(${JSON.stringify(paths[1])}))?.sections`);
    const consumer=`Archive/${name}/Consumer.md`, secondary=paths[canonical===0?1:0].slice(0,-3);
    fs.writeFileSync(vault+'/'+consumer,`---\nrelated: "[[${secondary}]]"\n---\n\n[[${secondary}]]\n\n![[${secondary}]]\n`);
    await wait(`app.metadataCache.resolvedLinks[${JSON.stringify(consumer)}]?.[${JSON.stringify(secondary+'.md')}]===3`);
    await focusMain();await ev(`engine.inspectPair({leftPath:${JSON.stringify(paths[0])},rightPath:${JSON.stringify(paths[1])}})`);await wait("document.querySelectorAll('.ai-pair-note').length===2");
    await h.click('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");await h.click('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-planner-action=open]')");
    await h.click('[data-planner-action=open]');await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='choosing'");
    await field('[data-planner-field=operation]','merge_knowledge');await field('[data-planner-field=merge-canonical]',canonical);
    const transfer=await ev("[...document.querySelectorAll('[data-planner-field^=merge-transfer-]')][1].dataset.plannerField");
    await h.click(`[data-planner-field=${transfer}]`);await field('[data-planner-field=merge-location]',0);await h.click('[data-planner-field=merge-confirm]');
    await h.click('[data-merge-action=build]');await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='ready'");
    mergePlan=await ev('[...engine.pairInspectors].at(-1).planner.view.mergePlan');
    await h.click('[data-merge-apply-action=review]');await wait("!!document.querySelector('.ai-merge-apply [data-merge-apply-action=confirm]')");
    if(incomplete)await ev("window.archiveProcess=plugin.safeApply.port.process;plugin.safeApply.port.process=async()=>{throw Error('synthetic prewrite failure')};void 0");
    await h.click('.ai-merge-apply [data-merge-apply-action=confirm]');await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-merge-apply [data-merge-apply-action=history]')");
    if(incomplete)await ev('plugin.safeApply.port.process=archiveProcess;void 0');
    id=await ev(`(async()=> (await plugin.safeApply.merge.journal.entries()).find(e=>e.record?.canonical.path===${JSON.stringify(mergePlan.canonical.path)})?.id)()`);assert(id);
    assert.equal(fs.readFileSync(vault+'/'+mergePlan.secondary.path,'utf8'),mergePlan.secondary.content);
    assert.equal(fs.readFileSync(vault+'/'+mergePlan.canonical.path,'utf8'),incomplete?mergePlan.canonical.before:mergePlan.canonical.after);
    await h.closeAll();
    await wait(`JSON.stringify(app.metadataCache.getFileCache(app.vault.getFileByPath(${JSON.stringify(mergePlan.canonical.path)}))?.sections).length>0`);
  };
  const observe=async()=>{
    await ev(`window.archiveIO={active:true,writes:0,journal:0,reads:[],calls:window.safeTest?.calls??0};
      if(!window.archiveHooks){window.archiveHooks=true;
        for(const key of ['process','modify','create','append','delete','rename']){const fn=app.vault[key].bind(app.vault);app.vault[key]=(...args)=>{if(archiveIO.active)archiveIO.writes++;return fn(...args)}}
        {const fn=app.vault.read.bind(app.vault);app.vault.read=f=>{if(archiveIO.active)archiveIO.reads.push(f.path);return fn(f)}}
        for(const key of ['write','copy','mkdir','remove','rename','append']){const fn=app.vault.adapter[key].bind(app.vault.adapter);app.vault.adapter[key]=(...args)=>{if(archiveIO.active&&args.some(a=>typeof a==='string'&&/consolidation-(?:merge-|multi-)?operations/.test(a)))archiveIO.journal++;return fn(...args)}}
      }void 0`);
  };
  const open=async()=>{
    await ev('if(window.archiveIO)archiveIO.active=false;void 0');await h.history();await observe();
    await h.click(row()+' [data-archive-action=open]');
    await wait("!!document.querySelector('.ai-archive-planner [data-archive-stage]')&&document.querySelector('.ai-archive-planner [data-archive-stage]').dataset.archiveStage!=='loading'");
  };
  const choose=async(disposition='retained')=>{
    const count=await ev("document.querySelectorAll('.ai-archive-planner [data-archive-fragment]').length");assert(count>0);
    for(let i=0;i<count;i++)await field(`.ai-archive-planner [data-archive-fragment="${i}"]`,disposition);
    await field('.ai-archive-planner [data-archive-status]','archived');await h.click('.ai-archive-planner [data-archive-ack]');
  };
  const build=async()=>{await h.click('.ai-archive-planner [data-archive-action=build]');await wait("['ready','error','stale'].includes(document.querySelector('.ai-archive-planner [data-archive-stage]')?.dataset.archiveStage)");};
  const noWrites=async(label,before,stored)=>{
    assert.deepEqual(disk(),before);assert.deepEqual(journalBytes(),stored);
    await pass(label+': no Vault mutations, journal writes, extra completion or hidden source reads',`archiveIO.writes===0&&archiveIO.journal===0&&(window.safeTest?.calls??0)===archiveIO.calls&&archiveIO.reads.every(p=>${JSON.stringify(paths)}.includes(p))&&io.network===0`);
  };
  for(const language of ['en','ru']) {
    h??=safeApplyHarness(context);await h.closeAll();await ev('if(window.archiveIO)archiveIO.active=false;app.setting.open();app.setting.openTabById("ai-knowledge-hub");void 0');
    await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'));}void 0`);
    await ev('plugin.settingsSave');await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await ev('app.setting.close();void 0');
    await setup('success-'+language,{canonical:language==='en'?0:1,crlf:language==='ru',yaml:language==='ru'?'---\n# Keep this comment\ntags: [one, two]\nrelated: "[[Missing]]"\n---\n\n':''});
    const before=disk(), stored=journalBytes();await restart();assert.deepEqual(disk(),before);assert.deepEqual(journalBytes(),stored);
    await open();
    await pass(language+': restarted completed journal offers full preservation and known incoming kinds',"document.querySelector('.ai-archive-planner [data-archive-stage]').dataset.archiveStage==='choosing'&&document.querySelectorAll('.ai-archive-planner [data-archive-fragment]').length>=3&&document.querySelector('.ai-archive-planner [data-archive-action=build]').disabled&&/Consumer/.test(document.querySelector('.ai-archive-planner').textContent)&&/Embed|Встраивание/.test(document.querySelector('.ai-archive-planner').textContent)&&/Property link|Ссылка в свойстве/.test(document.querySelector('.ai-archive-planner').textContent)");
    await choose('consolidate');await pass('Further consolidation blocks planning',"document.querySelector('.ai-archive-planner [data-archive-action=build]').disabled");
    await field('.ai-archive-planner [data-archive-fragment="0"]','represented');
    const count=await ev("document.querySelectorAll('.ai-archive-planner [data-archive-fragment]').length");for(let i=1;i<count;i++)await field(`.ai-archive-planner [data-archive-fragment="${i}"]`,'retained');
    await build();
    if(await ev("document.querySelector('.ai-archive-planner [data-archive-stage]').dataset.archiveStage")!=='ready')fs.writeFileSync(root+'/archive-yaml-diagnostic.json',JSON.stringify(await ev(`({text:document.querySelector('.ai-archive-planner').textContent,cache:app.metadataCache.getFileCache(app.vault.getFileByPath(${JSON.stringify(mergePlan.secondary.path)}))})`),null,2));
    await pass(language+': full exact before/after and diff; no Apply or Undo control',`document.querySelector('.ai-archive-planner [data-archive-stage]').dataset.archiveStage==='ready'&&document.querySelector('.ai-archive-planner [data-archive-text=before]').textContent===${JSON.stringify(mergePlan.secondary.content)}&&document.querySelector('.ai-archive-planner [data-archive-text=canonical]').textContent===${JSON.stringify(mergePlan.canonical.after)}&&!!document.querySelector('.ai-archive-planner .ai-proposal-diff')&&![...document.querySelectorAll('.ai-archive-planner button')].some(e=>/apply|применить|undo/i.test(e.textContent))`);
    const plan=await ev("JSON.parse(document.querySelector('.ai-archive-planner [data-archive-text=json]').textContent)");
    assert.equal(plan.secondary.after.slice(0,plan.edit.start)+plan.secondary.after.slice(plan.edit.start+plan.edit.inserted.length),plan.secondary.before);
    assert.equal(plan.provenance.id,id);assert.equal(plan.canonical.path,mergePlan.canonical.path);
    for(const theme of ['theme-light','theme-dark'])for(const width of [1200,390]) {
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');document.querySelector('.ai-archive-planner').scrollTop=0;void 0`);
      await pass(`${language} ${theme} ${width}: localized sources and controls fit`,"[...document.querySelectorAll('.ai-archive-planner,.ai-archive-planner pre,.ai-archive-planner select,.ai-archive-planner .ai-proposal-diff')].every(e=>e.scrollWidth<=e.clientWidth+1)&&!document.querySelector('.ai-archive-planner').textContent.includes('@archive.')");await shot(`archive-${language}-${theme}-${width}`);
      if(theme==='theme-light'&&width===1200||theme==='theme-dark'&&width===390) {
        await ev("document.querySelector('.ai-archive-planner [data-archive-text=after]').scrollIntoView({block:'center'});void 0");await shot(`archive-after-${language}-${width}`);
      }
    }
    await ev("document.querySelector('.ai-archive-planner .ai-proposal-diff').scrollIntoView({block:'center'});void 0");await shot('archive-diff-'+language);
    await ev("document.querySelector('.ai-archive-planner [data-archive-fragment]').scrollIntoView({block:'center'});void 0");await shot('archive-preservation-'+language);
    await ev("document.querySelector('.ai-archive-planner [data-archive-action=build]').scrollIntoView({block:'center'});void 0");await shot('archive-controls-'+language);
    await noWrites(language,before,stored);
    await field('.ai-archive-planner [data-archive-fragment="0"]','retained');
    await pass('Reselection revokes prior published plan',"!document.querySelector('.ai-archive-planner [data-archive-text=after]')");
    await h.click('.ai-archive-planner [data-archive-action=cancel]');await pass('Cancel clears review and plan',"document.querySelector('.ai-archive-planner [data-archive-stage]').dataset.archiveStage==='cancelled'&&!document.querySelector('.ai-archive-planner [data-archive-fragment]')");
    await noWrites(language+' cancel',before,stored);
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
  for(const reason of ['incomplete','canonical','secondary','properties','yaml','damage']) {
    await setup('refusal-'+reason,{incomplete:reason==='incomplete',yaml:reason==='properties'?'---\nveynrel: {archive_status: archived}\n---\n\n':reason==='yaml'?"---\n'quoted key': value\n---\n\n":''});
    if(reason==='canonical'||reason==='secondary') {
      const path=mergePlan[reason].path;fs.appendFileSync(vault+'/'+path,'\nLATER USER TEXT\n');
      await wait(`app.vault.read(app.vault.getFileByPath(${JSON.stringify(path)})).then(s=>s.includes('LATER USER TEXT'))`);
    }
    if(reason==='damage')fs.writeFileSync(journal+'/'+id+'/backup.json','{partial');
    const before=disk(),stored=journalBytes();await open();
    if(reason==='properties'||reason==='yaml'){await choose();await build();}
    await pass(reason+': refused without publishing plan',"document.querySelector('.ai-archive-planner [data-archive-stage]').dataset.archiveStage==='error'&&!document.querySelector('.ai-archive-planner [data-archive-text=after]')");
    await shot('archive-refusal-'+reason);await noWrites(reason,before,stored);
  }
  await setup('staleness');const stored=journalBytes();await open();await choose();await build();
  fs.appendFileSync(vault+'/'+mergePlan.secondary.path,'\nUSER AFTER PREVIEW\n');await wait("document.querySelector('.ai-archive-planner [data-archive-stage]')?.dataset.archiveStage==='stale'");
  await pass('External edit revokes all confirmations and the published plan',"!document.querySelector('.ai-archive-planner [data-archive-text=after]')&&!document.querySelector('.ai-archive-planner [data-archive-fragment]')");
  await shot('archive-stale');await noWrites('staleness',disk(),stored);
  await setup('unknown');await ev('window.archiveResolved=app.metadataCache.resolvedLinks;app.metadataCache.resolvedLinks=undefined;void 0');
  const before=disk(),unknownStored=journalBytes();await open();await choose();await build();
  await pass('Unavailable incoming cache stays unknown, never certified empty',"JSON.parse(document.querySelector('.ai-archive-planner [data-archive-text=json]').textContent).dependencies.every(d=>d.incoming===null)");
  await noWrites('unknown',before,unknownStored);await h.closeAll();await ev('app.metadataCache.resolvedLinks=archiveResolved;void 0');
  await h.history();await observe();
  await ev('window.archiveReadApplied=plugin.safeApply.merge.readApplied.bind(plugin.safeApply.merge);plugin.safeApply.merge.readApplied=(...a)=>new Promise(resolve=>{window.releaseArchive=()=>archiveReadApplied(...a).then(resolve).catch(()=>resolve(null))});void 0');
  await h.click(row()+' [data-archive-action=open]');await wait('!!window.releaseArchive');await h.closeAll();
  await ev('releaseArchive();plugin.safeApply.merge.readApplied=archiveReadApplied;void 0');await wait('!plugin.safeApply.busy');
  await pass('Close during deferred basis read never restores planner UI',"!document.querySelector('.ai-archive-planner')");await noWrites('close',before,unknownStored);
  return {status:'PASS',checks,artifactSha256:createHash('sha256').update(fs.readFileSync(ROOT+'/main.js')).digest('hex'),
    limits:'Synthetic Linux Obsidian desktop; 390 px is desktop emulation, not physical mobile. Built-in light/dark, no custom themes or screen-reader acceptance. Model response replaced only for prerequisite Merge Apply. Archive planning performs no completion or writes. SIGKILL restarts exercise completed journal provenance; no archive executor exists.'};
}
