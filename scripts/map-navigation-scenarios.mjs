import fs from 'node:fs';
import assert from 'node:assert/strict';
export async function exerciseNavigation(h){
 const {ev,cdp,click,clickSelector,field,wait,pass,shot,closeModals,pause,settle,locale,root,vault,before,markdown,pairPaths,fixture,checks,metrics,page,socket,pending,nextId,startVideo,stopVideo,mode}=h;
 const positions=()=>ev("hv.workbench.items.map(p=>[p.path,p.x,p.y])");
 const context=()=>ev('({scope:hv.workbench.data.scope,query:hv.workbench.query,zones:hv.workbench.zones,selected:hv.workbench.selected?.paths,note:hv.workbench.note,graph:hv.workbench.graph,expanded:hv.workbench.expanded,group:hv.workbench.groupPaths})');
 const rect=()=>ev("hv.contentEl.querySelector('.veynrel-workbench-map svg').getBoundingClientRect().toJSON()");
 const wheelAt=async(x,y,delta=-100,target=cdp)=>{
  await target('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await target('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:0,deltaY:delta});await settle();
 };
 const wheelCheck=async(label,target=cdp)=>{
  const r=await rect(),x=Math.round(r.x+r.width*.37),y=Math.round(r.y+r.height*.43);
  const world=()=>ev(`(()=>{const s=hv.contentEl.querySelector('svg[data-camera]'),p=s.createSVGPoint();p.x=${x};p.y=${y};const q=p.matrixTransform(s.querySelector('[data-map-world]').getScreenCTM().inverse());return {x:q.x,y:q.y}})()`);
  const before=await world(),old=await ev('hv.workbench.graph.viewport.zoom');await wheelAt(x,y,-90,target);await wait(`hv.workbench.graph.viewport.zoom>${old}`);await settle();const after=await world();metrics[label]={before,after};
  assert(Math.abs(before.x-after.x)<.01&&Math.abs(before.y-after.y)<.01,label+' cursor anchor '+JSON.stringify({before,after}));assert((await ev('hv.workbench.graph.viewport.zoom'))>old,label+' zoom');checks.push(label);
 };
 const chooseZones=async tags=>{
  await click('workbench-zones');for(const tag of await ev('hv.workbench.zones.active'))await click('zone-toggle-'+encodeURIComponent(tag));
  for(const tag of tags)await click('zone-toggle-'+encodeURIComponent(tag));await click('workbench-zones-close');
 };
 await pass('All unique documents accounted for; full 154/500 or bounded groups',`hv.workbench.items.reduce((n,p)=>n+(p.members?.length??1),0)===${mode}&&hv.workbench.items.length<=500`);
 metrics.layout=await ev('({count:hv.workbench.layoutCount,milliseconds:hv.workbench.layoutMilliseconds,nodes:hv.workbench.items.length})');
 await pass('Canvas fits available native pane without a bottom strip',"(()=>{const r=hv.contentEl.getBoundingClientRect(),m=hv.contentEl.querySelector('.veynrel-workbench-map').getBoundingClientRect();return m.bottom<=r.bottom&&m.height>r.height*.45&&hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1})()");
 await shot('initial-overview');
 if(mode==='1000'||mode==='501'){
  await pass(`${mode} eligible files keep semantic cap; aggregate IDs are not Markdown paths`,"hv.workbench.data.semantic.getSnapshot().reason==='too-large'&&hv.workbench.items.every(p=>p.members&&p.path.startsWith('group:'))");
  await clickSelector('[data-group]');await pass('Explicit group disclosure yields real canonical files only',"hv.workbench.items.length<=100&&hv.workbench.items.every(p=>!p.members&&p.path.endsWith('.md'))&&!hv.workbench.selected");await shot('group-disclosed');
  await click('workbench-groups-back');await click('workbench-map-toggle');await click('workbench-mode-notes');await pass(`Complete ${mode}-path list remains reachable`,`hv.workbench.data.scope.paths.length===${mode}&&!!hv.contentEl.querySelector('[data-health-action=workbench-more]')`);
  await field('[data-health-action=scope-picker]','Workbench');await click('workbench-refresh');await wait('!hv.workbench.data.busy');
  await pass('Real smaller folder recomputes scoped semantics before the same 500 cap',"hv.workbench.data.semantic.getSnapshot().state==='ready'&&hv.workbench.data.semantic.getSnapshot().map.nodes.length===2");await shot('scoped-below-cap');return;
 }
 await pass('Ready synthetic semantic layer is actually loaded',`hv.workbench.data.semantic.getSnapshot().state==='ready'&&hv.workbench.data.semantic.getSnapshot().map.nodes.length===${mode}`);
 const geometry=await positions(),layoutCount=await ev('hv.workbench.layoutCount');
 const tags=['topic/sql','role/theory','difficulty/advanced'];await chooseZones(tags);
 if(mode==='154')await startVideo();
 await click('workbench-expand');await pass('Expand removes only own chrome and increases canvas area',"hv.workbench.expanded&&getComputedStyle(hv.contentEl.querySelector('.veynrel-sidebar')).display==='none'&&!!document.querySelector('.workspace-tab-header')");
 await shot('expanded-three-facets');await wheelCheck('Cursor wheel anchor in expanded native pane');
 const r=await rect(),x=r.x+35,y=r.y+r.height*.7;
 await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
 await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+70,y:y-30,button:'left',buttons:1});
 await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+70,y:y-30,button:'left',clickCount:1});await settle();
 const pan=await ev('({...hv.workbench.graph.viewport})');
 // Keyboard activation after drag must bypass suppression of the synthetic pointer click.
 await ev(`hv.contentEl.querySelector('[data-path=${JSON.stringify(pairPaths[0])}]').focus();void 0`);
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});await settle();
 await pass('Note selection after pan preserves geometry/camera and does not select an arbitrary pair',`hv.workbench.note===${JSON.stringify(pairPaths[0])}&&!hv.workbench.selected`);
 assert.deepEqual(await positions(),geometry);assert.deepEqual(await ev('hv.workbench.graph.viewport'),pan);
 await pass('Selected note visibly belongs to three independent active zones',"hv.contentEl.querySelectorAll('.veynrel-tag-zone.is-active').length===3&&hv.contentEl.querySelectorAll('[data-membership]').length===3");
 await shot('three-memberships-selected');
 const responseStart=performance.now();for(let i=0;i<5;i++){await click('workbench-layer-semantic');await click('workbench-layer-semantic');}
 metrics.layersTenMs=performance.now()-responseStart;assert.deepEqual(await positions(),geometry);assert.equal(await ev('hv.workbench.layoutCount'),layoutCount);
 metrics.selectionRenderMs=await ev(`(()=>{const s=performance.now();hv.workbench.selectNote(${JSON.stringify(pairPaths[0])});return performance.now()-s})()`);
 if(mode==='500'){await shot('five-hundred-selected');await wheelCheck('500-note wheel response');return;}
 await click('workbench-detail-close');
 // Click a real zone fill hit target through native mouse input (not Element.click).
 const zoneHit=await ev(`(()=>{const s=hv.contentEl.querySelector('svg[data-camera]'),g=s.querySelector('[data-map-world]');for(const p of hv.workbench.items){for(const d of [15,25,35]){const q=s.createSVGPoint();q.x=p.x+d;q.y=p.y+d;const a=q.matrixTransform(g.getScreenCTM());const e=document.elementFromPoint(a.x,a.y);if(e?.closest('[data-zone]'))return {x:a.x,y:a.y,tag:e.closest('[data-zone]').dataset.zone}}}return null})()`);assert(zoneHit);
 for(const type of ['mousePressed','mouseReleased'])await cdp('Input.dispatchMouseEvent',{type,x:zoneHit.x,y:zoneHit.y,button:'left',clickCount:1});await settle();
 assert.equal(await ev('hv.workbench.zones.selected'),zoneHit.tag);checks.push('Native stationary zone click selects exact membership');
 await click('workbench-filter-zone');await pass('Zone highlight and explicit filter are separate actions','hv.workbench.zones.filter.length===1');await shot('explicit-zone-filter');
 await click('workbench-clear-filter');await click('workbench-clear-zone');await click('workbench-selection-toggle');
 const overview=await ev('hv.workbench.graph.viewport');await click('workbench-focus');await pass('Neighborhood requires explicit action; return is always visible',"!!hv.workbench.graph.focus&&!!hv.contentEl.querySelector('[data-health-action=workbench-overview]')");
 await click('workbench-fit');await pass('Fit changes camera only','!!hv.workbench.graph.focus');await shot('focused-neighborhood');await click('workbench-overview');assert.deepEqual(await ev('hv.workbench.graph.viewport'),overview);
 await clickSelector('[data-health-action^=workbench-related-]');await pass('Candidate pair is selected explicitly and has two distinct canonical paths',`JSON.stringify(hv.workbench.selected.paths)===JSON.stringify(${JSON.stringify(pairPaths)})`);
 const savedContext=await context();await click('workbench-compare');await wait("document.querySelectorAll('.ai-pair-note').length===2");await shot('compare-native');await click('workbench-back');assert.deepEqual(await context(),savedContext);
 await pass('Return restores all visual context without retaining a review owner','engine.pairReviews.size===0');await click('workbench-expand');await shot('same-context-collapsed');await stopVideo();
 // Dense membership: show all available facets in details, with bounded visible layer count.
 await click('workbench-clear-selection');await click('workbench-map-toggle');await click('workbench-mode-notes');
 const dense=await ev("hv.workbench.data.dependencies.tags.getSnapshot().notes.find(n=>n.tags.some(t=>t==='facet11/example')).path");
 await field('[data-health-action=workbench-search]',dense,'input');await clickSelector('[data-workbench-path]');await click('workbench-clear-filter');
 await pass('Dense 12+ tags retain every membership and disclose hidden categories',"hv.contentEl.querySelectorAll('.veynrel-memberships button').length>=12&&hv.workbench.zones.active.length<=8&&!!hv.contentEl.querySelector('[data-health-action^=workbench-hidden-]')");await shot('dense-membership');
 await click('workbench-zones');await field('[data-health-action=workbench-tag-search]','role','input');
 await clickSelector('[data-filter-tag="role/theory"]');await pass('Filter checkbox keeps keyboard focus after render',"document.activeElement?.dataset.filterTag==='role/theory'");await clickSelector('[data-filter-tag="role/practice"]');
 await field('[data-health-action=workbench-filter-mode]','all');const all=await ev("hv.contentEl.querySelectorAll('.veynrel-workbench-node').length");
 await field('[data-health-action=workbench-filter-mode]','any');const any=await ev("hv.contentEl.querySelectorAll('.veynrel-workbench-node').length");assert(any>all);checks.push('Explicit AND/OR produce distinct inclusion sets');await shot('facets-and-or');
 await click('workbench-clear-tag-filter');await click('workbench-zones-close');
 // Actual executor route on a separate synthetic pair. Hashes are never restored by copying fixtures.
 await click('workbench-map-toggle');await click('workbench-mode-repeats');await field('[data-health-action=workbench-search]','Workbench','input');await clickSelector('[data-workbench-pair]');
 await ev(`window.control={calls:0,response:${JSON.stringify(fixture.response)}};window.realRelationshipFactory=engine.relationshipSession;engine.relationshipSession=paths=>{const s=realRelationshipFactory(paths);s.deps.complete=async()=>{control.calls++;return JSON.stringify(control.response)};return s};Object.assign(plugin.settings,{provider:'custom',model:'offline-control-NOT-live',apiKey:'synthetic-only',baseUrl:'https://example.invalid/v1'});void 0`);
 await click('workbench-compare');await wait("document.querySelectorAll('.ai-pair-note').length===2");await clickSelector('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");
 await pass('Model consent is separate and truthful about the offline test destination','control.calls===0&&document.querySelector(".ai-relationship").textContent.includes("offline-control-NOT-live")');
 await clickSelector('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-planner-action=open]')");await shot('validated-comparison');await clickSelector('[data-planner-action=open]');
 await field('[data-planner-field=operation]','add_link');await field('[data-planner-field=range]','0');await clickSelector('[data-planner-field=confirm]');await clickSelector('[data-planner-action=build]');await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='ready'");
 await ev('window.plan=[...engine.pairReviews].at(-1).planner.view.plan;void 0');await clickSelector('[data-safe-action=review]');await wait("!!document.querySelector('.ai-safe-apply [data-safe-action=confirm]')");assert.deepEqual(markdown(vault),before);await shot('exact-change-review');
 await clickSelector('.ai-safe-apply [data-safe-action=confirm]');await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-safe-apply [data-safe-action=history]')");assert.equal(fs.readFileSync(vault+'/'+pairPaths[0],'utf8'),await ev('plan.after'));await shot('applied');
 fs.writeFileSync(root+'/after-apply.json',JSON.stringify(markdown(vault),null,2));
 await clickSelector('.ai-safe-apply [data-safe-action=history]');await wait("!!document.querySelector('.ai-operation-history [data-safe-action=undo]')");await shot('operation-history');
 await clickSelector('.ai-operation-history [data-safe-action=undo]');await wait("!!document.querySelector('.ai-safe-apply [data-safe-action=undoConfirm]')");await shot('separate-undo-review');await clickSelector('.ai-safe-apply [data-safe-action=undoConfirm]');await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-safe-apply [data-safe-action=history]')");assert.deepEqual(markdown(vault),before);checks.push('Actual Apply → History → separate Undo restores all Markdown SHA256 hashes');await closeModals();await click('workbench-back');
 // Revoked consent and late completion do not revive old actions.
 await click('workbench-compare');await wait("document.querySelectorAll('.ai-pair-note').length===2");await clickSelector('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");
 await ev("window.oldConsent=document.querySelector('[data-relationship-action=confirm]');void 0");const calls=await ev('control.calls');await click('workbench-back');await ev('oldConsent.click();void 0');await pass('Return revokes one-use model consent',`control.calls===${calls}&&engine.pairReviews.size===0`);
 await ev(`engine.relationshipSession=paths=>{const s=realRelationshipFactory(paths);s.deps.complete=()=>new Promise(resolve=>{control.finish=()=>resolve(JSON.stringify(control.response))});return s};void 0`);
 await click('workbench-compare');await wait("document.querySelectorAll('.ai-pair-note').length===2");await clickSelector('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");await clickSelector('[data-relationship-action=confirm]');await wait("typeof control.finish==='function'");await field('[data-health-action=scope-picker]','Workbench');await ev('control.finish();void 0');await settle();await pass('Scope change discards late completion and old review owner',"engine.pairReviews.size===0&&!document.querySelector('[data-planner-action=open]')");
 await field('[data-health-action=scope-picker]','');await click('workbench-refresh');await wait('!hv.workbench.data.busy');await chooseZones(tags);
 // Metadata fault events retain chosen zone visibility; no Markdown mutation.
 const activeZones=await ev('hv.workbench.zones.active');await ev(`app.vault.trigger('modify',app.vault.getFileByPath(${JSON.stringify(pairPaths[0])}));void 0`);
 assert.deepEqual(await ev('hv.workbench.zones.active'),activeZones);await ev(`app.metadataCache.trigger('changed',app.vault.getFileByPath(${JSON.stringify(pairPaths[0])}),null,app.metadataCache.getFileCache(app.vault.getFileByPath(${JSON.stringify(pairPaths[0])})));void 0`);assert.deepEqual(await ev('hv.workbench.zones.active'),activeZones);checks.push('Transient stale metadata preserves visible-layer choices');
 await click('workbench-refresh');await wait('!hv.workbench.data.busy');
 // Pointer cancellation, local Escape, outside scrolling, rapid wheel and stale event callbacks.
 await click('workbench-expand');await click('workbench-zones');
 await ev("hv.contentEl.querySelector('[data-health-action=workbench-zones-close]').focus();void 0");
 const escape=async()=>{await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});await settle();};
 await escape();await pass('Escape closes own zone panel before expanded map','!hv.workbench.zones.open&&hv.workbench.expanded');
 await ev("hv.contentEl.querySelector('[data-health-action=workbench-search]').focus();void 0");await escape();await pass('Escape in text input does not collapse the map','hv.workbench.expanded');
 await ev("hv.contentEl.querySelector('svg[data-camera]').focus();void 0");await escape();await pass('Contextual Escape then exits expanded mode','!hv.workbench.expanded');
 const pr=await rect(),px=Math.round(pr.x+15),py=Math.round(pr.y+30);
 for(const termination of ['pointercancel','lostpointercapture']){
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:px,y:py,button:'left',clickCount:1});await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:px+30,y:py+20,buttons:1,button:'left'});
  await ev(`hv.contentEl.querySelector('svg[data-camera]').dispatchEvent(new PointerEvent('${termination}',{pointerId:1,bubbles:true}));void 0`);
  const camera=await ev('hv.workbench.graph.viewport');await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:px+70,y:py+60,buttons:1,button:'left'});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:px+70,y:py+60,button:'left',clickCount:1});assert.deepEqual(await ev('hv.workbench.graph.viewport'),camera);
 }
 checks.push('pointercancel and lost capture end pan without subsequent movement');
 const layoutBefore=await ev('hv.workbench.layoutCount');const wr=await rect(),wx=Math.round(wr.x+wr.width/2),wy=Math.round(wr.y+wr.height/2);
 const fastStart=performance.now();for(let i=0;i<12;i++)await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',x:wx,y:wy,deltaX:0,deltaY:-240});await settle();metrics.fastWheelTwelveMs=performance.now()-fastStart;
 await pass('Rapid wheel remains bounded and never reruns layout',`hv.workbench.graph.viewport.zoom<=12&&hv.workbench.layoutCount===${layoutBefore}`);
 await click('workbench-fit');await click('workbench-map-toggle');await click('workbench-mode-notes');
 const lr=await ev("hv.contentEl.querySelector('.veynrel-workbench-list').getBoundingClientRect().toJSON()"),beforeWheel=await ev('hv.workbench.graph.viewport');
 await wheelAt(Math.round(lr.x+lr.width/2),Math.round(lr.y+lr.height/2),300);assert.deepEqual(await ev('hv.workbench.graph.viewport'),beforeWheel);await pass('Wheel inside note list scrolls that list without changing map zoom',"hv.contentEl.querySelector('.veynrel-workbench-list').scrollTop>0");await click('workbench-map-toggle');
 await ev("window.detachedSvg=hv.contentEl.querySelector('svg[data-camera]');window.oldZoom=hv.contentEl.querySelector('[data-health-action=workbench-zoom-in]');void 0");await click('workbench-layer-links');const staleCamera=await ev('hv.workbench.graph.viewport');
 await ev("detachedSvg.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true}));oldZoom.click();void 0");assert.deepEqual(await ev('hv.workbench.graph.viewport'),staleCamera);await click('workbench-layer-links');checks.push('Disposed SVG and toolbar callbacks cannot change current camera');
 // Native appearance matrix; all captures contain the full pane and ready synthetic semantics.
 for(const language of ['ru','en']){await locale(language);for(const theme of ['dark','light']){
  await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('theme-${theme}');void 0`);
  for(const width of [1694,434]){await cdp('Emulation.setDeviceMetricsOverride',{width,height:1080,deviceScaleFactor:1,mobile:false});await settle();await pass(`${language}/${theme}/${width-44}: no horizontal overflow`,'hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1');await shot(`map-${language}-${theme}-${width-44}`);}
 }}
 await cdp('Emulation.setDeviceMetricsOverride',{width:1484,height:1080,deviceScaleFactor:1,mobile:false});await settle();await wheelCheck('Wheel anchor in ordinary native pane');
 await ev("require('electron').webFrame.setZoomFactor(2);void 0");await settle();await wheelCheck('Wheel anchor at native Electron 200% zoom');await pass('200% zoom keeps exit and controls reachable','hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1');await shot('zoom-200');await ev("require('electron').webFrame.setZoomFactor(1);void 0");
 await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await shot('reduced-motion');
 // Actual narrow split keeps existing map selection/camera and receives wheel in its own SVG geometry.
 const beforeSplit=await ev('hv.workbench.graph.viewport');await ev("window.secondLeaf=app.workspace.getLeaf('split','vertical');secondLeaf.setViewState({type:'veynrel-health',active:true});void 0");await wait("!!secondLeaf.view.contentEl.querySelector('[data-health-action=scope-all]')");await ev('app.workspace.revealLeaf(hv.leaf)');await settle();assert.deepEqual(await ev('hv.workbench.graph.viewport'),beforeSplit);await wheelCheck('Wheel anchor in real split pane');
 await ev(`hv.workbench.selectNote(${JSON.stringify(pairPaths[0])});void 0`);const splitOverview=await ev('hv.workbench.graph.viewport');await click('workbench-focus');
 await pass('Explicit neighborhood fits narrow split viewBox',"(()=>{const w=hv.workbench,s=w.element.querySelector('svg[data-camera]'),b=s.viewBox.baseVal,v=w.graph.viewport;return w.items.filter(p=>w.graph.focus.includes(p.path)).every(p=>p.x*v.zoom+v.x>=b.x-1&&p.x*v.zoom+v.x<=b.x+b.width+1)})()");
 await click('workbench-overview');assert.deepEqual(await ev('hv.workbench.graph.viewport'),splitOverview);await shot('native-split');await ev('secondLeaf.detach();void 0');await settle();
 // Move the existing leaf, rather than creating an unrelated window; state must survive.
 const beforePop=await context();await ev('window.nativePop=app.workspace.moveLeafToPopout(hv.leaf);void 0');await wait('hv.contentEl.ownerDocument!==document');
 let target;for(let i=0;i<30;i++){target=(await(await fetch('http://127.0.0.1:9392/json/list')).json()).find(p=>p.type==='page'&&p.id!==page.id);if(target)break;await pause(100)}assert(target);
 const attached=await cdp('Target.attachToTarget',{targetId:target.id,flatten:true});
 const popCdp=(method,params={})=>new Promise((resolve,reject)=>{const id=nextId();pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,sessionId:attached.sessionId,method,params}))});
 await popCdp('Page.bringToFront');assert.deepEqual(await context(),beforePop);await wheelCheck('Wheel anchor after moving same ItemView to real popout',popCdp);
 const popshot=await popCdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(root+'/native-popout.png',Buffer.from(popshot.data,'base64'));
 await ev('window.oldWorkbench=hv.workbench;hv.leaf.detach();void 0');await wait('oldWorkbench.disposed');await pass('Closing popout disposes metadata, graph, and review owners','oldWorkbench.disposed&&engine.pairReviews.size===0');
 metrics.finalHashes=Object.keys(markdown(vault)).length;assert.deepEqual(markdown(vault),before);
}
