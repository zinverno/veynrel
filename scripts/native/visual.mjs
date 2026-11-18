import { runSemanticFloating } from './semantic-floating-journey.mjs';
const semanticFloating = process.argv[5] === 'semantic-floating';
import { runVisualUX } from './visual-journey.mjs';
import { runFollowupUX } from './followup-journey.mjs';
const followup = process.argv[5] === 'followup';
// Real Obsidian/Electron smoke with synthetic loopback embeddings; no personal vault.
import fs from 'node:fs';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {build as bundle} from 'esbuild';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertNativeRoot, launchObsidian, nativeEndpoint } from './session.mjs';

const noteCount = semanticFloating && process.argv[3] === "cap" ? 502 : 154;
assert([154,502,1000,5000,10000].includes(noteCount));
const root = process.argv[2], phase = process.argv[3] ?? 'baseline', build = process.argv[4] ?? fileURLToPath(new URL('../../', import.meta.url));
assertNativeRoot(root); assert(!fs.existsSync(root));
const vault = `${root}/vault`, pluginDir = `${vault}/.obsidian/plugins/ai-knowledge-hub`;
fs.mkdirSync(pluginDir, { recursive: true }); fs.mkdirSync(`${root}/profile`); fs.mkdirSync(`${root}/frames`);
const originals = { 'Source.md': '# Synthetic source\n\nTwo facts stay unchanged. Два факта сохранены.\n\n## Flashcards\n\nWhat links notes?::Ideas and references\n', 'Other.md': '# Synthetic second note\n\n[[Source]]\n' };
for(let i=2;i<noteCount;i++) originals[`Note-${i}.md`]=`# Synthetic material ${i}\n\nDistinct explanation ${i} about ${['containers','databases','architecture','learning'][i%4]}.\n\n[[${i%7===0?'Missing-'+i:'Source'}]]\n`;
if(followup) originals['Long source — '+ 'material and references '.repeat(6) + '.md'] = '# Long synthetic source\n\n[[Missing target with a deliberately long explanation about relationships and organisation across many different notes]]\n';
for (const [name, text] of Object.entries(originals)) fs.writeFileSync(`${vault}/${name}`, text);
fs.writeFileSync(`${vault}/.obsidian/community-plugins.json`, '["ai-knowledge-hub"]');
fs.writeFileSync(`${vault}/.obsidian/app.json`, '{"checkForUpdates":false}');
fs.writeFileSync(`${root}/profile/obsidian.json`, JSON.stringify({ updateDisabled: true, vaults: { smoke: { path: vault, open: true, ts: Date.now() } } }));
fs.writeFileSync(`${pluginDir}/data.json`, JSON.stringify({ language: 'en', apiKey: '', provider: 'ollama', baseUrl: 'http://127.0.0.1:1/v1', model: 'unused', semanticAutoSyncSuspended: true, semantic: { enabled: false }, decisions: { enabled: false }, companion: { enabled: false }, health: { onboardingCompleted: false, profileChosen: false } }));
const sha = value => createHash('sha256').update(value).digest('hex');
const source = { commit: spawnSync('git',['rev-parse','HEAD'],{cwd:build,encoding:'utf8'}).stdout.trim(), diffSha256: sha(spawnSync('git',['diff','HEAD','--','*.ts','*.mjs','*.py','styles.css'],{cwd:build,encoding:'utf8'}).stdout) };
const baselineReceipt=fs.existsSync(`${build}/source-receipt.json`)?JSON.parse(fs.readFileSync(`${build}/source-receipt.json`,'utf8')):undefined;
const report = { source: baselineReceipt ? {...baselineReceipt.source, provenance:'pinned baseline assets', originalReceipt:baselineReceipt.nativeBaseline+'/report.json'} : source, scenario: (semanticFloating?'semantic-floating-':followup?'followup-':'visual-')+phase, checks: [], exceptions: [], actions: [], screenshots: [], assets: {}, externalRequests: [], recording: null };
report.harnessHashes = Object.fromEntries(['visual.mjs','visual-journey.mjs','followup.mjs','followup-journey.mjs','overview-fixture.ts','session.mjs','run.py',...(semanticFloating?['semantic-floating.mjs','semantic-floating-journey.mjs','floating-actions-journey.mjs','semantic-limits-journey.mjs','semantic-state-journey.mjs','floating-source-journey.mjs']:[])].map(name=>[name,sha(fs.readFileSync(new URL(name,import.meta.url)))]));
for (const name of ['main.js', 'styles.css', 'manifest.json']) { const bytes = fs.readFileSync(`${build}/${name}`); fs.writeFileSync(`${pluginDir}/${name}`, bytes); report.assets[name] = sha(bytes); if(baselineReceipt)assert.equal(report.assets[name],baselineReceipt.assets[name]); }
if(process.env.UX_THEME_DIR){
  const theme=JSON.parse(fs.readFileSync(`${process.env.UX_THEME_DIR}/manifest.json`,'utf8'));assert.equal(theme.name,'Minimal');
  const dir=`${vault}/.obsidian/themes/Minimal`;fs.mkdirSync(dir,{recursive:true});
  for(const name of ['manifest.json','theme.css'])fs.copyFileSync(`${process.env.UX_THEME_DIR}/${name}`,`${dir}/${name}`);
  fs.writeFileSync(`${vault}/.obsidian/appearance.json`,JSON.stringify({cssTheme:'Minimal'}));
  report.communityTheme={name:'Minimal',cssSha256:sha(fs.readFileSync(`${dir}/theme.css`)),source:JSON.parse(fs.readFileSync(`${process.env.UX_THEME_DIR}/source.json`,'utf8'))};
}
const requests = []; report.providerRequests = requests;
let releasePending;
async function pendingReply() {
  for (let i = 0; i < 200 && !releasePending; i++) await pause(50);
  assert(releasePending, 'The delayed loopback request reached the server');
  const release = releasePending;
  releasePending = undefined;
  return release;
}
const server = createServer(async (req,res) => {
  let body='';for await(const part of req)body+=part;
  const data=JSON.parse(body||'{}');requests.push({path:req.url, model:data.model});
  if(semanticFloating && req.url==='/v1/chat/completions') {
    const user=data.messages?.at(-1)?.content??'';
    requests.at(-1).inputSha256=sha(user); requests.at(-1).inputLength=user.length;
    if(data.model==='fixture-error'){res.writeHead(503);res.end('synthetic failure');return;}
    if (data.model==='fixture-delay' || data.model==='fixture-recall-delay') {
      await new Promise(resolve => {
        releasePending = () => {
          const sent = new Promise(done => { res.once('finish', done); res.once('close', done); if (res.destroyed) done(); });
          resolve();
          return sent;
        };
      });
    }
    if(data.model==='fixture-timeout')await new Promise(r=>setTimeout(r,35000));
    const content=data.model?.startsWith('fixture-recall')?'What connects notes?::Shared ideas\nWhat protects edits?::Explicit review\nWhat restores text?::Editor undo':user.split('\n\n').slice(1).join('\n\n').replace('Two facts stay unchanged.','Two facts remain unchanged.');
    res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content},finish_reason:'stop'}]}));return;
  }
  if(!['/api/embed','/api/embeddings'].includes(req.url)){res.writeHead(404);res.end();return;}
  const vector=Array.from({length:32},(_,i)=>i===0?1:0);
  const inputs=Array.isArray(data.input)?data.input:[data.input??data.prompt];
  res.setHeader('content-type','application/json');res.end(JSON.stringify({embeddings:inputs.map(()=>vector),embedding:vector}));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const providerUrl=`http://127.0.0.1:${server.address().port}`;
await bundle({entryPoints:[fileURLToPath(new URL('./overview-fixture.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',outfile:`${root}/fixture.cjs`,plugins:[{name:"fixture-host",setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:"obsidian",namespace:"fixture"}));b.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:'export const getLanguage=()=>"en";'}));}}]});
const index=await createRequire(import.meta.url)(`${root}/fixture.cjs`).overviewIndex(originals,providerUrl,semanticFloating);
fs.mkdirSync(`${pluginDir}/semantic-index`);
for(const [name,value]of index)fs.writeFileSync(`${pluginDir}/semantic-index/${name.split('/').pop()}`,typeof value==='string'?value:Buffer.from(value));
const pause = ms => new Promise(r => setTimeout(r, ms));
let child = launchObsidian(root);
const connections = [], frames = [];
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
async function shot(name, c = main, fullWindow = false) {
  await c.ev("Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))");
  const rect=await c.ev(fullWindow ? "({x:0,y:0,width:innerWidth,height:innerHeight,scale:1})" : "(()=>{const r=document.querySelector('.veynrel-health-view').getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),scale:1}})()");
  const png=Buffer.from((await c.send('Page.captureScreenshot',{format:'png',clip:rect,captureBeyondViewport:true})).data,'base64');
  assert.equal(png.readUInt32BE(16),rect.width);assert.equal(png.readUInt32BE(20),rect.height);
  fs.writeFileSync(`${root}/${name}.png`,png);
  report.screenshots.push(name+'.png'); (report.screenshotGeometry??=[]).push({name,rect,fullWindow,...(semanticFloating && recording && frames.length ? {videoSeconds:frames.at(-1).time-frames[0].time}: {})});
}

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
  await wait("!!app.commands.commands['ai-knowledge-hub:veynrel-open-health']");
  await main.ev("window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.resizeTrace=[];window.addEventListener('resize',()=>resizeTrace.push({at:Date.now(),width:innerWidth,height:innerHeight}));void 0");
  report.versions = await main.ev('({obsidian:plugin.app.getVersion?.()??document.title.match(/Obsidian ([0-9.]+)/)?.[1],electron:process.versions.electron,chrome:process.versions.chrome,plugin:plugin.manifest.version})');
  if(report.communityTheme)await pass('Actual installed Minimal theme is active',"app.customCss.theme==='Minimal'");
  await pass('Native frame applies only to the disposable host', "window.titlebarStyle==='native' && !window.frameDom");
  await main.ev("app.workspace.getLeaf(false).openFile(app.vault.getFileByPath('Source.md'),{state:{mode:'preview'}})");
  await focus(); await main.ev('window.electronWindow.setContentSize(1100,800);void 0'); await wait('innerWidth===1100&&innerHeight===800');
  await main.send('Page.startScreencast', { format:'jpeg',quality:70,maxWidth:1600,maxHeight:1000,everyNthFrame:1 }); recording=true;

  await main.ev(`window.uxIO={read:0,write:0,process:0,pluginRead:0,pluginWrite:0};for(const k of ['read','cachedRead','modify','create','process']){const old=app.vault[k].bind(app.vault);app.vault[k]=(...a)=>{if(String(a[0]?.path??a[0]).endsWith('.md')){uxIO[k==='read'||k==='cachedRead'?'read':k==='process'?'process':'write']++;if(new Error().stack.includes('plugin:ai-knowledge-hub'))uxIO[k==='read'||k==='cachedRead'?'pluginRead':'pluginWrite']++;}return old(...a)}};void 0`);
  if(semanticFloating)await main.ev(`window.stageIO={configWrite:0,semanticRead:0,semanticWrite:0,hostAdapterRead:0,hostAdapterWrite:0};for(const k of ['read','readBinary','write','writeBinary']){const old=app.vault.adapter[k].bind(app.vault.adapter);app.vault.adapter[k]=(...a)=>{const path=String(a[0]),read=k.startsWith('read');if(path.includes('/semantic-index/'))stageIO[read?'semanticRead':'semanticWrite']++;else if(path.endsWith('/ai-knowledge-hub/data.json')&&!read)stageIO.configWrite++;else stageIO[read?'hostAdapterRead':'hostAdapterWrite']++;return old(...a)}};void 0`);
  await main.ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health');void 0");
  await wait("!!app.workspace.getLeavesOfType('veynrel-health')[0]?.view.body");
  await main.ev("window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;void 0");
  await (semanticFloating ? runSemanticFloating : followup ? runFollowupUX : runVisualUX)({main,wait,pass,shot,focus,key,report,phase,connection,endpoint,pause,providerUrl,stopVideo,pendingReply});
  report.dom=await main.ev('({elements:document.querySelectorAll(".veynrel-health-view *").length,findings:hv.controller.listFindings().length})');
  await stopVideo();
  if(semanticFloating&&['panel','full'].includes(phase)) {
    await main.ev('plugin.settingsSave');
    const persisted=JSON.parse(fs.readFileSync(`${pluginDir}/data.json`,'utf8')).floatingActions;
    assert.deepEqual(Object.keys(persisted).sort(),['enabled','x','y']);
    const ended=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await ended;
    child=launchObsidian(root);endpoint=await nativeEndpoint(root,child);
    let restarted;for(let i=0;i<200;i++){restarted=(await(await fetch(`${endpoint}/json/list`)).json()).find(t=>t.url.startsWith('app://obsidian.md/'));if(restarted)break;await pause(50);}
    main=await connection(restarted);await wait("!!window.app?.plugins?.plugins['ai-knowledge-hub']&&document.querySelectorAll('.veynrel-floating').length===1");
    await main.ev("window.electronWindow.setContentSize(390,800);void 0");await wait('innerWidth===390');await pause(100);
    await pass('Actual process restart restores bounded position and one root',"(()=>{const r=document.querySelector('.veynrel-floating').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()");
    await shot('panel-after-process-restart',main,true);report.restart={persisted,processRestart:true};
  }
  report.markdown=Object.fromEntries(Object.entries(originals).map(([name,text])=>[name,{before:sha(text),after:sha(fs.readFileSync(`${vault}/${name}`))}]));
  assert(Object.values(report.markdown).every(h=>h.before===h.after));report.checks.push('All Markdown byte-identical');
  assert.equal(report.exceptions.length,0,'Unfiltered native exceptions');report.status='PASS';
} catch(error) { report.status='FAIL'; report.error=String(error.stack??error); process.exitCode=1; try { if(main) { if(semanticFloating)report.failureState=await main.ev('({recall:{state:plugin.recallAuthoring?.getSnapshot().state,result:plugin.recallAuthoring?.getSnapshot().result},style:document.querySelector("[data-style-state]")?.dataset.styleState})'); await shot('failure',main,semanticFloating); } await stopVideo(); } catch(e) {report.captureError=String(e);} }
finally {
  report.providerRequests=requests;server.close();
  fs.writeFileSync(`${root}/report.json`, JSON.stringify(report,null,2)+'\n'); for(const c of connections)c.socket.close();
  if(child.exitCode===null&&child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),3000);await exited;clearTimeout(timer);}
  console.log(JSON.stringify({root,status:report.status,checks:report.checks.length,exceptions:report.exceptions.length,error:report.error}));
}
