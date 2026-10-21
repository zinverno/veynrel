// Synthetic HTTP envelopes over loopback; real requestUrl/parser/session/validator/executors.
// node scripts/analyzer-output-budget-native.mjs /tmp/veynrel-workbench-<new-name> [frozen-build]
import fs from 'node:fs';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {build as bundle} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const [root,build=ROOT]=process.argv.slice(2);
const sourceCommit=fs.existsSync(build+'/SOURCE_COMMIT')?fs.readFileSync(build+'/SOURCE_COMMIT','utf8').trim():undefined;
assert(root?.startsWith('/tmp/veynrel-workbench-')&&!root.includes('..')&&!fs.existsSync(root));

const vault=root+'/vault',dir=vault+'/.obsidian/plugins/ai-knowledge-hub';
fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(root+'/profile');
const sha=b=>createHash('sha256').update(b).digest('hex');
const markdown=base=>Object.fromEntries(fs.readdirSync(base,{recursive:true}).filter(p=>p.endsWith('.md')&&fs.statSync(base+'/'+p).isFile()).sort().map(p=>[p,sha(fs.readFileSync(base+'/'+p))]));
const pairPaths=['Workbench/A/Cache.md','Workbench/B/Cache.md'];
const fixture=JSON.parse(fs.readFileSync(ROOT+'/tests/fixtures/change-planner.json','utf8'));
for(const [i,p] of pairPaths.entries()){fs.mkdirSync(vault+'/'+p.split('/').slice(0,-1).join('/'),{recursive:true});fs.writeFileSync(vault+'/'+p,i===0?fixture.a:fixture.b);}
const indexPaths=pairPaths;
fs.writeFileSync(root+'/fixture-description.json',JSON.stringify({notes:2,indexed:2,provenance:'Synthetic chat/completions envelopes, NOT intercepted user HTTP. Loopback HTTP only; real requestUrl, parser, validator, planners and executors. Artificial vectors do not test embedding quality.'},null,2));
const requests=[];
const server=createServer(async(req,res)=>{
 if(req.method!=='POST'||req.url!=='/v1/chat/completions'){res.writeHead(400).end();return;}
 let body='';for await(const chunk of req){body+=chunk;if(body.length>128*1024){res.writeHead(413).end();return;}}
 requests.push(body);
 const limited=requests.length===1;
 res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({
  choices:[{index:0,finish_reason:limited?'length':'stop',message:{role:'assistant',content:limited?null:JSON.stringify(fixture.response),...(limited?{reasoning:'Synthetic hidden reasoning, never a recommendation'}:{})}}],
  usage:{completion_tokens:limited?4000:300,completion_tokens_details:{reasoning_tokens:limited?4000:0}}
 }));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
const endpoint='http://127.0.0.1:'+server.address().port+'/v1';
await bundle({absWorkingDir:ROOT,entryPoints:['scripts/knowledge-workbench-fixture.ts'],bundle:true,platform:'node',format:'cjs',outfile:root+'/fixture.cjs',
 plugins:[{name:'fixture-host',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const getLanguage=()=>"en";'}));}}]});
const files=await createRequire(import.meta.url)(root+'/fixture.cjs').workbenchFixture(indexPaths);
fs.mkdirSync(dir+'/semantic-index');
for(const [p,v]of files)fs.writeFileSync(dir+'/semantic-index/'+p.split('/').pop(),typeof v==='string'?v:Buffer.from(v));
for(const name of ['main.js','styles.css','manifest.json'])fs.copyFileSync(build+'/'+name,dir+'/'+name);
fs.writeFileSync(dir+'/data.json',JSON.stringify({language:'ru',provider:'openrouter',model:'deepseek/deepseek-v4-flash-0731',baseUrl:endpoint,apiKey:'synthetic-not-a-real-key',semanticAutoSyncSuspended:true,semantic:{enabled:true,embeddingProvider:'ollama',embeddingModel:'global-map-synthetic',embeddingBaseUrl:'http://127.0.0.1:11434',openRouterApiKey:'',openAICompatibleApiKey:''},decisions:{enabled:false,apiKey:''},companion:{enabled:false},health:{profile:'mixed',profileChosen:true,onboardingCompleted:true}}));
fs.writeFileSync(vault+'/.obsidian/community-plugins.json','["ai-knowledge-hub"]');
fs.writeFileSync(vault+'/.obsidian/app.json','{"checkForUpdates":false}');
fs.writeFileSync(root+'/profile/obsidian.json',JSON.stringify({updateDisabled:true,vaults:{stage1:{path:vault,ts:Date.now(),open:true}}}));
const before=markdown(vault),checks=[],metrics={},screenshots=[];fs.writeFileSync(root+'/before.json',JSON.stringify(before,null,2));
const child=spawn('/usr/bin/electron43',['/usr/lib/obsidian/app.asar','--user-data-dir='+root+'/profile','--remote-debugging-port=9393','--disable-gpu','--ozone-platform=x11'],{stdio:['ignore','ignore',fs.openSync(root+'/electron.log','a')]});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let socket,onFrame,id=0;const pending=new Map();
try{
 let page;for(let i=0;i<150;i++){try{page=(await(await fetch('http://127.0.0.1:9393/json/list')).json()).find(p=>p.url.startsWith('app://obsidian.md/'));}catch{}if(page)break;await pause(100);}assert(page,'Obsidian ready');
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j});
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Page.screencastFrame')onFrame?.(m.params);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(m.error):p.resolve(m.result)}};
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const request=++id,timer=setTimeout(()=>{pending.delete(request);reject(Error(`CDP timeout: ${method}`))},30000);pending.set(request,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});socket.send(JSON.stringify({id:request,method,params}))});
 const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert(!r.exceptionDetails,expression+' '+JSON.stringify(r.exceptionDetails));return r.result.value};
 const wait=async expression=>{for(let i=0;i<160;i++){if(await ev(expression))return;await pause(70);}throw Error('Timeout '+expression)};
 const pass=async(name,expression)=>{assert(await ev(expression),name);checks.push(name);console.log(name)};
 const click=key=>clickSelector(`[data-health-action="${key}"]`);
 const settle=()=>ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 await wait('!!window.app?.workspace?.layoutReady');assert.equal(await ev('app.vault.adapter.basePath'),vault);
 await wait("!!document.querySelector('.mod-trust-folder')||!!app.plugins.plugins['ai-knowledge-hub']");
 await ev("document.querySelector('.mod-trust-folder')&&[...document.querySelectorAll('.mod-trust-folder button')].find(e=>e.textContent==='Trust author and enable plugins').click();void 0");
 await wait("!!app.commands.commands['ai-knowledge-hub:veynrel-open-health']");
 await ev(`window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.engine=plugin.semanticController;window.io={reads:0,writes:0,network:0,enumerations:0};
 for(const key of ['read','cachedRead']){const original=app.vault[key].bind(app.vault);app.vault[key]=(...args)=>{io.reads++;return original(...args)}};
 for(const key of ['create','modify','append','process','delete','rename']){const original=app.vault[key].bind(app.vault);app.vault[key]=(...args)=>{io.writes++;return original(...args)}};
 {const original=app.vault.getMarkdownFiles.bind(app.vault);app.vault.getMarkdownFiles=(...args)=>{io.enumerations++;return original(...args)}};
 window.fetch=()=>{io.network++;throw Error('Network disabled in acceptance')};XMLHttpRequest.prototype.send=function(){io.network++;throw Error('Network disabled in acceptance')};
 app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();void 0`);
 const opened=performance.now();await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-review-vault');app.commands.executeCommandById('ai-knowledge-hub:veynrel-review-vault');void 0");
 await wait("!!app.workspace.getLeavesOfType('veynrel-health')[0]?.view.contentEl.querySelector('[data-health-action=review-refresh]')");
 metrics.openMs=performance.now()-opened;
 await ev("window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;void 0");
 await wait("!!hv.contentEl.querySelector('[data-health-action=review-refresh]')");
 await pass('Cold direct command opens one list without map data',"app.workspace.getLeavesOfType('veynrel-health').length===1&&!hv.workbench.data.semantic&&!hv.workbench.data.comparison&&!hv.contentEl.querySelector('svg[data-camera]')");
 await pass('Exact Markdown count',`hv.areaIndex.snapshot.paths.length===${Object.keys(before).length}`);
 await pass('Opening is metadata-only with zero network/writes','io.reads===0&&io.writes===0&&io.network===0');
 const shot=async(name,keepPointer=false)=>{if(!keepPointer)await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2});await pause(150);await settle();const data=await cdp('Page.captureScreenshot',{format:'png'});const file=name+'.png';fs.writeFileSync(root+'/'+file,Buffer.from(data.data,'base64'));screenshots.push(file);};
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
 const frames=[];let videoName="list-first-route";
 const startVideo=async(name='list-first-route')=>{if(onFrame)return;videoName=name;frames.length=0;fs.mkdirSync(root+'/'+videoName+'-frames');onFrame=p=>{const file=`${videoName}-frames/${String(frames.length).padStart(5,'0')}.jpg`;fs.writeFileSync(root+'/'+file,Buffer.from(p.data,'base64'));frames.push({file,time:Date.now()});void cdp('Page.screencastFrameAck',{sessionId:p.sessionId})};await cdp('Page.startScreencast',{format:'jpeg',quality:70,maxWidth:1694,maxHeight:1080,everyNthFrame:1});};
 const stopVideo=async()=>{await cdp('Page.stopScreencast');onFrame=undefined;assert(frames.length>10);fs.writeFileSync(root+'/frames.txt',frames.map((f,i)=>`file '${f.file}'\nduration ${Math.max(.1,Math.min(2,((frames[i+1]?.time??f.time+500)-f.time)/1000))}`).join('\n')+'\n');execFileSync('ffmpeg',['-y','-loglevel','error','-f','concat','-safe','0','-i',root+'/frames.txt','-vf','fps=10,scale=1280:-2','-c:v','libx264','-threads','2','-crf','24','-pix_fmt','yuv420p',root+'/'+videoName+'.mp4']);};
 await ev(`window.graphicalCreations=0;window.realHostCreate=hv.workbenchHost.create;hv.workbenchHost.create=(scope,graphical)=>{if(graphical){graphicalCreations++;throw Error('Map forbidden in this native route')}return realHostCreate(scope,graphical)};void 0`);
 await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-review-vault');app.commands.executeCommandById('ai-knowledge-hub:veynrel-review-vault');void 0");
 await wait("!!document.querySelector('[data-health-action=review-refresh]')");
 await pass('Direct command opens one standalone list without graphical data or IO',"app.workspace.getLeavesOfType('veynrel-health').length===1&&!hv.workbench.data.semantic&&!hv.workbench.data.comparison&&graphicalCreations===0&&io.reads===0&&io.writes===0&&io.network===0");
 await shot('list-before-search');
 await wait('app.vault.getMarkdownFiles().every(f=>!!app.metadataCache.getFileCache(f))');
 await click('review-refresh');await wait('!hv.workbench.data.busy');
 await pass('Repeat search does not mount a map',"hv.workbench.data.duplicateState==='ready'&&!hv.workbench.data.semantic&&!hv.workbench.data.comparison&&graphicalCreations===0");
 await startVideo('analyzer-limit-and-recovery');await shot('list');
 await clickSelector('[data-pair-id]');await wait("document.querySelectorAll('.ai-pair-note').length===2");
 await clickSelector('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");
 const firstBody=await ev("document.querySelector('.ai-relationship pre').textContent");
 assert.equal(requests.length,0);assert.equal(JSON.parse(firstBody).max_tokens,8192);assert.deepEqual(JSON.parse(firstBody).reasoning,{enabled:false});
 await shot('consent-budget');
 await clickSelector('[data-relationship-action=confirm]');await wait("document.querySelector('[data-relationship-stage]')?.dataset.relationshipStage==='error'");
 assert.equal(requests.length,1);assert.equal(requests[0],firstBody);assert.deepEqual(markdown(vault),before);
 await pass('Length error from actual HTTP parser; no planner, writes or leaked reasoning',"document.querySelector('.ai-relationship').textContent.includes('Модель достигла лимита генерации')&&!document.querySelector('.ai-relationship').textContent.includes('Synthetic hidden')&&!document.querySelector('[data-planner-action=open]')&&io.writes===0");
 await shot('length-error-ru');await pause(1100);assert.equal(requests.length,1);checks.push('No automatic retry after limit; first consent equals HTTP body byte-for-byte');
 await stopVideo();
 await locale('en');await clickSelector('[data-pair-id]');await wait("document.querySelectorAll('.ai-pair-note').length===2");
 await clickSelector('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");
 const nextBody=await ev("document.querySelector('.ai-relationship pre').textContent");assert.equal(requests.length,1);
 await shot('fresh-consent-en');
 await startVideo('analyzer-success-apply-undo');
 await clickSelector('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-planner-action=open]')");
 assert.equal(requests.length,2);assert.equal(requests[1],nextBody);checks.push('Fresh consent → real transport parser → strict evidence validator → result');await shot('validated-result');
   await clickSelector('[data-planner-action=open]');await field('[data-planner-field=source]','0');await field('[data-planner-field=operation]','add_link');await field('[data-planner-field=range]','0');await clickSelector('[data-planner-field=confirm]');await clickSelector('[data-planner-action=build]');await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='ready'");
   await ev('window.plan=[...engine.pairReviews].at(-1).planner.view.plan;void 0');await clickSelector('[data-safe-action=review]');await wait("!!document.querySelector('.ai-safe-apply [data-safe-action=confirm]')");assert.deepEqual(markdown(vault),before);await shot('exact-review');
   await clickSelector('.ai-safe-apply [data-safe-action=confirm]');await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-safe-apply [data-safe-action=history]')");assert.equal(fs.readFileSync(vault+'/'+pairPaths[0],'utf8'),await ev('plan.after'));await shot('applied-result');
   fs.writeFileSync(root+'/after-apply.json',JSON.stringify(markdown(vault),null,2));
   await clickSelector('.ai-safe-apply [data-safe-action=history]');await wait("!!document.querySelector('.ai-operation-history [data-safe-action=undo]')");await shot('history');
   await clickSelector('.ai-operation-history [data-safe-action=undo]');await wait("!!document.querySelector('.ai-safe-apply [data-safe-action=undoConfirm]')");await shot('undo-review');await clickSelector('.ai-safe-apply [data-safe-action=undoConfirm]');await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-safe-apply [data-safe-action=history]')");assert.deepEqual(markdown(vault),before);checks.push('Real Apply → history → separate Undo restores every Markdown SHA256');
   await closeModals();await click('review-back');await shot('return-to-list');await stopVideo();
   await pass('List search and selected pair survive return; no analysis consent survives',"!!hv.workbench.selected&&engine.pairReviews.size===0&&graphicalCreations===0");
 assert.deepEqual(markdown(vault),before);assert.equal(requests.length,2);await pass('No map construction or renderer network; exactly two loopback HTTP completions','graphicalCreations===0&&io.network===0&&!hv.workbench.data.semantic');
 fs.writeFileSync(root+'/after.json',JSON.stringify(markdown(vault),null,2));
 metrics.runtime=await ev("({obsidian:require('@electron/remote').app.getVersion(),electron:process.versions.electron})");
 fs.writeFileSync(root+'/report.json',JSON.stringify({status:'native checks passed; user UX acceptance separate',checks,metrics,screenshots,sourceCommit,hashes:Object.fromEntries(['main.js','manifest.json','styles.css'].map(p=>[p,sha(fs.readFileSync(dir+'/'+p))])),io:await ev('io'),httpRequests:requests.length,consentMatches:[requests[0]===firstBody,requests[1]===nextBody],httpDestination:'loopback only',liveModel:'NOT RUN'},null,2));
 console.log(JSON.stringify({status:'PASS',checks:checks.length,root}));
} catch(error){
 fs.writeFileSync(root+'/failure.txt',String(error.stack));if(socket?.readyState===1){try{const p=++id;const shot=await new Promise((resolve,reject)=>{pending.set(p,{resolve,reject});socket.send(JSON.stringify({id:p,method:'Page.captureScreenshot',params:{format:'png'}}))});fs.writeFileSync(root+'/failure.png',Buffer.from(shot.data,'base64'));}catch{}}
 throw error;
} finally {socket?.close();child.kill('SIGTERM');server.closeAllConnections();server.close();}
