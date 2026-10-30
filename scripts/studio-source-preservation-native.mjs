// Synthetic-only native acceptance. Build first, then:
// node scripts/studio-source-preservation-native.mjs /tmp/veynrel-studio-native-<unique-name>
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const root = process.argv[2], smokeKit = process.argv[3];
// Optional third argument tests the shipped kit through the same UI and untouched production transport.
assert(root?.startsWith('/tmp/veynrel-studio-native-') && !root.includes('..') && !fs.existsSync(root));
const vault = `${root}/vault`, pluginDir = `${vault}/.obsidian/plugins/ai-knowledge-hub`;
fs.mkdirSync(pluginDir, { recursive: true }); fs.mkdirSync(`${root}/profile`, { recursive: true });
const fixture = (name, synthetic = false) => fs.readFileSync(`${ROOT}/docs/studio-fixtures/${name}${synthetic ? '.synthetic' : ''}.md`, 'utf8');
const preservedPrefix = '\uFEFF---\r\n# source comment\r\nid: \"source-007\"\r\naliases: [Stable]\r\n---\r\n';
const originals = {
  'Properties.md': preservedPrefix + '# Facts\r\nОколо 37 кг к четвергу. [[#Facts]] [relative](./sibling.md).\r\n```js\r\nconst n = 37;\r\n```\r\n',
  'Formatting.md': fixture('formatting'),
  'Training.md': fixture('training'),
  'Nutrition.md': fixture('nutrition'),
  'Batch/a/same.md': 'Saved facts in A.\n', 'Batch/b/same.md': 'Saved facts in B.\n',
  'Untouched.md': '# Never selected\nThis note must not be read or changed by Studio.\n',
};
if (smokeKit) originals['Source.md'] = fs.readFileSync(`${smokeKit}/vault/Source.md`, 'utf8');
for (const [path, text] of Object.entries(originals)) { fs.mkdirSync(`${vault}/${path.substring(0, path.lastIndexOf('/') + 1)}`, { recursive: true }); fs.writeFileSync(`${vault}/${path}`, text); }
const requests = [];
let providerMode = 'normal', releaseProvider;
const server = createServer(async (req, res) => {
  let raw = ''; for await (const part of req) raw += part;
  assert.equal(req.url, '/v1/chat/completions'); requests.push(raw);
  const body = JSON.parse(raw), system = body.messages[0].content, markdown = JSON.parse(body.messages[1].content).markdown;
  if (providerMode === 'defer') await new Promise(resolve => { releaseProvider = resolve; });
  const content = markdown.includes('source-007') ? '---\nid: model-999\naliases: [Model]\n---\n# Facts\n37 кг. [[#Facts]] [relative](./sibling.md).\n```js\nconst n = 38;\n```\n' : system.includes('Structure the workout') ? fixture('training', true) :
    system.includes('Structure the food') ? fixture('nutrition', true) : markdown === originals['Formatting.md'] ? fixture('formatting', true) : `# Organized\n\n${markdown}`;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: providerMode === 'length' ? 'length' : 'stop' }] }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let port = server.address().port, smokeServer;
const smokeReceipt = `${root}/smoke-http.jsonl`;
if (smokeKit) {
  smokeServer = spawn('python3', ['-u', `${ROOT}/scripts/studio-smoke/observe_native.py`, smokeKit, smokeReceipt], {stdio:['ignore','pipe',fs.openSync(`${root}/smoke-server.log`,'a')]});
  port = await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('smoke server readiness timeout')),5000);smokeServer.once('error',reject);smokeServer.stdout.once('data',data=>{clearTimeout(timer);const n=Number(String(data).trim());assert(n>0&&n<65536);resolve(n);});});
}
const smokeReceipts = () => fs.existsSync(smokeReceipt) ? fs.readFileSync(smokeReceipt,'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)) : [];
fs.writeFileSync(`${pluginDir}/data.json`, JSON.stringify({ language: 'en', provider: 'ollama', model: smokeKit ? 'synthetic-source-preservation' : 'studio-loopback', baseUrl: `http://127.0.0.1:${port}/v1`, apiKey: '',
  semanticAutoSyncSuspended: true, semantic: { enabled: false }, decisions: { enabled: false }, companion: { enabled: false }, health: { onboardingCompleted: true } }));
fs.writeFileSync(`${vault}/.obsidian/community-plugins.json`, '["ai-knowledge-hub"]');
fs.writeFileSync(`${vault}/.obsidian/app.json`, '{"checkForUpdates":false}');
fs.writeFileSync(`${root}/profile/obsidian.json`, JSON.stringify({ updateDisabled: true, vaults: { studio: { path: vault, ts: Date.now(), open: true } } }));
const sha = raw => createHash('sha256').update(raw).digest('hex');
const artifacts = {};
for (const name of ['main.js', 'styles.css', 'manifest.json']) { fs.copyFileSync(`${ROOT}/${name}`, `${pluginDir}/${name}`); artifacts[name] = sha(fs.readFileSync(`${pluginDir}/${name}`)); }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const start = () => spawn('/usr/bin/electron43', ['/usr/lib/obsidian/app.asar', `--user-data-dir=${root}/profile`, '--remote-debugging-port=9286', '--disable-gpu', '--ozone-platform=x11'], { stdio: ['ignore', 'ignore', fs.openSync(`${root}/electron.log`, 'a')] });
let child, socket, sequence = 0;
const pending = new Map(), checks = [], screenshots = [];
const report = { checks, artifacts, screenshots, modelQuality: 'NOT RE-EVALUATED', remoteInferenceRequests: 0, fixture: 'Synthetic Markdown fixtures; existing callOpenRouter -> requestUrl -> loopback HTTP. Actual ItemView, registry, runner, journal and Vault.process.',
  beforeApply: [], exceptions: [], themeTransitions: [], themeCaptures: [], mode: smokeKit ? 'shipped-smoke-kit' : 'source-preservation',
  limits: 'Linux desktop, built-in themes. Synthetic responses verify transport and workflow, not model quality. No paid/live provider, personal vault, physical mobile, screen reader or external cross-process races.' };
const cdp = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++sequence, { resolve, reject }); socket.send(JSON.stringify({ id: sequence, method, params })); });
const ev = async expression => { const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
const wait = async expression => { for (let i = 0; i < 240; i++) { if (await ev(expression)) return; await pause(50); } throw Error(`Timeout: ${expression}; ${await ev('document.body.innerText.slice(-2000)')}`); };
const pass = async (name, expr) => { assert(await ev(expr), name); checks.push(name); console.log(name); };
const click = async (action, modal = false) => {
  await cdp('Page.bringToFront'); await wait('document.hasFocus()');
  const selector = `${modal ? '.veynrel-studio-dialog' : '.veynrel-studio'} [data-studio-action=${JSON.stringify(action)}]`;
  await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  // Use the native pointer/focus path, including off-screen controls and modal activation.
  const point = await ev(`(async()=>{const e=document.querySelector(${JSON.stringify(selector)});for(let a=e.parentElement;a;a=a.parentElement)if(a.tagName==='DETAILS')a.open=true;e.scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
  report.lastPointer = { action, point, hit: await ev(`document.elementFromPoint(${point.x},${point.y})?.outerHTML.slice(0,500)`) };
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  for (const type of ['mousePressed', 'mouseReleased']) { await cdp('Input.dispatchMouseEvent', { type, button: 'left', buttons:type==='mousePressed'?1:0, clickCount: 1, ...point }); await pause(60); }
};
const hashes = () => Object.fromEntries(Object.keys(originals).map(path => [path, sha(fs.readFileSync(`${vault}/${path}`))]));
const initialHashes = hashes();
for (const [path,raw] of Object.entries(originals)) { const out=`${root}/markdown/before/${path}`;fs.mkdirSync(out.slice(0,out.lastIndexOf('/')),{recursive:true});fs.writeFileSync(out,raw); }
async function connect() {
  let page; for (let i = 0; i < 200; i++) { try { page = (await (await fetch('http://127.0.0.1:9286/json/list')).json()).find(p => p.url.startsWith('app://obsidian.md/')); } catch {} if (page) break; await pause(100); }
  assert(page, 'native ready'); socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') report.exceptions.push(m.params); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (p) m.error ? p.reject(m.error) : p.resolve(m.result); } };
  await cdp('Runtime.enable'); await cdp('Network.enable'); await cdp('Network.setBlockedURLs',{urls:['https://*','http://invalid.test/*']});
  await wait('!!window.app?.workspace?.layoutReady'); assert.equal(await ev('app.vault.adapter.basePath'), vault);
  await wait("!!app.plugins.plugins['ai-knowledge-hub']?.studio || !!document.querySelector('.mod-trust-folder')");
  if (await ev("!!document.querySelector('.mod-trust-folder')")) await ev("[...document.querySelectorAll('.mod-trust-folder button')].find(e=>/Trust author/.test(e.textContent)).click();void 0");
  await wait("!!app.plugins.plugins['ai-knowledge-hub']?.studio && !!app.commands.commands['ai-knowledge-hub:veynrel-open-studio']");
  await ev("window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.studio=plugin.studio;window.io={reads:[],writes:[],browserRequests:0};const studioNativeRead=app.vault.read.bind(app.vault);app.vault.read=async f=>{io.reads.push(f.path);return studioNativeRead(f)};const studioNativeWrite=app.vault.process.bind(app.vault);app.vault.process=async(f,fn)=>{io.writes.push(f.path);return studioNativeWrite(f,fn)};window.fetch=()=>{io.browserRequests++;throw Error('blocked synthetic fetch')};XMLHttpRequest.prototype.send=function(){io.browserRequests++;throw Error('blocked synthetic XHR')};void 0");
  await ev("io.creates=[];io.journals=[];const nativeCreate=app.vault.create.bind(app.vault);app.vault.create=async(...args)=>{io.creates.push(args[0]);return nativeCreate(...args)};const ownedWrite=app.vault.adapter.write.bind(app.vault.adapter);app.vault.adapter.write=async(...args)=>{io.journals.push(args[0]);return ownedWrite(...args)};void 0");
  await cdp('Page.bringToFront');
}
async function restart() {
  socket.close(); const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await exited; child = start(); await connect();
}
async function open() { await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-studio');void 0"); await wait("!!document.querySelector('.veynrel-studio [data-studio-action=library]')"); await click('library'); await wait("!!document.querySelector('.veynrel-studio [data-studio-action=new]')"); }
async function prepare(recipe, paths, folder = false) {
  await ev("app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('veynrel-studio')[0],{focus:true});void 0");
  await click('library'); await click(`recipe-${recipe}`); await click('choose-notes');
  if (folder) {
    await ev(`{const selects=document.querySelectorAll('.veynrel-studio-body select');selects[0].value='folder';selects[0].dispatchEvent(new Event('change'));selects[1].value=${JSON.stringify(paths)};selects[1].dispatchEvent(new Event('change'));}void 0`);
  } else {
    await ev(`{for(const i of document.querySelectorAll('.veynrel-studio-picker input:checked'))i.click();for(const path of ${JSON.stringify(paths)}){const label=[...document.querySelectorAll('.veynrel-studio-picker label')].find(e=>e.textContent===path);if(!label)throw Error('missing path '+path);label.querySelector('input').click();}}void 0`);
  }
  const count = requests.length; await click('prepare'); await wait("studio.runner.state==='prepared'&&!studio.runner.running");
  assert.equal(requests.length, count, 'preparation sends nothing');
  return ev('studio.runner.prepared.requests.map(r=>r.body)');
}
async function generate(expected) {
  const count = requests.length; await click('generate'); await wait("!studio.runner.running&&['review','failed','cancelled'].includes(studio.runner.state)");
  assert.deepEqual(requests.slice(count), expected, 'request bodies exactly match consent');
}
async function sourceMode() {
  await ev("{const e=document.querySelector('[data-studio-destination]');e.value='source';e.dispatchEvent(new Event('change'));}void 0");
}
async function confirmSourceWrite() {
  await click('review-apply');
  await wait("!studio.operations.busy&&(!!document.querySelector('.veynrel-studio-dialog')||!!app.workspace.getLeavesOfType('veynrel-studio').find(l=>l.view.route==='workflow')?.view.errorEl.textContent)");
  if (!await ev("!!document.querySelector('.veynrel-studio-dialog')")) return;
  await ev("document.querySelector('[data-studio-ack]')?.click();void 0");
  await click('confirm-apply', true);
}
async function apply(paths) {
  await sourceMode();
  await ev("app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('veynrel-studio')[0],{focus:true});void 0");
  await ev(`{for(const path of ${JSON.stringify(paths)}){const input=document.querySelector('[data-studio-select='+CSS.escape(path)+']');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));}}void 0`);
  report.lastApplySelection = await ev("app.workspace.getLeavesOfType('veynrel-studio').map(l=>({route:l.view.route,selected:[...l.view.selectedRows],review:l.view.reviewId,dialogs:l.view.dialogs.size}))");
  await confirmSourceWrite(); await wait("!studio.runner.running&&!document.querySelector('.veynrel-studio-dialog')");
}
async function undoAll() {
  await click('history'); await wait("!!document.querySelector('[data-studio-action=undo]')");
  while (await ev("!!document.querySelector('[data-studio-action=undo]')")) {
    await click('undo'); await click('confirm-undo', true); await wait("!document.querySelector('.veynrel-studio-dialog')&&!studio.writer.busy");
    await wait("!document.querySelector('.veynrel-studio-body')?.textContent.includes('Checking…')");
  }
}
async function shot(name) {
  fs.writeFileSync(`${root}/${name}.png`, Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64')); screenshots.push(`${name}.png`);
}
async function themeSample(selector = '.veynrel-studio') {
  return ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),doc=e.ownerDocument,w=doc.defaultView,c=w.getComputedStyle(e),b=e.getBoundingClientRect();return {classes:[...doc.body.classList].filter(x=>x.startsWith('theme-')),background:c.backgroundColor,text:c.color,x:b.x,y:b.y,width:b.width,height:b.height,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,viewport:w.innerWidth}})()`);
}
function verifyTheme(sample, mode) {
  assert(sample.classes.includes(`theme-${mode}`));assert(!sample.classes.includes(`theme-${mode==='light'?'dark':'light'}`));
  const brightness=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number);return rgb.reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0)};
  assert(mode==='light'?brightness(sample.background)>brightness(sample.text):brightness(sample.background)<brightness(sample.text),JSON.stringify(sample));
}
async function hostTheme(mode) {
  const before=await themeSample();await ev(`app.changeTheme('${mode==='light'?'moonstone':'obsidian'}');void 0`);
  await wait(`(()=>{const doc=document.querySelector('.veynrel-studio').ownerDocument;return doc.body.classList.contains('theme-${mode}')&&!doc.body.classList.contains('theme-${mode==='light'?'dark':'light'}')})()`);
  await pause(400);const after=await themeSample();verifyTheme(after,mode);
  if(!before.classes.includes(`theme-${mode}`)){assert.notEqual(after.background,before.background);assert.notEqual(after.text,before.text);}
  report.themeTransitions.push({requested:mode,before,after});
}
async function themeShot(name, mode, language, stage) {
  const sample=await themeSample(stage==='confirmation'?'.modal':'.veynrel-studio');verifyTheme(sample,mode);
  assert(sample.scrollWidth<=sample.clientWidth+1);await shot(name);
  report.themeCaptures.push({file:`${name}.png`,requested:mode,language,stage,...sample});
}
async function locale(lang) {
  await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
  await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${lang}';e.dispatchEvent(new Event('change'));}void 0`);
  await ev('plugin.settingsSave'); await ev('app.setting.close();void 0'); await cdp('Page.bringToFront');
  await ev("for(const leaf of app.workspace.getLeavesOfType('veynrel-studio'))leaf.detach();void 0"); await open();
}async function choose(paths) { await ev(`document.querySelectorAll('[data-studio-select]').forEach(e=>{e.checked=${JSON.stringify(paths)}.includes(e.dataset.studioSelect);e.dispatchEvent(new Event('change'));});void 0`); }
async function confirmNew() { await click('review-apply'); await wait("!!document.querySelector('[data-studio-action=confirm-apply]')");await click('confirm-apply',true);await wait("!studio.runner.running&&!document.querySelector('.veynrel-studio-dialog')"); }
const keep = (name,value) => fs.writeFileSync(`${root}/${name}.json`,JSON.stringify(value,null,2));
try {
  child=start();await connect();await open();await cdp('Emulation.setDeviceMetricsOverride',{width:1300,height:950,deviceScaleFactor:1,mobile:false});
  report.versions=await ev("({obsidian:document.title.match(/Obsidian ([0-9.]+)/)?.[1],electron:process.versions.electron,excalidrawInstalled:!!app.plugins.plugins['obsidian-excalidraw-plugin']})");
  assert.equal(report.versions.excalidrawInstalled,false);checks.push('Markdown workflow has no Excalidraw dependency');
  await pass('Passive Studio opens with zero model/note read/write',"io.reads.length===0&&io.writes.length===0&&io.creates.length===0");assert.equal(requests.length,0);
  if (smokeKit) {
    const before = hashes(); assert.equal(smokeReceipts().length,0);
    await prepare('builtin.smart-format',['Source.md']);assert.equal(smokeReceipts().length,0);await shot('smoke-explicit-consent');
    await click('generate');await wait("!studio.runner.running&&studio.runner.state==='review'");
    assert.equal(await ev('studio.runner.review.rows[0].rawResponse'),fs.readFileSync(`${smokeKit}/synthetic-response.md`,'utf8'));
    await choose(['Source.md']);await click('review-apply');await wait('!!studio.runner.writePlan');const plan=await ev('studio.runner.writePlan');keep('smoke-create-plan',plan);await shot('smoke-write-confirmation');
    await click('confirm-apply',true);await wait("!studio.runner.running&&!document.querySelector('.veynrel-studio-dialog')");
    assert.equal(fs.readFileSync(`${vault}/${plan.rows[0].target}`,'utf8'),plan.rows[0].output);assert.deepEqual(hashes(),before);
    assert.deepEqual(smokeReceipts(),[{status:200,authorization:'ollama-sentinel',expectedPath:true}]);assert.equal(requests.length,0);
    await pass('Shipped Python responder accepts actual production Ollama header and UI saves the exact separate-note payload',"studio.runner.results[0].outcome==='created'&&io.writes.length===0&&io.creates.length===1");
    report.smokeHttp=smokeReceipts();report.requests=1;report.initialHashes=before;report.finalHashes=hashes();report.status='PASS';report.io=await ev('io');
    report.smokeKitHashes=Object.fromEntries(['loopback.py','synthetic-response.md','vault/Source.md'].map(n=>[n,sha(fs.readFileSync(`${smokeKit}/${n}`))]));
    fs.copyFileSync(`${vault}/${plan.rows[0].target}`,`${root}/markdown/smoke-created.md`);await shot('smoke-created');
  } else {
  let bodies=await prepare('builtin.smart-format',['Properties.md']);await shot('consent-properties-policy');await generate(bodies);
  await pass('New Review defaults to separate note and keeps raw YAML excluded from actual source output',"document.querySelector('[data-studio-destination]').value==='new-note'&&studio.runner.review.rows[0].rawResponse.includes('model-999')&&!studio.runner.review.rows[0].after.includes('model-999')&&studio.runner.review.rows[0].document.sourcePrefix.includes('source-007')");
  report.envelope=await ev("({before:studio.runner.review.rows[0].before,raw:studio.runner.review.rows[0].rawResponse,document:studio.runner.review.rows[0].document,checks:studio.runner.review.rows[0].checks})");keep('properties-envelope',report.envelope);
  assert.equal(report.envelope.before,originals['Properties.md']);assert.equal(report.envelope.document.sourcePrefix,preservedPrefix);
  const reviewCalls=requests.length,originalHash=hashes()['Properties.md'];await choose(['Properties.md']);
  await ev("{const e=document.querySelector('[data-studio-target]');e.value='Saved draft.md';e.dispatchEvent(new Event('input'));}void 0");
  const view= "app.workspace.getLeavesOfType('veynrel-studio')[0].view";
  const passive=await ev('({reads:io.reads.length,writes:io.writes.length,creates:io.creates.length,journals:io.journals.filter(p=>p!==".obsidian/appearance.json").length})');
  await sourceMode();await ev("{const e=document.querySelector('[data-studio-destination]');e.value='new-note';e.dispatchEvent(new Event('change'));}void 0");
  await hostTheme('light');await ev("app.workspace.getLeavesOfType('veynrel-studio')[0].view.render();void 0");
  await pass('Destination/theme rerender preserves selected row and edited target name',"document.querySelector('[data-studio-select]').checked&&document.querySelector('[data-studio-target]').value==='Saved draft.md'");
  assert.deepEqual(await ev('({reads:io.reads.length,writes:io.writes.length,creates:io.creates.length,journals:io.journals.filter(p=>p!==".obsidian/appearance.json").length})'),passive);assert.equal(requests.length,reviewCalls);checks.push('Destination/name/theme preview changes issue no model, note read, note write or journal write');
  await themeShot('review-new-note-en-light-r2','light','en','review');
  await ev("window.sourceLeaf=app.workspace.getLeaf('split');sourceLeaf.openFile(app.vault.getFileByPath('Formatting.md'),{state:{mode:'source',source:true}})");
  await ev("app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('veynrel-studio')[0],{focus:true});void 0");
  await click('review-apply');await wait('!!studio.runner.writePlan');const plan=await ev('studio.runner.writePlan');keep('create-plan',plan);await shot('confirm-create-en-split');
  assert.equal(plan.rows[0].target,'Saved draft.md');assert.equal(plan.rows[0].output,await ev("document.querySelector('[data-studio-final]').textContent"));
  await click('confirm-apply',true);await wait("!studio.runner.running&&!document.querySelector('.veynrel-studio-dialog')");
  fs.copyFileSync(vault+'/Saved draft.md',root+'/markdown/created-result.md');assert.equal(fs.readFileSync(vault+'/Saved draft.md','utf8'),plan.rows[0].output);assert.equal(hashes()['Properties.md'],originalHash);assert(!plan.rows[0].output.includes('source-007'));assert(!plan.rows[0].output.includes('model-999'));
  await pass('Create writes one target, no source process, and does not open target automatically',"studio.runner.results[0].outcome==='created'&&io.writes.length===0&&io.creates.length===1&&!app.workspace.getLeavesOfType('markdown').some(l=>l.view.file?.path==='Saved draft.md')");
  await ev("sourceLeaf.detach();void 0");await shot('created-en');
  await restart();await open();await click('history');await wait("!!document.querySelector('[data-studio-action=markdown-open]')");
  await pass('Creation history has no spurious interrupted generation',"!document.querySelector('.veynrel-studio-body').textContent.includes('Interrupted')");
  await pass('Restart history observes creation without any automatic create/write',"io.creates.length===0&&io.writes.length===0");assert.equal(requests.length,reviewCalls);await shot('history-after-restart');
  await click('markdown-open');await wait("app.workspace.getLeavesOfType('markdown').some(l=>l.view.file?.path==='Saved draft.md')");
  await pass('Explicit opening uses source mode',"app.workspace.getLeavesOfType('markdown').find(l=>l.view.file?.path==='Saved draft.md').view.getMode()==='source'");
  await ev("app.workspace.getLeavesOfType('markdown').forEach(l=>l.detach());void 0");await open();
  bodies=await prepare('builtin.smart-format',['Properties.md']);await generate(bodies);const inplaceCalls=requests.length;await choose(['Properties.md']);await sourceMode();
  await click('review-apply');await wait("!!document.querySelector('[data-studio-ack]')");
  await pass('Inplace observations need an unchecked explicit acknowledgement',"!document.querySelector('[data-studio-ack]').checked&&document.querySelector('[data-studio-action=confirm-apply]').disabled");
  const beforeAck = await ev('({writes:io.writes.length,creates:io.creates.length})');
  await ev("document.querySelector('[data-studio-action=confirm-apply]').click();void 0");
  assert.deepEqual(await ev('({writes:io.writes.length,creates:io.creates.length})'),beforeAck);
  for (const close of ['escape','modal-api']) {
    await ev("document.querySelector('[data-studio-ack]').click();void 0");
    await pass('Acknowledgement enables the exact write plan: '+close,"!document.querySelector('[data-studio-action=confirm-apply]').disabled");
    await ev("document.querySelector('[data-studio-ack]').click();void 0");
    await pass('Removing acknowledgement disables confirmation again: '+close,"document.querySelector('[data-studio-action=confirm-apply]').disabled");
    if(close==='escape')for(const type of ['keyDown','keyUp'])await cdp('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    else await ev("app.workspace.getLeavesOfType('veynrel-studio')[0].view.dialogs.forEach(d=>d.close());void 0");
    await wait("!document.querySelector('.veynrel-studio-dialog')");
    assert.deepEqual(await ev('({writes:io.writes.length,creates:io.creates.length})'),beforeAck);assert.equal(hashes()['Properties.md'],originalHash);
    await pass('Closing confirmation discards plan without note writes: '+close,'!studio.runner.writePlan');
    await click('review-apply');await wait("!!document.querySelector('[data-studio-ack]')");
    await pass('Reopened plan needs fresh acknowledgement: '+close,"!document.querySelector('[data-studio-ack]').checked&&document.querySelector('[data-studio-action=confirm-apply]').disabled");
  }
  const inplacePlan=await ev('studio.runner.writePlan');keep('inplace-plan',inplacePlan);await shot('confirm-inplace-warning');
  await ev("document.querySelector('[data-studio-ack]').click();void 0");await click('confirm-apply',true);await wait("!studio.runner.running&&!document.querySelector('.veynrel-studio-dialog')");
  fs.copyFileSync(vault+'/Properties.md',root+'/markdown/inplace-after.md');assert.equal(fs.readFileSync(vault+'/Properties.md','utf8'),inplacePlan.rows[0].output);assert.equal(fs.readFileSync(vault+'/Properties.md','utf8').slice(0,preservedPrefix.length),preservedPrefix);await undoAll();assert.equal(hashes()['Properties.md'],originalHash);assert.equal(requests.length,inplaceCalls);checks.push('Exact BOM/CRLF/YAML Apply payload and guarded Undo restore UTF-8 hashes without another request');
  bodies=await prepare('builtin.smart-format',['Formatting.md']);await generate(bodies);await choose(['Formatting.md']);
  await ev("window.sourceLeaf=app.workspace.getLeaf('split');sourceLeaf.openFile(app.vault.getFileByPath('Formatting.md'),{state:{mode:'source',source:true}})");await ev("window.oldSave=sourceLeaf.view.requestSave;sourceLeaf.view.requestSave=()=>{};sourceLeaf.view.editor.setValue('Unsaved local buffer');app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('veynrel-studio')[0],{focus:true});void 0");
  const beforeUnsafeCreates=await ev('io.creates.length');await click('review-apply');await wait("studio.runner.results?.[0]?.reason==='unsaved'");assert.equal(await ev('io.creates.length'),beforeUnsafeCreates);assert.equal(hashes()['Properties.md'],originalHash);await shot('create-unsaved-buffer-refusal');checks.push('Create refuses actual unsaved editor buffer with no note write');
  await ev(`sourceLeaf.view.editor.setValue(${JSON.stringify(originals['Formatting.md'])});sourceLeaf.detach();void 0`);
  bodies=await prepare('builtin.smart-format',['Batch/a/same.md','Batch/b/same.md']);await generate(bodies);await choose(['Batch/b/same.md']);const partialCalls=requests.length;
  await ev("window.savedLeaf=app.workspace.getLeaf('split');savedLeaf.openFile(app.vault.getFileByPath('Batch/b/same.md'),{state:{mode:'source',source:true}})");
  await pass('Real saved source editor is open for create-only',"savedLeaf.view.getViewData()===studio.runner.review.rows[1].before");
  await ev("app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('veynrel-studio')[0],{focus:true});void 0");await confirmNew();
  await ev("savedLeaf.detach();void 0");
  await pass('Only explicitly selected batch row is created',"studio.runner.results[0].outcome==='skipped'&&studio.runner.results[1].outcome==='created'");assert.equal(requests.length,partialCalls);
  bodies=await prepare('builtin.smart-format',['Batch/a/same.md','Batch/b/same.md']);await generate(bodies);await choose(['Batch/a/same.md','Batch/b/same.md']);
  await ev("window.realMark=studio.creator.journal.mark.bind(studio.creator.journal);studio.creator.journal.mark=async(...args)=>{if(args[2]==='created')throw Error('synthetic receipt fault');return realMark(...args)};void 0");await confirmNew();
  await pass('Injected receipt failure leaves first unconfirmed and second skipped',"studio.runner.results[0].outcome==='unconfirmed'&&studio.runner.results[1].outcome==='skipped'");keep('partial-create',await ev('studio.runner.results'));await shot('receipt-failure-partial');const failedCalls=requests.length;
  await restart();await open();await click('history');await wait("!!document.querySelector('[data-studio-action=markdown-recover]')");
  await pass('Restart after receipt failure never retries creates',"io.creates.length===0&&io.writes.length===0");assert.equal(requests.length,failedCalls);await shot('unconfirmed-after-restart');
  await click('markdown-recover');await click('markdown-confirm-recovery',true);await wait("!document.querySelector('.veynrel-studio-dialog')");await pass('Manual acknowledgement writes only receipt, never a note',"io.creates.length===0&&io.writes.length===0");
  // Local boundary evidence against the actual Obsidian utility, via the same installed bundle loader.
  const frontier=await ev("({before:studio.runner.review?.rows?.[0]?.before??null})");keep('post-restart-state',frontier);
  for(const lang of ['en','ru']) {
    await locale(lang);bodies=await prepare('builtin.smart-format',['Properties.md']);await generate(bodies);await choose(['Properties.md']);
    await ev("app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();void 0");
    const beforeMatrix=await ev('({writes:io.writes.length,creates:io.creates.length})'),calls=requests.length;
    for(const mode of ['dark','light']) for(const width of [390,1300]) {
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false});await hostTheme(mode);
      await ev("document.querySelector('.veynrel-studio').scrollTop=0;void 0");
      await themeShot(`review-${lang}-${mode}-${width}-r2`,mode,lang,'review');
      await pass(`${lang}/${mode}/${width}: actual Review theme and overflow verified`,"document.querySelector('.veynrel-studio').scrollWidth<=document.querySelector('.veynrel-studio').clientWidth+1");
      await click('review-apply');await wait("!!document.querySelector('[data-studio-action=confirm-apply]')");
      await themeShot(`confirmation-${lang}-${mode}-${width}-r2`,mode,lang,'confirmation');
      await ev("app.workspace.getLeavesOfType('veynrel-studio')[0].view.dialogs.forEach(d=>d.close());void 0");
    }
    assert.equal(requests.length,calls);assert.deepEqual(await ev('({writes:io.writes.length,creates:io.creates.length})'),beforeMatrix);
  }

  // Native pointer/keyboard action, not a DOM-only screenshot.
  await cdp('Emulation.setDeviceMetricsOverride',{width:1300,height:950,deviceScaleFactor:1,mobile:false});
  await cdp('Page.bringToFront');await wait('document.hasFocus()');await ev("window.keyTrace=[];for(const name of ['keydown','keypress','keyup','click'])document.addEventListener(name,e=>keyTrace.push({type:e.type,key:e.key,target:e.target.dataset?.studioAction,prevented:e.defaultPrevented}),true);document.querySelector('[data-studio-action=review-apply]').focus();void 0");
  report.keyboardFocus=await ev("({active:document.activeElement.outerHTML,focus:document.hasFocus(),canApply:studio.runner.canApply,busy:studio.operations.busy})");
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
  report.keyboardTrace=await ev('keyTrace');
  await wait("!!document.querySelector('.veynrel-studio-dialog')");await shot('keyboard-create-confirmation');await ev("app.workspace.getLeavesOfType('veynrel-studio')[0].view.dialogs.forEach(d=>d.close());void 0");checks.push('Native keyboard Enter opens separate creation confirmation without writing');
  assert.deepEqual(hashes(),initialHashes);checks.push('All original and unselected control UTF-8 hashes unchanged at completion');
  fs.copyFileSync(vault+'/Properties.md',root+'/markdown/inplace-undone.md');report.requests=requests.length;report.initialHashes=initialHashes;report.finalHashes=hashes();report.io=await ev('io');report.modelQuality='NOT RE-EVALUATED';report.status='PASS';
  assert(!report.io.reads.includes('Untouched.md'));assert.equal(report.io.browserRequests,0);await ev("document.querySelector('[data-studio-final]').scrollIntoView({block:'start'});document.querySelectorAll('.veynrel-studio-review-detail details').forEach(d=>{if(d.querySelector('summary').textContent.includes('замечания'))d.open=true});void 0");await shot('final-review');
  }
  assert.equal(report.exceptions.length,0);
} catch(e) {report.status='FAIL';report.error=String(e.stack||e);try{report.diagnostic=await ev("({state:studio.runner.state,error:studio.runner.error,result:studio.runner.results,review:studio.runner.review,text:document.body.innerText.slice(-4000)})");await shot('failure');}catch{}process.exitCode=1;
} finally {keep('native-report',report);socket?.close();child?.kill('SIGTERM');smokeServer?.kill('SIGTERM');server.close();console.log(JSON.stringify({status:report.status,checks:checks.length,requests:report.requests??requests.length,error:report.error,root}));}
