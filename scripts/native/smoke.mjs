// Real Obsidian/Electron smoke. No DOM mocks, provider calls or personal vault.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertNativeRoot, launchObsidian, nativeEndpoint } from './session.mjs';

const root = process.argv[2], build = process.argv[3] ?? fileURLToPath(new URL('../../', import.meta.url));
assertNativeRoot(root); assert(!fs.existsSync(root));
const vault = `${root}/vault`, pluginDir = `${vault}/.obsidian/plugins/ai-knowledge-hub`;
fs.mkdirSync(pluginDir, { recursive: true }); fs.mkdirSync(`${root}/profile`); fs.mkdirSync(`${root}/frames`);
const originals = { 'Source.md': '# Synthetic source\n\nTwo facts stay unchanged. Два факта сохранены.\n', 'Other.md': '# Synthetic second note\n\n[[Source]]\n' };
for (const [name, text] of Object.entries(originals)) fs.writeFileSync(`${vault}/${name}`, text);
fs.writeFileSync(`${vault}/.obsidian/community-plugins.json`, '["ai-knowledge-hub"]');
fs.writeFileSync(`${vault}/.obsidian/app.json`, '{"checkForUpdates":false}');
fs.writeFileSync(`${root}/profile/obsidian.json`, JSON.stringify({ updateDisabled: true, vaults: { smoke: { path: vault, open: true, ts: Date.now() } } }));
fs.writeFileSync(`${pluginDir}/data.json`, JSON.stringify({ language: 'en', apiKey: '', provider: 'ollama', baseUrl: 'http://127.0.0.1:1/v1', model: 'unused', semanticAutoSyncSuspended: true, semantic: { enabled: false }, decisions: { enabled: false }, companion: { enabled: false }, health: { onboardingCompleted: true } }));
const sha = value => createHash('sha256').update(value).digest('hex');
const report = { scenario: 'isolated-native-smoke-r03-v2', checks: [], exceptions: [], actions: [], screenshots: [], assets: {}, externalRequests: [], recording: null };
report.harnessHashes = Object.fromEntries(['smoke.mjs','session.mjs','run.py'].map(name=>[name,sha(fs.readFileSync(new URL(name,import.meta.url)))]));
for (const name of ['main.js', 'styles.css', 'manifest.json']) { const bytes = fs.readFileSync(`${build}/${name}`); fs.writeFileSync(`${pluginDir}/${name}`, bytes); report.assets[name] = sha(bytes); }
const pause = ms => new Promise(r => setTimeout(r, ms));
const child = launchObsidian(root), connections = [], frames = [];
let main, endpoint, recording = false;
async function connection(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r,j) => { socket.onopen = r; socket.onerror = j; });
  let next = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve,reject) => {
    const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve: r => { clearTimeout(timer); resolve(r); }, reject: e => { clearTimeout(timer); reject(Error(JSON.stringify(e))); } }); socket.send(JSON.stringify({ id, method, params }));
  });
  socket.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (p) m.error ? p.reject(m.error) : p.resolve(m.result); }
    if (m.method === 'Runtime.exceptionThrown') report.exceptions.push({ target: target.id, ...m.params });
    if (m.method === 'Network.requestWillBeSent' && /^https?:/.test(m.params.request.url)) report.externalRequests.push(m.params.request.url);
    if (m.method === 'Page.screencastFrame') {
      const file = `frame-${String(frames.length).padStart(5,'0')}.jpg`; fs.writeFileSync(`${root}/frames/${file}`, Buffer.from(m.params.data,'base64'));
      frames.push({ file, time: m.params.metadata.timestamp }); void send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {});
    }
  };
  const c = { socket, send, id: target.id, ev: async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value;
  } }; connections.push(c);
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['https://*', 'http://*'] }); return c;
}
async function wait(expression, c = main) { for (let i = 0; i < 200; i++) { if (await c.ev(expression)) return; await pause(50); } throw Error(`Readiness: ${expression}`); }
async function pass(name, expression, c = main) { assert(await c.ev(expression), name); report.checks.push(name); }
async function shot(name, c = main) { fs.writeFileSync(`${root}/${name}.png`, Buffer.from((await c.send('Page.captureScreenshot', { format:'png' })).data,'base64')); report.screenshots.push(name+'.png'); }
async function focus(c = main) { await c.send('Page.bringToFront'); await c.ev('window.electronWindow.focus();void 0'); await wait('document.hasFocus() && window.electronWindow.isFocused()', c); }
async function key(key, code, number, text, modifiers = 0) {
  for (const type of ['keyDown','keyUp']) await main.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode:number, modifiers, ...(type==='keyDown' && text ? {text,unmodifiedText:text}: {}) });
}
async function stopVideo() {
  if (!recording) return; recording = false; await main.send('Page.stopScreencast'); assert(frames.length > 5, 'Native video contains frames');
  const list = frames.map((f,i) => `file '${f.file}'\nduration ${Math.max(.001,(frames[i+1]?.time ?? f.time+.2)-f.time)}`).join('\n') + `\nfile '${frames.at(-1).file}'\n`;
  fs.writeFileSync(`${root}/frames/frames.txt`, list);
  const result = spawnSync('ffmpeg', ['-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',`${root}/frames/frames.txt`,'-vf','pad=1600:1000:0:0','-fps_mode','vfr','-c:v','libx264','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart',`${root}/journey.mp4`], { encoding:'utf8' });
  assert.equal(result.status, 0, result.stderr); report.recording = { file:'journey.mp4', frames:frames.length, seconds:frames.at(-1).time-frames[0].time, source:'Native CDP frames and timestamps; main client area, no cuts' };
}
try {
  endpoint = await nativeEndpoint(root, child);
  let target; for (let i=0;i<200;i++) { target=(await(await fetch(`${endpoint}/json/list`)).json()).find(t=>t.url.startsWith('app://obsidian.md/')); if(target)break; await pause(50); }
  assert(target); main = await connection(target); await wait('!!window.app?.workspace?.layoutReady');
  assert.equal(await main.ev('app.vault.adapter.basePath'), vault);
  await wait("!!app.plugins.plugins['ai-knowledge-hub'] || !!document.querySelector('.mod-trust-folder')");
  if (await main.ev("!!document.querySelector('.mod-trust-folder')")) await main.ev("[...document.querySelectorAll('.mod-trust-folder button')].find(e=>/Trust author/.test(e.textContent)).click();void 0");
  await wait("!!app.commands.commands['ai-knowledge-hub:veynrel-open-studio']");
  await main.ev("window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.resizeTrace=[];window.addEventListener('resize',()=>resizeTrace.push({at:Date.now(),width:innerWidth,height:innerHeight}));void 0");
  report.versions = await main.ev('({obsidian:plugin.app.getVersion?.()??document.title.match(/Obsidian ([0-9.]+)/)?.[1],electron:process.versions.electron,chrome:process.versions.chrome,plugin:plugin.manifest.version})');
  await pass('Native frame applies only to the disposable host', "window.titlebarStyle==='native' && !window.frameDom");
  await main.ev("app.workspace.getLeaf(false).openFile(app.vault.getFileByPath('Source.md'),{state:{mode:'preview'}})");
  await focus(); await main.ev('window.electronWindow.setContentSize(1100,800);void 0'); await wait('innerWidth===1100&&innerHeight===800');
  await main.send('Page.startScreencast', { format:'jpeg',quality:70,maxWidth:1600,maxHeight:1000,everyNthFrame:1 }); recording=true;
  for (const language of ['en','ru']) {
    await main.ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await main.ev(`{const s=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));s.value='${language}';s.dispatchEvent(new Event('change'));}void 0`);
    await main.ev('plugin.settingsSave'); await main.ev('app.setting.close();void 0'); await focus();
    // A fresh ItemView tests each locale; hot-switch draft persistence belongs to the product harness.
    await main.ev("for(const type of ['veynrel-health','veynrel-studio'])for(const leaf of app.workspace.getLeavesOfType(type))leaf.detach();void 0");
    for (const theme of ['dark','light']) {
      await main.ev(`app.changeTheme('${theme==='light'?'moonstone':'obsidian'}');void 0`); await wait(`document.body.classList.contains('theme-${theme}')`);
      for (const view of ['health','studio']) {
        assert(await main.ev(`app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-${view}')`));
        const selector=view==='health'?'.veynrel-health-view':'.veynrel-studio'; await wait(`!!document.querySelector('${selector}')`); await focus();
        const geometry = await main.ev(`(()=>{const e=document.querySelector('${selector}');return {width:e.clientWidth,scrollWidth:e.scrollWidth,background:getComputedStyle(e).backgroundColor,font:getComputedStyle(e).fontFamily,theme:document.body.classList.contains('theme-${theme}'),language:plugin.settings.language}})()`);
        assert.equal(geometry.language, language); assert(geometry.theme); assert(geometry.scrollWidth<=geometry.width+1, 'No horizontal overflow'); report.actions.push({ label:`${view}-${language}-${theme}`, ...geometry });
        if(view==='studio') await pass(`${language}/${theme}: Studio has actual translated controls`, `document.querySelector('[data-studio-field=search]').dataset.studioKey===${JSON.stringify(language==='ru'?'Поиск сценариев':'Search recipes')}`);
        await shot(`${view}-${language}-${theme}`); await pause(120);
      }
    }
  }
  await main.ev("window.healthLeaf=app.workspace.getLeavesOfType('veynrel-health')[0];window.hv=healthLeaf.view;app.workspace.setActiveLeaf(healthLeaf,{focus:true});void 0"); await focus();
  await pass('Workspace Check remains unscanned after passive navigation', "!!document.querySelector('[data-health-action=scan]') && !hv.controller.getState().outcome && !hv.controller.getState().busy && !hv.controller.getState().snapshot?.lastLocalScan");
  await main.ev("document.querySelector('[data-health-action=scan]').focus();void 0"); await key('Enter','Enter',13,'\r');
  await wait("!!hv.controller.getState().outcome && !hv.controller.getState().busy");
  report.localCheck = await main.ev('hv.controller.getState().outcome');
  assert.equal(report.localCheck.scan.status, 'completed'); assert.equal(report.localCheck.freshness, 'verified');
  assert(report.localCheck.findingsCommitted && report.localCheck.historyRecorded);
  await shot('workspace-local-check');
  await main.ev("document.querySelector('[data-health-action=nav-health]').focus();void 0"); await key('Enter','Enter',13,'\r');
  await pass('Explicit local check completes and retains its receipt in Check', "!!document.querySelector('[data-workspace-check-receipt]') && hv.controller.getState().snapshot.lastLocalScan.id===hv.controller.getState().outcome.scan.id");
  await shot('workspace-home-after-check');
  await main.ev("app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('veynrel-studio')[0],{focus:true});void 0"); await focus();
  await main.ev("document.querySelector('[data-studio-field=search]').focus();void 0"); await key('x','KeyX',88,'x');
  await pass('Keyboard text reaches the real focused input', "document.querySelector('[data-studio-field=search]').value==='x'");
  await key('a','KeyA',65,undefined,2); await key('Backspace','Backspace',8);
  await pass('Keyboard clears the query without editing Markdown', "document.querySelector('[data-studio-field=search]').value===''");
  // R03 keeps recipe management behind a disclosure; open it through real keyboard input.
  await main.ev("document.querySelector('[data-studio-action=new]').closest('details').querySelector('summary').focus();void 0"); await key('Enter','Enter',13,'\r');
  await wait("document.querySelector('[data-studio-action=new]').closest('details').open");
  await main.ev("document.querySelector('[data-studio-action=new]').focus();void 0"); await key('Tab','Tab',9);
  await pass('Tab follows actual Studio controls', "document.activeElement.dataset.studioAction==='import'");
  await key('Enter','Enter',13,'\r'); await wait("!!document.querySelector('.veynrel-studio-dialog')");
  await key('Escape','Escape',27); await wait("!document.querySelector('.veynrel-studio-dialog')");
  await pass('Enter opens and Escape closes the actual modal', 'document.hasFocus()');
  for(const width of [500,1100]) {
    const before = await main.ev('resizeTrace.length'); await main.ev(`window.electronWindow.setContentSize(${width},800);void 0`); await wait(`innerWidth===${width}&&innerHeight===800&&resizeTrace.length>${before}`);
    await pass(`Native content resize ${width}`, `window.electronWindow.getContentBounds().width===${width}`); await shot(`resize-${width}`);
  }
  for(const command of ['window:zoom-in','window:zoom-out','window:reset-zoom']) { const before=await main.ev('electron.webFrame.getZoomFactor()'); assert(await main.ev(`app.commands.executeCommandById('${command}')`)); await pause(100); const after=await main.ev('electron.webFrame.getZoomFactor()'); assert(command==='window:zoom-in'?after>before:command==='window:zoom-out'?after<before:after===1); report.checks.push(command); }
  await main.ev("window.split=app.workspace.getLeaf('split');split.openFile(app.vault.getFileByPath('Other.md'),{state:{mode:'preview'}})");
  await pass('Real split stays in the main document', 'split.view.containerEl.ownerDocument===document && app.workspace.getLeavesOfType("markdown").length>=2'); await shot('split');
  await main.ev('split.detach();void 0');
  await main.ev("window.pop=app.workspace.getLeaf('window');pop.openFile(app.vault.getFileByPath('Source.md'),{state:{mode:'preview'}})");
  await wait('pop.view.containerEl.ownerDocument!==document');
  let popTarget; for(let i=0;i<100;i++){popTarget=(await(await fetch(`${endpoint}/json/list`)).json()).find(t=>t.type==='page'&&t.id!==main.id);if(popTarget)break;await pause(50);} assert(popTarget);
  const pop = await connection(popTarget); await focus(pop);
  await pass('Popout has a real native window and focus', "window.electronWindow.isFocused() && document.hasFocus() && !window.frameDom && window.titlebarStyle==='native'", pop);
  await pass('Main loses focus to the popout', '!document.hasFocus()'); await shot('popout', pop);
  await focus(); await pass('Focus returns to the real main window', 'document.hasFocus() && window.electronWindow.isFocused()');
  await main.ev('pop.detach();void 0'); await pause(200); await shot('final'); await stopVideo();
  report.resizeEvents = await main.ev('resizeTrace'); assert.equal(report.exceptions.length,0, 'Unfiltered native exceptions');
  report.markdown = Object.fromEntries(Object.entries(originals).map(([name,text])=>[name,{before:sha(text),after:sha(fs.readFileSync(`${vault}/${name}`))}]));
  assert(Object.values(report.markdown).every(h=>h.before===h.after), 'All source Markdown byte-identical'); report.checks.push('All source Markdown byte-identical'); report.status='PASS';
} catch(error) { report.status='FAIL'; report.error=String(error.stack??error); process.exitCode=1; try { if(main) await shot('failure'); await stopVideo(); } catch(e) {report.captureError=String(e);} }
finally {
  fs.writeFileSync(`${root}/report.json`, JSON.stringify(report,null,2)+'\n'); for(const c of connections)c.socket.close();
  if(child.exitCode===null&&child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),3000);await exited;clearTimeout(timer);}
  console.log(JSON.stringify({root,status:report.status,checks:report.checks.length,exceptions:report.exceptions.length,error:report.error}));
}
