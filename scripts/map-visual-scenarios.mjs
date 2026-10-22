import fs from 'node:fs';
import assert from 'node:assert/strict';
import {exerciseReference} from './map-visual-reference.mjs';
import {exerciseExecutor} from './map-visual-executor.mjs';
import {exerciseEdges} from './map-visual-edges.mjs';
export async function exerciseNavigation(h) {
 const {ev,cdp,click,clickSelector,field,wait,pass,shot,pause,settle,locale,root,checks,metrics,pairPaths,startVideo,stopVideo,mode}=h;
 const tags=['topic/sql','role/theory','difficulty/advanced'];
 const rect=()=>ev("hv.contentEl.querySelector('.veynrel-workbench-map svg').getBoundingClientRect().toJSON()");
 const points=()=>ev('hv.workbench.simulation.points.map(p=>[p.path,p.x,p.y])');
 const context=()=>ev('({scope:hv.workbench.data.scope.id,query:hv.workbench.query,zones:hv.workbench.zones,selected:hv.workbench.selected?.paths,note:hv.workbench.note,focus:hv.workbench.graph.focus,overview:hv.workbench.graph.overview,viewport:hv.workbench.graph.viewport,expanded:hv.workbench.expanded,group:hv.workbench.groupPaths})');
 const chooseZones=async chosen=>{await click('workbench-zones');await field('[data-health-action=workbench-tag-search]','','input');for(const tag of await ev('hv.workbench.zones.active'))await click('zone-toggle-'+encodeURIComponent(tag));for(const tag of chosen)await click('zone-toggle-'+encodeURIComponent(tag));await click('workbench-zones-close');};
 const mouse=async(type,x,y,extra={})=>{await cdp('Input.dispatchMouseEvent',{type,x,y,...extra});};
 const wheel=async(deltaY,target=cdp)=>{const r=await rect(),x=Math.round(r.x+r.width*.46),y=Math.round(r.y+r.height*.51);await target('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await target('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:0,deltaY});await settle();return {x,y};};
 const wheelCheck=async(label,target=cdp)=>{
  const r=await rect(),x=Math.round(r.x+r.width*.46),y=Math.round(r.y+r.height*.51);
  await ev("(()=>{const s=hv.contentEl.querySelector('svg[data-camera]'),w=s.ownerDocument.defaultView;window.nativeWheelLatency??=[];s.addEventListener('wheel',()=>{const start=w.performance.now();w.requestAnimationFrame(()=>w.requestAnimationFrame(()=>nativeWheelLatency.push(w.performance.now()-start)))},{once:true,capture:true})})()");
  const world=()=>ev(`(()=>{const s=hv.contentEl.querySelector('svg[data-camera]'),p=s.createSVGPoint();p.x=${x};p.y=${y};const q=p.matrixTransform(s.querySelector('[data-map-world]').getScreenCTM().inverse());return {x:q.x,y:q.y}})()`);
  const a=await world();await wheel(-60,target);const b=await world();assert(Math.hypot(a.x-b.x,a.y-b.y)<.05,label+' '+JSON.stringify({a,b,x,y}));await wheel(60,target);const c=await world();assert(Math.hypot(a.x-c.x,a.y-c.y)<.05,label+' reversal');checks.push(label);
 };
 const checkLabels=async name=>{
  const result=await ev(`(()=>{const scene=hv.contentEl.querySelector('.veynrel-visual-map'),r=scene.getBoundingClientRect(),labels=[...scene.querySelectorAll('.veynrel-workbench-label')].filter(e=>getComputedStyle(e).visibility==='visible').map(e=>({path:e.dataset.labelPath,box:e.getBoundingClientRect().toJSON(),font:getComputedStyle(e).fontSize}));const overlaps=[];for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i].box,b=labels[j].box;if(a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y)overlaps.push([i,j]);}return {zoom:hv.workbench.graph.viewport.zoom,labels,overlaps,inside:labels.every(l=>l.box.left>=r.left&&l.box.right<=r.right&&l.box.top>=r.top&&l.box.bottom<=r.bottom)}})()`);
  assert.equal(result.overlaps.length,0,name+' no label overlap');assert(result.inside,name+' labels inside');metrics[name]=result;return result;
 };
 const themeFrames=async()=>{
  for(const color of ['light','dark']){await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('theme-${color}');void 0`);await settle();await pass(`Native ${color} theme class is active`,`document.body.classList.contains('theme-${color}')`);
   await click('workbench-fit');await shot('overview-'+color);await wheel(-80);await wheel(-80);await checkLabels('theme-medium-'+color);await shot('medium-'+color);await wheel(-80);await wheel(-80);await checkLabels('theme-close-'+color);await shot('close-'+color);await click('workbench-fit');await ev(`hv.workbench.selectNote(${JSON.stringify(pairPaths[0])});void 0`);await settle();const names=await checkLabels('theme-membership-'+color);assert(names.labels.some(l=>l.path===pairPaths[0]),'Selected graph name is visible');await shot('membership-'+color);await click('workbench-clear-selection');
  }
 };
 if(process.env.V3_EDGES_ONLY){await exerciseEdges(h,{rect,points,context,wheelCheck,chooseZones,tags,checkLabels});return;}
 await pass('All canonical documents represented; aggregation counts unique files',`hv.workbench.items.reduce((n,p)=>n+(p.members?.length??1),0)===${mode}&&hv.workbench.items.length<=500`);
 await wait('hv.workbench.simulation.alpha===0');await click('workbench-fit');await settle();
 metrics.simulation=await ev('({ticks:hv.workbench.simulation.ticks,milliseconds:hv.workbench.simulation.milliseconds,revisions:hv.workbench.simulation.revisions,render:hv.workbench.graph.metrics})');
 metrics.performanceAfterSettle=await cdp('Performance.getMetrics');await shot('overview-dark');
 if(mode==='1000'||mode==='501'){
  await pass('Semantic cap is intact; no physics loop for aggregated 1000-note inventory',"hv.workbench.data.semantic.getSnapshot().reason==='too-large'&&hv.workbench.simulation.ticks===0&&hv.workbench.items.every(p=>p.members)");
  await clickSelector('[data-group]');await shot('group-disclosed');await pass('A group is disclosure, never a Markdown or executor pair',"!hv.workbench.selected&&hv.workbench.items.every(p=>!p.members)");return;
 }
 if(process.env.V3_NO_INDEX){await pass('Missing index is explicit and there are no semantic forces/edges',"hv.workbench.data.semantic.getSnapshot().state!=='ready'&&!hv.contentEl.querySelector('[data-kind=semantic]')");await shot('no-index');return;}
 await pass('Ready artificial semantic data is present',`hv.workbench.data.semantic.getSnapshot().state==='ready'&&hv.workbench.data.semantic.getSnapshot().map.nodes.length===${mode}`);
 const stable=await points(),ticks=await ev('hv.workbench.simulation.ticks');await pause(700);assert.deepEqual(await points(),stable);assert.equal(await ev('hv.workbench.simulation.ticks'),ticks);checks.push('Settled graph has no idle drift or continued ticks');
 await chooseZones(tags);const colors=await ev('({...hv.workbench.graph.hues})');
 if(mode==='154'){
  const before=await ev('hv.workbench.graph.viewport');await ev("hv.contentEl.querySelector('svg[data-camera]').focus();void 0");
  for(const key of ['ArrowRight','+']){await cdp('Input.dispatchKeyEvent',{type:'keyDown',key});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key});}await settle();
  const after=await ev('hv.workbench.graph.viewport');assert(after.x!==before.x&&after.zoom>before.zoom);checks.push('Native keyboard pans and zooms focused map');
  const chip=await ev("hv.contentEl.querySelector('[data-zone-title=\"topic/sql\"]').getBoundingClientRect().toJSON()");await mouse('mouseMoved',chip.x+chip.width/2,chip.y+chip.height/2);await settle();
  await pass('Native tag hover highlights exactly 95 metadata members',"hv.contentEl.querySelectorAll('[data-path].is-zone-member').length===95&&[...hv.contentEl.querySelectorAll('[data-path]')].every(n=>n.classList.contains('is-zone-member')===hv.workbench.data.dependencies.tags.getSnapshot().notes.find(m=>m.path===n.dataset.path).tags.includes('topic/sql'))");await shot('tag-hover-exact-members',true);
  await click('workbench-fit');
  if(process.env.V3_VISUAL_THEMES_ONLY){await themeFrames();return;}
 }
 if(mode==='154')await startVideo();
 await click('workbench-expand');await click('workbench-fit');await shot('expanded-overview');
 const target=await ev(`(()=>{const e=hv.contentEl.querySelector('[data-path=${JSON.stringify(pairPaths[0])}]');return e.getBoundingClientRect().toJSON()})()`);
 const nx=target.x+target.width/2,ny=target.y+target.height/2;
 await mouse('mouseMoved',nx,ny);await pause(450);await shot('native-hover',true);
 assert.deepEqual(await points(),stable);assert.equal(await ev('hv.workbench.simulation.ticks'),ticks);checks.push('Native hover does not reheat physics');
 await mouse('mousePressed',nx,ny,{button:'left',clickCount:1});await mouse('mouseMoved',nx+45,ny+25,{button:'left',buttons:1});await pause(120);await shot('node-drag',true);
 const dragged=await ev(`hv.workbench.simulation.points.find(p=>p.path===${JSON.stringify(pairPaths[0])})`);assert(dragged.fixed,'Native node drag fixes node under pointer');
 await mouse('mouseReleased',nx+45,ny+25,{button:'left',clickCount:1});await wait('hv.workbench.simulation.alpha===0');await pass('Node drag does not select/open a note; capture released','!hv.workbench.note&&!hv.workbench.simulation.points.some(p=>p.fixed)');
 await wheelCheck('Native wheel cursor anchor and immediate reversal');
 const r=await rect();await mouse('mousePressed',r.x+25,r.y+r.height*.6,{button:'left',clickCount:1});await mouse('mouseMoved',r.x+65,r.y+r.height*.6-20,{button:'left',buttons:1});await mouse('mouseReleased',r.x+65,r.y+r.height*.6-20,{button:'left',clickCount:1});await settle();
 await click('workbench-fit');
 const zoomSamples=[];for(let i=0;i<7;i++){await wheel(-80);zoomSamples.push(await checkLabels('labels-'+i));if([0,3,6].includes(i))await shot(['near-overview','medium-zoom','close-zoom'][[0,3,6].indexOf(i)]);}
 assert(new Set(zoomSamples.flatMap(s=>s.labels.map(l=>l.font))).size<=1,'Text size does not scale with graph zoom');checks.push('Seven intermediate native zooms: label boxes do not overlap or scale');
 for(let i=0;i<7;i++)await wheel(80);await click('workbench-fit');
 const beforeSelection=await points(),camera=await ev('({...hv.workbench.graph.viewport})'),tickSelection=await ev('hv.workbench.simulation.ticks');
 await ev(`hv.contentEl.querySelector('[data-path=${JSON.stringify(pairPaths[0])}]').focus();void 0`);await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});await settle();
 assert.deepEqual(await points(),beforeSelection);assert.deepEqual(await ev('hv.workbench.graph.viewport'),camera);assert.equal(await ev('hv.workbench.simulation.ticks'),tickSelection);
 await pass('Selected note has three exact membership segments and chips; no arbitrary pair',`hv.workbench.note===${JSON.stringify(pairPaths[0])}&&!hv.workbench.selected&&hv.contentEl.querySelectorAll('.veynrel-zone-keys .is-active').length===3&&[...hv.contentEl.querySelectorAll('[data-member-path=${JSON.stringify(pairPaths[0])}]')].filter(e=>e.getAttribute('opacity')==='1').length===3`);
 await checkLabels('selected-labels');await shot('three-memberships-dark');
 if(mode==='500'){await wheelCheck('500-node native zoom');metrics.after=await ev('({simulation:hv.workbench.simulation.milliseconds,render:hv.workbench.graph.metrics})');return;}
 await clickSelector('[data-health-action^=workbench-related-]');const beforeReview=await context();await click('workbench-compare');await wait("document.querySelectorAll('.ai-pair-note').length===2");await shot('candidate-compare');await click('workbench-back');assert.deepEqual(await context(),beforeReview);checks.push('Candidate Compare returns exact context and disposes consent owner');
 await click('workbench-clear-selection');await click('workbench-expand');await stopVideo();
 await themeFrames();
 assert.deepEqual(await ev('hv.workbench.graph.hues'),colors);checks.push('Canonical tag colors survive selection and theme changes');
 await exerciseExecutor(h,chooseZones,tags);
 await exerciseReference(h);
 await exerciseEdges(h,{rect,points,context,wheelCheck,chooseZones,tags,checkLabels});
}
