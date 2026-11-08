// Native Obsidian, disposable synthetic vault, loopback model transport only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const root = process.argv[2];
assert(root?.startsWith('/tmp/veynrel-recall-native-') && !root.includes('..') && !fs.existsSync(root));
const vault = `${root}/vault`, pluginDir = `${vault}/.obsidian/plugins/ai-knowledge-hub`;
fs.mkdirSync(pluginDir, { recursive: true }); fs.mkdirSync(`${root}/profile`);
const originals = {
  'Study RU.md': '---\ntags: [flashcards/db/transactions]\n---\n# Транзакции\nАтомарность: транзакция выполняется целиком либо её изменения не сохраняются.  \nИзоляция ограничивает взаимное влияние параллельных транзакций.\n',
  'Study EN.md': '# Indexes\nAn index speeds up matching lookups but writes must update the index too.\n',
  'Words.md': '---\nveynrel-recall: vocabulary\nrecall-language: en\nrecall-translation-language: ru\nrecall-direction: both\ntags: [flashcards/languages/en/travel]\ntype: personal\n---\n\n## Vocabulary\nluggage::багаж\nboarding pass::посадочный талон\n',
  'Foreign.md': '## Flashcards\n#flashcards/db2 Foreign question::Foreign answer\n',
};
for (const [path, text] of Object.entries(originals)) fs.writeFileSync(`${vault}/${path}`, text);
let mode = 'normal'; const requests = [];
const server = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  assert.equal(req.url, '/v1/chat/completions'); const body = JSON.parse(raw); requests.push(body);
  if (mode === 'delay') await new Promise(resolve => setTimeout(resolve, 700));
  const content = body.messages[1].content.includes('Атомарность')
    ? 'Что означает атомарность транзакции?::Транзакция выполняется целиком либо её изменения не сохраняются.\nЧто ограничивает изоляция транзакций?::Взаимное влияние параллельных транзакций.'
    : 'Why can an index slow down writes?::Writes must update the index too.';
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content: mode === 'malformed' ? 'Bad response' : content }, finish_reason: mode === 'length' ? 'length' : 'stop' }] }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
fs.writeFileSync(`${pluginDir}/data.json`, JSON.stringify({ language: 'en', provider: 'ollama', model: 'synthetic-recall', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: '', semanticAutoSyncSuspended: true, semantic: { enabled: false }, companion: { enabled: false }, decisions: { enabled: false }, health: { onboardingCompleted: true, profileChosen: true } }));
fs.writeFileSync(`${vault}/.obsidian/community-plugins.json`, '["ai-knowledge-hub"]');
fs.writeFileSync(`${vault}/.obsidian/app.json`, '{"checkForUpdates":false}');
fs.writeFileSync(`${root}/profile/obsidian.json`, JSON.stringify({ updateDisabled: true, vaults: { recall: { path: vault, ts: Date.now(), open: true } } }));
const report = { checks: [], screenshots: [], versions: {}, artifacts: {}, modelQuality: 'NOT TESTED: synthetic transport', limits: 'Linux desktop only; no physical mobile, screen reader, custom theme or offline/Sync rename inference.', exceptions: [] };
for (const name of ['main.js', 'manifest.json', 'styles.css']) { fs.copyFileSync(`${ROOT}/${name}`, `${pluginDir}/${name}`); report.artifacts[name] = createHash('sha256').update(fs.readFileSync(`${pluginDir}/${name}`)).digest('hex'); }
let child, socket, sequence = 0; const pending = new Map();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const cdp = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++sequence, { resolve, reject }); socket.send(JSON.stringify({ id: sequence, method, params })); });
const ev = async expression => { const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
const wait = async expression => { for (let n = 0; n < 250; n++) { if (await ev(expression)) return; await pause(80); } throw Error(`Timeout: ${expression}; ${await ev('document.body.innerText.slice(-1800)')}`); };
const pass = async (name, expression) => { assert(await ev(expression), name); report.checks.push(name); console.log(name); };
const start = () => spawn('/usr/bin/electron43', ['/usr/lib/obsidian/app.asar', `--user-data-dir=${root}/profile`, '--remote-debugging-port=9297', '--disable-gpu', '--ozone-platform=x11'], { stdio: ['ignore', 'ignore', fs.openSync(`${root}/electron.log`, 'a')] });
async function connect() {
  let page; for (let n = 0; n < 250; n++) { try { page = (await (await fetch('http://127.0.0.1:9297/json/list')).json()).find(p => p.url.startsWith('app://obsidian.md/')); } catch {} if (page) break; await pause(100); }
  assert(page, 'native ready'); socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') report.exceptions.push(m.params); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (p) m.error ? p.reject(m.error) : p.resolve(m.result); } };
  await cdp('Runtime.enable'); await cdp('Network.enable'); await cdp('Network.setBlockedURLs', { urls: ['https://*'] });
  await wait('!!window.app?.workspace?.layoutReady'); assert.equal(await ev('app.vault.adapter.basePath'), vault);
  await wait("!!app.plugins.plugins['ai-knowledge-hub']?.recallAuthoring || !!document.querySelector('.mod-trust-folder')");
  if (await ev("!!document.querySelector('.mod-trust-folder')")) await ev("[...document.querySelectorAll('.mod-trust-folder button')].find(e=>/Trust author/.test(e.textContent)).click();void 0");
  await wait("!!app.plugins.plugins['ai-knowledge-hub']?.recallAuthoring && !!app.commands.commands['ai-knowledge-hub:ai-flashcards-note']");
  await ev("window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.author=plugin.recallAuthoring;window.recall=author.recall;void 0");
  await cdp('Page.bringToFront');
}
async function openNote(path) {
  await ev(`(async()=>{const leaf=app.workspace.getLeavesOfType('markdown')[0]??app.workspace.getLeaf('split');await leaf.openFile(app.vault.getFileByPath(${JSON.stringify(path)}));await leaf.view.setState({...leaf.view.getState(),mode:'source',source:true},{history:false});app.workspace.setActiveLeaf(leaf,{focus:true});window.md=leaf.view;window.editor=md.editor;editor.focus();})()`);
  await wait('!!editor.cm');
}
async function key(key, modifiers = 2) {
  await ev('editor.focus();void 0'); await cdp('Page.bringToFront');
  for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: modifiers & 8 ? key.toUpperCase() : key, code: `Key${key.toUpperCase()}`, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0), modifiers });
  await pause(150); await ev('md.save()'); await pause(450);
}
async function openRecall() {
  await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health');void 0");
  await wait("!!document.querySelector('[data-health-action=nav-recall]')");
  await ev("document.querySelector('[data-health-action=nav-recall]').click();void 0");
  await wait("recall.getSnapshot().loadState==='ready'");
}
async function click(action) { await wait(`!!document.querySelector('[data-health-action=${action}]')`); await ev(`document.querySelector('[data-health-action=${action}]').click();void 0`); }
async function shot(name) { fs.writeFileSync(`${root}/${name}.png`, Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64')); report.screenshots.push(`${name}.png`); }
try {
  child = start(); await connect();
  report.versions = await ev("({obsidian:document.title.match(/Obsidian ([0-9.]+)/)?.[1],electron:process.versions.electron})");
  await openNote('Study RU.md');
  await ev("editor.setCursor({line:editor.lastLine(),ch:editor.getLine(editor.lastLine()).length});void 0");
  await cdp('Input.insertText', { text: '\nManual before generation.  ' }); await ev('md.save()');
  await ev("window.before=editor.getValue();author.requestGeneration();author.configure({tag:'flashcards/db/transactions'});void 0");
  await ev('author.generate()');
  await pass('RU generation uses the captured editor and admits two questions', "author.getSnapshot().result?.status==='success' && recall.getSnapshot().summary.active===2 && editor.getValue().includes('#flashcards/db/transactions Что')");
  await ev('window.generated=editor.getValue();void 0'); await shot('ru-generated');
  await key('z'); await pass('One native Ctrl+Z removes generation and preserves earlier manual typing', 'editor.getValue()===before && recall.getSnapshot().summary.active===0');
  await key('z', 10); await pass('Native Ctrl+Shift+Z restores the identical block and active cards', 'editor.getValue()===generated && recall.getSnapshot().summary.active===2');
  await ev("editor.setCursor({line:editor.lastLine(),ch:editor.getLine(editor.lastLine()).length});void 0"); await cdp('Input.insertText', { text: 'Manual after generation.' }); await ev('md.save()');
  await key('z'); await pass('A later manual edit has its own Undo step', 'editor.getValue()===generated');
  await openNote('Study EN.md'); await ev("app.commands.executeCommandById('ai-knowledge-hub:ai-flashcards-note');void 0"); await wait("author.getSnapshot().result?.status==='success'");
  await pass('Existing command appends EN questions through the same generator', "editor.getValue().includes('Why can an index slow down writes?::')");
  const count = requests.length;
  await openRecall(); await pause(500); await wait('!recall.getSnapshot().ingesting'); await ev('recall.refreshCards()');
  await pass('Vocabulary imports locally with two independent directions', "recall.service.listCards({state:'active'}).filter(c=>c.kind==='vocabulary').length===4"); assert.equal(requests.length, count);
  await ev("recall.setScope({kind:'study',tag:'flashcards/db'});recall.startSession()");
  await pass('Parent scope excludes db2 from counters and question', "recall.getSnapshot().summary.active===2 && recall.getSnapshot().session.card.path==='Study RU.md'");
  await click('recall-reveal'); await ev("document.querySelector('[data-health-action=recall-good]').focus();void 0");
  for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: '3', code: 'Digit3', windowsVirtualKeyCode: 51 });
  await wait('!recall.getSnapshot().reviewSaving && recall.getSnapshot().session.reviewed===1');
  await pass('Native rating key 3 commits one review in the selected topic', 'recall.getSnapshot().session.reviewed===1'); await ev('recall.endSession();void 0');
  await ev("recall.setScope({kind:'vocabulary',language:'en',path:'Words.md'});recall.startSession()");
  await pass('Vocabulary hides translation until reveal and shows language direction', "!recall.getSnapshot().session.card.answer && !!document.querySelector('.veynrel-recall-review').textContent.match(/en → ru|ru → en/)");
  await shot('vocabulary-question');
  await click('recall-reveal'); await click('recall-easy'); await wait('!recall.getSnapshot().reviewSaving'); await ev('recall.endSession();window.wordHistory=recall.service.listCards({path:"Words.md"}).map(c=>[c.id,c.schedule]);void 0');
  await ev("app.vault.rename(app.vault.getFileByPath('Words.md'),'Moved Words.md')"); await pause(700);
  await ev("app.vault.process(app.vault.getFileByPath('Moved Words.md'),s=>s.replace('flashcards/languages/en/travel','flashcards/languages/en/airport').replace('luggage::багаж\\nboarding pass::посадочный талон','boarding pass::посадочный талон\\nluggage::багаж'))"); await pause(750);
  await pass('Rename, reorder and retag preserve IDs and schedules', "JSON.stringify(recall.service.listCards({path:'Moved Words.md'}).map(c=>[c.id,c.schedule]))===JSON.stringify(wordHistory)");
  await ev("app.vault.process(app.vault.getFileByPath('Moved Words.md'),s=>s.replace('recall-direction: both','recall-direction: forward'))"); await pause(750);
  await pass('Disabling reverse direction retires its cards without deleting progress', "recall.service.listCards({path:'Moved Words.md',state:'active'}).length===2 && recall.service.listCards({path:'Moved Words.md'}).length===4");
  await ev("app.vault.process(app.vault.getFileByPath('Moved Words.md'),s=>s.replace('recall-direction: forward','recall-direction: both'))"); await pause(750);
  await pass('Re-enabling reverse restores exact histories', "JSON.stringify(recall.service.listCards({path:'Moved Words.md'}).map(c=>[c.id,c.schedule]))===JSON.stringify(wordHistory)");
  fs.writeFileSync(`${root}/word-history.json`, JSON.stringify(await ev('wordHistory')));
  await ev(`app.vault.create('Words.md',${JSON.stringify(originals['Words.md'])}).then(()=>undefined)`); await pause(700);
  assert.equal(await ev("recall.refreshNote('Words.md')"), 'updated', 'Reused path must import independently');
  await pass('A new dictionary on the renamed source path imports independent cards', "recall.service.listCards({path:'Words.md',state:'active'}).length===4 && recall.service.listCards({path:'Words.md'}).every(c=>c.schedule.reviewCount===0 && !wordHistory.some(([id])=>id===c.id))");
  await ev("recall.setScope({kind:'vocabulary',path:'Words.md'});recall.startSession()"); await click('recall-reveal'); await click('recall-easy');
  await wait('!recall.getSnapshot().reviewSaving && recall.getSnapshot().session.reviewed===1'); await ev('recall.endSession();void 0');
  assert.deepEqual(await ev("recall.service.listCards({path:'Moved Words.md'}).map(c=>[c.id,c.schedule])"), await ev('wordHistory'));
  await pass('Reviewing the reused path leaves the moved dictionary history unchanged', "recall.service.listCards({path:'Words.md'}).filter(c=>c.schedule.reviewCount===1).length===1");
  fs.writeFileSync(`${root}/reused-word-history.json`, JSON.stringify(await ev("recall.service.listCards({path:'Words.md'}).map(c=>[c.id,c.schedule])")));
  await ev("app.vault.rename(app.vault.getFileByPath('Words.md'),'Reused Words.md')"); await pause(700);
  await ev("app.vault.rename(app.vault.getFileByPath('Moved Words.md'),'Words.md')"); await pause(700);
  assert.deepEqual(await ev("recall.service.listCards({path:'Words.md'}).map(c=>[c.id,c.schedule])"), await ev('wordHistory'));
  await ev("app.vault.rename(app.vault.getFileByPath('Words.md'),'Moved Words.md')"); await pause(700);
  await ev('recall.refreshCards()');
  await pass('Full refresh and repeated moves retain both independent dictionaries', "recall.getSnapshot().inventoryResult.committed && recall.service.listCards().filter(c=>['Moved Words.md','Reused Words.md'].includes(c.path)&&c.state==='active').length===8");
  await ev("app.vault.create('Plain.md','Only prose.').then(()=>undefined)"); await pause(700);
  await ev("window.recallWrites=0;window.originalWrite=app.vault.adapter.write;app.vault.adapter.write=async function(path,...args){if(path.endsWith('/recall/cards.json'))recallWrites++;return originalWrite.call(this,path,...args)};void 0");
  const beforeProse = fs.readFileSync(`${pluginDir}/recall/cards.json`, 'utf8');
  for (let i=0;i<3;i++) { await ev(`app.vault.modify(app.vault.getFileByPath('Plain.md'),'Only prose ${i}.')`); await pause(700); }
  await pass('Three saved prose edits issue zero cards.json writes in native Obsidian', 'recallWrites===0');
  assert.equal(fs.readFileSync(`${pluginDir}/recall/cards.json`, 'utf8'), beforeProse);
  await ev('app.vault.adapter.write=originalWrite;void 0');
  await openNote('Study EN.md'); mode = 'length'; const original = await ev('editor.getValue()'); await ev('author.generateForNote(md.file)');
  assert.equal(await ev('editor.getValue()'), original); await pass('Length completion makes no insertion', "author.getSnapshot().result?.status==='error'"); mode = 'normal';
  mode = 'malformed'; await ev('author.generateForNote(md.file)');
  assert.equal(await ev('editor.getValue()'), original); await pass('Malformed output makes no insertion and no repair request', "author.getSnapshot().result?.reason==='invalid-output'");
  mode = 'delay'; await ev('window.pendingGeneration=author.generateForNote(md.file);void 0'); await pause(100);
  await ev("editor.replaceRange('Concurrent user edit.\\n',{line:0,ch:0});md.save()"); await ev('pendingGeneration');
  await pass('Source edits while the model waits are preserved and block generation apply', "author.getSnapshot().result?.reason==='conflict' && editor.getValue().startsWith('Concurrent user edit.')"); mode = 'normal';
  await ev("app.vault.create('Long.md','Selected fact.\\n'+'x'.repeat(32001)).then(()=>undefined)"); await openNote('Long.md');
  const beforeLong = requests.length; await ev('author.generateForNote(md.file)');
  await pass('Long input is rejected before transport', "author.getSnapshot().result?.reason==='source-too-long'"); assert.equal(requests.length, beforeLong);
  await ev("editor.setSelection({line:0,ch:0},{line:0,ch:14});author.requestGeneration();void 0"); await ev('author.generate()');
  assert.equal(requests.at(-1).messages[1].content, 'Selected fact.'); await pass('Explicit selection bounds long-note generation', "author.getSnapshot().result?.status==='success'");
  // Persist the override through an actual plugin reload; no inference is made by these checks.
  await ev("author.savePrompt('CUSTOM RECALL INSTRUCTION')");
  await ev("app.plugins.disablePlugin('ai-knowledge-hub')"); await ev("app.plugins.enablePlugin('ai-knowledge-hub')");
  await wait("!!app.plugins.plugins['ai-knowledge-hub']?.recallAuthoring");
  await ev("window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.author=plugin.recallAuthoring;window.recall=author.recall;recall.initialize()");
  assert.deepEqual(await ev("recall.service.listCards({path:'Moved Words.md'}).map(c=>[c.id,c.schedule])"), JSON.parse(fs.readFileSync(`${root}/word-history.json`)));
  await pass('Owner restart preserves prompt and exact vocabulary schedules', "plugin.settings.recallPrompt==='CUSTOM RECALL INSTRUCTION'");
  socket.close();
  { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM'); const timer=setTimeout(()=>child.kill('SIGKILL'),3000);await exited;clearTimeout(timer); }
  child = start(); await connect(); await ev('recall.initialize()');
  assert.deepEqual(await ev("recall.service.listCards({path:'Moved Words.md'}).map(c=>[c.id,c.schedule])"), JSON.parse(fs.readFileSync(`${root}/word-history.json`)));
  await pass('Full Obsidian process restart preserves vocabulary history and prompt', "plugin.settings.recallPrompt==='CUSTOM RECALL INSTRUCTION'");
  assert.deepEqual(await ev("recall.service.listCards({path:'Reused Words.md'}).map(c=>[c.id,c.schedule])"), JSON.parse(fs.readFileSync(`${root}/reused-word-history.json`)));
  await pass('Reused-path dictionary history survives full process restart independently', "recall.service.listCards({path:'Reused Words.md',state:'active'}).length===4");
  await openRecall(); await ev("recall.setScope({kind:'vocabulary',tag:'flashcards/languages/en'});void 0");
  await ev("for(const type of ['markdown','empty'])for(const leaf of app.workspace.getLeavesOfType(type))leaf.detach();app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();void 0");
  for (const language of ['en', 'ru']) {
    await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await ev(`{const s=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));s.value='${language}';s.dispatchEvent(new Event('change'));}void 0`);
    await ev('plugin.settingsSave'); await ev('app.setting.close();void 0'); await openRecall();
    for (const theme of ['light', 'dark']) for (const width of [320, 390, 1280]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: false });
      await ev(`app.changeTheme('${theme === 'light' ? 'moonstone' : 'obsidian'}');void 0`); await pause(300);
      await pass(`${language}/${theme}/${width}: localized Recall without horizontal overflow`, `(()=>{const e=document.querySelector('.veynrel-recall');return e && !e.textContent.includes('@recall.') && e.scrollWidth<=e.clientWidth+1 && document.body.classList.contains('theme-${theme}')})()`);
      await shot(`recall-${language}-${theme}-${width}`);
    }
  }
  report.providerRequests = requests.length; report.passed = true;
} catch (error) { try { await shot("failure"); report.failureState = await ev('({layout:[...document.querySelectorAll(".veynrel-recall,.veynrel-recall *")].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>({tag:e.tagName,cls:e.className,w:e.clientWidth,scroll:e.scrollWidth})),snapshot:recall.getSnapshot(),author:author.getSnapshot(),editor:window.editor?.getValue(),before:window.before,generated:window.generated})'); } catch {} report.passed = false; report.error = String(error); console.error(error); process.exitCode = 1; }
finally {
  fs.writeFileSync(`${root}/report.json`, JSON.stringify(report, null, 2));
  if (socket) socket.close();
  if (child && child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 3000); await exited; clearTimeout(timer); }
  server.close();
}
