// Local R02 attribution probe: three fresh profiles, no generation or provider calls.
// node scripts/r02-host-zoom-native.mjs /tmp/veynrel-r02-zoom-UNIQUE EXCALIDRAW_ASSETS BASE_ASSETS R02_ASSETS
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [root, excalidraw, baseline, candidate] = process.argv.slice(2);
const repo = fileURLToPath(new URL('../', import.meta.url));
assert(root?.startsWith('/tmp/veynrel-r02-zoom-') && !root.includes('..') && !fs.existsSync(root));
for (const dir of [excalidraw, baseline, candidate]) for (const n of ['main.js', 'manifest.json', 'styles.css']) assert(fs.statSync(`${dir}/${n}`).isFile());
assert.equal(JSON.parse(fs.readFileSync(`${excalidraw}/manifest.json`)).version, '2.29.0');
fs.mkdirSync(root);
const sha = raw => createHash('sha256').update(raw).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixture = fs.readFileSync(`${repo}/scripts/studio-first-open-legacy/Native.excalidraw.md`);
const reports = [];
for (const [name, assets, source] of [
  ['host-excalidraw', null, null],
  ['base-excalidraw', baseline, '05f4cdaeb9bf5aa092901f3e5079bb302b82e596'],
  ['r02-excalidraw', candidate, '2245d74305adc32a0957c734091f487a04c3e615'],
]) {
  const dir = `${root}/${name}`, vault = `${dir}/vault`, profile = `${dir}/profile`;
  fs.mkdirSync(`${vault}/.obsidian/plugins`, { recursive: true }); fs.mkdirSync(profile);
  fs.writeFileSync(`${vault}/Probe.md`, '# Synthetic zoom probe\n\nLocal fixture only.\n');
  fs.writeFileSync(`${vault}/Drawing.excalidraw.md`, fixture);
  const report = { name, source, phase: 'startup', events: [], exceptions: [], calls: [], artifacts: {}, networkBlocked: ['http://*', 'https://*'] };
  const install = (id, from) => {
    const to = `${vault}/.obsidian/plugins/${id}`; fs.mkdirSync(to);
    report.artifacts[id] = Object.fromEntries(['main.js', 'manifest.json', 'styles.css'].map(n => { const raw = fs.readFileSync(`${from}/${n}`); fs.writeFileSync(`${to}/${n}`, raw); return [n, sha(raw)]; }));
    return to;
  };
  const excalDir = install('obsidian-excalidraw-plugin', excalidraw);
  fs.writeFileSync(`${excalDir}/data.json`, JSON.stringify({ checkForUpdates: false, showReleaseNotes: false, showWelcomeModal: false, enableOnloadScripts: false, startupScriptPath: '', autoexportSVG: false, autoexportPNG: false, autoexportExcalidraw: false }));
  if (assets) fs.writeFileSync(`${install('ai-knowledge-hub', assets)}/data.json`, JSON.stringify({ language: 'en', apiKey: '', provider: 'ollama', model: 'unused', baseUrl: 'http://127.0.0.1:1/v1', semanticAutoSyncSuspended: true, semantic: { enabled: false }, decisions: { enabled: false }, companion: { enabled: false }, health: { onboardingCompleted: true } }));
  fs.writeFileSync(`${vault}/.obsidian/community-plugins.json`, JSON.stringify(assets ? ['ai-knowledge-hub', 'obsidian-excalidraw-plugin'] : ['obsidian-excalidraw-plugin']));
  fs.writeFileSync(`${vault}/.obsidian/app.json`, JSON.stringify({ checkForUpdates: false }));
  fs.writeFileSync(`${profile}/obsidian.json`, JSON.stringify({ updateDisabled: true, vaults: { probe: { path: vault, ts: Date.now(), open: true } } }));
  const child = spawn('/usr/bin/electron43', ['/usr/lib/obsidian/app.asar', `--user-data-dir=${profile}`, '--remote-debugging-port=9294', '--disable-gpu', '--ozone-platform=x11'], { stdio: ['ignore', 'ignore', fs.openSync(`${dir}/electron.log`, 'a')] });
  let socket, seq = 0; const pending = new Map();
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout ${method}`)); }, 10000);
    pending.set(id, { resolve: r => { clearTimeout(timer); resolve(r); }, reject: e => { clearTimeout(timer); reject(e); } }); socket.send(JSON.stringify({ id, method, params }));
  });
  const ev = async expression => { const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) { report.calls.push({ phase: report.phase, exceptionDetails: r.exceptionDetails }); throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); } return r.result.value; };
  const wait = async expression => { for (let i = 0; i < 200; i++) { if (await ev(expression)) return; await pause(50); } throw Error(`Readiness timeout: ${expression}`); };
  const sample = async label => report.events.push({ label, at: new Date().toISOString(), sample: await ev(`({width:innerWidth,height:innerHeight,view:app.workspace.activeLeaf?.view.getViewType(),zoom:window.electron?.webFrame?.getZoomFactor(),titlebar:!!window.frameDom,remoteZoomMethod:typeof window.frameDom?.eWin?.webContents?.getZoomFactor,remoteZoomProperty:window.frameDom?.eWin?.webContents?.zoomFactor})`) });
  try {
    let page;
    for (let i = 0; i < 200; i++) { try { page = (await (await fetch('http://127.0.0.1:9294/json/list')).json()).find(p => p.url.startsWith('app://obsidian.md/')); } catch {} if (page) break; await pause(100); }
    assert(page); socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    socket.onmessage = e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') report.exceptions.push({ phase: report.phase, ...m.params }); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (p) m.error ? p.reject(m.error) : p.resolve(m.result); } };
    await cdp('Runtime.enable'); await cdp('Network.enable'); await cdp('Network.setBlockedURLs', { urls: report.networkBlocked });
    await wait('!!window.app?.workspace?.layoutReady'); assert.equal(await ev('app.vault.adapter.basePath'), vault);
    if (await ev("!!document.querySelector('.mod-trust-folder')")) await ev("[...document.querySelectorAll('.mod-trust-folder button')].find(e=>/Trust author/.test(e.textContent)).click();void 0");
    await wait("!!app.plugins.plugins['obsidian-excalidraw-plugin']?.ea?.getAPI");
    if (assets) await wait("!!app.plugins.plugins['ai-knowledge-hub']?.studio");
    assert.equal(await ev("!!app.plugins.plugins['ai-knowledge-hub']"), !!assets);
    report.versions = await ev("({obsidian:document.title.match(/Obsidian ([0-9.]+)/)?.[1],electron:process.versions.electron,excalidraw:app.plugins.plugins['obsidian-excalidraw-plugin'].manifest.version,enabledPlugins:[...app.plugins.enabledPlugins]})");
    assert.equal(report.versions.obsidian, '1.13.7'); assert.equal(report.versions.electron, '43.6.0'); assert.equal(report.versions.excalidraw, '2.29.0');
    await cdp('Page.bringToFront');
    report.phase = 'open-markdown';
    await ev("app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('Probe.md'),{state:{mode:'source'}})");
    await wait("app.workspace.activeLeaf?.view.getViewType()==='markdown'"); await sample('source');
    report.phase = 'reading-view'; await ev("app.workspace.activeLeaf.setViewState({type:'markdown',state:{file:'Probe.md',mode:'preview'}})"); await sample('reading');
    report.phase = 'drawing-view';
    await wait("!!app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('Drawing.excalidraw.md'))?.frontmatter");
    await ev("app.workspace.getLeaf(false).setViewState({type:'excalidraw',state:{file:'Drawing.excalidraw.md'},active:true})");
    await wait("app.workspace.activeLeaf?.view.getViewType()==='excalidraw'"); await pause(300); await sample('drawing');
    report.phase = 'return-markdown'; await ev("app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('Probe.md'),{state:{mode:'source'}})"); await sample('source-again');
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const width of [390, 1300]) {
        report.phase = `resize-${cycle}-${width}`;
        await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        await pause(300); await sample(report.phase);
      }
      for (const command of ['window:zoom-in', 'window:zoom-out', 'window:reset-zoom']) {
        report.phase = `zoom-${cycle}-${command}`;
        const before = await ev('window.electron.webFrame.getZoomFactor()');
        assert(await ev(`app.commands.executeCommandById(${JSON.stringify(command)})`));
        await pause(300); await sample(report.phase);
        const after = report.events.at(-1).sample.zoom;
        assert(command === 'window:zoom-in' ? after > before : command === 'window:zoom-out' ? after < before : after === 1, 'Host zoom actually changed');
      }
    }
    report.phase = 'settle'; await pause(700); await sample('final');
    fs.writeFileSync(`${dir}/final.png`, Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    report.drawings = { before: sha(fixture), after: sha(fs.readFileSync(`${vault}/Drawing.excalidraw.md`)) };
    assert.equal(report.drawings.before, report.drawings.after);
    report.scenario = 'COMPLETED';
  } catch (e) { report.scenario = 'FAILED'; report.error = String(e.stack || e); process.exitCode = 1;
    try { report.diagnostic = await ev("({view:app.workspace.activeLeaf?.view.getViewType(),file:app.workspace.activeLeaf?.view.file?.path,text:document.body.innerText.slice(-1500)})"); } catch {} }
  finally {
    report.phase = 'shutdown'; socket?.close();
    if (child.exitCode === null) { const exited = new Promise(r => child.once('exit', r)); child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 3000); await exited; clearTimeout(timer); }
    fs.writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2) + '\n'); reports.push(report);
    console.log(JSON.stringify({ name, scenario: report.scenario, exceptions: report.exceptions.length, calls: report.calls.length, error: report.error }));
  }
}
fs.writeFileSync(`${root}/comparison.json`, JSON.stringify(reports, null, 2) + '\n');
