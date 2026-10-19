// New synthetic sources; real Group/Bundle Apply receipts, then a strictly read-only archive review.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {safeApplyHarness} from './safe-apply-native.mjs';

export async function archivePlannerV2Scenario(context) {
  const {ev,wait,cdp,root,vault,ROOT,restart,focusMain}=context,checks=[],cases=[];
  const sha=b=>createHash('sha256').update(b).digest('hex');
  const corpus=JSON.parse(fs.readFileSync(ROOT+'/tests/fixtures/consolidation-realistic-v1.json'));
  const pass=async(name,expression)=>{assert(await ev(expression),name);checks.push(name);console.log(name);};
  const shot=async name=>fs.writeFileSync(root+'/'+name+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const field=(selector,value)=>ev(`{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change'));}void 0`);
  const snapshot=()=>Object.fromEntries(fs.readdirSync(vault,{recursive:true}).filter(p=>p.endsWith('.md')||/consolidation-[^/]*operations\/.*\.json$/.test(p)).sort().map(p=>{const s=fs.statSync(vault+'/'+p);return[p,{sha256:sha(fs.readFileSync(vault+'/'+p)),mtime:s.mtimeMs,bytes:s.size}]}));
  const observe=()=>ev(`window.archiveV2IO={active:true,markdown:0,journal:0,models:0,calls:window.safeTest?.calls??0};
    if(!window.archiveV2Hooks){window.archiveV2Hooks=true;
      for(const key of ['relationshipSession','decisionsProvider','rerankProvider']){const fn=engine[key].bind(engine);engine[key]=(...args)=>{if(archiveV2IO.active){archiveV2IO.models++;throw Error('model factory blocked during archive review')}return fn(...args)}}
      for(const key of ['process','modify','create','append','delete','rename']){const fn=app.vault[key].bind(app.vault);app.vault[key]=(...args)=>{if(archiveV2IO.active)archiveV2IO.markdown++;return fn(...args)}}
      for(const key of ['write','copy','mkdir','remove','rename','append']){const fn=app.vault.adapter[key].bind(app.vault.adapter);app.vault.adapter[key]=(...args)=>{if(archiveV2IO.active&&args.some(a=>typeof a==='string'&&/consolidation-[^/]*operations/.test(a)))archiveV2IO.journal++;return fn(...args)}}
    }void 0`);
  let h=safeApplyHarness(context);
  for(const language of ['en','ru'])for(const kind of ['group','07','08','09']) {
    await h.closeAll();await ev('if(window.archiveV2IO)archiveV2IO.active=false;app.setting.open();app.setting.openTabById("ai-knowledge-hub");void 0');
    await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'));}void 0`);
    await ev('plugin.settingsSave');await ev('app.setting.close();void 0');
    const name=`archive-v2-${kind}-${language}`,type=kind==='group'?'group':'bundle',canonical=language==='en'?0:1;
    const paths=[`ArchiveV2/${name}/A.md`,`ArchiveV2/${name}/B.md`];h=safeApplyHarness(context,paths);
    const fixture=kind==='group'?{
      notes:['# Existing guide\n\nShared scoped fact.\n\n## Existing scope\n\nOriginal observation.\n',
        '# Source guide\n\nShared scoped fact.\n\nRoot introduction 🪶 é 中文.\n\n## Practice\n\nAncestor introduction.\n\n### Trial\n\nНаблюдение 🪶.\n\n## Other\n\nRetained sibling observation.\n'],
      controlResponse:{relation:'partial_overlap',explanation:{text:'Scripted structural control.',evidence:['s']},claims:[{id:'s',kind:'shared',text:'Shared limited fact.',quoteA:'Shared scoped fact.',quoteB:'Shared scoped fact.'}],recommendation:{action:'consider_merge',reason:'Review context.',evidence:['s']},alternatives:[],limitations:['Synthetic control, not semantic completeness proof.']}
    }:corpus.cases.find(c=>c.id===kind);
    const notes=canonical===0?fixture.notes:[...fixture.notes].reverse(),response=structuredClone(fixture.controlResponse);
    if(canonical===1)for(const c of response.claims){[c.quoteA,c.quoteB]=[c.quoteB,c.quoteA];c.kind=c.kind.replace(/_a$/,'_temp').replace(/_b$/,'_a').replace(/_temp$/,'_b')}
    if(language==='ru')for(const c of response.claims)for(const k of ['quoteA','quoteB'])if(c[k])c[k]=c[k].replace(/\n/g,'\r\n');
    [h.fixture.a,h.fixture.b]=notes.map(s=>language==='ru'?s.replace(/\n/g,'\r\n'):s);h.fixture.response=response;await h.setup();
    const secondary=paths[1-canonical].slice(0,-3),consumer=`ArchiveV2/${name}/Consumer.md`;
    fs.writeFileSync(vault+'/'+consumer,`---\nrelated: "[[${secondary}]]"\n---\n\n[[${secondary}${kind==='group'?'#Trial':''}]]\n\n![[${secondary}${kind==='group'?'#Trial':''}]]\n`);
    await wait(`app.metadataCache.resolvedLinks[${JSON.stringify(consumer)}]?.[${JSON.stringify(secondary+'.md')}]===3`);
    await focusMain();await ev(`engine.inspectPair({leftPath:${JSON.stringify(paths[0])},rightPath:${JSON.stringify(paths[1])}})`);await wait("document.querySelectorAll('.ai-pair-note').length===2");
    await h.click('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");await h.click('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-planner-action=open]')");
    await h.click('[data-planner-action=open]');await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='choosing'");
    await field('[data-planner-field=operation]',`copy_context_${type}`);await field(`[data-planner-field=${type}-canonical]`,canonical);
    if(kind==='group') {
      await field('[data-planner-field=group-selection]',await ev("document.querySelector('[data-planner-field=group-selection]').options[3].value"));
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
    await h.click(`[data-${type}-apply-action=review]`);await wait(`!!document.querySelector('.ai-${type}-apply [data-${type}-apply-action=confirm]')&&!plugin.safeApply.busy`);
    await h.click(`.ai-${type}-apply [data-${type}-apply-action=confirm]`);await wait(`!plugin.safeApply.busy&&!!document.querySelector('.ai-${type}-apply [data-${type}-apply-action=history]')`);
    const entry=await ev(`(async()=> (await plugin.safeApply.${type}.journal.entries()).find(e=>e.record?.plan.canonical.path===${JSON.stringify(parentPlan.canonical.path)}))()`),id=entry.id;
    assert(!entry.damaged&&entry.receipts.length===1&&entry.receipts[0].state==='applied');
    assert.equal(fs.readFileSync(vault+'/'+parentPlan.canonical.path,'utf8'),parentPlan.canonical.after);assert.equal(fs.readFileSync(vault+'/'+parentPlan.secondary.path,'utf8'),parentPlan.secondary.content);
    const before=snapshot();await h.closeAll();await restart();assert.deepEqual(snapshot(),before);
    await h.history();await observe();await h.click(`[data-operation-id="${id}"] [data-archive-v2-action=open]`);
    await wait("document.querySelector('.ai-archive-planner-v2 [data-archive-stage]')?.dataset.archiveStage==='choosing'");
    await pass(name+': explicit independent review, unchecked controls and known dependencies',`document.querySelector('.ai-archive-planner-v2 [data-archive-action=build]').disabled&&![...document.querySelectorAll('.ai-archive-planner-v2 input')].some(e=>e.checked)&&document.querySelector('.ai-archive-planner-v2').textContent.includes(${JSON.stringify(id)})&&document.querySelector('.ai-archive-planner-v2').textContent.includes('Consumer.md')`);
    const count=await ev("document.querySelectorAll('.ai-archive-planner-v2 [data-archive-fragment]').length");
    if(kind==='group')assert(count>0);else assert.equal(count,0);
    if(count){await field('[data-archive-fragment="0"]','consolidate');await pass(name+': further consolidation blocks',"document.querySelector('.ai-archive-planner-v2 [data-archive-action=build]').disabled");}
    for(let i=0;i<count;i++)await field(`[data-archive-fragment="${i}"]`,i?'retained':'represented');
    await field('[data-archive-status]','archived');await h.click('[data-archive-ack]');
    await pass(name+': unknown-consumer decision is separately required',"document.querySelector('.ai-archive-planner-v2 [data-archive-action=build]').disabled");
    await h.click('[data-archive-unknown]');await h.click('[data-archive-action=build]');
    await wait("['ready','stale','error'].includes(document.querySelector('.ai-archive-planner-v2 [data-archive-stage]')?.dataset.archiveStage)");
    await pass(name+': separate v2, complete before/after and diff, no executor',"document.querySelector('.ai-archive-planner-v2 [data-archive-stage]').dataset.archiveStage==='ready'&&!!document.querySelector('.ai-archive-planner-v2 .ai-proposal-diff')&&!document.querySelector('.ai-archive-planner-v2 [data-archive-action=applyReview],.ai-archive-planner-v2 [data-archive-apply-action]')");
    const plan=await ev("JSON.parse(document.querySelector('.ai-archive-planner-v2 [data-archive-text=json]').textContent)");
    assert.equal(plan.version,2);assert.equal(plan.provenance.id,id);assert.equal(plan.provenance.operation,entry.record.operation);
    assert.equal(plan.secondary.before,parentPlan.secondary.content);assert.equal(plan.canonical.content,parentPlan.canonical.after);
    assert.equal(plan.secondary.after.replace(plan.edit.inserted,''),plan.secondary.before);assert.equal(plan.partition.map(p=>p.range.text).join(''),plan.secondary.before);
    assert(!plan.confirmation.semanticCompletenessProven);fs.writeFileSync(root+'/'+name+'-plan.json',JSON.stringify(plan,null,2));
    for(const theme of ['theme-light','theme-dark'])for(const width of [1200,390]) {
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');document.querySelector('.ai-archive-planner-v2').scrollTop=0;void 0`);
      await pass(`${name} ${theme} ${width}: localized, no overflow`,"[...document.querySelectorAll('.ai-archive-planner-v2,.ai-archive-planner-v2 pre,.ai-archive-planner-v2 select,.ai-archive-planner-v2 .ai-proposal-diff')].every(e=>e.scrollWidth<=e.clientWidth+1)&&!/@archive/.test(document.querySelector('.ai-archive-planner-v2').textContent)");await shot(`${name}-${theme}-${width}`);
    }
    for(const [key,selector] of [['after','[data-archive-text=after]'],['diff','.ai-proposal-diff'],['controls','[data-archive-unknown]']]) {
      await ev(`document.querySelector('.ai-archive-planner-v2 ${selector}').scrollIntoView({block:'center'});void 0`);await shot(name+'-'+key);
    }
    await h.click('[data-archive-unknown]');await pass(name+': changing a decision revokes plan',"!document.querySelector('.ai-archive-planner-v2 [data-archive-text=json]')&&document.querySelector('.ai-archive-planner-v2 [data-archive-action=build]').disabled");
    await h.click('[data-archive-action=cancel]');await pass(name+': cancellation discards review',"document.querySelector('.ai-archive-planner-v2 [data-archive-stage]').dataset.archiveStage==='cancelled'");
    await h.click('[data-archive-action=restart]');await wait("document.querySelector('.ai-archive-planner-v2 [data-archive-stage]')?.dataset.archiveStage==='choosing'");
    await pass(name+': restarting never restores confirmations',"![...document.querySelectorAll('.ai-archive-planner-v2 input')].some(e=>e.checked)&&[...document.querySelectorAll('.ai-archive-planner-v2 select')].every(e=>!e.value)");
    await pass(name+': zero planner Markdown/journal writes and model/network requests',"archiveV2IO.markdown===0&&archiveV2IO.journal===0&&archiveV2IO.models===0&&(window.safeTest?.calls??0)===archiveV2IO.calls&&io.network===0");
    assert.deepEqual(snapshot(),before);cases.push({name,id,operation:entry.record.operation,partitionParts:plan.partition.length,reviewParts:count,markdownWrites:0,journalWrites:0,modelRequests:0});
    if(kind==='group'&&language==='en') {
      for(let i=0;i<count;i++)await field(`[data-archive-fragment="${i}"]`,'retained');
      await field('[data-archive-status]','archived');await h.click('[data-archive-ack]');await h.click('[data-archive-unknown]');await h.click('[data-archive-action=build]');
      await wait("document.querySelector('.ai-archive-planner-v2 [data-archive-stage]')?.dataset.archiveStage==='ready'");
      await ev(`(async()=>{window.archiveEditor=app.workspace.getLeaf('window');await archiveEditor.openFile(app.vault.getFileByPath(${JSON.stringify(parentPlan.secondary.path)}));return true})()`);
      await wait("document.querySelector('.ai-archive-planner-v2 [data-archive-stage]')?.dataset.archiveStage==='stale'");
      await pass(name+': opening secondary in popout revokes the published plan',"!document.querySelector('.ai-archive-planner-v2 [data-archive-text=json]')");
      await shot(name+'-popout-stale');await ev('archiveEditor.detach();void 0');await focusMain();
      assert.deepEqual(snapshot(),before);
      await h.click('[data-archive-action=restart]');await wait("document.querySelector('.ai-archive-planner-v2 [data-archive-stage]')?.dataset.archiveStage==='choosing'");
    }
    if(kind==='group') {
      await ev('archiveV2IO.active=false;void 0');
      fs.appendFileSync(vault+'/'+parentPlan.canonical.path,'\nLater independent edit.\n');
      await wait("document.querySelector('.ai-archive-planner-v2 [data-archive-stage]')?.dataset.archiveStage==='stale'");await shot(name+'-stale');
      await h.history();await pass(name+': later edit cannot use old parent',`!document.querySelector('[data-operation-id="${id}"] [data-archive-v2-action=open]')&&!!document.querySelector('[data-operation-id="${id}"] [data-archive-v2-unavailable]')`);
    }
    await h.closeAll();
  }
  fs.writeFileSync(root+'/archive-v2-cases.json',JSON.stringify(cases,null,2));
  return {status:'PASS',checks,cases,artifactSha256:sha(fs.readFileSync(ROOT+'/main.js')),limits:'Synthetic Linux Obsidian, fresh sources and real completed Group/Bundle Apply. Scripted Analyzer only for parent preparation. Archive review has no model calls or writes. 390px is desktop emulation, not physical mobile. Built-in themes; no custom theme, screen reader or complete external-dependency claim.'};
}
