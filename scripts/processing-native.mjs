// Processing follow-up on the same isolated vault and native input as review acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
export async function processingChecks(c) {
 const {ev,wait,click,clickSelector,shot,startVideo,stopVideo,pass,locale,cdp,pause,settle,closeModals,
   root,vault,dir,before,markdown,requests,checks,metrics,screenshots,sourceCommit,after}=c;
 const key=async value=>{await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:value,code:value,windowsVirtualKeyCode:value==='Enter'?13:27,...(value==='Enter'?{text:'\r'}:{})});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:value,code:value,windowsVirtualKeyCode:value==='Enter'?13:27});await settle();};
 const keyboard=async action=>{await ev(`document.querySelector('[data-health-action="${action}"]').focus();void 0`);await key('Enter');};
 const ready=()=>wait("!!document.querySelector('[data-health-action=process-refresh]')");
 const seed=async description=>ev(`{const i=await plugin.getIndex();i.setClusters([{name:'Synthetic topic',description:${JSON.stringify(description)},filePaths:['Workbench/A/Cache.md','Workbench/B/Cache.md']}]);await i.save();}void 0`);
 await startVideo('processing-route');await click('nav-process');if(after)await ready();await shot('processing-empty');
 if(!after){await click('tool-openBatchProcessing');await shot('processing-batch');await closeModals();await click('process-workbench');await shot('processing-review');await click('nav-process');}
 else {
  await pass('Three cards; MOC without clusters opens audit, not a failing write action',"document.querySelectorAll('.veynrel-processing-card').length===3&&!document.querySelector('[data-health-action=tool-generateMocs]')&&!!document.querySelector('[data-health-action=tool-openDeepAudit]')&&!document.querySelector('[data-health-action=process-recall]')");
  await ev("app.commands.executeCommandById('ai-knowledge-hub:ai-generate-mocs');void 0");await wait("!!document.querySelector('[data-health-action=moc-audit]')");await shot('moc-command-empty');
  await pass('Existing MOC command also uses preparation and offers audit when empty',"!document.querySelector('[data-health-action=moc-confirm]')");await click('moc-cancel');await wait('!plugin.mocTask');
  await click('tool-openDeepAudit');await wait("!!document.querySelector('.ai-hub-audit-modal .ai-hub-status-card')");await shot('processing-audit');await closeModals();
  await keyboard('nav-discover');await wait("!!document.querySelector('[data-health-action=review-refresh]')");await shot('processing-review');
  await pass('Independent sidebar review remains list-first without a map',"hv.route.page==='discover'&&graphicalCreations===0&&!document.querySelector('svg[data-camera]')");
  await click('nav-process');await ready();
  await ev("hv.selectScope('Workbench');void 0");await click('tool-openBatchProcessing');await shot('processing-batch-scope');await click('scope-continue');
  await wait("!!document.querySelector('.ai-hub-filters select')");await shot('processing-batch');
  await pass('Batch selects its own notes; workspace scope does not populate the folder',"document.querySelector('.ai-hub-filters select').value===''");await closeModals();await ev("hv.selectScope();void 0");
  await ev("window.realBatch=hv.tools.openBatchProcessing;hv.tools.openBatchProcessing=()=>{throw Error('synthetic failure')};void 0");await click('tool-openBatchProcessing');await shot('processing-launch-error');
  await pass('Launcher failure leaves the page usable without raw details',"!!document.querySelector('[data-workspace-message]').textContent&&!document.querySelector('[data-workspace-message]').textContent.includes('synthetic failure')");
  await ev('hv.tools.openBatchProcessing=realBatch;void 0');await click('nav-home');await click('nav-process');await ready();
  await seed('');await click('process-refresh');await wait("!!document.querySelector('[data-health-action=tool-generateMocs]')");await shot('processing-ready');
  await ev("window.folderCreates=0;window.originalCreateFolder=app.vault.createFolder.bind(app.vault);app.vault.createFolder=(...args)=>{folderCreates++;return originalCreateFolder(...args)};window.writeBaseline=io.writes;void 0");
  await keyboard('tool-generateMocs');await wait("!!document.querySelector('[data-health-action=moc-confirm]')");await shot('moc-paid-consent');
  await click('moc-cancel');await wait('!plugin.mocTask');
  assert.equal(requests.length,0);await pass('Cancel MOC has zero folder/file writes and zero requests',"folderCreates===0&&io.writes===writeBaseline&&!app.vault.getAbstractFileByPath(plugin.settings.mocFolder)");assert.deepEqual(markdown(vault),before);
  await click('tool-generateMocs');await wait("!!document.querySelector('[data-health-action=moc-confirm]')");await key('Escape');await wait('!plugin.mocTask');assert.equal(requests.length,0);await pass('Escape cancels consent without writes',"folderCreates===0&&io.writes===writeBaseline");
  await click('tool-generateMocs');await wait("!!document.querySelector('[data-health-action=moc-confirm]')");await seed('Saved synthetic description');await click('moc-confirm');await wait('!plugin.mocTask');await shot('moc-stale');
  assert.equal(requests.length,0);await pass('Changed clusters invalidate consent before any IO',"folderCreates===0&&io.writes===writeBaseline");
  await click('tool-generateMocs');await wait("!!document.querySelector('[data-health-action=moc-confirm]')");await shot('moc-local-consent');await keyboard('moc-confirm');await wait('!plugin.mocTask');await shot('moc-written');
  await pass('Confirmed cached descriptions create one MOC through the existing generator',"app.vault.getMarkdownFiles().filter(f=>f.path.startsWith('MOCs/')).length===1");
  assert.equal(requests.length,0);for(const [p,hash]of Object.entries(before))assert.equal(markdown(vault)[p],hash);
  await wait("app.vault.getMarkdownFiles().filter(f=>f.path.startsWith('MOCs/')).every(f=>app.metadataCache.getFileCache(f)?.frontmatter?.type==='moc')");
  await seed('Updated synthetic description');await click('tool-generateMocs');await wait("!!document.querySelector('[data-health-action=moc-confirm]')");await click('moc-confirm');await wait('!plugin.mocTask');
  await pass('Existing generated MOC is updated without a second file',"app.vault.getMarkdownFiles().filter(f=>f.path.startsWith('MOCs/')).length===1");
  await seed('');await click('tool-generateMocs');await wait("!!document.querySelector('[data-health-action=moc-confirm]')");assert.equal(requests.length,0);await click('moc-confirm');await wait('!plugin.mocTask');
  assert.equal(requests.length,1);checks.push('Only explicit MOC confirmation calls the synthetic loopback transport; no paid service');
  await pass('No other files changed',"graphicalCreations===0");for(const [p,hash]of Object.entries(before))assert.equal(markdown(vault)[p],hash);
 }
 await stopVideo();
 for(const language of ['ru','en']) { await locale(language);
  for(const theme of ['theme-dark','theme-light'])for(const width of [1280,390]) {
   await cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await ev(`document.body.removeClass('theme-dark','theme-light');document.body.addClass('${theme}');hv.render();void 0`);
   await ev("hv.contentEl.scrollTop=0;hv.shellMain.scrollTop=0;void 0");
   await shot(`processing-${language}-${theme}-${width}`);
   if(after){await pass(`Processing fits ${language}/${theme}/${width}`,"hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1");await click('tool-generateMocs');await wait("!!document.querySelector('[data-health-action=moc-confirm]')");await shot(`moc-${language}-${theme}-${width}`);
   if(width===390){await ev("document.querySelector('[data-health-action=moc-cancel]').scrollIntoView({block:'center'});void 0");await shot(`moc-actions-${language}-${theme}-${width}`);}
     const contrast=await ev(`(()=>{
       const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
       const lum=p=>[...p].slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
       return [...document.querySelectorAll('.veynrel-processing *, .veynrel-moc-confirmation *')].filter(e=>e.getClientRects().length&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&!e.closest(':disabled,[hidden],svg')).map(e=>{
         ctx.clearRect(0,0,1,1);const chain=[];for(let n=e;n;n=n.parentElement)chain.unshift(n);
         for(const n of chain){ctx.fillStyle=getComputedStyle(n).backgroundColor;ctx.fillRect(0,0,1,1)}const bg=lum(ctx.getImageData(0,0,1,1).data);
         const style=getComputedStyle(e);ctx.fillStyle=style.color;ctx.fillRect(0,0,1,1);const fg=lum(ctx.getImageData(0,0,1,1).data);
         return {className:e.className,ratio:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05),large:parseFloat(style.fontSize)>=24};
       });})()`);
     metrics.contrast??=[];metrics.contrast.push({theme,width,values:contrast});assert(contrast.every(c=>c.ratio>=(c.large?3:4.5)),JSON.stringify(contrast));
await pass(`Consent fits ${language}/${theme}/${width}`,"[...document.querySelectorAll('.veynrel-moc-confirmation')].every(e=>e.scrollWidth<=e.clientWidth+1)");await click('moc-cancel');await wait('!plugin.mocTask');}
  }
 }
 if(after){await cdp('Emulation.clearDeviceMetricsOverride');await ev("require('@electron/remote').getCurrentWebContents().setZoomFactor(2);void 0");await pause(300);await shot('processing-200-percent');await pass('Processing fits at 200% Electron zoom',"hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1");await click('tool-generateMocs');await wait("!!document.querySelector('[data-health-action=moc-confirm]')");await shot('moc-200-percent');await ev("document.querySelector('[data-health-action=moc-cancel]').scrollIntoView({block:'center'});void 0");await shot('moc-actions-200-percent');await pass('MOC actions remain reachable at 200%',"(()=>{const r=document.querySelector('[data-health-action=moc-cancel]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()");await click('moc-cancel');await wait('!plugin.mocTask');await ev("require('@electron/remote').getCurrentWebContents().setZoomFactor(1);void 0");}
 metrics.runtime=await ev("({obsidian:require('@electron/remote').app.getVersion(),electron:process.versions.electron})");
 fs.writeFileSync(root+'/after.json',JSON.stringify(markdown(vault),null,2));
 fs.writeFileSync(root+'/report.json',JSON.stringify({phase:after?'after':'before',sourceCommit,checks,metrics,screenshots,httpRequests:requests.length,httpDestination:'synthetic loopback only',liveModel:'NOT RUN',originalMarkdownUnchanged:Object.entries(before).every(([p,h])=>markdown(vault)[p]===h)},null,2));
 console.log(JSON.stringify({status:'PASS',root,checks:checks.length}));
}
