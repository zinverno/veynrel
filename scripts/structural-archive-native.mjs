// Synthetic native structural archive: real parent receipts, secondary Vault.process and owned SIGKILL.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {safeApplyHarness} from './safe-apply-native.mjs';

export async function structuralArchiveScenario(context) {
  const {ev,wait,cdp,root,vault,ROOT,restart:nativeRestart,focusMain}=context,checks=[],cases=[];
  const sha=b=>createHash('sha256').update(b).digest('hex');
  const corpus=JSON.parse(fs.readFileSync(ROOT+'/tests/fixtures/consolidation-realistic-v1.json'));
  const pass=async(name,expression)=>{assert(await ev(expression),name);checks.push(name);console.log(name);};
  const shot=async name=>fs.writeFileSync(root+'/'+name+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const field=(selector,value)=>ev(`{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change'));}void 0`);
  const snapshot=()=>Object.fromEntries(fs.readdirSync(vault,{recursive:true}).filter(p=>p.endsWith('.md')||/consolidation-[^/]*operations\/.*\.json$/.test(p)).sort().map(p=>{const s=fs.statSync(vault+'/'+p);return[p,{sha256:sha(fs.readFileSync(vault+'/'+p)),mtime:s.mtimeMs,bytes:s.size}]}));
  const observe=()=>ev(`window.archiveV2IO={active:true,process:[],other:0,journal:0,models:0};
    if(!window.archiveV2Hooks){window.archiveV2Hooks=true;
      for(const key of ['relationshipSession','decisionsProvider','rerankProvider']){const fn=engine[key].bind(engine);engine[key]=(...args)=>{if(archiveV2IO.active){archiveV2IO.models++;throw Error('model blocked during archive')}return fn(...args)}}
      {const fn=app.vault.process.bind(app.vault);app.vault.process=(file,cb)=>{if(archiveV2IO.active)archiveV2IO.process.push(file.path);return fn(file,cb)}}
      for(const key of ['modify','create','append','delete','rename']){const fn=app.vault[key].bind(app.vault);app.vault[key]=(...args)=>{if(archiveV2IO.active)archiveV2IO.other++;return fn(...args)}}
      for(const key of ['write','copy','mkdir','remove','rename','append']){const fn=app.vault.adapter[key].bind(app.vault.adapter);app.vault.adapter[key]=(...args)=>{if(archiveV2IO.active&&args.some(a=>typeof a==='string'&&/consolidation-[^/]*operations/.test(a)))archiveV2IO.journal++;return fn(...args)}}
    }void 0`);
  const noModels=async()=>assert(await ev('archiveV2IO.models===0&&io.network===0&&archiveV2IO.other===0'),'zero model/network calls and no other Markdown mutation API');
  const restart=async()=>{if(await ev('!!window.archiveV2IO?.active'))await noModels();await nativeRestart();await observe();};
  let h=safeApplyHarness(context);
  const setup=async(name,kind='group',language='en',level=3)=>{
    await h.closeAll();await wait('!plugin.safeApply.busy');await ev('if(window.archiveV2IO)archiveV2IO.active=false;app.setting.open();app.setting.openTabById("ai-knowledge-hub");void 0');
    await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'));}void 0`);
    await ev('plugin.settingsSave');await ev('app.setting.close();void 0');
    const type=kind==='group'?'group':'bundle',canonical=language==='en'?0:1;
    const paths=[`StructuralArchive/${name}/A.md`,`StructuralArchive/${name}/B.md`];h=safeApplyHarness(context,paths);
    const fixture=kind==='group'?{
      notes:['# Existing guide\n\nShared scoped fact.\n\n## Existing scope\n\nOriginal observation.\n',
        '# Source guide\n\nShared scoped fact.\n\nRoot introduction 🪶 é 中文.\n\n## Practice\n\nAncestor introduction.\n\n### Trial\n\nНаблюдение 🪶.\n\n## Other\n\nRetained sibling observation.\n'],
      controlResponse:{relation:'partial_overlap',explanation:{text:'Scripted structural control.',evidence:['s']},claims:[{id:'s',kind:'shared',text:'Shared limited fact.',quoteA:'Shared scoped fact.',quoteB:'Shared scoped fact.'}],recommendation:{action:'consider_merge',reason:'Review context.',evidence:['s']},alternatives:[],limitations:['Synthetic control, not semantic completeness proof.']}
    }:corpus.cases.find(c=>c.id===kind);
    const notes=canonical===0?fixture.notes:[...fixture.notes].reverse(),response=structuredClone(fixture.controlResponse);
    if(canonical===1)for(const c of response.claims){[c.quoteA,c.quoteB]=[c.quoteB,c.quoteA];c.kind=c.kind.replace(/_a$/,'_temp').replace(/_b$/,'_a').replace(/_temp$/,'_b')}
    if(language==='ru')for(const c of response.claims)for(const k of ['quoteA','quoteB'])if(c[k])c[k]=c[k].replace(/\n/g,'\r\n');
    [h.fixture.a,h.fixture.b]=notes.map(s=>language==='ru'?s.replace(/\n/g,'\r\n'):s);h.fixture.response=response;await h.setup();
    const secondary=paths[1-canonical].slice(0,-3),consumer=`StructuralArchive/${name}/Consumer.md`;
    fs.writeFileSync(vault+'/'+consumer,`---\nrelated: "[[${secondary}]]"\n---\n\n[[${secondary}${kind==='group'?'#Trial':''}]]\n\n![[${secondary}${kind==='group'?'#Trial':''}]]\n`);
    await wait(`app.metadataCache.resolvedLinks[${JSON.stringify(consumer)}]?.[${JSON.stringify(secondary+'.md')}]===3`);
    await focusMain();await ev(`engine.inspectPair({leftPath:${JSON.stringify(paths[0])},rightPath:${JSON.stringify(paths[1])}})`);await wait("document.querySelectorAll('.ai-pair-note').length===2");
    await h.click('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");await h.click('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-planner-action=open]')");
    await h.click('[data-planner-action=open]');await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='choosing'");
    await field('[data-planner-field=operation]',`copy_context_${type}`);await field(`[data-planner-field=${type}-canonical]`,canonical);
    if(kind==='group') {
      await field('[data-planner-field=group-selection]',await ev(`document.querySelector('[data-planner-field=group-selection]').options[${level}].value`));
      await h.click('[data-planner-field=group-groupConfirmed]');await field('[data-planner-field=group-representation]','original_heading_branch');
    } else {
      await field('[data-planner-field=bundle-kind]',({'07':'code_explanation','08':'list_context','09':'quotation_attribution'})[kind]);
      await field('[data-planner-field=bundle-selection]',await ev("document.querySelector('[data-planner-field=bundle-selection]').options[1].value"));
      for(const key of await ev("[...document.querySelectorAll('[data-planner-field^=bundle-context-]')].map(e=>e.dataset.plannerField)"))await h.click(`[data-planner-field=${key}]`);
      await h.click('[data-planner-field=bundle-boundariesConfirmed]');
    }
    await h.click(`[data-planner-field=${type}-contextConfirmed]`);await field(`[data-planner-field=${type}-dependencies]`,'reviewed');
    await field(`[data-planner-field=${type}-insertion]`,await ev(`[...engine.pairInspectors].at(-1).planner.view.input.pair[${canonical}].content.length`));await h.click(`[data-planner-field=${type}-insertionConfirmed]`);
    await h.click(`[data-${type}-action=build]`);await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='ready'");
    const parentPlan=await ev(`[...engine.pairInspectors].at(-1).planner.view.${type}Plan`);
    await wait('!plugin.safeApply.busy');await h.click(`[data-${type}-apply-action=review]`);await wait(`!!document.querySelector('.ai-${type}-apply [data-${type}-apply-action=confirm],.ai-${type}-apply [role=alert]')&&!plugin.safeApply.busy`);
    if(await ev(`!!document.querySelector('.ai-${type}-apply [role=alert]')`)) {
      fs.writeFileSync(root+'/'+name+'-parent-failure.json',JSON.stringify(await ev(`({text:document.querySelector('.ai-${type}-apply').textContent,plan:[...engine.pairInspectors].at(-1).planner.view.${type}Plan})`),null,2));
      throw Error('parent review failed; see '+name+'-parent-failure.json');
    }
    await h.click(`.ai-${type}-apply [data-${type}-apply-action=confirm]`);await wait(`!plugin.safeApply.busy&&!!document.querySelector('.ai-${type}-apply [data-${type}-apply-action=history]')`);
    const entry=await ev(`(async()=> (await plugin.safeApply.${type}.journal.entries()).find(e=>e.record?.plan.canonical.path===${JSON.stringify(parentPlan.canonical.path)}))()`),id=entry.id;
    assert(!entry.damaged&&entry.receipts.length===1&&entry.receipts[0].state==='applied');
    assert.equal(fs.readFileSync(vault+'/'+parentPlan.canonical.path,'utf8'),parentPlan.canonical.after);assert.equal(fs.readFileSync(vault+'/'+parentPlan.secondary.path,'utf8'),parentPlan.secondary.content);
    const before=snapshot();await h.closeAll();await restart();assert.deepEqual(snapshot(),before);
    await h.history();await h.click(`[data-operation-id="${id}"] [data-archive-v2-action=open]`);
    await wait("document.querySelector('.ai-archive-planner-v2 [data-archive-stage]')?.dataset.archiveStage==='choosing'");
    await pass(name+': explicit independent review, unchecked controls and known dependencies',`document.querySelector('.ai-archive-planner-v2 [data-archive-action=build]').disabled&&![...document.querySelectorAll('.ai-archive-planner-v2 input')].some(e=>e.checked)&&document.querySelector('.ai-archive-planner-v2').textContent.includes(${JSON.stringify(id)})&&document.querySelector('.ai-archive-planner-v2').textContent.includes('Consumer.md')`);
    const count=await ev("document.querySelectorAll('.ai-archive-planner-v2 [data-archive-fragment]').length");
    if(kind==='group'&&level>1)assert(count>0);else assert.equal(count,0);
    if(count){await field('[data-archive-fragment="0"]','consolidate');await pass(name+': further consolidation blocks',"document.querySelector('.ai-archive-planner-v2 [data-archive-action=build]').disabled");}
    for(let i=0;i<count;i++)await field(`[data-archive-fragment="${i}"]`,i?'retained':'represented');
    await field('[data-archive-status]','archived');await h.click('[data-archive-ack]');
    await pass(name+': unknown-consumer decision is separately required',"document.querySelector('.ai-archive-planner-v2 [data-archive-action=build]').disabled");
    await h.click('[data-archive-unknown]');await h.click('[data-archive-action=build]');
    await wait("['ready','stale','error'].includes(document.querySelector('.ai-archive-planner-v2 [data-archive-stage]')?.dataset.archiveStage)");
    await pass(name+': read-only plan with separate final review',"document.querySelector('.ai-archive-planner-v2 [data-archive-stage]').dataset.archiveStage==='ready'&&!!document.querySelector('.ai-archive-planner-v2 .ai-proposal-diff')&&!document.querySelector('.ai-archive-planner-v2 [data-archive-action=applyReview],.ai-archive-planner-v2 [data-archive-apply-action]')");
    const plan=await ev("JSON.parse(document.querySelector('.ai-archive-planner-v2 [data-archive-text=json]').textContent)");
    assert.equal(plan.version,2);assert.equal(plan.provenance.id,id);assert.equal(plan.provenance.operation,entry.record.operation);
    assert.equal(plan.secondary.before,parentPlan.secondary.content);assert.equal(plan.canonical.content,parentPlan.canonical.after);
    assert.equal(plan.secondary.after.replace(plan.edit.inserted,''),plan.secondary.before);assert.equal(plan.partition.map(p=>p.range.text).join(''),plan.secondary.before);
    assert(!plan.confirmation.semanticCompletenessProven);fs.writeFileSync(root+'/'+name+'-plan.json',JSON.stringify(plan,null,2));
    assert.deepEqual(snapshot(),before);
    await h.click('[data-structural-archive-action=review]');
    await wait("!!document.querySelector('.ai-structural-archive-apply [data-structural-archive-action=confirm],.ai-structural-archive-apply [role=alert]')&&!plugin.safeApply.busy");
    const error=await ev("document.querySelector('.ai-structural-archive-apply [role=alert]')?.textContent");
    if(error)fs.writeFileSync(root+'/'+name+'-review-failure.json',JSON.stringify(await ev(`({error:${JSON.stringify(error)},plan:${JSON.stringify(plan)}})`),null,2));
    assert(!error,error);assert(!await ev("/Merge Apply|Основание Merge/.test(document.querySelector('.ai-structural-archive-apply').textContent)"));assert.deepEqual(snapshot(),before);await noModels();assert(await ev('archiveV2IO.process.length===0&&archiveV2IO.journal===0'));
    await pass(name+': final review creates no journal or Markdown; final confirmation unchecked',"!document.querySelector('[data-structural-archive-ack]').checked&&document.querySelector('.ai-structural-archive-apply [data-structural-archive-action=confirm]').disabled");
    return {name,type,paths,parentPlan,parentId:id,plan,before};
  };

  const confirm=async()=>{
    await h.click('[data-structural-archive-ack]');await h.click('.ai-structural-archive-apply [data-structural-archive-action=confirm]');
    await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-structural-archive-apply [data-structural-archive-action=history]')");
  };
  const journal='.obsidian/plugins/ai-knowledge-hub/consolidation-structural-archive-operations';
  const negative=process.argv.find(a=>a.startsWith('--structural-negative='))?.split('=')[1];
  if(negative) {
    const f=await setup('negative-'+negative,process.argv.includes('--structural-bundle')?'08':'group');
    const restored=['secondary-edit','new-backlink','pending-single'].includes(negative);
    if(restored) {
      await confirm();await h.history();
      const id=await ev(`(async()=> (await plugin.safeApply.structuralArchive.journal.entries()).find(e=>e.record?.parent.id===${JSON.stringify(f.parentId)}).id)()`);
      await h.click(`[data-operation-id="${id}"] [data-structural-archive-action=undoReview]`);
      await wait("!!document.querySelector('.ai-structural-archive-apply [data-structural-archive-action=confirm]')&&!plugin.safeApply.busy");await confirm();await h.closeAll();await wait('!plugin.safeApply.busy');
    }
    const before=snapshot(),processCount=await ev('archiveV2IO.process.length');
    if(negative==='competing') {
      await ev(`window.structuralPlan=${JSON.stringify(f.plan)};void 0`);
      await ev(`(async()=>{window.ticketOne=await plugin.safeApply.structuralArchive.review(structuralPlan,()=>true);window.ticketTwo=await plugin.safeApply.structuralArchive.review(structuralPlan,()=>true);const fn=plugin.safeApply.port.process.bind(plugin.safeApply.port);plugin.safeApply.port.process=async(...a)=>{await new Promise(r=>window.releaseStructural=r);return fn(...a)};window.structuralResult=plugin.safeApply.structuralArchive.execute(ticketOne).then(()=>true,e=>String(e));})()`);
      await wait('!!window.releaseStructural');
      await pass('Competing archive and parent Undo share the owner',`(async()=>{for(const run of [()=>plugin.safeApply.structuralArchive.execute(ticketTwo),()=>plugin.safeApply.${f.type}.reviewUndo(${JSON.stringify(f.parentId)},()=>true)]){try{await run();return false}catch(e){if(e.reason!=='busy')return false}}return archiveV2IO.process.length===${processCount}})()`);
      await ev('releaseStructural();void 0');assert.equal(await ev('structuralResult'),true);
      assert.equal(fs.readFileSync(vault+'/'+f.plan.secondary.path,'utf8'),f.plan.secondary.after);
      assert.equal(fs.readFileSync(vault+'/'+f.plan.canonical.path,'utf8'),f.plan.canonical.content);
    } else {
      if(negative.startsWith('block-')) {
        const dir=vault+'/.obsidian/plugins/ai-knowledge-hub/consolidation-'+negative.slice(6);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/synthetic-unknown.json','{}');
      } else if(negative==='parent-copy') {
        fs.writeFileSync(vault+'/.obsidian/plugins/ai-knowledge-hub/consolidation-'+f.type+'-operations/'+f.parentId+'/backup.json','{torn');
      } else if(negative==='metadata') {
        await ev(`{const fn=app.metadataCache.getFileCache.bind(app.metadataCache);app.metadataCache.getFileCache=file=>file.path===${JSON.stringify(f.plan.secondary.path)}?null:fn(file);}void 0`);
      } else if(negative==='replacement') {
        await ev(`(async()=>{const file=app.vault.getFileByPath(${JSON.stringify(f.plan.secondary.path)});await app.vault.rename(file,${JSON.stringify(f.plan.secondary.path+'.original')});await app.vault.create(${JSON.stringify(f.plan.secondary.path)},${JSON.stringify(f.plan.secondary.before)});})()`);
      } else if(negative==='secondary-edit'||negative==='canonical-edit') {
        const path=negative==='secondary-edit'?f.plan.secondary.path:f.plan.canonical.path;
        fs.appendFileSync(vault+'/'+path,'\nUSER EDIT\n');await wait(`app.vault.read(app.vault.getFileByPath(${JSON.stringify(path)})).then(t=>t.endsWith('USER EDIT\\n'))`);
      } else if(negative==='new-backlink') {
        const path='StructuralArchive/New consumer.md';fs.writeFileSync(vault+'/'+path,`[[${f.plan.secondary.path.slice(0,-3)}]]`);
        await wait(`app.metadataCache.resolvedLinks[${JSON.stringify(path)}]?.[${JSON.stringify(f.plan.secondary.path)}]===1`);
      } else if(negative==='pending-single') {
        const path=f.plan.canonical.path,target=f.plan.secondary.path,before=f.plan.canonical.content,text='Shared scoped fact.',start=before.indexOf(text),end=start+text.length;assert(start>=0);
        const targetModified=await ev(`app.vault.getFileByPath(${JSON.stringify(target)}).stat.mtime`);
        const inserted=` [[${target.slice(0,-3)}]]`,after=before.slice(0,end)+inserted+before.slice(end);
        const r={version:1,operation:'add_link',state:'prepared',id:'',createdAt:1,sourcePath:path,targetPath:target,sourceCreated:f.plan.canonical.created,sourceModified:f.plan.canonical.modified,targetCreated:f.plan.secondary.created,targetModified,before,after,beforeHash:sha(before),afterHash:sha(after),targetHash:sha(f.plan.secondary.before),selection:{start,end,text},edit:{start:end,end,removed:'',inserted}};
        r.id=sha(JSON.stringify({...r,createdAt:0}));const dir=vault+'/.obsidian/plugins/ai-knowledge-hub/consolidation-operations/'+r.id;fs.mkdirSync(dir,{recursive:true});for(const file of ['record.json','backup.json'])fs.writeFileSync(dir+'/'+file,JSON.stringify(r));
        assert(await ev(`(async()=>{const row=(await plugin.safeApply.journal.entries()).find(e=>e.id===${JSON.stringify(r.id)});return row&&!row.damaged&&row.marks.length===0})()`));
      } else throw Error('unknown negative '+negative);
      const changed=snapshot();
      if(restored) {
        await h.history();assert.equal(await ev(`!!document.querySelector('[data-operation-id="${f.parentId}"] [data-${f.type}-apply-action=undoReview]')`),false);
        assert(await ev(`plugin.safeApply.${f.type}.reviewUndo(${JSON.stringify(f.parentId)},()=>true).then(()=>false,()=>true)`));
      } else {
        if(await ev("!!document.querySelector('[data-structural-archive-ack]')"))await confirm();
        await wait("!!document.querySelector('.ai-structural-archive-apply [role=alert]')");
      }
      assert.deepEqual(snapshot(),changed);assert.equal(await ev('archiveV2IO.process.length'),processCount);
      // Replacement explicitly uses native rename/create as adversarial fixture setup, outside the executor.
      if(negative!=='replacement')await noModels();else assert(await ev('archiveV2IO.models===0&&io.network===0'));
      await shot('structural-negative-'+negative);checks.push(`${negative}: refusal without executor Markdown writes`);
      fs.writeFileSync(root+'/structural-negative.json',JSON.stringify({negative,before,changed,after:snapshot()},null,2));
    }
    return {status:'PASS',checks,negative,artifactSha256:sha(fs.readFileSync(vault+'/.obsidian/plugins/ai-knowledge-hub/main.js'))};
  }
  const crash=process.argv.find(a=>a.startsWith('--structural-crash='))?.split('=')[1];
  if(crash) {
    assert(['before-backup','first-backup','both-backups','before-write','after-write','torn-applied','undo-intent','undo-after-write','torn-undone'].includes(crash));
    const kind=process.argv.includes('--structural-bundle')?'08':'group';
    const f=await setup('crash-'+crash+'-'+kind,kind);
    if(crash.startsWith('undo')||crash==='torn-undone') {
      await confirm();await h.history();
      const id=await ev(`(async()=> (await plugin.safeApply.structuralArchive.journal.entries()).find(e=>e.record?.parent.id===${JSON.stringify(f.parentId)}).id)()`);
      await h.click(`[data-operation-id="${id}"] [data-structural-archive-action=undoReview]`);
      await wait("!!document.querySelector('.ai-structural-archive-apply [data-structural-archive-action=confirm]')&&!plugin.safeApply.busy");
    }
    const parents=Object.fromEntries(Object.entries(snapshot()).filter(([p])=>p.includes('consolidation-')&&!p.includes('consolidation-structural-archive-')));
    await ev(`window.killReached=false;
      ${crash==='before-backup'?"plugin.safeApply.structuralArchive.journal.prepare=async()=>{killReached=true;return new Promise(()=>{})};":''}
      ${crash==='before-write'?"plugin.safeApply.port.process=async()=>{killReached=true;return new Promise(()=>{})};":''}
      ${['first-backup','both-backups'].includes(crash)?`{const a=app.vault.adapter,k='${crash==='first-backup'?'write':'copy'}',fn=a[k].bind(a);a[k]=async(...args)=>{const result=await fn(...args);if(args.some(v=>typeof v==='string'&&v.includes('/consolidation-structural-archive-operations/')&&v.endsWith('${crash==='first-backup'?'record.json':'backup.json'}'))){killReached=true;return new Promise(()=>{})}return result}};`:''}
      ${['after-write','undo-after-write','undo-intent'].includes(crash)?`{const j=plugin.safeApply.structuralArchive.journal,fn=j.mark.bind(j);j.mark=async(...args)=>{if(args[1]==='${crash==='after-write'?'applied':crash==='undo-intent'?'undo_intent':'undone'}'){${crash==='undo-intent'?'await fn(...args);':''}killReached=true;return new Promise(()=>{})}return fn(...args)}};`:''}
      ${crash.startsWith('torn-')?`{const fn=app.vault.adapter.write.bind(app.vault.adapter);app.vault.adapter.write=async(p,data,...rest)=>{if(p.includes('/consolidation-structural-archive-operations/')&&p.includes('/mark-')&&JSON.parse(data).state==='${crash==='torn-applied'?'applied':'undone'}'){await fn(p,data.slice(0,24),...rest);killReached=true;return new Promise(()=>{})}return fn(p,data,...rest)}};`:''}void 0`);
    await h.click('[data-structural-archive-ack]');await h.click('.ai-structural-archive-apply [data-structural-archive-action=confirm]');await wait('killReached');
    const stopped=snapshot();await noModels();await restart();assert.deepEqual(snapshot(),stopped);await h.history();assert.deepEqual(snapshot(),stopped);
    const rows=await ev('(async()=>await plugin.safeApply.structuralArchive.history())()');
    const canParent=await ev(`!!document.querySelector('[data-operation-id="${f.parentId}"] [data-${f.type}-apply-action=undoReview]')`);
    assert.equal(canParent,crash==='before-backup');
    assert(crash==='before-backup'?rows.length===0:rows.length===1&&!rows[0].canUndo);
    if(rows.length) {
      assert.equal(await ev(`plugin.safeApply.${f.type}.reviewUndo(${JSON.stringify(f.parentId)},()=>true).then(()=>false,()=>true)`),true);
      await ev(`document.querySelector('[data-operation-id="${rows[0].id}"]').scrollIntoView({block:'start'});void 0`);
    }
    assert.equal(fs.readFileSync(vault+'/'+f.plan.canonical.path,'utf8'),f.plan.canonical.content);
    const archived=['after-write','torn-applied','undo-intent'].includes(crash);
    assert.equal(fs.readFileSync(vault+'/'+f.plan.secondary.path,'utf8'),archived?f.plan.secondary.after:f.plan.secondary.before);
    assert.deepEqual(Object.fromEntries(Object.entries(snapshot()).filter(([p])=>p.includes('consolidation-')&&!p.includes('consolidation-structural-archive-'))),parents);
    await noModels();await shot('structural-recovery-'+crash);
    checks.push(`SIGKILL ${crash}: exact Markdown and evidence unchanged at startup; ${canParent?'no archive was prepared':'incomplete chain blocks both Undo actions'}`);
    fs.writeFileSync(root+'/structural-crash.json',JSON.stringify({crash,kind,stopped,afterRestart:snapshot(),rows,parentUndo:canParent},null,2));
    return {status:'PASS',checks,crash,kind,artifactSha256:sha(fs.readFileSync(vault+'/.obsidian/plugins/ai-knowledge-hub/main.js'))};
  }
  for(const language of ['ru','en'])for(const item of ['group1','group2','group3','07','08','09']) {
    const f=await setup(`structural-${item}-${language}`,item.startsWith('group')?'group':item,language,item.startsWith('group')?Number(item.at(-1)):3);
    for(const theme of ['theme-light','theme-dark'])for(const width of [1200,390]) {
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');document.querySelector('.ai-structural-archive-apply').scrollTop=0;void 0`);
      await pass(`${f.name} ${theme} ${width}: full localized review fits`,"[...document.querySelectorAll('.ai-structural-archive-apply,.ai-structural-archive-apply pre,.ai-structural-archive-apply .ai-proposal-diff')].every(e=>e.scrollWidth<=e.clientWidth+1)&&!/@(?:structuralArchive|archive)/.test(document.querySelector('.ai-structural-archive-apply').textContent)");
      await shot(`${f.name}-${theme}-${width}`);
    }
    await ev("document.querySelector('.ai-structural-archive-apply .ai-proposal-diff').scrollIntoView({block:'center'});void 0");await shot(f.name+'-diff');
    await confirm();
    const entry=await ev(`(async()=> (await plugin.safeApply.structuralArchive.journal.entries()).find(e=>e.record?.parent.id===${JSON.stringify(f.parentId)}))()`);
    if(entry?.receipts.length!==1)fs.writeFileSync(root+'/'+f.name+'-apply-failure.json',JSON.stringify(await ev(`({text:document.querySelector('.ai-structural-archive-apply').textContent,entry:${JSON.stringify(entry)},notes:${JSON.stringify(f.paths)}.map(p=>({path:p,stat:app.vault.getFileByPath(p).stat,cache:app.metadataCache.getFileCache(app.vault.getFileByPath(p))})),links:app.metadataCache.resolvedLinks})`),null,2));
    assert(entry&&!entry.damaged&&entry.receipts.length===1,'intact applied receipt');const id=entry.id;
    assert.equal(fs.readFileSync(vault+'/'+f.plan.secondary.path,'utf8'),f.plan.secondary.after);assert.equal(fs.readFileSync(vault+'/'+f.plan.canonical.path,'utf8'),f.plan.canonical.content);
    assert.deepEqual(await ev('archiveV2IO.process'),[f.plan.secondary.path]);await noModels();
    const applied=snapshot();await h.closeAll();await restart();assert.deepEqual(snapshot(),applied);await h.history();
    await pass(f.name+': active archive blocks parent Undo across restart',`!document.querySelector('[data-operation-id="${f.parentId}"] [data-${f.type}-apply-action=undoReview]')&&!!document.querySelector('[data-operation-id="${id}"] [data-structural-archive-action=undoReview]')`);
    await h.click(`[data-operation-id="${id}"] [data-structural-archive-action=undoReview]`);await wait("!!document.querySelector('.ai-structural-archive-apply [data-structural-archive-action=confirm]')&&!plugin.safeApply.busy");
    assert.deepEqual(snapshot(),applied);await pass(f.name+': separate reverse preview and fresh unchecked consent',`!document.querySelector('[data-structural-archive-ack]').checked&&document.querySelector('.ai-structural-archive-apply [data-structural-archive-text=before]').textContent===${JSON.stringify(f.plan.secondary.after)}&&document.querySelector('.ai-structural-archive-apply [data-structural-archive-text=after]').textContent===${JSON.stringify(f.plan.secondary.before)}`);
    await shot(f.name+'-undo');await confirm();
    assert.equal(fs.readFileSync(vault+'/'+f.plan.secondary.path,'utf8'),f.plan.secondary.before);assert.equal(fs.readFileSync(vault+'/'+f.plan.canonical.path,'utf8'),f.plan.canonical.content);
    const restoredMtime=await ev(`app.vault.getFileByPath(${JSON.stringify(f.plan.secondary.path)}).stat.mtime`);assert.notEqual(restoredMtime,f.plan.secondary.modified);
    assert.deepEqual(await ev('archiveV2IO.process'),[f.plan.secondary.path]);await noModels();
    const restored=snapshot();await h.closeAll();await restart();assert.deepEqual(snapshot(),restored);await h.history();
    await pass(f.name+': complete chain enables parent Undo with changed secondary mtime',`!!document.querySelector('[data-operation-id="${f.parentId}"] [data-${f.type}-apply-action=undoReview]')`);
    await h.click(`[data-operation-id="${f.parentId}"] [data-${f.type}-apply-action=undoReview]`);await wait(`!!document.querySelector('.ai-${f.type}-apply [data-${f.type}-apply-action=confirm]')&&!plugin.safeApply.busy`);
    await h.click(`.ai-${f.type}-apply [data-${f.type}-apply-action=confirm]`);await wait(`!plugin.safeApply.busy&&!!document.querySelector('.ai-${f.type}-apply [data-${f.type}-apply-action=history]')`);
    assert.equal(fs.readFileSync(vault+'/'+f.plan.canonical.path,'utf8'),f.parentPlan.canonical.before);assert.equal(fs.readFileSync(vault+'/'+f.plan.secondary.path,'utf8'),f.parentPlan.secondary.content);
    assert.deepEqual(await ev('archiveV2IO.process'),[f.plan.canonical.path]);await noModels();checks.push(f.name+': both original files byte-identical after full cycle');
    cases.push({name:f.name,parentId:f.parentId,archiveId:id,initialSecondaryMtime:f.plan.secondary.modified,restoredSecondaryMtime:restoredMtime,completeCycle:true});
    fs.writeFileSync(root+'/structural-archive-cases.json',JSON.stringify(cases,null,2));
  }
  fs.writeFileSync(root+'/structural-archive-cases.json',JSON.stringify(cases,null,2));
  for(const language of ['en','ru'])for(const popout of [false,true]) {
    const f=await setup(`editor-${language}-${popout}`,'group',language),before=snapshot();
    await ev(`(async()=>{window.structuralEditor=app.workspace.getLeaf(${popout?"'window'":"true"});await structuralEditor.openFile(app.vault.getFileByPath(${JSON.stringify(f.plan.secondary.path)}));})()`);
    await wait(`structuralEditor.view.file?.path===${JSON.stringify(f.plan.secondary.path)}`);await focusMain();
    await wait("!!document.querySelector('.ai-structural-archive-apply [role=alert]')");
    assert.deepEqual(snapshot(),before);await noModels();assert(await ev('archiveV2IO.process.length===0&&archiveV2IO.journal===0'));
    await shot(f.name);checks.push(`${f.name}: open ${popout?'popout':'main'} editor invalidates final consent with zero writes`);
    await h.closeAll();await ev('archiveV2IO.active=false;structuralEditor.detach();void 0');await restart();
  }
  return {status:'PASS',checks,cases,artifactSha256:sha(fs.readFileSync(vault+'/.obsidian/plugins/ai-knowledge-hub/main.js'))};
}
