// Native Obsidian; fresh, credential-free copies only. No model/index generation.
// node scripts/knowledge-workbench-baseline.mjs /tmp/veynrel-stage1-<new-name> lab before|after [build-directory]
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

 await cdp('Emulation.setDeviceMetricsOverride',{width:1694,height:1080,deviceScaleFactor:1,mobile:false});
 for(const route of ['process','tools','health']){
  await click('nav-'+route);await settle();
  metrics[route]=await ev(`(()=>{const names=['.view-content','.veynrel-health-body','.veynrel-shell','.veynrel-shell-content','.veynrel-shell-main','.veynrel-tools-catalog','.veynrel-health-data'];return {view:hv.contentEl.getBoundingClientRect().toJSON(),elements:[...hv.contentEl.querySelectorAll('*')].filter(e=>names.some(n=>e.matches(n))).map(e=>{const s=getComputedStyle(e);return {cls:e.className,rect:e.getBoundingClientRect().toJSON(),height:s.height,minHeight:s.minHeight,overflow:s.overflow,rows:s.gridTemplateRows,columns:s.gridTemplateColumns,gap:s.gap,margin:s.margin}})}})()`);
  const data=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(root+'/'+route+'.png',Buffer.from(data.data,'base64'));
 }
 fs.writeFileSync(root+'/metrics.json',JSON.stringify(metrics,null,2));assert.deepEqual(markdown(vault),before);
 console.log(JSON.stringify(metrics));
} finally {socket?.close();child.kill('SIGTERM');}
