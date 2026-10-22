// Real Obsidian input on synthetic saved Markdown and offline centroids. No model or embeddings.
import assert from 'node:assert/strict';
import fs from 'node:fs';
export async function reviewRuleChecks(c) {
 const {ev,wait,click,clickSelector,shot,startVideo,stopVideo,pass,locale,field,cdp,pause,settle,
   vault,dir,root,rulePaths,before,markdown,requests,checks,metrics,screenshots,sourceCommit}=c;
 const ready=()=>wait('!hv.workbench.data.busy&&!hv.workbench.facts?.running&&!hv.workbench.facts?.dirty.size');
 const refresh=async()=>{await click('review-refresh');await ready();};
 const counts=()=>ev(`(()=>{const d=hv.workbench.data,s=d.semantic?.getSnapshot(),p=d.comparison?.getSnapshot().comparison?.pairs.filter(p=>p.category==='candidate')??[];
 return {ids:p.map(p=>p.id),scope:d.scope.paths.length,semantic:s?.mappedNoteCount,taskTask:p.filter(p=>[p.leftPath,p.rightPath].every(p=>p.includes('/Tasks/'))).length,
 taskTheory:p.filter(p=>[p.leftPath,p.rightPath].filter(p=>p.includes('/Tasks/')).length===1).length,other:p.filter(p=>[p.leftPath,p.rightPath].every(p=>!p.includes('/Tasks/'))).length,
 rules:s?.selection??null,reviewed:hv.workbench.pair.decisions.list().length,active:document.querySelectorAll('[data-pair-id]').length}})()`);
 const noMap=()=>pass('List route has no graph renderer, SVG or simulation',"!hv.workbench.map&&!document.querySelector('svg[data-camera],canvas')&&graphicalCreations===0");
 const add=async(mode,kind,target)=>{await click('review-rules');await wait("!!document.querySelector('#rules-target')");await field('#rules-mode',mode);await field('#rules-kind',kind);await field('#rules-target',target);await shot(`rule-${mode}-${kind}`);await click('rules-save');await wait("!document.querySelector('#rules-target')");};
 const pairSelector=(a,b)=>`[data-pair-id=${JSON.stringify(JSON.stringify([a,b].sort()))}]`;
 const targetPair=pairSelector('Rules/Tasks/Exercise 0.md','Rules/Theory/Explanation 0.md');
 await field('[data-health-action=scope-picker]','Rules');await wait("hv.areaIndex.selection.path==='Rules'");
 await click('review-connections');await refresh();
 const baseline=await counts();assert.equal(baseline.taskTask,15);assert.equal(baseline.taskTheory,0);assert.equal(baseline.other,15);
 await pass('Original task has five task neighbors; explanation is outside top-five union',"hv.workbench.data.semantic.getSnapshot().map.nodes.find(n=>n.path==='Rules/Tasks/Exercise 0.md').neighbors.every(n=>n.path.includes('/Tasks/'))");
 await startVideo('connection-rules-route');await shot('01-before-rules');await pause(800);
 await add('within','tag','practice/task');
 await pass('Save marks previous results stale, without an automatic request',"hv.workbench.data.comparison.getSnapshot().state==='stale'");
 await refresh();const within=await counts();assert.equal(within.taskTask,0);assert(within.taskTheory>0);assert.equal(within.rules.excludedPairCount,15);assert.equal(within.rules.unknownPairCount,0);
 await pass('Sixth explanation is first eligible neighbor in the actual list source',`hv.workbench.data.semantic.getSnapshot().map.nodes.find(n=>n.path==='Rules/Tasks/Exercise 0.md').neighbors[0].path==='Rules/Theory/Explanation 0.md'&&!!document.querySelector(${JSON.stringify(targetPair)})`);
 await shot('02-within-rule');await noMap();
 await field('[data-health-action=review-search]','Exercise 0','input');await ready();await shot('02b-exercise-to-explanation');await pause(800);
 await clickSelector(targetPair);await wait("document.querySelectorAll('.ai-pair-note').length===2");await shot('03-compare-without-map');await pause(900);
 await click('review-back');await ready();
 await pass('Comparison return preserves scope and search',"hv.areaIndex.selection.path==='Rules'&&document.querySelector('[data-health-action=review-search]').value==='Exercise 0'");
 await field('[data-health-action=review-search]','','input');
 await click('review-repeats');await refresh();
 await pass('Exercise duplicate remains in Repeats; rules button is absent there',`!!document.querySelector(${JSON.stringify(pairSelector('Rules/Tasks/Exercise 0.md','Rules/Tasks/Exercise 1.md'))})&&!document.querySelector('[data-health-action=review-rules]')`);
 await shot('04-exercise-duplicates');await click('review-connections');await ready();
 await clickSelector(targetPair);await wait("!!document.querySelector('[data-review-keep]:not(:disabled)')");await clickSelector('[data-review-keep]');await wait("!!document.querySelector('[data-review-decision-saved]')");await ready();
 await pass('Rule and saved pair decision coexist',`!document.querySelector(${JSON.stringify(targetPair)})&&hv.workbench.pair.decisions.list().length===1`);
 if(c.upgrade)await c.upgrade();
 await ev("await app.plugins.disablePlugin('ai-knowledge-hub');await app.plugins.enablePlugin('ai-knowledge-hub');window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.engine=plugin.semanticController;app.commands.executeCommandById('ai-knowledge-hub:veynrel-review-vault');void 0");
 await wait("!!app.workspace.getLeavesOfType('veynrel-health')[0]?.view.workbench");await ev("window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;void 0");
 await field('[data-health-action=scope-picker]','Rules');await click('review-connections');await refresh();
 assert.equal((await counts()).taskTask,0);
 await pass('Real plugin restart preserves enabled rule',"hv.workbench.data.dependencies.rules.list().length===1&&hv.workbench.data.dependencies.rules.list()[0].enabled");
 await pass('Restart retains exact pair decision with rule',`!document.querySelector(${JSON.stringify(targetPair)})&&hv.workbench.pair.decisions.list().length===1`);
 await shot('05-after-restart');await click('review-rules');await clickSelector('[data-rule-id]');await shot('06-disabled-rule');await click('rules-close');await refresh();
 await pass('Disabling a rule does not discard pair decisions','hv.workbench.pair.decisions.list().length===1');
 await click('review-reviewed');await clickSelector('[data-review-restore]');await ready();
 const disabled=await counts();assert.deepEqual(disabled.ids,baseline.ids);for(const key of ['taskTask','taskTheory','other'])assert.equal(disabled[key],baseline[key]);
 await shot('07-restored-original-selection');await stopVideo();
 checks.push('Disabling rule restores the original candidates and ordering inputs');
 // Full exclusion is independent from the duplicate queue and requires its own explicit choice.
 await add('exclude','folder','Rules/Tasks');await refresh();const excluded=await counts();
 assert.equal(excluded.taskTask,0);assert.equal(excluded.taskTheory,0);assert.equal(excluded.rules.excludedNoteCount,6);assert.equal(excluded.other,15);
 await shot('08-full-exclusion');
 await field('[data-health-action=scope-picker]','Rules/Tasks');await refresh();
 await pass('Fully excluded selected scope is an empty ready queue, not a setup error',"hv.workbench.data.comparison.getSnapshot().state==='ready'&&hv.workbench.data.semantic.getSnapshot().map.nodes.length===0&&!document.querySelector('[data-health-action=review-settings]')&&!document.querySelector('[data-pair-id]')");
 await shot('08b-all-excluded');await field('[data-health-action=scope-picker]','Rules');await refresh();
 // Durable version decisions survive policy changes; restoring one does not bypass policy.
 await click('review-repeats');await refresh();await clickSelector(pairSelector('Rules/Tasks/Exercise 0.md','Rules/Tasks/Exercise 1.md'));
 await wait("!!document.querySelector('[data-review-keep]:not(:disabled)')");await clickSelector('[data-review-keep]');await wait("!!document.querySelector('[data-review-decision-saved]')");await ready();
 await click('review-connections');await click('review-reviewed');await clickSelector('[data-review-restore]');await ready();
 await pass('Restoring a pair decision does not bypass the full-exclusion rule',`!document.querySelector(${JSON.stringify(pairSelector('Rules/Tasks/Exercise 0.md','Rules/Tasks/Exercise 1.md'))})`);
 // Two ItemViews share the same in-memory policy owner; no independent stale copies.
 await ev("window.rulesOwner=hv.workbench.data.dependencies.rules;window.secondLeaf=app.workspace.openPopoutLeaf({width:820,height:760});await secondLeaf.setViewState({type:'veynrel-health',active:true});secondLeaf.view.openReviewVault();void 0");
 await wait('!!secondLeaf.view.workbench');await pass('Real popout and main view share one policy owner',"secondLeaf.view.workbench.data.dependencies.rules===rulesOwner");
 await ev('secondLeaf.detach();void 0');
 // Real adapter failure must leave the durable policy untouched.
 const disk=fs.readFileSync(dir+'/connection-rules.json','utf8');
 await click('review-rules');await ev("window.realRulesWrite=app.vault.adapter.write.bind(app.vault.adapter);app.vault.adapter.write=async(p,...args)=>{if(p.endsWith('/connection-rules.json.tmp'))throw Error('Synthetic disk failure');return realRulesWrite(p,...args)};void 0");
 await clickSelector('[data-rule-id=rule-2]');await wait("document.querySelector('.veynrel-connection-rules').textContent.includes('Не удалось сохранить')");await shot('09-save-error');
 assert.equal(fs.readFileSync(dir+'/connection-rules.json','utf8'),disk);
 await pass('Failed persistence leaves the previous enabled rule active',"rulesOwner.list().find(r=>r.id==='rule-2').enabled");
 await ev('app.vault.adapter.write=realRulesWrite;void 0');await click('rules-close');
 // UI matrix and keyboard form use; same metadata input, no Markdown mutations.
 for(const language of ['ru','en']){
  await locale(language);
  for(const theme of ['theme-dark','theme-light'])for(const width of [1280,390]){
   await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
   await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');void 0`);
   await click('review-connections');await shot(`list-${language}-${theme}-${width}`);
   await click('review-rules');await shot(`rules-${language}-${theme}-${width}`);
   await pass(`Rules fit ${language} ${theme} ${width}`,"(()=>{const c=document.querySelector('.veynrel-connection-rules');return c.scrollWidth<=c.clientWidth+2&&[...c.querySelectorAll('select,button')].every(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth})})()");
   await ev("document.querySelector('#rules-mode').focus();void 0");
   await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
   await pass('Native keyboard reaches group selector',"document.activeElement.id==='rules-kind'");await click('rules-close');
  }
 }
 assert.deepEqual(markdown(vault),before);assert.equal(requests.length,0);
 metrics.before=baseline;metrics.within=within;metrics.disabled=disabled;metrics.excluded=excluded;
 fs.writeFileSync(root+'/report.json',JSON.stringify({status:'native stage 2 regression',sourceCommit,checks,metrics,screenshots,httpRequests:requests.length,
  originalMarkdown:before,finalMarkdown:markdown(vault),limitations:'Artificial vectors test selection, not embedding quality. No personal vault, TEST installation, live model, or physical mobile.'},null,2));
 console.log(JSON.stringify({status:'PASS',checks:checks.length,root}));
}
