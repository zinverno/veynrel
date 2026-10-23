// Same synthetic fixture and native input for published beta and the polish candidate.
import assert from 'node:assert/strict';
import fs from 'node:fs';

export async function polishChecks(c) {
 const {ev,wait,click,clickSelector,shot,startVideo,stopVideo,pass,openPair,locale,cdp,pause,settle,
   root,vault,before,markdown,requests,checks,metrics,screenshots,sourceCommit,after}=c;
 const ready=()=>wait('!hv.workbench.data.busy&&!hv.workbench.facts?.running&&!hv.workbench.facts?.dirty.size');
 const keyboard=async key=>{await ev(`document.querySelector('[data-health-action="${key}"]').focus();void 0`);await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await settle();};
 const measure=async name=>{
  metrics[name]=await ev(`(()=>{const q=s=>{const e=hv.contentEl.querySelector(s);return e?.getBoundingClientRect().toJSON()};return {viewport:{width:innerWidth,height:innerHeight},svg:q('svg[data-camera]'),host:q('.veynrel-workbench'),main:q('.veynrel-shell-main'),scrollWidth:hv.contentEl.scrollWidth,width:hv.contentEl.clientWidth}})()`);
  if(after&&metrics[name].svg){const r=metrics[name].svg;assert(r.height>=250&&r.width>=250,name+' usable canvas');assert(r.bottom<=metrics[name].viewport.height+1,name+' canvas not clipped');}
 };
 await startVideo('review');await shot('review-new');await openPair('Cache');await shot('review-pair');
 await clickSelector('[data-review-keep]');await wait("!!document.querySelector('[data-review-decision-saved]')");await ready();await shot('review-left');
 if(after)await keyboard('review-reviewed');else await click('review-reviewed');await shot('review-reviewed');
 await clickSelector('[data-review-restore]');await ready();
 if(after)await click('review-new');
 await shot('review-restored');await stopVideo();assert.deepEqual(markdown(vault),before);
 await startVideo('map');await click('review-map');await wait("!!document.querySelector('svg[data-camera]')");await pause(700);
 await measure('map-initial');await shot('map-initial');
 if(after){await wait('hv.workbench.map.simulation.alpha===0');await pass('Initial cooling keeps the entire small fixture in the canvas',"(()=>{const s=document.querySelector('svg[data-camera]').getBoundingClientRect();return [...document.querySelectorAll('.veynrel-workbench-node')].every(e=>{const r=e.getBoundingClientRect();return r.x>=s.x&&r.y>=s.y&&r.right<=s.right&&r.bottom<=s.bottom})})()");await shot('map-settled');}
 await click('workbench-expand');await pause(500);await measure('map-expanded');await shot('map-expanded');
 if(after){await ev("document.querySelector('svg[data-camera]').focus();void 0");await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await settle();await pass('Escape collapses the map without closing the list route',"!!document.querySelector('svg[data-camera]')&&!document.querySelector('.is-map-expanded')");await keyboard('workbench-expand');}
 await click('workbench-refresh');await wait('!hv.workbench.map.data.busy');await pause(900);await shot('map-loaded');
 await click('workbench-expand');await pause(300);await measure('map-collapsed');await shot('map-collapsed');
 if(process.env.VEYNREL_BASELINE_CSS){
  await clickSelector('.veynrel-workbench-node[data-path]');await shot('map-selection');
  await click('workbench-pin');await shot('map-pinned');
  await click('workbench-detail-close');await shot('map-pinned-closed');
  await clickSelector('.veynrel-workbench-node[data-path]');await shot('map-pinned-reopened');
  await ev("require('@electron/remote').webContents.getFocusedWebContents().setZoomFactor(2);void 0");
  await pause(300);await shot('map-pinned-200');
  await ev("require('@electron/remote').webContents.getFocusedWebContents().setZoomFactor(1);void 0");
  await click('nav-home');await shot('map-left-page');
  await pass('Leaving map clears layout ownership',"!document.querySelector('[data-workbench-mounted],[data-workbench-host],[data-review-map]')");
  await click('nav-discover');await click('review-map');await shot('map-reopened');
 }
 await click('review-back');await ready();await shot('map-return');await stopVideo();
 await startVideo('home');await click('nav-home');await wait("hv.route.page==='home'");await shot('home-initial');
 if(after){await click('home-more-folders');await shot('home-more');await pass('All 11 top-level folders remain reachable without footer overlap',"document.querySelectorAll('.veynrel-topic-node').length+document.querySelectorAll('[data-home-folder]').length===11&&document.querySelector('.veynrel-core-foot').getBoundingClientRect().bottom<=document.querySelector('.veynrel-home-folders').getBoundingClientRect().top");await clickSelector('[data-home-folder="Workbench"]');await shot('home-selected');await click('scope-all');}
 await pause(800);await stopVideo();
 await startVideo('recall');await click('nav-recall');await wait("!!document.querySelector('[data-health-action=recall-refresh]')");await shot('recall-first');
 await click('recall-refresh');await wait('!hv.recall.getSnapshot().refreshing');await shot('recall-empty');
 await ev("await app.workspace.getLeaf('split').openFile(app.vault.getFileByPath('Area 1/Learning 1.md'));void 0");
 await ev('app.workspace.setActiveLeaf(hv.leaf,{focus:true});void 0');await wait("!!document.querySelector('[data-health-action=recall-authoring-create]')");
 await click('recall-authoring-create');await shot('recall-consent');await click('recall-authoring-generate');
 await wait("hv.authoring.getSnapshot().state==='success'&&hv.authoring.getSnapshot().result?.status==='success'");
 await pass('Authoring creates two cards through loopback and existing bridge',"hv.recall.getSnapshot().summary.active===2&&hv.recall.getSnapshot().summary.due===2");
 await ev("for(const l of app.workspace.getLeavesOfType('markdown'))l.detach();void 0");await shot('recall-ready');
 await click('recall-refresh');await wait('!hv.recall.getSnapshot().refreshing');await shot('recall-refreshed');
 await click('recall-start');await shot('recall-question');await click('recall-reveal');await shot('recall-answer');await click('recall-good');
 await wait('!hv.recall.getSnapshot().reviewSaving');await click('recall-back');await shot('recall-after');await stopVideo();
 assert.equal(requests.length,1);const changed=Object.keys(before).filter(p=>markdown(vault)[p]!==before[p]);assert.deepEqual(changed,['Area 1/Learning 1.md']);
 checks.push('Only explicit synthetic authoring changed Markdown; refresh/review/navigation did not');
 for(const language of ['ru','en']){await locale(language);
  for(const theme of ['theme-dark','theme-light'])for(const width of [1280,390]){
   await cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
   await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');void 0`);
   for(const page of ['home','recall','discover']){if(width===390)await clickSelector('.veynrel-menu-toggle');await click('nav-'+page);await settle();await shot(`${page}-${language}-${theme}-${width}`);
    if(after)await pass(`${page} fits ${language}/${theme}/${width}`,"hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1");
   }
   await click('review-map');await pause(300);await measure(`map-${language}-${theme}-${width}`);await shot(`map-${language}-${theme}-${width}`);
   if(after){await click('workbench-expand');await pause(200);await measure(`expanded-${language}-${theme}-${width}`);await shot(`expanded-${language}-${theme}-${width}`);await click('workbench-expand');}
   await click('review-back');
  }
 }
 metrics.runtime=await ev("({obsidian:require('@electron/remote').app.getVersion(),electron:process.versions.electron})");
 fs.writeFileSync(root+'/report.json',JSON.stringify({phase:after?'after':'before',sourceCommit,checks,metrics,screenshots,httpRequests:requests.length,httpDestination:'loopback only',liveModel:'NOT RUN',markdownChanged:changed},null,2));
 console.log(JSON.stringify({status:'PASS',root,checks:checks.length}));
}
