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
const originals = {
  'Formatting.md': '# heading\nfree text\n\n<img src="https://invalid.test/tracker">\n![[Untouched]]\n```js\nconsole.log("literal");\n```\n',
  'Training.md': 'Сегодня жим лёжа 3 по 10 с 50 кг, потом приседания 4 по 8, 60 кг.\n',
  'Nutrition.md': 'Завтрак: овсянка 100 г, яблоко. Обед: суп, количество не записал.\n',
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
  const content = system.includes('Structure the workout') ? '# Тренировка\n\n| Упражнение | Подходы | Повторы | Вес |\n| --- | --- | --- | --- |\n| Жим лёжа | 3 | 10 | 50 кг |\n| Приседания | 4 | 8 | 60 кг |\n' :
    system.includes('Structure the food') ? '# Питание\n\n| Приём пищи | Продукт | Количество | КБЖУ |\n| --- | --- | --- | --- |\n| Завтрак | Овсянка | 100 г | неизвестно |\n| Завтрак | Яблоко | неизвестно | неизвестно |\n| Обед | Суп | неизвестно | неизвестно |\n' : `# Organized\n\n${markdown}`;
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
  limits: 'Linux desktop, built-in themes. Synthetic responses verify transport and workflow, not model quality. No paid/live provider, personal vault, physical mobile, screen reader or external cross-process races.' };
const cdp = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++sequence, { resolve, reject }); socket.send(JSON.stringify({ id: sequence, method, params })); });
const ev = async expression => { const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
const wait = async expression => { for (let i = 0; i < 240; i++) { if (await ev(expression)) return; await pause(50); } throw Error(`Timeout: ${expression}; ${await ev('document.body.innerText.slice(-2000)')}`); };
const pass = async (name, expr) => { assert(await ev(expr), name); checks.push(name); console.log(name); };
const click = async (action, modal = false) => { const selector = `${modal ? '.veynrel-studio-dialog' : '.veynrel-studio'} [data-studio-action=${JSON.stringify(action)}]`; await wait(`!!document.querySelector(${JSON.stringify(selector)})`); await ev(`document.querySelector(${JSON.stringify(selector)}).click();void 0`); };
const hashes = () => Object.fromEntries(Object.keys(originals).map(path => [path, sha(fs.readFileSync(`${vault}/${path}`))]));
const initialHashes = hashes();
async function connect() {
  let page; for (let i = 0; i < 200; i++) { try { page = (await (await fetch('http://127.0.0.1:9286/json/list')).json()).find(p => p.url.startsWith('app://obsidian.md/')); } catch {} if (page) break; await pause(100); }
  assert(page, 'native ready'); socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (p) m.error ? p.reject(m.error) : p.resolve(m.result); } };
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
  await click('library'); await click(`recipe-${recipe}`); await click('choose-notes');
  if (folder) {
    await ev(`{const selects=document.querySelectorAll('.veynrel-studio-body select');selects[0].value='folder';selects[0].dispatchEvent(new Event('change'));selects[1].value=${JSON.stringify(paths)};selects[1].dispatchEvent(new Event('change'));}void 0`);
  } else {
    await ev(`{for(const path of ${JSON.stringify(paths)}){const label=[...document.querySelectorAll('.veynrel-studio-picker label')].find(e=>e.textContent===path);if(!label)throw Error('missing path '+path);label.querySelector('input').click();}}void 0`);
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
  await ev(`{for(const path of ${JSON.stringify(paths)})document.querySelector('[data-studio-select='+CSS.escape(path)+']').click();}void 0`);
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
  await ev("{const inputs=document.querySelectorAll('.veynrel-studio-dialog input');inputs[0].value='My local recipe';inputs[1].value='Мой локальный сценарий';}void 0");
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
  expected = await prepare('builtin.smart-format', ['Formatting.md']); await generate(expected);
  await ev("app.workspace.getLeaf('split').openFile(app.vault.getFileByPath('Formatting.md'))");
  await apply(['Formatting.md']); await pass('A real open Markdown editor blocks Apply', "studio.runner.results[0].outcome==='conflict'&&studio.runner.results[0].reason==='editor'");
  await ev("for(const leaf of app.workspace.getLeavesOfType('markdown'))leaf.detach();void 0");
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
  report.version = await ev("({electron:process.versions.electron,obsidian:document.title.match(/Obsidian ([0-9.]+)/)?.[1]})");
  assert(report.version.electron && report.version.obsidian, 'native runtime versions observed');
  report.providerRequests = requests.length; report.before = initialHashes; report.after = hashes(); report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.error = String(error); console.error(error); process.exitCode = 1;
  try { report.diagnostic = await ev("({io:window.io,state:window.studio?.runner.state,views:app.workspace.getLeavesOfType('veynrel-studio').length,cards:document.querySelectorAll('.veynrel-studio-grid article').length,text:document.body.innerText.slice(-3000)})"); await shot('failure'); } catch {}
}
finally {
  fs.writeFileSync(`${root}/report.json`, JSON.stringify(report, null, 2) + '\n'); socket?.close();
  if (child) { const exit = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM'); await Promise.race([exit, pause(3000)]); if (child.exitCode === null) child.kill('SIGKILL'); }
  releaseProvider?.(); server.close();
}
