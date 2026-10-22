// Owned 1000-note synthetic vault only. No live provider, no sandbox weakening.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {sha,walk} from './acceptance-lab/generate.mjs';
const ROOT=fileURLToPath(new URL('..',import.meta.url));
const {values:v}=parseArgs({options:{vault:{type:'string'},manifest:{type:'string'},build:{type:'string'},output:{type:'string'},port:{type:'string',default:'9286'},suite:{type:'string',default:'ui'}}});
assert(v.vault&&v.manifest&&v.build&&v.output,'vault, manifest, build and output are required');
assert(['ui','actions','all'].includes(v.suite));assert(/^\d+$/.test(v.port)&&Number(v.port)>=1024&&Number(v.port)<=65535);
const vault=fs.realpathSync(v.vault),root=path.resolve(v.output),build=fs.realpathSync(v.build),manifest=JSON.parse(fs.readFileSync(v.manifest,'utf8'));
assert.equal(path.basename(vault),'Veynrel Lab 1000');assert.equal(manifest.schema,'veynrel.acceptance-lab.v2');assert.equal(manifest.notes.length,1000);
assert(!fs.existsSync(root),'Output must be new');assert(root.startsWith('/tmp/veynrel-lab-native-'));
assert.equal(walk(vault).length,1000);for(const n of manifest.notes)assert.equal(sha(fs.readFileSync(path.join(vault,n.path))),n.sha256,'Manifest preflight: '+n.path);
const artifact=JSON.parse(fs.readFileSync(build+'/build.json','utf8'));for(const n of ['main.js','styles.css','manifest.json'])assert.equal(sha(fs.readFileSync(build+'/'+n)),artifact.sha256[n]);
assert.equal(JSON.parse(fs.readFileSync(build+'/manifest.json','utf8')).id,'ai-knowledge-hub');
await new Promise((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(Number(v.port),'127.0.0.1',()=>server.close(resolve));});
fs.mkdirSync(root,{mode:0o700});const dir=vault+'/.obsidian/plugins/ai-knowledge-hub';
if(fs.existsSync(dir)){assert(fs.existsSync(dir+'/lab-install.json'),'Refuse an unknown existing plugin installation');assert.equal(JSON.parse(fs.readFileSync(dir+'/lab-install.json')).corpus,manifest.corpusSha256);}
fs.mkdirSync(dir,{recursive:true});for(const n of ['main.js','styles.css','manifest.json'])fs.copyFileSync(build+'/'+n,dir+'/'+n);
fs.writeFileSync(dir+'/lab-install.json',JSON.stringify({corpus:manifest.corpusSha256,artifact}));
const settings={language:'en',apiKey:'',semanticAutoSyncSuspended:true,semantic:{enabled:true,embeddingProvider:'ollama',embeddingModel:'global-map-synthetic',embeddingBaseUrl:'http://127.0.0.1:11434',openRouterApiKey:'',openAICompatibleApiKey:''},decisions:{enabled:false,apiKey:''},companion:{enabled:false},health:{profile:'mixed',profileChosen:true,onboardingCompleted:true}};
fs.writeFileSync(dir+'/data.json',JSON.stringify(settings));fs.writeFileSync(vault+'/.obsidian/community-plugins.json','["ai-knowledge-hub"]');fs.writeFileSync(vault+'/.obsidian/app.json','{"checkForUpdates":false}');
const require=createRequire(ROOT+'/package.json'),{build:bundle}=require('esbuild');
await bundle({absWorkingDir:ROOT,entryPoints:['scripts/acceptance-lab/index-fixture.ts'],bundle:true,plugins:[{name:'synthetic-host',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const getLanguage=()=>"en";'}));}}],platform:'node',format:'cjs',outfile:root+'/index.cjs'});
const paths=manifest.notes.filter(n=>n.form==='long').slice(0,2).map(n=>n.path);
const index=await require(root+'/index.cjs').labIndex(paths,paths.map(p=>fs.readFileSync(vault+'/'+p,'utf8')));
fs.mkdirSync(dir+'/semantic-index',{recursive:true});for(const[p,value]of index)fs.writeFileSync(dir+'/'+p,typeof value==='string'?value:Buffer.from(value));
fs.mkdirSync(root+'/profile');fs.writeFileSync(root+'/profile/obsidian.json',JSON.stringify({updateDisabled:true,vaults:{lab:{path:vault,ts:Date.now(),open:true}}}));
const report={status:'RUNNING',suite:v.suite,artifact,corpusSha256:manifest.corpusSha256,conditions:{os:os.platform(),release:os.release(),arch:os.arch(),cpus:os.cpus().length,totalMemory:os.totalmem(),notes:1000,bytes:manifest.notes.reduce((n,x)=>n+x.bytes,0),index:'2 synthetic vectors; no embedding service'},checks:[],measurements:{},limitations:['Linux desktop; 390 px is desktop resizing, not mobile acceptance.','No paid provider or real embedding quality evaluation.','Network instrumentation observes fetch/XHR and synthetic completion dispatch, not system-wide traffic.']};
const pause=ms=>new Promise(r=>setTimeout(r,ms));let child,socket,id=0;const pending=new Map();
const start=()=>{const launched=performance.now();child=spawn('/usr/lib/electron43/electron',['/usr/lib/obsidian/app.asar','--user-data-dir='+root+'/profile','--remote-debugging-port='+v.port,'--disable-gpu','--ozone-platform=x11'],{stdio:['ignore','ignore',fs.openSync(root+'/electron.log','a')]});return launched;};
const connect=async()=>{let page;for(let i=0;i<200;i++){try{page=(await(await fetch('http://127.0.0.1:'+v.port+'/json/list')).json()).find(x=>x.url.startsWith('app://obsidian.md/'));}catch{}if(page)break;await pause(100);}assert(page,'Native Obsidian CDP ready');socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};};
const cdp=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
const wait=async expression=>{for(let i=0;i<400;i++){if(await ev(expression))return;await pause(50);}throw Error('Timeout: '+expression);};
const shot=async name=>fs.writeFileSync(root+'/'+name+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
const pass=async(name,expression)=>{if(expression)assert(await ev(expression),name);report.checks.push(name);console.log('PASS '+name);};
const focusMain=async()=>{for(let i=0;i<100;i++){
 if(await ev('activeWindow!==window&&activeWindow.closed')){await ev('app.setting.open();void 0');await wait('activeWindow!==window&&!activeWindow.closed&&activeWindow===app.setting.win');}
 await ev('if(app.setting.win&&app.setting.win!==window)app.setting.close();void 0');await cdp('Page.bringToFront');await pause(50);if(await ev('activeWindow===window'))return;}fs.writeFileSync(root+'/focus.json',JSON.stringify(await ev('({focus:document.hasFocus(),same:activeWindow===window,closed:activeWindow.closed,title:activeDocument.title,floating:app.workspace.floatingSplit.children.length})')));throw Error('Native focus unavailable');};
const instrument=async()=>{
 await ev(`window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.engine=plugin.semanticController;window.io={network:0,model:0,process:[]};
 const processFile=app.vault.process.bind(app.vault);app.vault.process=(file,fn)=>{io.process.push(file.path);return processFile(file,fn)};
 window.fetch=()=>{io.network++;throw Error('Network blocked by offline acceptance')};XMLHttpRequest.prototype.send=function(){io.network++;throw Error('Network blocked by offline acceptance')};
 engine.decisionsProvider=engine.rerankProvider=()=>{io.network++;throw Error('Paid provider disabled in lab')};void 0`);
};
const ready=async()=>{await wait('!!window.app?.workspace?.layoutReady');assert.equal(await ev('app.vault.adapter.basePath'),vault);await wait("!!document.querySelector('.mod-trust-folder')||!!app.plugins.plugins['ai-knowledge-hub']?.semanticController");if(await ev("!!document.querySelector('.mod-trust-folder')"))await ev("[...document.querySelectorAll('.mod-trust-folder button')].find(e=>e.textContent==='Trust author and enable plugins').click();void 0");await wait("!!app.plugins.plugins['ai-knowledge-hub']?.semanticController&&!!app.commands.commands['ai-knowledge-hub:veynrel-open-health']");await wait('app.vault.getMarkdownFiles().length===1000&&app.vault.getMarkdownFiles().every(f=>!!app.metadataCache.getFileCache(f))');await ev("for(const leaf of app.workspace.getLeavesOfType('empty')){const w=leaf.view.containerEl.ownerDocument.defaultView;if(w&&w!==window)w.close();}void 0");await focusMain();await instrument();};
const stop=async()=>{if(child&&child.exitCode===null&&child.signalCode===null){const ended=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await ended;}};
const restart=async()=>{socket.close();await stop();const t=start();await connect();await ready();report.measurements.restartMs=performance.now()-t;};
const close=()=>ev("for(const e of [...document.querySelectorAll('.modal')].reverse())e.querySelector('.modal-close-button,.modal-header-button')?.click();void 0");
try {
 const t=start();await connect();await ready();report.measurements.startupMs=performance.now()-t;
 report.runtime=await ev("({electron:process.versions.electron,title:document.title,memory:process.memoryUsage()})");
 const {labNativeScenario}=await import('./acceptance-lab/native-scenarios.mjs');
 await labNativeScenario({ev,wait,cdp,shot,pass,focusMain,restart,close,root,vault,manifest,report,paths,port:v.port,suite:v.suite});
 assert.equal(walk(vault).length,1000);for(const n of manifest.notes)assert.equal(sha(fs.readFileSync(vault+'/'+n.path)),n.sha256,'Exact final Markdown: '+n.path);
 report.checks.push('All 1000 Markdown files exactly match the initial manifest after Undo');report.status='PASS';
} catch(error){report.status='FAIL';report.error=String(error);console.error(error);try{await shot('failure');report.ui=await ev("[...document.querySelectorAll('.modal')].map(e=>e.textContent)");}catch{}process.exitCode=1;}
finally {fs.writeFileSync(root+'/report.json',JSON.stringify(report,null,2)+'\n');socket?.close();await stop();}
