import fs from 'node:fs';
import assert from 'node:assert/strict';

/** Additional native acceptance; DOM events for the route, host APIs only for fixtures/observations. */
export async function exerciseMore(h) {
 const {ev,cdp,click,clickSelector,field,wait,pass,shot,closeModals,pause,settle,locale,root,vault,before,markdown,pairPaths,fixture,checks,metrics,page,socket,pending,nextId}=h;
 const snapshot=()=>markdown(vault);
 // Strict negative evidence passes through the actual validator.
 await ev(`control.response=${JSON.stringify({...fixture.response,claims:fixture.response.claims.map((c,i)=>i?c:{...c,quoteA:'This quote is not in either source.'})})};void 0`);
 const negativeBefore=await ev('({...io})');
 await click('workbench-compare');await wait("document.querySelectorAll('.ai-pair-note').length===2");
 await clickSelector('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");
 await clickSelector('[data-relationship-action=confirm]');await wait("document.querySelector('[data-relationship-stage]')?.dataset.relationshipStage==='error'");
 await pass('Invalid exact evidence has no planner or write',`!document.querySelector('[data-planner-action=open]')&&io.writes===${negativeBefore.writes}`);await shot('invalid-evidence');assert.deepEqual(snapshot(),before);await click('workbench-back');

 // Detached browser callback and revoked model consent cannot start work again.
 await ev("window.oldCompare=hv.contentEl.querySelector('[data-health-action=workbench-compare]');void 0");
 await field('[data-health-action=workbench-search]','Workbench','input');
 await ev('oldCompare.click();void 0');await pass('Detached browser callback cannot mount a review','engine.pairReviews.size===0');
 await click('workbench-compare');await wait("document.querySelectorAll('.ai-pair-note').length===2");
 await clickSelector('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");
 const calls=await ev('control.calls');await ev("window.oldConsent=document.querySelector('[data-relationship-action=confirm]');void 0");
 await click('workbench-back');await ev('oldConsent.click();void 0');await pause(120);
 await pass('Back revokes consent; detached confirm cannot reuse it',`control.calls===${calls}&&engine.pairReviews.size===0`);

 // Local deferred transport: close/scope change must discard its late answer.
 await ev(`control.response=${JSON.stringify(fixture.response)};control.defer=true;engine.relationshipSession=paths=>{const s=realRelationshipFactory(paths);s.deps.complete=()=>{control.calls++;return new Promise(resolve=>{control.finish=()=>resolve(JSON.stringify(control.response))})};return s};void 0`);
 await click('workbench-compare');await wait("document.querySelectorAll('.ai-pair-note').length===2");
 await clickSelector('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");await clickSelector('[data-relationship-action=confirm]');await wait("typeof control.finish==='function'");
 await field('[data-health-action=scope-picker]','Workbench');await ev('control.finish();void 0');await settle();
 await pass('Scope change discards a late model result and releases its mounted owner',"engine.pairReviews.size===0&&!document.querySelector('[data-planner-action=open]')&&hv.workbench.data.scope.id==='folder:Workbench'");
 await click('workbench-refresh');await wait('!hv.workbench.data.busy');
 await field('[data-health-action=scope-picker]','');await click('workbench-refresh');await wait('!hv.workbench.data.busy');
 await field('[data-health-action=workbench-search]','Workbench','input');await clickSelector('[data-workbench-pair]');
 await ev(`engine.relationshipSession=paths=>{const s=realRelationshipFactory(paths);s.deps.complete=async()=>{control.calls++;return JSON.stringify(control.response)};return s};void 0`);

 // Same route reaches Merge. Secondary remains byte-identical until a separate Archive review.
 await click('workbench-compare');await wait("document.querySelectorAll('.ai-pair-note').length===2");
 await clickSelector('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");await clickSelector('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-planner-action=open]')");
 await clickSelector('[data-planner-action=open]');await wait("!!document.querySelector('[data-planner-field=operation]')");
 await field('[data-planner-field=operation]','merge_knowledge');await field('[data-planner-field=merge-canonical]','1');
 await clickSelector('[data-planner-field^=merge-transfer-]:not(:disabled)');await field('[data-planner-field=merge-location]','0');await clickSelector('[data-planner-field=merge-confirm]');await clickSelector('[data-merge-action=build]');
 await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='ready'");
 const merge=await ev('[...engine.pairReviews].at(-1).planner.view.mergePlan');assert(merge);
 await clickSelector('[data-merge-apply-action=review]');await wait("!!document.querySelector('.ai-merge-apply [data-merge-apply-action=confirm]')");assert.deepEqual(snapshot(),before);await shot('merge-review');
 await clickSelector('.ai-merge-apply [data-merge-apply-action=confirm]');await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-merge-apply [data-merge-apply-action=history]')");
 assert.equal(fs.readFileSync(vault+'/'+merge.canonical.path,'utf8'),merge.canonical.after);assert.equal(fs.readFileSync(vault+'/'+merge.secondary.path,'utf8'),merge.secondary.content);
 const parentId=await ev('(async()=>(await plugin.safeApply.merge.journal.entries()).find(e=>e.record)?.id)()');assert(parentId);
 await clickSelector('.ai-merge-apply [data-merge-apply-action=history]');await wait(`!!document.querySelector('[data-operation-id="${parentId}"] [data-archive-action=open]')`);
 await clickSelector(`[data-operation-id="${parentId}"] [data-archive-action=open]`);await wait("document.querySelector('[data-archive-stage]')?.dataset.archiveStage==='choosing'");
 const fragments=await ev("document.querySelectorAll('[data-archive-fragment]').length");assert(fragments>0);
 // Incomplete preservation accounting is intentionally not accepted.
 await field('[data-archive-status]','archived');await clickSelector('[data-archive-ack]');
 await pass('Incomplete Archive preservation cannot be built',"document.querySelector('[data-archive-action=build]').disabled");
 for(let i=0;i<fragments;i++)await field(`[data-archive-fragment="${i}"]`,'retained');
 await clickSelector('[data-archive-action=build]');await wait("document.querySelector('[data-archive-stage]')?.dataset.archiveStage==='ready'");
 const archive=await ev("JSON.parse(document.querySelector('[data-archive-text=json]').textContent)");const beforeArchive=snapshot();
 await clickSelector('[data-archive-action=applyReview]');await wait("!!document.querySelector('.ai-archive-apply [data-archive-apply-action=confirm]')");assert.deepEqual(snapshot(),beforeArchive);await shot('archive-review');
 await clickSelector('.ai-archive-apply [data-archive-apply-action=confirm]');await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-archive-apply [data-archive-apply-action=history]')");
 assert.equal(fs.readFileSync(vault+'/'+merge.secondary.path,'utf8'),archive.secondary.after);
 const archiveId=await ev('(async()=>(await plugin.safeApply.archive.journal.entries()).find(e=>e.record)?.id)()');assert(archiveId);
 await clickSelector('.ai-archive-apply [data-archive-apply-action=history]');await wait(`!!document.querySelector('[data-operation-id="${archiveId}"]')`);
 await pass('Active Archive blocks Parent Undo',`!document.querySelector('[data-operation-id="${parentId}"] [data-merge-apply-action=undoReview]')`);
 await clickSelector(`[data-operation-id="${archiveId}"] [data-archive-apply-action=undoReview]`);await wait("!!document.querySelector('.ai-archive-apply [data-archive-apply-action=confirm]')");await clickSelector('.ai-archive-apply [data-archive-apply-action=confirm]');await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-archive-apply [data-archive-apply-action=history]')");
 assert.equal(fs.readFileSync(vault+'/'+merge.secondary.path,'utf8'),merge.secondary.content);
 await clickSelector('.ai-archive-apply [data-archive-apply-action=history]');await wait(`!!document.querySelector('[data-operation-id="${parentId}"] [data-merge-apply-action=undoReview]')`);
 await clickSelector(`[data-operation-id="${parentId}"] [data-merge-apply-action=undoReview]`);await wait("!!document.querySelector('.ai-merge-apply [data-merge-apply-action=confirm]')");await clickSelector('.ai-merge-apply [data-merge-apply-action=confirm]');await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-merge-apply [data-merge-apply-action=history]')");assert.deepEqual(snapshot(),before);
 checks.push('Merge → separate Archive → Archive Undo → Parent Undo restores all 1000 original files');await shot('parent-undo-result');await closeModals();await click('workbench-back');

 await click('workbench-refresh');await wait('!hv.workbench.data.busy');
 // Metadata fault injection does not change any saved source.
 await ev(`window.realFileCache=app.metadataCache.getFileCache.bind(app.metadataCache);app.metadataCache.getFileCache=file=>file.path===${JSON.stringify(pairPaths[0])}?null:realFileCache(file);void 0`);
 await click('workbench-refresh');await wait('!hv.workbench.data.busy');
 await pass('Missing endpoint metadata never states absent link',"hv.contentEl.querySelector('[data-workbench-selection]').textContent.includes('неизвестн')");await shot('missing-metadata');
 await ev('app.metadataCache.getFileCache=realFileCache;void 0');await click('workbench-refresh');await wait('!hv.workbench.data.busy');
 await pass('One graph contains actual and semantic edges',"!!hv.contentEl.querySelector('[data-kind=link]')&&!!hv.contentEl.querySelector('[data-kind=semantic]')");
 await clickSelector('.veynrel-workbench-node.is-selected');
 await pass('Canvas selection and candidate row show the same canonical pair',`JSON.stringify(hv.workbench.selected.paths)===JSON.stringify(${JSON.stringify(pairPaths)})&&!!hv.contentEl.querySelector('[data-workbench-pair][aria-pressed=true]')`);
 const nodes=await ev("[...hv.contentEl.querySelectorAll('.veynrel-workbench-node')].map(e=>[e.dataset.path,e.getAttribute('cx'),e.getAttribute('cy')])");
 for(const layer of ['links','semantic']){await click('workbench-layer-'+layer);assert.deepEqual(await ev("[...hv.contentEl.querySelectorAll('.veynrel-workbench-node')].map(e=>[e.dataset.path,e.getAttribute('cx'),e.getAttribute('cy')])"),nodes);await click('workbench-layer-'+layer)}
 await shot('workbench-final-both-layers');

 const staleIO=await ev('({...io})');
 await ev('engine.notifySettingsChanged({reconcile:false});void 0');await wait("hv.workbench.data.semantic.getSnapshot().state==='stale'");
 await pass('Index configuration epoch invalidates the published semantic snapshot without a request',`hv.workbench.data.duplicateState==='stale'&&io.network===${staleIO.network}&&io.writes===${staleIO.writes}`);await shot('stale-index');
 await click('workbench-refresh');await wait('!hv.workbench.data.busy');
 // Appearance matrix observes full native frames, including the bottom of the pane.
 for(const language of ['ru','en']){
  await locale(language);
  await pass(language+': shell and workbench share the locale',language==='en'?"hv.contentEl.querySelector('[data-health-action=scope-picker]').textContent.includes('Whole vault')":"hv.contentEl.querySelector('[data-health-action=scope-picker]').textContent.includes('Всё хранилище')");
  for(const theme of ['dark','light']){
   await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('theme-${theme}');void 0`);
   for(const width of [1694,1484,434]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:1080,deviceScaleFactor:1,mobile:false});await settle();
    await ev('hv.contentEl.scrollTop=0;void 0');await pass(`${language}/${theme}/${width-44}: no horizontal pane overflow`,'hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1');await shot(`map-${language}-${theme}-${width-44}`);
   }
  }
 }
 await cdp('Emulation.setDeviceMetricsOverride',{width:1484,height:1080,deviceScaleFactor:1,mobile:false});
 await ev("require('electron').webFrame.setZoomFactor(2);void 0");await settle();
 await pass('200% native zoom preserves list/action layout','hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1');await shot('map-zoom-200');await ev("require('electron').webFrame.setZoomFactor(1);void 0");
 await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await shot('map-reduced-motion');
 const beforeKey=await ev('hv.workbench.showMap');await ev("hv.contentEl.querySelector('[data-health-action=workbench-map-toggle]').focus();void 0");
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});
 await pass('Keyboard activates list-only without losing the exact pair',`hv.workbench.showMap!==${beforeKey}&&JSON.stringify(hv.workbench.selected.paths)===JSON.stringify(${JSON.stringify(pairPaths)})`);await shot('map-keyboard-list');await click('workbench-map-toggle');

 await ev("window.secondLeaf=app.workspace.getLeaf('split','vertical');secondLeaf.setViewState({type:'veynrel-health',active:true});void 0");await wait("!!secondLeaf.view.contentEl.querySelector('[data-health-action=scope-all]')");
 await ev('app.workspace.revealLeaf(hv.leaf)');await settle();
 await pass('Real narrow split uses pane width without overflow',"hv.contentEl.clientWidth<760&&hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1&&getComputedStyle(hv.contentEl.querySelector('.veynrel-menu-toggle')).display!=='none'");await shot('map-native-split');
 await ev('secondLeaf.detach();void 0');await settle();
 await field('[data-health-action=scope-picker]','Workbench');
 await ev("window.pop=app.workspace.openPopoutLeaf();pop.setViewState({type:'veynrel-health',active:true});void 0");await wait("!!pop.view.contentEl.querySelector('[data-health-action=scope-all]')");
 // Programmatic leaf creation is test setup; clicks below use the popout's native input target.
 let target;for(let i=0;i<30;i++){target=(await(await fetch('http://127.0.0.1:9392/json/list')).json()).find(p=>p.type==='page'&&p.id!==page.id);if(target)break;await pause(100)}assert(target);
 const attached=await cdp('Target.attachToTarget',{targetId:target.id,flatten:true});
 const popCdp=(method,params={})=>new Promise((resolve,reject)=>{const id=nextId();pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,sessionId:attached.sessionId,method,params}))});
 const r=await ev("(()=>{const e=pop.view.contentEl.querySelector('[data-health-action=nav-discover]');e.scrollIntoView();return e.getBoundingClientRect().toJSON()})()");
 for(const type of ['mousePressed','mouseReleased'])await popCdp('Input.dispatchMouseEvent',{type,x:r.x+r.width/2,y:r.y+r.height/2,button:'left',clickCount:1});
 await wait('!!pop.view.workbench');await pass('Popout uses its own document and independent scope',"pop.view.contentEl.ownerDocument!==document&&pop.view.workbench.data.scope.id==='all'&&hv.workbench.data.scope.id==='folder:Workbench'");
 const popshot=await popCdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(root+'/map-native-popout.png',Buffer.from(popshot.data,'base64'));
 await ev('window.oldPop=pop.view;pop.detach();void 0');await wait('!oldPop.areaIndex');await cdp('Page.bringToFront');
 // Rename/delete invalidate the actual folder selection; fixture cleanup is separate from Undo evidence.
 await ev("app.vault.createFolder('__workbench_scope/child').then(()=>{})");await wait("hv.areaIndex.snapshot.folders.some(f=>f.path==='__workbench_scope/child')");
 await field('[data-health-action=scope-picker]','__workbench_scope/child');await ev("app.vault.rename(app.vault.getAbstractFileByPath('__workbench_scope'),'__workbench_renamed')");await wait('hv.areaIndex.selection.missing===true');
 await pass('Rename preserves an explicitly missing folder, never All',"hv.workbench.data.scope.paths.length===0&&hv.areaIndex.selection.kind==='folder'");
 await field('[data-health-action=scope-picker]','__workbench_renamed/child');await ev("app.vault.delete(app.vault.getAbstractFileByPath('__workbench_renamed'),true)");await wait('hv.areaIndex.selection.missing===true');
 await pass('Delete invalidates scoped workbench data',"hv.workbench.data.scope.paths.length===0&&hv.areaIndex.selection.kind==='folder'");
 await ev('window.oldWorkbench=hv.workbench;hv.leaf.detach();void 0');await wait('oldWorkbench.disposed');
 await pass('Closing ItemView disposes its workbench and consent owners','oldWorkbench.disposed&&engine.pairReviews.size===0');
 metrics.finalSourcePaths=Object.keys(snapshot()).length;assert.deepEqual(snapshot(),before);
}
