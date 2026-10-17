// Synthetic-only native acceptance; no provider calls. npm run build, then:
// node scripts/pair-inspector-native.mjs /tmp/pair-inspector-<fresh-name>
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(ROOT + '/package.json');
const { build } = require('esbuild');
const root = process.argv[2];
assert(root?.startsWith('/tmp/pair-inspector-') && !root.includes('..') && !fs.existsSync(root));
const vault = root + '/vault', dir = vault + '/.obsidian/plugins/ai-knowledge-hub';
fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(root + '/profile', { recursive: true });
await build({ absWorkingDir: ROOT, entryPoints: ['scripts/global-semantic-map-fixture.ts'], bundle: true,
  plugins: [{ name: 'synthetic-host', setup(b) { b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const getLanguage=()=>"en";'})); } }], platform:'node',format:'cjs',outfile:root+'/fixture.cjs' });
const fixture = await require(root+'/fixture.cjs').semanticGlobalMapFixture(2, 3);
const [a,b] = fixture.paths;
fs.mkdirSync(dir+'/semantic-index');
for(const [path,value] of fixture.files) fs.writeFileSync(dir+'/semantic-index/'+path.split('/').pop(),typeof value==='string'?value:Buffer.from(value));
for(const path of fixture.paths) fs.mkdirSync(vault+'/'+path.slice(0,path.lastIndexOf('/')),{recursive:true});
const sourceA = '---\ntags: [front, nesting/tag]\nrelated: "[['+b.replace(/\.md$/,'')+']]"\n---\n# Own heading\nOwn text #inline\n![[ '+b+' ]]\n[['+b+']]\n<img src="https://invalid.test/tracker">';
// Use an ordinary embed that native MetadataCache resolves.
fs.writeFileSync(vault+'/'+a,sourceA.replace('![[ '+b+' ]]','![['+b+']]'));
fs.writeFileSync(vault+'/'+b,'# Embedded note\nB ONLY CONTENT.\n');
const settings = { language:'en',apiKey:'',semanticAutoSyncSuspended:true,
  semantic:{enabled:true,embeddingProvider:'ollama',embeddingModel:'global-map-synthetic',embeddingBaseUrl:'http://127.0.0.1:11434',openRouterApiKey:'',openAICompatibleApiKey:''},
  decisions:{enabled:false,apiKey:''},companion:{enabled:false},health:{profile:'mixed',profileChosen:true,onboardingCompleted:true} };
fs.writeFileSync(dir+'/data.json',JSON.stringify(settings));
fs.writeFileSync(vault+'/.obsidian/community-plugins.json','["ai-knowledge-hub"]');
fs.writeFileSync(vault+'/.obsidian/app.json','{"checkForUpdates":false}');
fs.writeFileSync(root+'/profile/obsidian.json',JSON.stringify({vaults:{pair:{path:vault,ts:Date.now(),open:true}}}));
for(const name of ['main.js','styles.css','manifest.json'])fs.copyFileSync(ROOT+'/'+name,dir+'/'+name);
const start=()=>spawn('/usr/bin/electron43',['/usr/lib/obsidian/app.asar','--user-data-dir='+root+'/profile','--remote-debugging-port=9274','--disable-gpu','--ozone-platform=x11'],{stdio:['ignore','ignore',fs.openSync(root+'/electron.log','a')]});
let child=start();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let socket,id=0;const pending=new Map(),checks=[];
const report={checks,fixture:'Two deterministic synthetic vectors via existing fixture, actual Discover/discovery engine and current saved files',limits:'Native network counters cover fetch/XHR and Decisions/Rerank factories. No requestUrl instrumentation. Linux desktop only. No physical mobile, other OS, screen reader, custom theme or paid provider tests.'};
try {
 let page;for(let i=0;i<150;i++){try{page=(await (await fetch('http://127.0.0.1:9274/json/list')).json()).find(x=>x.url.startsWith('app://obsidian.md/'));}catch{}if(page)break;await pause(100);}assert(page,'native ready');
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<180;i++){if(await ev(expression))return;await pause(50);}throw Error('timeout: '+expression+' '+JSON.stringify(await ev("({states:[...document.querySelectorAll('.ai-semantic-search-status,.ai-pair-inspector [role=status]')].map(e=>e.textContent),buttons:document.querySelectorAll('.ai-semantic-duplicate-card button').length,modals:document.querySelectorAll('.modal').length,semantic:window.engine?.getSemanticStatus().kind,language:window.plugin?.settings.language,titles:[...document.querySelectorAll('.modal')].map(e=>e.className),notices:[...document.querySelectorAll('.notice')].map(e=>e.textContent)})")));};
 const pass=async(name,expr)=>{assert(await ev(expr),name);checks.push(name);console.log(name);};
 const focusMain=async()=>{for(let i=0;i<40;i++){await cdp('Page.bringToFront');await pause(50);if(await ev('activeWindow===window'))return;}throw Error('Native main window did not receive focus');};
 await wait('!!window.app?.workspace?.layoutReady');
 assert.equal(await ev('app.vault.adapter.basePath'),vault);
 // Accept the native trust dialog only for this freshly generated, synthetic vault.
 await wait("!!document.querySelector('.mod-trust-folder')");
 await ev("[...document.querySelectorAll('.mod-trust-folder button')].find(e=>e.textContent==='Trust author and enable plugins').click()");
 await wait("!document.querySelector('.mod-trust-folder')");
 await wait("!!app.plugins.plugins['ai-knowledge-hub']?.semanticController");
 // Native trust/settings can leave their popout as activeWindow.
 await focusMain();
 await ev(`window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.engine=plugin.semanticController;window.io={read:[],write:0,network:0};
  window.originalRead=app.vault.read.bind(app.vault);app.vault.read=async f=>{io.read.push(f.path);return originalRead(f)};
  for(const key of ['modify','create','delete','append','process']){const original=app.vault[key].bind(app.vault);app.vault[key]=(...args)=>{io.write++;return original(...args)}};
  window.fetch=()=>{io.network++;throw Error('network blocked in fixture')};XMLHttpRequest.prototype.send=function(){io.network++;throw Error('network blocked in fixture')};
  engine.decisionsProvider=()=>{io.network++;throw Error('provider blocked')};engine.rerankProvider=()=>{io.network++;throw Error('provider blocked')};void 0`);
 await ev('engine.refreshSemanticStatus()');
 await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health')");
 await wait("!!app.workspace.getLeavesOfType('veynrel-health')[0]?.view.contentEl.querySelector('[data-health-action=nav-discover]')");
 await ev("window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;hv.contentEl.querySelector('[data-health-action=nav-discover]').click()");
 await wait("!!hv.contentEl.querySelector('[data-health-action=discover-duplicates]')&&!hv.contentEl.querySelector('[data-health-action=discover-duplicates]').disabled");
 await ev("hv.contentEl.querySelector('[data-health-action=discover-duplicates]').click()");
 await wait("document.querySelectorAll('.ai-semantic-duplicate-card button').length===2");
 await pass('Discover and actual duplicate list read no Markdown and call no providers', 'io.read.length===0&&io.network===0&&io.write===0');
 await ev("document.querySelectorAll('.ai-semantic-duplicate-card button')[1].click()");
 await wait("document.querySelectorAll('.ai-pair-source').length===2");
 await pass('Decisions disabled with empty key; both exact saved paths read',`!plugin.settings.decisions.enabled&&plugin.settings.decisions.apiKey===''&&JSON.stringify(io.read.sort())===JSON.stringify(${JSON.stringify(fixture.paths.slice().sort())})`);
 await pass('Source never expands embeds or HTML',"!document.querySelector('.ai-pair-source').textContent.includes('B ONLY CONTENT')&&document.querySelector('.ai-pair-source').textContent.includes('![[')&&!document.querySelector('.ai-pair-inspector img')");
 await pass('Native inline/frontmatter tags and incoming links appear',`document.querySelector('.ai-pair-inspector').textContent.includes('#front')&&document.querySelector('.ai-pair-inspector').textContent.includes('#inline')&&[...document.querySelectorAll('.ai-pair-note details')].some(e=>e.textContent.includes('Known incoming')&&e.textContent.includes(${JSON.stringify(a)}))`);
 const close=()=>ev("document.querySelector('.ai-pair-inspector').closest('.modal').querySelector('.modal-close-button,.modal-header-button').click()");
 const refresh=()=>ev("document.querySelector('.ai-pair-inspector button').click()");
 for(const language of ['en','ru']){
   if(language==='ru'){
     await close();await ev("document.querySelector('.ai-semantic-discovery-modal').closest('.modal').querySelector('.modal-close-button,.modal-header-button').click()");
     await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
     await ev("{const s=[...app.setting.modalEl.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='ru'));s.value='ru';s.dispatchEvent(new Event('change'));}void 0");
     await ev('plugin.settingsSave');
     // Native settings update rerenders asynchronously; close after that update settles.
     await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
     await ev('app.setting.close();void 0');
     await focusMain();
     await wait("!document.querySelector('.modal')");
     // Locale rendering uses the same explicit controller action; Discover was exercised above.
     await ev(`engine.inspectPair({leftPath:${JSON.stringify(a)},rightPath:${JSON.stringify(b)}})`);
     await wait("document.querySelectorAll('.ai-pair-source').length===2");
   }
   for(const theme of ['theme-light','theme-dark'])for(const width of [1200,390]){
     await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
     await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}')`);
     await pause(100);
     await pass(language+' '+theme+' '+width+' no horizontal overflow',"[...document.querySelectorAll('.ai-pair-inspector,.ai-pair-note,.ai-pair-source')].every(e=>e.scrollWidth<=e.clientWidth+1)");
     const {data}=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(root+'/'+language+'-'+theme+'-'+width+'.png',Buffer.from(data,'base64'));
   }
 }
 if (process.argv.includes('--relationships')) {
   const { relationshipScenario } = await import('./relationship-analyzer-native.mjs');
   report.relationships = await relationshipScenario({ ev, wait, cdp, close, focusMain, root, vault, paths: [a, b], ROOT });
 }
 if (process.argv.includes('--taxonomy')) {
   const { taxonomyScenario } = await import('./tag-taxonomy-native.mjs');
   report.taxonomy = await taxonomyScenario({ ev, wait, cdp, close, focusMain, root, vault, paths: [a, b] });
 }
 if (process.argv.includes('--tag-recommendations')) {
   const { tagRecommendationScenario } = await import('./tag-recommendations-native.mjs');
   report.tagRecommendations = await tagRecommendationScenario({ ev, wait, cdp, close, focusMain, root, vault, paths: [a, b], ROOT });
 }
 if (process.argv.includes('--change-planner')) {
   const { changePlannerScenario } = await import('./change-planner-native.mjs');
   report.changePlanner = await changePlannerScenario({ ev, wait, cdp, close, focusMain, root, vault, paths: [a, b], ROOT });
 }
 await ev("document.querySelectorAll('.ai-pair-note button')[1].click()");
 await wait('app.workspace.getActiveFile()?.path==='+JSON.stringify(b));checks.push('Open source note selects the exact second path');
 await pass('Inspector performs zero network requests and Markdown writes','io.network===0&&io.write===0');
 await close();await ev("engine.inspectPair({leftPath:"+JSON.stringify(a)+",rightPath:"+JSON.stringify(b)+"})");await wait("document.querySelectorAll('.ai-pair-source').length===2");
 await ev(`window.pairCache={changed:false,resolved:false};pairCache.change=app.metadataCache.on('changed',(file,data)=>{if(file.path===${JSON.stringify(b)}&&data==='UPDATED SAVED TEXT')pairCache.changed=true});pairCache.resolve=app.metadataCache.on('resolved',()=>{if(pairCache.changed)pairCache.resolved=true});void 0`);
 fs.writeFileSync(vault+'/'+b,'UPDATED SAVED TEXT');await wait("document.querySelector('.ai-pair-inspector [role=status]').dataset.state==='stale'&&pairCache.resolved");
 await ev('app.metadataCache.offref(pairCache.change);app.metadataCache.offref(pairCache.resolve);void 0');
 await refresh();await wait("[...document.querySelectorAll('.ai-pair-source')].some(e=>e.textContent==='UPDATED SAVED TEXT')");checks.push('External change marks stale; refresh reads current saved file');
 await ev(`window.pairDeleted=false;window.pairDeleteRef=app.metadataCache.on('resolved',()=>{if(!app.vault.getFileByPath(${JSON.stringify(b)}))pairDeleted=true});void 0`);
 fs.unlinkSync(vault+'/'+b);await wait("document.querySelector('.ai-pair-inspector [role=status]').dataset.state==='stale'&&pairDeleted");
 await ev('app.metadataCache.offref(pairDeleteRef);void 0');
 await refresh();await wait("document.querySelectorAll('.ai-pair-source').length===1");checks.push('Deleted note shown independently while the other remains available');
 await pass('No writes or network even after refresh and reopen','io.network===0&&io.write===0');
 await close();
 await ev(`window.nativeRead=app.vault.read;app.vault.read=f=>new Promise(r=>{window.releasePair=()=>nativeRead(f).then(r)});engine.inspectPair({leftPath:${JSON.stringify(a)},rightPath:'missing.md'})`);
 await close();await ev('releasePair();app.vault.read=nativeRead;void 0');await pause(100);
 await pass('Closing during asynchronous read never restores inspector UI',"!document.querySelector('.ai-pair-inspector')");
 if (process.argv.includes('--safe-apply') || process.argv.includes('--journal-recovery') || process.argv.includes('--undo-blockers')) {
   const restart = async () => {
     socket.close();
     const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await exited;
     child=start();
     let page;
     for(let i=0;i<180;i++){try{page=(await(await fetch('http://127.0.0.1:9274/json/list')).json()).find(x=>x.url.startsWith('app://obsidian.md/'));}catch{}if(page)break;await pause(100);}
     assert(page,'restarted native ready');
     socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
     socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
     await wait("!!window.app?.workspace?.layoutReady&&!!app.plugins.plugins['ai-knowledge-hub']?.semanticController");
     await ev("window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.engine=plugin.semanticController;window.io={read:[],write:0,network:0};window.fetch=()=>{io.network++;throw Error('network blocked')};XMLHttpRequest.prototype.send=function(){io.network++;throw Error('network blocked')};void 0");
     await focusMain();
   };
   if(process.argv.includes('--safe-apply') || process.argv.includes('--journal-recovery')) {
     const { safeApplyScenario } = await import('./safe-apply-native.mjs');
     report.safeApply=await safeApplyScenario({ev,wait,cdp,focusMain,root,vault,ROOT,restart});
   }
   if(process.argv.includes('--undo-blockers')) {
     const {undoBlockerScenario}=await import('./journal-recovery-native.mjs');
     report.undoBlockers=await undoBlockerScenario({ev,wait,cdp,focusMain,root,vault,ROOT,restart});
   }
   if(process.argv.includes('--journal-recovery')) {
     const {journalRecoveryScenario}=await import('./journal-recovery-native.mjs');
     report.journalRecovery=await journalRecoveryScenario({ev,wait,cdp,focusMain,root,vault,ROOT,restart});
   }
 }
 report.version=await ev("({electron:process.versions.electron})");report.io=(process.argv.includes('--safe-apply')||process.argv.includes('--journal-recovery')||process.argv.includes('--undo-blockers'))?{network:await ev('io.network'),scope:'Final restarted process only; prior read-only invariants are asserted separately, and Safe Apply disk writes are verified explicitly.'}:await ev('io');report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error);console.error(error);process.exitCode=1;}
finally{fs.writeFileSync(root+'/report.json',JSON.stringify(report,null,2)+'\n');socket?.close();child.kill('SIGTERM');}
