// Synthetic HTTP envelopes over loopback; real requestUrl/parser/session/validator/executors.
// node scripts/evidence-binding-native.mjs ~/projects/veynrel-artifacts/veynrel-evidence-binding-native-<new-name> [frozen-build]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
assert(root&&path.dirname(root)===path.join(os.homedir(),'projects/veynrel-artifacts')&&path.basename(root).startsWith('veynrel-evidence-binding-native-')&&!root.includes('..')&&!fs.existsSync(root));

const vault=root+'/vault',dir=vault+'/.obsidian/plugins/ai-knowledge-hub';
fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(root+'/profile');
const sha=b=>createHash('sha256').update(b).digest('hex');
const markdown=base=>Object.fromEntries(fs.readdirSync(base,{recursive:true}).filter(p=>p.endsWith('.md')&&fs.statSync(base+'/'+p).isFile()).sort().map(p=>[p,sha(fs.readFileSync(base+'/'+p))]));
const pairPaths=['Workbench/A/Cache.md','Workbench/B/Cache.md'];
const fixture=JSON.parse(fs.readFileSync(ROOT+'/tests/fixtures/merge-planner.json','utf8'));
const unsupportedPaths=['Unsupported/A/Table.md','Unsupported/B/Table.md'];
const unsupported='# Structured source\n\n| Fact | Scope |\n| --- | --- |\n| A cache keeps reusable results. | Synthetic only |\n';
for(const p of unsupportedPaths){fs.mkdirSync(vault+'/'+p.split('/').slice(0,-1).join('/'),{recursive:true});fs.writeFileSync(vault+'/'+p,unsupported);}
for(const [i,p] of pairPaths.entries()){fs.mkdirSync(vault+'/'+p.split('/').slice(0,-1).join('/'),{recursive:true});fs.writeFileSync(vault+'/'+p,i===0?fixture.a:fixture.b);}
const indexPaths=[...pairPaths,...unsupportedPaths];
fs.writeFileSync(root+'/fixture-description.json',JSON.stringify({notes:4,indexed:4,provenance:'Synthetic chat/completions envelopes, NOT intercepted user HTTP. Loopback HTTP only; real requestUrl, parser, validator, planners and executors. Artificial vectors do not test embedding quality.'},null,2));
const requests=[];
const server=createServer(async(req,res)=>{
 if(req.method!=='POST'||req.url!=='/v1/chat/completions'){res.writeHead(400).end();return;}
 let body='';for await(const chunk of req){body+=chunk;if(body.length>128*1024){res.writeHead(413).end();return;}}
 requests.push(body);
 const response=structuredClone(fixture.response);
 const request=JSON.parse(JSON.parse(body).messages[1].content);
 assert.equal(request.schema,'veynrel.relationship.refs.v1');
 const wire={...response,schema:request.schema,claims:response.claims.map(({quoteA,quoteB,...claim})=>({...claim,
 evidenceA:quoteA===null?null:request.evidence.find(f=>f.side==='A'&&f.text===quoteA).id,
 evidenceB:quoteB===null?null:request.evidence.find(f=>f.side==='B'&&f.text===quoteB).id}))};
 wire.alternatives=[];
 if(requests.length===1)wire.claims[0].evidenceA='unknown-fragment';
 if(requests.length===2)wire.claims[0].evidenceA=wire.claims[0].evidenceB;
 if(requests.length===3)wire.alternatives=[{action:'consider_atomize',reason:'Unique does not prove standalone.',evidence:['unique-a']}];
 res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(wire)}}],usage:{completion_tokens:300,completion_tokens_details:{reasoning_tokens:0}}}));
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
 const bodies=[];
 const openPair=async(name)=>{
   const id=await ev(`(()=>{const e=[...document.querySelectorAll('[data-pair-id]')].find(e=>e.parentElement.textContent.includes(${JSON.stringify(name)}));if(!e)throw Error('pair missing');return e.dataset.pairId})()`);
   await clickSelector(`[data-pair-id=${JSON.stringify(id)}]`);await wait("document.querySelectorAll('.ai-pair-note').length===2");
 };
 const analyze=async(name)=>{
   await openPair(name);await clickSelector('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");
   bodies.push(await ev("document.querySelector('.ai-relationship pre').textContent"));
   assert.equal(requests.length,bodies.length-1);await shot('consent-'+bodies.length);
   await clickSelector('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-intent-action=primary]')");
   assert.equal(requests.at(-1),bodies.at(-1));
 };
 const smoke=async(prefix)=>{
   const viewport=await ev('({width:innerWidth,height:innerHeight})'),recording=!!onFrame;
   if(recording)await cdp('Page.stopScreencast');
   for(const theme of ['theme-dark','theme-light'])for(const width of [1280,390]){
     await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
     await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');void 0`);
     await ev(`hv.contentEl.querySelector('[data-planner-field=range],[data-planner-field=combine-canonical],[data-intent-unavailable]')?.scrollIntoView({block:'center'});void 0`);
     await pass(prefix+' '+theme+' '+width+' localized and fits',"!/@intent\\./.test(hv.contentEl.textContent)&&[...hv.contentEl.querySelectorAll('.ai-change-planner,.ai-change-planner select,.ai-change-planner pre,.ai-relationship')].filter(e=>e.offsetWidth).every(e=>e.scrollWidth<=e.clientWidth+1)");
     await shot(prefix+'-'+theme+'-'+width);
   }
   await cdp('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:false});
   if(recording)await cdp('Page.startScreencast',{format:'jpeg',quality:70,maxWidth:1694,maxHeight:1080,everyNthFrame:1});
 };
 await startVideo('evidence-binding-merge-apply-undo');
 for(const [index,code]of ['reference_unknown','reference_side_mismatch','missing_standalone_evidence'].entries()){
   await openPair('Cache');await clickSelector('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");
   bodies.push(await ev("document.querySelector('.ai-relationship pre').textContent"));
   assert.equal(requests.length,index);await shot('refusal-consent-'+index);
   await clickSelector('[data-relationship-action=confirm]');await wait("document.querySelector('[data-relationship-stage]')?.dataset.relationshipStage==='error'");
   assert.equal(requests[index],bodies[index]);assert.deepEqual(markdown(vault),before);
   await pass(code+' through actual transport refuses planner and preserves data',`!document.querySelector('[data-intent-action=primary]')&&!document.querySelector('[data-planner-action=open]')&&[...engine.pairReviews].at(-1).relationship.view.diagnostics.some(d=>d.code==='${code}')`);
   await clickSelector('.ai-consolidation-diagnostics summary');await shot('diagnostic-'+code);await pause(1400);
   await click('review-back');
 }
 await locale('en');await analyze('Cache');await shot('merge-recommendation-en');await pause(1400);
 await clickSelector('[data-intent-action=primary]');await wait("!!document.querySelector('[data-planner-field=combine-canonical]')");
 await field('[data-planner-field=combine-canonical]','0');
 await pass('Merge recommendation asks canonical and eligible material without catalogue',"!document.querySelector('[data-planner-field=operation]')&&[...document.querySelectorAll('[data-planner-field^=merge-transfer-]')].every(e=>!e.checked)");
 await shot('merge-parameters-en');await pause(1400);await smoke('en-merge');
 const transfer=fixture.b.indexOf('Срок хранения');await clickSelector(`[data-planner-field=merge-transfer-${transfer}]`);await field('[data-planner-field=merge-location]','0');
 await pass('Merge insertion remains unconfirmed',"!document.querySelector('[data-planner-field=merge-confirm]').checked&&document.querySelector('[data-merge-action=build]').disabled");
 await clickSelector('[data-planner-field=merge-confirm]');await clickSelector('[data-merge-action=build]');await wait("!!document.querySelector('[data-merge-plan]')");
 assert.equal(requests.length,4);await ev('window.mergePlan=[...engine.pairReviews].at(-1).planner.view.mergePlan;void 0');
 await clickSelector('[data-merge-apply-action=review]');await wait("!!document.querySelector('.modal [data-merge-apply-action=confirm]')");assert.deepEqual(markdown(vault),before);await shot('merge-exact-review');await pause(1400);
 await clickSelector('.modal [data-merge-apply-action=confirm]');await wait("!!document.querySelector('.modal [data-merge-apply-action=history]')");
 assert.equal(fs.readFileSync(vault+'/'+pairPaths[0],'utf8'),await ev('mergePlan.canonical.after'));assert.equal(fs.readFileSync(vault+'/'+pairPaths[1],'utf8'),fixture.b);await shot('merge-applied');
 fs.writeFileSync(root+'/merge-after-apply.json',JSON.stringify(markdown(vault),null,2));
 await clickSelector('.modal [data-merge-apply-action=history]');await wait("!!document.querySelector('.ai-operation-history [data-merge-apply-action=undoReview]')");await shot('merge-history');
 await clickSelector('.ai-operation-history [data-merge-apply-action=undoReview]');await wait("!!document.querySelector('.modal [data-merge-apply-action=confirm]')");await shot('merge-undo-review');await clickSelector('.modal [data-merge-apply-action=confirm]');await wait("!!document.querySelector('.modal [data-merge-apply-action=history]')");assert.deepEqual(markdown(vault),before);
 checks.push('Merge: canonical-only real Apply/history/separate Undo; secondary unchanged and all Markdown SHA256 restored');
 await closeModals();await click('review-back');await shot('merge-return-list');await stopVideo();
 await locale('ru');await shot('ru-list');await smoke('ru-list');
 assert.deepEqual(markdown(vault),before);assert.equal(requests.length,4);
 await pass('No map construction or renderer network; four explicit loopback completions','graphicalCreations===0&&io.network===0&&!hv.workbench.data.semantic');
 checks.push('All four disclosed consent bodies exactly match sent HTTP bodies');
 fs.writeFileSync(root+'/after.json',JSON.stringify(markdown(vault),null,2));
 metrics.runtime=await ev("({obsidian:require('@electron/remote').app.getVersion(),electron:process.versions.electron})");
 fs.writeFileSync(root+'/report.json',JSON.stringify({status:'native evidence binding verified on synthetic loopback responses',checks,metrics,screenshots,sourceCommit,hashes:Object.fromEntries(['main.js','manifest.json','styles.css'].map(p=>[p,sha(fs.readFileSync(dir+'/'+p))])),io:await ev('io'),httpRequests:requests.length,requestBytes:requests.map(body=>Buffer.byteLength(body)),catalogues:requests.map(body=>{const request=JSON.parse(JSON.parse(body).messages[1].content);return {fragments:request.evidence.length,uncoveredCharacters:request.uncoveredCharacters}}),consentMatches:requests.map((body,i)=>body===bodies[i]),httpDestination:'loopback only',liveModel:'NOT RUN'},null,2));
 console.log(JSON.stringify({status:'PASS',checks:checks.length,root}));
} catch(error){
 fs.writeFileSync(root+'/failure.txt',String(error.stack));if(socket?.readyState===1){try{const p=++id;const shot=await new Promise((resolve,reject)=>{pending.set(p,{resolve,reject});socket.send(JSON.stringify({id:p,method:'Page.captureScreenshot',params:{format:'png'}}))});fs.writeFileSync(root+'/failure.png',Buffer.from(shot.data,'base64'));}catch{}}
 throw error;
} finally {socket?.close();child.kill('SIGTERM');server.closeAllConnections();server.close();}
