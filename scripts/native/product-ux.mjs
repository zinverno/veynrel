import { runMapUX } from './product-ux-map.mjs';
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
if(process.env.UX_THEME_DIR){
  const theme=JSON.parse(fs.readFileSync(`${process.env.UX_THEME_DIR}/manifest.json`,'utf8'));assert.equal(theme.name,'Minimal');
  const dir=`${vault}/.obsidian/themes/Minimal`;fs.mkdirSync(dir,{recursive:true});
  for(const name of ['manifest.json','theme.css'])fs.copyFileSync(`${process.env.UX_THEME_DIR}/${name}`,`${dir}/${name}`);
  fs.writeFileSync(`${vault}/.obsidian/appearance.json`,JSON.stringify({cssTheme:'Minimal'}));
  report.communityTheme={name:'Minimal',cssSha256:sha(fs.readFileSync(`${dir}/theme.css`)),source:JSON.parse(fs.readFileSync(`${process.env.UX_THEME_DIR}/source.json`,'utf8'))};
}
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
  if(report.communityTheme)await pass('Actual installed Minimal theme is active',"app.customCss.theme==='Minimal'");
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
  if (phase === 'notes-benchmark' || phase === 'structure-benchmark') {
    const started=performance.now();await main.ev("hv.navigate({page:'discover'});void 0");await wait("!!document.querySelector('[data-note-row]')");
    report.notesReadyMs=performance.now()-started;
    report.notes=await main.ev('({scope:hv.workbench.data.scope.paths.length,files:app.vault.getMarkdownFiles().length,cached:app.vault.getMarkdownFiles().filter(f=>app.metadataCache.getFileCache(f)).length,rows:document.querySelectorAll("[data-note-row]").length,elements:document.querySelectorAll(".veynrel-review-list *").length,heapUsed:performance.memory?.usedJSHeapSize??null})');
    assert.equal(report.notes.files,noteCount);assert.equal(report.notes.scope,noteCount);assert(report.notes.rows<=60);
    const searchStart=performance.now();await main.ev("document.querySelector('[data-health-action=review-search]').focus();void 0");await main.send('Input.insertText',{text:'Note-'+(noteCount-1)});await wait("document.querySelectorAll('[data-note-row]').length===1");
    report.notesSearchMs=performance.now()-searchStart;
    await main.ev("document.querySelector('[data-note-row] input').focus();void 0");await key(' ','Space',32,' ');
    await pass('10k-capable list keeps exact existing selection without IO',`hv.workbench.chosen[0]==='Note-${noteCount-1}.md'&&uxIO.pluginRead===0&&uxIO.pluginWrite===0`);
    await shot('notes-benchmark');report.semantic={indexed:0,computed:0,reason:'disabled; file list uses metadata only'};
    if(phase==='structure-benchmark') {
      await main.ev("document.querySelector('[data-health-action=review-map]').focus();void 0");await key('Enter','Enter',13,'\r');
      await main.ev('window.wb=hv.workbench.map;window.beforeMapIO={...uxIO};void 0');
      const started=performance.now();await main.ev("document.querySelector('[data-health-action=workbench-refresh]').focus();void 0");await key('Enter','Enter',13,'\r');
      await wait("wb.data.dependencies.topology.getSnapshot().state==='ready'&&!wb.pendingRender");
      report.structureWallMs=performance.now()-started;
      report.structure=await main.ev("(()=>{const s=wb.data.dependencies.topology.getSnapshot();return {scope:wb.data.scope.paths.length,cached:app.vault.getMarkdownFiles().filter(f=>app.metadataCache.getFileCache(f)).length,represented:s.map.noteCount,unknown:s.map.nodes.filter(n=>!n.linksAvailable).length,complete:s.map.complete,topology:s.timing,layoutMs:wb.layoutMilliseconds,representationMs:wb.representationMilliseconds,items:wb.items.length,rendered:wb.element.querySelectorAll('[data-path],[data-group]').length,svgElements:wb.element.querySelectorAll('svg *').length,dom:wb.element.querySelectorAll('*').length,heapUsed:performance.memory?.usedJSHeapSize,render:wb.graph.metrics}})()");
      await pass('Every path represented; only bounded technical groups rendered',`wb.items.flatMap(i=>i.members??[i.path]).length===${noteCount}&&wb.items.length<=500&&wb.data.semantic.getSnapshot().state==='idle'`);
      await pass('Structure does not read or modify Markdown',"uxIO.pluginRead===beforeMapIO.pluginRead&&uxIO.pluginWrite===beforeMapIO.pluginWrite");
      await shot('structure-benchmark');
    }

  } else {
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
    if (phase === 'after-c') await runMapUX({main,wait,pass,shot,focus,key,report});
    if (phase === 'after-b') {
      const activate = async (selector, checkbox=false) => {
        await focus();await main.ev(`{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Control unavailable');e.scrollIntoView({block:'center'});e.focus();}void 0`);
        await key(checkbox?' ':'Enter',checkbox?'Space':'Enter',checkbox?32:13,checkbox?' ':'\r');
      };
      await main.ev("hv.navigate({page:'discover'});window.notesBefore={...uxIO};void 0");
      await activate('[data-health-action=review-search]');await main.send('Input.insertText',{text:'Source.md'});
      await activate('[data-health-action="note-select-Source.md"]',true);
      await pass('Notes selection is exact and passive',"hv.workbench.chosen.length===1&&hv.workbench.chosen[0]==='Source.md'&&uxIO.pluginRead===notesBefore.pluginRead&&uxIO.pluginWrite===notesBefore.pluginWrite");
      report.noteList=await main.ev('({rows:document.querySelectorAll("[data-note-row]").length,elements:document.querySelectorAll(".veynrel-review-list *").length,selected:hv.workbench.chosen.length})');
      for(const language of ['en','ru']) {
        await main.ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
        await main.ev(`{const s=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));s.value='${language}';s.dispatchEvent(new Event('change'));}void 0`);
        await main.ev('plugin.settingsSave');await main.ev('app.setting.close();hv.render();void 0');
        for(const theme of ['light','dark'])for(const width of [1100,390]) {
          await main.ev(`app.changeTheme('${theme==='light'?'moonstone':'obsidian'}');void 0`);await main.send('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false});
          await pass(`Notes ${language}/${theme}/${width}: no overflow`,"hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1");await shot(`notes-selected-${language}-${theme}-${width}`);
        }
      }
      await main.send('Emulation.clearDeviceMetricsOverride');
      await activate('[data-health-action=note-tag]');await wait("!!document.querySelector('.ai-local-note [role=alert]')");
      await pass('Existing R05 guard refuses the still-open synthetic source',"/Close|Закройте/.test(document.querySelector('.ai-local-note [role=alert]').textContent)");await shot('context-open-editor-refusal');
      await key('Escape','Escape',27);await wait("!document.querySelector('.ai-local-note')");
      await main.ev("app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('markdown').find(l=>l.view.file?.path==='Source.md'),{focus:true});void 0");
      await wait("app.workspace.getActiveFile()?.path==='Source.md'");await focus();
      await key('w','KeyW',87,undefined,2);
      await wait("!app.workspace.getLeavesOfType('markdown').some(l=>l.view.file?.path==='Source.md')");
      report.sourceClose='Explicit keyboard Ctrl+W on verified synthetic source; independent of failed pointer attempt 03';
      await main.ev('app.workspace.setActiveLeaf(hv.leaf,{focus:true});void 0');await focus();
      await activate('[data-health-action=note-tag]');await wait("!!document.querySelector('[data-local-note=tag-choice]')");await shot('context-tag-plan');
      await key('Escape','Escape',27);await wait("!document.querySelector('.ai-local-note')");
      await main.ev("document.querySelector('[data-health-action=review-search]').focus();void 0");await key('a','KeyA',65,undefined,2);await main.send('Input.insertText',{text:'Other.md'});
      await activate('[data-health-action="note-select-Other.md"]',true);
      await activate('[data-health-action=note-link]');await wait("!!document.querySelector('[data-local-link=direction]')");await shot('context-link-plan');await key('Escape','Escape',27);await wait("!document.querySelector('.ai-local-link')");
      await main.ev('window.savedNotesQuery=hv.workbench.query;window.savedNotesScroll=hv.contentEl.scrollTop;void 0');
      await activate('[data-health-action=notes-compare]');await wait("!!document.querySelector('[data-pair-heading]')");await shot('context-pair');await activate('[data-health-action=review-back]');
      await pass('Back retains exact paths and search',"hv.workbench.query===savedNotesQuery&&JSON.stringify(hv.workbench.chosen)===JSON.stringify(['Source.md','Other.md'])");
      await activate('[data-health-action="unselect-Other.md"]');
      await activate('[data-health-action=note-more]');
      await activate('[data-health-action=note-studio]');await wait("!!document.querySelector('[data-studio-action=back-notes]')");
      await pass('Studio receives suggestion, not preparation or consent',"plugin.studio.runner.state==='idle'&&!!document.querySelector('.veynrel-studio-source-handoff')");await shot('studio-source-handoff');
      await activate('[data-studio-action^=recipe-]');await activate('[data-studio-action=choose-notes]');
      await main.ev('window.handoffIO={...uxIO};void 0');await activate('[data-studio-action=use-source]');
      await pass('Studio source choice is local setup, not a run',"(()=>{const v=app.workspace.getLeavesOfType('veynrel-studio')[0].view,d=v.setupDrafts.get(v.selected.id);return d.mode==='files'&&[...d.chosen].join()==='Source.md'&&plugin.studio.runner.state==='idle'&&uxIO.pluginRead===handoffIO.pluginRead&&uxIO.pluginWrite===handoffIO.pluginWrite})()");await shot('studio-source-selected');
      await activate('[data-studio-action=back-notes]');
      report.studioBackImmediate=await main.ev("({active:app.workspace.activeLeaf===hv.leaf,chosen:hv.workbench.chosen,connected:hv.contentEl.isConnected})");
      await wait('app.workspace.activeLeaf===hv.leaf');
      await pass('Studio Back returns to selected Notes context',"app.workspace.activeLeaf===hv.leaf&&hv.workbench.chosen[0]==='Source.md'");
    }
    await main.ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-studio');void 0");await wait("!!document.querySelector('[data-studio-action=library]')");
    await main.ev("document.querySelector('[data-studio-action=library]').focus();void 0");await key('Enter','Enter',13,'\r');await wait("!!document.querySelector('[data-studio-field=search]')");
    await pass('Only online Community is hidden; Studio Library remains',"!document.querySelector('[data-studio-action=community],[data-studio-action=publish]')&&!!document.querySelector('[data-studio-field=search]')&&plugin.studio.features.onlineCommunity===false&&plugin.studio.community.state==='idle'");
    await shot('studio-community-off');
    await main.ev("window.uxSplit=app.workspace.getLeaf('split');uxSplit.setViewState({type:'veynrel-health',active:true})");
    await pass('Real Workspace split mounts independently',"app.workspace.getLeavesOfType('veynrel-health').length===2");await shot('split');
    if(phase==='after-b') {
      await main.ev("uxSplit.view.navigate({page:'discover'});uxSplit.view.contentEl.querySelector('[data-health-action=review-search]').focus();void 0");await main.send('Input.insertText',{text:'Other.md'});
      await main.ev("uxSplit.view.contentEl.querySelector('[data-note-row] input').focus();void 0");await key(' ','Space',32,' ');
      await pass('Split keeps independent note selections',"uxSplit.view.workbench.chosen[0]==='Other.md'&&hv.workbench.chosen[0]==='Source.md'");await shot('split-notes');
    }

    await main.ev('uxSplit.detach();void 0');
    await main.ev("window.uxPop=app.workspace.getLeaf('window');uxPop.setViewState({type:'veynrel-health',active:true})");
    await wait('uxPop.view.containerEl.ownerDocument!==document');
    let popTarget;for(let i=0;i<100;i++){popTarget=(await(await fetch(`${endpoint}/json/list`)).json()).find(t=>t.type==='page'&&t.id!==main.id);if(popTarget)break;await pause(50);}assert(popTarget);
    const pop=await connection(popTarget);await focus(pop);
    await pass('Popout has actual three-tab UI',"document.querySelectorAll('.veynrel-tabs button').length===3",pop);await shot('popout',pop);
    if(phase==='after-b') {
      await pop.ev("window.popNotes=app.workspace.getLeavesOfType('veynrel-health').find(l=>l.view.containerEl.ownerDocument===document).view;popNotes.navigate({page:'discover'});popNotes.contentEl.querySelector('[data-health-action=review-search]').focus();void 0");await pop.send('Input.insertText',{text:'Source.md'});
      await pop.ev("popNotes.contentEl.querySelector('[data-note-row] input').focus();void 0");
      for(const type of ['keyDown','keyUp'])await pop.send('Input.dispatchKeyEvent',{type,key:' ',code:'Space',windowsVirtualKeyCode:32,...(type==='keyDown'?{text:' '}: {})});
      await pass('Popout selects an exact note using its own keyboard document',"popNotes.workbench.chosen[0]==='Source.md'",pop);await shot('popout-notes',pop);
    }

    if(phase==='after-c') {
      await pop.ev("window.popMapView=app.workspace.getLeavesOfType('veynrel-health').find(l=>l.view.containerEl.ownerDocument===document).view;popMapView.navigate({page:'discover'});popMapView.contentEl.querySelector('[data-health-action=review-map]').focus();void 0");
      for(const type of ['keyDown','keyUp'])await pop.send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,...(type==='keyDown'?{text:'\r'}: {})});
      await wait("!!document.querySelector('svg[data-camera]')",pop);
      await pop.ev("document.querySelector('[data-path=\"Source.md\"]').focus();void 0");
      for(const type of ['keyDown','keyUp'])await pop.send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,...(type==='keyDown'?{text:'\r'}: {})});
      await pass('Structural map selection uses the popout document',"popMapView.workbench.map.note==='Source.md'&&popMapView.workbench.map.element.ownerDocument===document",pop);await shot('popout-structure',pop);
    }
    await main.ev('uxPop.detach();void 0');await focus();
    await pass('Focus returns to main window','document.hasFocus()');
    assert.equal(report.externalRequests.length,0,'No HTTP requests during the walkthrough');
  }
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
