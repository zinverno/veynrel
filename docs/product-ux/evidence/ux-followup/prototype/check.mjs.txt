import fs from 'node:fs';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const root=fs.mkdtempSync('/tmp/veynrel-reference-browser-');
const child=spawn('/usr/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--no-first-run','--disable-background-networking',`--user-data-dir=${root}/profile`,'--remote-debugging-port=0','about:blank'],{stdio:['ignore','ignore',fs.openSync(`${root}/browser.log`,'w')]});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let ws;const report={checks:[],exceptions:[],requests:[]};
try{
 for(let i=0;i<200&&!fs.existsSync(`${root}/profile/DevToolsActivePort`);i++)await pause(50);
 const port=fs.readFileSync(`${root}/profile/DevToolsActivePort`,'utf8').split('\n')[0];
 const target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0;const pending=new Map();
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')report.exceptions.push(m.params);if(m.method==='Network.requestWillBeSent')report.requests.push(m.params.request.url);};
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<100;i++){if(await ev(expression))return;await pause(30);}throw Error(expression);};
 const pass=async(name,expression)=>{assert(await ev(expression),name);report.checks.push(name);};
 const key=async(key,code=key,n=13)=>{for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:n,...(key==='Enter'&&type==='keyDown'?{text:'\r'}:{})});};
 const move=async(selector)=>{const p=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});return p;};
 const click=async selector=>{const p=await move(selector);for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});};
 const shot=async name=>{fs.writeFileSync(`${root}/${name}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['http://*','https://*']});await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 const base='file:///tmp/veynrel-ux-followup-refs-8gkcvg3z/Veynrel_UX_followup_refs/';
 await send('Page.navigate',{url:base+'index.html'});await wait("document.querySelector('a')");await shot('gallery');
 await pass('Gallery links targets and interactive pages',"document.querySelectorAll('a').length>10");
 await send('Page.navigate',{url:base+'02_prototype/index.html?page=tools&theme=dark&capture=1'});await wait("document.querySelector('[data-ring]')");
 const p=await ev("(()=>{const r=document.querySelector('.ring-svg').getBoundingClientRect();return{x:r.x+r.width*276/460,y:r.y+r.height*58/460}})()");await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});
 await pass('Ring hover explains bulk',"document.querySelector('#ring-center').textContent.includes('Массовый аудит')");await shot('ring-hover');
 await ev("document.querySelector('[data-ring]').focus()");await key('ArrowRight','ArrowRight',39);await pass('Arrow focus',"document.activeElement.dataset.ring==='1'");await key('Enter');await pass('Ring Enter opens explanation',"document.querySelector('dialog').open");await shot('explanation');await key('Escape','Escape',27);await pass('Escape restores ring origin',"!document.querySelector('dialog').open&&document.activeElement.dataset.ring==='1'");
 await click('#open-chooser');await send('Input.insertText',{text:'Массовый'});await key('Enter');await pass('Chooser opens same explanation',"!!document.querySelector('[data-continue=bulk]')");await click('[data-cancel]');await pass('Cancel restores chooser trigger',"document.activeElement.id==='open-chooser'");
 for(const page of ['bulk','semantics','findings']) {await send('Page.navigate',{url:base+'02_prototype/index.html?page='+page+'&theme=light&capture=1'});await wait("document.querySelector('.panel,.finding-row')");await shot(page);if(page==='bulk'){await click('[data-tool=bulk]');await pass('Bulk panel explanation',"!!document.querySelector('[data-continue=bulk]')");await key('Escape','Escape',27);}if(page==='semantics'){await click('[data-semantic=global]');await pass('Routes explicitly deferred in prototype',"!document.querySelector('#toast').hidden");}if(page==='findings'){await click('[data-details]');await pass('Details opens synthetic dialog',"document.querySelector('dialog').open");await key('Escape','Escape',27);}await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false});await pause(250);await pass(page+' 390 fits',"document.documentElement.scrollWidth<=390");await shot(page+'-390');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});}
 assert.equal(report.exceptions.length,0);assert(!report.requests.some(s=>/^https?:/.test(s)));report.status='PASS';
}catch(e){report.status='FAIL';report.error=String(e.stack||e);process.exitCode=1;}finally{fs.writeFileSync(`${root}/report.json`,JSON.stringify(report,null,2));ws?.close();child.kill('SIGTERM');console.log(JSON.stringify({root,...report}));}
