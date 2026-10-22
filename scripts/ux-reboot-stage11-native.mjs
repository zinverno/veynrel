// Native Obsidian; fresh, credential-free copies only. No model/index generation.
// node scripts/ux-reboot-stage11-native.mjs /tmp/veynrel-stage1-<new-name> lab before|after [build-directory]
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const [root,mode='lab',phase='after',build=ROOT]=process.argv.slice(2);
const baseline=phase==='before';
const sourceCommit=fs.existsSync(build+'/SOURCE_COMMIT')?fs.readFileSync(build+'/SOURCE_COMMIT','utf8').trim():undefined;
assert(root?.startsWith('/tmp/veynrel-stage1-')&&!root.includes('..')&&!fs.existsSync(root));
assert(['small','empty','lab'].includes(mode));
const vault=root+'/vault',dir=vault+'/.obsidian/plugins/ai-knowledge-hub';
fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(root+'/profile');
const sha=b=>createHash('sha256').update(b).digest('hex');
const markdown=base=>Object.fromEntries(fs.readdirSync(base,{recursive:true}).filter(p=>p.endsWith('.md')&&fs.statSync(base+'/'+p).isFile()).sort().map(p=>[p,sha(fs.readFileSync(base+'/'+p))]));
let sourceBefore;
const lab='/home/zinvernix/Documents/Все хранилища OBSID/Veynrel Lab 1000';
if(mode==='lab'){
  sourceBefore=markdown(lab);assert.equal(Object.keys(sourceBefore).length,1000);
  for(const p of Object.keys(sourceBefore)){fs.mkdirSync(vault+'/'+p.split('/').slice(0,-1).join('/'),{recursive:true});fs.copyFileSync(lab+'/'+p,vault+'/'+p);}
}else if(mode==='small'){
  for(const p of ['SQL/One.md','SQL/nested/Two.md','SQL-old/Other.md','A/Same/One.md','B/Same/Two.md','日本語 — очень длинное название папки с пробелами и [скобками]/Note.md','Root.md']){
    fs.mkdirSync(vault+'/'+p.split('/').slice(0,-1).join('/'),{recursive:true});fs.writeFileSync(vault+'/'+p,'# Synthetic acceptance note\n\nLocal navigation fixture.\n');
  }
  fs.mkdirSync(vault+'/Empty');
}
for(const name of ['main.js','styles.css','manifest.json'])fs.copyFileSync(build+'/'+name,dir+'/'+name);
fs.writeFileSync(dir+'/data.json',JSON.stringify({language:'ru',apiKey:'',semanticAutoSyncSuspended:true,semantic:{enabled:false,openRouterApiKey:'',openAICompatibleApiKey:''},decisions:{enabled:false,apiKey:''},companion:{enabled:false},health:{profile:'mixed',profileChosen:true,onboardingCompleted:true}}));
fs.writeFileSync(vault+'/.obsidian/community-plugins.json','["ai-knowledge-hub"]');
fs.writeFileSync(vault+'/.obsidian/app.json','{"checkForUpdates":false}');
fs.writeFileSync(root+'/profile/obsidian.json',JSON.stringify({updateDisabled:true,vaults:{stage1:{path:vault,ts:Date.now(),open:true}}}));
const before=markdown(vault),checks=[],metrics={},screenshots=[];
const child=spawn('/usr/bin/electron43',['/usr/lib/obsidian/app.asar','--user-data-dir='+root+'/profile','--remote-debugging-port=9382','--disable-gpu','--ozone-platform=x11'],{stdio:['ignore','ignore',fs.openSync(root+'/electron.log','a')]});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let socket,onFrame,id=0;const pending=new Map();
try{
 let page;for(let i=0;i<150;i++){try{page=(await(await fetch('http://127.0.0.1:9382/json/list')).json()).find(p=>p.url.startsWith('app://obsidian.md/'));}catch{}if(page)break;await pause(100);}assert(page,'Obsidian ready');
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j});
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Page.screencastFrame')onFrame?.(m.params);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}};
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
 const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert(!r.exceptionDetails,expression+' '+JSON.stringify(r.exceptionDetails));return r.result.value};
 const wait=async expression=>{for(let i=0;i<160;i++){if(await ev(expression))return;await pause(70);}throw Error('Timeout '+expression)};
 const pass=async(name,expression)=>{assert(await ev(expression),name);checks.push(name);console.log(name)};
 const click=key=>ev(`hv.contentEl.querySelector('[data-health-action="${key}"]').click();void 0`);
 const settle=()=>ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 await wait('!!window.app?.workspace?.layoutReady');assert.equal(await ev('app.vault.adapter.basePath'),vault);
 await wait("!!document.querySelector('.mod-trust-folder')||!!app.plugins.plugins['ai-knowledge-hub']");
 await ev("document.querySelector('.mod-trust-folder')&&[...document.querySelectorAll('.mod-trust-folder button')].find(e=>e.textContent==='Trust author and enable plugins').click();void 0");
 await wait("!!app.commands.commands['ai-knowledge-hub:veynrel-open-health']");
 await ev(`window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.io={reads:0,writes:0,network:0,enumerations:0};
 for(const key of ['read','cachedRead']){const original=app.vault[key].bind(app.vault);app.vault[key]=(...args)=>{io.reads++;return original(...args)}};
 for(const key of ['create','modify','append','process','delete','rename']){const original=app.vault[key].bind(app.vault);app.vault[key]=(...args)=>{io.writes++;return original(...args)}};
 {const original=app.vault.getMarkdownFiles.bind(app.vault);app.vault.getMarkdownFiles=(...args)=>{io.enumerations++;return original(...args)}};
 window.fetch=()=>{io.network++;throw Error('Network disabled in acceptance')};XMLHttpRequest.prototype.send=function(){io.network++;throw Error('Network disabled in acceptance')};
 app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();void 0`);
 const opened=performance.now();await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health');void 0");
 await wait("!!app.workspace.getLeavesOfType('veynrel-health')[0]?.view.contentEl.querySelector('[data-health-action=scope-all]')");
 metrics.openMs=performance.now()-opened;
 await ev("window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;void 0");
 await pass('Real native home; one sidebar and no old primary rail',"!!hv.contentEl.querySelector('.veynrel-native-home')&&!hv.contentEl.querySelector('.veynrel-findings-navigation')&&hv.contentEl.querySelectorAll('.veynrel-sidebar nav button').length===8");
 await pass('Exact Markdown count',`hv.areaIndex.snapshot.paths.length===${Object.keys(before).length}`);
 await pass('Opening is metadata-only with zero network/writes','io.reads===0&&io.writes===0&&io.network===0');
 const shot=async name=>{await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2});await pause(150);await settle();const clip=await ev('hv.contentEl.getBoundingClientRect().toJSON()');const zoom=await ev("require('electron').webFrame.getZoomFactor()");const data=await cdp('Page.captureScreenshot',{format:'png',...(zoom===1?{clip:{x:clip.x,y:clip.y,width:clip.width,height:clip.height,scale:1}}:{})});const file=name+'.png';fs.writeFileSync(root+'/'+file,Buffer.from(data.data,'base64'));screenshots.push({file,width:clip.width,height:clip.height,zoom,fullWindow:zoom!==1});};
 const locale=async language=>{
   await ev('app.setting.open();app.setting.openTabById("ai-knowledge-hub");void 0');
   await wait("!![...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'))");
   await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'))}void 0`);
   await ev('plugin.settingsSave');await settle();await ev('app.setting.close();hv.render();void 0');await cdp('Page.bringToFront');
 };
 // Comparable native captures use the same Lab Markdown, content rectangle and state.
 await cdp('Emulation.setDeviceMetricsOverride',{width:1484,height:1080,deviceScaleFactor:1,mobile:false});
 await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await ev("document.body.removeClass('theme-light');document.body.addClass('theme-dark');void 0");
 const sample=()=>ev(`(()=>{const e=hv.contentEl.querySelector('.veynrel-core-geometry'),s=getComputedStyle(e);return {animation:s.animationName,opacity:s.opacity,transform:s.transform,visible:hv.contentEl.dataset.sceneVisible,motion:hv.motion,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,core:hv.contentEl.querySelector('[data-health-action=scope-all]').getBoundingClientRect().toJSON(),labels:[...hv.contentEl.querySelectorAll('.veynrel-topic-node,.veynrel-core-all strong,.veynrel-core-all small')].map(e=>e.getBoundingClientRect().toJSON())}})()`);
 metrics.animationSamples=[];
 for(let i=0;i<7;i++){metrics.animationSamples.push(await sample());await pause(500);}
 if(!baseline){
   assert(new Set(metrics.animationSamples.map(s=>s.transform)).size>3,'Halo actually changes over time');
   assert(metrics.animationSamples.every(s=>JSON.stringify(s.core)===JSON.stringify(metrics.animationSamples[0].core)&&JSON.stringify(s.labels)===JSON.stringify(metrics.animationSamples[0].labels)),'Controls and labels stay still');
   checks.push('Animated halo changes over time; every control and label remains stationary');
   const frames=[];fs.mkdirSync(root+'/frames');
   onFrame=frame=>{const file=`frame-${String(frames.length).padStart(5,'0')}.jpg`;fs.writeFileSync(root+'/frames/'+file,Buffer.from(frame.data,'base64'));frames.push({file,time:frame.metadata.timestamp});void cdp('Page.screencastFrameAck',{sessionId:frame.sessionId});};
   await cdp('Page.startScreencast',{format:'jpeg',quality:90,maxWidth:1484,maxHeight:1080,everyNthFrame:2});
   await pause(7000);await cdp('Page.stopScreencast');onFrame=undefined;
   assert(frames.length>20,'Native recording has real frames');
   const durations=frames.slice(0,-1).map((f,i)=>`file '${f.file}'\nduration ${Math.max(.001,frames[i+1].time-f.time)}`).join('\n');
   fs.writeFileSync(root+'/frames/frames.txt',durations+`\nfile '${frames.at(-1).file}'\n`);
   execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',root+'/frames/frames.txt','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',root+'/core-native.mp4']);
   metrics.recording={file:'core-native.mp4',frames:frames.length,seconds:frames.at(-1).time-frames[0].time,source:'Native Obsidian CDP screencast; original timestamps'};
 }
 await shot('compare-home');
 const folder=await ev("hv.areaIndex.snapshot.folders.find(f=>f.path.includes('/'))?.path??hv.areaIndex.snapshot.folders[0]?.path");
 await ev(`hv.selectScope(${JSON.stringify(folder)});void 0`);await shot('compare-folder');
 await click('nav-discover');await shot('compare-map-folder');
 await ev('hv.selectScope();void 0');await shot('compare-map');
 await click('nav-tools');await shot('compare-tools');
 await click('nav-health');await shot('compare-check');await ev('hv.contentEl.scrollTop=hv.contentEl.scrollHeight;void 0');await shot('compare-check-details');await click('nav-home');
 if(!baseline){
   await pass('Home overview uses top-level folders',"[...hv.contentEl.querySelectorAll('.veynrel-topic-node')].every(e=>!e.title.includes('/'))");
   await pass('Picker retains every real nested and empty folder',"hv.contentEl.querySelector('[data-health-action=scope-picker]').options.length===hv.areaIndex.snapshot.folders.length+1");
   await click('nav-tools');
   await pass('Catalog disclosures start closed, editor context is explicit',"[...hv.contentEl.querySelectorAll('details')].every(e=>!e.open)&&!!hv.contentEl.querySelector('[data-health-action=editor-selection]')");
   await click('details-tool-openDeepAudit');
   await pass('Task details reveal existing audit consequences',"hv.contentEl.querySelector('[data-health-disclosure=details-tool-openDeepAudit]').open");
   await click('nav-health');
   await pass('Work screen has no provider, index, profile or topology service panels',"!hv.contentEl.querySelector('.veynrel-semantic,.veynrel-health-profile-control,.veynrel-topology-preview,[data-health-action=deep-check]')");
   await click('nav-settings');await click('connection-actions');
   await pass('Settings retain index operations and profile controls',"!!hv.contentEl.querySelector('.veynrel-semantic')&&!!hv.contentEl.querySelector('[data-health-action=change-profile]')");
   await click('nav-home');
 }
 if(baseline){
   assert.deepEqual(markdown(vault),before);if(sourceBefore)assert.deepEqual(markdown(lab),sourceBefore);
   fs.writeFileSync(root+'/report.json',JSON.stringify({status:'BASELINE_CAPTURED',sourceCommit,metrics,screenshots,artifact:Object.fromEntries(['main.js','styles.css','manifest.json'].map(n=>[n,sha(fs.readFileSync(dir+'/'+n))])),markdownUnchanged:true,io:await ev('io')},null,2)+'\n');
 }else{
 for(const language of ['ru','en']){
  if(language==='en')await locale(language);
  for(const theme of ['dark','light'])for(const width of [1484,434]){
   await cdp('Emulation.setDeviceMetricsOverride',{width,height:width===434?1800:1080,deviceScaleFactor:1,mobile:false});
   await ev(`document.body.removeClass('theme-dark','theme-light');document.body.addClass('theme-${theme}');hv.contentEl.scrollTop=0;void 0`);await settle();
   await pass(`${language}/${theme}/${width} no horizontal overflow or untranslated keys`,"hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1&&!/@workspace\./.test(hv.contentEl.textContent)");
   await shot(`home-${language}-${theme}-${width}`);
   for(const route of ['discover','tools','health']){
     await click('nav-'+route);await settle();
     await pass(`${language}/${theme}/${width}/${route} fits and is localized`,"hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1&&!/@(?:workspace|polish)\\./.test(hv.contentEl.textContent)");
     await pass(`${route} buttons do not overlap`, `(()=>{const buttons=[...hv.contentEl.querySelectorAll('.veynrel-shell-main button')].filter(e=>e.getClientRects().length).map(e=>{let r=e.getBoundingClientRect().toJSON();for(let p=e.parentElement;p;p=p.parentElement){const s=getComputedStyle(p);if(/auto|scroll|hidden|clip/.test(s.overflow+s.overflowY+s.overflowX)){const c=p.getBoundingClientRect();r={left:Math.max(r.left,c.left),right:Math.min(r.right,c.right),top:Math.max(r.top,c.top),bottom:Math.min(r.bottom,c.bottom)}}}return r}).filter(r=>r.right>r.left&&r.bottom>r.top);return buttons.every((a,i)=>buttons.slice(i+1).every(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)<=1||Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=1))})()`);
     await shot(`${route}-${language}-${theme}-${width}`);
   }
   await click('nav-home');
   if(width===434){
    await click('workspace-menu');await pass('Narrow menu is visible and expanded',"getComputedStyle(hv.contentEl.querySelector('.veynrel-sidebar')).display!=='none'&&hv.contentEl.querySelector('[data-health-action=workspace-menu]').getAttribute('aria-expanded')==='true'");
    await ev("hv.contentEl.querySelector('[data-health-action=nav-home]').focus();void 0");
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
    await pass('Escape closes menu and returns focus',"hv.contentEl.ownerDocument.activeElement?.dataset.healthAction==='workspace-menu'&&hv.contentEl.querySelector('[data-health-action=workspace-menu]').getAttribute('aria-expanded')==='false'");
   }
  }
 }
 await locale('ru');await cdp('Emulation.setDeviceMetricsOverride',{width:1484,height:1080,deviceScaleFactor:1,mobile:false});
 // Native keyboard activation and renderer zoom, with no note mutation.
 await ev(`hv.selectScope(${JSON.stringify(folder)});hv.contentEl.querySelector('[data-health-action=scope-all]').focus();void 0`);
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
 metrics.keyboard=await ev("({scope:hv.areaIndex.selection,focus:hv.contentEl.ownerDocument.activeElement?.dataset.healthAction})");fs.writeFileSync(root+'/keyboard.json',JSON.stringify(metrics.keyboard));
 await pass('Keyboard activates the core and clears the folder scope',"hv.areaIndex.selection.kind==='all'&&hv.contentEl.ownerDocument.activeElement.dataset.healthAction==='scope-all'");
 await ev("require('electron').webFrame.setZoomFactor(2);void 0");await settle();
 metrics.zoom=await ev("({factor:require('electron').webFrame.getZoomFactor(),width:hv.contentEl.clientWidth})");
 assert.equal(metrics.zoom.factor,2);
 for(const route of ['home','discover','tools']){await click('nav-'+route);await settle();await pass(`200 percent native zoom ${route} fits`,"hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1");await shot(`${route}-zoom200`);}
 await ev("require('electron').webFrame.setZoomFactor(1);void 0");await click('nav-home');await settle();
 await click('workspace-motion');await settle();
 const off1=await sample();await pause(600);const off2=await sample();
 assert.equal(off1.animation,'none');assert.equal(off1.transform,off2.transform);checks.push('Motion switch stops the halo over time');
 await click('workspace-motion');
 if(mode==='small'){
  await ev("hv.contentEl.querySelector('[data-health-action=scope-picker]').value='SQL';hv.contentEl.querySelector('[data-health-action=scope-picker]').dispatchEvent(new Event('change'));void 0");
  await shot('home-folder-ru');await click('open-scope');
  await pass('Folder list includes descendants and excludes SQL-old',"JSON.stringify([...hv.contentEl.querySelectorAll('.veynrel-scope-notes button')].map(e=>e.textContent))===JSON.stringify(['SQL/One.md','SQL/nested/Two.md'])");
  await pass('Folder does not expose unacknowledged global actions',"hv.contentEl.querySelector('[data-health-action=discover-search]').disabled&&!!hv.contentEl.querySelector('[data-health-action=scope-continue]')");
  await click('nav-home');await pass('Folder context survives routes',"hv.areaIndex.selection.path==='SQL'");
  await ev("hv.selectScope(hv.areaIndex.snapshot.folders.find(f=>f.path.startsWith('日本語')).path);void 0");
  await pass('Rare long folder is visible and named literally',"[...hv.contentEl.querySelectorAll('.veynrel-topic-node')].some(e=>e.getAttribute('aria-pressed')==='true'&&e.title.startsWith('日本語'))");
  await cdp('Emulation.setDeviceMetricsOverride',{width:434,height:1080,deviceScaleFactor:1,mobile:false});await settle();
  await pass('Long names fit at 390 px',"hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1");await shot('home-long-folder-390');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1484,height:1080,deviceScaleFactor:1,mobile:false});await settle();
  await ev("hv.selectScope('Empty');void 0");await click('open-scope');
  await pass('Empty folder has an honest empty local list',"hv.contentEl.querySelectorAll('.veynrel-scope-notes button').length===0&&hv.areaIndex.selection.path==='Empty'");await click('nav-home');
 }
 const enumerationBaseline=await ev('io.enumerations');
 metrics.switchMs=await ev(`(()=>{const values=[];for(let i=0;i<20;i++){const start=performance.now();hv.selectScope(hv.areaIndex.snapshot.folders[i%Math.max(1,hv.areaIndex.snapshot.folders.length)]?.path);values.push(performance.now()-start)}return values})()`);
 metrics.switchThroughFrameMs=[];
 for(let i=0;i<5;i++){const start=performance.now();await ev(`hv.selectScope(hv.areaIndex.snapshot.folders[${i}]?.path);void 0`);await settle();metrics.switchThroughFrameMs.push(performance.now()-start);}
 await pass('Selection and rendering do not enumerate the vault again',`io.enumerations===${enumerationBaseline}`);
 await ev('hv.selectScope();void 0');
 // No timers or JS graph loop: measure renderer task time over two observed idle intervals.
 await cdp('Performance.enable');
 for(const motion of [true,false]){await ev(`hv.motion=${motion};hv.render();void 0`);await settle();const first=(await cdp('Performance.getMetrics')).metrics;await pause(1500);const last=(await cdp('Performance.getMetrics')).metrics;metrics['idle-'+motion]={intervalMs:1500,taskDurationSeconds:last.find(m=>m.name==='TaskDuration').value-first.find(m=>m.name==='TaskDuration').value};}
 await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await ev('hv.motion=true;hv.render();void 0');await settle();
 await pass('Reduced motion disables the geometry animation',"getComputedStyle(hv.contentEl.querySelector('.veynrel-core-geometry')).animationName==='none'");
 const reduced1=await sample();await pause(600);const reduced2=await sample();assert.equal(reduced1.transform,reduced2.transform);await shot('home-reduced-motion');
 await cdp('Emulation.setEmulatedMedia',{features:[]});
 await pass('Navigation and scope selection remain zero-read/write/network','io.reads===0&&io.writes===0&&io.network===0');
 // Enter owners without executing scans, model requests or writes.
 for(const route of ['health','process','recall','tools','settings','history','discover']){await click('nav-'+route);await settle();await pass('Route '+route,`hv.route.page==='${route}'`);}
 await click('nav-health');await click('nav-findings');await pass('Health Findings entry',"!!hv.contentEl.querySelector('[data-health-action=state-open]')");
 await click('nav-settings');await click('settings-connect');await pass('Settings retains Companion/MCP',"!!hv.contentEl.querySelector('.veynrel-connect')");
 await click('nav-health');
 await ev("Object.assign(plugin.settings,{provider:'ollama',model:'disabled-native-fixture',baseUrl:'http://127.0.0.1:9/v1',apiKey:''});void 0");
 await click('check-audit');await wait("!!document.querySelector('.ai-hub-audit-modal .ai-hub-stat-grid')");
 await pass('Audit entry reaches the existing mode selector without a request',"!!document.querySelector('.ai-hub-audit-modal')&&io.network===0");
 await ev("document.querySelector('.ai-hub-audit-modal .modal-close-button,.ai-hub-audit-modal .modal-header-button').click();void 0");
 await click('nav-process');await click('tool-openBatchProcessing');await wait("!!document.querySelector('.ai-hub-count-live')");
 await pass('Process reaches existing batch filters and preview',"!!document.querySelector('.ai-hub-count-live')&&io.network===0");
 await ev("document.querySelector('.ai-hub-count-live').closest('.modal').querySelector('.modal-close-button,.modal-header-button').click();void 0");
 await click('nav-discover');const beforeLinks=await ev('({...io})');await click('topology-open');
 await pass('Links entry reaches the existing topology without loading',`hv.route.page==='topology'&&io.enumerations===${beforeLinks.enumerations}`);
 await click('topology-refresh');await wait("hv.topology.getSnapshot().state==='ready'");
 await pass('Explicit topology load stays local and metadata-only',`io.reads===${beforeLinks.reads}&&io.writes===${beforeLinks.writes}&&io.network===${beforeLinks.network}`);
 await click('nav-history');await click('tool-openOperationHistory');await wait("!!document.querySelector('.ai-operation-history')");
 await pass('History delegates to existing journal owner',"!!document.querySelector('.ai-operation-history')&&io.network===0");
 await ev("document.querySelector('.ai-operation-history').closest('.modal').querySelector('.modal-close-button,.modal-header-button').click();void 0");
 await click('nav-home');
 if(mode==='small'){
  await ev("app.vault.createFolder('__scope_smoke/child').then(()=>{})");await wait("hv.areaIndex.snapshot.folders.some(f=>f.path==='__scope_smoke/child')");
  await ev("hv.selectScope('__scope_smoke/child');app.vault.rename(app.vault.getAbstractFileByPath('__scope_smoke'),'__scope_renamed')");
  await wait("hv.areaIndex.selection.missing===true");
  await pass('Renaming an ancestor invalidates selection, never selects All',"hv.areaIndex.selection.path==='__scope_smoke/child'&&hv.contentEl.querySelector('[data-health-action=open-scope]').disabled");
  await ev("hv.selectScope('__scope_renamed/child');app.vault.delete(app.vault.getAbstractFileByPath('__scope_renamed'),true)");await wait("hv.areaIndex.selection.missing===true");
  await pass('Deleted folder remains an explicit missing scope',"hv.areaIndex.selection.kind==='folder'&&hv.contentEl.querySelector('[role=alert]').textContent.length>0");
  await ev('hv.selectScope();void 0');
 }
 if(Object.keys(before).length){
  await click('nav-discover');const path=await ev("hv.contentEl.querySelector('.veynrel-scope-notes button').textContent");await click('scope-note-0');await wait(`app.workspace.getActiveFile()?.path===${JSON.stringify(path)}`);checks.push('Local list opens the exact source path');await ev('app.workspace.setActiveLeaf(hv.leaf,{focus:true});void 0');
 }
 await click('nav-home');
 // A second real leaf has independent selection, then a narrow split inside a wide window.
 await ev("window.secondLeaf=app.workspace.getLeaf('split','vertical');secondLeaf.setViewState({type:'veynrel-health',active:true});void 0");await wait("!!secondLeaf.view.contentEl.querySelector('[data-health-action=scope-all]')");await settle();
 await ev('hv.selectScope(hv.areaIndex.snapshot.folders[0]?.path);void 0');
 await pass('Two native views have independent scope',"secondLeaf.view.areaIndex.selection.kind==='all'");
 await ev('app.workspace.revealLeaf(hv.leaf)');await settle();
 console.log('Split geometry',await ev("({first:hv.contentEl.getBoundingClientRect().toJSON(),scroll:hv.contentEl.scrollWidth,menu:getComputedStyle(hv.contentEl.querySelector('.veynrel-menu-toggle')).display,second:secondLeaf.view.contentEl.getBoundingClientRect().toJSON()})"));
 await shot('home-wide-window-split');
 await pass('Wide-window split uses the pane-width menu without overflow',"hv.contentEl.clientWidth<760&&hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1&&getComputedStyle(hv.contentEl.querySelector('.veynrel-menu-toggle')).display!=='none'");
 await ev('secondLeaf.detach();hv.selectScope();void 0');await settle();
 await ev("window.hiddenTestLeaf=app.workspace.getLeaf('tab');hiddenTestLeaf.setViewState({type:'empty',active:true});void 0");
 await wait("hv.contentEl.getAttribute('data-scene-visible')==='false'");
 await pass('Hidden view stops decorative animation',"hv.contentEl.querySelector('.veynrel-core-geometry')&&getComputedStyle(hv.contentEl.querySelector('.veynrel-core-geometry')).animationName==='none'");
 await ev('hiddenTestLeaf.detach();app.workspace.setActiveLeaf(hv.leaf,{focus:true});void 0');await settle();
 // Real native popout, not a browser simulation.
 await ev("window.pop=app.workspace.openPopoutLeaf();pop.setViewState({type:'veynrel-health',active:true});void 0");await wait("!!pop.view.contentEl.querySelector('[data-health-action=scope-all]')");
 await pass('Popout owns its DOM and scope',"pop.view.contentEl.ownerDocument!==document&&pop.view.areaIndex.selection.kind==='all'");
 await ev("pop.view.contentEl.querySelector('[data-health-action=scope-all]').click();void 0");
 let target;for(let i=0;i<30;i++){target=(await(await fetch('http://127.0.0.1:9382/json/list')).json()).find(p=>p.type==='page'&&p.id!==page.id);if(target)break;await pause(100);}
 assert(target,'Native popout CDP target');const attached=await cdp('Target.attachToTarget',{targetId:target.id,flatten:true});
 const popshot=await new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,sessionId:attached.sessionId,method:'Page.captureScreenshot',params:{format:'png'}}))});
 fs.writeFileSync(root+'/home-popout.png',Buffer.from(popshot.data,'base64'));screenshots.push({file:'home-popout.png',nativePopout:true});
 await pass('Popout uses its own visibility lifecycle',"!!pop.view.stopVisibility&&pop.view.contentEl.dataset.documentHidden===String(pop.view.contentEl.ownerDocument.hidden)");
 await ev('window.oldPop=pop.view;void 0');
 await ev('pop.detach();void 0');await wait('!oldPop.sceneObserver&&!oldPop.stopVisibility&&!oldPop.areaIndex');await cdp('Page.bringToFront');
 await ev('window.oldView=hv;hv.leaf.detach();void 0');await wait('!oldView.areaIndex&&!oldView.sceneObserver&&!oldView.stopVisibility');
 await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health');void 0");await wait("!!app.workspace.getLeavesOfType('veynrel-health')[0]?.view.contentEl.querySelector('[data-health-action=scope-all]')");
 await pass('Close disposes scope subscriptions/observer; reopening starts on All',"app.workspace.getLeavesOfType('veynrel-health')[0].view.areaIndex.selection.kind==='all'");
 assert.deepEqual(markdown(vault),before);if(sourceBefore)assert.deepEqual(markdown(lab),sourceBefore);
 const report={status:'PASS',sourceCommit,mode,checks,metrics,screenshots,artifact:Object.fromEntries(['main.js','styles.css','manifest.json'].map(n=>[n,sha(fs.readFileSync(dir+'/'+n))])),markdownBefore:before,markdownAfter:markdown(vault),versions:await ev('({obsidian:navigator.userAgent.split("obsidian/")[1]?.split(" ")[0]??document.title,electron:process.versions.electron})'),io:await ev('io'),limits:'Linux desktop. Narrow viewport is not physical mobile. No provider/model quality or screen-reader speech claim. Idle intervals and opening timings are observations, not a benchmark.'};
 fs.writeFileSync(root+'/report.json',JSON.stringify(report,null,2)+'\n');console.log('PASS '+root);
}
}catch(error){fs.writeFileSync(root+'/failure.txt',String(error.stack||error));fs.writeFileSync(root+'/partial-report.json',JSON.stringify({status:'FAIL',checks,metrics,screenshots},null,2));throw error;}finally{socket?.close();child.kill();}
