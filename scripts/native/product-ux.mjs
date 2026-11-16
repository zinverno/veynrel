// Real Obsidian/Electron smoke. No DOM mocks, provider calls or personal vault.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertNativeRoot, launchObsidian, nativeEndpoint } from './session.mjs';

const noteCount = Number(process.env.UX_NOTE_COUNT ?? 154);
assert([154,1000,5000,10000].includes(noteCount));
const root = process.argv[2], phase = process.argv[3] ?? 'baseline', build = process.argv[4] ?? fileURLToPath(new URL('../../', import.meta.url));
assertNativeRoot(root); assert(!fs.existsSync(root));
const vault = `${root}/vault`, pluginDir = `${vault}/.obsidian/plugins/ai-knowledge-hub`;
fs.mkdirSync(pluginDir, { recursive: true }); fs.mkdirSync(`${root}/profile`); fs.mkdirSync(`${root}/frames`);
const originals = { 'Source.md': '# Synthetic source\n\nTwo facts stay unchanged. Два факта сохранены.\n', 'Other.md': '# Synthetic second note\n\n[[Source]]\n' };
for(let i=2;i<noteCount;i++) originals[`Note-${i}.md`]=`# Synthetic material ${i}\n\nDistinct explanation ${i} about ${['containers','databases','architecture','learning'][i%4]}.\n\n[[${i%7===0?'Missing-'+i:'Source'}]]\n`;
for (const [name, text] of Object.entries(originals)) fs.writeFileSync(`${vault}/${name}`, text);
fs.writeFileSync(`${vault}/.obsidian/community-plugins.json`, '["ai-knowledge-hub"]');
fs.writeFileSync(`${vault}/.obsidian/app.json`, '{"checkForUpdates":false}');
fs.writeFileSync(`${root}/profile/obsidian.json`, JSON.stringify({ updateDisabled: true, vaults: { smoke: { path: vault, open: true, ts: Date.now() } } }));
fs.writeFileSync(`${pluginDir}/data.json`, JSON.stringify({ language: 'en', apiKey: '', provider: 'ollama', baseUrl: 'http://127.0.0.1:1/v1', model: 'unused', semanticAutoSyncSuspended: true, semantic: { enabled: false }, decisions: { enabled: false }, companion: { enabled: false }, health: { onboardingCompleted: false, profileChosen: false } }));
const sha = value => createHash('sha256').update(value).digest('hex');
const source = { commit: spawnSync('git',['rev-parse','HEAD'],{cwd:build,encoding:'utf8'}).stdout.trim(), diffSha256: sha(spawnSync('git',['diff','HEAD','--','*.ts','*.mjs','*.py','styles.css'],{cwd:build,encoding:'utf8'}).stdout) };
const report = { source, scenario: 'product-ux-'+phase, checks: [], exceptions: [], actions: [], screenshots: [], assets: {}, externalRequests: [], recording: null };
report.harnessHashes = Object.fromEntries(['product-ux.mjs','session.mjs','run.py'].map(name=>[name,sha(fs.readFileSync(new URL(name,import.meta.url)))]));
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

  await main.ev(`window.uxIO={read:0,write:0,process:0,pluginRead:0,pluginWrite:0};for(const k of ['read','cachedRead','modify','create','process']){const old=app.vault[k].bind(app.vault);app.vault[k]=(...a)=>{if(String(a[0]?.path??a[0]).endsWith('.md')){uxIO[k==='read'||k==='cachedRead'?'read':k==='process'?'process':'write']++;if(new Error().stack.includes('plugin:ai-knowledge-hub'))uxIO[k==='read'||k==='cachedRead'?'pluginRead':'pluginWrite']++;}return old(...a)}};void 0`);
  await main.ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health');void 0");
  await wait("!!document.querySelector('[data-health-action=start-local], [data-health-action=scan]')");
  await main.ev("window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;void 0");
  report.passive=await main.ev('({...uxIO})');
  assert.equal(report.passive.pluginRead,0,'Passive Veynrel Markdown reads');assert.equal(report.passive.pluginWrite,0,'Passive Veynrel Markdown writes');
  for(const theme of ['light','dark']){await main.ev(`app.changeTheme('${theme==='light'?'moonstone':'obsidian'}');void 0`);await shot('first-'+theme);}
  const start=Date.now();
  await main.ev("document.querySelector('[data-health-action=start-local], [data-health-action=scan]').focus();void 0");await key('Enter','Enter',13,'\r');
  await wait('!!hv.controller.getState().outcome&&!hv.controller.getState().busy');
  report.firstCheckMs=Date.now()-start;report.outcome=await main.ev('hv.controller.getState().outcome');report.explicitCheckIO=await main.ev('({...uxIO})');
  for(const theme of ['light','dark']){await main.ev(`app.changeTheme('${theme==='light'?'moonstone':'obsidian'}');void 0`);await shot('first-result-'+theme);}
  if(phase==='baseline'){
    await main.ev("document.querySelector('[data-health-action=continue]')?.focus();void 0");await key('Enter','Enter',13,'\r');
    for(const [name,page] of [['home','home'],['notes','discover'],['check','health'],['processing','process']]){
      await main.ev(`hv.navigate({page:'${page}'});void 0`);
      for(const theme of ['light','dark']){await main.ev(`app.changeTheme('${theme==='light'?'moonstone':'obsidian'}');void 0`);await shot(name+'-'+theme);}
    }
  }

  if(phase!=='baseline'){
    await pass('Exactly three top destinations; no duplicate plugin branding or Pulse',"document.querySelectorAll('.veynrel-tabs button').length===3&&!document.querySelector('.veynrel-brand,.veynrel-vault-pulse,.veynrel-sidebar')");
    await pass('No mandatory profile/result wizard',"!document.querySelector('[data-health-action=continue],[data-health-action=profile-mixed]')");
    await wait('app.vault.getMarkdownFiles().every(f=>!!app.metadataCache.getFileCache(f))');
    await main.ev("document.querySelector('[data-health-action=scan]').focus();void 0");const readyStart=Date.now();await key('Enter','Enter',13,'\r');
    await wait('!hv.controller.getState().busy');report.readyCheckMs=Date.now()-readyStart;report.readyOutcome=await main.ev('hv.controller.getState().outcome');
    await pass('Coverage matches real metadata-ready source',`hv.controller.getState().outcome.coverage.listed===${noteCount}&&hv.controller.getState().outcome.coverage.linksUnavailable===0`);
    const input='[data-health-action=finding-search]';
    await main.ev(`document.querySelector('${input}').focus();void 0`);const searchStart=Date.now();await key('x','KeyX',88,'x');
    await pass('Search retains keyboard focus on first route transition',`document.activeElement.matches('${input}')&&document.activeElement.value==='x'`);report.searchMs=Date.now()-searchStart;
    await key('a','KeyA',65,undefined,2);await key('Backspace','Backspace',8);
    await pass('Findings render bounded real rows',"document.querySelectorAll('.veynrel-finding-item').length<=60");
    report.boundedList=await main.ev('({rows:document.querySelectorAll(".veynrel-finding-item").length,elements:document.querySelectorAll(".veynrel-findings-inbox *").length,total:hv.controller.listFindings().length})');
    for(const language of ['en','ru']){
      await main.ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
      await main.ev(`{const s=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));s.value='${language}';s.dispatchEvent(new Event('change'));}void 0`);
      await main.ev('plugin.settingsSave');await main.ev('app.setting.close();hv.render();void 0');await focus();
      for(const theme of ['light','dark']){
        await main.ev(`app.changeTheme('${theme==='light'?'moonstone':'obsidian'}');void 0`);
        for(const width of [1100,390]){
          await main.send('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false});
          await main.ev('app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();void 0');
          await shot(`check-${language}-${theme}-${width}`);
          await pass(`${language}/${theme}/${width}: no horizontal overflow`,"(()=>{const e=hv.contentEl;return e.scrollWidth<=e.clientWidth+1})()");
        }
      }
    }
    await main.send('Emulation.clearDeviceMetricsOverride');
    await main.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await pass('Reduced motion is active','matchMedia("(prefers-reduced-motion: reduce)").matches');
    for(const [name,page] of [['home','home'],['notes','discover'],['check','health'],['processing','process']]){
      const start=Date.now();await main.ev(`hv.navigate({page:'${page}'});void 0`);report.actions.push({transition:page,ms:Date.now()-start});
      for(const theme of ['light','dark']){await main.ev(`app.changeTheme('${theme==='light'?'moonstone':'obsidian'}');void 0`);await shot(name+'-'+theme);}
    }
    await main.ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-studio');void 0");await wait("!!document.querySelector('[data-studio-field=search]')");
    await pass('Only online Community is hidden; Studio Library remains',"!document.querySelector('[data-studio-action=community],[data-studio-action=publish]')&&!!document.querySelector('[data-studio-field=search]')&&plugin.studio.features.onlineCommunity===false&&plugin.studio.community.state==='idle'");
    await shot('studio-community-off');
    await main.ev("window.uxSplit=app.workspace.getLeaf('split');uxSplit.setViewState({type:'veynrel-health',active:true})");
    await pass('Real Workspace split mounts independently',"app.workspace.getLeavesOfType('veynrel-health').length===2");await shot('split');
    await main.ev('uxSplit.detach();void 0');
    await main.ev("window.uxPop=app.workspace.getLeaf('window');uxPop.setViewState({type:'veynrel-health',active:true})");
    await wait('uxPop.view.containerEl.ownerDocument!==document');
    let popTarget;for(let i=0;i<100;i++){popTarget=(await(await fetch(`${endpoint}/json/list`)).json()).find(t=>t.type==='page'&&t.id!==main.id);if(popTarget)break;await pause(50);}assert(popTarget);
    const pop=await connection(popTarget);await focus(pop);
    await pass('Popout has actual three-tab UI',"document.querySelectorAll('.veynrel-tabs button').length===3",pop);await shot('popout',pop);
    await main.ev('uxPop.detach();void 0');await focus();
    await pass('Focus returns to main window','document.hasFocus()');
    assert.equal(report.externalRequests.length,0,'No HTTP requests during the walkthrough');
  }
  report.dom=await main.ev('({elements:document.querySelectorAll(".veynrel-health-view *").length,findings:hv.controller.listFindings().length})');
  await stopVideo();
  report.markdown=Object.fromEntries(Object.entries(originals).map(([name,text])=>[name,{before:sha(text),after:sha(fs.readFileSync(`${vault}/${name}`))}]));
  assert(Object.values(report.markdown).every(h=>h.before===h.after));report.checks.push('All Markdown byte-identical');
  assert.equal(report.exceptions.length,0,'Unfiltered native exceptions');report.status='PASS';
} catch(error) { report.status='FAIL'; report.error=String(error.stack??error); process.exitCode=1; try { if(main) await shot('failure'); await stopVideo(); } catch(e) {report.captureError=String(e);} }
finally {
  fs.writeFileSync(`${root}/report.json`, JSON.stringify(report,null,2)+'\n'); for(const c of connections)c.socket.close();
  if(child.exitCode===null&&child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),3000);await exited;clearTimeout(timer);}
  console.log(JSON.stringify({root,status:report.status,checks:report.checks.length,exceptions:report.exceptions.length,error:report.error}));
}
