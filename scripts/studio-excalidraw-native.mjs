// Synthetic native acceptance: npm run build, then node scripts/studio-excalidraw-native.mjs
// /tmp/veynrel-diagram-native-<unique> /tmp/veynrel-excalidraw-2.29.0-assets
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
const graph = { schemaVersion: 1, kind: 'flowchart', title: 'Request processing', nodes: [
  { id: 'receive', label: 'Receive request', shape: 'rectangle' }, { id: 'check', label: 'Data valid?', shape: 'diamond' },
  { id: 'accept', label: 'Accept', shape: 'ellipse' }, { id: 'reject', label: 'Ask for corrections', shape: 'rectangle' },
  { id: 'glossary', label: 'Glossary\n![[Untouched]] [link](https://model-data.invalid/x) obsidian://open <script>', shape: 'rectangle' },
], edges: [{ id: 'e1', from: 'receive', to: 'check', label: '' }, { id: 'e2', from: 'check', to: 'accept', label: 'Yes' },
  { id: 'e3', from: 'check', to: 'reject', label: 'No' }, { id: 'e4', from: 'reject', to: 'receive', label: 'Retry' }] };
const sha = raw => createHash('sha256').update(raw).digest('hex');
const report = { checks: [], screenshots: [], exceptions: [], network: [], artifacts: {}, versions: {}, requests: [],
  limits: 'Synthetic model via real callOpenRouter/requestUrl HTTP path. No paid API or real-model quality claim. Linux desktop only; no physical mobile or screen-reader claim.' };
for (const [id, from] of [['ai-knowledge-hub', ROOT], ['obsidian-excalidraw-plugin', assets]]) {
  const to = `${config}/plugins/${id}`; fs.mkdirSync(to);
  for (const name of ['main.js', 'styles.css', 'manifest.json']) { fs.copyFileSync(`${from}/${name}`, `${to}/${name}`); report.artifacts[`${id}/${name}`] = sha(fs.readFileSync(`${to}/${name}`)); }
}
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
  const output = { ...graph, kind }; if (providerMode === 'missing-label') output.edges = graph.edges.map(({label, ...edge}) => edge);
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
fs.writeFileSync(`${config}/plugins/obsidian-excalidraw-plugin/data.json`, JSON.stringify({ checkForUpdates: false, showReleaseNotes: false, showWelcomeModal: false, autoexportSVG: true, autoexportPNG: true, autoexportExcalidraw: false, compress: true, matchTheme: true, enableOnloadScripts: false, startupScriptPath: '', templateFilePath: 'Untouched.md' }));
// Begin with Excalidraw installed but disabled; enable only inside this disposable vault.
fs.writeFileSync(`${config}/community-plugins.json`, '["ai-knowledge-hub"]');
fs.writeFileSync(`${config}/app.json`, '{"checkForUpdates":false}');
fs.writeFileSync(`${profile}/obsidian.json`, JSON.stringify({ updateDisabled: true, vaults: { diagrams: { path: vault, ts: Date.now(), open: true } } }));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const start = () => spawn('/usr/bin/electron43', ['/usr/lib/obsidian/app.asar', `--user-data-dir=${profile}`, '--remote-debugging-port=9291', '--disable-gpu', '--ozone-platform=x11'], { stdio: ['ignore', 'ignore', fs.openSync(`${root}/electron.log`, 'a')] });
let child, socket, sequence = 0;
const pending = new Map();
const cdp = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++sequence, { resolve, reject }); socket.send(JSON.stringify({ id: sequence, method, params })); });
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
async function canvas() { await wait("!!app.workspace.getLeavesOfType('excalidraw').find(l=>l.view.file?.path==='Drawings/Native.excalidraw.md')?.view.excalidrawAPI"); await ev("window.dv=app.workspace.getLeavesOfType('excalidraw').find(l=>l.view.file?.path==='Drawings/Native.excalidraw.md').view;window.xapi=dv.excalidrawAPI;void 0"); }
async function pointer(elementId, rx = 0.5, ry = 0.5) {
  return ev(`(()=>{const e=xapi.getSceneElements().find(e=>e.id==='${elementId}'),s=xapi.getAppState();return {x:(e.x+e.width*${rx}+s.scrollX)*s.zoom.value+s.offsetLeft,y:(e.y+e.height*${ry}+s.scrollY)*s.zoom.value+s.offsetTop}})()`);
}
async function editText(id, value) {
  const point = await pointer(id);
  await cdp('Input.dispatchMouseEvent', {type:'mouseMoved',...point});
  for (const clickCount of [1,2]) for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount });
  await wait("!!document.querySelector('textarea.excalidraw-wysiwyg')");
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 });
  await cdp('Input.insertText', { text: value }); await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
  await wait(`xapi.getSceneElements().find(e=>e.id==='${id}').text===${JSON.stringify(value)}`);
}
async function restart() { report.transportTiming = await ev('studioTransportTiming'); fs.writeFileSync(`${config}/plugins/ai-knowledge-hub/data.json`, JSON.stringify({ language: 'en', provider: 'openrouter', model: 'synthetic/diagram', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'synthetic-not-a-key', semanticAutoSyncSuspended: true, semantic: { enabled: false }, decisions: { enabled: false }, companion: { enabled: false }, health: { onboardingCompleted: true } })); socket.close(); const ended = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await ended; child = start(); await connect(); }
try {
  child = start(); await connect(); await studioOpen();
  report.versions = await ev("({obsidian:document.title.match(/Obsidian ([0-9.]+)/)?.[1],electron:process.versions.electron,chrome:process.versions.chrome,excalidraw:'2.29.0'})");
  report.artifacts.obsidianAsar = sha(fs.readFileSync('/usr/lib/obsidian/app.asar'));
  await pass('Veynrel works with Excalidraw disabled; diagram sending is blocked', "d.adapter.capability().state==='unavailable'&&document.querySelector('[data-studio-action=diagram-prepare]').disabled&&studio.registry.list().length===3");
  assert.equal(report.requests.length, 0); await shot('unavailable');
  await ev("app.plugins.enablePluginAndSave('obsidian-excalidraw-plugin')");
  await wait("app.plugins.plugins['obsidian-excalidraw-plugin']?.ea?.getAPI");
  // Close the optional onboarding modal in this synthetic profile only.
  await ev("document.querySelectorAll('.modal-close-button').forEach(e=>e.click());void 0");
  await wait("d.adapter.capability().state==='ready'"); await click('diagram-refresh');
  await ev("(async()=>{const leaf=app.workspace.getLeaf('split');await leaf.openFile(app.vault.getFileByPath('Source.md'));await app.workspace.revealLeaf(app.workspace.getLeavesOfType('veynrel-studio')[0]);})()");
  // First path uses the actual Studio controls, consent button, preview and final confirmation.
  await ev("{document.querySelector('.veynrel-studio input[value=flowchart]').click();const query=document.querySelector('.veynrel-studio input[type=search]');query.value='Source';query.dispatchEvent(new Event('input'));const source=[...document.querySelectorAll('.veynrel-studio-picker label')].find(e=>e.textContent==='Source.md');source.querySelector('input').click();const folder=[...document.querySelectorAll('.veynrel-studio-field')].find(e=>e.textContent.includes('Existing destination folder')).querySelector('select');folder.value='Drawings';folder.dispatchEvent(new Event('change'));const t=document.querySelector('[data-diagram-field=name]');t.value='Native';t.dispatchEvent(new Event('input'));}void 0");
  await click('diagram-prepare'); await wait("!d.running&&d.state==='prepared'"); assert.equal(report.requests.length, 0);
  const body = await ev('d.prepared.body'); await shot('consent-en-dark');
  await click('diagram-generate'); await wait("!d.running&&d.state==='review'"); assert.deepEqual(report.requests, [body]);
  await pass('Real transport produces SVG preview and structure with zero drawing writes', "!!document.querySelector('.veynrel-diagram-preview svg')&&d.proposal.spec.nodes.length===5&&io.creates.length===0");
  await pass('Inert model labels do not resolve hidden notes or resources', "!io.reads.includes('Untouched.md')&&!document.querySelector('.veynrel-diagram-preview image,.veynrel-diagram-preview foreignObject,.veynrel-diagram-preview a')");
  await shot('review-en-dark-split');
  await ev("app.workspace.getLeavesOfType('markdown').forEach(l=>l.detach());void 0");
  await ev("d.revise(d.proposal,{direction:'right',theme:'amethyst'},d.proposal.target)");
  await click('diagram-zoom-in'); await click('diagram-fit');
  await ev("document.body.removeClass('theme-dark');document.body.addClass('theme-light');void 0"); await shot('review-en-light-amethyst');
  await ev('app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();void 0');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }); await ev("document.querySelector('.veynrel-studio').scrollTop=0;void 0"); await pause(200); await shot('review-390');
  await pass('390px preview fits the Studio pane', "document.querySelector('.veynrel-studio').scrollWidth<=document.querySelector('.veynrel-studio').clientWidth+1");
  await locale('ru'); await shot('review-ru-390-light');
  await pass('Russian Review renders native controls and remains within 390px', "document.querySelector('.veynrel-studio').textContent.includes('Проверка перед созданием')&&document.querySelector('.veynrel-studio').scrollWidth<=document.querySelector('.veynrel-studio').clientWidth+1");
  await ev("document.body.removeClass('theme-light');document.body.addClass('theme-dark');void 0"); await shot('review-ru-390-dark');
  await locale('en'); await cdp('Emulation.clearDeviceMetricsOverride');
  await click('diagram-fit'); await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab'}); await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab'});
  await pass('Keyboard Tab reaches preview zoom control', "document.activeElement?.getAttribute('data-studio-action')==='diagram-zoom-in'");
  await ev("(async()=>{const leaf=app.workspace.getLeaf('split');await leaf.openFile(app.vault.getFileByPath('Source.md'));await app.workspace.revealLeaf(app.workspace.getLeavesOfType('veynrel-studio')[0]);})()");
  await pass('Preview does not consume global modifier shortcuts', "(()=>{const e=new KeyboardEvent('keydown',{key:'+',ctrlKey:true,cancelable:true});document.querySelector('.veynrel-diagram-preview').dispatchEvent(e);return !e.defaultPrevented})()");
  const uxRequestCount = report.requests.length;
  await click('diagram-zoom-in');
  await ev("window.uxPreview=document.querySelector('.veynrel-diagram-preview');window.uxZoom=uxPreview.querySelector('svg').style.width;d.emit();void 0");
  await pass('Unrelated workflow event retains exact preview DOM and zoom', "document.querySelector('.veynrel-diagram-preview')===uxPreview&&uxPreview.querySelector('svg').style.width===uxZoom");
  await ev("{const e=[...document.querySelectorAll('.veynrel-studio-field')].find(e=>e.textContent.includes('Direction')).querySelector('select');for(let a=e.parentElement;a;a=a.parentElement)if(a.tagName==='DETAILS')a.open=true;e.value=e.value==='down'?'right':'down';e.dispatchEvent(new Event('change'));}void 0");
  await pass('Changed appearance invalidates create until local preview update', "document.querySelector('[data-studio-action=diagram-create-review]').disabled");
  await ev('d.emit();void 0');await pass('Status event preserves changed preview draft and keeps create blocked',"document.querySelector('[data-studio-action=diagram-create-review]').disabled");
  await click('diagram-revise'); await wait("!d.running&&!document.querySelector('[data-studio-action=diagram-create-review]').disabled");
  assert.equal(report.requests.length,uxRequestCount);report.checks.push('Actual local preview action changes no provider request count');
  await click('diagram-create-review'); await click('diagram-confirm-create', true); await wait('!d.running&&!!d.result');
  report.firstResult = await ev('d.result'); assert.equal(report.firstResult.state, 'created');
  await pass('Creates exactly the reviewed file while the saved source editor stays open', "io.creates.length===1&&io.creates[0]===d.proposal.target&&app.workspace.getLeavesOfType('markdown').some(l=>l.view.file?.path==='Source.md')");
  fs.copyFileSync(`${vault}/Drawings/Native.excalidraw.md`, `${root}/reviewed.excalidraw.md`);
  report.plan = await ev('d.proposal'); await ev('d.create(d.proposal)'); await pass('Repeated confirmation does not create a second drawing', 'io.creates.length===1');
  await click('diagram-open'); await canvas();
  await ev("app.workspace.getLeavesOfType('markdown').forEach(l=>l.detach());void 0");
  await ev("dv.zoomToFit(false);void 0"); await pause(700);
  report.openScene = await ev('xapi.getSceneElements()');
  await pass('Actual Excalidraw opens separate native shapes/text/arrows with live bindings', "xapi.getSceneElements().filter(e=>e.type==='arrow').every(e=>e.startBinding&&e.endBinding)&&xapi.getSceneElements().filter(e=>e.type==='text'&&e.containerId).length===9&&!xapi.getSceneElements().some(e=>['image','embeddable'].includes(e.type))");
  await shot('native-open');
  await ev('dv.forceSave(true,true)');
  report.afterOpenHistory = await ev('d.history().then(r=>r.map(r=>({state:r.state,id:r.entry.id})))');
  assert.equal(report.afterOpenHistory[0].state, 'created', 'native normalization is still a verified scene');
  await editText('vt000000', 'Edited request');
  await pass('Native double-click and keyboard edit an individual bound text element');
  await editText('vl000002', 'Confirmed');
  await pass('Native arrow label is separately editable');
  const before = await ev("({node:xapi.getSceneElements().find(e=>e.id==='vn000000'),arrow:xapi.getSceneElements().find(e=>e.id==='ve000000')})");
  const drag = await pointer('vn000000', 0.15, 0.15);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...drag, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 10; i++) await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: drag.x + i * 6, y: drag.y + i * 3, button: 'left', buttons: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: drag.x + 60, y: drag.y + 30, button: 'left', clickCount: 1 });
  const after = await ev("({node:xapi.getSceneElements().find(e=>e.id==='vn000000'),arrow:xapi.getSceneElements().find(e=>e.id==='ve000000')})");
  report.movement = { before, after }; assert.notEqual(after.node.x, before.node.x); assert.equal(after.arrow.startBinding.elementId, after.node.id);
  assert.notDeepEqual([after.arrow.x, after.arrow.y, after.arrow.points], [before.arrow.x, before.arrow.y, before.arrow.points]);
  await pass('Native pointer drag moves the block and its bound arrow');
  await ev('dv.forceSave(true,true)'); await shot('native-edited-moved');
  await ev("app.workspace.getLeavesOfType('excalidraw').forEach(l=>l.detach());void 0");
  await ev("d.adapter.open('Drawings/Native.excalidraw.md')"); await canvas();
  await pass('Save and reopen retain edited text and bindings', "xapi.getSceneElements().find(e=>e.id==='vt000000').text==='Edited request'&&xapi.getSceneElements().find(e=>e.id==='vl000002').text==='Confirmed'&&xapi.getSceneElements().find(e=>e.id==='ve000000').startBinding.elementId==='vn000000'");
  await ev("dv.onLinkOpen(xapi.getSceneElements().find(e=>e.id==='vsource0'),{preventDefault(){},detail:{nativeEvent:new MouseEvent('click',{ctrlKey:true})}})");
  await wait("app.workspace.getLeavesOfType('markdown').some(l=>l.view.file?.path==='Source.md')"); await pass('Native Excalidraw local source-link handler opens the actual source note');
  await pass('History identifies later user edits', "d.history().then(rows=>rows[0].state==='changed-unavailable')");
  for (const [path, raw] of Object.entries(originals)) assert.equal(sha(fs.readFileSync(`${vault}/${path}`)), sha(raw));
  await pass('All original Markdown hashes remain unchanged');
  // Cover unavailable-between-review, cancellation, incomplete response and shared tab ownership.
  await studioOpen(); await generate('Drawings/Disabled.excalidraw.md');
  await ev("app.workspace.getLeavesOfType('excalidraw').forEach(l=>l.detach());void 0"); await ev("app.plugins.disablePluginAndSave('obsidian-excalidraw-plugin')");
  await pass('Disabling Excalidraw after Review refuses creation', "d.create(d.proposal).then(()=>false,e=>e.code==='unavailable')");
  await ev("app.plugins.enablePluginAndSave('obsidian-excalidraw-plugin')"); await wait("d.adapter.capability().state==='ready'");
  await pass('Reloaded Excalidraw invalidates the old Review before intent or create', "d.create(d.proposal).then(()=>false,e=>e.code==='reloaded')");
  providerMode = 'length'; await prepare('Drawings/Incomplete.excalidraw.md'); await pass('Incomplete transport response never produces a scene', "d.generate(d.prepared).then(()=>false,e=>e.code==='provider'&&!d.proposal)"); providerMode = 'normal';
  const savedBuffer = await ev("app.workspace.getLeavesOfType('markdown').find(l=>l.view.file?.path==='Source.md').view.getViewData()");
  await pass('Unsaved native buffer blocks preparation before any request', "(async()=>{const v=app.workspace.getLeavesOfType('markdown').find(l=>l.view.file?.path==='Source.md').view,old=v.getViewData;v.getViewData=()=>old.call(v)+'unsaved';try{await d.prepare('structure','Source.md','Drawings/Unsaved.excalidraw.md',{direction:'down',theme:'neutral'},32768);return false}catch(e){return e.code==='unsaved'}finally{v.getViewData=old}})()");
  assert.equal(savedBuffer, originals['Source.md']);
  providerMode = 'defer'; await prepare('Drawings/Cancel.excalidraw.md');
  await ev("window.pendingDiagram=d.generate(d.prepared).then(()=>false,e=>e.code==='cancelled');void 0");
  for (let i = 0; i < 100 && !releaseProvider; i++) await pause(50); assert(releaseProvider);
  await ev("(async()=>{const leaf=app.workspace.getLeaf('split');await leaf.setViewState({type:'veynrel-studio',active:true});})()");
  await pass('Two actual Studio leaves share the same busy diagram owner', "app.workspace.getLeavesOfType('veynrel-studio').every(l=>l.view.owner.diagrams===d)&&d.running&&studio.operations.busy");
  await pass('Markdown cannot start during diagram generation', "studio.runner.prepare(studio.registry.list()[0],{language:'source',instructions:''},{paths:['Source.md']},32768).then(()=>false,e=>e.code==='busy')");
  await ev('d.cancel();void 0'); releaseProvider(); await pass('Cancel discards the issued result and releases only after transport settles', 'pendingDiagram'); providerMode = 'normal';
  providerMode = 'missing-label'; await prepare('Drawings/Invalid.excalidraw.md');
  await pass('Missing required edge labels are rejected without repair or creation', "d.generate(d.prepared).then(()=>false,e=>e.code==='spec'&&!d.proposal&&!app.vault.getAbstractFileByPath('Drawings/Invalid.excalidraw.md'))"); providerMode = 'normal';
  for (const late of ['success', 'http-error']) {
    providerMode = 'defer'; releaseProvider = undefined; await prepare(`Drawings/Timeout-${late}.excalidraw.md`);
    const beforeTimeout = report.requests.length;
    await ev("window.timedDiagram=d.generate(d.prepared).then(()=>({unexpected:true}),e=>({code:e.code}));void 0");
    while (!releaseProvider) await pause(20);
    await pause(30_100);
    await pass(`Native timeout stays distinct before late ${late}`, "(async()=>{const r=await timedDiagram;return r.code==='timeout'&&d.error==='timeout'&&!d.proposal&&!d.canCreate})()");
    await shot(`timeout-${late}`);
    await prepare(`Drawings/After-timeout-${late}.excalidraw.md`); const newId = await ev('d.prepared.id');
    providerMode = late === 'success' ? 'normal' : 'late-http'; releaseProvider(); await pause(300);
    assert.equal(report.requests.length, beforeTimeout + 1);
    await pass(`Late ${late} cannot revive the old proposal or replace new consent`, `d.state==='prepared'&&d.prepared.id===${JSON.stringify(newId)}&&!d.proposal&&!app.vault.getAbstractFileByPath('Drawings/Timeout-${late}.excalidraw.md')`);
    providerMode = 'normal';
  }
  const count = report.requests.length; await restart(); assert.equal(report.requests.length, count);
  await pass('Restart never replays generation or creation', 'd.proposal===undefined&&io.creates.length===0');
  report.historyAfterRestart = await ev('d.history().then(rows=>rows.map(r=>({state:r.state,target:r.entry.intent?.target})))');
  const drawingFiles = fs.readdirSync(`${vault}/Drawings`); assert.deepEqual(drawingFiles, ['Native.excalidraw.md']);
  await pass('No automatic PNG, SVG, legacy export, temporary or duplicate drawing files');
  assert(!report.network.some(r => r.url.includes('model-data.invalid')), 'no model-controlled network requests');
  report.sourceHashes = Object.fromEntries(Object.keys(originals).map(path => [path, sha(fs.readFileSync(`${vault}/${path}`))]));
  report.finalScene = await ev("d.adapter.read('Drawings/Native.excalidraw.md')");
  fs.copyFileSync(`${vault}/Drawings/Native.excalidraw.md`, `${root}/edited.excalidraw.md`);
  report.finalTransportTiming = await ev('studioTransportTiming'); report.outcome = 'PASS';
} catch (e) {
  report.outcome = 'FAIL'; report.error = String(e?.stack ?? e);
  try { report.ui = await ev('document.body.innerText.slice(-6000)'); report.runtime = await ev('({state:d.state,error:d.error,result:d.result,capability:d.adapter.capability()})'); await shot('failure'); } catch {}
  console.error(e); process.exitCode = 1;
} finally {
  fs.writeFileSync(`${root}/native-report.json`, JSON.stringify(report, null, 2));
  socket?.close(); child?.kill('SIGTERM'); server.closeAllConnections(); server.close();
}
