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
const originals = {};
for (const [name, text] of Object.entries(originals)) fs.writeFileSync(`${vault}/${name}`, text);
fs.writeFileSync(`${vault}/.obsidian/community-plugins.json`, '["ai-knowledge-hub"]');
fs.writeFileSync(`${vault}/.obsidian/app.json`, '{"checkForUpdates":false}');
fs.writeFileSync(`${root}/profile/obsidian.json`, JSON.stringify({ updateDisabled: true, vaults: { smoke: { path: vault, open: true, ts: Date.now() } } }));
const modelRequests=[];
const server=createServer((req,res)=>{modelRequests.push({method:req.method,url:req.url});res.writeHead(503);res.end('Local audit must not request a model');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
fs.writeFileSync(`${pluginDir}/data.json`, JSON.stringify({ language: 'en', apiKey: '', provider: 'ollama', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'unused', semanticAutoSyncSuspended: true, semantic: { enabled: false }, decisions: { enabled: false }, companion: { enabled: false }, health: {} }));
const sha = value => createHash('sha256').update(value).digest('hex');
const report = { scenario: 'r04-organization-native-v1', checks: [], exceptions: [], consoleErrors: [], actions: [], screenshots: [], assets: {}, externalRequests: [], recording: null };
report.harnessHashes = Object.fromEntries(['r04-organization-native.mjs','native/session.mjs','native/run.py'].map(name=>[name,sha(fs.readFileSync(new URL(name,import.meta.url)))]));
for (const name of ['main.js', 'styles.css', 'manifest.json']) { const bytes = fs.readFileSync(`${build}/${name}`); fs.writeFileSync(`${pluginDir}/${name}`, bytes); report.assets[name] = sha(bytes); }
const pause = ms => new Promise(r => setTimeout(r, ms));
let child = launchObsidian(root); const connections = [], frames = [];
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
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') report.consoleErrors.push(m.params);
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
  await main.ev(`window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.io={reads:[],writes:[],creates:[],metadata:0,enumerations:0,models:0,phase:'startup'};
    for(const name of ['read','cachedRead','modify','process','create']) {const original=app.vault[name].bind(app.vault);app.vault[name]=(...args)=>{const path=typeof args[0]==='string'?args[0]:args[0]?.path;
      io[name==='read'||name==='cachedRead'?'reads':name==='create'?'creates':'writes'].push({path,phase:io.phase});return original(...args);};}
    const enumerate=app.vault.getMarkdownFiles.bind(app.vault);app.vault.getMarkdownFiles=(...args)=>{io.enumerations++;return enumerate(...args);};
    const cache=app.metadataCache.getFileCache.bind(app.metadataCache);app.metadataCache.getFileCache=file=>{io.metadata++;if(window.missingCache===file.path)return null;return cache(file);};
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
async function fill(selector, value) {
  await reveal(selector);await main.ev(`document.querySelector(${JSON.stringify(selector)}).focus();void 0`);
  await key('a','KeyA',65,undefined,2); await main.send('Input.insertText',{text:value});
  assert.equal(await main.ev(`document.querySelector(${JSON.stringify(selector)}).value`),value);if(recording)await pause(400);
}
async function openAudit() {
  await main.ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health');void 0");
  await wait("!!document.querySelector('[data-health-action=organization-audit]')"); await pause(200); await activate('[data-health-action=organization-audit]');
  await wait("!!document.querySelector('.ai-taxonomy')"); await main.ev('window.audit=[...plugin.taxonomyModals].at(-1);void 0');
}
async function scan(path='') {
  await fill('[data-org-field=scope]',path);
  await main.ev(`io.phase=${JSON.stringify('explicit-audit:') }+${JSON.stringify(path||'whole-vault')};void 0`);
  const counters=()=>main.ev('({reads:io.reads.length,writes:io.writes.length,creates:io.creates.length,metadata:io.metadata,enumerations:io.enumerations})');
  const before=await counters(); await activate('[data-taxonomy-action=analyze]');
  await wait("!!audit.session.inventory && audit.session.stage!=='scanning'");
  const result=await main.ev('audit.session.inventory'),after=await counters();report.auditCounters??=[];report.auditCounters.push({scope:path||'whole-vault',state:result.organization.state,before,after,delta:Object.fromEntries(Object.keys(before).map(key=>[key,after[key]-before[key]])),modelRequests:modelRequests.length});report.snapshots??=[];report.snapshots.push(result);return result;
}
async function closeAudit() { await key('Escape','Escape',27); await wait("!document.querySelector('.ai-taxonomy')"); }
const hashes=()=>Object.fromEntries(Object.keys(originals).map(path=>[path,sha(fs.readFileSync(`${vault}/${path}`))]));
const journals=()=>{const paths=[];function visit(dir){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())visit(p);else paths.push(p);}}visit(`${pluginDir}/studio`);return Object.fromEntries(paths.map(p=>[p.slice(pluginDir.length),sha(fs.readFileSync(p))]));};
function seed(path,content){fs.mkdirSync(`${vault}/${path.slice(0,Math.max(0,path.lastIndexOf('/')))}`,{recursive:true});fs.writeFileSync(`${vault}/${path}`,content);originals[path]=content;}
try {
  await attach(); await pause(1000); await main.ev("io.phase='passive';void 0"); const passiveBefore=await main.ev('structuredClone(io)');
  await openAudit(); await pause(200);
  report.passive={before:passiveBefore,after:await main.ev('structuredClone(io)'),modelRequests:modelRequests.length};assert.equal(modelRequests.length,0);
  await pass('Fresh no-key/no-profile open performs no metadata scan, note read, write or model request', "!plugin.settings.apiKey&&!plugin.settings.tagTaxonomyProfile&&!audit.session.inventory&&io.metadata===0&&io.reads.length===0&&io.writes.length===0&&io.creates.length===0&&io.models===0");
  await main.ev("io.phase='empty-audit';void 0"); const empty=await scan();assert.equal(empty.total,0);assert.equal(empty.organization.state,'complete');
  await pass('A: truly empty vault invents no structure or recommendations', "document.querySelectorAll('[data-org-suggestion]').length===0");await shot('empty-en-dark');await closeAudit();
  await main.ev("io.phase='fixture-ingest';void 0");
  for(const [path,content] of Object.entries({
    'Knowledge/A.md':'---\ntype: idea\ntags: [topic/native, role/theory]\n---\n# A\n\nA useful local idea. #flashcards/study\n',
    'Knowledge/Sub/B.md':'---\ntype: idea\ntags: [topic/native, role/theory]\n---\n# B\n\nAnother idea.\n',
    'Knowledge/C.md':'---\ntype: idea\ntags: [topic/native, role/theory]\n---\n# C\n\nA third idea.\n',
    'KnowledgeElse/Neighbor.md':'# Neighbor\n\n#topic/different\n',
    'NoTags/Diary.md':'# Diary\n\nA useful diary without taxonomy.\n',
    'NoTags/!Odd.md':'# Deliberate name\n\nNo universal naming convention is needed.\n',
    'NoTags/Day2.md':'# Another day\n\nKeep this journal as it is.\n',
    'Templates/Ignore.md':'# Not knowledge\n#service/template\n','Backups/Ignore.md':'# Backup\n#service/backup\n',
    'node_modules/Ignore.md':'# Dependency\n#service/dependency\n','Instructions.md':'---\nveynrel-service: instructions\n---\n# Service\n#service/instructions\n',
    'Prompts/private.md':'# Explicitly excluded prompt\n#service/prompt\n',
  }))seed(path,content);
  const definitions={version:1,profile:{version:1,categories:[{id:'file-topic',name:'File topics',purpose:'topic',multiplicity:'multiple',interpretation:'global',prefixes:['topic'],tags:[]}]},tags:[{tag:'topic/rare',state:'allowed',description:'Deliberately unused'},{tag:'role/outdated',state:'deprecated',description:'User decision'},{tag:'flashcards/private',state:'excluded',description:'Recall only'}],conventions:[{subject:'folder',value:'!My own order',description:'Deliberate naming'}]};
  const header='---\nveynrel-service: organization-registry\n---\n\n';
  seed('Rules.md',header+'# Owner definitions\n\nDo not normalize these names.\n\n```veynrel-organization\n'+JSON.stringify(definitions,null,2)+'\n```\n');
  seed('Broken.md',header+'```veynrel-organization\n{broken\n```\n');seed('Future.md',header+'```veynrel-organization\n{"version":2,"future":[]}\n```\n');
  await wait("app.vault.getMarkdownFiles().length>=15&&!!app.metadataCache.getFileCache(app.vault.getFileByPath('Knowledge/C.md'))"); await pause(300);
  const initial=hashes(), initialJournals=journals(); report.initialHashes=initial;
  await openAudit();await main.ev("io.phase='tagless-audit';void 0");const tagless=await scan('NoTags');assert.equal(tagless.processed,3);assert.equal(tagless.empty,3);assert.equal(tagless.organization.state,'complete');
  await pass('B: tagless diary/unconventional name gives folder observations without invented tags', "audit.session.inventory.tags.length===0&&document.querySelectorAll('[data-org-suggestion]').length===0");await shot('tagless-en-dark');
  await main.send('Page.startScreencast',{format:'jpeg',quality:70,maxWidth:1600,maxHeight:1000,everyNthFrame:1}); recording=true;
  await main.ev("io.phase='organized-audit';void 0");const organized=await scan('Knowledge');assert.equal(organized.processed,3);assert.equal(organized.organization.state,'complete');assert(organized.organization.sources.every(s=>s.path.startsWith('Knowledge/')));
  await pass('C: exact recursive folder scope, literal observations and at most three suggestions', "audit.session.inventory.organization.types[0].value==='idea'&&document.querySelectorAll('[data-org-suggestion]').length>0&&document.querySelectorAll('[data-org-suggestion]').length<=3");await shot('organized-en-dark');
  await main.ev("io.phase='explicit-example';void 0");await activate('[data-org-action=source]');await wait("app.workspace.getActiveFile()?.path.startsWith('Knowledge/')");report.checks.push('Explicit example action opens a real source note without modifying it');
  await main.ev("io.phase='rules';void 0");
  const firstId=await main.ev("document.querySelector('[data-org-suggestion]').dataset.orgSuggestion");await activate('[data-org-action=dismiss]');await wait(`plugin.settings.organizationAudit?.dismissed.includes(${JSON.stringify(firstId)})`);
  await scan('Knowledge');await pass('Leave as is persists across unchanged rescans without changing rules', `!document.querySelector('[data-org-suggestion="${firstId}"]')&&!plugin.settings.tagTaxonomyProfile`);
  await activate('[data-org-action=draft-rule]');await activate('[data-taxonomy-action=review]');
  await pass('Draft rule needs separate review/save, with no prior settings profile', '!plugin.settings.tagTaxonomyProfile');await shot('rule-review');await activate('[data-taxonomy-action=save]');await wait("audit.session.stage==='saved'");
  const profile=await main.ev('structuredClone(plugin.settings.tagTaxonomyProfile)');report.confirmedProfile=profile;assert(profile.categories.length>0);
  await scan('Knowledge');assert.deepEqual(await main.ev('plugin.settings.tagTaxonomyProfile'),profile);report.checks.push('D: explicit profile save survives a new audit without rewriting rules');
  await fill('[data-org-field=registry-path]','Created rules.md');await activate('[data-org-action=registry-create]');await wait('!!audit.rulesView.review');
  assert(!fs.existsSync(`${vault}/Created rules.md`));await shot('registry-create-preview');await activate('[data-org-action=registry-back]');assert(!fs.existsSync(`${vault}/Created rules.md`));
  await activate('[data-org-action=registry-create]');await wait('!!audit.rulesView.review');await activate('[data-org-action=registry-confirm]');await wait("plugin.getOrganizationRegistry().state==='created'&&!audit.rulesView.busy");
  const created=fs.readFileSync(`${vault}/Created rules.md`,'utf8');report.createdRegistrySha256=sha(created);assert(created.includes(profile.categories[0].name));
  await pass('Registry creation is confirmed, byte-preserving and does not silently connect', 'plugin.getOrganizationRegistry().path===null');await shot('registry-created');await stopVideo();
  for(const [path,state] of [['Missing.md','missing'],['Broken.md','invalid'],['Future.md','unsupported']]) {
    await fill('[data-org-field=registry-path]',path);await activate('[data-org-action=registry-connect]');await wait(`plugin.getOrganizationRegistry().state==='${state}'&&!audit.rulesView.busy`);
    await shot('registry-'+state);report.checks.push('E: registry '+state+' has a distinct visible failure, without overwrite');
  }
  await fill('[data-org-field=registry-path]','Rules.md');await activate('[data-org-action=registry-connect]');await wait('!!audit.rulesView.review');
  fs.writeFileSync(`${vault}/Rules.md`,originals['Rules.md']+'\nConcurrent owner comment\n');await pause(250);await activate('[data-org-action=registry-confirm]');await wait("!audit.rulesView.busy&&plugin.getOrganizationRegistry().state==='changed'");
  assert.equal(await main.ev('plugin.getOrganizationRegistry().path'),null);report.checks.push('E: concurrent registry edit rejects confirmation and preserves newer Markdown');await shot('registry-conflict');
  fs.writeFileSync(`${vault}/Rules.md`,originals['Rules.md']);await pause(300);await activate('[data-org-action=registry-connect]');await wait('!!audit.rulesView.review');await activate('[data-org-action=registry-confirm]');await wait("plugin.getOrganizationRegistry().state==='ready'&&!audit.rulesView.busy");
  assert.deepEqual(await main.ev('plugin.getOrganizationRegistry().definitions'),definitions);assert.deepEqual(await main.ev('plugin.settings.tagTaxonomyProfile'),profile);
  const linked=await scan('Knowledge');assert.equal(linked.organization.state,'complete');
  await pass('E: selected file is the sole active source; allowed unused tags survive scanning', "plugin.getTaxonomyProfilePort().get().categories[0].name==='File topics'&&document.querySelector('.ai-taxonomy').textContent.includes('topic/rare')&&document.querySelector('.ai-taxonomy').textContent.includes('allowed; not observed')");await shot('registry-active-unused-tags');
  await fill('[data-taxonomy-focus=exclusions]','Prompts');const global=await scan('');assert(!global.tags.some(t=>t.tag.startsWith('service/')));assert(global.excluded>=7);assert(!global.organization.sources.some(s=>s.path==='Rules.md'||s.path==='Created rules.md'));report.checks.push('H: default, explicit, marked-service and linked-registry exclusions prevent knowledge contamination');
  await main.ev("window.missingCache='Knowledge/A.md';io.phase='synthetic-missing-cache';void 0");const partial=await scan('Knowledge');assert.equal(partial.unavailable,1);assert.equal(partial.organization.state,'partial');assert.equal(await main.ev("document.querySelectorAll('[data-org-suggestion]').length"),0);report.faultInjection='One native MetadataCache lookup deliberately returned null; no DOM replacement';await shot('partial-cache');
  await main.ev('window.missingCache=undefined;void 0');await scan('Knowledge');fs.writeFileSync(`${vault}/Knowledge/A.md`,originals['Knowledge/A.md']+'\nExternal edit\n');await wait("audit.session.inventory.organization.state==='stale'");report.checks.push('G: source modify invalidates the snapshot without an automatic rescan');await shot('stale-source');
  fs.writeFileSync(`${vault}/Knowledge/A.md`,originals['Knowledge/A.md']);await pause(300);assert.equal((await scan('Knowledge')).organization.state,'complete');
  fs.renameSync(`${vault}/Knowledge`,`${vault}/Renamed`);await wait("audit.session.inventory.organization.state==='stale'&&!app.vault.getFolderByPath('Knowledge')");assert.equal((await scan('Knowledge')).organization.state,'failed');await pass('Missing scope is not described as an empty vault',"!document.querySelector('.ai-taxonomy').textContent.includes('This area has no Markdown notes')");await shot('missing-scope');
  fs.renameSync(`${vault}/Renamed`,`${vault}/Knowledge`);await wait("!!app.vault.getFileByPath('Knowledge/A.md')&&!!app.metadataCache.getFileCache(app.vault.getFileByPath('Knowledge/A.md'))");await pause(300);assert.equal((await scan('Knowledge')).organization.state,'complete');report.checks.push('Renamed selected folder becomes stale/failed, never a complete empty result; explicit rescan recovers');
  await closeAudit();
  await main.ev("io.phase='large-fixture-ingest';void 0");
  for(let i=0;i<1000;i++)seed('Large/n'+String(i).padStart(4,'0')+'.md','---\ntype: note\ntags: [topic/large]\n---\n# Synthetic '+i+'\n');
  await wait("app.vault.getMarkdownFiles().filter(f=>f.path.startsWith('Large/')).length===1000&&!!app.metadataCache.getFileCache(app.vault.getFileByPath('Large/n0999.md'))",main,600);await pause(500);await openAudit();
  await fill('[data-org-field=scope]','Large');await activate('[data-taxonomy-action=analyze]');
  await main.ev("document.querySelector('[data-taxonomy-action=cancel]').focus();void 0");await key('Enter','Enter',13,'\r');await wait("audit.session.stage!=='scanning'&&!!audit.session.inventory");
  assert.equal(await main.ev('audit.session.inventory.organization.state'),'cancelled');report.checks.push('H: native Cancel leaves a visibly incomplete result');await shot('cancelled');
  const start=performance.now(),heapBefore=await main.ev('performance.memory?.usedJSHeapSize');const large=await scan('Large');report.large={notes:large.processed,milliseconds:performance.now()-start,heapBefore,heapAfter:await main.ev('performance.memory?.usedJSHeapSize')};assert.equal(large.processed,1000);assert.equal(large.organization.state,'complete');report.checks.push('F: 1000-note real MetadataCache audit completes with bounded examples');await shot('large-1000');
  await closeAudit();
  for(const language of ['en','ru']) {
    await main.ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await main.ev(`{const s=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));s.value='${language}';s.dispatchEvent(new Event('change'));}void 0`);await main.ev('plugin.settingsSave');await main.ev('app.setting.close();void 0');await focus();
    for(const theme of ['dark','light'])for(const width of [1100,390]) {
      await main.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await main.ev(`app.changeTheme('${theme==='light'?'moonstone':'obsidian'}');void 0`);
      await openAudit();await scan('Knowledge');await pause(150);
      await pass(`${language}/${theme}/${width}: native organization UI, theme and no horizontal overflow`, `(()=>{const e=document.querySelector('.ai-taxonomy');return e.scrollWidth<=e.clientWidth+1&&document.body.classList.contains('theme-${theme}')&&document.querySelector('.modal-title').getBoundingClientRect().top>=document.querySelector('.ai-taxonomy-modal').getBoundingClientRect().top&&document.querySelector('.modal-title').textContent===${JSON.stringify(language==='ru'?'Аудит организации':'Organization audit')};})()`);
      await shot(`${language}-${theme}-${width}`);await key('Tab','Tab',9,'\t');await pass(`${language}/${theme}/${width}: Tab stays in the modal`,"document.activeElement.closest('.ai-taxonomy-modal')!==null");await closeAudit();
    }
  }
  await main.send('Emulation.clearDeviceMetricsOverride');await main.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await openAudit();await scan('Knowledge');await pass('Reduced-motion setting keeps the audit usable', "matchMedia('(prefers-reduced-motion: reduce)').matches&&audit.session.inventory.organization.state==='complete'");await shot('reduced-motion');await closeAudit();
  await main.ev("window.split=app.workspace.getLeaf('split');split.setViewState({type:'veynrel-health',active:true})");await pass('Real split mounts Workspace in the same document', "split.view.containerEl.ownerDocument===document");await main.ev('split.detach();void 0');
  await main.ev("window.pop=app.workspace.getLeaf('window');pop.setViewState({type:'veynrel-health',active:true})");await wait('pop.view.containerEl.ownerDocument!==document');
  let popTarget;for(let i=0;i<100;i++){popTarget=(await(await fetch(`${endpoint}/json/list`)).json()).find(t=>t.type==='page'&&t.id!==main.id);if(popTarget)break;await pause(50);}assert(popTarget);
  const home=main;main=await connection(popTarget);await focus();await wait("!!document.querySelector('[data-health-action=organization-audit]')");await activate('[data-health-action=organization-audit]');await wait("!!document.querySelector('.ai-taxonomy')");await pass('R04 modal opens in the focused real popout', "document.hasFocus()&&window.electronWindow.isFocused()&&!!document.querySelector('.ai-taxonomy')");await shot('popout-organization');await closeAudit();
  main=home;await focus();await pass('Focus returns to the real main window', 'document.hasFocus()');await main.ev('pop.detach();void 0');
  report.beforeRestartIO=await main.ev('structuredClone(io)');
  for(const c of connections)c.socket.close();
  {const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exited;}
  child=launchObsidian(root);await attach();
  assert.deepEqual(await main.ev('plugin.settings.tagTaxonomyProfile'),profile);
  await pass('Restart preserves selected registry and dormant profile without hidden file reads or fallback',"plugin.settings.organizationAudit.registryPath==='Rules.md'&&plugin.getTaxonomyProfilePort().get()===null&&io.reads.length===0");
  await openAudit();await activate('[data-org-action=registry-connect]');await wait('!!audit.rulesView.review');await activate('[data-org-action=registry-confirm]');await wait("plugin.getOrganizationRegistry().state==='ready'&&!audit.rulesView.busy");report.checks.push('Selected registry is explicitly revalidated after restart');
  await activate('[data-org-action=registry-disconnect]');await wait('!!audit.rulesView.review');await activate('[data-org-action=registry-confirm]');await wait("plugin.getOrganizationRegistry().path===null&&!audit.rulesView.busy");assert.deepEqual(await main.ev('plugin.getTaxonomyProfilePort().get()'),profile);report.checks.push('Explicit disconnect reactivates the untouched legacy profile and leaves both registry files intact');await closeAudit();
  report.afterRestartIO=await main.ev('structuredClone(io)');report.io={...report.afterRestartIO};for(const name of ['reads','writes','creates'])report.io[name]=[...report.beforeRestartIO[name],...report.afterRestartIO[name]];for(const name of ['metadata','enumerations'])report.io[name]+=report.beforeRestartIO[name];report.io.models=modelRequests.length;report.modelRequests=modelRequests;assert.equal(report.io.models,0);assert.equal(report.io.writes.length,0);assert.deepEqual(report.io.creates.map(c=>c.path),['Created rules.md']);assert.equal(report.exceptions.length,0);
  report.finalHashes=hashes();assert.deepEqual(report.finalHashes,Object.fromEntries(Object.entries(originals).map(([p,c])=>[p,sha(c)])));assert.deepEqual(journals(),initialJournals);report.journals={before:initialJournals,after:journals()};
  report.checks.push('All original Markdown byte-identical; journals and confirmed profile preserved; only reviewed registry created; zero model requests');
  report.status='PASS';
} catch(error) { report.status='FAIL';report.error=String(error.stack??error);process.exitCode=1;try {if(main){report.diagnostic=await main.ev('({io,keyTrace,active:document.activeElement?.outerHTML,modals:[...plugin.taxonomyModals].map(m=>({openState:m.openState,opened:m.opened,connected:m.modalEl.isConnected,containerConnected:m.containerEl.isConnected,owner:m.modalEl.ownerDocument===document,title:m.titleEl.textContent,content:m.contentEl.outerHTML})),inventory:window.audit?.session?.inventory,stage:window.audit?.session?.stage,ui:document.querySelector(".ai-taxonomy")?.textContent})');await shot('failure');}await stopVideo();}catch(e){report.captureError=String(e);} }
finally {
  fs.writeFileSync(`${root}/report.json`,JSON.stringify(report,null,2)+'\n');for(const c of connections)c.socket.close();
  if(child.exitCode===null&&child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),3000);await exited;clearTimeout(timer);}
  await new Promise(resolve=>server.close(resolve));
  console.log(JSON.stringify({root,status:report.status,checks:report.checks.length,exceptions:report.exceptions.length,error:report.error}));
}
