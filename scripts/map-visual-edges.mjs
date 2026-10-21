import fs from 'node:fs';
import assert from 'node:assert/strict';
export async function exerciseEdges(h,u){
 const {ev,cdp,click,clickSelector,field,wait,pass,shot,pause,settle,locale,root,checks,metrics,pairPaths,page,socket,pending,nextId}=h;
 const {rect,points,context,wheelCheck,chooseZones,tags,checkLabels}=u;
 const dragField=async label=>{
  await chooseZones(['status/sample-40']);await click('workbench-fit');await settle();
  const point=await ev("hv.workbench.data.dependencies.tags.getSnapshot().notes.find(n=>n.tags.includes('status/sample-40')).path");
  const box=await ev(`hv.contentEl.querySelector('[data-path=${JSON.stringify(point)}]').getBoundingClientRect().toJSON()`),x=box.x+box.width/2,y=box.y+box.height/2;
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+36,y:y+22,buttons:1,button:'left'});await pause(100);
  await pass(label,`(()=>{const p=hv.workbench.simulation.points.find(p=>p.path===${JSON.stringify(point)}),c=hv.contentEl.querySelector('[data-zone="status/sample-40"] circle');return p.fixed&&Math.abs(+c.getAttribute('cx')-p.x)<.01&&Math.abs(+c.getAttribute('cy')-p.y)<.01})()`);
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+36,y:y+22,button:'left',clickCount:1});await chooseZones(tags);
 };
 await wait('hv.workbench.simulation.alpha===0');
 // Metadata faults exercise the real cache adapter without changing files.
 const unknown=await ev('hv.workbench.data.scope.paths.at(-1)');
 await ev(`window.originalCache=app.metadataCache.getFileCache.bind(app.metadataCache);app.metadataCache.getFileCache=file=>file.path===${JSON.stringify(unknown)}?null:originalCache(file);hv.workbench.data.dependencies.tags.refresh();void 0`);
 await pass('Unknown metadata is distinct from known untagged notes',`hv.workbench.data.dependencies.tags.getSnapshot().notes.some(n=>n.path===${JSON.stringify(unknown)}&&n.state==='unknown')&&hv.workbench.data.dependencies.tags.getSnapshot().notes.some(n=>n.state==='known'&&n.tags.length===0)`);await shot('unknown-metadata');
 await ev('app.metadataCache.getFileCache=originalCache;hv.workbench.data.dependencies.tags.refresh();void 0');
 await ev(`app.vault.trigger('modify',app.vault.getFileByPath(${JSON.stringify(pairPaths[0])}));void 0`);
 await ev("window.originalIndexState=engine.getCachedIndexState.bind(engine);engine.getCachedIndexState=()=>{const s=originalIndexState();return {...s,runtimeRevision:s.runtimeRevision+1}};for(const listener of engine.statusListeners)listener();void 0");
 await pass('Stale topology and semantic state are explicit after vault event and injected index revision',"hv.topology.getSnapshot().state==='stale'&&hv.workbench.data.semantic.getSnapshot().state==='stale'");await shot('stale-sources');await ev('engine.getCachedIndexState=originalIndexState;void 0');
 await ev(`app.metadataCache.trigger('changed',app.vault.getFileByPath(${JSON.stringify(pairPaths[0])}),null,originalCache(app.vault.getFileByPath(${JSON.stringify(pairPaths[0])})));void 0`);await click('workbench-refresh');await wait('!hv.workbench.data.busy');await wait('hv.workbench.simulation.alpha===0');
 const geometry=await points(),ticks=await ev('hv.workbench.simulation.ticks'),hues=await ev('({...hv.workbench.graph.hues})');
 await chooseZones([...tags].reverse());assert.deepEqual(await ev('hv.workbench.graph.hues'),hues);
 for(let i=0;i<5;i++){await click('workbench-layer-links');await click('workbench-layer-links');}
 assert.deepEqual(await points(),geometry);assert.equal(await ev('hv.workbench.simulation.ticks'),ticks);checks.push('Ten layer changes and tag reorder do not restart physics or recolor existing tags');
 await click('workbench-zones');await field('[data-health-action=workbench-tag-search]','role','input');await clickSelector('[data-filter-tag="role/theory"]');await clickSelector('[data-filter-tag="role/practice"]');
 await field('[data-health-action=workbench-filter-mode]','all');const all=await ev("hv.contentEl.querySelectorAll('[data-path]').length");await field('[data-health-action=workbench-filter-mode]','any');const any=await ev("hv.contentEl.querySelectorAll('[data-path]').length");assert(any>all);checks.push('Explicit AND/OR remain distinct, while color toggles do not filter');await shot('facets-and-or');await click('workbench-clear-tag-filter');await click('workbench-zones-close');
 const escape=async()=>{await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});await settle();};
 await click('workbench-expand');await clickSelector('.veynrel-map-help summary');await escape();await pass('Escape first closes local help, preserving expanded mode',"hv.workbench.expanded&&!hv.contentEl.querySelector('.veynrel-map-help').open");
 await ev("hv.contentEl.querySelector('[data-health-action=workbench-search]').focus();void 0");await escape();await pass('Text input Escape does not collapse map','hv.workbench.expanded');await ev("hv.contentEl.querySelector('svg[data-camera]').focus();void 0");await escape();await pass('Canvas Escape exits expanded mode','!hv.workbench.expanded');
 // Native ctrl-wheel is not consumed as graph zoom; application behavior is left intact.
 let r=await rect();const camera=await ev('hv.workbench.graph.viewport');await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),deltaX:0,deltaY:-60,modifiers:2});await settle();assert.deepEqual(await ev('hv.workbench.graph.viewport'),camera);checks.push('Ctrl-wheel is not consumed by map camera (native input)');
 for(const termination of ['pointercancel','lostpointercapture']){
  r=await rect();const x=Math.round(r.x+20),y=Math.round(r.y+r.height*.55);
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+30,y:y+20,buttons:1,button:'left'});
  await ev(`hv.contentEl.querySelector('svg[data-camera]').dispatchEvent(new PointerEvent('${termination}',{pointerId:1,bubbles:true}));void 0`);const old=await ev('hv.workbench.graph.viewport');
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+60,y:y+40,buttons:1,button:'left'});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+60,y:y+40,button:'left',clickCount:1});assert.deepEqual(await ev('hv.workbench.graph.viewport'),old);
 }checks.push('Native drag plus injected cancellation/lostcapture clears capture and listeners');
 await click('workbench-map-toggle');await click('workbench-mode-notes');const list=await ev("hv.contentEl.querySelector('.veynrel-workbench-list').getBoundingClientRect().toJSON()"),before=await ev('hv.workbench.graph.viewport');
 await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',x:Math.round(list.x+list.width/2),y:Math.round(list.y+list.height/2),deltaX:0,deltaY:300});await settle();assert.deepEqual(await ev('hv.workbench.graph.viewport'),before);await pass('Wheel outside canvas scrolls list','hv.contentEl.querySelector(".veynrel-workbench-list").scrollTop>0');await click('workbench-map-toggle');
 await ev("window.detachedSvg=hv.contentEl.querySelector('svg[data-camera]');window.oldZoom=hv.contentEl.querySelector('[data-health-action=workbench-zoom-in]');void 0");await click('workbench-layer-links');const stale=await ev('hv.workbench.graph.viewport');await ev("detachedSvg.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true}));oldZoom.click();void 0");assert.deepEqual(await ev('hv.workbench.graph.viewport'),stale);await click('workbench-layer-links');checks.push('Detached renderer cannot change current camera');
 // Hide the actual workspace tab while there is still simulation work.
 await ev("hv.workbench.simulation.alpha=.3;hv.workbench.render();window.hiddenLeaf=app.workspace.getLeaf('tab');hiddenLeaf.setViewState({type:'empty',active:true});void 0");await pause(200);const hiddenTicks=await ev('hv.workbench.simulation.ticks');await pause(400);assert.equal(await ev('hv.workbench.simulation.ticks'),hiddenTicks);checks.push('Hidden native tab stops simulation');
 await ev('app.workspace.revealLeaf(hv.leaf);hiddenLeaf.detach();void 0');await wait('hv.workbench.simulation.alpha===0');
 await click('workbench-motion');await pass('Explicit pause retains usable map','hv.workbench.simulation.paused');await wheelCheck('Wheel remains usable while physics is paused');await dragField('Paused native node drag moves its exact one-member field');await click('workbench-motion');
 for(const language of (process.env.V3_EDGE_LANGUAGE?[process.env.V3_EDGE_LANGUAGE]:['ru','en'])){assert(['ru','en'].includes(language));await locale(language);for(const theme of ['dark','light']){
  await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('theme-${theme}');void 0`);
  for(const width of [1694,434]){await cdp('Emulation.setDeviceMetricsOverride',{width,height:1080,deviceScaleFactor:1,mobile:false});await settle();await click('workbench-fit');await pass(`${language}/${theme}/${width-44}: no horizontal overflow`,'hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1');await checkLabels(`labels-${language}-${theme}-${width}`);await shot(`map-${language}-${theme}-${width-44}`);}
 }}
 await cdp('Emulation.setDeviceMetricsOverride',{width:1484,height:1080,deviceScaleFactor:1,mobile:false});await settle();await wheelCheck('Wheel in ordinary pane');
 await ev("require('electron').webFrame.setZoomFactor(2);void 0");await settle();await wheelCheck('Native Electron 200% wheel anchor');await shot('zoom-200');await ev("require('electron').webFrame.setZoomFactor(1);void 0");
 await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await ev('hv.workbench.simulation.alpha=.3;hv.workbench.render();void 0');await settle();await pass('Reduced motion completes finite placement without a visible simulation loop','hv.workbench.simulation.alpha===0');await shot('reduced-motion');
 await dragField('Reduced-motion native node drag moves its field without ticking');
 const beforeSplit=await ev('hv.workbench.graph.viewport');await ev("window.secondLeaf=app.workspace.getLeaf('split','vertical');secondLeaf.setViewState({type:'veynrel-health',active:true});void 0");await wait("!!secondLeaf.view.contentEl.querySelector('[data-health-action=scope-all]')");await ev('app.workspace.revealLeaf(hv.leaf)');await settle();assert.deepEqual(await ev('hv.workbench.graph.viewport'),beforeSplit);await wheelCheck('Native split wheel anchor');
 await ev(`hv.workbench.selectNote(${JSON.stringify(pairPaths[0])});void 0`);const overview=await ev('hv.workbench.graph.viewport');await click('workbench-focus');await settle();
 await pass('Focus fits tall narrow canvas using world units',"(()=>{const s=hv.contentEl.querySelector('svg[data-camera]'),r=s.getBoundingClientRect();return [...s.querySelectorAll('[data-path]')].every(e=>{const b=e.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1&&b.top>=r.top-1&&b.bottom<=r.bottom+1})})()");await click('workbench-overview');assert.deepEqual(await ev('hv.workbench.graph.viewport'),overview);await shot('native-split');await ev('secondLeaf.detach();void 0');await settle();
 const beforePop=await context();await ev('window.nativePop=app.workspace.moveLeafToPopout(hv.leaf);void 0');await wait('hv.contentEl.ownerDocument!==document');
 let target;for(let i=0;i<30;i++){target=(await(await fetch('http://127.0.0.1:9392/json/list')).json()).find(p=>p.type==='page'&&p.id!==page.id);if(target)break;await pause(100);}assert(target);
 const attached=await cdp('Target.attachToTarget',{targetId:target.id,flatten:true});const popCdp=(method,params={})=>new Promise((resolve,reject)=>{const id=nextId();pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,sessionId:attached.sessionId,method,params}));});
 await popCdp('Page.bringToFront');await settle();assert.deepEqual(await context(),beforePop);await wheelCheck('Same ItemView in native popout: cursor anchor',popCdp);
 const nativeWindow=async action=>{const result=await popCdp('Runtime.evaluate',{expression:`require('@electron/remote').getCurrentWindow().${action}();void 0`,returnByValue:true});assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));};
 await popCdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await ev('hv.workbench.simulation.alpha=.3;hv.workbench.render();void 0');
 await nativeWindow('minimize');await wait('hv.contentEl.ownerDocument.hidden');await pause(150);assert(await ev('hv.workbench.simulation.alpha>0'),'Hidden popout retains pending physics');const hiddenPopTicks=await ev('hv.workbench.simulation.ticks');await pause(350);assert.equal(await ev('hv.workbench.simulation.ticks'),hiddenPopTicks);checks.push('Minimized real popout stops simulation');
 await nativeWindow('restore');await popCdp('Page.bringToFront');await wait('!hv.contentEl.ownerDocument.hidden');await wait('hv.workbench.simulation.alpha===0');
 const popshot=await popCdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(root+'/native-popout.png',Buffer.from(popshot.data,'base64'));
 await ev('window.oldWorkbench=hv.workbench;hv.leaf.detach();void 0');await wait('oldWorkbench.disposed');const stopped=await ev('oldWorkbench.simulation.ticks');await pause(250);assert.equal(await ev('oldWorkbench.simulation.ticks'),stopped);await pass('Dispose stops renderer and review owners','oldWorkbench.disposed&&engine.pairReviews.size===0');
 metrics.finalPerformance=await cdp('Performance.getMetrics');
}
