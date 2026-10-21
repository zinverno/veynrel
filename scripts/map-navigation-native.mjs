// Native map navigation on fresh synthetic copies. Artificial vectors; real UI and executor owners.
// VEYNREL_LAB_ROOT=/path/to/synthetic-lab node scripts/map-navigation-native.mjs /tmp/veynrel-workbench-<new-name> 154|500|501|1000 [frozen-build]
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {build as bundle} from 'esbuild';
import {createRequire} from 'node:module';
import {exerciseNavigation} from './map-navigation-scenarios.mjs';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const [root,mode='154',build=ROOT]=process.argv.slice(2);
const sourceCommit=fs.existsSync(build+'/SOURCE_COMMIT')?fs.readFileSync(build+'/SOURCE_COMMIT','utf8').trim():undefined;
assert(root?.startsWith('/tmp/veynrel-workbench-')&&!root.includes('..')&&!fs.existsSync(root));
assert(['154','500','501','1000'].includes(mode));
const vault=root+'/vault',dir=vault+'/.obsidian/plugins/ai-knowledge-hub';
fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(root+'/profile');
const sha=b=>createHash('sha256').update(b).digest('hex');
const markdown=base=>Object.fromEntries(fs.readdirSync(base,{recursive:true}).filter(p=>p.endsWith('.md')&&fs.statSync(base+'/'+p).isFile()).sort().map(p=>[p,sha(fs.readFileSync(base+'/'+p))]));
const lab=process.env.VEYNREL_LAB_ROOT;assert(lab&&fs.existsSync(lab),'Set VEYNREL_LAB_ROOT to the existing synthetic Lab');const sourceBefore=markdown(lab);
assert.equal(Object.keys(sourceBefore).length,1000);
const pairPaths=['Workbench/A/Cache.md','Workbench/B/Cache.md'];
const copied=Object.keys(sourceBefore).slice(0,Number(mode)-2);
for(const p of copied){fs.mkdirSync(vault+'/'+p.split('/').slice(0,-1).join('/'),{recursive:true});fs.copyFileSync(lab+'/'+p,vault+'/'+p);}
const fixture=JSON.parse(fs.readFileSync(ROOT+'/tests/fixtures/change-planner.json','utf8'));
for(const [i,p]of pairPaths.entries()){fs.mkdirSync(vault+'/'+p.split('/').slice(0,-1).join('/'),{recursive:true});fs.writeFileSync(vault+'/'+p,i===0?fixture.a:fixture.b);}
// Synthetic link inside the copied fixture; never change the Lab source.
fs.appendFileSync(vault+'/'+copied[0],'\n\n[[Workbench/A/Cache]]\n');
// Synthetic tag overlays only in the fresh copy; all pre-existing Lab files remain untouched.
const fixtureTags=['topic/sql','role/theory','difficulty/advanced'];
for(const [i,p] of [...pairPaths,...copied].entries()) {
 const tags=i===0?fixtureTags:i===1?['role/theory','role/practice','topic/sql']:i%7===0?fixtureTags:i%3===0?['topic/sql','role/theory']:i%3===1?['topic/sql','difficulty/advanced']:['role/theory','difficulty/advanced'];
 if(i===2)tags.push(...Array.from({length:12},(_,n)=>`facet${n}/example`));
 fs.appendFileSync(vault+'/'+p,'\n\n'+tags.map(t=>'#'+t).join(' ')+'\n');
}
const indexPaths=[...pairPaths,...copied];
await bundle({absWorkingDir:ROOT,entryPoints:['scripts/knowledge-workbench-fixture.ts'],bundle:true,platform:'node',format:'cjs',outfile:root+'/fixture.cjs',
 plugins:[{name:'fixture-host',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const getLanguage=()=>"en";'}));}}]});
{
 const files=await createRequire(import.meta.url)(root+'/fixture.cjs').workbenchFixture(indexPaths);
 fs.mkdirSync(dir+'/semantic-index');
 for(const [p,v]of files)fs.writeFileSync(dir+'/semantic-index/'+p.split('/').pop(),typeof v==='string'?v:Buffer.from(v));
}
for(const name of ['main.js','styles.css','manifest.json'])fs.copyFileSync(build+'/'+name,dir+'/'+name);
fs.writeFileSync(dir+'/data.json',JSON.stringify({language:'ru',apiKey:'',semanticAutoSyncSuspended:true,semantic:{enabled:true,embeddingProvider:'ollama',embeddingModel:'global-map-synthetic',embeddingBaseUrl:'http://127.0.0.1:11434',openRouterApiKey:'',openAICompatibleApiKey:''},decisions:{enabled:false,apiKey:''},companion:{enabled:false},health:{profile:'mixed',profileChosen:true,onboardingCompleted:true}}));
fs.writeFileSync(vault+'/.obsidian/community-plugins.json','["ai-knowledge-hub"]');
fs.writeFileSync(vault+'/.obsidian/app.json','{"checkForUpdates":false}');
let theme;
if(process.env.VEYNREL_THEME_DIR){
 const path=process.env.VEYNREL_THEME_DIR,manifest=JSON.parse(fs.readFileSync(path+'/manifest.json','utf8'));
 assert(typeof manifest.name==='string'&&!manifest.name.includes('/')&&!manifest.name.includes('..'));
 const css=fs.readFileSync(path+'/theme.css','utf8');assert(!/@import|url\(\s*["']?https?:/i.test(css),'Acceptance theme must be local/offline');
 const target=vault+'/.obsidian/themes/'+manifest.name;fs.mkdirSync(target,{recursive:true});
 fs.copyFileSync(path+'/theme.css',target+'/theme.css');fs.copyFileSync(path+'/manifest.json',target+'/manifest.json');
 fs.writeFileSync(vault+'/.obsidian/appearance.json',JSON.stringify({cssTheme:manifest.name,theme:'obsidian'}));
 theme={name:manifest.name,version:manifest.version,cssHash:sha(css),probe:css.slice(0,120)};
}

fs.writeFileSync(root+'/profile/obsidian.json',JSON.stringify({updateDisabled:true,vaults:{stage1:{path:vault,ts:Date.now(),open:true}}}));
const before=markdown(vault),checks=[],metrics={},screenshots=[];fs.writeFileSync(root+'/before.json',JSON.stringify(before,null,2));
const child=spawn('/usr/bin/electron43',['/usr/lib/obsidian/app.asar','--user-data-dir='+root+'/profile','--remote-debugging-port=9392','--disable-gpu','--ozone-platform=x11'],{stdio:['ignore','ignore',fs.openSync(root+'/electron.log','a')]});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let socket,onFrame,id=0;const pending=new Map();
try{
 let page;for(let i=0;i<150;i++){try{page=(await(await fetch('http://127.0.0.1:9392/json/list')).json()).find(p=>p.url.startsWith('app://obsidian.md/'));}catch{}if(page)break;await pause(100);}assert(page,'Obsidian ready');
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j});
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Page.screencastFrame')onFrame?.(m.params);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}};
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
 const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert(!r.exceptionDetails,expression+' '+JSON.stringify(r.exceptionDetails));return r.result.value};
 const wait=async expression=>{for(let i=0;i<160;i++){if(await ev(expression))return;await pause(70);}throw Error('Timeout '+expression)};
 const pass=async(name,expression)=>{assert(await ev(expression),name);checks.push(name);console.log(name)};
 const click=key=>clickSelector(`[data-health-action="${key}"]`);
 const settle=()=>ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 await wait('!!window.app?.workspace?.layoutReady');assert.equal(await ev('app.vault.adapter.basePath'),vault);
 if(theme)await pass('Configured local theme CSS is loaded in synthetic vault',`[...document.querySelectorAll('style')].some(s=>s.textContent.includes(${JSON.stringify(theme.probe)}))`);
 await wait("!!document.querySelector('.mod-trust-folder')||!!app.plugins.plugins['ai-knowledge-hub']");
 await ev("document.querySelector('.mod-trust-folder')&&[...document.querySelectorAll('.mod-trust-folder button')].find(e=>e.textContent==='Trust author and enable plugins').click();void 0");
 await wait("!!app.commands.commands['ai-knowledge-hub:veynrel-open-health']");
 await ev(`window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.engine=plugin.semanticController;window.io={reads:0,writes:0,network:0,enumerations:0};
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
 const shot=async name=>{await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2});await pause(150);await settle();const data=await cdp('Page.captureScreenshot',{format:'png'});const file=name+'.png';fs.writeFileSync(root+'/'+file,Buffer.from(data.data,'base64'));screenshots.push(file);};
 const locale=async language=>{
   await ev('app.setting.open();app.setting.openTabById("ai-knowledge-hub");void 0');
   await wait("!![...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'))");
   await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'))}void 0`);
   await ev('plugin.settingsSave');await settle();await ev('app.setting.close();hv.render();void 0');await cdp('Page.bringToFront');
 };


 await cdp('Emulation.setDeviceMetricsOverride',{width:1694,height:1080,deviceScaleFactor:1,mobile:false});
 await cdp('Page.bringToFront');
 const field=async(selector,value,event='change')=>ev(`{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('${event}',{bubbles:true}));}void 0`);
 const clickSelector=async selector=>{
  const rect=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing or disabled control');e.scrollIntoView({block:'center'});return e.getBoundingClientRect().toJSON()})()`);
  assert(rect.width>0&&rect.height>0,selector+' is visible');
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x+rect.width/2,y:rect.y+rect.height/2,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x+rect.width/2,y:rect.y+rect.height/2,button:'left',clickCount:1});await settle();if(onFrame)await pause(450);
 };
 const closeModals=async()=>{for(let i=0;i<8&&await ev('!!document.querySelector(".modal-close-button,.modal-header-button")');i++){
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});await settle();
 }};
 const frames=[];
 const startVideo=async()=>{fs.mkdirSync(root+'/frames');onFrame=p=>{const file=`frames/${String(frames.length).padStart(5,'0')}.jpg`;fs.writeFileSync(root+'/'+file,Buffer.from(p.data,'base64'));frames.push({file,time:Date.now()});void cdp('Page.screencastFrameAck',{sessionId:p.sessionId})};await cdp('Page.startScreencast',{format:'jpeg',quality:70,maxWidth:1694,maxHeight:1080,everyNthFrame:1});};
 const stopVideo=async()=>{await cdp('Page.stopScreencast');onFrame=undefined;assert(frames.length>10);fs.writeFileSync(root+'/frames.txt',frames.map((f,i)=>`file '${f.file}'\nduration ${Math.max(.1,Math.min(2,((frames[i+1]?.time??f.time+500)-f.time)/1000))}`).join('\n')+'\n');execFileSync('ffmpeg',['-y','-loglevel','error','-f','concat','-safe','0','-i',root+'/frames.txt','-vf','fps=10,scale=1280:-2','-c:v','libx264','-threads','2','-crf','24','-pix_fmt','yuv420p',root+'/map-navigation.mp4']);};
 const captureLayout=async route=>{
  await click('nav-'+route);await settle();
  const measure=await ev(`(()=>{const v=hv.contentEl,s=v.querySelector('.veynrel-shell'),side=v.querySelector('.veynrel-sidebar');return {view:v.getBoundingClientRect().toJSON(),shell:s.getBoundingClientRect().toJSON(),overflow:v.scrollWidth-v.clientWidth,scrollOwner:getComputedStyle(v).overflowY,sidebarHeight:side.getBoundingClientRect().height,groups:[...v.querySelectorAll('.veynrel-tools-group')].map(e=>e.getBoundingClientRect().toJSON())}})()`);
  assert(measure.shell.height>=measure.view.height-1,route+' fills panel');assert(measure.overflow<=1,route+' fits');metrics[route]=measure;await shot(route);
  if(route==='tools'){await ev('hv.contentEl.scrollTop=hv.contentEl.scrollHeight;void 0');await shot('tools-bottom');await ev('hv.contentEl.scrollTop=0;void 0');}
 };
 for(const route of ['process','tools','health'])await captureLayout(route);
 await click('nav-discover');await wait("!!hv.contentEl.querySelector('[data-health-action=workbench-refresh]')");
 await pass('Workbench opening is passive','io.reads===0&&io.writes===0&&io.network===0');
 await wait('app.vault.getMarkdownFiles().every(f=>!!app.metadataCache.getFileCache(f))');
 await click('workbench-refresh');await wait('!hv.workbench.data.busy');
 if(await ev("hv.topology.getSnapshot().state==='stale'")){await click('workbench-refresh');await wait('!hv.workbench.data.busy')}
 fs.writeFileSync(root+'/source-status.json',JSON.stringify(await ev('({index:engine.getCachedIndexState(),semantic:hv.workbench.data.semantic.getSnapshot(),topology:hv.topology.getSnapshot().state,comparison:hv.workbench.data.comparison.getSnapshot().state})'),null,2));
 await pass('Explicit local refresh does not read Markdown, embed, call a model or write','io.reads===0&&io.writes===0&&io.network===0');
 await exerciseNavigation({ev,cdp,click,clickSelector,field,wait,pass,shot,closeModals,pause,settle,locale,root,vault,before,markdown,pairPaths,fixture,checks,metrics,page,socket,pending,nextId:()=>++id,startVideo,stopVideo,mode});
 assert.deepEqual(markdown(vault),before);assert.deepEqual(markdown(lab),sourceBefore);await pass('No network during any scenario','io.network===0');
 fs.writeFileSync(root+'/after.json',JSON.stringify(markdown(vault),null,2));
 fs.writeFileSync(root+'/report.json',JSON.stringify({status:'PASS',mode,theme:theme?{name:theme.name,version:theme.version,cssHash:theme.cssHash}:'built-in',checks,metrics,screenshots,sourceCommit,hashes:Object.fromEntries(['main.js','manifest.json','styles.css'].map(p=>[p,sha(fs.readFileSync(dir+'/'+p))])),io:await ev('io')},null,2));
 console.log(JSON.stringify({status:'PASS',checks:checks.length,root}));
} catch(error){
 fs.writeFileSync(root+'/failure.txt',String(error.stack));if(socket?.readyState===1){try{const p=++id;const shot=await new Promise((resolve,reject)=>{pending.set(p,{resolve,reject});socket.send(JSON.stringify({id:p,method:'Page.captureScreenshot',params:{format:'png'}}))});fs.writeFileSync(root+'/failure.png',Buffer.from(shot.data,'base64'));}catch{}}
 throw error;
} finally {socket?.close();child.kill('SIGTERM');}
