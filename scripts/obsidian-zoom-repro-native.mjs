// Matched synthetic profiles; capture exceptions without changing host methods.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)),root=process.argv[2];
assert(root?.startsWith('/tmp/veynrel-zoom-repro-')&&!fs.existsSync(root)&&!root.includes('..'));
fs.mkdirSync(root);const results=[];const pause=ms=>new Promise(r=>setTimeout(r,ms));
for(const enabled of [false,true]) {
 const dir=`${root}/${enabled?'with':'without'}-veynrel`,vault=`${dir}/vault`,profile=`${dir}/profile`;
 fs.mkdirSync(`${vault}/.obsidian`,{recursive:true});fs.mkdirSync(profile);fs.writeFileSync(`${vault}/Fixture.md`,'# Synthetic zoom fixture\n\nNo personal data.\n');
 fs.writeFileSync(`${vault}/.obsidian/app.json`,'{"checkForUpdates":false}');
 fs.writeFileSync(`${vault}/.obsidian/community-plugins.json`,JSON.stringify(enabled?['ai-knowledge-hub']:[]));
 if(enabled){const p=`${vault}/.obsidian/plugins/ai-knowledge-hub`;fs.mkdirSync(p,{recursive:true});for(const n of ['main.js','manifest.json','styles.css'])fs.copyFileSync(`${repo}/${n}`,`${p}/${n}`);fs.writeFileSync(`${p}/data.json`,JSON.stringify({language:'en',apiKey:'',provider:'ollama',baseUrl:'http://127.0.0.1:1/v1',semanticAutoSyncSuspended:true,semantic:{enabled:false},companion:{enabled:false},health:{onboardingCompleted:true}}));}
 fs.writeFileSync(`${profile}/obsidian.json`,JSON.stringify({updateDisabled:true,vaults:{fixture:{path:vault,open:true,ts:Date.now()}}}));
 const child=spawn('/usr/bin/electron43',['/usr/lib/obsidian/app.asar',`--user-data-dir=${profile}`,'--remote-debugging-port=9298','--disable-gpu','--ozone-platform=x11'],{stdio:['ignore','ignore',fs.openSync(`${dir}/electron.log`,'a')]});
 let ws,id=0;const pending=new Map();const report={enabled,steps:[],exceptions:[]};results.push(report);let stage='startup';
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>{pending.delete(key);reject(Error(`CDP timeout ${method}`));},15000);pending.set(key,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id:key,method,params}));});
 const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value};
 const wait=async expr=>{for(let i=0;i<200;i++){if(await ev(expr))return;await pause(100)}throw Error(expr)};
 try {
  let page;for(let i=0;i<300;i++){try{page=(await(await fetch('http://127.0.0.1:9298/json/list')).json()).find(p=>p.url.startsWith('app://obsidian.md'));}catch{}if(page)break;await pause(100)}assert(page);
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')report.exceptions.push({stage,...m.params});if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(m.error):p.resolve(m.result)}};
  await cdp('Runtime.enable');await wait('!!window.app?.workspace?.layoutReady');assert.equal(await ev('app.vault.adapter.basePath'),vault);
  if(enabled){await wait("!!app.plugins.plugins['ai-knowledge-hub']||!!document.querySelector('.mod-trust-folder')");if(await ev("!!document.querySelector('.mod-trust-folder')"))await ev("[...document.querySelectorAll('.mod-trust-folder button')].find(e=>/Trust author/.test(e.textContent)).click();void 0");await wait("!!app.plugins.plugins['ai-knowledge-hub']?.studio");}
  report.plugins=await ev('Object.keys(app.plugins.plugins)');assert.equal(report.plugins.includes('ai-knowledge-hub'),enabled);
  report.versions=await ev('({electron:process.versions.electron,obsidian:document.title,chrome:process.versions.chrome})');
  await ev("app.workspace.getLeaf().openFile(app.vault.getFileByPath('Fixture.md'))");
  for(const popout of [false,true]) {
   if(popout){await ev("window.pop=app.workspace.openPopoutLeaf();pop.openFile(app.vault.getFileByPath('Fixture.md'))");await wait('!!pop.view.editor');}
   for(const zoom of [2,1,2,1]) {stage=`main zoom ${zoom}; popout ${popout}`;report.steps.push(stage);await ev(`require('electron').webFrame.setZoomFactor(${zoom});void 0`);await pause(900);}
   if(popout){stage='close active popout';await ev('pop.view.containerEl.ownerDocument.defaultView.focus();app.workspace.setActiveLeaf(pop,{focus:true});void 0');await pause(300);await ev('pop.detach();void 0');await pause(500);for(const zoom of [2,1]){stage=`zoom ${zoom} after closing active popout`;report.steps.push(stage);await ev(`require('electron').webFrame.setZoomFactor(${zoom});void 0`);await pause(1500);}}
  }
  if(enabled){stage='open Studio and zoom';await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-studio');void 0");for(const zoom of [2,1]){report.steps.push(`Studio zoom ${zoom}`);await ev(`require('electron').webFrame.setZoomFactor(${zoom});void 0`);await pause(900)}}
  report.completed=true;
 } catch(e){report.error=String(e.stack??e);process.exitCode=1;}
 finally {ws?.close();const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await Promise.race([exited,pause(3000)]);if(child.exitCode===null)child.kill('SIGKILL');fs.writeFileSync(`${dir}/report.json`,JSON.stringify(report,null,2));}
 console.log(enabled?'WITH':'WITHOUT',report.completed,report.exceptions.map(e=>({stage:e.stage,error:e.exceptionDetails.exception?.description})));
}
fs.writeFileSync(`${root}/comparison.json`,JSON.stringify(results,null,2));
