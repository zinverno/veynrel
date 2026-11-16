// Real Obsidian, isolated by native/run.py. Synthetic vectors, no live model.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {build as bundle} from 'esbuild';
import {assertNativeRoot,launchObsidian,nativeEndpoint} from './native/session.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const [root,rawCount='120',build=ROOT]=process.argv.slice(2),count=Number(rawCount),indexed=Number(process.env.R06_INDEX_COUNT??count);
assertNativeRoot(root);assert(!fs.existsSync(root));assert([120,1000,5000,10000].includes(count));assert(indexed>=0&&indexed<=count);
const baseline=process.env.R06_BASELINE==='1',warmCache=process.env.R06_WARM_CACHE==='1';
const vault=`${root}/vault`,pluginDir=`${vault}/.obsidian/plugins/ai-knowledge-hub`;
fs.mkdirSync(pluginDir,{recursive:true});fs.mkdirSync(`${root}/profile`);fs.mkdirSync(`${root}/frames`);
await bundle({absWorkingDir:ROOT,entryPoints:['scripts/r06-map-fixture.ts'],bundle:true,platform:'node',format:'cjs',outfile:`${root}/fixture.cjs`,plugins:[{name:'fixture-host',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const getLanguage=()=>"en";'}));}}]});
const fixture=await createRequire(import.meta.url)(`${root}/fixture.cjs`).r06Fixture(count,indexed);
for(const note of fixture.notes){fs.mkdirSync(`${vault}/${note.path.split('/')[0]}`,{recursive:true});fs.writeFileSync(`${vault}/${note.path}`,note.text);}
if(indexed){fs.mkdirSync(`${pluginDir}/semantic-index`);for(const [p,v]of fixture.files)fs.writeFileSync(`${pluginDir}/semantic-index/${p.split('/').pop()}`,typeof v==='string'?v:Buffer.from(v));}
fs.writeFileSync(`${vault}/.obsidian/community-plugins.json`,'["ai-knowledge-hub"]');
fs.writeFileSync(`${vault}/.obsidian/app.json`,'{"checkForUpdates":false}');
fs.writeFileSync(`${root}/profile/obsidian.json`,JSON.stringify({updateDisabled:true,vaults:{map:{path:vault,open:true,ts:Date.now()}}}));
fs.writeFileSync(`${pluginDir}/data.json`,JSON.stringify({language:'en',apiKey:'',semanticAutoSyncSuspended:true,semantic:{enabled:!!indexed,embeddingProvider:'ollama',embeddingModel:'global-map-synthetic',embeddingBaseUrl:'http://127.0.0.1:11434',openRouterApiKey:'',openAICompatibleApiKey:''},decisions:{enabled:false,apiKey:''},companion:{enabled:false},health:{profile:'mixed',profileChosen:true,onboardingCompleted:true}}));
const sha=v=>createHash('sha256').update(v).digest('hex');
const report={scenario:'R06.1-map-foundation',baseline,warmCache,count,indexed,source:fs.existsSync(`${build}/SOURCE_COMMIT`)?fs.readFileSync(`${build}/SOURCE_COMMIT`,'utf8').trim():execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),checks:[],exceptions:[],actions:[],screenshots:[],assets:{},externalRequests:[],recording:null,metrics:{},observations:{},io:[]};
for(const name of ['main.js','styles.css','manifest.json']){const bytes=fs.readFileSync(`${build}/${name}`);fs.writeFileSync(`${pluginDir}/${name}`,bytes);report.assets[name]=sha(bytes);}
report.harness=Object.fromEntries(['r06-map-native.mjs','r06-map-fixture.ts','native/session.mjs','native/run.py'].map(p=>[p,sha(fs.readFileSync(`${ROOT}/scripts/${p}`))]));
const original=Object.fromEntries(fixture.notes.map(n=>[n.path,sha(fs.readFileSync(`${vault}/${n.path}`))]));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const child=launchObsidian(root),connections=[],frames=[];let main,endpoint,recording=false;
async function connection(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r,j) => { socket.onopen = r; socket.onerror = j; });
  let next = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve,reject) => {
    const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve: r => { clearTimeout(timer); resolve(r); }, reject: e => { clearTimeout(timer); reject(Error(JSON.stringify(e))); } }); socket.send(JSON.stringify({ id, method, params }));
  });
  socket.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (p) m.error ? p.reject(m.error) : p.resolve(m.result); }
    if (m.method === 'Runtime.exceptionThrown') report.exceptions.push({ target: target.id, ...m.params });
    if (m.method === 'Network.requestWillBeSent' && /^https?:/.test(m.params.request.url)) report.externalRequests.push(m.params.request.url);
    if (m.method === 'Page.screencastFrame') {
      const file = `frame-${String(frames.length).padStart(5,'0')}.jpg`; fs.writeFileSync(`${root}/frames/${file}`, Buffer.from(m.params.data,'base64'));
      frames.push({ file, time: m.params.metadata.timestamp }); void send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {});
    }
  };
  const c = { socket, send, id: target.id, ev: async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value;
  } }; connections.push(c);
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['https://*', 'http://*'] }); return c;
}
async function wait(expression, c = main, timeoutMs = 15000) { const deadline=performance.now()+timeoutMs; while(performance.now()<deadline){if(await c.ev(expression))return;await pause(50);} throw Error(`Readiness: ${expression}`); }
async function pass(name, expression, c = main) { assert(await c.ev(expression), name); report.checks.push(name); }
async function shot(name, c = main) { fs.writeFileSync(`${root}/${name}.png`, Buffer.from((await c.send('Page.captureScreenshot', { format:'png' })).data,'base64')); report.screenshots.push(name+'.png'); }
async function focus(c = main) { await c.send('Page.bringToFront'); await c.ev('window.electronWindow.focus();void 0'); await wait('document.hasFocus() && window.electronWindow.isFocused()', c); }
async function key(key, code, number, text, modifiers = 0) {
  for (const type of ['keyDown','keyUp']) await main.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode:number, modifiers, ...(type==='keyDown' && text ? {text,unmodifiedText:text}: {}) });
}
async function stopVideo() {
  if (!recording) return; recording = false; await main.send('Page.stopScreencast'); assert(frames.length > 5, 'Native video contains frames');
  const list = frames.map((f,i) => `file '${f.file}'\nduration ${Math.max(.001,(frames[i+1]?.time ?? f.time+.2)-f.time)}`).join('\n') + `\nfile '${frames.at(-1).file}'\n`;
  fs.writeFileSync(`${root}/frames/frames.txt`, list);
  const result = spawnSync('ffmpeg', ['-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',`${root}/frames/frames.txt`,'-vf','pad=1600:1000:0:0','-fps_mode','vfr','-c:v','libx264','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart',`${root}/journey.mp4`], { encoding:'utf8' });
  assert.equal(result.status, 0, result.stderr); report.recording = { file:'journey.mp4', frames:frames.length, seconds:frames.at(-1).time-frames[0].time, source:'Native CDP frames and timestamps; main client area, no cuts' };
}
const ev=expression=>main.ev(expression);
async function activate(id){await focus();await ev(`(()=>{const e=document.querySelector('[data-health-action="${id}"]');if(!e||e.disabled)throw Error('Unavailable: ${id}');e.scrollIntoView({block:'center'});e.focus();})()`);await key('Enter','Enter',13,'\r');await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');}
async function field(id,value){await ev(`(()=>{const e=document.querySelector('[data-health-action="${id}"]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
async function io(stage){report.io.push({stage,...await ev('io')});}
async function metric(stage){report.metrics[stage]=await ev(`(()=>{const e=wb.element;return {notes:wb.data.scope.paths.length,semantic:wb.data.semantic?.getSnapshot().state,reason:wb.data.semantic?.getSnapshot().reason,indexed:wb.data.semantic?.getSnapshot().indexedNoteCount,mapped:wb.data.semantic?.getSnapshot().mappedNoteCount,displayedNodes:e.querySelectorAll('[data-path]').length,displayGroups:e.querySelectorAll('[data-group]').length,dom:e.querySelectorAll('*').length,svg:e.querySelectorAll('svg *').length,layoutCount:wb.layoutCount,layoutMs:wb.layoutMilliseconds,displayGroupingMs:wb.representationMilliseconds??null,semanticMs:window.semanticMs??null,physicsMs:wb.simulation.milliseconds,ticks:wb.simulation.ticks,frames:wb.graph.metrics,topology:hv.topology.getSnapshot().timing,heap:performance.memory?.usedJSHeapSize}})()`);}
try{
 endpoint=await nativeEndpoint(root,child);let target;
 for(let i=0;i<200;i++){target=(await(await fetch(`${endpoint}/json/list`)).json()).find(t=>t.url.startsWith('app://obsidian.md/'));if(target)break;await pause(50);}assert(target);
 main=await connection(target);await wait('!!window.app?.workspace?.layoutReady');assert.equal(await ev('app.vault.adapter.basePath'),vault);
 await wait("!!document.querySelector('.mod-trust-folder')||!!app.plugins.plugins['ai-knowledge-hub']");
 await ev("document.querySelector('.mod-trust-folder')&&[...document.querySelectorAll('.mod-trust-folder button')].find(e=>e.textContent==='Trust author and enable plugins').click();void 0");
 await wait("!!app.commands.commands['ai-knowledge-hub:veynrel-open-health']");
 await ev("window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.io={reads:0,writes:0,network:0};for(const k of ['read','cachedRead']){const f=app.vault[k].bind(app.vault);app.vault[k]=(...a)=>{io.reads++;return f(...a)}}for(const k of ['create','modify','append','process','delete','rename']){const f=app.vault[k].bind(app.vault);app.vault[k]=(...a)=>{io.writes++;return f(...a)}}window.fetch=()=>{io.network++;throw Error('Network disabled in R06')};XMLHttpRequest.prototype.send=function(){io.network++;throw Error('Network disabled in R06')};app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();void 0");
 await focus();await ev('window.electronWindow.setContentSize(1300,900);void 0');
 report.runtime=await ev("({obsidian:require('@electron/remote').app.getVersion(),electron:process.versions.electron,chromium:process.versions.chrome,frame:window.titlebarStyle,display:process.env.DISPLAY})");
 if(warmCache){const started=performance.now();await wait(`app.vault.getMarkdownFiles().length===${count}&&app.vault.getMarkdownFiles().every(f=>!!app.metadataCache.getFileCache(f))`,main,90000);report.metrics.hostCacheBeforeOpenMs=performance.now()-started;}
 await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health');void 0");await wait("!!document.querySelector('[data-health-action=nav-discover]')");
 await activate('nav-discover');await activate('review-map');
 await ev("window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;window.wb=hv.workbench.map;void 0");
 await pass('Passive map opens with zero Markdown reads/writes and network','io.reads===0&&io.writes===0&&io.network===0');await io('passive');if(!baseline)await pass('Idle map defers full tag projection until explicit load',"wb.zones.active.length===0");await shot('before-load');
 const cacheStarted=performance.now();await wait(`app.vault.getMarkdownFiles().length===${count} && app.vault.getMarkdownFiles().every(f=>!!app.metadataCache.getFileCache(f))`,main,90000);
 await main.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 if(count===120){await main.send('Page.startScreencast',{format:'jpeg',quality:75,maxWidth:1600,maxHeight:1000,everyNthFrame:1});recording=true;}
 await ev("{let started;wb.data.semantic?.subscribe(()=>{const s=wb.data.semantic.getSnapshot();if(s.state==='loading')started??=performance.now();else if(started!==undefined&&!s.busy){window.semanticMs=performance.now()-started;started=undefined;}});}void 0");
 report.metrics.cacheReadyMs=performance.now()-cacheStarted;
 const start=performance.now();await activate('workbench-refresh');await wait('!wb.data.busy');report.metrics.refreshWallMs=performance.now()-start;
 await wait('!wb.pendingRender&&wb.simulation.alpha===0');await metric('loaded');await pass('Rendered nodes intersect the actual canvas viewport',"(()=>{const svg=wb.element.querySelector('svg[data-camera]'),box=svg.getBoundingClientRect();return [...svg.querySelectorAll('[data-path],[data-group]')].some(e=>{const r=e.getBoundingClientRect();return r.right>box.left&&r.left<box.right&&r.bottom>box.top&&r.top<box.bottom;});})()");await io('explicit-refresh');await shot('loaded');
 await pass('Explicit map refresh does not read/write Markdown or request a model','io.reads===0&&io.writes===0&&io.network===0');
 await pass('Every scope path remains represented',`wb.items.flatMap(i=>i.members??[i.path]).length===${count}`);
 if(indexed>500)await pass('Cap refuses all eligible documents, never silently takes first 500',`wb.data.semantic.getSnapshot().reason==='too-large'&&wb.data.semantic.getSnapshot().mappedNoteCount===${indexed}&&!wb.data.semantic.getSnapshot().map`);
 else if(indexed)await pass('Current validated map has the exact indexed count',`wb.data.semantic.getSnapshot().state==='ready'&&wb.data.semantic.getSnapshot().map.nodes.length===${indexed}`);
 else await pass('No index never becomes semantic ready',"wb.data.semantic.getSnapshot().state==='unavailable'");
 await ev('window.coords=JSON.stringify(wb.points);window.layouts=wb.layoutCount;void 0');
 await ev('window.frameTrace=[];window.framePrevious=undefined;window.frameProbe=undefined;window.frameTick=time=>{if(framePrevious!==undefined)frameTrace.push(time-framePrevious);framePrevious=time;if(frameTrace.length<200)frameProbe=requestAnimationFrame(frameTick)};window.frameProbe=requestAnimationFrame(frameTick);void 0');
 const interactions=performance.now();for(let i=0;i<4;i++)await activate('workbench-layer-links');report.metrics.fourLayerTogglesMs=performance.now()-interactions;
 report.metrics.interactionFrameIntervals=await ev('cancelAnimationFrame(frameProbe);frameTrace');
 await pass('Link overlay toggles retain exact coordinates','JSON.stringify(wb.points)===coords&&wb.layoutCount===layouts');
 await activate('workbench-zones');const visibleTag=await ev('wb.zones.active[0]');if(visibleTag)await activate('zone-toggle-'+encodeURIComponent(visibleTag));await activate('workbench-zones-close');await pass('Tag overlay toggle retains exact coordinates','JSON.stringify(wb.points)===coords&&wb.layoutCount===layouts');
 await activate('workbench-map-toggle');await activate('workbench-mode-notes');const searchStart=performance.now();await field('workbench-search','Note 00000');report.metrics.searchMs=performance.now()-searchStart;
 await pass('Exact file search works without recomputation',"!!document.querySelector('[data-workbench-path=\"Databases/Note 00000.md\"]')&&JSON.stringify(wb.points)===coords&&wb.layoutCount===layouts");await shot('list-search');
 await field('workbench-search','');
 if(count>500){
  await ev('window.groupOverview=JSON.stringify(wb.graph.viewport);wb.element.querySelector("[data-group]").focus();void 0');await key('Enter','Enter',13,'\r');
  await wait('!!wb.groupPaths&&!wb.pendingRender');
  await pass('Display group opens actual note nodes in the viewport',"(()=>{const svg=wb.element.querySelector('svg[data-camera]'),box=svg.getBoundingClientRect();return [...svg.querySelectorAll('[data-path]')].some(e=>{const r=e.getBoundingClientRect();return r.right>box.left&&r.left<box.right&&r.bottom>box.top&&r.top<box.bottom;});})()");
  const selectedAt=performance.now();await ev('wb.element.querySelector("[data-path]").focus();void 0');await key('Enter','Enter',13,'\r');await wait('!!wb.note');report.metrics.selectionMs=performance.now()-selectedAt;
  await metric('selected-large-note');await shot('selected-large-note');
  await activate('workbench-clear-selection');await activate('workbench-groups-back');
  await pass('Display group back restores exact overview camera','JSON.stringify(wb.graph.viewport)===groupOverview');
 }
 if(count===120){
  await field('workbench-search','Databases');await activate('workbench-zones');await ev("document.querySelector('[data-health-action=\"filter-topic%2Fdatabases\"]').focus();void 0");await key(' ','Space',32,' ');await activate('workbench-zones-close');
  await activate('workbench-note-Databases%2FNote%2000000.md');
  await ev("{const e=document.querySelector('[data-health-action=workbench-second]');e.value='Databases/Note 00001.md';e.dispatchEvent(new Event('change'));}void 0");
  await activate('workbench-zoom-in');await ev('window.camera=JSON.stringify(wb.graph.viewport);window.selection=JSON.stringify(wb.selected);window.queryContext=JSON.stringify([wb.query,wb.zones.filter]);void 0');
  await shot('pair');await activate('workbench-compare');await wait("!!document.querySelector('[data-pair-heading]')");await shot('pair-inspector');await pass('Pair Inspector does not call a model or write','io.network===0&&io.writes===0');
  await activate('workbench-back');await pass('Pair back keeps exact camera, selection and coordinates','JSON.stringify(wb.graph.viewport)===camera&&JSON.stringify(wb.selected)===selection&&JSON.stringify(wb.points)===coords');
  await ev('window.oldMap=wb;window.savedTicks=wb.simulation.ticks;void 0');await activate('review-back');await pause(250);report.observations.hiddenTicks=await ev('wb.simulation.ticks-savedTicks');
  await activate('review-map');await ev('window.wb=hv.workbench.map;void 0');
  report.observations.contextRetained=await ev('wb===oldMap&&JSON.stringify(wb.graph.viewport)===camera&&JSON.stringify(wb.selected)===selection&&JSON.stringify([wb.query,wb.zones.filter])===queryContext');
  if(!baseline){assert(report.observations.contextRetained,'Map retains owner/camera/selection on back');report.checks.push('Map back/reopen retains owner/camera/selection');assert.equal(report.observations.hiddenTicks,0);}
  // Reload explicitly for the old baseline whose Back disposed its semantic owner.
  if(baseline){await activate('workbench-refresh');await wait('!wb.data.busy&&!wb.pendingRender&&wb.simulation.alpha===0');}
  await ev('window.beforeTopology=JSON.stringify(wb.points);window.beforeLayouts=wb.layoutCount;void 0');await ev('hv.topology.refresh()');await wait('!wb.pendingRender&&wb.simulation.alpha===0');
  report.observations.topologyChangedCoordinates=await ev('JSON.stringify(wb.points)!==beforeTopology');report.observations.topologyLayouts=await ev('wb.layoutCount-beforeLayouts');
  if(!baseline){assert(!report.observations.topologyChangedCoordinates);assert.equal(report.observations.topologyLayouts,0);report.checks.push('Topology refresh never changes semantic coordinates');}
  const rules=await ev('!!wb.data.dependencies.rules');report.observations.graphicalRules=rules;
  if(!baseline&&indexed){assert(rules);await ev("wb.data.dependencies.rules.add('within',{kind:'tag',value:'kind/task'})");await activate('workbench-refresh');await wait('!wb.data.busy&&!wb.pendingRender&&wb.simulation.alpha===0');
    await pass('Map honors the shared exclusion policy',"wb.data.semantic.getSnapshot().selection.excludedPairCount>=1&&!wb.data.semantic.getSnapshot().map.edges.some(e=>e.left==='Databases/Note 00000.md'&&e.right==='Databases/Note 00001.md')");
    await activate('review-back');await activate('review-connections');await activate('review-refresh');await wait('!hv.workbench.data.busy');
    await pass('List and map capture identical exclusion counts',"hv.workbench.data.semantic.getSnapshot().selection.excludedPairCount===wb.data.semantic.getSnapshot().selection.excludedPairCount");await activate('review-map');
  }
  for(const language of ['en','ru']){
    await ev('app.setting.open();app.setting.openTabById("ai-knowledge-hub");void 0');
    await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'));}void 0`);await ev('plugin.settingsSave');await ev('app.setting.close();hv.render();void 0');await focus();
    // R03 locale change returns to list; reopening must restore the map instance in R06.1.
    if(!await ev("!!document.querySelector('[data-health-action=workbench-refresh]')"))await activate('review-map');await ev('window.wb=hv.workbench.map;void 0');
    for(const theme of ['light','dark']){
      await ev(`app.changeTheme('${theme==='light'?'moonstone':'obsidian'}');void 0`);await wait(`document.body.classList.contains('theme-${theme}')`);
      await main.send('Emulation.setDeviceMetricsOverride',{width:390,height:850,deviceScaleFactor:1,mobile:false});
      await pass(`${language}/${theme} 390px has no horizontal overflow`,"hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1");await shot(`map-${language}-${theme}-390`);
    }
  }
  await main.send('Emulation.clearDeviceMetricsOverride');await ev('window.electronWindow.setContentSize(1100,800);void 0');await wait('innerWidth===1100');await focus();
  await ev("window.split=app.workspace.getLeaf('split');split.openFile(app.vault.getFileByPath('Databases/Note 00000.md'),{state:{mode:'preview'}})");await pass('Real split uses the main ownerDocument','split.view.containerEl.ownerDocument===document');await shot('split');await ev('split.detach();void 0');
  await ev("window.pop=app.workspace.getLeaf('window');pop.openFile(app.vault.getFileByPath('Databases/Note 00001.md'),{state:{mode:'preview'}})");await wait('pop.view.containerEl.ownerDocument!==document');
  let popTarget;for(let i=0;i<100;i++){popTarget=(await(await fetch(`${endpoint}/json/list`)).json()).find(t=>t.type==='page'&&t.id!==main.id);if(popTarget)break;await pause(50);}assert(popTarget);
  const pop=await connection(popTarget);await focus(pop);await pass('Real Native-frame popout receives focus',"document.hasFocus()&&!window.frameDom&&window.titlebarStyle==='native'",pop);await shot('popout',pop);await focus();await pass('Focus returns to main','document.hasFocus()');await ev('pop.detach();void 0');
  await stopVideo();
 }
 await metric('final');await io('final');
 assert.equal(report.exceptions.length,0,'Unfiltered exceptions');assert.equal(await ev('io.network'),0);assert.equal(await ev('io.writes'),0);
 assert.deepEqual(Object.fromEntries(fixture.notes.map(n=>[n.path,sha(fs.readFileSync(`${vault}/${n.path}`))])),original);report.checks.push('Every synthetic Markdown file byte-identical');
 report.markdownManifestSha256=sha(JSON.stringify(original));report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error.stack??error);process.exitCode=1;try{if(main){report.failureState=await ev('({markdown:app.vault.getMarkdownFiles().length,cacheKnown:app.vault.getMarkdownFiles().filter(f=>!!app.metadataCache.getFileCache(f)).length,io})');await shot('failure');}await stopVideo();}catch(e){report.captureError=String(e);}}
finally{fs.writeFileSync(`${root}/report.json`,JSON.stringify(report,null,2)+'\n');for(const c of connections)c.socket.close();if(child.exitCode===null&&child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),3000);await exited;clearTimeout(timer);}console.log(JSON.stringify({root,status:report.status,checks:report.checks.length,error:report.error}));}
