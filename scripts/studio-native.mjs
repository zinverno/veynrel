// Synthetic-only native acceptance. Build first, then:
// node scripts/studio-native.mjs /tmp/veynrel-studio-native-<unique-name>
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const root = process.argv[2];
assert(root?.startsWith('/tmp/veynrel-studio-native-') && !root.includes('..') && !fs.existsSync(root));
const vault = `${root}/vault`, pluginDir = `${vault}/.obsidian/plugins/ai-knowledge-hub`;
fs.mkdirSync(pluginDir, { recursive: true }); fs.mkdirSync(`${root}/profile`, { recursive: true });
const fixture = (name, synthetic = false) => fs.readFileSync(`${ROOT}/docs/studio-fixtures/${name}${synthetic ? '.synthetic' : ''}.md`, 'utf8');
const originals = {
  'Formatting.md': fixture('formatting'),
  'Training.md': fixture('training'),
  'Nutrition.md': fixture('nutrition'),
  'Batch/a/same.md': 'Saved facts in A.\n', 'Batch/b/same.md': 'Saved facts in B.\n',
  'Untouched.md': '# Never selected\nThis note must not be read or changed by Studio.\n',
};
for (const [path, text] of Object.entries(originals)) { fs.mkdirSync(`${vault}/${path.substring(0, path.lastIndexOf('/') + 1)}`, { recursive: true }); fs.writeFileSync(`${vault}/${path}`, text); }
const requests = [];
let providerMode = 'normal', releaseProvider;
const server = createServer(async (req, res) => {
  let raw = ''; for await (const part of req) raw += part;
  assert.equal(req.url, '/v1/chat/completions'); requests.push(raw);
  const body = JSON.parse(raw), system = body.messages[0].content, markdown = JSON.parse(body.messages[1].content).markdown;
  if (providerMode === 'defer') await new Promise(resolve => { releaseProvider = resolve; });
  const content = system.includes('Structure the workout') ? fixture('training', true) :
    system.includes('Structure the food') ? fixture('nutrition', true) : markdown === originals['Formatting.md'] ? fixture('formatting', true) : `# Organized\n\n${markdown}`;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: providerMode === 'length' ? 'length' : 'stop' }] }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
fs.writeFileSync(`${pluginDir}/data.json`, JSON.stringify({ language: 'en', provider: 'ollama', model: 'studio-loopback', baseUrl: `http://127.0.0.1:${port}/v1`, apiKey: '',
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
const report = { checks, artifacts, screenshots, fixture: 'Six synthetic Markdown files; existing callOpenRouter -> requestUrl -> loopback HTTP. Actual ItemView, registry, runner, journal and Vault.process.',
  beforeApply: [], exceptions: [],
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
  for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, button: 'left', clickCount: 1, ...point });
};
const hashes = () => Object.fromEntries(Object.keys(originals).map(path => [path, sha(fs.readFileSync(`${vault}/${path}`))]));
const initialHashes = hashes();
async function connect() {
  let page; for (let i = 0; i < 200; i++) { try { page = (await (await fetch('http://127.0.0.1:9286/json/list')).json()).find(p => p.url.startsWith('app://obsidian.md/')); } catch {} if (page) break; await pause(100); }
  assert(page, 'native ready'); socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') report.exceptions.push(m.params); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (p) m.error ? p.reject(m.error) : p.resolve(m.result); } };
  await cdp('Runtime.enable');
  await wait('!!window.app?.workspace?.layoutReady'); assert.equal(await ev('app.vault.adapter.basePath'), vault);
  await wait("!!app.plugins.plugins['ai-knowledge-hub']?.studio || !!document.querySelector('.mod-trust-folder')");
  if (await ev("!!document.querySelector('.mod-trust-folder')")) await ev("[...document.querySelectorAll('.mod-trust-folder button')].find(e=>/Trust author/.test(e.textContent)).click();void 0");
  await wait("!!app.plugins.plugins['ai-knowledge-hub']?.studio && !!app.commands.commands['ai-knowledge-hub:veynrel-open-studio']");
  await ev("window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.studio=plugin.studio;window.io={reads:[],writes:[],browserRequests:0};const studioNativeRead=app.vault.read.bind(app.vault);app.vault.read=async f=>{io.reads.push(f.path);return studioNativeRead(f)};const studioNativeWrite=app.vault.process.bind(app.vault);app.vault.process=async(f,fn)=>{io.writes.push(f.path);return studioNativeWrite(f,fn)};window.fetch=()=>{io.browserRequests++;throw Error('blocked synthetic fetch')};XMLHttpRequest.prototype.send=function(){io.browserRequests++;throw Error('blocked synthetic XHR')};void 0");
  await cdp('Page.bringToFront');
}
async function restart() {
  socket.close(); const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await exited; child = start(); await connect();
}
async function open() { await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-studio');void 0"); await wait("!!document.querySelector('.veynrel-studio [data-studio-action=new]')"); }
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
async function apply(paths) {
  await ev("app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('veynrel-studio')[0],{focus:true});void 0");
  await ev(`{for(const path of ${JSON.stringify(paths)}){const input=document.querySelector('[data-studio-select='+CSS.escape(path)+']');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));}}void 0`);
  report.lastApplySelection = await ev("app.workspace.getLeavesOfType('veynrel-studio').map(l=>({route:l.view.route,selected:[...l.view.selectedRows],review:l.view.reviewId,dialogs:l.view.dialogs.size}))");
  await click('review-apply'); await click('confirm-apply', true); await wait("!studio.runner.running&&!document.querySelector('.veynrel-studio-dialog')");
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
async function locale(lang) {
  await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
  await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${lang}';e.dispatchEvent(new Event('change'));}void 0`);
  await ev('plugin.settingsSave'); await ev('app.setting.close();void 0'); await cdp('Page.bringToFront');
  await ev("for(const leaf of app.workspace.getLeavesOfType('veynrel-studio'))leaf.detach();void 0"); await open();
}
try {
  child = start(); await connect(); await open();
  await pass('Separate native Studio opens passively with three built-ins', "app.workspace.getLeavesOfType('veynrel-studio').length===1&&document.querySelectorAll('.veynrel-studio-grid article').length===3&&io.reads.length===0&&io.writes.length===0&&io.browserRequests===0");
  assert.equal(requests.length, 0); assert.deepEqual(hashes(), initialHashes);
  await click('recipe-builtin.smart-format'); await click('duplicate');
  await wait("document.querySelectorAll('.veynrel-studio-dialog input').length>=2");
  await ev("{document.querySelector('[data-studio-field=name-en]').value='My local recipe';document.querySelector('[data-studio-field=name-ru]').value='Мой локальный сценарий';}void 0");
  await click('save-recipe', true); await wait("!document.querySelector('.veynrel-studio-dialog')");
  const userId = await ev("studio.registry.list().find(r=>r.source==='user').id");
  await restart(); await open();
  await pass('User recipe survives a real process restart', `studio.registry.list().some(r=>r.id===${JSON.stringify(userId)}&&r.name.en==='My local recipe')&&io.writes.length===0`);
  for (const [id, path] of [['smart-format', 'Formatting.md'], ['training-journal', 'Training.md'], ['nutrition-journal', 'Nutrition.md']]) {
    const expected = await prepare(`builtin.${id}`, [path]);
    assert.equal(fs.readFileSync(`${vault}/${path}`, 'utf8'), originals[path]);
    if (id === 'smart-format') {
      await pass('Exact consent lists the saved note and configured loopback endpoint', "document.querySelector('.veynrel-studio-body').textContent.includes(studio.runner.prepared.endpoint)&&document.querySelector('.veynrel-studio-literal').textContent===studio.runner.prepared.requests[0].body");
      await shot('consent-en-dark');
    }
    await generate(expected);
    await pass(`${id}: real shared HTTP transport produces review before writes`, "studio.runner.review.rows[0].status==='generated'&&!!document.querySelector('.veynrel-studio .ai-proposal-diff')&&!document.querySelector('[data-studio-select]').checked");
    assert.equal(fs.readFileSync(`${vault}/${path}`, 'utf8'), originals[path]);
    if (id === 'smart-format') {
      await pass('Untrusted Markdown, HTML and embeds remain literal', "!document.querySelector('.veynrel-studio-body img,.veynrel-studio-body iframe,.veynrel-studio-body .internal-embed')&&io.browserRequests===0");
      await shot('review-en-dark');
    }
    await apply([path]); assert.notEqual(fs.readFileSync(`${vault}/${path}`, 'utf8'), originals[path]);
    await undoAll(); assert.equal(fs.readFileSync(`${vault}/${path}`, 'utf8'), originals[path]); checks.push(`${id}: native Apply / history / Undo restores exact bytes`);
  }
  let expected = await prepare(userId, ['Batch/a/same.md', 'Batch/b/same.md']); await generate(expected); await apply(['Batch/b/same.md']);
  assert.equal(fs.readFileSync(`${vault}/Batch/a/same.md`, 'utf8'), originals['Batch/a/same.md']); await undoAll(); checks.push('Manual multi-select keeps homonyms distinct and applies only checked file');
  expected = await prepare(userId, 'Batch', true); await generate(expected); await apply(['Batch/a/same.md', 'Batch/b/same.md']); await undoAll(); checks.push('Explicit folder selection includes both nested canonical paths');
  expected = await prepare('builtin.smart-format', ['Formatting.md']); await generate(expected);
  await ev("app.vault.modify(app.vault.getFileByPath('Formatting.md'),'Synthetic external edit')");
  await apply(['Formatting.md']); await pass('Changed source refuses Apply and preserves user text', "studio.runner.results[0].outcome==='conflict'");
  assert.equal(fs.readFileSync(`${vault}/Formatting.md`, 'utf8'), 'Synthetic external edit');
  await ev(`app.vault.modify(app.vault.getFileByPath('Formatting.md'),${JSON.stringify(originals['Formatting.md'])})`);
  providerMode = 'length'; expected = await prepare('builtin.smart-format', ['Formatting.md']); await generate(expected);
  await pass('Incomplete provider completion refuses an applicable result', "studio.runner.state==='failed'&&studio.runner.review.rows[0].after===null&&!document.querySelector('[data-studio-action=review-apply]')"); providerMode = 'normal';
  expected = await prepare('builtin.smart-format', ['Formatting.md']); const count = requests.length; await click('cancel'); assert.equal(requests.length, count); checks.push('Cancel before generation sends zero requests');
  providerMode = 'defer'; expected = await prepare('builtin.smart-format', ['Batch/a/same.md', 'Batch/b/same.md']); await click('generate');
  for (let i = 0; i < 100 && !releaseProvider; i++) await pause(30); assert(releaseProvider);
  await ev("for(const leaf of app.workspace.getLeavesOfType('veynrel-studio'))leaf.detach();void 0"); await open(); await click('workflow');
  await pass('Closing and reopening during generation retains one shared runner', "studio.runner.running&&studio.runner.state==='generating'");
  await click('cancel'); releaseProvider(); await wait('!studio.runner.running'); providerMode = 'normal';
  assert.equal(requests.at(-1), expected[0]); await pass('Cancellation does not start the next provider request', "studio.runner.review.rows.every(r=>r.status==='cancelled')");
  await ev("window.noteLeaf=app.workspace.getLeaf('split');noteLeaf.openFile(app.vault.getFileByPath('Training.md'),{state:{mode:'source',source:true}})");
  report.openEditorDiagnostic = await ev("(()=>{const v=noteLeaf.view,leaves=[];app.workspace.iterateAllLeaves(l=>{leaves.push({type:l.view.getViewType(),name:l.view.constructor.name,file:l.view.file?.path,sameFile:l.view.file===app.vault.getFileByPath('Training.md'),state:l.getViewState(),viewData:typeof l.view.getViewData})});return {type:v.getViewType(),sameFile:v.file===app.vault.getFileByPath('Training.md'),viewData:typeof v.getViewData,editor:typeof v.editor,leaves}})()");
  await pass('A separate saved Markdown editor is open alongside Studio', "noteLeaf.view.file.path==='Training.md'&&app.workspace.getLeavesOfType('veynrel-studio').length===1");
  const beforeOpenRun = hashes(), writesBeforeOpenRun = await ev('io.writes.length');
  expected = await prepare('builtin.training-journal', ['Training.md']); await shot('open-saved-consent');
  await pass('Read guard permits the actual attached saved editor before generation', "app.workspace.getLeavesOfType('markdown').includes(noteLeaf)&&noteLeaf.view.getViewData()===JSON.parse(studio.runner.prepared.requests[0].user).markdown");
  await generate(expected); await shot('open-saved-review');
  assert.deepEqual(hashes(), beforeOpenRun); assert.equal(await ev('io.writes.length'), writesBeforeOpenRun);
  report.beforeApply.push({ phase: 'open saved note: prepare and generate', before: beforeOpenRun, after: hashes(), writesBefore: writesBeforeOpenRun, writesAfter: await ev('io.writes.length') });
  checks.push('No Markdown changed during open-editor preparation or generation');
  const openRunId = await ev('studio.runner.review.id'), openRunCalls = requests.length;
  await apply(['Training.md']);
  await pass('Apply refuses the open editor and preserves an actionable immutable Review', "studio.runner.results[0].reason==='editor'&&studio.runner.canApply&&!!document.querySelector('[data-studio-action=review-apply]')");
  assert.deepEqual(hashes(), beforeOpenRun); await shot('open-saved-apply-refused');
  await ev("noteLeaf.detach();void 0"); await apply(['Training.md']);
  assert.equal(requests.length, openRunCalls); assert.equal(await ev('studio.runner.review.id'), openRunId);
  report.sameReviewApply = { reviewBefore: openRunId, reviewAfter: await ev('studio.runner.review.id'), requestsBefore: openRunCalls, requestsAfter: requests.length };
  await pass('Closing the editor enables Apply of the same Review without another request', "studio.runner.results[0].outcome==='applied'");
  await restart(); await open();
  // Obsidian may restore a recent editor layout after SIGKILL. Prove refusal, then explicitly close it as a user would.
  await ev("window.restoredLeaf=app.workspace.getLeavesOfType('markdown').find(l=>l.view.file?.path==='Training.md')??app.workspace.getLeaf('split');restoredLeaf.openFile(app.vault.getFileByPath('Training.md'),{state:{mode:'source',source:true}})");
  await click('history'); await wait("!document.querySelector('.veynrel-studio-body').textContent.includes('Checking…')");
  await pass('Restarted Undo refuses an open restored editor and performs no automatic write', "!document.querySelector('[data-studio-action=undo]')&&document.querySelector('.veynrel-studio-body').textContent.includes('Before writing')&&io.writes.length===0");
  await ev("for(const leaf of app.workspace.getLeavesOfType('markdown'))leaf.detach();void 0");
  await undoAll(); assert.deepEqual(hashes(), beforeOpenRun); assert.equal(requests.length, openRunCalls);
  checks.push('Undo after actual restart restores the open-note workflow without provider calls');
  // Keep one real editor buffer unsaved by suspending only this synthetic view's save scheduler.
  await ev("window.noteLeaf=app.workspace.getLeaf('split');noteLeaf.openFile(app.vault.getFileByPath('Training.md'),{state:{mode:'source',source:true}})");
  await ev("window.realSave=noteLeaf.view.requestSave;noteLeaf.view.requestSave=()=>{};noteLeaf.view.editor.setValue('Unsaved synthetic workout');void 0");
  const unsavedCalls = requests.length;
  await ev("studio.runner.prepare(studio.registry.list().find(r=>r.id==='builtin.training-journal'),{language:'source',instructions:''},{paths:['Training.md']},32768).catch(e=>window.unsavedCode=e.code)");
  await click('workflow');
  await pass('Actual unsaved Markdown buffer refuses preparation with a save message', "unsavedCode==='unsaved'&&studio.runner.error==='unsaved'");
  assert.equal(requests.length, unsavedCalls); assert.deepEqual(hashes(), beforeOpenRun); await shot('unsaved-editor-refused');
  await ev(`noteLeaf.view.editor.setValue(${JSON.stringify(originals['Training.md'])});noteLeaf.view.requestSave=realSave;void 0`);
  // Public popout API, two simultaneously loaded views of the same file.
  await ev("window.popoutLeaf=app.workspace.openPopoutLeaf();popoutLeaf.openFile(app.vault.getFileByPath('Training.md'),{state:{mode:'source',source:true}})");
  await wait("!!popoutLeaf.view.editor&&popoutLeaf.view.getViewData()===noteLeaf.view.getViewData()");
  await pass('Real popout and main editor belong to different windows', "popoutLeaf.view.containerEl.ownerDocument.defaultView!==noteLeaf.view.containerEl.ownerDocument.defaultView");
  expected = await prepare('builtin.training-journal', ['Training.md']); await generate(expected);
  await pass('Two saved native editors including popout permit generation', "studio.runner.review.rows[0].status==='generated'");
  await ev("noteLeaf.detach();void 0"); await apply(['Training.md']);
  await pass('A remaining real popout still blocks Apply', "studio.runner.results[0].reason==='editor'&&studio.runner.canApply");
  const popoutCalls = requests.length;
  await ev("popoutLeaf.detach();void 0"); await apply(['Training.md']); await undoAll();
  assert.equal(requests.length, popoutCalls); assert.deepEqual(hashes(), beforeOpenRun);
  checks.push('Closing the popout permits the same reviewed Apply and protected Undo');
  expected = await prepare('builtin.smart-format', ['Batch/a/same.md', 'Batch/b/same.md']); await generate(expected);
  await ev("window.nativeProcess=app.vault.process;window.wroteFirst=false;app.vault.process=async function(...args){const result=await nativeProcess.apply(this,args);wroteFirst=true;await new Promise(r=>window.releaseWrite=r);return result};void 0");
  await ev("document.querySelectorAll('[data-studio-select]').forEach(e=>e.click());void 0"); await click('review-apply'); await click('confirm-apply', true); await wait('wroteFirst');
  await click('cancel-apply', true); await ev('releaseWrite();void 0'); await wait('!studio.runner.running');
  await ev('app.vault.process=nativeProcess;void 0');
  await pass('Native mass Apply cancellation confirms first write and skips second', "studio.runner.results[0].outcome==='applied'&&studio.runner.results[1].outcome==='skipped'"); await undoAll();
  // Real owned-process SIGKILL between Vault.process completion and the applied receipt.
  expected = await prepare('builtin.smart-format', ['Formatting.md']); await generate(expected);
  await ev("window.nativeProcess=app.vault.process;window.crashReached=false;app.vault.process=async function(...args){const result=await nativeProcess.apply(this,args);crashReached=true;await new Promise(()=>{});return result};void 0");
  await ev("document.querySelector('[data-studio-select]').click();void 0"); await click('review-apply'); await click('confirm-apply', true); await wait('crashReached');
  assert.notEqual(fs.readFileSync(`${vault}/Formatting.md`, 'utf8'), originals['Formatting.md']); const beforeRestartCalls = requests.length;
  await restart(); await open(); await click('history'); await wait("!!document.querySelector('[data-studio-action=recover]')");
  await pass('SIGKILL after physical Apply is unconfirmed with zero automatic writes', "io.writes.length===0&&document.querySelector('.veynrel-studio-body').textContent.includes('Unconfirmed')");
  assert.equal(requests.length, beforeRestartCalls); await shot('interrupted-apply');
  await click('recover'); await click('confirm-undo', true); await wait("!document.querySelector('.veynrel-studio-dialog')&&!studio.writer.busy");
  await pass('Manual recovery acknowledges current result without changing the note', 'io.writes.length===0');
  // Interrupt the subsequent Undo after physical restoration, then acknowledge it without replay.
  await click('undo'); await ev("window.nativeProcess=app.vault.process;window.crashReached=false;app.vault.process=async function(...args){const result=await nativeProcess.apply(this,args);crashReached=true;await new Promise(()=>{});return result};void 0");
  await click('confirm-undo', true); await wait('crashReached');
  assert.equal(fs.readFileSync(`${vault}/Formatting.md`, 'utf8'), originals['Formatting.md']);
  await restart(); await open(); await click('history'); await wait("!!document.querySelector('[data-studio-action=recover]')");
  await click('recover'); await click('confirm-undo', true); await wait("!document.querySelector('.veynrel-studio-dialog')&&!studio.writer.busy");
  await pass('SIGKILL after physical Undo is verified manually without a second write', 'io.writes.length===0'); assert.equal(requests.length, beforeRestartCalls);
  for (const lang of ['en', 'ru']) {
    await locale(lang);
    await ev('app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();void 0');
    for (const theme of ['theme-dark', 'theme-light']) for (const width of [1200, 390]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await ev(`document.body.removeClass('theme-dark','theme-light');document.body.addClass('${theme}');void 0`);
      await pass(`${lang}/${theme}/${width}: library has no horizontal overflow`, "(()=>{const e=document.querySelector('.veynrel-studio');return e.scrollWidth<=e.clientWidth+1})()");
      await shot(`library-${lang}-${theme}-${width}`);
    }
    const outgoing = await prepare('builtin.smart-format', ['Formatting.md']);
    for (const stage of ['consent', 'review', 'history']) {
      if (stage === 'review') await generate(outgoing);
      if (stage === 'history') { await click('history'); await wait("!document.querySelector('.veynrel-studio-body')?.textContent.includes('Checking…')&&!document.querySelector('.veynrel-studio-body')?.textContent.includes('Проверка…')"); }
      for (const theme of ['theme-dark', 'theme-light']) for (const width of [1200, 390]) {
        await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        await ev(`document.body.removeClass('theme-dark','theme-light');document.body.addClass('${theme}');document.querySelector('.veynrel-studio').scrollTop=0;void 0`);
        await pass(`${lang}/${theme}/${width}/${stage}: no horizontal overflow`, "(()=>{const e=document.querySelector('.veynrel-studio');return e.scrollWidth<=e.clientWidth+1})()");
        await shot(`${stage}-${lang}-${theme}-${width}`);
      }
    }
    await click('library');
  }
  await ev("document.querySelector('[data-studio-action=\"recipe-builtin.smart-format\"]').focus();void 0");
  for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', ...(type === 'keyDown' ? { text: '\r' } : {}) });
  await pass('Native keyboard Enter opens recipe details', "!!document.querySelector('[data-studio-action=choose-notes]')");
  await ev("app.workspace.getLeaf('split').setViewState({type:'veynrel-studio',active:true})");
  await pass('Two native tabs share one runner', "app.workspace.getLeavesOfType('veynrel-studio').length===2&&app.workspace.getLeavesOfType('veynrel-studio').every(l=>l.view.owner===studio)");
  assert.deepEqual(hashes(), initialHashes); checks.push('All six original Markdown hashes restored; unrelated note unchanged');
  await pass('Studio never read the unrelated note', "!io.reads.includes('Untouched.md')");
  // UX regression uses the same native view and synthetic notes; no provider call.
  await ev("app.workspace.getLeavesOfType('veynrel-studio').slice(1).forEach(l=>l.detach());void 0");
  await locale('en'); await click('library'); await click('recipe-builtin.smart-format'); await click('choose-notes');
  const uxReads = await ev('io.reads.length'), uxRequests = requests.length;
  await ev("{const q=[...document.querySelectorAll('[data-studio-key]')].find(e=>e.dataset.studioKey==='Search full paths');q.value='same.md';q.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.veynrel-studio-picker input').click();const t=document.querySelector('.veynrel-studio-body textarea');t.value='Retain this draft';t.dispatchEvent(new Event('input',{bubbles:true}));}void 0");
  await click('library'); await click('recipe-builtin.smart-format'); await click('choose-notes');
  await pass('Returning to preparation retains query, selected full path and instructions', "document.querySelector('.veynrel-studio-body textarea').value==='Retain this draft'&&document.querySelector('.veynrel-studio-picker input').checked&&document.querySelector('.veynrel-studio input[type=search]').value==='same.md'");
  await ev("document.querySelector('.veynrel-studio-body textarea').focus();document.querySelector('.veynrel-studio-body textarea').setSelectionRange(3,8);studio.operations.emit();void 0");
  await pass('Shared status notification preserves field, focus and caret', "document.activeElement?.tagName==='TEXTAREA'&&document.activeElement.selectionStart===3&&document.activeElement.value==='Retain this draft'");
  await click('remove-note'); await pass('Selected note can be removed explicitly', "!document.querySelector('.veynrel-studio-picker input:checked')");
  assert.equal(await ev('io.reads.length'),uxReads); assert.equal(requests.length,uxRequests);checks.push('Draft navigation/search/removal/status causes no note reads or provider requests');
  await click('library'); await click('recipe-builtin.smart-format'); await click('duplicate');
  await ev("{const e=document.querySelector('[data-studio-field=name-en]');e.value='Unsaved draft';e.dispatchEvent(new Event('input',{bubbles:true}));for(const d of app.workspace.getLeavesOfType('veynrel-studio')[0].view.dialogs)d.close();}void 0");
  await click('keep-draft',true);await pass('Closing a changed draft offers inline confirmation and keeps input',"document.querySelector('[data-studio-field=name-en]').value==='Unsaved draft'");
  await ev("for(const d of app.workspace.getLeavesOfType('veynrel-studio')[0].view.dialogs)d.close();void 0");await click('discard-draft',true);
  await click('library');
  // Presentation stress fixtures replace only the metadata list, never model output or engine authority.
  await ev("window.originalUxList=studio.registry.list.bind(studio.registry);window.uxBase=studio.registry.list()[0];studio.registry.list=()=>Array.from({length:100},(_,i)=>({...uxBase,id:'user.ux-'+i,source:'user',name:{en:'Synthetic task '+i,ru:'Вымышленный сценарий '+i}}));window.uxStart=performance.now();app.workspace.getLeavesOfType('veynrel-studio')[0].view.render();window.uxRenderMs=performance.now()-uxStart;void 0");
  await pass('100 synthetic recipe rows render with bounded DOM', "document.querySelectorAll('.veynrel-studio-grid article').length===100&&document.querySelector('.veynrel-studio').querySelectorAll('*').length<1500");
  report.uxPerformance=await ev("({recipes:100,renderMs:uxRenderMs,elements:document.querySelector('.veynrel-studio').querySelectorAll('*').length})");await shot('ux-100-recipes');
  await ev("{const q=document.querySelector('[data-studio-field=search]');q.value='no-such-task';q.dispatchEvent(new Event('input',{bubbles:true}));}void 0");
  await pass('Empty task search has a readable state', "document.querySelector('.veynrel-studio-body').textContent.includes('No recipes found')&&document.querySelectorAll('.veynrel-studio-grid article').length===0");await shot('ux-empty-search');
  await ev("studio.registry.list=originalUxList;app.workspace.getLeavesOfType('veynrel-studio')[0].view.search='';app.workspace.getLeavesOfType('veynrel-studio')[0].view.render();void 0");
  await ev("(async()=>{await app.vault.createFolder('UX stress');for(let i=0;i<20;i++)await app.vault.create('UX stress/'+String(i).padStart(2,'0')+' — Длинное название синтетической заметки.md','# Synthetic note '+i+'\\nOnly fictional facts.');})()");
  const stressExpected=await prepare('builtin.smart-format','UX stress',true);await generate(stressExpected);
  await pass('20 real loopback results show one diff and no automatic selection', "studio.runner.review.rows.length===20&&document.querySelectorAll('[data-studio-select]').length===20&&!document.querySelector('[data-studio-select]:checked')&&document.querySelectorAll('.ai-proposal-diff').length===1");await shot('ux-20-results');
  await click('library');
  for(const width of [1440,1024,390]) {
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    await pass(`UX ${width}: native container fits`,"document.querySelector('.veynrel-studio').scrollWidth<=document.querySelector('.veynrel-studio').clientWidth+1");await shot(`ux-library-${width}`);
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:1500,height:1000,deviceScaleFactor:1,mobile:false});
  await ev("app.workspace.getLeaf('split').setViewState({type:'veynrel-studio',active:true})");
  await pass('Actual native split measures near 720px',"app.workspace.getLeavesOfType('veynrel-studio').every(l=>l.view.contentEl.clientWidth>650&&l.view.contentEl.clientWidth<780)");await shot('ux-library-real-split');
  await ev("app.workspace.getLeavesOfType('veynrel-studio').slice(1).forEach(l=>l.detach());require('electron').webFrame.setZoomFactor(2);void 0");
  await pass('Native 200 percent zoom keeps controls within leaf',"document.querySelector('.veynrel-studio').scrollWidth<=document.querySelector('.veynrel-studio').clientWidth+1");await shot('ux-200-percent');
  await ev("require('electron').webFrame.setZoomFactor(1);void 0");
  await click('library');await click('recipe-builtin.smart-format');
  report.contrast=[];
  for(const theme of ['theme-dark','theme-light']) {
    await ev(`document.body.removeClass('theme-dark','theme-light');document.body.addClass('${theme}');void 0`);
    const sample=await ev("(()=>{const c=document.createElement('canvas'),x=c.getContext('2d');const rgb=v=>{x.clearRect(0,0,1,1);x.fillStyle=v;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data].slice(0,3)};const lum=v=>rgb(v).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0);const e=document.querySelector('[data-studio-action=choose-notes]'),s=getComputedStyle(e),a=lum(s.color),b=lum(s.backgroundColor);return {foreground:s.color,background:s.backgroundColor,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}})()");
    assert(sample.ratio>=4.5,`${theme}: primary action text contrast`);report.contrast.push({theme,...sample});
  }
  checks.push('Primary action text meets 4.5:1 in both native themes (computed colors)');
  report.version = await ev("({electron:process.versions.electron,obsidian:document.title.match(/Obsidian ([0-9.]+)/)?.[1]})");
  assert(report.version.electron && report.version.obsidian, 'native runtime versions observed');
  report.providerRequests = requests.length; report.before = initialHashes; report.after = hashes(); report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.error = String(error); console.error(error); process.exitCode = 1;
  try { report.diagnostic = await ev("({io:window.io,state:window.studio?.runner.state,views:app.workspace.getLeavesOfType('veynrel-studio').length,cards:document.querySelectorAll('.veynrel-studio-grid article').length,dialogs:app.workspace.getLeavesOfType('veynrel-studio').flatMap(l=>[...l.view.dialogs].map(d=>({active:d.active,main:d.contentEl.ownerDocument===document,text:d.contentEl.textContent}))),text:document.body.innerText.slice(-3000)})"); await shot('failure'); } catch {}
}
finally {
  fs.writeFileSync(`${root}/report.json`, JSON.stringify(report, null, 2) + '\n'); socket?.close();
  if (child) { const exit = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM'); await Promise.race([exit, pause(3000)]); if (child.exitCode === null) child.kill('SIGKILL'); }
  releaseProvider?.(); server.close();
}
