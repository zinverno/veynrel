// Real Obsidian/Electron smoke. No DOM mocks, provider calls or personal vault.
import fs from 'node:fs';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertNativeRoot, launchObsidian, nativeEndpoint } from './native/session.mjs';

const root = process.argv[2], build = process.argv[3] ?? fileURLToPath(new URL('../', import.meta.url));
assertNativeRoot(root); assert(!fs.existsSync(root));
const vault = `${root}/vault`, pluginDir = `${vault}/.obsidian/plugins/ai-knowledge-hub`;
fs.mkdirSync(pluginDir, { recursive: true }); fs.mkdirSync(`${root}/profile`); fs.mkdirSync(`${root}/frames`);
const originals = {
  'one/Same.md': '---\r\ntitle: "Юникод: 🐈"\r\n---\r\n\r\nA theoretical note with its own purpose.\r\n\r\n[Elsewhere](../Other.md#Heading)\r\n',
  'two/Same.md': '# Same\n\nA practical note for a different purpose.\n',
  'Broken.md': 'Review this missing destination: [[Missing note]].\n',
  'Other.md': '# Heading\n\nContext stays untouched.\n',
  'Encoding.md': '\uFEFFPlain BOM text.\r\n',
  'encoding/Encoding.md': 'A different encoding control.\n',
  'Diary.md': 'A useful diary needs no links or tags.\n',
};
for (const [name, text] of Object.entries(originals)) { fs.mkdirSync(`${vault}/${name.substring(0,name.lastIndexOf('/')+1)}`,{recursive:true}); fs.writeFileSync(`${vault}/${name}`, text); }
fs.writeFileSync(`${vault}/.obsidian/community-plugins.json`, '["ai-knowledge-hub"]');
fs.writeFileSync(`${vault}/.obsidian/app.json`, '{"checkForUpdates":false}');
fs.writeFileSync(`${root}/profile/obsidian.json`, JSON.stringify({ updateDisabled: true, vaults: { smoke: { path: vault, open: true, ts: Date.now() } } }));
const modelRequests=[];
const server=createServer((req,res)=>{modelRequests.push({method:req.method,url:req.url});res.writeHead(503);res.end('Local link must not request a model');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
fs.writeFileSync(`${pluginDir}/data.json`, JSON.stringify({ language: 'en', apiKey: '', provider: 'ollama', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'unused', semanticAutoSyncSuspended: true, semantic: { enabled: false }, decisions: { enabled: false }, companion: { enabled: false }, health: {version:1,onboardingCompleted:true,profile:'mixed'} }));
const sha = value => createHash('sha256').update(value).digest('hex');
const report = { scenario: 'r05-local-link-native-v1', checks: [], exceptions: [], consoleErrors: [], actions: [], screenshots: [], assets: {}, externalRequests: [], recording: null };
report.harnessHashes = Object.fromEntries(['r05-actions-native.mjs','native/session.mjs','native/run.py'].map(name=>[name,sha(fs.readFileSync(new URL(name,import.meta.url)))]));
for (const name of ['main.js', 'styles.css', 'manifest.json']) { const bytes = fs.readFileSync(`${build}/${name}`); fs.writeFileSync(`${pluginDir}/${name}`, bytes); report.assets[name] = sha(bytes); }
const pause = ms => new Promise(r => setTimeout(r, ms));
let child = launchObsidian(root); const connections = [], frames = [];
let main, endpoint, recording = false, stage = 'startup';
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
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') report.consoleErrors.push(m.params);
    if (m.method === 'Runtime.exceptionThrown') report.exceptions.push({ target: target.id, ...m.params });
    if (m.method === 'Network.requestWillBeSent' && /^https?:/.test(m.params.request.url)) report.externalRequests.push({url:m.params.request.url,stage});
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
async function wait(expression, c = main, attempts = 200) { for (let i = 0; i < attempts; i++) { if (await c.ev(expression)) return; await pause(50); } throw Error(`Readiness: ${expression}`); }
async function pass(name, expression, c = main) { assert(await c.ev(expression), name); report.checks.push(name); }
async function shot(name, c = main) { if(recording)await pause(800); fs.writeFileSync(`${root}/${name}.png`, Buffer.from((await c.send('Page.captureScreenshot', { format:'png' })).data,'base64')); report.screenshots.push(name+'.png'); }
async function focus(c = main) { await c.send('Page.bringToFront'); await c.ev('window.electronWindow.focus();void 0'); await wait('document.hasFocus() && window.electronWindow.isFocused()', c); }
async function key(key, code, number, text, modifiers = 0) {
  for (const type of ['keyDown','keyUp']) await main.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode:number, nativeVirtualKeyCode:number, modifiers, ...(type==='keyDown' && text ? {text,unmodifiedText:text}: {}) });
}
async function stopVideo() {
  if (!recording) return; recording = false; await main.send('Page.stopScreencast'); assert(frames.length > 5, 'Native video contains frames');
  const list = frames.map((f,i) => `file '${f.file}'\nduration ${Math.max(.001,(frames[i+1]?.time ?? f.time+.2)-f.time)}`).join('\n') + `\nfile '${frames.at(-1).file}'\n`;
  fs.writeFileSync(`${root}/frames/frames.txt`, list);
  const result = spawnSync('ffmpeg', ['-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',`${root}/frames/frames.txt`,'-vf','pad=1600:1000:0:0','-fps_mode','cfr','-r','30','-c:v','libx264','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart',`${root}/journey.mp4`], { encoding:'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',`${root}/journey.mp4`],{encoding:'utf8'});assert.equal(probe.status,0,probe.stderr);
  const encodedSeconds=Number(JSON.parse(probe.stdout).format.duration);assert(encodedSeconds>=frames.at(-1).time-frames[0].time,'Encoded video must retain the complete native frame interval');
  report.recording = { file:'journey.mp4', encodedSeconds, frames:frames.length, seconds:frames.at(-1).time-frames[0].time, source:'Native CDP frames and timestamps; main client area, no cuts' };
}
async function attach() {
  endpoint = await nativeEndpoint(root, child);
  let target; for (let i=0;i<200;i++) { target=(await(await fetch(`${endpoint}/json/list`)).json()).find(t=>t.url.startsWith('app://obsidian.md/')); if(target)break; await pause(50); }
  assert(target); main=await connection(target); await wait('!!window.app?.workspace?.layoutReady');
  assert.equal(await main.ev('app.vault.adapter.basePath'),vault);
  await wait("!!app.plugins.plugins['ai-knowledge-hub'] || !!document.querySelector('.mod-trust-folder')");
  if(await main.ev("!!document.querySelector('.mod-trust-folder')")) await main.ev("[...document.querySelectorAll('.mod-trust-folder button')].find(e=>/Trust author/.test(e.textContent)).click();void 0");
  await wait("!!app.commands.commands['ai-knowledge-hub:veynrel-open-health']");
  await main.ev(`window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.io={reads:[],writes:[],creates:[],metadata:0,enumerations:0,models:0,journalWrites:[],phase:'startup'};
    for(const name of ['read','cachedRead','modify','process','create']) {const original=app.vault[name].bind(app.vault);app.vault[name]=(...args)=>{const path=typeof args[0]==='string'?args[0]:args[0]?.path;
      io[name==='read'||name==='cachedRead'?'reads':name==='create'?'creates':'writes'].push({path,phase:io.phase});return original(...args);};}
    for(const name of ['write','copy','mkdir']){const original=app.vault.adapter[name].bind(app.vault.adapter);app.vault.adapter[name]=(...args)=>{io.journalWrites.push({method:name,path:args[0],phase:io.phase});return original(...args);};}
    const enumerate=app.vault.getMarkdownFiles.bind(app.vault);app.vault.getMarkdownFiles=(...args)=>{io.enumerations++;return enumerate(...args);};
    const cache=app.metadataCache.getFileCache.bind(app.metadataCache);app.metadataCache.getFileCache=file=>{io.metadata++;return cache(file);};
    void 0`);
  await main.ev("window.keyTrace=[];for(const name of ['keydown','keypress','keyup','click'])document.addEventListener(name,e=>keyTrace.push({type:e.type,key:e.key,target:e.target.dataset?.healthAction??e.target.dataset?.orgAction??e.target.dataset?.taxonomyAction,prevented:e.defaultPrevented}),true);void 0");
  await focus(); await main.ev('window.electronWindow.setContentSize(1100,900);void 0'); await wait('innerWidth===1100');
  await main.ev("app.changeTheme('obsidian');void 0");
  report.versions=await main.ev("({obsidian:document.title.match(/Obsidian ([0-9.]+)/)?.[1],electron:process.versions.electron,chrome:process.versions.chrome,plugin:plugin.manifest.version})");
}
async function reveal(selector) {
  for(let i=0;i<8;i++) {
    const closed=await main.ev(`(()=>{let e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing control');let ancestors=[];for(e=e.parentElement;e;e=e.parentElement)if(e.tagName==='DETAILS'&&!e.open)ancestors.push(e);if(!ancestors.length)return false;ancestors.at(-1).querySelector('summary').focus();return true;})()`);
    if(!closed)return; await key('Enter','Enter',13,'\r'); await pause(25);
  }
  throw Error('Disclosure did not open');
}
async function activate(selector) {
  await reveal(selector); await focus(); await main.ev(`{const e=document.querySelector(${JSON.stringify(selector)});if(e.disabled)throw Error('Disabled control');e.scrollIntoView({block:'center'});e.focus();}void 0`);
  report.actions.push({selector,active:await main.ev('document.activeElement?.outerHTML')});
  await key('Enter','Enter',13,'\r');if(recording)await pause(650);
}
const hashes=()=>Object.fromEntries(Object.keys(originals).map(path=>[path,sha(fs.readFileSync(`${vault}/${path}`))]));
const initialHashes=hashes();
async function phase(name) { stage=name; await main.ev(`io.phase=${JSON.stringify(name)};void 0`); }
async function choose(selector,value) {
  await focus(); await main.ev(`document.querySelector(${JSON.stringify(selector)}).focus();void 0`);
  await key('Home','Home',36); const steps=Number(value)+1;
  for(let i=0;i<steps;i++)await key('ArrowDown','ArrowDown',40);
  assert.equal(await main.ev(`document.querySelector(${JSON.stringify(selector)}).value`),value);
}
async function openPair() { await activate('[data-health-action=finding-compare]'); await wait("!!document.querySelector('[data-local-link=open]')"); }
async function openLocal() { await activate('[data-local-link=open]'); await wait("!!document.querySelector('[data-local-link=direction]')"); }
async function prepare(side='0') {
  await choose('[data-local-link=direction]',side); await choose('[data-local-link=paragraph]','0');
  await main.ev("document.querySelector('[data-local-link=range-confirm]').focus();void 0");await key(' ','Space',32,' ');
  await activate('[data-local-link=review]');await wait("!!document.querySelector('.ai-safe-apply [data-safe-action=confirm]')||!!document.querySelector('.ai-safe-apply [role=alert]')");
}
async function closeTop(selector) {await focus();await key('Escape','Escape',27);await wait(`!document.querySelector(${JSON.stringify(selector)})`);}
async function toFinding() {
  await main.ev("window.hv=app.workspace.getLeavesOfType('veynrel-health').find(l=>l.view.containerEl.ownerDocument===document).view;window.pairFinding=hv.controller.listFindings().find(f=>f.type==='duplicate-title-group'&&f.notePaths.includes('one/Same.md'));hv.navigate({page:'findings',state:'open',dimension:'all',selectedFindingId:pairFinding.id});void 0");
  await wait("!!document.querySelector('[data-health-action=finding-compare]')");
}
try {
  await attach();await main.ev("(async()=>{await app.commands.commands['ai-knowledge-hub:veynrel-open-health'].callback();window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;void 0})()");
  await wait("!!document.querySelector('[data-health-action=home-check]')");
  report.settingsBefore=await main.ev('JSON.stringify({...plugin.settings,language:null})');await phase('passive-navigation');const passive=await main.ev('structuredClone(io)');
  await activate('[data-health-action=home-findings]');await main.ev("hv.navigate({page:'home'});void 0");
  await pass('Passive Workspace and Findings navigation does not scan, read Markdown or write',"!hv.controller.getState().outcome&&!hv.controller.getState().busy");
  const afterPassive=await main.ev('structuredClone(io)');for(const k of ['reads','writes','creates'])assert.equal(afterPassive[k].length,passive[k].length);
  assert.equal(afterPassive.enumerations,passive.enumerations);report.passive={before:passive,after:afterPassive};
  await phase('explicit-local-scan');await activate('[data-health-action=home-check]');await activate('[data-health-action=scan]');
  await wait('!!hv.controller.getState().outcome&&!hv.controller.getState().busy');
  report.scan=await main.ev('hv.controller.getState().outcome');assert.equal(report.scan.scan.status,'completed');assert.equal(report.scan.freshness,'verified');
  await main.ev("hv.navigate({page:'home'});void 0");await pass('Home offers at most three actual evidence-backed actions',"document.querySelectorAll('[data-next-actions] button').length>0&&document.querySelectorAll('[data-next-actions] button').length<=3");
  await main.ev("window.pairFinding=hv.controller.listFindings().find(f=>f.type==='duplicate-title-group'&&f.notePaths.includes('one/Same.md'));void 0");
  const id=await main.ev('pairFinding.id');await activate('[title=one]');await pass('Selected Workspace folder is one; the explicitly shown pair may include an external target',"document.querySelector('[title=one]').getAttribute('aria-pressed')==='true'");report.activeScope={workspaceFolder:'one',source:'one/Same.md',target:'two/Same.md',writes:['one/Same.md']};
  await main.send('Page.startScreencast',{format:'jpeg',quality:85,everyNthFrame:1});recording=true;
  await phase('finding-and-pair');await activate(`[data-health-action="next-${id}"]`);await shot('finding-evidence-en-dark');
  await openPair();await pass('Real pair retains exact homonym paths and saved source context',"document.querySelector('.ai-pair-inspector').textContent.includes('one/Same.md')&&document.querySelector('.ai-pair-inspector').textContent.includes('two/Same.md')");await shot('pair-evidence');
  await openLocal();await shot('local-plan');await phase('prepare-and-review');await prepare();
  assert(await main.ev("!!document.querySelector('.ai-safe-apply [data-safe-action=confirm]')"),'Review is executable');await shot('review-diff');
  assert.deepEqual(hashes(),initialHashes);await pass('No note writes before separate Apply confirmation',"io.writes.length===0&&io.creates.length===0");
  await phase('explicit-apply');await activate('.ai-safe-apply [data-safe-action=confirm]');await wait("!!document.querySelector('.ai-safe-apply [data-safe-action=undo]')");
  const expected=originals['one/Same.md'].replace('A theoretical note with its own purpose.','A theoretical note with its own purpose. [[two/Same]]');
  assert.equal(fs.readFileSync(`${vault}/one/Same.md`,'utf8'),expected);for(const name of Object.keys(originals).filter(n=>n!=='one/Same.md'))assert.equal(hashes()[name],initialHashes[name]);
  report.appliedHash=hashes()['one/Same.md'];report.checks.push('Explicit Apply adds only the full-path link; target, diary, YAML, CRLF, Unicode and unrelated notes preserved');await shot('applied');
  await phase('explicit-undo');await activate('.ai-safe-apply [data-safe-action=undo]');await wait("!!document.querySelector('[data-safe-action=undoConfirm]')");await shot('undo-review');
  await activate('[data-safe-action=undoConfirm]');await wait("!!document.querySelector('.ai-safe-apply [data-safe-action=done]')");assert.deepEqual(hashes(),initialHashes);await shot('undone');await stopVideo();report.checks.push('Separate Undo restores every original Markdown byte');
  await activate('.ai-safe-apply [data-safe-action=done]');await closeTop('.ai-pair-inspector');
  await pass('Returning retains originating finding and route',`hv.route.page==='findings'&&hv.route.selectedFindingId===${JSON.stringify(id)}&&!!document.querySelector('[data-health-action=finding-compare]')`);
  report.history=await main.ev('plugin.safeApply.history()');assert.equal(report.history.length,1);assert.equal(report.history[0].state,'undone');assert.equal(report.history[0].record.version,1);
  await phase('refusal-unsaved-editor');await main.ev("(async()=>{window.editorLeaf=app.workspace.getLeaf('split');await editorLeaf.openFile(app.vault.getFileByPath('two/Same.md'));editorLeaf.view.editor.setValue(editorLeaf.view.editor.getValue());void 0})()");
  await toFinding();await openPair();await openLocal();await prepare('1');
  await pass('Affected open split editor refuses write consent',"!!document.querySelector('.ai-safe-apply [role=alert]')&&!document.querySelector('.ai-safe-apply [data-safe-action=confirm]')");await shot('open-editor-refusal');
  await closeTop('.ai-safe-apply');await closeTop('.ai-pair-inspector');await main.ev('editorLeaf.detach();void 0');
  await phase('localization-and-layout');
  for(const language of ['en','ru']) {
    await main.ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await main.ev(`{const s=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));s.value='${language}';s.dispatchEvent(new Event('change'));}void 0`);await main.ev('plugin.settingsSave');await main.ev('app.setting.close();void 0');await focus();
    for(const theme of ['dark','light']) {
      await main.send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false});await main.ev(`app.changeTheme('${theme==='light'?'moonstone':'obsidian'}');void 0`);
      await toFinding();await openPair();await openLocal();await choose('[data-local-link=direction]','1');await choose('[data-local-link=paragraph]','0');
      await pass(`${language}/${theme}/390px local plan uses native theme without horizontal overflow`,"(()=>{const e=document.querySelector('.ai-local-link');return e.scrollWidth<=e.clientWidth+1&&!e.textContent.includes('@localLink.')})()");
      await shot(`${language}-${theme}-390`);await key('Tab','Tab',9);await pass(`${language}/${theme}: keyboard focus remains in local plan`,"!!document.activeElement.closest('.ai-local-link')");await closeTop('.ai-local-link');await closeTop('.ai-pair-inspector');
    }
  }
  await main.send('Emulation.clearDeviceMetricsOverride');await main.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await main.ev("(async()=>{window.pop=app.workspace.getLeaf('window');await pop.setViewState({type:'veynrel-health',active:true});void 0})()");await wait('pop.view.containerEl.ownerDocument!==document');
  let target;for(let i=0;i<100;i++){target=(await(await fetch(`${endpoint}/json/list`)).json()).find(t=>t.type==='page'&&t.id!==main.id);if(target)break;await pause(50);}assert(target);
  const home=main;main=await connection(target);await focus();await toFinding();await openPair();await openLocal();
  await pass('Real popout owns local-plan document and focus',"!!document.querySelector('.ai-local-link')&&document.hasFocus()&&window.electronWindow.isFocused()");await shot('popout-plan');await closeTop('.ai-local-link');await closeTop('.ai-pair-inspector');
  main=home;await main.ev('pop.detach();void 0');await focus();await pass('Focus returns to main after popout close',"document.hasFocus()&&matchMedia('(prefers-reduced-motion: reduce)').matches");
  await phase('bom-refusal');await main.ev("{const f=hv.controller.listFindings().find(f=>f.type==='duplicate-title-group'&&f.notePaths.includes('Encoding.md'));hv.navigate({page:'findings',state:'open',dimension:'all',selectedFindingId:f.id});}void 0");
  await openPair();await activate('[data-local-link=open]');await wait("!!document.querySelector('.ai-local-link [role=alert]')");
  await pass('BOM stripped by native Vault.read refuses preparation before a new journal or Markdown write',"!document.querySelector('[data-local-link=direction]')&&document.querySelector('.ai-local-link').textContent.includes('BOM')");
  assert.equal((await main.ev('plugin.safeApply.history()')).length,1);assert.deepEqual(hashes(),initialHashes);await shot('bom-refusal');await closeTop('.ai-local-link');await closeTop('.ai-pair-inspector');
  await phase('dismiss-and-rescan');await toFinding();await activate('[data-health-action=finding-dismiss]');await wait('!hv.controller.getState().busy');
  await main.ev("hv.navigate({page:'health'});void 0");await activate('[data-health-action=scan]');await wait('!hv.controller.getState().busy');
  await pass('Finding dismissal survives a repeated local scan without Markdown changes',`hv.controller.listFindings().find(f=>f.id===${JSON.stringify(id)}).state==='dismissed'`);
  assert.equal(await main.ev('JSON.stringify({...plugin.settings,language:null})'),report.settingsBefore);delete report.settingsBefore;report.settingsPreserved='All plugin settings unchanged except the explicitly tested language selector';assert.deepEqual(hashes(),initialHashes);report.finalHashes=hashes();report.io=await main.ev('structuredClone(io)');report.modelRequests=modelRequests;assert.equal(modelRequests.length,0);assert.equal(report.exceptions.length,0);
  assert.equal(report.io.writes.filter(e=>e.phase==='explicit-apply'&&e.path==='one/Same.md').length,1);assert.equal(report.io.writes.filter(e=>e.phase==='explicit-undo'&&e.path==='one/Same.md').length,1);
  report.checks.push('Zero model requests and unhandled exceptions; all original files byte-identical at finish');report.status='PASS';
} catch(error) {
  report.status='FAIL';report.error=String(error.stack??error);process.exitCode=1;
  try{if(main){report.diagnostic=await main.ev('({io:window.io,active:document.activeElement?.outerHTML,modals:[...document.querySelectorAll(".modal")].map(e=>e.outerHTML)})');await shot('failure');}await stopVideo();}catch(e){report.captureError=String(e);}
} finally {
  fs.writeFileSync(`${root}/report.json`,JSON.stringify(report,null,2)+'\n');for(const c of connections)c.socket.close();
  if(child.exitCode===null&&child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),3000);await exited;clearTimeout(timer);}
  await new Promise(resolve=>server.close(resolve));console.log(JSON.stringify({root,status:report.status,checks:report.checks.length,exceptions:report.exceptions.length,error:report.error}));
}
