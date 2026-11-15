// No host/plugin monkey patches. Native window actions, event listeners and CDP inspection only.
// node scripts/host-zoom-diagnostic.mjs OUTPUT hidden|custom|native host|r03 x11|wayland CYCLES [R03_KIT] [mixed|settings-only|theme-only]
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const [root, frame, variant, platform = 'x11', repeats = '2', kit, scenario = 'mixed'] = process.argv.slice(2);
assert(root?.startsWith('/tmp/veynrel-zoom-cause-') && !root.includes('..') && !fs.existsSync(root));
assert(['hidden', 'custom', 'native'].includes(frame) && ['host', 'r03'].includes(variant));
assert(['x11', 'wayland'].includes(platform)); const cycles = Number(repeats); assert(cycles >= 1 && cycles <= 8);
assert(['mixed','settings-only','theme-only'].includes(scenario));
const repo = fileURLToPath(new URL('../', import.meta.url)), vault = `${root}/vault`, profile = `${root}/profile`;
fs.mkdirSync(`${vault}/.obsidian/plugins`, { recursive: true }); fs.mkdirSync(profile);
const note = '# Synthetic window diagnostic\n\nNo personal content or credentials.\n';
fs.writeFileSync(`${vault}/Probe.md`, note);
fs.writeFileSync(`${vault}/Other.md`, '# Another synthetic note\n');
fs.writeFileSync(`${vault}/.obsidian/app.json`, JSON.stringify({ checkForUpdates: false }));
fs.writeFileSync(`${profile}/obsidian.json`, JSON.stringify({ updateDisabled: true, frame, vaults: { zoom: { path: vault, ts: Date.now(), open: true } } }));
fs.writeFileSync(`${vault}/.obsidian/community-plugins.json`, JSON.stringify(variant === 'r03' ? ['ai-knowledge-hub'] : []));
const sha = b => createHash('sha256').update(b).digest('hex');
const report = { frame, variant, platform, cycles, scenario, phase: 'startup', actions: [], pauses: [], exceptions: [], callErrors: [], eventLogs: [], artifacts: {}, screenshots: [] };
report.harnessSha256 = sha(fs.readFileSync(fileURLToPath(import.meta.url)));
if (variant === 'r03') {
  assert(kit); const dest = `${vault}/.obsidian/plugins/ai-knowledge-hub`; fs.mkdirSync(dest);
  for (const n of ['main.js', 'manifest.json', 'styles.css']) { const b = fs.readFileSync(`${kit}/${n}`); fs.writeFileSync(`${dest}/${n}`, b); report.artifacts[n] = sha(b); }
  fs.writeFileSync(`${dest}/data.json`, JSON.stringify({ language: 'en', apiKey: '', provider: 'ollama', model: 'unused', baseUrl: 'http://127.0.0.1:1/v1', semanticAutoSyncSuspended: true, semantic: { enabled: false }, decisions: { enabled: false }, companion: { enabled: false }, health: { profileChosen: true, onboardingCompleted: true } }));
}
const pause = ms => new Promise(r => setTimeout(r, ms));
let seq = 0, socket, mainSession;
const pending = new Map(), sessions = new Map(), configuring = [], diagnostics = [];
const cdp = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  fs.appendFileSync(`${root}/trace.jsonl`, JSON.stringify({at:Date.now(),phase:report.phase,method,sessionId,expression:params.expression})+'\n');
  const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method} ${params.expression ?? ''}`)); }, 15000);
  pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(Error(JSON.stringify(e))); } });
  socket.send(JSON.stringify({ id, method, params, sessionId }));
});
const ev = async (expression, sessionId = mainSession) => {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) { report.callErrors.push({ phase: report.phase, exception: r.exceptionDetails }); throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); }
  return r.result.value;
};
const wait = async expression => { for (let i = 0; i < 200; i++) { if (await ev(expression)) return; await pause(100); } throw Error(`Readiness: ${expression}`); };
const eventScript = `(()=>{if(window.__zoomDiagnosticEvents)return;window.__zoomDiagnosticEvents=[];for(const type of ['resize','focus','blur','beforeunload','pagehide','unload'])window.addEventListener(type,event=>window.__zoomDiagnosticEvents.push({type,at:Date.now(),width:innerWidth,height:innerHeight,focused:document.hasFocus(),closed:window.closed,targetIsWindow:event.target===window}),true);for(const type of ['keydown','beforeinput'])window.addEventListener(type,event=>window.__zoomDiagnosticEvents.push({type,at:Date.now(),trusted:event.isTrusted,target:event.target?.tagName,printable:event.key?.length===1,inputType:event.inputType,dataLength:event.data?.length}),true)})()`;
const state = `(()=>{const f=window.frameDom,w=f?.eWin??window.electronWindow,c=w?.webContents;return {at:Date.now(),frame:window.titlebarStyle,frameDom:!!f,windowType:typeof w,windowClass:w?.constructor?.name,contentsType:typeof c,contentsClass:c?.constructor?.name,getZoomType:typeof c?.getZoomFactor,zoom:window.electron?.webFrame?.getZoomFactor(),windowId:w?.id,contentsId:c?.id,windowDestroyed:w?.isDestroyed?.(),contentsDestroyed:c?.isDestroyed?.(),bounds:w?.getBounds?.(),contentBounds:w?.getContentBounds?.(),focused:document.hasFocus(),nativeFocused:w?.isFocused?.(),inner:[innerWidth,innerHeight],outer:[outerWidth,outerHeight],closed:window.closed,frameSetting:window.electron?.ipcRenderer?.sendSync('frame'),view:window.app?.workspace?.activeLeaf?.view?.getViewType(),modals:document.querySelectorAll('.modal-container').length}})()`;
const closingState = `(()=>{const out={};for(const [key,read] of Object.entries({watchedWindowId:()=>window.__zoomWatchedIds?.get(this.win),sameDomWindow:()=>this.win===window,sameElectronWindow:()=>this.eWin===window.electronWindow,sameFrameDom:()=>this===window.frameDom,domClosed:()=>this.win.closed,domUrl:()=>this.win.location.href,domFocus:()=>this.win.document.hasFocus(),domSize:()=>[this.win.innerWidth,this.win.innerHeight],domFrame:()=>this.win.titlebarStyle,windowId:()=>this.eWin.id,contentsId:()=>this.eWin.webContents.id,destroyedMethod:()=>typeof this.eWin.isDestroyed,contentsDestroyedMethod:()=>typeof this.eWin.webContents.isDestroyed,zoomMethod:()=>typeof this.eWin.webContents.getZoomFactor,localWindowMatches:()=>t===this.eWin,localDomMatches:()=>e===this.win}))try{out[key]=read()}catch(err){out[key]=String(err)}return out})()`;
const watchSettings = `(()=>{const w=app.setting.modalEl.ownerDocument.defaultView;window.__zoomChildEvents??=[];const id=w.electronWindow?.id;window.__zoomWatchedIds??=new WeakMap();__zoomWatchedIds.set(w,id);__zoomChildEvents.push({type:'settings-open',at:Date.now(),id,isMain:w===window,closed:w.closed,frame:w.titlebarStyle,zoomType:typeof w.frameDom?.eWin?.webContents?.getZoomFactor});for(const type of ['resize','focus','blur','beforeunload','pagehide','unload'])w.addEventListener(type,()=>__zoomChildEvents.push({type,at:Date.now(),id,closed:w.closed,width:w.innerWidth,height:w.innerHeight}),{once:true,capture:true});})()`;
async function onPause(params, sessionId) {
  const entry = { at: Date.now(), phase: report.phase, sessionId, reason: params.reason, data: params.data, callFrames: params.callFrames.map(f => ({ functionName: f.functionName, url: f.url, location: f.location })), inspections: [] };
  report.pauses.push(entry);
  try {
    const target = params.callFrames.find(f => f.functionName.includes('updateStatus')) ?? params.callFrames[0];
    entry.receiver = await cdp('Debugger.evaluateOnCallFrame', { callFrameId: target.callFrameId, expression: closingState, returnByValue: true, silent: true }, sessionId);
    for (const expression of ['this.eWin', 'this.eWin.webContents', 'this.eWin.webContents.getZoomFactor']) {
      const r = await cdp('Debugger.evaluateOnCallFrame', { callFrameId: target.callFrameId, expression, returnByValue: false, silent: true }, sessionId);
      const inspection = { expression, result: r.result, exception: r.exceptionDetails }; entry.inspections.push(inspection);
      if (r.result?.objectId && expression !== 'this.eWin.webContents.getZoomFactor') {
        const p = await cdp('Runtime.getProperties', { objectId: r.result.objectId, ownProperties: true, generatePreview: false }, sessionId);
        inspection.ownProperties = p.result.map(x => ({ name: x.name, type: x.value?.type, subtype: x.value?.subtype, description: x.name === 'getZoomFactor' ? x.value?.description : undefined, get: x.get?.type, set: x.set?.type }));
      }
    }
    entry.state = await cdp('Debugger.evaluateOnCallFrame', { callFrameId: target.callFrameId, expression: state, returnByValue: true, silent: true }, sessionId);
    entry.events = await cdp('Debugger.evaluateOnCallFrame', { callFrameId: target.callFrameId, expression: 'window.__zoomDiagnosticEvents', returnByValue: true, silent: true }, sessionId);
    entry.childEvents = await cdp('Debugger.evaluateOnCallFrame', { callFrameId: target.callFrameId, expression: 'window.__zoomChildEvents', returnByValue: true, silent: true }, sessionId);
  } catch (e) { entry.inspectionError = String(e); }
  finally { await cdp('Debugger.resume', {}, sessionId).catch(e => { entry.resumeError = String(e); }); }
}
async function configure(sessionId) {
  await cdp('Runtime.runIfWaitingForDebugger', {}, sessionId);
  await cdp('Debugger.enable', {}, sessionId);
  await cdp('Debugger.setPauseOnExceptions', { state: 'uncaught' }, sessionId);
  await cdp('Runtime.enable', {}, sessionId); await cdp('Page.enable', {}, sessionId);
  await cdp('Network.enable', {}, sessionId); await cdp('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] }, sessionId);
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: eventScript }, sessionId);
  await ev(eventScript, sessionId);
}
const child = spawn('/usr/bin/electron43', ['/usr/lib/obsidian/app.asar', `--user-data-dir=${profile}`, '--remote-debugging-port=9396', '--disable-gpu', `--ozone-platform=${platform}`], { stdio: ['ignore', 'ignore', fs.openSync(`${root}/electron.log`, 'a')] });
async function sample(label) { const x = await ev(state); report.actions.push({ label, phase: report.phase, ...x }); return x; }
async function shot(name, sessionId = mainSession) { fs.writeFileSync(`${root}/${name}.png`, Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' }, sessionId)).data, 'base64')); report.screenshots.push(name + '.png'); }
async function wmResize(width, height) {
  const raw = await ev('Array.from(window.electronWindow.getNativeWindowHandle())');
  const wid = Buffer.from(raw).readUInt32LE();
  const r = spawnSync('python', [`${repo}/scripts/zoom-wm-resize.py`, String(wid), String(child.pid), String(width), String(height)], { env: process.env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); await pause(300);
  const s = await sample(`wm-${width}x${height}`);
  assert.equal(s.outer[0], width, 'WM outer width'); assert.equal(s.outer[1], height, 'WM outer height');
}
try {
  let version;
  for (let i = 0; i < 200; i++) { try { version = await (await fetch('http://127.0.0.1:9396/json/version')).json(); } catch {} if (version) break; await pause(100); }
  assert(version); socket = new WebSocket(version.webSocketDebuggerUrl); await new Promise((r,j) => { socket.onopen = r; socket.onerror = j; });
  socket.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (p) m.error ? p.reject(m.error) : p.resolve(m.result); }
    if (m.method === 'Target.attachedToTarget' && m.params.targetInfo.type === 'page') {
      fs.appendFileSync(`${root}/trace.jsonl`, JSON.stringify({at:Date.now(),attached:m.params})+'\n');
      sessions.set(m.params.sessionId, m.params.targetInfo);
      configuring.push(configure(m.params.sessionId).catch(e => { report.callErrors.push({ configuring: m.params.sessionId, error: String(e) }); }));
    }
    if (m.method === 'Target.targetInfoChanged') for (const [id,t] of sessions) { if (t.targetId === m.params.targetInfo.targetId) sessions.set(id, m.params.targetInfo); }
    if (['Target.targetCreated','Target.targetDestroyed'].includes(m.method)) fs.appendFileSync(`${root}/trace.jsonl`, JSON.stringify({at:Date.now(),event:m.method,params:m.params})+'\n');
    if (m.method === 'Target.detachedFromTarget') sessions.delete(m.params.sessionId);
    if (m.method === 'Runtime.exceptionThrown') report.exceptions.push({ phase: report.phase, sessionId: m.sessionId, ...m.params });
    if (m.method === 'Debugger.paused') diagnostics.push(onPause(m.params, m.sessionId));
  };
  await cdp('Target.setDiscoverTargets', { discover: true });
  for (let i = 0; i < 200; i++) {
    const target = (await cdp('Target.getTargets')).targetInfos.find(t => t.type === 'page' && t.url.startsWith('app://obsidian.md/'));
    if (target) { mainSession = (await cdp('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId; break; }
    await pause(100);
  }
  assert(mainSession); await Promise.all(configuring);
  await wait('!!window.app?.workspace?.layoutReady'); assert.equal(fs.realpathSync(await ev('app.vault.adapter.basePath')), fs.realpathSync(vault));
  if (await ev("!!document.querySelector('.mod-trust-folder')")) await ev("[...document.querySelectorAll('.mod-trust-folder button')].find(e=>/Trust author/.test(e.textContent)).click();void 0");
  if (variant === 'r03') await wait("!!app.commands.commands['ai-knowledge-hub:veynrel-open-studio']");
  report.versions = await ev("({obsidian:document.title.match(/Obsidian ([0-9.]+)/)?.[1],electron:process.versions.electron,chrome:process.versions.chrome,plugins:[...app.plugins.enabledPlugins]})");
  assert.equal(report.versions.obsidian, '1.13.7'); assert.equal(report.versions.electron, '43.6.0');
  assert.equal(report.versions.plugins.includes('ai-knowledge-hub'), variant === 'r03');
  assert.equal(await ev('window.titlebarStyle'), frame);
  await ev("app.workspace.getLeaf(false).openFile(app.vault.getFileByPath('Probe.md'),{state:{mode:'preview'}})");
  await sample('ready');
  if (platform === 'x11') {
    const wid = Buffer.from(await ev('Array.from(window.electronWindow.getNativeWindowHandle())')).readUInt32LE();
    const properties = spawnSync('xprop', ['-id', String(wid), '_NET_WM_PID', '_MOTIF_WM_HINTS', '_NET_FRAME_EXTENTS'], {encoding:'utf8'});
    assert.equal(properties.status, 0); report.x11WindowProperties = properties.stdout;
    assert(properties.stdout.includes(`= ${child.pid}\n`), 'X11 window belongs to this disposable process');
  }
  await ev("app.setting.open();app.setting.openTabById('interface');void 0");
  await wait("!![...app.setting.modalEl.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='native')&&[...s.options].some(o=>o.value==='custom'))");
  report.frameControl = await ev("[...app.setting.modalEl.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='native')&&[...s.options].some(o=>o.value==='custom'))?.value");
  assert.equal(report.frameControl, frame); await shot('actual-frame-setting');
  await ev(watchSettings);
  await ev('app.setting.close();void 0');
  for (let cycle = 0; cycle < cycles; cycle++) {
    if (scenario === 'settings-only') {
      report.phase = `settings-only-${cycle}`;
      await ev("app.setting.open();app.setting.openTabById('appearance');void 0");
      await ev(watchSettings); await ev('app.setting.close();void 0'); await pause(150);
      await sample('settings-open-close'); continue;
    }
    report.phase = `${scenario === 'theme-only' ? 'theme' : 'cdp'}-cycle-${cycle}`;
    for (const width of [1400, 434, 1400, 390, 1280, 320]) {
      await ev("app.setting.open();app.setting.openTabById('appearance');void 0");
      await ev(watchSettings);
      await ev(`app.changeTheme('${width % 3 ? 'moonstone' : 'obsidian'}');app.setting.close();void 0`);
      if (scenario !== 'theme-only') await cdp('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: false }, mainSession);
      await pause(120); await sample(`${scenario === 'theme-only' ? 'theme' : 'cdp'}-${width}`);
    }
    await cdp('Emulation.clearDeviceMetricsOverride', {}, mainSession); await pause(200);
    report.phase = `wm-cycle-${cycle}`;
    if (platform === 'x11') { await wmResize(900, 700); await wmResize(500, 700); await wmResize(1200, 850); }
    else report.wmLimit = 'Native Wayland probe does not claim X11 EWMH resize coverage.';
    report.phase = `zoom-cycle-${cycle}`;
    for (const command of ['window:zoom-in','window:zoom-out','window:reset-zoom']) {
      const before = await ev('window.electron.webFrame.getZoomFactor()');
      assert(await ev(`app.commands.executeCommandById('${command}')`)); await pause(150);
      const after = await sample(command); assert(command === 'window:zoom-in' ? after.zoom > before : command === 'window:zoom-out' ? after.zoom < before : after.zoom === 1);
    }
  }
  report.phase = 'split-popout';
  await ev("window.__zoomSplit=app.workspace.getLeaf('split');__zoomSplit.openFile(app.vault.getFileByPath('Other.md'),{state:{mode:'preview'}})");
  await sample('split-open'); await ev('__zoomSplit.detach();void 0'); await sample('split-closed');
  await ev("window.__zoomPopout=app.workspace.getLeaf('window');__zoomPopout.openFile(app.vault.getFileByPath('Probe.md'),{state:{mode:'preview'}})");
  await wait('__zoomPopout.view.containerEl.ownerDocument!==document'); await pause(300);
  const target = (await cdp('Target.getTargets')).targetInfos.find(t => t.type === 'page' && t.openerId === sessions.get(mainSession).targetId);
  assert(target); await cdp('Target.attachToTarget', { targetId: target.targetId, flatten: true }); await Promise.all(configuring);
  const pop = [...sessions].find(([id,t]) => id !== mainSession && t.openerId === sessions.get(mainSession).targetId);
  assert(pop, 'Popout debugger attached'); report.popout = await ev(state, pop[0]);
  await shot('popout', pop[0]); report.eventLogs.push({sessionId:pop[0],events:await ev('window.__zoomDiagnosticEvents',pop[0])});
  await ev('__zoomPopout.detach();void 0'); await pause(300);
  await cdp('Page.bringToFront', {}, mainSession); await sample('popout-closed');
  if (variant === 'r03') {
    report.phase = 'r03-passive';
    for (const command of ['ai-knowledge-hub:veynrel-open-health','ai-knowledge-hub:veynrel-open-studio']) { assert(await ev(`app.commands.executeCommandById('${command}')`)); await pause(200); await sample(command); }
  }
  await shot('final'); report.completed = true;
} catch (e) { report.failure = String(e.stack ?? e); process.exitCode = 1; try { await shot('failure'); } catch {} }
finally {
  await Promise.allSettled(diagnostics);
  if (socket) for (const [id] of sessions) { try { report.eventLogs.push({ sessionId: id, events: await ev('window.__zoomDiagnosticEvents', id) }); } catch {} }
  try { report.childEvents = await ev('window.__zoomChildEvents'); } catch {}
  report.originalMarkdownPreserved = fs.readFileSync(`${vault}/Probe.md`, 'utf8') === note;
  report.markdownHashes = Object.fromEntries([['Probe.md',note],['Other.md','# Another synthetic note\n']].map(([path,original])=>[path,{before:sha(original),after:sha(fs.readFileSync(`${vault}/${path}`))}]));
  report.originalMarkdownPreserved &&= Object.values(report.markdownHashes).every(h=>h.before===h.after);
  if (!report.originalMarkdownPreserved) process.exitCode = 1;
  report.strictRuntimeGate = report.exceptions.length === 0 && report.callErrors.length === 0 && report.completed === true;
  fs.writeFileSync(`${root}/report.json`, JSON.stringify(report, null, 2) + '\n');
  socket?.close();
  if (child.exitCode === null) { const end = new Promise(r => child.once('exit', r)); child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 3000); await end; clearTimeout(timer); }
  console.log(JSON.stringify({ root, completed: report.completed, exceptions: report.exceptions.length, pauses: report.pauses.length, failure: report.failure }));
}
