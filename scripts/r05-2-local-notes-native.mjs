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
  'Taggable.md': '---\r\ntitle: Синтетика\r\ntags:\r\n  - kept\r\n---\r\n\r\nМатериал для явного выбора.\r\n',
  'Broken.md': 'Check [[Missing]] and also [[Missing]].\r\n',
  'Folder/Target.md': 'Selected target.\n',
  'Other/Target.md': 'Different same-basename note.\n',
  'Editor.md': 'A separate LF editor guard fixture.\n',
  'Diary.md': 'A useful diary needs no links or tags.\n',
  'Encoding.md': '\uFEFFBOM text.\r\n',
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
const report = { scenario: 'r05-2-local-notes-native-v1', checks: [], exceptions: [], consoleErrors: [], actions: [], screenshots: [], assets: {}, externalRequests: [], recording: null };
report.tagEntry = process.env.VEYNREL_LOCAL_NOTE_REVIEW_ONLY === '1' ? 'direct selected-file entry; Workspace picker NOT tested' : 'Workspace picker';
report.harnessHashes = Object.fromEntries(['r05-2-local-notes-native.mjs','native/session.mjs','native/run.py'].map(name=>[name,sha(fs.readFileSync(new URL(name,import.meta.url)))]));
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
  await main.ev(`window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.io={reads:[],writes:[],creates:[],metadata:0,enumerations:0,models:0,adapterWrites:[],phase:'startup'};
    for(const name of ['read','cachedRead','modify','process','create']) {const original=app.vault[name].bind(app.vault);app.vault[name]=(...args)=>{const path=typeof args[0]==='string'?args[0]:args[0]?.path;
      io[name==='read'||name==='cachedRead'?'reads':name==='create'?'creates':'writes'].push({path,phase:io.phase});return original(...args);};}
    for(const name of ['write','copy','mkdir']){const original=app.vault.adapter[name].bind(app.vault.adapter);app.vault.adapter[name]=(...args)=>{io.adapterWrites.push({method:name,path:args[0],phase:io.phase});return original(...args);};}
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

async function closeTop(selector) { await focus(); await key('Escape','Escape',27); await wait(`!document.querySelector(${JSON.stringify(selector)})`); }
async function selectValue(selector,value) {
  const index=await main.ev(`[...document.querySelector(${JSON.stringify(selector)}).options].findIndex(o=>o.value===${JSON.stringify(value)})`); assert(index>=0);
  await main.ev(`document.querySelector(${JSON.stringify(selector)}).focus();void 0`); await key('Home','Home',36);
  for(let i=0;i<index;i++)await key('ArrowDown','ArrowDown',40);
  assert.equal(await main.ev(`document.querySelector(${JSON.stringify(selector)}).value`),value);
}
async function pick(path) {
  await wait("!!document.querySelector('.prompt-input')"); await main.send('Input.insertText',{text:path});
  await wait(`document.querySelector('.suggestion-item')?.textContent.includes(${JSON.stringify(path)})`); await key('Enter','Enter',13,'\r');
}
async function openTag(name = 'Taggable') {
  if(process.env.VEYNREL_LOCAL_NOTE_REVIEW_ONLY === '1') {
    await main.ev(`app.plugins.plugins['ai-knowledge-hub'].openLocalNoteAction(${JSON.stringify(name+'.md')},'add_inline_tag');void 0`);
  } else if (process.env.UX_CONTEXTUAL === '1') {
    await main.ev("hv.navigate({page:'discover'});void 0");
    await main.ev("for(const b of [...document.querySelectorAll('[data-health-action^=unselect-]')])b.click();void 0");
    const selector='[data-health-action="note-select-'+encodeURIComponent(name+'.md')+'"]';
    await focus();await main.ev(`document.querySelector(${JSON.stringify(selector)}).focus();void 0`);await key(' ','Space',32,' ');
    await activate('[data-health-action=note-tag]');
  } else {
    await main.ev("hv.navigate({page:'home'});void 0"); await activate('[data-health-action=tag-note]'); await pick(name);
  }
  await wait("!!document.querySelector('[data-local-note=tag-choice]')||!!document.querySelector('.ai-local-note [role=alert]')");
}
async function singleNoteCopy(selector, expected) {
  await pass(`${stage}: ${expected}`, `(()=>{const e=document.querySelector(${JSON.stringify(selector)});return e?.textContent===${JSON.stringify(expected)}&&!/canonical|secondary|group|групп/i.test(e.closest('.modal-content').textContent)})()`);
}
async function tagLayout(name) {
  const geometry=await main.ev(`(()=>{
    const root=document.querySelector('.ai-local-note'), rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}};
    const blocks=[...root.querySelectorAll('[data-local-note-block]')].map(e=>({name:e.dataset.localNoteBlock,...rect(e)}));
    const input=root.querySelector('[data-local-note=tag]'), label=input.parentElement, range=document.createRange();range.selectNodeContents(label.firstChild);
    return {root:rect(root),blocks,input:rect(input),label:rect(range),controls:[...root.querySelectorAll('input,select,button')].map(rect),overflow:root.scrollWidth>root.clientWidth+1};
  })()`);
  (report.layouts??=[]).push({name,...geometry});
  assert.deepEqual(geometry.blocks.map(b=>b.name),['manual','inventory','paragraph','review']);
  assert(!geometry.overflow);assert(geometry.label.bottom<=geometry.input.top);
  for(let i=1;i<geometry.blocks.length;i++)assert(geometry.blocks[i-1].bottom<=geometry.blocks[i].top);
  for(const r of [...geometry.blocks,...geometry.controls])assert(r.left>=geometry.root.left-1&&r.right<=geometry.root.right+1);
  report.checks.push(`${name}: tag blocks and label/input do not overlap; controls fit modal`);
}
async function consent(language='en') {
  await activate('[data-local-note=review]'); await wait("!!document.querySelector('.ai-local-note-review [data-local-note=confirm]')||!!document.querySelector('.ai-local-note [role=alert]')||!!document.querySelector('.ai-local-note-review [role=alert]')");
  await pass('Review offers separate write confirmation',"!!document.querySelector('.ai-local-note-review [data-local-note=confirm]')");
  await singleNoteCopy('.ai-local-note-review [data-local-note=confirm]',language==='ru'?'Применить это изменение':'Apply this change');
  assert.deepEqual(hashes(),initialHashes);
}
async function undoThroughHistory() {
  await activate('.ai-local-note-review [data-local-note=history]'); await wait("!!document.querySelector('[data-local-note=undo]')");
  await singleNoteCopy('[data-local-note=undo]','Review undo');
  await activate('[data-local-note=undo]'); await wait("!!document.querySelector('.ai-local-note-review [data-local-note=confirm]')");
  await singleNoteCopy('.ai-local-note-review [data-local-note=confirm]','Undo this change');
  await shot(stage+'-review');
  await activate('.ai-local-note-review [data-local-note=confirm]'); await wait("!!document.querySelector('.ai-local-note-review [data-local-note=history]')");
  await singleNoteCopy('.ai-local-note-review [role=status]','Original Markdown restored.');
  assert.deepEqual(hashes(),initialHashes); await shot(stage+'-undone');
  await closeTop('.ai-local-note-review'); await closeTop('.ai-operation-history');
}
try {
  await attach(); await main.ev("(async()=>{await app.commands.commands['ai-knowledge-hub:veynrel-open-health'].callback();window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;})()");
  await wait("!!document.querySelector('[data-health-action=scan]')");
  report.settingsBefore=await main.ev('JSON.stringify({...plugin.settings,language:null})');
  await phase('passive'); const passive=await main.ev('structuredClone(io)');
  await activate('[data-health-action=nav-health]'); await main.ev("hv.navigate({page:'home'});void 0");
  const after=await main.ev('structuredClone(io)'); for(const k of ['reads','writes','creates'])assert.equal(after[k].length,passive[k].length);
  assert.equal(after.enumerations,passive.enumerations); report.passive={before:passive,after}; report.checks.push('Passive navigation has no scan/read/write/model activity');
  await phase('scan'); await activate('[data-health-action=scan]');
  await wait('!!hv.controller.getState().outcome&&!hv.controller.getState().busy');
  await main.ev("window.brokenFinding=hv.controller.listFindings().find(f=>f.type==='broken-link'&&f.notePaths.includes('Broken.md'));void 0");
  await pass('Native local scan produced the actual broken-link finding','!!brokenFinding');
  report.activeScope={workspace:await main.ev('hv.areaIndex.selection'),tagSource:'Taggable.md',repairSource:'Broken.md',repairTarget:'Folder/Target.md',writesPerAction:1};
  await main.send('Page.startScreencast',{format:'jpeg',quality:85,everyNthFrame:1}); recording=true;
  await phase('tag-selection'); await openTag(); await tagLayout('en/dark regular'); await shot('tag-choices');
  await selectValue('[data-local-note=tag-choice]','manual'); await main.ev("document.querySelector('[data-local-note=tag]').focus();void 0"); await main.send('Input.insertText',{text:'тема/Редкий'});
  await selectValue('[data-local-note=range]','0'); await phase('tag-review'); await consent(); await shot('tag-review-en-dark');
  await pass('Before first Apply, source Markdown has no write calls','io.writes.length===0&&io.creates.length===0');
  await phase('tag-apply'); await activate('.ai-local-note-review [data-local-note=confirm]'); await wait("!!document.querySelector('.ai-local-note-review [data-local-note=history]')");
  assert.equal(fs.readFileSync(`${vault}/Taggable.md`,'utf8'),originals['Taggable.md'].replace('Материал для явного выбора.','Материал для явного выбора. #тема/Редкий'));
  for(const name of Object.keys(originals).filter(n=>n!=='Taggable.md'))assert.equal(hashes()[name],initialHashes[name]);
  await singleNoteCopy('.ai-local-note-review [role=status]','Change saved and recorded in the journal.');
  report.checks.push('Tag Apply changes exactly one inline insertion; YAML/CRLF/Unicode and other notes preserved'); await shot('tag-applied');
  await phase('tag-undo'); await undoThroughHistory(); report.checks.push('Tag Undo restores exact original bytes through shared History');
  await phase('finding'); await main.ev("hv.navigate({page:'findings',state:'open',dimension:'all',selectedFindingId:brokenFinding.id});void 0");
  await wait("!!document.querySelector('[data-health-action=finding-repair]')"); await shot('broken-finding'); await activate('[data-health-action=finding-repair]');
  await wait("!!document.querySelector('[data-local-note=occurrence]')");
  await pass('Two identical unresolved occurrences remain distinct',"document.querySelector('[data-local-note=occurrence]').options.length===3");
  await selectValue('[data-local-note=occurrence]','1'); await activate('[data-local-note=target]'); await pick('Folder/Target');
  await phase('repair-review'); await consent(); await shot('repair-review');
  await phase('repair-apply'); await activate('.ai-local-note-review [data-local-note=confirm]'); await wait("!!document.querySelector('.ai-local-note-review [data-local-note=history]')");
  assert.equal(fs.readFileSync(`${vault}/Broken.md`,'utf8'),'Check [[Missing]] and also [[Folder/Target]].\r\n');
  for(const name of Object.keys(originals).filter(n=>n!=='Broken.md'))assert.equal(hashes()[name],initialHashes[name]);
  await pass('Write does not auto-resolve the Finding',"hv.controller.listFindings().find(f=>f.id===brokenFinding.id).state==='open'");
  await singleNoteCopy('.ai-local-note-review [role=status]','Change saved and recorded in the journal.');
  report.checks.push('Repair changes only selected second occurrence; full target path distinguishes same basenames'); await shot('repair-applied');
  await phase('repair-undo'); await undoThroughHistory(); report.checks.push('Repair Undo restores exact original bytes'); await stopVideo();
  await phase('ru-en-theme-keyboard');
  for(const language of ['en','ru']) {
    await main.ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await main.ev(`{const s=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));s.value='${language}';s.dispatchEvent(new Event('change'));}void 0`);
    await main.ev('plugin.settingsSave'); await main.ev('app.setting.close();void 0'); await focus();
    for(const theme of ['dark','light']) {
      await main.send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false}); await main.ev(`app.changeTheme('${theme==='light'?'moonstone':'obsidian'}');void 0`);
      await openTag(); await selectValue('[data-local-note=tag-choice]','manual'); await main.ev("document.querySelector('[data-local-note=tag]').focus();void 0");await main.send('Input.insertText',{text:'manual/second'});
      await selectValue('[data-local-note=range]','0');
      await pass(`${language}/${theme} 390px tag preparation has no horizontal overflow`,"(()=>{const e=document.querySelector('.ai-local-note');return e.scrollWidth<=e.clientWidth+1})()");await tagLayout(`${language}/${theme} 390px`);await shot(`${language}-${theme}-390-tag-fields`);await consent(language);
      await pass(`${language}/${theme} 390px Review has no horizontal overflow or missing translations`,"(()=>{const e=document.querySelector('.ai-local-note-review');return e.scrollWidth<=e.clientWidth+1&&!e.textContent.includes('@localNote.')})()");
      await shot(`${language}-${theme}-390-review`);await main.ev("document.querySelector('[data-local-note=confirm]').scrollIntoView({block:'center'});void 0");await shot(`${language}-${theme}-390-tag-confirm`); await key('Tab','Tab',9); await pass(`${language}/${theme}: Tab focus stays in Review`,"!!document.activeElement.closest('.ai-local-note-review')"); await closeTop('.ai-local-note-review');
      await main.ev("hv.navigate({page:'findings',state:'open',dimension:'all',selectedFindingId:brokenFinding.id});void 0");
      await activate('[data-health-action=finding-repair]');await wait("!!document.querySelector('[data-local-note=occurrence]')");
      await selectValue('[data-local-note=occurrence]','0');await activate('[data-local-note=target]');await pick('Folder/Target');
      await pass(`${language}/${theme} 390px repair preparation has no horizontal overflow`,"(()=>{const e=document.querySelector('.ai-local-note');return e.scrollWidth<=e.clientWidth+1})()");
      await consent(language);await pass(`${language}/${theme} repair Review is localized without overflow`,"(()=>{const e=document.querySelector('.ai-local-note-review');return e.scrollWidth<=e.clientWidth+1&&!e.textContent.includes('@localNote.')})()");
      await shot(`${language}-${theme}-390-repair`);await main.ev("document.querySelector('[data-local-note=confirm]').scrollIntoView({block:'center'});void 0");await shot(`${language}-${theme}-390-repair-confirm`);await closeTop('.ai-local-note-review');
    }
  }
  await main.send('Emulation.clearDeviceMetricsOverride'); await main.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await phase('split-refusal'); await main.ev("(async()=>{window.split=app.workspace.getLeaf('split');await split.openFile(app.vault.getFileByPath('Editor.md'));})()");
  await openTag('Editor'); await pass('Affected real split editor blocks planning',"!!document.querySelector('.ai-local-note [role=alert]')&&!document.querySelector('[data-local-note=review]')"); await shot('split-refusal'); await closeTop('.ai-local-note'); await main.ev('split.detach();void 0');
  await phase('popout'); await main.ev("(async()=>{window.pop=app.workspace.getLeaf('window');await pop.setViewState({type:'veynrel-health',active:true});})()"); await wait('pop.view.containerEl.ownerDocument!==document');
  let target; for(let i=0;i<100;i++){target=(await(await fetch(`${endpoint}/json/list`)).json()).find(t=>t.type==='page'&&t.id!==main.id);if(target)break;await pause(50);} assert(target);
  const home=main;main=await connection(target);await focus(); await main.ev("window.hv=app.workspace.getLeavesOfType('veynrel-health').find(l=>l.view.containerEl.ownerDocument===document).view;void 0");
  await openTag(); await pass('Real popout owns the local action and focus',"!!document.querySelector('.ai-local-note')&&document.hasFocus()");await shot('popout-tag');await closeTop('.ai-local-note');main=home;await main.ev('pop.detach();void 0');await focus();
  await pass('Focus returns with reduced motion',"document.hasFocus()&&matchMedia('(prefers-reduced-motion: reduce)').matches");
  await phase('bom'); await main.ev("plugin.openLocalNoteAction('Encoding.md','add_inline_tag');void 0");await wait("!!document.querySelector('.ai-local-note [role=alert]')");await pass('BOM source refuses before Review/journaling',"!document.querySelector('[data-local-note=review]')");await closeTop('.ai-local-note');
  report.history=await main.ev('plugin.safeApply.localNote.history()');assert.equal(report.history.length,2);assert(report.history.every(r=>r.state==='undone'&&!r.damaged));
  report.io=await main.ev('structuredClone(io)'); assert.equal(await main.ev('JSON.stringify({...plugin.settings,language:null})'),report.settingsBefore);delete report.settingsBefore;
  assert.deepEqual(hashes(),initialHashes); report.finalHashes=hashes();report.modelRequests=modelRequests;assert.equal(modelRequests.length,0);assert.equal(report.exceptions.length,0);
  for(const phase of ['tag-apply','tag-undo','repair-apply','repair-undo'])assert.equal(report.io.writes.filter(e=>e.phase===phase).length,1);
  await phase('restart');const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exited;for(const c of connections)c.socket.close();child=launchObsidian(root);await attach();
  const restarted=await main.ev('plugin.safeApply.localNote.history()');assert.equal(restarted.length,2);assert(restarted.every(r=>r.state==='undone'));assert.deepEqual(hashes(),initialHashes);report.restartIo=await main.ev('structuredClone(io)');assert.equal(report.restartIo.writes.length,0);assert.equal(modelRequests.length,0);
  assert.equal(report.exceptions.length,0);report.checks.push('Obsidian restart reads both completed journals without writes; exact originals remain');report.status='PASS';
} catch(error) {
  report.status='FAIL';report.error=String(error.stack??error);process.exitCode=1;
  try{if(main){report.diagnostic=await main.ev('({io:window.io,active:document.activeElement?.outerHTML,modals:[...document.querySelectorAll(".modal")].map(e=>e.outerHTML)})');await shot('failure');}await stopVideo();}catch(e){report.captureError=String(e);}
} finally {
  fs.writeFileSync(`${root}/report.json`,JSON.stringify(report,null,2)+'\n');for(const c of connections)c.socket.close();
  if(child.exitCode===null&&child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),3000);await exited;clearTimeout(timer);}
  await new Promise(resolve=>server.close(resolve));console.log(JSON.stringify({root,status:report.status,checks:report.checks.length,exceptions:report.exceptions.length,error:report.error}));
}
