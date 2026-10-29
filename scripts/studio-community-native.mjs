// Synthetic-only native acceptance. Build first, then:
// node scripts/studio-native.mjs /tmp/veynrel-community-native-<unique-name>
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const root = process.argv[2];
assert(root?.startsWith('/tmp/veynrel-community-native-') && !root.includes('..') && !fs.existsSync(root));
const vault = `${root}/vault`, pluginDir = `${vault}/.obsidian/plugins/ai-knowledge-hub`;
fs.mkdirSync(pluginDir, { recursive: true }); fs.mkdirSync(`${root}/profile`, { recursive: true });
const fixture = (name, synthetic = false) => fs.readFileSync(`${ROOT}/docs/studio-fixtures/${name}${synthetic ? '.synthetic' : ''}.md`, 'utf8');
const originals = {
  'Formatting.md': fixture('formatting'),
  'Training.md': fixture('training'),
  'Nutrition.md': fixture('nutrition'),
  'Batch/a/same.md': 'Saved facts in A.\n', 'Batch/b/same.md': 'Saved facts in B.\n',
  'Untouched.md': '# Never selected\nThis note must not be read or changed by Studio.\n',
};
for (const [path, text] of Object.entries(originals)) { fs.mkdirSync(`${vault}/${path.substring(0, path.lastIndexOf('/') + 1)}`, { recursive: true }); fs.writeFileSync(`${vault}/${path}`, text); }
const requests = [];
let providerMode = 'normal', releaseProvider;
const server = createServer(async (req, res) => {
  let raw = ''; for await (const part of req) raw += part;
  assert.equal(req.url, '/v1/chat/completions'); requests.push(raw);
  const body = JSON.parse(raw), system = body.messages[0].content, markdown = JSON.parse(body.messages[1].content).markdown;
  if (providerMode === 'defer') await new Promise(resolve => { releaseProvider = resolve; });
  const content = system.includes('Structure the workout') ? fixture('training', true) :
    system.includes('Structure the food') ? fixture('nutrition', true) : markdown === originals['Formatting.md'] ? fixture('formatting', true) : `# Organized\n\n${markdown}`;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: providerMode === 'length' ? 'length' : 'stop' }] }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
fs.writeFileSync(`${pluginDir}/data.json`, JSON.stringify({ language: 'en', provider: 'ollama', model: 'studio-loopback', baseUrl: `http://127.0.0.1:${port}/v1`, apiKey: '',
  semanticAutoSyncSuspended: true, semantic: { enabled: false }, decisions: { enabled: false }, companion: { enabled: false }, health: { onboardingCompleted: true } }));
fs.writeFileSync(`${vault}/.obsidian/community-plugins.json`, '["ai-knowledge-hub"]');
fs.writeFileSync(`${vault}/.obsidian/app.json`, '{"checkForUpdates":false}');
fs.writeFileSync(`${root}/profile/obsidian.json`, JSON.stringify({ updateDisabled: true, vaults: { studio: { path: vault, ts: Date.now(), open: true } } }));
const sha = raw => createHash('sha256').update(raw).digest('hex');
const artifacts = {};
for (const name of ['main.js', 'styles.css', 'manifest.json']) { fs.copyFileSync(`${ROOT}/${name}`, `${pluginDir}/${name}`); artifacts[name] = sha(fs.readFileSync(`${pluginDir}/${name}`)); }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const start = () => spawn('/usr/bin/electron43', ['/usr/lib/obsidian/app.asar', `--user-data-dir=${root}/profile`, '--remote-debugging-port=9290', '--disable-gpu', '--ozone-platform=x11'], { stdio: ['ignore', 'ignore', fs.openSync(`${root}/electron.log`, 'a')] });
let child, socket, sequence = 0;
const pending = new Map(), checks = [], screenshots = [];
const report = { checks, artifacts, screenshots, fixture: 'Six synthetic Markdown files; existing callOpenRouter -> requestUrl -> loopback HTTP. Actual ItemView, registry, runner, journal and Vault.process.',
  beforeApply: [], exceptions: [],
  limits: 'Linux desktop, built-in themes. Synthetic responses verify transport and workflow, not model quality. No paid/live provider, personal vault, physical mobile, screen reader or external cross-process races.' };
const cdp = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++sequence, { resolve, reject }); socket.send(JSON.stringify({ id: sequence, method, params })); });
const ev = async expression => { const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
const wait = async expression => { for (let i = 0; i < 240; i++) { if (await ev(expression)) return; await pause(50); } throw Error(`Timeout: ${expression}; ${await ev('document.body.innerText.slice(-2000)')}`); };
const pass = async (name, expr) => { assert(await ev(expr), name); checks.push(name); console.log(name); };
const click = async (action, modal = false) => {
  await cdp('Page.bringToFront'); await wait('document.hasFocus()');
  const selector = action.startsWith("community:") ? `.veynrel-community [data-community-action=${JSON.stringify(action.slice(10))}]` : `${modal ? '.veynrel-studio-dialog' : '.veynrel-studio'} [data-studio-action=${JSON.stringify(action)}]`;
  await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  // Use the native pointer/focus path, including off-screen controls and modal activation.
  const point = await ev(`(async()=>{const e=document.querySelector(${JSON.stringify(selector)});for(let a=e.parentElement;a;a=a.parentElement)if(a.tagName==='DETAILS')a.open=true;e.scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
  report.lastPointer = { action, point, hit: await ev(`document.elementFromPoint(${point.x},${point.y})?.outerHTML.slice(0,500)`) };
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, button: 'left', clickCount: 1, ...point });
};
const hashes = () => Object.fromEntries(Object.keys(originals).map(path => [path, sha(fs.readFileSync(`${vault}/${path}`))]));
const initialHashes = hashes();
async function connect() {
  let page; for (let i = 0; i < 200; i++) { try { page = (await (await fetch('http://127.0.0.1:9290/json/list')).json()).find(p => p.url.startsWith('app://obsidian.md/')); } catch {} if (page) break; await pause(100); }
  assert(page, 'native ready'); socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') report.exceptions.push(m.params); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (p) m.error ? p.reject(m.error) : p.resolve(m.result); } };
  await cdp('Runtime.enable');
  await wait('!!window.app?.workspace?.layoutReady'); assert.equal(await ev('app.vault.adapter.basePath'), vault);
  await wait("!!app.plugins.plugins['ai-knowledge-hub']?.studio || !!document.querySelector('.mod-trust-folder')");
  if (await ev("!!document.querySelector('.mod-trust-folder')")) await ev("[...document.querySelectorAll('.mod-trust-folder button')].find(e=>/Trust author/.test(e.textContent)).click();void 0");
  await wait("!!app.plugins.plugins['ai-knowledge-hub']?.studio && !!app.commands.commands['ai-knowledge-hub:veynrel-open-studio']");
  await ev("window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.studio=plugin.studio;window.io={reads:[],writes:[],browserRequests:0};const studioNativeRead=app.vault.read.bind(app.vault);app.vault.read=async f=>{io.reads.push(f.path);return studioNativeRead(f)};const studioNativeWrite=app.vault.process.bind(app.vault);app.vault.process=async(f,fn)=>{io.writes.push(f.path);return studioNativeWrite(f,fn)};window.nativeFetch=window.fetch.bind(window);window.productionCommunityTransport=studio.community.transport;window.fetch=(url,opts)=>{io.browserRequests++;if(!window.allowPublicCommunity||!String(url).startsWith('https://zinverno.github.io/veynrel-recipes/catalog/v1/'))throw Error('blocked noncatalog fetch');return nativeFetch(url,opts)};XMLHttpRequest.prototype.send=function(){io.browserRequests++;throw Error('blocked synthetic XHR')};void 0");
  await ev(`studio.community.transport={get:async(url,max)=>{if(!url.startsWith('https://zinverno.github.io/veynrel-recipes/catalog/v1/'))throw Error('URL');const response=await nativeFetch('http://127.0.0.1:${catalogPort}/'+url.split('/catalog/v1/')[1],{redirect:'error',credentials:'omit'});if(response.status!==200)throw Error('offline');const raw=await response.text();if(new TextEncoder().encode(raw).length>max)throw Error('size');return raw}};void 0`);
  await cdp('Page.bringToFront');
}
async function restart() {
  socket.close(); const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await exited; child = start(); await connect();
}
async function open() { await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-studio');void 0"); await wait("!!document.querySelector('.veynrel-studio [data-studio-action=new]')"); }
async function prepare(recipe, paths, folder = false) {
  await ev("app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('veynrel-studio')[0],{focus:true});void 0");
  await click('library'); await click(`recipe-${recipe}`); await click('choose-notes');
  if (folder) {
    await ev(`{const selects=document.querySelectorAll('.veynrel-studio-body select');selects[0].value='folder';selects[0].dispatchEvent(new Event('change'));selects[1].value=${JSON.stringify(paths)};selects[1].dispatchEvent(new Event('change'));}void 0`);
  } else {
    await ev(`{for(const i of document.querySelectorAll('.veynrel-studio-picker input:checked'))i.click();for(const path of ${JSON.stringify(paths)}){const label=[...document.querySelectorAll('.veynrel-studio-picker label')].find(e=>e.textContent===path);if(!label)throw Error('missing path '+path);label.querySelector('input').click();}}void 0`);
  }
  const count = requests.length; await click('prepare'); await wait("studio.runner.state==='prepared'&&!studio.runner.running");
  assert.equal(requests.length, count, 'preparation sends nothing');
  return ev('studio.runner.prepared.requests.map(r=>r.body)');
}
async function generate(expected) {
  const count = requests.length; await click('generate'); await wait("!studio.runner.running&&['review','failed','cancelled'].includes(studio.runner.state)");
  assert.deepEqual(requests.slice(count), expected, 'request bodies exactly match consent');
}
async function sourceMode() {
  await ev("{const e=document.querySelector('[data-studio-destination]');e.value='source';e.dispatchEvent(new Event('change'));}void 0");
}
async function confirmSourceWrite() {
  await click('review-apply');
  await wait("!studio.operations.busy&&(!!document.querySelector('.veynrel-studio-dialog')||!!app.workspace.getLeavesOfType('veynrel-studio').find(l=>l.view.route==='workflow')?.view.errorEl.textContent)");
  if (!await ev("!!document.querySelector('.veynrel-studio-dialog')")) return;
  await ev("document.querySelector('[data-studio-ack]')?.click();void 0");
  await click('confirm-apply', true);
}
async function apply(paths) {
  await sourceMode();
  await ev("app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('veynrel-studio')[0],{focus:true});void 0");
  await ev(`{for(const path of ${JSON.stringify(paths)}){const input=document.querySelector('[data-studio-select='+CSS.escape(path)+']');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));}}void 0`);
  report.lastApplySelection = await ev("app.workspace.getLeavesOfType('veynrel-studio').map(l=>({route:l.view.route,selected:[...l.view.selectedRows],review:l.view.reviewId,dialogs:l.view.dialogs.size}))");
  await confirmSourceWrite(); await wait("!studio.runner.running&&!document.querySelector('.veynrel-studio-dialog')");
}
async function undoAll() {
  await click('history'); await wait("!!document.querySelector('[data-studio-action=undo]')");
  while (await ev("!!document.querySelector('[data-studio-action=undo]')")) {
    await click('undo'); await click('confirm-undo', true); await wait("!document.querySelector('.veynrel-studio-dialog')&&!studio.writer.busy");
    await wait("!document.querySelector('.veynrel-studio-body')?.textContent.includes('Checking…')");
  }
}
async function shot(name) {
  fs.writeFileSync(`${root}/${name}.png`, Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64')); screenshots.push(`${name}.png`);
}
async function locale(lang) {
  await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
  await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${lang}';e.dispatchEvent(new Event('change'));}void 0`);
  await ev('plugin.settingsSave'); await ev('app.setting.close();void 0'); await cdp('Page.bringToFront');
  await ev("for(const leaf of app.workspace.getLeavesOfType('veynrel-studio'))leaf.detach();void 0"); await open();
}

const catalogRoot = process.argv[3];
assert(catalogRoot && fs.existsSync(`${catalogRoot}/catalog/v1/index.json`));
const originalIndex = JSON.parse(fs.readFileSync(`${catalogRoot}/catalog/v1/index.json`, 'utf8'));
const first = originalIndex.entries.find(e => e.id === 'lecture-outline');
const rawRecipe = fs.readFileSync(`${catalogRoot}/catalog/v1/recipes/lecture-outline/1.0.0.json`, 'utf8');
const upgrade = { ...JSON.parse(rawRecipe), version: '1.10.0', steps: [{ type: 'llm_transform', prompt: 'Organize source facts only. Literal example: <img src=x onerror="window.attack=1">' }], constraints: ['Preserve supplied facts.'], output: { format: 'markdown', action: 'append' } };
const upgradeRaw = JSON.stringify(upgrade);
const upgradeEntry = { ...first, version: '1.10.0', operations: ['append'], sha256: sha(upgradeRaw), recipeUrl: first.recipeUrl.replace('1.0.0.json','1.10.0.json') };
let catalogMode = 'normal'; const catalogRequests = [];
const catalogServer = createServer(async (req,res) => {
  const chunks=[]; for await(const c of req)chunks.push(c); const body=Buffer.concat(chunks).toString();
  catalogRequests.push({url:req.url,method:req.method,body}); assert.equal(req.method,'GET'); assert.equal(body,'');
  res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Content-Type','application/json');
  if(catalogMode==='offline'){res.writeHead(503);res.end('{}');return;}
  if(req.url==='/index.json'){
    res.end(catalogMode==='bad'?'broken':JSON.stringify({schemaVersion:1,entries:catalogMode==='empty'?[]:catalogMode==='update'?[...originalIndex.entries,upgradeEntry]:originalIndex.entries}));return;
  }
  if(req.url==='/recipes/lecture-outline/1.10.0.json'){res.end(upgradeRaw);return;}
  const match=/^\/recipes\/([a-z-]+)\/1\.0\.0\.json$/u.exec(req.url);
  if(match&&originalIndex.entries.some(e=>e.id===match[1]))res.end(fs.readFileSync(`${catalogRoot}/catalog/v1/recipes/${match[1]}/1.0.0.json`));
  else{res.writeHead(404);res.end('{}');}
});
await new Promise(resolve=>catalogServer.listen(0,'127.0.0.1',resolve));const catalogPort=catalogServer.address().port;
const cc = action => click('community:'+action);
const settled = async () => { await wait("!app.workspace.getLeavesOfType('veynrel-studio')[0].view.community.pending"); };
const localId = 'user.community.lecture-outline';
report.fixture = 'Isolated synthetic vault; test HTTP catalog injected via CommunityTransport, actual RecipeRegistry/Runner/Review/Apply/Undo; no personal notes or provider keys.';
try {
  child=start();await connect();await open();
  await click('community');await pass('Opening Studio and Community tab is passive',"io.reads.length===0&&io.writes.length===0&&studio.community.state==='idle'");assert.equal(catalogRequests.length,0);assert.equal(requests.length,0);
  await cc('refresh');await settled();await pass('Explicit online catalog loads eight real entries',"document.querySelectorAll('.veynrel-community-row').length===8&&studio.community.state==='ready'");
  await ev("{const e=document.querySelector('[data-community-field=search]');e.value='лекция';e.dispatchEvent(new Event('input',{bubbles:true}))}void 0");
  await pass('Client search finds Russian tags',"document.querySelectorAll('.veynrel-community-row').length===1");
  await ev("{const e=document.querySelector('[data-community-field=search]');e.value='';e.dispatchEvent(new Event('input',{bubbles:true}));const c=document.querySelector('[data-community-field=category]');c.value='work';c.dispatchEvent(new Event('change'))}void 0");
  await pass('Category filter selects two work recipes',"document.querySelectorAll('.veynrel-community-row').length===2");
  await ev("{const c=document.querySelector('[data-community-field=category]');c.value='all';c.dispatchEvent(new Event('change'))}void 0");
  await cc('inspect-lecture-outline');await settled();await shot('inspect-en-dark');
  await pass('Verified card shows full prompt, constraints, examples, source and SHA-256',"document.querySelector('.veynrel-community').textContent.includes('SHA-256')&&document.querySelector('.veynrel-community').textContent.includes('Structure a lecture')&&document.querySelector('.veynrel-community').textContent.includes('Eviction policies')");
  await cc('install');await settled();await wait("!!document.querySelector('[data-studio-action=choose-notes]')");
  await pass('Install is local user recipe, no notes/model/writes',`studio.registry.list().some(r=>r.id==='${localId}'&&r.source==='user')&&io.reads.length===0&&io.writes.length===0&&studio.runner.state==='idle'`);assert.equal(requests.length,0);assert.deepEqual(hashes(),initialHashes);
  await restart();await open();await pass('Installed recipe and origin survive a real process restart',`studio.installer.installed('lecture-outline').recipe.id==='${localId}'&&!studio.installer.installed('lecture-outline').modified&&io.reads.length===0&&io.writes.length===0`);
  await click('community');await cc('refresh');await settled();await cc('inspect-lecture-outline');await settled();await pass('Same version is Installed; repeat install does not add duplicates',"!!document.querySelector('[data-community-action=open-local]')&&studio.registry.list().filter(r=>r.source==='user').length===1");
  await cc('open-local');
  const expected=await prepare(localId,['Formatting.md']);await pass('Prepared exact request awaits explicit consent',"studio.runner.state==='prepared'&&io.writes.length===0");assert.equal(requests.length,0);
  await generate(expected);await pass('Installed Community recipe runs via existing Runner and immutable Review',"studio.runner.state==='review'&&studio.runner.review.rows[0].status==='generated'&&io.writes.length===0");await shot('community-review');
  await apply(['Formatting.md']);assert.notEqual(fs.readFileSync(`${vault}/Formatting.md`,'utf8'),originals['Formatting.md']);await undoAll();assert.deepEqual(hashes(),initialHashes);checks.push('Community Apply/Undo restores exact original hashes');
  await click('library');await click('recipe-'+localId);await click('edit');await wait("!!document.querySelector('[data-studio-field=prompt]')");
  await ev("{const e=document.querySelector('[data-studio-field=prompt]');e.value='My deliberately modified local prompt';e.dispatchEvent(new Event('input',{bubbles:true}))}void 0");await click('save-recipe',true);await wait("!document.querySelector('.veynrel-studio-dialog')");
  catalogMode='update';await click('community');await cc('refresh');await settled();await pass('Numeric update and locally modified status are visible',"document.querySelector('.veynrel-community').textContent.includes('update available')&&document.querySelector('.veynrel-community').textContent.includes('locally modified')");
  await cc('inspect-lecture-outline');await settled();await pass('Update compares instruction, constraints, format and operations',"document.querySelector('.veynrel-community').textContent.includes('1.0.0 → 1.10.0')&&document.querySelector('.veynrel-community').textContent.includes('Constraint changes')&&document.querySelector('.veynrel-community').textContent.includes('Format and operation changes')");
  await pass('Untrusted instruction remains literal with no element execution',"!window.attack&&!document.querySelector('.veynrel-community img,.veynrel-community script')");await shot('update-local-edits');
  await cc('install-copy');await settled();await pass('Explicit update keeps modified local copy and installs exact new version',"studio.installer.installed('lecture-outline').entry.version==='1.10.0'&&studio.registry.list().some(r=>r.id!=='user.community.lecture-outline'&&r.steps[0].prompt==='My deliberately modified local prompt')");
  catalogMode='offline';await restart();await open();await click('community');await cc('refresh');await settled();await pass('Offline restart uses verified stale cache',"studio.community.state==='cached'&&document.querySelector('.veynrel-community').textContent.includes('outdated')");await cc('inspect-lecture-outline');await settled();await pass('Previously downloaded recipe opens offline',"!!document.querySelector('[data-community-action=open-local]')");await shot('offline-cached');
  catalogMode='empty';await cc('refresh');await settled();await pass('Delisting does not delete installed recipes',"studio.community.state==='empty'&&studio.installer.installed('lecture-outline').entry.version==='1.10.0'");
  catalogMode='normal';await cc('refresh');await settled();
  await ev('app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();void 0');
  for(const lang of ['en','ru']){
    await locale(lang);await click('community');
    for(const theme of ['theme-dark','theme-light'])for(const width of [1200,390]){
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await ev(`document.body.removeClass('theme-dark','theme-light');document.body.addClass('${theme}');void 0`);
      await pass(`${lang}/${theme}/${width}: native Community has no horizontal overflow`,"(()=>{const e=document.querySelector('.veynrel-studio');return e.scrollWidth<=e.clientWidth+1})()");await shot(`community-${lang}-${theme}-${width}`);
      await cc('inspect-lecture-outline');await settled();
      await pass(`${lang}/${theme}/${width}: full Community card stays within panel`,"(()=>{const e=document.querySelector('.veynrel-studio');return e.scrollWidth<=e.clientWidth+1&&!!document.querySelector('[data-community-action=install]')})()");await shot(`community-card-${lang}-${theme}-${width}`);await cc('back');
    }
  }
  await locale('en');await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});await click('library');await click('recipe-'+localId);await click('publish');
  await wait("!!document.querySelector('[data-studio-action=export-publication]')");await pass('Publication form starts with empty author-created examples',"[...document.querySelectorAll('.veynrel-studio-dialog textarea')].filter(e=>!e.readOnly).every(e=>e.value==='')");
  const publicationFields={ 'Public ID (lowercase slug)':'native-submission','Author name':'Synthetic Author','Author GitHub profile URL':'https://github.com/zinverno','Tags (comma separated)':'synthetic, learning','Purpose (EN)':'Synthetic native publication test','Назначение (RU)':'Вымышленный тест публикации','Known risks and limitations (EN)':'Check output manually.','Риски и ограничения (RU)':'Проверьте результат вручную.','Fictional input (EN)':'Fictional input.','Вымышленный вход (RU)':'Вымышленный вход.','Illustrative output (EN)':'Fictional output.','Пример результата (RU)':'Вымышленный выход.'};
  await ev(`{for(const [label,value]of Object.entries(${JSON.stringify(publicationFields)})){const e=[...document.querySelectorAll('.veynrel-studio-dialog label')].find(e=>e.querySelector('span')?.textContent===label).querySelector('input,textarea');e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('.veynrel-studio-dialog input[type=checkbox]').click()}void 0`);
  const beforeExport=requests.length;await click('export-publication',true);await wait("!!document.querySelector('[data-studio-action=select-publication]')");
  report.publication=await ev("JSON.parse(document.querySelector('.veynrel-studio-dialog textarea[readonly]').value)");assert(!JSON.stringify(report.publication).includes('Never selected'));assert.equal(requests.length,beforeExport);checks.push('Explicit publication produces valid package from authored fields with no model call');await shot('publication-package');await ev("for(const d of app.workspace.getLeavesOfType('veynrel-studio')[0].view.dialogs)d.close();void 0");await click('discard-draft',true);
  if(process.env.COMMUNITY_PUBLIC==='1'){
    await ev('studio.community.transport=productionCommunityTransport;window.allowPublicCommunity=true;void 0');await click('community');await cc('refresh');await settled();await pass('Production HTTPS transport loads deployed public catalog',"studio.community.state==='ready'");
    await cc('inspect-meeting-structure');await settled();await cc('install');await settled();
    await pass('Actual public HTTPS recipe installs locally',"studio.installer.installed('meeting-structure').entry.version==='1.0.0'");
    await restart();await open();await pass('Actual public installation survives restart and needs no catalog connection to run',"studio.installer.installed('meeting-structure').entry.version==='1.0.0'&&io.browserRequests===0&&io.reads.length===0");
    const publicExpected=await prepare('user.community.meeting-structure',['Batch/a/same.md']);await generate(publicExpected);await apply(['Batch/a/same.md']);await undoAll();checks.push('Actual public recipe follows explicit consent, existing Runner, Review, Apply and Undo');
    report.publicHTTPS=true;
  }
  const cachePath=`${pluginDir}/studio/community-cache.json`;fs.writeFileSync(cachePath,'torn-cache');catalogMode='offline';await restart();await open();await click('community');await cc('refresh');await settled();await pass('Corrupt cache is discarded; installed local recipes survive',"!studio.community.catalog&&studio.community.cacheWarning&&!!studio.installer.installed('lecture-outline')");
  const origins=fs.readdirSync(`${pluginDir}/studio/community-installs`).filter(n=>n.endsWith('.json'));fs.writeFileSync(`${pluginDir}/studio/community-installs/${origins[0]}`,'torn-origin');await restart();await open();await pass('Damaged origin storage blocks new installs without losing local Registry',`studio.installer.state==='damaged'&&studio.registry.state==='ready'&&studio.registry.list().some(r=>r.id==='${localId}')`);
  assert.deepEqual(hashes(),initialHashes);assert(catalogRequests.every(r=>r.method==='GET'&&r.body===''));checks.push('All original note hashes restored and catalog received no private content');
  report.version=await ev("({electron:process.versions.electron,obsidian:document.title.match(/Obsidian ([0-9.]+)/)?.[1]})");report.providerRequests=requests.length;report.catalogRequests=catalogRequests;report.before=initialHashes;report.after=hashes();report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error);console.error(error);process.exitCode=1;try{report.diagnostic=await ev("({io,text:document.body.innerText.slice(-3000),community:studio.community.state,origins:studio.installer.state})");await shot('failure');}catch{}}
finally{fs.writeFileSync(`${root}/report.json`,JSON.stringify(report,null,2)+'\n');socket?.close();if(child){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await Promise.race([exited,pause(3000)]);if(child.exitCode===null)child.kill('SIGKILL');}server.close();catalogServer.close();}
