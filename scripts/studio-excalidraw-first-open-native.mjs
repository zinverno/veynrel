// Synthetic native acceptance: npm run build, then node scripts/studio-excalidraw-first-open-native.mjs
// /tmp/veynrel-diagram-native-<unique> /tmp/veynrel-excalidraw-2.29.0-assets after [build-directory]
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../', import.meta.url)), root = process.argv[2], assets = process.argv[3];
assert(root?.startsWith('/tmp/veynrel-diagram-native-') && !root.includes('..') && !fs.existsSync(root));
assert.equal(JSON.parse(fs.readFileSync(`${assets}/manifest.json`, 'utf8')).version, '2.29.0');
const vault = `${root}/vault`, config = `${vault}/.obsidian`, profile = `${root}/profile`;
fs.mkdirSync(`${config}/plugins`, { recursive: true }); fs.mkdirSync(profile); fs.mkdirSync(`${vault}/Drawings`);
const originals = { 'Source.md': '# Request processing\n\nReceive a request. Check whether the data are valid. If yes, accept it. If no, ask for corrections, then receive it again.\n\nA separate glossary contains definitions.\n', 'Untouched.md': '# Never read this note\nPrivate synthetic control.\n' };
for (const [path, raw] of Object.entries(originals)) fs.writeFileSync(`${vault}/${path}`, raw);
const fixtures = JSON.parse(fs.readFileSync(new URL('./studio-excalidraw-first-open-fixtures.json',import.meta.url),'utf8'));
let graph = fixtures.structure;
const phase = process.argv[4] || 'after';
const sha = raw => createHash('sha256').update(raw).digest('hex');
const report = { checks: [], screenshots: [], exceptions: [], network: [], artifacts: {}, versions: {}, requests: [],
  limits: 'Synthetic model via real callOpenRouter/requestUrl HTTP path. No paid API or real-model quality claim. Linux desktop only; no physical mobile or screen-reader claim.' };
for (const [id, from] of [['ai-knowledge-hub', process.argv[5] || ROOT], ['obsidian-excalidraw-plugin', assets]]) {
  const to = `${config}/plugins/${id}`; fs.mkdirSync(to);
  for (const name of ['main.js', 'styles.css', 'manifest.json']) { fs.copyFileSync(`${from}/${name}`, `${to}/${name}`); report.artifacts[`${id}/${name}`] = sha(fs.readFileSync(`${to}/${name}`)); }
}
const legacy = JSON.parse(JSON.parse(fs.readFileSync(new URL('./studio-first-open-legacy/intent.json',import.meta.url),'utf8')).payload);
const legacyDir = `${config}/plugins/ai-knowledge-hub/studio/diagrams/${legacy.id}`;fs.mkdirSync(legacyDir,{recursive:true});
for(const n of ['intent.json','receipt.json'])fs.copyFileSync(new URL(`./studio-first-open-legacy/${n}`,import.meta.url),`${legacyDir}/${n}`);
fs.copyFileSync(new URL('./studio-first-open-legacy/Native.excalidraw.md',import.meta.url),`${vault}/${legacy.target}`);
const legacyHash=sha(fs.readFileSync(`${vault}/${legacy.target}`));
const metadata = { data: { id: 'synthetic/diagram', endpoints: [{ tag: 'synthetic/loopback', supported_parameters: ['structured_outputs', 'response_format', 'max_tokens', 'temperature', 'repetition_penalty', 'frequency_penalty', 'reasoning'] }] } };
report.metadata = [];
let providerMode = 'normal', releaseProvider;
const server = createServer(async (req, res) => {
  let body = ''; for await (const chunk of req) body += chunk;
  if (req.url === '/v1/models/synthetic/diagram/endpoints') {
    assert.equal(req.method, 'GET'); assert.equal(body, ''); assert.equal(req.headers.authorization, undefined);
    report.metadata.push({ method: req.method, url: req.url }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(metadata)); return;
  }
  assert.equal(req.url, '/v1/chat/completions'); report.requests.push(body);
  assert.equal(JSON.parse(body).response_format.json_schema.strict, true);
  assert.deepEqual(JSON.parse(body).provider, { only: ['synthetic/loopback'], order: ['synthetic/loopback'], allow_fallbacks: false, require_parameters: true });
  if (providerMode === 'defer') await new Promise(resolve => { releaseProvider = resolve; });
  if (providerMode === 'late-http') { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"error":{"code":503}}'); return; }
  const kind = JSON.parse(body).messages[0].content.includes('structural diagram') ? 'structure' : 'flowchart';
  const output = { ...graph }; if (providerMode === 'missing-label') output.edges = graph.edges.map(({label, ...edge}) => edge);
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) }, finish_reason: providerMode === 'length' ? 'length' : 'stop' }] }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
// Harness loader executes the unmodified production bundle with a requestUrl URL-only redirect.
// The frozen request body still traverses production buildChatBody/callOpenRouter and native requestUrl.
const instrumentedDir = `${config}/plugins/ai-knowledge-hub`;
fs.renameSync(`${instrumentedDir}/main.js`, `${instrumentedDir}/production-main.js`);
fs.writeFileSync(`${instrumentedDir}/main.js`, `const fs=require('fs'),host=require('obsidian'),nativeRequest=host.requestUrl;
window.studioTransportTiming=[];
const api={...host,requestUrl:opts=>{
  if(typeof opts!=='object')throw Error('unexpected request');const u=new URL(opts.url);
  if(u.origin!=='https://openrouter.ai'||!['/api/v1/models/synthetic/diagram/endpoints','/api/v1/chat/completions'].includes(u.pathname))throw Error('blocked non-loopback request');
  if(opts.method==='GET'&&(opts.headers||opts.body))throw Error('metadata leaked credentials or body');
  const trace={phase:opts.method==='GET'?'preflight GET':'inference',clock:'renderer performance.now',dispatch:performance.now(),firstByte:null,bodyComplete:null,delivery:null,metadataSettlement:null};window.studioTransportTiming.push(trace);
  return nativeRequest({...opts,url:'http://127.0.0.1:${server.address().port}'+u.pathname.replace('/api/v1','/v1'),headers:opts.method==='GET'?undefined:{'Content-Type':'application/json'}}).then(r=>{trace.delivery=performance.now();trace.status=r.status;return r},e=>{trace.delivery=performance.now();trace.status='transport error';throw e});
}};
const m={exports:{}};new Function('require','module','exports',fs.readFileSync(${JSON.stringify(`${instrumentedDir}/production-main.js`)},'utf8'))(name=>name==='obsidian'?api:require(name),m,m.exports);module.exports=m.exports;`);
report.instrumentation = 'Unmodified production-main.js loaded through harness-only require adapter; only requestUrl destination/headers redirected to loopback. No remote inference route. First-byte/body-complete unavailable in buffered requestUrl; no billing settlement exists for synthetic responses.';
fs.writeFileSync(`${config}/plugins/ai-knowledge-hub/data.json`, JSON.stringify({ language: 'en', provider: 'openrouter', model: 'synthetic/diagram', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'synthetic-not-a-key', semanticAutoSyncSuspended: true, semantic: { enabled: false }, decisions: { enabled: false }, companion: { enabled: false }, health: { onboardingCompleted: true } }));
fs.writeFileSync(`${config}/plugins/obsidian-excalidraw-plugin/data.json`, JSON.stringify({ checkForUpdates: false, showReleaseNotes: false, showWelcomeModal: false, autoexportSVG: false, autoexportPNG: false, autoexportExcalidraw: false, compress: true, matchTheme: true, zoomToFitOnOpen: false, zoomToFitOnResize: false, enableOnloadScripts: false, startupScriptPath: '', templateFilePath: 'Untouched.md' }));
// Begin with Excalidraw installed but disabled; enable only inside this disposable vault.
fs.writeFileSync(`${config}/community-plugins.json`, '["ai-knowledge-hub"]');
fs.writeFileSync(`${config}/app.json`, '{"checkForUpdates":false}');
fs.writeFileSync(`${profile}/obsidian.json`, JSON.stringify({ updateDisabled: true, vaults: { diagrams: { path: vault, ts: Date.now(), open: true } } }));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const start = () => spawn('/usr/bin/electron43', ['/usr/lib/obsidian/app.asar', `--user-data-dir=${profile}`, '--remote-debugging-port=9291', '--disable-gpu', '--ozone-platform=x11'], { stdio: ['ignore', 'ignore', fs.openSync(`${root}/electron.log`, 'a')] });
let child, socket, sequence = 0;
const pending = new Map();
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout: ${method}`));},30000);
  pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});
  socket.send(JSON.stringify({id,method,params}));
});
const ev = async expression => { const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
const wait = async expression => { for (let i = 0; i < 400; i++) { if (await ev(expression)) return; await pause(50); } throw Error(`Timeout: ${expression}; ${await ev('document.body.innerText.slice(-2500)')}`); };
const pass = async (name, expr) => { if (expr) assert(await ev(expr), name); report.checks.push(name); console.log(name); };
async function connect() {
  let page; for (let i = 0; i < 300; i++) { try { page = (await (await fetch('http://127.0.0.1:9291/json/list')).json()).find(p => p.url.startsWith('app://obsidian.md/')); } catch {} if (page) break; await pause(100); }
  assert(page, 'native page ready'); socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => { const m = JSON.parse(event.data); if (m.method === 'Runtime.exceptionThrown') report.exceptions.push(m.params); if (m.method === 'Network.requestWillBeSent') report.network.push({ url: m.params.request.url, type: m.params.type }); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (p) m.error ? p.reject(m.error) : p.resolve(m.result); } };
  await cdp('Runtime.enable'); await cdp('Network.enable');
  await wait('!!window.app?.workspace?.layoutReady'); assert.equal(await ev('app.vault.adapter.basePath'), vault);
  await wait("!!app.plugins.plugins['ai-knowledge-hub']?.studio || !!document.querySelector('.mod-trust-folder')");
  if (await ev("!!document.querySelector('.mod-trust-folder')")) await ev("[...document.querySelectorAll('.mod-trust-folder button')].find(e=>/Trust author/.test(e.textContent)).click();void 0");
  await wait("!!app.plugins.plugins['ai-knowledge-hub']?.studio?.diagrams");
  await ev("window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.studio=plugin.studio;window.d=studio.diagrams;window.io={reads:[],creates:[]};const read=app.vault.read.bind(app.vault),create=app.vault.create.bind(app.vault);app.vault.read=async f=>{io.reads.push(f.path);return read(f)};app.vault.create=async(p,s,o)=>{io.creates.push(p);return create(p,s,o)};void 0");
  await ev(`window.fetch=()=>{throw Error('blocked fetch')};XMLHttpRequest.prototype.send=function(){throw Error('blocked XHR')};void 0`);
  await cdp('Page.bringToFront');
}
const click = async (action, modal = false) => {
  const selector = `${modal ? '.veynrel-studio-dialog' : '.veynrel-studio'} [data-studio-action="${action}"]`;
  await cdp('Page.bringToFront'); await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  const point = await ev(`(async()=>{const e=document.querySelector(${JSON.stringify(selector)});for(let a=e.parentElement;a;a=a.parentElement)if(a.tagName==='DETAILS')a.open=true;e.scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(r));const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, ...point, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) });
};
const shot = async name => { fs.writeFileSync(`${root}/${name}.png`, Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64')); report.screenshots.push(`${name}.png`); };
async function studioOpen() { await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-studio');void 0"); await wait("!!document.querySelector('[data-studio-action=diagram]')"); await click('diagram'); }
async function locale(language) {
  await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
  await ev(`{const s=[...app.setting.modalEl.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='ru'));s.value='${language}';s.dispatchEvent(new Event('change'));}void 0`);
  await ev('plugin.settingsSave'); await ev('app.setting.close();void 0');
  await ev("app.workspace.getLeavesOfType('veynrel-studio').forEach(l=>l.detach());void 0"); await studioOpen();
}
async function prepare(target = 'Drawings/Native.excalidraw.md', kind = 'flowchart') {
  const count = report.requests.length;
  await ev(`d.prepare(${JSON.stringify(kind)},'Source.md',${JSON.stringify(target)},{direction:'down',theme:'neutral'},32768)`);
  assert.equal(report.requests.length, count); return await ev('d.prepared.body');
}
async function generate(target, kind) { const body = await prepare(target, kind), count = report.requests.length; await ev('d.generate(d.prepared)'); assert.deepEqual(report.requests.slice(count), [body]); }
async function canvas() { await wait("!!app.workspace.getLeavesOfType('excalidraw').find(l=>l.view.file?.path===(window.nativeTarget||d.proposal.target))?.view.excalidrawAPI"); await ev("window.dv=app.workspace.getLeavesOfType('excalidraw').find(l=>l.view.file?.path===(window.nativeTarget||d.proposal.target)).view;window.xapi=dv.excalidrawAPI;void 0"); await wait("xapi.getSceneElements().some(e=>e.id==='vtitle00')&&!dv.semaphores.justLoaded"); }
async function pointer(elementId, rx = 0.5, ry = 0.5) {
  return ev(`(()=>{const e=xapi.getSceneElements().find(e=>e.id==='${elementId}'),s=xapi.getAppState();return {x:(e.x+e.width*${rx}+s.scrollX)*s.zoom.value+s.offsetLeft,y:(e.y+e.height*${ry}+s.scrollY)*s.zoom.value+s.offsetTop}})()`);
}
async function editText(id, value) {
  const point = await pointer(id);
  await cdp('Input.dispatchMouseEvent', {type:'mouseMoved',...point});
  for (const clickCount of [1,2]) for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount });
  await wait("!!document.querySelector('textarea.excalidraw-wysiwyg')");
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65, modifiers: 2 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65, modifiers: 2 });
  await cdp('Input.insertText', { text: value }); await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await wait(`xapi.getSceneElements().find(e=>e.id==='${id}').text===${JSON.stringify(value)}`);
}
async function stableCanvas() {
  await canvas();
  let last='', repeats=0;
  for(let i=0;i<160;i++){
    const value=JSON.stringify(await ev('(()=>{const s=xapi.getAppState();return [s.zoom.value,s.scrollX,s.scrollY,s.width,s.height,dv.semaphores.justLoaded]})()'));
    repeats=value===last?repeats+1:0;last=value;if(repeats===5)return;await pause(50);
  }
  throw Error('Canvas camera did not settle');
}
async function capture(name) {
  await stableCanvas();
  const m=await ev(`(()=>{const s=xapi.getAppState(),doc=dv.contentEl.ownerDocument;
    const rect=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}};
    const boxes=xapi.getSceneElements().map(e=>{const b=app.plugins.plugins['obsidian-excalidraw-plugin'].ea.getBoundingBox([e]);return {id:e.id,type:e.type,x:(b.topX+s.scrollX)*s.zoom.value+s.offsetLeft,y:(b.topY+s.scrollY)*s.zoom.value+s.offsetTop,width:b.width*s.zoom.value,height:b.height*s.zoom.value,link:e.link,text:e.text}});
    return {zoom:s.zoom.value,scrollX:s.scrollX,scrollY:s.scrollY,viewport:{x:s.offsetLeft,y:s.offsetTop,width:s.width,height:s.height},classes:[...doc.body.classList].filter(c=>c.startsWith('theme-')),boxes,toolbars:[...dv.contentEl.querySelectorAll('.App-toolbar,.App-menu_top,.App-menu_bottom,.App-bottom-bar,.excalidraw-mobile-tools')].map(e=>({class:e.className,...rect(e)})),api:{setViewport:typeof xapi.setViewport,zoomToFit:typeof xapi.zoomToFit},sceneHash:null,dirty:dv.isDirty()};})()`);
  m.sceneHash=sha(JSON.stringify(await ev('xapi.getSceneElements()')));m.file=name+'.png';
  const v=m.viewport, title=m.boxes.find(e=>e.id==='vtitle00');
  const top=m.toolbars.filter(t=>t.y<v.y+100&&t.width>0), toolbarBottom=Math.max(v.y,...top.map(t=>t.y+t.height));
  m.titleBelowToolbar=title.y>=toolbarBottom+4;
  m.clipped=m.boxes.filter(e=>e.x<v.x||e.y<v.y||e.x+e.width>v.x+v.width||e.y+e.height>v.y+v.height).map(e=>e.id);
  report.frames.push(m);await shot(name);
  if(phase==='after'){assert(m.titleBelowToolbar,`${name}: title intersects toolbar`);assert.equal(m.dirty,false,`${name}: viewport made the file dirty`);assert.equal(m.clipped.length,0,`${name}: clipped ${m.clipped}`);}
  return m;
}
async function make(caseName,kind,direction,theme) {
  await studioOpen();if(await ev("!!document.querySelector('[data-studio-action=diagram-new]')"))await click('diagram-new');
  await ev(`{document.querySelector('.veynrel-studio input[value=${kind}]').click();const q=document.querySelector('.veynrel-studio input[type=search]');q.value='Source';q.dispatchEvent(new Event('input'));const source=[...document.querySelectorAll('.veynrel-studio-picker label')].find(e=>e.textContent==='Source.md');if(!source.querySelector('input').checked)source.querySelector('input').click();const folder=[...document.querySelectorAll('.veynrel-studio-field select')].find(s=>[...s.options].some(o=>o.value==='Drawings'));folder.value='Drawings';folder.dispatchEvent(new Event('change'));const t=document.querySelector('[data-diagram-field=name]');t.value=${JSON.stringify(caseName)};t.dispatchEvent(new Event('input'));}void 0`);
  const count=report.requests.length;await click('diagram-prepare');await wait("!d.running&&d.state==='prepared'");assert.equal(report.requests.length,count);
  const body=await ev('d.prepared.body');await click('diagram-generate');await wait("!d.running&&d.state==='review'");assert.deepEqual(report.requests.slice(count),[body]);
  await ev(`d.revise(d.proposal,{direction:'${direction}',theme:'${theme}'},d.proposal.target)`);
  await click('diagram-create-review');await click('diagram-confirm-create',true);await wait('!d.running&&!!d.result');
  assert.equal(await ev('d.result.state'),'created');
  fs.copyFileSync(`${vault}/Drawings/${caseName}.excalidraw.md`,`${root}/${caseName}.excalidraw.md`);
  const rawHash=sha(fs.readFileSync(`${vault}/Drawings/${caseName}.excalidraw.md`));
  await ev('window.nativeTarget=d.proposal.target;void 0');await click('diagram-open');await stableCanvas();
  return {rawHash,path:`Drawings/${caseName}.excalidraw.md`};
}
async function key(key,code,value,modifiers=0) {
  for(const type of ['keyDown','keyUp'])await cdp('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:value,nativeVirtualKeyCode:value,modifiers});
}
async function interactions() {
  const requests=report.requests.length,target='Drawings/flow-1300.excalidraw.md';
  await ev("app.workspace.getLeavesOfType('excalidraw').forEach(l=>l.detach());app.workspace.getLeavesOfType('markdown').forEach(l=>l.detach());void 0");
  await cdp('Emulation.setDeviceMetricsOverride',{width:1300,height:950,deviceScaleFactor:1,mobile:false});
  await ev(`window.nativeTarget=${JSON.stringify(target)};d.adapter.open(nativeTarget)`);await stableCanvas();
  await cdp('Page.bringToFront');await key('!','Digit1',49,8);await stableCanvas();
  report.nativeFit=await ev('({zoom:xapi.getAppState().zoom.value,scrollX:xapi.getAppState().scrollX,scrollY:xapi.getAppState().scrollY})');
  await shot('native-fit');
  const beforePan=await ev('({x:xapi.getAppState().scrollX,y:xapi.getAppState().scrollY,zoom:xapi.getAppState().zoom.value})');
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:1080,y:560,button:'middle',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:1140,y:580,button:'middle',buttons:4});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:1140,y:580,button:'middle',clickCount:1});
  await stableCanvas();const pan=await ev('({x:xapi.getAppState().scrollX,y:xapi.getAppState().scrollY,zoom:xapi.getAppState().zoom.value})');assert.notDeepEqual(pan,beforePan);
  await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',x:1000,y:600,deltaY:80,deltaX:0,modifiers:2});await stableCanvas();
  const manual=await ev('({x:xapi.getAppState().scrollX,y:xapi.getAppState().scrollY,zoom:xapi.getAppState().zoom.value})');assert.notEqual(manual.zoom,pan.zoom);
  await ev("xapi.refresh();app.workspace.trigger('layout-change');d.emit();void 0");await stableCanvas();
  const afterRedraw=await ev('({x:xapi.getAppState().scrollX,y:xapi.getAppState().scrollY,zoom:xapi.getAppState().zoom.value})');assert.deepEqual(afterRedraw,manual);
  await ev("app.workspace.revealLeaf(app.workspace.getLeavesOfType('veynrel-studio')[0])");await ev('d.adapter.open(nativeTarget)');await stableCanvas();
  assert.deepEqual(await ev('({x:xapi.getAppState().scrollX,y:xapi.getAppState().scrollY,zoom:xapi.getAppState().zoom.value})'),manual);
  await key('!','Digit1',49,8);await stableCanvas();
  await editText('vt000000','Edited request');await editText('vl000002','Needs details');
  const before=await ev("({node:xapi.getSceneElements().find(e=>e.id==='vn000000'),arrow:xapi.getSceneElements().find(e=>e.id==='ve000000')})"),p=await pointer('vn000000',.15,.15);
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
  for(let i=1;i<=10;i++)await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+4*i,y:p.y+2*i,button:'left',buttons:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+40,y:p.y+20,button:'left',clickCount:1});
  const after=await ev("({node:xapi.getSceneElements().find(e=>e.id==='vn000000'),arrow:xapi.getSceneElements().find(e=>e.id==='ve000000')})");assert.notEqual(before.node.x,after.node.x);assert.equal(after.arrow.startBinding.elementId,after.node.id);assert.notDeepEqual(before.arrow.points,after.arrow.points);
  await key('s','KeyS',83,2);await wait('!dv.isDirty()');await shot('native-edited-saved');
  await wait("app.vault.read(dv.file).then(raw=>raw.includes('Edited request ^vt000000')&&raw.includes('Needs details ^vl000002'))");
  const savedCamera=await ev('({x:xapi.getAppState().scrollX,y:xapi.getAppState().scrollY,zoom:xapi.getAppState().zoom.value})');
  await ev("dv.leaf.detach();void 0");await wait("!app.workspace.getLeavesOfType('excalidraw').some(l=>l.view===dv)");
  await ev('d.adapter.open(nativeTarget)');await stableCanvas();
  await pass('Native edits, bound arrow movement and explicit save survive reopening',"xapi.getSceneElements().find(e=>e.id==='vt000000').text==='Edited request'&&xapi.getSceneElements().find(e=>e.id==='vl000002').text==='Needs details'&&xapi.getSceneElements().find(e=>e.id==='ve000000').startBinding.elementId==='vn000000'");
  assert.deepEqual(await ev('({x:xapi.getAppState().scrollX,y:xapi.getAppState().scrollY,zoom:xapi.getAppState().zoom.value})'),savedCamera);
  const link=await pointer('vsource0');
  for(let i=0;i<2;i++)for(const type of ['mousePressed','mouseReleased'])await cdp('Input.dispatchMouseEvent',{type,...link,button:'left',clickCount:1,modifiers:2});
  await wait("app.workspace.getLeavesOfType('markdown').some(l=>l.view.file?.path==='Source.md')");
  await pass('Actual Ctrl-click on the native caption opens the one source note');
  await ev('d.adapter.open(nativeTarget)');await stableCanvas();
  await ev("app.workspace.getLeavesOfType('markdown').forEach(l=>l.detach());void 0");
  await key('Escape','Escape',27);await key('Escape','Escape',27);
  const caption=await pointer('vsource0');
  for(const type of ['mousePressed','mouseReleased'])await cdp('Input.dispatchMouseEvent',{type,...caption,button:'right',clickCount:1});
  await wait("xapi.getAppState().selectedElementIds.vsource0&&!xapi.getAppState().editingTextElement");
  await wait("[...document.querySelectorAll('button.context-menu-item')].some(e=>/Edit link/i.test(e.textContent))");
  const editLink=await ev("(()=>{const e=[...document.querySelectorAll('button.context-menu-item')].find(e=>/Edit link/i.test(e.textContent)),b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()");
  for(const type of ['mousePressed','mouseReleased'])await cdp('Input.dispatchMouseEvent',{type,...editLink,button:'left',clickCount:1});
  await wait("!!document.querySelector('.excalidraw-hyperlinkContainer-input')");
  await key('Escape','Escape',27);await wait("!!document.querySelector('a.excalidraw-hyperlinkContainer-link')");
  for(let i=0;i<40&&!await ev("document.activeElement?.matches('a.excalidraw-hyperlinkContainer-link')");i++)await key('Tab','Tab',9);
  assert(await ev("document.activeElement?.matches('a.excalidraw-hyperlinkContainer-link')"));await shot('native-caption-keyboard');
  await key('Enter','Enter',13,2);await wait("app.workspace.getLeavesOfType('markdown').some(l=>l.view.file?.path==='Source.md')");
  await pass('Native source-link popup is reachable by Tab and opens with Ctrl+Enter');
  await ev("window.popoutLeaf=app.workspace.openPopoutLeaf();popoutLeaf.setViewState({type:'excalidraw',state:{file:window.nativeTarget},active:true})");
  let previousPopout='',stablePopout=0;
  for(let i=0;i<200;i++){
    const snapshot=await ev("(()=>{const v=popoutLeaf.view,api=v.excalidrawAPI;if(!api||api.isDestroyed||!v.isLoaded||v.semaphores.justLoaded||v.semaphores.windowMigrating)return null;const e=api.getSceneElements();return {differentWindow:v.containerEl.ownerDocument.defaultView!==document.defaultView,sourceLink:e.find(e=>e.id==='vsource0')?.link,nodeText:e.find(e=>e.id==='vt000000')?.text}})()");
    const encoded=JSON.stringify(snapshot);stablePopout=snapshot&&encoded===previousPopout?stablePopout+1:0;previousPopout=encoded;
    if(stablePopout===5){report.popout=snapshot;break}await pause(50);
  }
  assert(report.popout?.differentWindow);assert.equal(report.popout.sourceLink,'[[Source.md]]');assert.equal(report.popout.nodeText,'Edited request');
  await ev('popoutLeaf.detach();void 0');
  report.interaction={beforePan,pan,manual,afterRedraw,savedCamera,movement:{before,after},savedHash:sha(fs.readFileSync(`${vault}/${target}`))};
  fs.copyFileSync(`${vault}/${target}`,`${root}/edited.excalidraw.md`);assert.equal(report.requests.length,requests);
  await pass('Pan, zoom, redraw, tab reuse, reopen and popout make no additional provider requests');
}
report.frames=[];report.phase=phase;report.modelQuality='NOT RE-EVALUATED';report.remoteInferenceRequests=0;
try{
 child=start();await connect();await studioOpen();
 await ev("app.plugins.enablePluginAndSave('obsidian-excalidraw-plugin')");await wait("d.adapter.capability().state==='ready'");await ev("document.querySelectorAll('.modal-close-button').forEach(e=>e.click());app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();void 0");
 report.versions=await ev("({obsidian:document.title.match(/Obsidian ([0-9.]+)/)?.[1],electron:process.versions.electron,excalidraw:app.plugins.plugins['obsidian-excalidraw-plugin'].manifest.version})");
 for(const [key,fixture] of Object.entries(fixtures))for(const width of [1300,720,390]){
   graph=fixture;const mode=width===720?'light':'dark',language=key==='flow'?'ru':'en';
   await ev("app.workspace.getLeavesOfType('excalidraw').forEach(l=>l.detach());app.workspace.getLeavesOfType('markdown').forEach(l=>l.detach());void 0");
   await cdp('Emulation.setDeviceMetricsOverride',{width:width===720?1500:width,height:950,deviceScaleFactor:1,mobile:false});
   await locale(language);await ev(`app.changeTheme('${mode==='light'?'moonstone':'obsidian'}');void 0`);await wait(`document.body.classList.contains('theme-${mode}')&&!document.body.classList.contains('theme-${mode==='light'?'dark':'light'}')`);
   if(width===720)await ev("(async()=>{const leaf=app.workspace.getLeaf('split');await leaf.openFile(app.vault.getFileByPath('Source.md'));await app.workspace.revealLeaf(app.workspace.getLeavesOfType('veynrel-studio')[0]);})()");
   const name=`${key}-${width}`,direction=key==='stress'?'right':'down',style=key==='flow'?'amethyst':'neutral';
   const created=await make(name,fixture.kind,direction,style);const m=await capture(`${phase}-${name}`);Object.assign(m,{key,width,mode,language,direction,style,created});
   report.checks.push(`${name}: create and explicit Open with unchanged source`);
   assert.equal(sha(fs.readFileSync(`${vault}/Source.md`)),sha(originals['Source.md']));
   if(phase==='after')assert.equal(sha(fs.readFileSync(`${vault}/${created.path}`)),created.rawHash,'Open/fit must not rewrite a drawing');
 }
 report.createdHashes=report.frames.map(f=>({path:f.created.path,before:f.created.rawHash,after:sha(fs.readFileSync(`${vault}/${f.created.path}`))}));
 if(phase==='after'){
  assert(report.createdHashes.every(f=>f.before===f.after),'First open and closing tabs must not write drawings');
  await interactions();
  graph=fixtures.structure;await locale('en');await ev("app.changeTheme('moonstone');app.plugins.plugins['obsidian-excalidraw-plugin'].settings.zoomToFitOnOpen=true;void 0");
  const created=await make('default-fit-enabled','structure','down','neutral');
  report.defaultFitEnabled=await capture('after-default-fit-enabled');
  assert.equal(sha(fs.readFileSync(`${vault}/${created.path}`)),created.rawHash);report.defaultFitEnabled.created=created;
 }
 const history=await ev('d.history().then(rows=>rows.map(r=>({id:r.entry.id,state:r.state})))');assert.equal(history.find(r=>r.id===legacy.id).state,'created');
 assert.equal(sha(fs.readFileSync(`${vault}/${legacy.target}`)),legacyHash);report.legacy={id:legacy.id,state:'created',before:legacyHash,after:legacyHash};
 for(const [path,raw] of Object.entries(originals))assert.equal(sha(fs.readFileSync(`${vault}/${path}`)),sha(raw));
 report.outcome='PASS';report.sourceHashes=Object.fromEntries(Object.keys(originals).map(p=>[p,sha(fs.readFileSync(`${vault}/${p}`))]));
}catch(e){report.outcome='FAIL';report.error=String(e.stack||e);try{report.ui=await ev('document.body.innerText.slice(-5000)');await shot('failure')}catch{}process.exitCode=1;console.error(e)}finally{
 fs.writeFileSync(`${root}/native-report.json`,JSON.stringify(report,null,2));socket?.close();child?.kill('SIGTERM');server.closeAllConnections();server.close();console.log(JSON.stringify({outcome:report.outcome,frames:report.frames.length,requests:report.requests.length,exceptions:report.exceptions.length,root}));
}
