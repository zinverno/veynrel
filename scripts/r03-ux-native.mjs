// Native R03 audit/acceptance; isolated profiles and synthetic Markdown only.
// node scripts/r03-ux-native.mjs /tmp/veynrel-r03-native-<unique> before|after small|empty|lab|clean|scope|conflict [artifact-dir]
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const [root, phase, mode = 'small', kit = ROOT] = process.argv.slice(2);
assert(root?.startsWith('/tmp/veynrel-r03-native-') && !root.includes('..') && !fs.existsSync(root));
assert(['before', 'after'].includes(phase) && ['small', 'empty', 'lab', 'clean', 'scope', 'conflict'].includes(mode));
const vault = `${root}/vault`, dir = `${vault}/.obsidian/plugins/ai-knowledge-hub`;
fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(`${root}/profile`);
const sha = b => createHash('sha256').update(b).digest('hex');
const markdown = base => Object.fromEntries(fs.readdirSync(base, { recursive: true }).filter(p => p.endsWith('.md') && !p.startsWith('.obsidian/') && fs.statSync(`${base}/${p}`).isFile()).sort().map(p => [p, sha(fs.readFileSync(`${base}/${p}`))]));
const lab = '/home/zinvernix/Documents/Все хранилища OBSID/Veynrel Lab 1000';
let corpusBefore;
const originals = ['small', 'clean', 'scope', 'conflict'].includes(mode) ? {
  'Study/Source.md': '# Notes\n\nA synthetic explanation with enough detail for formatting.\n\n- First known fact.\n- Second known fact.\n\n[[Missing source]]\n',
  'Study/Copy.md': '# Notes\n\nA synthetic explanation with enough detail for formatting.\n\n- First known fact.\n- Second known fact.\n\n[[Missing source]]\n',
  'Study/nested/Short.md': '# Short\n',
  'Study-old/Outside.md': '# Outside\n\nThis belongs outside the chosen folder. No private information is present.\n',
  'Linked/A.md': '# A\n\n[[B]]\n\nThis synthetic reference explains the first part in enough words to avoid the short-note criterion.\n',
  'Linked/B.md': '# B\n\n[[A]]\n\nThis synthetic reference explains the second part in enough words to avoid the short-note criterion.\n',
} : {};
if (mode === 'clean') for (const path of Object.keys(originals)) if (!path.startsWith('Linked/')) delete originals[path];
if (mode === 'lab') {
  corpusBefore = markdown(lab); assert.equal(Object.keys(corpusBefore).length, 1000);
  for (const path of Object.keys(corpusBefore)) { fs.mkdirSync(`${vault}/${path.split('/').slice(0, -1).join('/')}`, { recursive: true }); fs.copyFileSync(`${lab}/${path}`, `${vault}/${path}`); }
}
for (const [path, text] of Object.entries(originals)) { fs.mkdirSync(`${vault}/${path.split('/').slice(0, -1).join('/')}`, { recursive: true }); fs.writeFileSync(`${vault}/${path}`, text); }
if (mode === 'small') fs.mkdirSync(`${vault}/Empty`);
const requests = [];
const server = createServer(async (req, res) => {
  let raw = ''; for await (const part of req) raw += part;
  assert.equal(req.url, '/v1/chat/completions'); requests.push(JSON.parse(raw));
  const note = JSON.parse(JSON.parse(raw).messages[1].content).markdown;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content: `# Organized material\n\n${note}` }, finish_reason: 'stop' }] }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const settings = { language: 'en', provider: 'ollama', model: 'SYNTHETIC-UI-FIXTURE', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: '', semanticAutoSyncSuspended: true, semantic: { enabled: false }, decisions: { enabled: false }, companion: { enabled: false }, health: { profile: 'mixed', profileChosen: false, onboardingCompleted: false } };
fs.writeFileSync(`${dir}/data.json`, JSON.stringify(settings));
fs.writeFileSync(`${vault}/.obsidian/community-plugins.json`, '["ai-knowledge-hub"]');
fs.writeFileSync(`${vault}/.obsidian/app.json`, '{"checkForUpdates":false}');
fs.writeFileSync(`${root}/profile/obsidian.json`, JSON.stringify({ updateDisabled: true, vaults: { r03: { path: vault, ts: Date.now(), open: true } } }));
const artifacts = {};
for (const file of ['main.js', 'styles.css', 'manifest.json']) { fs.copyFileSync(`${kit}/${file}`, `${dir}/${file}`); artifacts[file] = sha(fs.readFileSync(`${dir}/${file}`)); }
const initial = markdown(vault), report = { phase, mode, artifacts, initial, checks: [], observations: {}, io: {}, screenshots: [], videos: [], exceptions: [], actions: [], remoteModelRequests: 0, syntheticModelRequests: 0 };
let socket, child, sequence = 0, recording, mainTargetId;
const pending = new Map(), pause = ms => new Promise(r => setTimeout(r, ms));
const cdp = (method, params = {}, sessionId) => new Promise((resolve, reject) => { pending.set(++sequence, { resolve, reject }); socket.send(JSON.stringify({ id: sequence, method, params, sessionId })); });
const ev = async expression => { const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value; };
const wait = async (expression, timeout = 20000) => { for (let i = 0; i < timeout / 100; i++) { if (await ev(expression)) return; await pause(100); } throw Error(`Timeout ${expression}`); };
const pass = async (name, expression) => { assert(await ev(expression), name); report.checks.push(name); console.log(name); };
const shot = async name => { await pause(250); fs.writeFileSync(`${root}/${name}.png`, Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64')); report.screenshots.push(`${name}.png`); };
async function record(name) {
  fs.mkdirSync(`${root}/${name}`); recording = { name, frames: [], started: Date.now() };
  await cdp('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 }); await pause(1500);
}
async function endRecord() {
  if (!recording) return;
  await pause(1500); await cdp('Page.stopScreencast');
  const r = recording; recording = undefined;
  assert(r.frames.length > 2, 'continuous native screencast received');
  const list = r.frames.map((f, i) => `file '${f.file}'\nduration ${Math.max(.02, ((r.frames[i + 1]?.time ?? Date.now() / 1000) - f.time))}`).join('\n') + `\nfile '${r.frames.at(-1).file}'\n`;
  fs.writeFileSync(`${root}/${r.name}/frames.txt`, list);
  const encoded = spawnSync('ffmpeg', ['-v', 'error', '-f', 'concat', '-safe', '0', '-i', `${root}/${r.name}/frames.txt`, '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-r', '20', '-c:v', 'libx264', '-threads', '2', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', `${root}/${r.name}.mp4`], { encoding: 'utf8' });
  assert.equal(encoded.status, 0, encoded.stderr); report.videos.push({ file: `${r.name}.mp4`, frames: r.frames.length, milliseconds: Date.now() - r.started, method: 'Uncut CDP native viewport screencast; frame timestamps retained. Synthetic UI response.' });
}
async function pointer(selector) {
  await cdp('Page.bringToFront'); await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  const point = await ev(`(async()=>{const e=document.querySelector(${JSON.stringify(selector)});for(let a=e.parentElement;a;a=a.parentElement)if(a.tagName==='DETAILS')a.open=true;e.scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const b=e.getBoundingClientRect();if(e.disabled)throw Error('disabled '+e.textContent);return{x:b.x+b.width/2,y:b.y+b.height/2}})()`);
  for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1, ...point });
  report.actions.push({ selector, recording: recording?.name }); await pause(recording ? 1000 : 120);
}
const health = action => pointer(`.veynrel-health-view [data-health-action="${action}"]`);
const studio = (action, modal = false) => pointer(`${modal ? '.veynrel-studio-dialog' : '.veynrel-studio'} [data-studio-action="${action}"]`);
const checkpoint = async name => { report.io[name] = { ...await ev('JSON.parse(JSON.stringify(io))'), modelRequests: requests.length }; };
const start = () => spawn('/usr/bin/electron43', ['/usr/lib/obsidian/app.asar', `--user-data-dir=${root}/profile`, '--remote-debugging-port=9393', '--disable-gpu', '--ozone-platform=x11'], { stdio: ['ignore', 'ignore', fs.openSync(`${root}/electron.log`, 'a')] });
async function key(key, code, windowsVirtualKeyCode) {
  await cdp('Page.bringToFront'); await wait('document.hasFocus()');
  for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, ...(key === 'Enter' && type === 'keyDown' ? { text: '\r', unmodifiedText: '\r' } : {}) });
  await pause(100);
}
async function locale(language) {
  await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
  await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'))}void 0`);
  await ev('plugin.settingsSave'); await ev('app.setting.close();hv.render();sv.render();void 0');
}
async function connect() {
  let page; for (let i = 0; i < 200; i++) { try { page = (await (await fetch('http://127.0.0.1:9393/json/list')).json()).find(p => p.url.startsWith('app://obsidian.md/')); } catch {} if (page) break; await pause(100); }
  assert(page, 'real Obsidian started'); mainTargetId = page.id; socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
  socket.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') report.exceptions.push(m.params);
    if (m.method === 'Page.screencastFrame') {
      if (recording) { const file = `${String(recording.frames.length).padStart(6, '0')}.jpg`; fs.writeFileSync(`${root}/${recording.name}/${file}`, Buffer.from(m.params.data, 'base64')); recording.frames.push({ file, time: m.params.metadata.timestamp }); }
      void cdp('Page.screencastFrameAck', { sessionId: m.params.sessionId });
    }
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (p) m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable'); await cdp('Network.setBlockedURLs', { urls: ['https://*'] });
  await wait('!!window.app?.workspace?.layoutReady'); assert.equal(await ev('app.vault.adapter.basePath'), vault);
  await wait("!!document.querySelector('.mod-trust-folder')||!!app.commands.commands['ai-knowledge-hub:veynrel-open-health']");
  if (await ev("!!document.querySelector('.mod-trust-folder')")) await ev("[...document.querySelectorAll('.mod-trust-folder button')].find(e=>/Trust author/.test(e.textContent)).click();void 0");
  await wait("!!app.commands.commands['ai-knowledge-hub:veynrel-open-studio']");
  await ev(`window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.studio=plugin.studio;window.io={reads:[],writes:[],adapterReads:[],adapterWrites:[],browserRequests:0};
    for(const key of ['read','cachedRead']){const fn=app.vault[key].bind(app.vault);app.vault[key]=(...args)=>{io.reads.push({method:key,path:args[0].path});return fn(...args)}}
    for(const key of ['create','modify','process','delete','rename']){const fn=app.vault[key].bind(app.vault);app.vault[key]=(...args)=>{io.writes.push({method:key,path:args[0]?.path??args[0]});return fn(...args)}}
    for(const key of ['read','write','append']){const fn=app.vault.adapter[key].bind(app.vault.adapter);app.vault.adapter[key]=(...args)=>{io[key==='read'?'adapterReads':'adapterWrites'].push({method:key,path:args[0]});return fn(...args)}}
    window.fetch=()=>{io.browserRequests++;throw Error('No external fetch in native acceptance')};XMLHttpRequest.prototype.send=function(){io.browserRequests++;throw Error('No external XHR in native acceptance')};
    app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();void 0`);
  report.versions = await ev("({obsidian:document.title.match(/Obsidian ([0-9.]+)/)?.[1],electron:process.versions.electron,chrome:process.versions.chrome,platform:process.platform})");
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false }); await cdp('Page.bringToFront');
}
try {
  child = start();
  await connect();
  await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health');void 0");
  await wait("!!document.querySelector('.veynrel-health-onboarding')");
  await ev("window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;io.localScans=0;const r03Scan=hv.controller.runLocalScan.bind(hv.controller);hv.controller.runLocalScan=(...args)=>{io.localScans++;return r03Scan(...args)};void 0");
  await shot('workspace-new-user'); await checkpoint('new-user-passive');
  await pass('New no-key opening reads no Markdown and sends no model requests', 'io.reads.length===0&&io.writes.length===0&&io.browserRequests===0'); assert.equal(requests.length, 0);
  // Baseline chooses the existing mixed profile; R03 can offer the explicit direct local check.
  if (await ev("!!hv.contentEl.querySelector('[data-health-action=start-local]')")) await health('start-local');
  else { await health('profile-mixed'); await wait("!!hv.contentEl.querySelector('[data-health-action=scan]')"); await health('scan'); }
  await wait("!hv.controller.getState().busy&&!!hv.contentEl.querySelector('[data-health-action=continue]')", 120000);
  report.observations.firstLocalScan = await ev('({outcome:hv.controller.getState().outcome,openFindings:hv.controller.getState().snapshot.openFindings})');
  if (mode === 'clean') assert.equal(report.observations.firstLocalScan.openFindings, 0, 'Known clean linked fixture has no findings');
  await shot('workspace-first-result'); await checkpoint('first-explicit-scan'); await health('continue');
  await wait("!!hv.contentEl.querySelector('[data-health-action=nav-home]')");
  await shot('workspace-home');
  if (mode === 'small') {
    await record('workspace-journey');
    await health('nav-home');
    await ev("{const e=hv.contentEl.querySelector('[data-health-action=scope-picker]');e.value='Study';e.dispatchEvent(new Event('change'))}void 0"); report.actions.push({ selector: 'scope-picker:Study', recording: recording.name }); await pause(1000);
    await shot('workspace-folder'); await health('home-check');
    if (await ev("!!hv.contentEl.querySelector('[data-health-action=scope-continue]')")) { await shot('workspace-real-scope'); await health('scope-continue'); }
    if (await ev("!!hv.contentEl.querySelector('[data-health-action=scan]')")) await health('scan');
    await wait('!hv.controller.getState().busy', 120000); await shot('workspace-checked');
    await health('nav-findings');
    if (await ev("!!hv.contentEl.querySelector('[data-health-action=scope-continue]')")) await health('scope-continue');
    await wait("!!hv.contentEl.querySelector('.veynrel-findings-row')");
    await pointer('.veynrel-findings-row');
    if (await ev("!!hv.contentEl.querySelector('[data-health-action=scope-continue]')")) await health('scope-continue');
    await pass('Real finding shows its evidence', "!!hv.contentEl.querySelector('[data-findings-heading]')&&!!hv.route.selectedFindingId");
    await shot('workspace-finding'); await endRecord();
    const beforeContext = await ev('JSON.parse(JSON.stringify(hv.route))');
    await health('nav-home'); await health('nav-health');
    if (await ev("!!hv.contentEl.querySelector('[data-health-action=scope-continue]')")) await health('scope-continue');
    await health('nav-findings'); if (await ev("!!hv.contentEl.querySelector('[data-health-action=scope-continue]')")) await health('scope-continue');
    report.observations.findingReturn = { before: beforeContext, after: await ev('hv.route') };
    if (phase === 'after') assert.deepEqual(report.observations.findingReturn.after, beforeContext, 'Finding survives return');
    await health('nav-home');
  }
  await checkpoint('workspace-actions');
  await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-studio');void 0");
  await wait("!!document.querySelector('.veynrel-studio [data-studio-action=new]')");
  await ev("window.sv=app.workspace.getLeavesOfType('veynrel-studio')[0].view;void 0");
  await shot('studio-library'); await checkpoint('studio-passive');
  if (mode === 'scope') {
    await studio('recipe-builtin.smart-format'); await studio('choose-notes');
    await ev("{const [mode,folder]=sv.body.querySelectorAll('select');mode.value='folder';mode.dispatchEvent(new Event('change'));folder.value='Study';folder.dispatchEvent(new Event('change'))}void 0");
    report.observations.folderDisplay = await ev("sv.body.querySelectorAll('select')[1].parentElement.parentElement.querySelector('[role=status]').textContent");
    assert(report.observations.folderDisplay.startsWith('3 / 20\n'));
    await studio('library'); await studio('recipe-builtin.smart-format'); await studio('choose-notes');
    await pass('Folder and its exact displayed paths survive library navigation', "sv.body.querySelectorAll('select')[0].value==='folder'&&sv.body.querySelectorAll('select')[1].value==='Study'&&sv.body.querySelectorAll('select')[1].parentElement.parentElement.querySelector('[role=status]').textContent.startsWith('3 / 20\\n')");
    await shot('studio-folder-selection'); await studio('prepare'); await wait("studio.runner.state==='prepared'&&!studio.runner.running");
    report.observations.preparedPaths = await ev('studio.runner.prepared.requests.map(r=>r.path)');
    assert.deepEqual([...report.observations.preparedPaths].sort(), ['Study/Copy.md', 'Study/Source.md', 'Study/nested/Short.md']);
    assert.deepEqual(report.observations.folderDisplay.split('\n').slice(1).sort(), [...report.observations.preparedPaths].sort());
    report.checks.push('Displayed folder count and paths equal prepared requests, excluding Study-old; zero model requests');
    await shot('studio-folder-consent'); await checkpoint('folder-explicit-preparation');
  }
  if (['small', 'conflict'].includes(mode)) {
    await record('studio-journey'); await studio('library'); await studio('recipe-builtin.smart-format');
    await shot('studio-recipe');
    if (await ev("!!document.querySelector('[data-studio-action=choose-notes]')")) await studio('choose-notes');
    await ev("[...document.querySelectorAll('.veynrel-studio-picker label')].find(e=>e.textContent==='Study/Source.md').querySelector('input').setAttribute('data-native-source','true');void 0");
    await pointer('[data-native-source]');
    if (await ev("!!document.querySelector('.veynrel-studio-field textarea')?.closest('details:not([open])')")) {
      await ev("document.querySelector('.veynrel-studio-field textarea').closest('details').querySelector('summary').setAttribute('data-native-instructions','true');void 0");
      await pointer('[data-native-instructions]');
    }
    await pointer('.veynrel-studio-field textarea'); await cdp('Input.insertText', { text: 'Keep every factual detail.' });
    await shot('studio-preparation'); await studio('prepare'); await wait("studio.runner.state==='prepared'&&!studio.runner.running");
    await shot('studio-consent'); assert.equal(requests.length, 0);
    await studio('generate'); await wait("studio.runner.state==='review'&&!studio.runner.running");
    if (phase === 'after') await pass('Review explains and disables writing with no selection', "document.querySelector('[data-studio-action=review-apply]').disabled&&document.querySelector('.veynrel-studio-body').textContent.includes('select a result below')");
    await shot('studio-review'); await pointer('[data-studio-select]'); await studio('review-apply');
    await wait("!!document.querySelector('.veynrel-studio-dialog')"); await shot('studio-write-confirmation');
    if (mode === 'conflict') {
      report.observations.conflictTarget = await ev('studio.runner.writePlan.rows[0].target');
      await ev("app.vault.create(studio.runner.writePlan.rows[0].target,'# Concurrent synthetic file\\n').then(()=>{})");
      await checkpoint('before-conflict-confirmation');
    }
    await studio('confirm-apply', true);
    await wait("!studio.runner.running&&!document.querySelector('.veynrel-studio-dialog')");
    await shot(mode === 'conflict' ? 'studio-conflicted' : 'studio-saved'); await endRecord();
    if (mode === 'conflict') {
      await pass('Existing target is a visible conflict; no overwrite or renamed fallback', "studio.runner.results?.[0]?.outcome==='conflict'&&studio.runner.results[0].reason==='target'&&sv.body.textContent.includes('Conflict')");
      assert.equal(fs.readFileSync(`${vault}/${report.observations.conflictTarget}`, 'utf8'), '# Concurrent synthetic file\n');
      assert.equal(await ev('io.writes.length'), report.io['before-conflict-confirmation'].writes.length);
      report.observations.conflictResult = await ev('studio.runner.results'); await shot('studio-write-conflict');
    } else await pass('Separate note successfully created', "studio.runner.results?.some(r=>r.outcome==='created')");
    await checkpoint('studio-explicit');
  }
  assert.equal(requests.length, ['small', 'conflict'].includes(mode) ? 1 : 0); report.syntheticModelRequests = requests.length;
  if (mode === 'small') {
    for (const language of ['en', 'ru']) {
      await locale(language);
      for (const theme of ['dark', 'light']) for (const width of [1400, 434]) {
        await ev(`app.changeTheme('${theme === 'light' ? 'moonstone' : 'obsidian'}');void 0`);
        await wait(`document.body.classList.contains('theme-${theme}')`);
        await cdp('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
        for (const [name, view] of [['workspace', 'hv'], ['studio', 'sv']]) {
          await ev(`app.workspace.setActiveLeaf(${view}.leaf,{focus:true});${view}.navigate(${view === 'hv' ? "{page:'home'}" : "'library'"});${view}.contentEl.scrollTop=0;void 0`); await pause(400);
          const bounds = await ev(`({width:${view}.contentEl.clientWidth,scrollWidth:${view}.contentEl.scrollWidth,theme:[...document.body.classList].filter(c=>c.startsWith('theme-')),background:getComputedStyle(${view}.contentEl).backgroundColor})`);
          report.observations[`${name}-${language}-${theme}-${width}`] = bounds;
          assert(bounds.scrollWidth <= bounds.width + 1, JSON.stringify(bounds));
          if (phase === 'after' && name === 'studio') assert.equal(await ev("sv.contentEl.querySelector('[data-studio-action=library]').textContent"), language === 'ru' ? 'Библиотека' : 'Library');
          await shot(`${name}-${language}-${theme}-${width}`);
        }
      }
    }
    report.checks.push('Full native viewports EN/RU, actual built-in dark/light, wide/390px without horizontal overflow');
  }
  if (phase === 'after' && mode === 'small') {
    await locale('en'); await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
    await ev("app.workspace.setActiveLeaf(sv.leaf,{focus:true});sv.navigate('library');void 0");
    await studio('recipe-builtin.smart-format'); await studio('choose-notes');
    await pass('Recipe draft retains chosen path and instructions after library, locale and rerenders', "sv.setupDrafts.get('builtin.smart-format').chosen.has('Study/Source.md')&&document.querySelector('.veynrel-studio-field textarea').value==='Keep every factual detail.'");
    await ev("document.querySelector('.veynrel-studio-field textarea').focus();sv.render();void 0");
    await pass('Rerender keeps input focus', "document.activeElement.tagName==='TEXTAREA'");
    await key('Tab', 'Tab', 9); await pass('Tab reaches the next control', "document.activeElement.tagName!=='BODY'&&sv.contentEl.contains(document.activeElement)");
    await checkpoint('before-passive-navigation');
    await ev("for(const route of ['community','history','library'])sv.navigate(route);app.workspace.setActiveLeaf(hv.leaf,{focus:true});hv.selectScope();for(const page of ['home','health','findings','recall','tools','history','settings','process','discover','home'])hv.navigate(page==='findings'?{page,state:'open',dimension:'all'}:{page});void 0");
    await pause(1000); await checkpoint('after-passive-navigation');
    const passiveBefore = report.io['before-passive-navigation'], passiveAfter = report.io['after-passive-navigation'];
    assert.equal(passiveAfter.writes.length, passiveBefore.writes.length); assert.equal(passiveAfter.modelRequests, passiveBefore.modelRequests);
    assert.equal(passiveAfter.localScans, passiveBefore.localScans);
    assert.deepEqual(passiveAfter.reads.slice(passiveBefore.reads.length).map(r=>r.path), ['Study/Source — Studio.md'], 'History only verifies its created target; no vault scan');
    report.checks.push('Passive navigation: one existing history target verification, zero local scans, writes or model requests');
    await ev("hv.contentEl.querySelector('[data-health-action=home-check]').focus();void 0"); await key('Enter', 'Enter', 13);
    report.observations.enterCheck = await ev("({route:hv.route,focus:document.activeElement?.outerHTML,documentFocus:document.hasFocus(),busy:hv.controller.getState().busy})");
    await pass('Enter follows the primary check route without scanning', "hv.route.page==='health'&&!hv.controller.getState().busy");
    await health('nav-home'); await cdp('Emulation.setDeviceMetricsOverride', { width: 434, height: 1000, deviceScaleFactor: 1, mobile: false });
    await health('workspace-menu'); await key('Escape', 'Escape', 27);
    await pass('Escape closes narrow menu and returns keyboard focus', "document.activeElement.dataset.healthAction==='workspace-menu'&&hv.contentEl.querySelector('[data-health-action=workspace-menu]').getAttribute('aria-expanded')==='false'");
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await pass('Reduced motion disables folder geometry animation', "matchMedia('(prefers-reduced-motion: reduce)').matches&&getComputedStyle(hv.contentEl.querySelector('.veynrel-core-geometry')).animationName==='none'");
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
    await ev("window.splitLeaf=app.workspace.getLeaf('split','vertical');splitLeaf.setViewState({type:'veynrel-studio',active:true});void 0");
    await wait("!!splitLeaf.view.contentEl.querySelector('[data-studio-action=new]')"); await pause(300);
    await pass('Real split keeps separate Workspace/Studio owners and both fit', "hv.contentEl.clientWidth<760&&hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1&&splitLeaf.view.contentEl.scrollWidth<=splitLeaf.view.contentEl.clientWidth+1"); await shot('real-split');
    await ev('splitLeaf.detach();void 0');
    await ev("window.pop=app.workspace.openPopoutLeaf();pop.setViewState({type:'veynrel-health',active:true});void 0");
    await wait("!!pop.view.contentEl.querySelector('[data-health-action=home-check]')");
    await pass('Real popout owns a different document and independent scope', "pop.view.contentEl.ownerDocument!==document&&pop.view.areaIndex.selection.kind==='all'");
    const targets = await (await fetch('http://127.0.0.1:9393/json/list')).json();
    const popTarget = targets.find(p => p.type === 'page' && p.id !== mainTargetId);
    assert(popTarget, 'popout target'); const attached = await cdp('Target.attachToTarget', { targetId: popTarget.id, flatten: true });
    await cdp('Runtime.enable', {}, attached.sessionId);
    fs.writeFileSync(`${root}/real-popout-workspace.png`, Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' }, attached.sessionId)).data, 'base64')); report.screenshots.push('real-popout-workspace.png');
    await ev("pop.view.contentEl.querySelector('[data-health-action=home-check]').focus();void 0");
    for (const type of ['keyDown','keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r', unmodifiedText: '\r' } : {}) }, attached.sessionId);
    await pass('Popout Enter opens the local check', "pop.view.route.page==='health'");
    await ev("pop.setViewState({type:'veynrel-studio',active:true})"); await wait("!!pop.view.contentEl.querySelector('[data-studio-action=new]')");
    await pass('Studio works in real popout without sharing view drafts', "pop.view.contentEl.ownerDocument!==document&&pop.view.setupDrafts.size===0&&pop.view.contentEl.scrollWidth<=pop.view.contentEl.clientWidth+1");
    fs.writeFileSync(`${root}/real-popout-studio.png`, Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' }, attached.sessionId)).data, 'base64')); report.screenshots.push('real-popout-studio.png');
    await ev('pop.detach();app.workspace.setActiveLeaf(hv.leaf,{focus:true});void 0'); await cdp('Page.bringToFront');
    await ev("app.vault.createFolder('__r03_folder/child').then(()=>{})"); await wait("hv.areaIndex.snapshot.folders.some(f=>f.path==='__r03_folder/child')");
    await ev("hv.selectScope('__r03_folder/child');app.vault.rename(app.vault.getAbstractFileByPath('__r03_folder'),'__r03_renamed')"); await wait('hv.areaIndex.selection.missing===true');
    await pass('Renamed ancestor leaves an explicit unavailable scope', "hv.contentEl.querySelector('[data-health-action=home-check]').disabled&&hv.areaIndex.selection.path==='__r03_folder/child'"); await shot('workspace-renamed-folder');
    await ev("hv.selectScope('__r03_renamed/child');app.vault.delete(app.vault.getAbstractFileByPath('__r03_renamed'),true)"); await wait('hv.areaIndex.selection.missing===true'); await shot('workspace-deleted-folder');
    await ev('hv.selectScope();void 0'); await health('home-check');
    await ev("window.r03Read=app.vault.read;app.vault.read=function(f){if(f.path==='Study/Copy.md')throw Error('Synthetic R03 read failure');return r03Read.call(this,f)};void 0");
    await health('scan'); await wait('!hv.controller.getState().busy');
    await pass('Injected read failure produces a partial scan, not complete', "hv.controller.getState().outcome.scan.status==='partial'");
    report.observations.partial = await ev('hv.controller.getState().outcome'); await shot('workspace-partial-scan');
    await ev('app.vault.read=r03Read;void 0');
    await ev("(async()=>{window.r03Changed=false;window.r03Original=await app.vault.read(app.vault.getFileByPath('Study/Copy.md'));app.vault.read=async function(f){const text=await r03Read.call(this,f);if(!r03Changed){r03Changed=true;await app.vault.modify(app.vault.getFileByPath('Study/Copy.md'),r03Original+'\\nConcurrent synthetic edit.\\n')}return text}})()");
    await health('scan'); await wait('!hv.controller.getState().busy');
    await pass('Changed source during scan is stale and uncommitted', "hv.controller.getState().outcome.freshness==='stale'&&!hv.controller.getState().outcome.findingsCommitted");
    report.observations.stale = await ev('hv.controller.getState().outcome'); await shot('workspace-stale-scan');
    await ev("(async()=>{app.vault.read=r03Read;await app.vault.modify(app.vault.getFileByPath('Study/Copy.md'),r03Original)})()");
    await ev("app.workspace.setActiveLeaf(sv.leaf,{focus:true});sv.navigate('library');void 0");
    await studio('recipe-builtin.smart-format'); await studio('choose-notes');
    await ev("window.r03Model=plugin.settings.model;plugin.settings.model='';sv.render();void 0"); await studio('prepare');
    await wait("studio.runner.state==='failed'"); await pass('Missing model blocks preparation before transmission', "studio.runner.error==='settings'"); await shot('studio-missing-model');
    await ev("plugin.settings.model=r03Model;sv.navigate('setup');void 0");
    await ev("window.sourceLeaf=app.workspace.getLeaf('split');sourceLeaf.openFile(app.vault.getFileByPath('Study/Source.md'),{state:{mode:'source',source:true}})");
    await ev("window.r03Save=sourceLeaf.view.requestSave;sourceLeaf.view.requestSave=()=>{};sourceLeaf.view.editor.setValue('Unsaved synthetic edits');app.workspace.setActiveLeaf(sv.leaf,{focus:true});void 0");
    await studio('prepare'); await wait("studio.runner.state==='failed'");
    await pass('Unsaved actual editor buffer blocks preparation', "studio.runner.error==='unsaved'"); await shot('studio-unsaved-note');
    await ev(`sourceLeaf.view.editor.setValue(${JSON.stringify(originals['Study/Source.md'])});sourceLeaf.view.requestSave=r03Save;sourceLeaf.detach();void 0`);
    report.observations.unsavedCondition = 'Real editor buffer; requestSave temporarily held in disposable profile to make unsaved interval deterministic, restored immediately.';
    await checkpoint('explicit-fault-probes'); assert.equal(requests.length, 1);
    await ev("app.plugins.disablePlugin('ai-knowledge-hub')"); await ev("app.plugins.enablePlugin('ai-knowledge-hub')");
    await wait("!!app.commands.commands['ai-knowledge-hub:veynrel-open-health']");
    await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health');void 0");
    await wait("!!app.workspace.getLeavesOfType('veynrel-health')[0]?.view.contentEl.querySelector('[data-health-action=home-check]')");
    await pass('Plugin restart restores saved Health records without onboarding or scan', "!!app.workspace.getLeavesOfType('veynrel-health')[0].view.controller.getState().snapshot.lastLocalScan&&!app.workspace.getLeavesOfType('veynrel-health')[0].view.controller.getState().busy");
    socket.close(); const exited = new Promise(r => child.once('exit', r)); child.kill('SIGTERM'); await exited;
    child = start(); await connect();
    await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health');void 0");
    await wait("!!app.workspace.getLeavesOfType('veynrel-health')[0]?.view.contentEl.querySelector('[data-health-action=home-check]')");
    await ev("window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;void 0");
    await pass('Obsidian restart restores durable records, fresh session scope and no passive scan', "!!hv.controller.getState().snapshot.lastLocalScan&&!hv.controller.getState().busy&&hv.areaIndex.selection.kind==='all'&&io.reads.length===0&&io.writes.length===0"); await shot('workspace-restart');
    await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-studio');void 0"); await wait("!!document.querySelector('.veynrel-studio [data-studio-action=new]')");
    await studio('history'); await wait("!!document.querySelector('[data-studio-action=markdown-open]')");
    await pass('Restart keeps saved Studio result history; does not promise durable preparation drafts', "!studio.runner.review&&app.workspace.getLeavesOfType('veynrel-studio')[0].view.setupDrafts.size===0&&io.writes.length===0");
    await shot('studio-restart-history'); await checkpoint('after-restart'); assert.equal(requests.length, 1);
  }
  const final = markdown(vault); for (const [p, hash] of Object.entries(initial)) assert.equal(final[p], hash, `original unchanged: ${p}`);
  if (corpusBefore) assert.deepEqual(markdown(lab), corpusBefore, 'source corpus unchanged');
  report.final = final; report.settings = JSON.parse(fs.readFileSync(`${dir}/data.json`));
  report.checks.push('Original Markdown and source synthetic corpus unchanged');
  report.functionalChecksCompleted = true;
  report.completed = report.exceptions.length === 0;
  if (!report.completed) { report.failure = 'Native runtime exceptions captured; functional assertions completed, runtime gate is not clean.'; process.exitCode = 1; }
} catch (e) { report.failure = String(e.stack ?? e); console.error(report.failure); process.exitCode = 1; }
finally {
  if (recording) { try { await endRecord(); } catch (e) { report.recordingError = String(e); } }
  fs.writeFileSync(`${root}/report.json`, JSON.stringify(report, null, 2));
  if (socket) socket.close();
  if (child && child.exitCode === null) { const done = new Promise(r => child.once('exit', r)); child.kill('SIGTERM'); await done; }
  server.closeAllConnections(); await new Promise(r => server.close(r));
}
