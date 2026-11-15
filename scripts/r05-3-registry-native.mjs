// Real Obsidian/Electron smoke. No DOM mocks, provider calls or personal vault.
import fs from 'node:fs';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertNativeRoot, launchObsidian, nativeEndpoint } from './native/session.mjs';

const root = process.argv[2], build = process.argv[3] ?? fileURLToPath(new URL('../', import.meta.url));
assertNativeRoot(root); assert(!fs.existsSync(root));
const vault = `${root}/vault`, pluginDir = `${vault}/.obsidian/plugins/ai-knowledge-hub`;
fs.mkdirSync(pluginDir, { recursive: true }); fs.mkdirSync(`${root}/profile`); fs.mkdirSync(`${root}/frames`);
const definitions={version:1,profile:{version:1,categories:[]},tags:[{tag:'unused/Ё',state:'allowed',description:'An explicitly unused tag'},{tag:'flashcards/Study',state:'allowed',description:'Separate learning role'}],conventions:[]};
const originalRegistry='---\r\ntitle: Owner instructions\r\n---\r\n# User prose preserved\r\n<!-- keep -->\r\n\r\n```veynrel-organization\r\n'+JSON.stringify(definitions,null,2).replace(/\n/g,'\r\n')+'\r\n```\r\n\r\nAfter: [[A]] and Ё.\r\n';
const originals={'Rules.md':originalRegistry,'Editor rules.md':originalRegistry.replace(/\r\n/g,'\n'),'Notes/A.md':'# A\n#topic/one\n','Notes/B.md':'# B\n#topic/two\n','Notes/C.md':'# C\n#topic/three\n','Diary.md':'Useful diary without tags.\n'};
for (const [name, text] of Object.entries(originals)) { fs.mkdirSync(`${vault}/${name.substring(0,name.lastIndexOf('/')+1)}`,{recursive:true}); fs.writeFileSync(`${vault}/${name}`, text); }
fs.writeFileSync(`${vault}/.obsidian/community-plugins.json`, '["ai-knowledge-hub"]');
fs.writeFileSync(`${vault}/.obsidian/app.json`, '{"checkForUpdates":false}');
fs.writeFileSync(`${root}/profile/obsidian.json`, JSON.stringify({ updateDisabled: true, vaults: { smoke: { path: vault, open: true, ts: Date.now() } } }));
const modelRequests=[];
const server=createServer((req,res)=>{modelRequests.push({method:req.method,url:req.url});res.writeHead(503);res.end('Local link must not request a model');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
fs.writeFileSync(`${pluginDir}/data.json`, JSON.stringify({ language: 'en', apiKey: '', provider: 'ollama', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'unused', semanticAutoSyncSuspended: true, semantic: { enabled: false }, decisions: { enabled: false }, companion: { enabled: false }, health: {version:1,onboardingCompleted:true,profile:'mixed'} }));
const sha = value => createHash('sha256').update(value).digest('hex');
const report = { scenario: 'r05-3-registry-native-v1', checks: [], exceptions: [], consoleErrors: [], actions: [], screenshots: [], assets: {}, externalRequests: [], recording: null };
report.entry = 'Workspace Organization Audit / Rules';
report.sourceSha=spawnSync('git',['rev-parse','HEAD'],{cwd:build,encoding:'utf8'}).stdout.trim();
report.sourceDiffSha256=sha(spawnSync('git',['diff','HEAD'],{cwd:build,encoding:'utf8'}).stdout);
report.harnessHashes = Object.fromEntries(['r05-3-registry-native.mjs','native/session.mjs','native/run.py'].map(name=>[name,sha(fs.readFileSync(new URL(name,import.meta.url)))]));
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
async function shot(name, c = main) { if(recording||capture)await pause(800); fs.writeFileSync(`${root}/${name}.png`, Buffer.from((await c.send('Page.captureScreenshot', { format:'png' })).data,'base64')); report.screenshots.push(name+'.png'); }
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
  await main.ev(`window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.io={reads:[],writes:[],creates:[],metadata:0,metadataCalls:[],enumerations:0,enumerationCalls:[],models:0,adapterWrites:[],phase:'startup'};
    for(const name of ['read','cachedRead','modify','process','create']) {const original=app.vault[name].bind(app.vault);app.vault[name]=(...args)=>{const path=typeof args[0]==='string'?args[0]:args[0]?.path;
      io[name==='read'||name==='cachedRead'?'reads':name==='create'?'creates':'writes'].push({path,phase:io.phase});return original(...args);};}
    for(const name of ['write','copy','mkdir']){const original=app.vault.adapter[name].bind(app.vault.adapter);app.vault.adapter[name]=(...args)=>{io.adapterWrites.push({method:name,path:args[0],phase:io.phase});return original(...args);};}
    const enumerate=app.vault.getMarkdownFiles.bind(app.vault);app.vault.getMarkdownFiles=(...args)=>{io.enumerations++;io.enumerationCalls.push({phase:io.phase,stack:new Error().stack});return enumerate(...args);};
    const cache=app.metadataCache.getFileCache.bind(app.metadataCache);app.metadataCache.getFileCache=file=>{io.metadata++;io.metadataCalls.push({path:file.path,phase:io.phase,stack:new Error().stack});return cache(file);};
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
  await key('Enter','Enter',13,'\r');if(recording||capture)await pause(650);
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

async function closeTop(selector) { await focus(); await key('Escape','Escape',27); await wait(`!document.querySelector(${JSON.stringify(selector)})`); }
async function selectValue(selector,value) {
  const index=await main.ev(`[...document.querySelector(${JSON.stringify(selector)}).options].findIndex(o=>o.value===${JSON.stringify(value)})`); assert(index>=0);
  await main.ev(`document.querySelector(${JSON.stringify(selector)}).focus();void 0`); await key('Home','Home',36);
  for(let i=0;i<index;i++)await key('ArrowDown','ArrowDown',40);
  assert.equal(await main.ev(`document.querySelector(${JSON.stringify(selector)}).value`),value);
}
let capture;
function startCapture(file) {
  assert(!capture);const log=fs.openSync(`${root}/${file}.log`,'w');
  const process=spawn('ffmpeg',['-hide_banner','-loglevel','error','-f','x11grab','-framerate','12','-video_size','1600x1000','-i',globalThis.process.env.DISPLAY,'-c:v','libx264','-threads','2','-preset','ultrafast','-crf','24','-pix_fmt','yuv420p','-movflags','+faststart',`${root}/${file}.mp4`],{stdio:['ignore',log,log]});fs.closeSync(log);
  capture={process,file,startedAt:Date.now()};
}
async function stopCapture() {
  if(!capture)return;const c=capture;capture=undefined;assert(c.process.exitCode===null,'Recording exited early');
  const exited=new Promise(resolve=>c.process.once('exit',resolve));c.process.kill('SIGINT');await exited;
  const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',`${root}/${c.file}.mp4`],{encoding:'utf8'});assert.equal(probe.status,0,probe.stderr);
  (report.continuousRecordings??=[]).push({file:c.file+'.mp4',seconds:Number(JSON.parse(probe.stdout).format.duration),source:'Uncut private Xvfb 1600x1000 recording, including host restart; no user desktop'});
}
async function fill(selector,value) {
  await reveal(selector);await focus();await main.ev(`document.querySelector(${JSON.stringify(selector)}).focus();void 0`);
  await key('a','KeyA',65,undefined,2);await main.send('Input.insertText',{text:value});assert.equal(await main.ev(`document.querySelector(${JSON.stringify(selector)}).value`),value);
}
async function openAudit() {
  await main.ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health');void 0");
  await wait("!!document.querySelector('[data-health-action=organization-audit]')");await activate('[data-health-action=organization-audit]');
  await wait("!!document.querySelector('.ai-taxonomy')");await main.ev("window.audit=[...app.plugins.plugins['ai-knowledge-hub'].taxonomyModals].at(-1);void 0");
}
async function connect(path='Rules.md') {
  await fill('[data-org-field=registry-path]',path);await activate('[data-org-action=registry-connect]');await wait('!!audit.rulesView.review');
  await activate('[data-org-action=registry-confirm]');await wait("plugin.getOrganizationRegistry().state==='ready'&&!audit.rulesView.busy");
}
async function openEditor() { await activate('[data-org-action=registry-edit]');await wait("!!document.querySelector('[data-registry-field=entry]')||!!document.querySelector('.ai-registry-editor [role=alert]')"); }
async function scan() {
  await activate('[data-taxonomy-action=analyze]');await wait("!!audit.session.inventory&&audit.session.stage!=='scanning'");
  assert.equal(await main.ev('audit.session.inventory.organization.state'),'complete');
}
async function layout(name, selector) {
  const geometry=await main.ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return {overflow:e.scrollWidth>e.clientWidth+1,controls:[...e.querySelectorAll('input:not([type=checkbox]),select,textarea,button')].filter(x=>x.getClientRects().length).map(x=>{const b=x.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom}}),left:r.left,right:r.right}})()`);
  (report.layouts??=[]).push({name,...geometry});assert(!geometry.overflow,name);for(const r of geometry.controls)assert(r.left>=geometry.left-1&&r.right<=geometry.right+1,name);
  report.checks.push(name+': controls fit, no horizontal overflow');
}
try {
  await attach();await phase('passive');await openAudit();
  await pass('Passive Audit open does not start an audit, read notes or write Markdown',"!audit.session.inventory&&io.reads.length===0&&io.writes.length===0&&io.creates.length===0");
  report.passive=await main.ev('structuredClone(io)');
  assert(report.passive.enumerationCalls.every(c=>c.stack.includes('VaultScopeIndex.refresh')),'Passive enumeration is only the existing Workspace scope list');
  assert(report.passive.metadataCalls.every(c=>!c.stack.includes('Taxonomy')&&!c.stack.includes('taxonomy')),'Passive open must not run the taxonomy scanner');
  report.settingsBefore=await main.ev('JSON.stringify(plugin.settings.tagTaxonomyProfile??null)');
  await main.send('Page.startScreencast',{format:'jpeg',quality:85,everyNthFrame:1});recording=true;
  startCapture('registry-journey');await phase('connect');await connect();assert.deepEqual(hashes(),initialHashes);await shot('connected-registry');
  await phase('definition-draft');await openEditor();await selectValue('[data-registry-field=entry]','unused/Ё');await selectValue('[data-registry-field=state]','deprecated');await fill('[data-registry-field=description]','Owner explicitly retired this tag.');await layout('en dark editor','.ai-registry-editor');await shot('definition-draft');
  await phase('review');await activate('[data-registry-action=review]');await wait("!!document.querySelector('.ai-registry-review [data-registry=confirm]')");
  await activate('.ai-registry-review details:nth-of-type(1) summary');await shot('registry-full-before');await activate('.ai-registry-review details:nth-of-type(2) summary');await shot('registry-full-after');
  await main.ev("document.querySelector('.ai-registry-review [data-registry=confirm]').scrollIntoView({block:'center'});void 0");await shot('registry-diff-confirm');
  assert.deepEqual(hashes(),initialHashes);await pass('Separate Review has no Markdown writes or model requests','io.writes.length===0&&io.creates.length===0');
  await phase('apply');await activate('.ai-registry-review [data-registry=confirm]');await wait("!!document.querySelector('.ai-registry-review [data-registry=history]')");
  await pass('Save reports verified success and refreshes active definitions',"document.querySelector('.ai-registry-review [role=status]')?.textContent==='Change saved and recorded in the journal.'&&plugin.getOrganizationRegistry().definitions.tags[0].state==='deprecated'");
  const after=fs.readFileSync(`${vault}/Rules.md`,'utf8'), bodyStart=originalRegistry.indexOf('{'), bodyEnd=originalRegistry.lastIndexOf('```');
  assert.equal(after.slice(0,bodyStart),originalRegistry.slice(0,bodyStart));assert(after.endsWith(originalRegistry.slice(bodyEnd)));for(const name of Object.keys(originals).filter(n=>n!=='Rules.md'))assert.equal(hashes()[name],initialHashes[name]);
  report.checks.push('Disk: one selected definition changed; surrounding CRLF/YAML/prose/Unicode and all knowledge notes preserved');await shot('registry-saved');
  await stopVideo();report.beforeRestartIO=await main.ev('structuredClone(io)');
  await phase('restart');const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exited;for(const c of connections)c.socket.close();child=launchObsidian(root);await attach();
  await pass('Restart retains connection without fallback or automatic source reads',"plugin.getOrganizationRegistry().path==='Rules.md'&&plugin.getTaxonomyProfilePort().get()===null&&io.reads.length===0&&io.writes.length===0");
  await openAudit();await connect();await pass('After explicit reload the changed rule is active',"plugin.getOrganizationRegistry().definitions.tags[0].state==='deprecated'");await closeTop('.ai-taxonomy');
  await main.ev("plugin.getToolsPort().openOperationHistory();void 0");await wait("!!document.querySelector('[data-registry=undo]')");await shot('registry-history-restart');
  await activate('[data-registry=undo]');await wait("!!document.querySelector('.ai-registry-review [data-registry=confirm]')");await shot('registry-undo-review');assert.equal(fs.readFileSync(`${vault}/Rules.md`,'utf8'),after);
  await phase('undo');await activate('.ai-registry-review [data-registry=confirm]');await wait("!!document.querySelector('.ai-registry-review [data-registry=history]')");assert.deepEqual(hashes(),initialHashes);
  await pass('Undo restores original bytes and active definitions',"plugin.getOrganizationRegistry().definitions.tags[0].state==='allowed'");await shot('registry-undone');await closeTop('.ai-registry-review');await closeTop('.ai-operation-history');await stopCapture();
  startCapture('decisions-journey');await phase('decision-audit');await openAudit();await scan();await wait("!!document.querySelector('[data-org-action=dismiss]')");
  const suggestion=await main.ev("document.querySelector('[data-org-suggestion]').dataset.orgSuggestion");await shot('proposal');await activate('[data-org-action=dismiss]');await wait("plugin.settings.organizationAudit.version===2&&plugin.settings.organizationAudit.decisions.length===1");
  await pass('Leave as is persists full authority, not accepted or applied',"plugin.settings.organizationAudit.decisions[0].state==='dismissed'&&plugin.settings.organizationAudit.decisions[0].authority.value==='topic'");
  const decision=await main.ev('JSON.stringify(plugin.settings.organizationAudit.decisions)');
  await phase('fixture-add-unrelated');await main.ev("(async()=>{await app.vault.create('Unrelated.md','Unrelated diary.\\n');})()");await wait("!!app.metadataCache.getFileCache(app.vault.getFileByPath('Unrelated.md'))");
  await phase('decision-rescan');await scan();assert.equal(await main.ev('JSON.stringify(plugin.settings.organizationAudit.decisions)'),decision);
  await pass('Unrelated note and counts do not reopen dismissed authority',`!document.querySelector('[data-org-suggestion="${suggestion}"]')&&document.querySelector('[data-org-decision-counts]').textContent.includes('left as is: 1')`);await shot('still-dismissed');
  await activate('[data-org-action=restore]');await wait("plugin.settings.organizationAudit.decisions.length===0");await pass('Explicit restore returns the same suggestion',`!!document.querySelector('[data-org-suggestion="${suggestion}"]')`);
  await activate('[data-org-action=defer]');await wait("plugin.settings.organizationAudit.decisions[0]?.state==='deferred'");await pass('Later is a distinct persisted state',"document.querySelector('[data-org-decision-counts]').textContent.includes('later: 1')");await shot('deferred');await activate('[data-org-action=restore]');await wait('plugin.settings.organizationAudit.decisions.length===0');await closeTop('.ai-taxonomy');await stopCapture();
  for(const language of ['en','ru']) {
    await main.ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");await main.ev(`{const s=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));s.value='${language}';s.dispatchEvent(new Event('change'));}void 0`);await main.ev('plugin.settingsSave');await main.ev('app.setting.close();void 0');await focus();
    for(const theme of ['dark','light']) {
      await main.send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false});await main.ev(`app.changeTheme('${theme==='light'?'moonstone':'obsidian'}');void 0`);
      await openAudit();await openEditor();await selectValue('[data-registry-field=entry]','unused/Ё');await fill('[data-registry-field=description]',`${language} explicit description`);await layout(`${language}/${theme}/390 editor`,'.ai-registry-editor');await shot(`${language}-${theme}-390-editor`);
      await activate('[data-registry-action=review]');await wait("!!document.querySelector('.ai-registry-review [data-registry=confirm]')");await layout(`${language}/${theme}/390 Review`,'.ai-registry-review');await main.ev("document.querySelector('.ai-registry-review [data-registry=confirm]').scrollIntoView({block:'center'});void 0");await shot(`${language}-${theme}-390-review`);
      await pass(`${language}/${theme} localized separate confirmation`,`document.querySelector('[data-registry=confirm]').textContent===${JSON.stringify(language==='ru'?'Применить это изменение':'Apply this change')}`);await key('Tab','Tab',9);await pass(`${language}/${theme} Tab stays in Review`,"!!document.activeElement.closest('.ai-registry-review')");await closeTop('.ai-registry-review');await closeTop('.ai-taxonomy');assert.deepEqual(hashes(),initialHashes);
    }
  }
  await main.send('Emulation.clearDeviceMetricsOverride');await main.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await phase('split');
  await openAudit();await connect('Editor rules.md');await closeTop('.ai-taxonomy');
  await main.ev("(async()=>{window.split=app.workspace.getLeaf('split');await split.openFile(app.vault.getFileByPath('Editor rules.md'));})()");await openAudit();await openEditor();await pass('Affected real split editor blocks registry preparation',"!!document.querySelector('.ai-registry-editor [role=alert]')&&!document.querySelector('[data-registry-action=review]')");await closeTop('.ai-registry-editor');await closeTop('.ai-taxonomy');await main.ev('split.detach();void 0');await openAudit();await connect();await closeTop('.ai-taxonomy');
  await phase('popout');await main.ev("(async()=>{window.pop=app.workspace.getLeaf('window');await pop.setViewState({type:'veynrel-health',active:true});})()");await wait('pop.view.containerEl.ownerDocument!==document');let target;for(let i=0;i<100;i++){target=(await(await fetch(`${endpoint}/json/list`)).json()).find(t=>t.type==='page'&&t.id!==main.id);if(target)break;await pause(50);}assert(target);
  const home=main;main=await connection(target);await focus();await main.ev("window.plugin=app.plugins.plugins['ai-knowledge-hub'];void 0");await openAudit();await openEditor();await pass('Real popout owns registry editor and focus',"document.hasFocus()&&!!document.querySelector('.ai-registry-editor')");await shot('popout-registry');await closeTop('.ai-registry-editor');await closeTop('.ai-taxonomy');main=home;await main.ev('pop.detach();void 0');await focus();await pass('Focus returns with reduced motion',"document.hasFocus()&&matchMedia('(prefers-reduced-motion: reduce)').matches");
  assert.deepEqual(hashes(),initialHashes);assert.equal(await main.ev('JSON.stringify(plugin.settings.tagTaxonomyProfile??null)'),report.settingsBefore);delete report.settingsBefore;
  report.io=await main.ev('structuredClone(io)');report.history=await main.ev('plugin.safeApply.registry.history()');assert.equal(report.history.length,1);assert.equal(report.history[0].state,'undone');assert(!report.history[0].damaged);
  assert.deepEqual(report.beforeRestartIO.writes.map(e=>e.phase),['apply']);assert.deepEqual(report.io.writes.map(e=>e.phase),['undo']);assert.deepEqual(report.io.creates.map(e=>e.path),['Unrelated.md']);
  report.finalHashes=hashes();report.modelRequests=modelRequests;assert.equal(modelRequests.length,0);assert.equal(report.exceptions.length,0);report.status='PASS';
} catch(error) { report.status='FAIL';report.error=String(error.stack??error);process.exitCode=1;try{if(main){report.diagnostic=await main.ev('({io:window.io,active:document.activeElement?.outerHTML,modals:[...document.querySelectorAll(".modal")].map(e=>e.outerHTML)})');await shot('failure');}await stopVideo();}catch(e){report.captureError=String(e);} }
finally {
  try{await stopCapture();}catch(error){report.recordingError=String(error);report.status='FAIL';process.exitCode=1;}
  fs.writeFileSync(`${root}/report.json`,JSON.stringify(report,null,2)+'\n');for(const c of connections)c.socket.close();if(child.exitCode===null&&child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),3000);await exited;clearTimeout(timer);}
  await new Promise(resolve=>server.close(resolve));console.log(JSON.stringify({root,status:report.status,checks:report.checks.length,exceptions:report.exceptions.length,error:report.error}));
}
