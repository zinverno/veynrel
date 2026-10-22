// Synthetic HTTP envelopes over loopback; real requestUrl/parser/session/validator/executors.
// node scripts/review-flow-native.mjs ~/projects/veynrel-artifacts/veynrel-review-flow-native-<new-name> [frozen-build] [decisions]
import fs from 'node:fs';
import {generate} from './acceptance-lab/generate.mjs';
import {archiveChain,swapBuild,scaleChecks,stateChecks} from './beta-integration-native.mjs';
import {reviewRuleChecks} from './review-rules-native.mjs';
import {reviewDecisionChecks} from './review-decisions-native.mjs';
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
const [root,build=ROOT,mode,previousBuild]=process.argv.slice(2);
const sourceCommit=fs.existsSync(build+'/SOURCE_COMMIT')?fs.readFileSync(build+'/SOURCE_COMMIT','utf8').trim():undefined;
assert(root&&path.dirname(root)===path.join(os.homedir(),'projects/veynrel-artifacts')&&path.basename(root).startsWith('veynrel-review-flow-native-')&&!root.includes('..')&&!fs.existsSync(root));

const vault=root+'/vault',dir=vault+'/.obsidian/plugins/ai-knowledge-hub';
fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(root+'/profile');
const sha=b=>createHash('sha256').update(b).digest('hex');
const markdown=base=>Object.fromEntries(fs.readdirSync(base,{recursive:true}).filter(p=>p.endsWith('.md')&&fs.statSync(base+'/'+p).isFile()).sort().map(p=>[p,sha(fs.readFileSync(base+'/'+p))]));
const pairPaths=['Workbench/A/Cache.md','Workbench/B/Cache.md'];
const fixture=JSON.parse(fs.readFileSync(ROOT+'/tests/fixtures/merge-planner.json','utf8'));
const combinePaths=['Combine/A/MergeCase.md','Combine/B/MergeCase.md'];
for(const [i,p] of combinePaths.entries()){fs.mkdirSync(vault+'/'+p.split('/').slice(0,-1).join('/'),{recursive:true});fs.writeFileSync(vault+'/'+p,i===0?fixture.a:fixture.b);}
const plainB=fixture.b;
const unsupportedPaths=['Unsupported/A/Table.md','Unsupported/B/Table.md'];
const prefix='---\ntags: [synthetic]\n---\n\n# Cache study\n\n**A formatted observation** uses `code` and [[Reference]].\n\n';
fixture.a=prefix+fixture.a;fixture.b=prefix+fixture.b;
for(const [i,p] of unsupportedPaths.entries()){fs.mkdirSync(vault+'/'+p.split('/').slice(0,-1).join('/'),{recursive:true});fs.writeFileSync(vault+'/'+p,(i===0?fixture.a:fixture.b).replace('A cache keeps reusable results.','**A cache keeps reusable results.**'));}
for(const [i,p] of pairPaths.entries()){fs.mkdirSync(vault+'/'+p.split('/').slice(0,-1).join('/'),{recursive:true});fs.writeFileSync(vault+'/'+p,i===0?fixture.a:fixture.b);}
const rulePaths=mode==='rules'?['Tasks','Theory'].flatMap(group=>Array.from({length:6},(_,i)=>`Rules/${group}/${group==='Tasks'?'Exercise':'Explanation'} ${i}.md`)):[];
for(const p of rulePaths){fs.mkdirSync(path.dirname(vault+'/'+p),{recursive:true});const task=p.includes('/Tasks/'),i=Number(p.match(/(\d+)\.md$/u)[1]);
 fs.writeFileSync(vault+'/'+p,(task&&i%2===0?'---\ntags: [practice/task, topic/cache]\n---\n\n':task?'#practice/task #topic/cache\n\n':'#topic/cache\n\n')+(task?fixture.a:fixture.b));}
let indexPaths=[...pairPaths,...unsupportedPaths,...combinePaths,...rulePaths];
const scaleCount=mode?.startsWith('scale-')?Number(mode.slice(6)):undefined;
if(scaleCount!==undefined){
 assert([0,154,500,1000].includes(scaleCount));
 for(const p of indexPaths)fs.unlinkSync(vault+'/'+p);
 const notes=generate({count:1000,seed:'beta-stage-3-synthetic'}).notes.slice(0,scaleCount);
 for(const n of notes){fs.mkdirSync(path.dirname(vault+'/'+n.path),{recursive:true});fs.writeFileSync(vault+'/'+n.path,n.text);}
 indexPaths=notes.map(n=>n.path);
}
fs.writeFileSync(root+'/fixture-description.json',JSON.stringify({notes:indexPaths.length,indexed:indexPaths.length,provenance:'Synthetic chat/completions envelopes, NOT intercepted user HTTP. Loopback HTTP only; real requestUrl, parser, validator, planners and executors. Artificial vectors do not test embedding quality.'},null,2));
const requests=[];let scenario='add_link';
const server=createServer(async(req,res)=>{
 if(req.method!=='POST'||req.url!=='/v1/chat/completions'){res.writeHead(400).end();return;}
 let body='';for await(const chunk of req){body+=chunk;if(body.length>128*1024){res.writeHead(413).end();return;}}
 requests.push(body);
 const {alternatives: _legacyAlternatives,...response}=structuredClone(fixture.response);
 let request;try{request=JSON.parse(JSON.parse(body).messages[1].content);}catch{res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:{message:'Only Relationship Analyzer synthetic fixtures are accepted'}}));return;}
 assert.equal(request.schema,'veynrel.relationship.refs.v2');
 const wire={...response,schema:request.schema,claims:response.claims.map(({quoteA,quoteB,...claim})=>({...claim,
 evidenceA:quoteA===null?null:request.evidence.find(f=>f.side==='A'&&f.text.includes(quoteA)).id,
 evidenceB:quoteB===null?null:request.evidence.find(f=>f.side==='B'&&f.text.includes(quoteB)).id}))};
 wire.recommendation={action:scenario==='invalid'?'consider_merge':['length','unknown-id','wrong-schema'].includes(scenario)?'add_link':scenario,reason:'Synthetic diagnostic recommendation. Both documents remain independently useful.',evidence:['shared']};
 if(scenario==='invalid')wire.relation='related_distinct';
 if(scenario==='unknown-id')wire.explanation.evidence=['unoffered-claim'];
 if(scenario==='wrong-schema')wire.schema='veynrel.relationship.refs.v1';
 res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({choices:[{index:0,finish_reason:scenario==='length'?'length':'stop',message:{role:'assistant',content:JSON.stringify(wire)}}],usage:{completion_tokens:300,completion_tokens_details:{reasoning_tokens:0}}}));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
const endpoint='http://127.0.0.1:'+server.address().port+'/v1';
await bundle({absWorkingDir:ROOT,entryPoints:['scripts/knowledge-workbench-fixture.ts'],bundle:true,platform:'node',format:'cjs',outfile:root+'/fixture.cjs',
 plugins:[{name:'fixture-host',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const getLanguage=()=>"en";'}));}}]});
const files=await createRequire(import.meta.url)(root+'/fixture.cjs').workbenchFixture(indexPaths,mode==='rules');
fs.mkdirSync(dir+'/semantic-index');
for(const [p,v]of files)fs.writeFileSync(dir+'/semantic-index/'+p.split('/').pop(),typeof v==='string'?v:Buffer.from(v));
for(const name of ['main.js','styles.css','manifest.json'])fs.copyFileSync((previousBuild??build)+'/'+name,dir+'/'+name);
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
 const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,replMode:true});assert(!r.exceptionDetails,expression+' '+JSON.stringify(r.exceptionDetails));return r.result.value};
 const wait=async expression=>{for(let i=0;i<160;i++){if(await ev(expression))return;await pause(70);}throw Error('Timeout '+expression)};
 const pass=async(name,expression)=>{assert(await ev(expression),name);checks.push(name);console.log(name)};
 const click=key=>clickSelector(`[data-health-action="${key}"]`);
 const settle=()=>ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 await wait('!!window.app?.workspace?.layoutReady');assert.equal(await ev('app.vault.adapter.basePath'),vault);
 await wait("!!document.querySelector('.mod-trust-folder')||!!app.plugins.plugins['ai-knowledge-hub']");
 await ev("document.querySelector('.mod-trust-folder')&&[...document.querySelectorAll('.mod-trust-folder button')].find(e=>e.textContent==='Trust author and enable plugins').click();void 0");
 await wait("!!app.commands.commands['ai-knowledge-hub:veynrel-open-health']");
 if(mode==='upgrade')await swapBuild({ev,wait,root,dir,vault,build},build,'boot');
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
 await ev(`window.factChecks=[];window.measureFacts=f=>{const read=f.deps.read;f.deps.read=async paths=>{const started=performance.now();try{return await read(paths)}finally{factChecks.push(performance.now()-started)}};return f};measureFacts(hv.workbench.facts);window.makeFacts=engine.createReviewFacts.bind(engine);engine.createReviewFacts=callback=>measureFacts(makeFacts(callback));void 0`);
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
  await ev(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'});void 0`);await settle();
  const rect=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing or disabled control');return e.getBoundingClientRect().toJSON()})()`);
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
 await wait('app.vault.getMarkdownFiles().every(f=>f.stat.size===0||!!app.metadataCache.getFileCache(f))');
 await click('review-refresh');await wait('!hv.workbench.data.busy');
 await pass('Repeat search does not mount a map',"(hv.workbench.data.duplicateState==='ready'||"+(scaleCount!==undefined)+")&&!hv.workbench.data.semantic&&!hv.workbench.data.comparison&&graphicalCreations===0");
 const bodies=[];
 const openPair=async(name)=>{
   await wait('!hv.workbench.facts?.running&&!hv.workbench.facts?.dirty.size');await settle();
   const paths=name==='Table'?unsupportedPaths:name==='MergeCase'?combinePaths:pairPaths;
   const id=JSON.stringify([...paths].sort());
   assert(await ev(`!![...document.querySelectorAll('[data-pair-id]')].find(e=>e.dataset.pairId===${JSON.stringify(id)})`),'exact canonical pair exists');
   await clickSelector(`[data-pair-id=${JSON.stringify(id)}]`);await wait("document.querySelectorAll('.ai-pair-note').length===2");
 };
 const analyze=async(name)=>{
   await openPair(name);await clickSelector('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");
   bodies.push(await ev("document.querySelector('.ai-relationship pre').textContent"));
   assert.equal(requests.length,bodies.length-1);await shot('consent-'+bodies.length);
   await clickSelector('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-intent-action=primary]')");await wait("[...engine.pairReviews].at(-1).preflight.view.state==='ready'");
   assert.equal(requests.at(-1),bodies.at(-1));
 };
 if(mode==='state'){
   await stateChecks({ev,wait,click,clickSelector,openPair,root,dir,vault,before,markdown,requests,shot,sourceCommit});
 } else if(scaleCount!==undefined){
   await scaleChecks({ev,wait,click,clickSelector,field,shot,closeModals,root,vault,before,markdown,checks,metrics,requests,sourceCommit,count:scaleCount});
 } else if(mode==='rules') {
   await reviewRuleChecks({ev,wait,click,clickSelector,shot,startVideo,stopVideo,pass,openPair,locale,field,cdp,pause,settle,
     vault,dir,root,rulePaths,before,markdown,requests,checks,metrics,screenshots,sourceCommit,upgrade:previousBuild?()=>swapBuild({ev,wait,root,dir,vault,build},build,'rules-decisions'):undefined});
 } else if(mode==='decisions') {
   await reviewDecisionChecks({ev,wait,click,clickSelector,shot,startVideo,stopVideo,pass,openPair,locale,field,cdp,pause,settle,
     vault,dir,root,pairPaths,before,markdown,requests,checks,metrics,screenshots,sourceCommit});
 } else {
 const smoke=async(prefix)=>{
   const viewport=await ev('({width:innerWidth,height:innerHeight})'),recording=!!onFrame;
   if(recording)await cdp('Page.stopScreencast');
   for(const theme of ['theme-dark','theme-light'])for(const width of [1280,390]){
     await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
     await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');void 0`);
     await ev(`hv.contentEl.querySelector('.ai-pair-inspector h2')?.scrollIntoView({block:'start'});void 0`);
     await pass(prefix+' '+theme+' '+width+' localized and fits',"!/@intent\\./.test(hv.contentEl.textContent)&&[...hv.contentEl.querySelectorAll('.ai-change-planner,.ai-change-planner select,.ai-change-planner pre,.ai-relationship')].filter(e=>e.offsetWidth).every(e=>e.scrollWidth<=e.clientWidth+1)");
     const contrast=await ev(`(()=>{
       const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
       const lum=p=>[...p].slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
       return [...document.querySelectorAll('.ai-pair-inspector *, .modal .ai-change-planner *')].filter(e=>e.getClientRects().length&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&!e.closest(':disabled,[hidden],svg')).map(e=>{
         ctx.clearRect(0,0,1,1);const chain=[];for(let n=e;n;n=n.parentElement)chain.unshift(n);
         for(const n of chain){ctx.fillStyle=getComputedStyle(n).backgroundColor;ctx.fillRect(0,0,1,1)}const bg=lum(ctx.getImageData(0,0,1,1).data);
         const style=getComputedStyle(e);ctx.fillStyle=style.color;ctx.fillRect(0,0,1,1);const fg=lum(ctx.getImageData(0,0,1,1).data);
         return {className:e.className,ratio:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05),large:parseFloat(style.fontSize)>=24};
       });})()`);
     metrics.contrast??=[];metrics.contrast.push({prefix,theme,width,values:contrast});assert(contrast.every(c=>c.ratio>=(c.large?3:4.5)),JSON.stringify(contrast));
     await shot(prefix+'-'+theme+'-'+width);
     if(width===390){
       const visible=await ev(`(()=>{const e=document.querySelector('.modal [data-merge-apply-action=confirm]')||[...hv.contentEl.querySelectorAll('[data-relationship-action=confirm],[data-relationship-action=report],.ai-review-decision:not(:disabled)')].find(e=>e.getClientRects().length);if(!e)return true;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom>0&&r.top<innerHeight})()`);assert(visible,'main control reachable at 390');await shot(prefix+'-action-'+theme+'-'+width);
     }
     if(prefix.startsWith('diff-')){await ev("document.querySelector('.modal .ai-proposal-diff-panel')?.scrollIntoView({block:'center'});void 0");await shot(prefix+'-content-'+theme+'-'+width);}
   }
   await cdp('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:false});
   if(recording)await cdp('Page.startScreencast',{format:'jpeg',quality:70,maxWidth:1694,maxHeight:1080,everyNthFrame:1});
 };
 await startVideo('review-apply-list-reopen-history-undo');
 await locale('en');await analyze('Cache');await shot('link-result');await pause(900);
 await pass('Read-only preflight completes before primary action',"!document.querySelector('[data-intent-action=primary]').disabled&&[...engine.pairReviews].at(-1).preflight.view.state==='ready'");
 await pass('Whole primary card is one button without nested tab stops',"document.querySelector('[data-intent-action=primary]').tagName==='BUTTON'&&!document.querySelector('[data-intent-action=primary]').querySelector('button,a,input,[tabindex]')");
 await ev("document.querySelector('[data-intent-action=primary]').focus();void 0");
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await wait("!!document.querySelector('[data-planner-field=source]')");assert.equal(requests.length,1);assert.deepEqual(markdown(vault),before);
 await clickSelector('[data-planner-field=source][value="0"]');await field('[data-planner-field=range]','0');
 await shot('link-parameters');await pause(900);
 await pass('Parameters are proposed, never confirmation',"!document.querySelector('[data-planner-field=confirm]').checked&&document.querySelector('[data-planner-action=build]').disabled");
 await clickSelector('[data-planner-field=confirm]');await clickSelector('[data-planner-action=build]');await wait("!!document.querySelector('[data-safe-action=review]')");
 await ev('window.plan=[...engine.pairReviews].at(-1).planner.view.plan;void 0');
 await clickSelector('[data-safe-action=review]');await wait("!!document.querySelector('.modal [data-safe-action=confirm]')");
 assert.deepEqual(markdown(vault),before);await shot('exact-review');await pause(1100);
 await clickSelector('.modal [data-safe-action=cancel]');
 assert.deepEqual(markdown(vault),before);
 await pass('Cancelled exact review has no operation outcome',`!hv.workbench.facts.get(${JSON.stringify(pairPaths)}).operation`);
 await clickSelector('[data-safe-action=review]');await wait("!!document.querySelector('.modal [data-safe-action=confirm]')");
 await clickSelector('.modal [data-safe-action=confirm]');await wait("!!document.querySelector('.modal [data-safe-action=done]')");
 assert.equal(fs.readFileSync(vault+'/'+pairPaths[0],'utf8'),await ev('plan.after'));assert.equal(fs.readFileSync(vault+'/'+pairPaths[1],'utf8'),fixture.b);
 fs.writeFileSync(root+'/after-apply.json',JSON.stringify(markdown(vault),null,2));await shot('applied');await pause(1100);
 await clickSelector('.modal [data-safe-action=done]');await click('review-back');
 if(mode==='upgrade-operation'){await swapBuild({ev,wait,root,dir,vault,build},build,'applied-operation');await click('review-refresh');await wait('!hv.workbench.data.busy');}
 await wait("[...document.querySelectorAll('.veynrel-review-row')].some(r=>r.textContent.includes('Link A → B already exists.'))");
 if(mode!=='upgrade-operation')await pass('Confirmed outcome in list',"document.querySelector('.veynrel-review-results').textContent.includes('change applied.')");
 await shot('list-after-apply');await pause(1400);
 if(mode==='upgrade-operation')await pass('Restart keeps the linked candidate without a background journal read',"!!document.querySelector('[data-pair-id]')&&graphicalCreations===0");
 else await pass('Applied link and stale overlap remain visible without another completion',"document.querySelector('.veynrel-review-results').textContent.includes('Content overlap has not been separately resolved.')&&graphicalCreations===0");
 assert.equal(requests.length,1);
 await openPair('Cache');await clickSelector('[data-safe-action=history]');
 await wait("!!document.querySelector('.ai-operation-history [data-safe-action=undo]')");await shot('reopened-history');await pause(1100);
 await clickSelector('.ai-operation-history [data-safe-action=undo]');await wait("!!document.querySelector('.modal [data-safe-action=undoConfirm]')");
 await shot('separate-undo-review');await pause(1100);
 await clickSelector('.modal [data-safe-action=undoConfirm]');await wait("!!document.querySelector('.modal [data-safe-action=done]')");
 assert.deepEqual(markdown(vault),before);fs.writeFileSync(root+'/after-undo.json',JSON.stringify(markdown(vault),null,2));await shot('undone');await closeModals();await click('review-back');
 await wait("document.querySelector('.veynrel-review-results').textContent.includes('Change undone.')");await shot('list-after-undo');await pause(1300);await stopVideo();
 checks.push('Actual Apply then list then reopen/history/separate Undo; all Markdown hashes restored; one explicit loopback completion');
 scenario='consider_embed_b_in_a';await startVideo('unavailable-before-navigation');await analyze('Table');
 await pass('Unsupported embed is disabled on result before navigation',"document.querySelector('[data-intent-action=primary]').disabled&&!!document.querySelector('[data-intent-unavailable]')&&!document.querySelector('[data-planner-field=range]')");
 await shot('unavailable-embed');await pause(1700);await stopVideo();await smoke('result-en');
 await click('review-back');await locale('ru');await analyze('Table');await shot('unavailable-ru');await smoke('result-ru');
 await click('review-back');await shot('list-ru');
 await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await ev("require('@electron/remote').getCurrentWebContents().setZoomFactor(2);void 0");await pause(400);await shot('zoom-200-list');
 await pass('200% application zoom remains within pane',"hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1");
 await ev("require('@electron/remote').getCurrentWebContents().setZoomFactor(1);void 0");
 assert.deepEqual(markdown(vault),before);assert.equal(requests.length,3);
 await pass('No map renderer, background completions or renderer fetch','graphicalCreations===0&&io.network===0&&!hv.workbench.data.semantic');
 // Long payload remains disclosed; these consent previews are cancelled without any completion.
 for(const lang of ['ru','en']) {
   await locale(lang);await openPair('Table');await clickSelector('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");
   await smoke('consent-'+lang);
   await ev("require('@electron/remote').getCurrentWebContents().setZoomFactor(2);void 0");await pause(300);await shot('consent-'+lang+'-zoom200');
   await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
   await pass('Native keyboard focus within review '+lang,"!!document.activeElement&&hv.contentEl.contains(document.activeElement)");
   await ev("require('@electron/remote').getCurrentWebContents().setZoomFactor(1);void 0");
   await clickSelector('[data-relationship-action=cancel]');await click('review-back');assert.equal(requests.length,3);
 }
 // All additional decisions use new explicit consent and the real transport. No writes.
 for(const kind of ['consider_merge','consider_embed_b_in_a','no_change','manual_review']) {
   scenario=kind;await locale('ru');await analyze(kind==='consider_merge'?'MergeCase':'Cache');await shot('decision-'+kind);
   if(kind==='consider_merge')await smoke('decision-ru');
   const calls=requests.length;
   if(kind==='manual_review'){
     await ev("document.querySelector('[data-intent-action=primary]').focus();void 0");
     await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,text:' '});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
   }else await clickSelector('[data-intent-action=primary]');
   if(kind==='consider_merge') {
     await wait("!!document.querySelector('[data-planner-field=combine-canonical]')");
     await pass('Combine asks canonical without default consent',"![...document.querySelectorAll('[data-planner-field=combine-canonical]')].some(e=>e.checked)");
     await clickSelector('[data-planner-field=combine-canonical][value="0"]');
     if(await ev("!!document.querySelector('[data-planner-field=combine-material]')"))await field('[data-planner-field=combine-material]','merge_knowledge');
     await wait("!!document.querySelector('[data-planner-field=merge-location]')");await shot('combine-material');await smoke('parameters-ru');
     await clickSelector(`[data-planner-field=merge-transfer-${plainB.indexOf('Срок хранения')}]`);await field('[data-planner-field=merge-location]','0');
     await pass('Combine parameters do not grant insertion consent',"!document.querySelector('[data-planner-field=merge-confirm]').checked");
     await clickSelector('[data-planner-field=merge-confirm]');await clickSelector('[data-merge-action=build]');await wait("!!document.querySelector('[data-merge-plan]')");
     await clickSelector('[data-merge-apply-action=review]');await wait("!!document.querySelector('.modal [data-merge-apply-action=confirm]')");await shot('combine-exact-review');await smoke('diff-ru');
     if(mode==='integration')await archiveChain({ev,wait,clickSelector,field,shot,closeModals,markdown,vault,root,before,checks});else await closeModals();
   } else if(kind==='consider_embed_b_in_a') {
     await wait("!!document.querySelector('[data-planner-field=range]')");
     await pass('Embed keeps known direction without repeated question',"!document.querySelector('[data-planner-field=source]')&&!document.querySelector('[data-planner-field=confirm]')?.checked");await field('[data-planner-field=range]','0');await shot('embed-parameters');
   } else if(kind==='manual_review')await pass('Manual review opens exact evidence without planner',"!document.querySelector('[data-review-evidence]').hidden&&!document.querySelector('[data-planner-field=range]')");
   else {
     await wait("!!document.querySelector('[data-review-decision-saved]')");
     await pass('No change saves a pair decision without planner',"!hv.workbench.stopReview&&!!document.querySelector('[data-review-decision-saved]')");
     await click('review-undo-decision');
   }
   assert.equal(requests.length,calls);assert.deepEqual(markdown(vault),before);if(kind!=='no_change')await click('review-back');
 }
 scenario='invalid';await startVideo('rejected-primary-report');
 await openPair('Cache');await clickSelector('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");
 bodies.push(await ev("document.querySelector('.ai-relationship pre').textContent"));await clickSelector('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-relationship-action=report]')");assert.equal(requests.at(-1),bodies.at(-1));
 await pass('Invalid primary has no result or planner authority',"![...engine.pairReviews].at(-1).relationship.analysisSource&&!document.querySelector('[data-intent-action=primary]')");
 await shot('rejected-primary');await smoke('error-ru');await clickSelector('[data-relationship-action=report]');await shot('error-report');await clickSelector('[data-relationship-action=copy-report]');await pause(250);
 const copied=await ev("require('@electron/remote').clipboard.readText()");const report=JSON.parse(copied);
 assert.equal(report.stage,'consistency');assert.deepEqual(report.issues,[{field:'recommendation',code:'action_relation_mismatch',relation:'related_distinct',action:'consider_merge'}]);
 assert(!/Cache|Workbench|synthetic-not-a-real-key|localhost|127\.0|cache keeps|requestBody|quoteA|headers/.test(copied));
 fs.writeFileSync(root+'/copied-error-report.json',JSON.stringify(report,null,2));checks.push('Native copy contains only allowlisted diagnostics with actual enums, no note data');
 await stopVideo();await click('review-back');
 if(mode==='integration')for(const failure of ['length','unknown-id','wrong-schema']){
   scenario=failure;await openPair('Cache');await clickSelector('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");
   bodies.push(await ev("document.querySelector('.ai-relationship pre').textContent"));await clickSelector('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-relationship-action=report]')");
   assert.equal(requests.at(-1),bodies.at(-1));await pass('Real transport refuses '+failure,"![...engine.pairReviews].at(-1).relationship.analysisSource&&!document.querySelector('[data-intent-action=primary],[data-safe-action=review]')");await shot('transport-'+failure);await click('review-back');
 }
 const expectedRequests=requests.length;assert.equal(expectedRequests,mode==='integration'?11:8);
 // A real split hosts the same review route with its own owner.
 await ev("window.splitLeaf=app.workspace.getLeaf('split','vertical');await splitLeaf.setViewState({type:'veynrel-health',active:true});splitLeaf.view.openReviewVault();void 0");
 await wait("!!splitLeaf.view.workbench?.data");await shot('real-split');await ev('splitLeaf.detach();void 0');
 // A genuine second native window shares updates, but not consent or planner authority.
 await locale('en');
 await ev("window.secondLeaf=app.workspace.openPopoutLeaf({width:820,height:760});await secondLeaf.setViewState({type:'veynrel-health',active:true});secondLeaf.view.openReviewVault();void 0");
 await wait("!!secondLeaf.view.workbench?.data");
 await ev("await secondLeaf.view.workbench.data.refresh('repeats');void 0");
 await wait(`secondLeaf.view.workbench.facts.get(${JSON.stringify(pairPaths)})?.state==='ready'`);
 await pass('Popout owns a separate list without a session or map',"secondLeaf.view.workbench!==hv.workbench&&!secondLeaf.view.workbench.stopReview&&!secondLeaf.view.workbench.data.semantic");
 const popoutPage=(await(await fetch('http://127.0.0.1:9393/json/list')).json()).find(p=>p.type==='page'&&p.id!==page.id&&p.title.startsWith('Veynrel'));
 assert(popoutPage,'real popout CDP target');
 const popSocket=new WebSocket(popoutPage.webSocketDebuggerUrl);await new Promise((r,j)=>{popSocket.onopen=r;popSocket.onerror=j});
 const popoutImage=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('popout screenshot timeout')),10000);popSocket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id===1){clearTimeout(timer);m.error?reject(m.error):resolve(m.result.data)}};popSocket.send(JSON.stringify({id:1,method:'Page.captureScreenshot',params:{format:'png'}}));});
 popSocket.close();fs.writeFileSync(root+'/popout-list.png',Buffer.from(popoutImage,'base64'));screenshots.push('popout-list.png');
 await ev(`await app.vault.modify(app.vault.getFileByPath(${JSON.stringify(pairPaths[0])}),${JSON.stringify(fixture.a+'\nA manual synthetic edit.\n')});void 0`);
 await wait(`hv.workbench.facts.get(${JSON.stringify(pairPaths)})?.state==='ready'&&secondLeaf.view.workbench.facts.get(${JSON.stringify(pairPaths)})?.changed`);
 await pass('Manual edit is stale in both windows with no completion',`hv.workbench.facts.get(${JSON.stringify(pairPaths)}).changed&&secondLeaf.view.workbench.facts.get(${JSON.stringify(pairPaths)}).changed`);
 await shot('manual-edit-list');
 await ev(`await app.fileManager.renameFile(app.vault.getFileByPath(${JSON.stringify(pairPaths[0])}),'Workbench/A/Renamed.md');void 0`);
 await wait(`!hv.workbench.data.scope.paths.includes(${JSON.stringify(pairPaths[0])})||hv.workbench.facts.get(${JSON.stringify(pairPaths)})?.state==='missing'`);
 await shot('manual-rename-list');
 await ev("await app.vault.delete(app.vault.getFileByPath('Workbench/A/Renamed.md'));void 0");
 await pass('Rename/delete never restore a pair session or consent',"!hv.workbench.stopReview&&!secondLeaf.view.workbench.stopReview");
 await ev('secondLeaf.detach();void 0');
 assert.equal(requests.length,expectedRequests);checks.push('Post-Undo manual edit/rename/delete are separate synthetic checks; no synthetic restore is counted as Undo');
 metrics.localPairRecheck=await ev("({count:factChecks.length,meanMs:factChecks.reduce((a,b)=>a+b,0)/factChecks.length,maxMs:Math.max(...factChecks),p95Ms:[...factChecks].sort((a,b)=>a-b)[Math.floor(factChecks.length*.95)]})");
 metrics.runtime=await ev("({obsidian:require('@electron/remote').app.getVersion(),electron:process.versions.electron})");
 fs.writeFileSync(root+'/after-manual-edits.json',JSON.stringify(markdown(vault),null,2));
 fs.writeFileSync(root+'/report.json',JSON.stringify({status:'native synthetic regression',checks,metrics,screenshots,sourceCommit,previousBuild:previousBuild?{manifest:JSON.parse(fs.readFileSync(previousBuild+'/manifest.json','utf8')),mainSha:sha(fs.readFileSync(previousBuild+'/main.js'))}:undefined,hashes:Object.fromEntries(['main.js','manifest.json','styles.css'].map(p=>[p,sha(fs.readFileSync(dir+'/'+p))])),io:await ev('io'),httpRequests:requests.length,consentMatches:requests.map((b,i)=>b===bodies[i]),httpDestination:'loopback only',liveModel:'NOT RUN; authorization ended'},null,2));
 console.log(JSON.stringify({status:'PASS',checks:checks.length,root}));
 }
} catch(error){
 fs.writeFileSync(root+'/failure.txt',String(error.stack));if(socket?.readyState===1){try{const p=++id;const shot=await new Promise((resolve,reject)=>{pending.set(p,{resolve,reject});socket.send(JSON.stringify({id:p,method:'Page.captureScreenshot',params:{format:'png'}}))});fs.writeFileSync(root+'/failure.png',Buffer.from(shot.data,'base64'));}catch{}}
 throw error;
} finally {socket?.close();child.kill('SIGTERM');server.closeAllConnections();server.close();}
