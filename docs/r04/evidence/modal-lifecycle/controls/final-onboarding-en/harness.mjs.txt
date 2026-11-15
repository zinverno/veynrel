// Real Obsidian/Electron smoke. No DOM mocks, provider calls or personal vault.
import fs from 'node:fs';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assertNativeRoot, launchObsidian, nativeEndpoint } from './native/session.mjs';

const pauseExceptions=process.env.VEYNREL_MODAL_PAUSE_EXCEPTIONS==='1';
const mode = process.env.VEYNREL_MODAL_MODE ?? 'onboarding', language = process.env.VEYNREL_MODAL_LANGUAGE ?? 'en';
assert(['onboarding','workspace','taxonomy'].includes(mode)); assert(['en','ru'].includes(language));
const root = process.argv[2], build = process.argv[3] ?? fileURLToPath(new URL('../', import.meta.url));
assertNativeRoot(root); assert(!fs.existsSync(root));
const vault = `${root}/vault`, pluginDir = `${vault}/.obsidian/plugins/ai-knowledge-hub`;
fs.mkdirSync(pluginDir, { recursive: true }); fs.mkdirSync(`${root}/profile`);
const originals = {'Control.md':'# Synthetic control\n\nNo tags, secrets or model calls.\n'};
for (const [name, text] of Object.entries(originals)) fs.writeFileSync(`${vault}/${name}`, text);
fs.writeFileSync(`${vault}/.obsidian/community-plugins.json`, '["ai-knowledge-hub"]');
fs.writeFileSync(`${vault}/.obsidian/app.json`, '{"checkForUpdates":false}');
fs.writeFileSync(`${root}/profile/obsidian.json`, JSON.stringify({ updateDisabled: true, vaults: { smoke: { path: vault, open: true, ts: Date.now() } } }));
const modelRequests=[];
const server=createServer((req,res)=>{modelRequests.push({method:req.method,url:req.url});res.writeHead(503);res.end('Local audit must not request a model');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
fs.writeFileSync(`${pluginDir}/data.json`, JSON.stringify({ language, apiKey: '', provider: 'ollama', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'unused', semanticAutoSyncSuspended: true, semantic: { enabled: false }, decisions: { enabled: false }, companion: { enabled: false }, health: mode === 'onboarding' ? {} : { profile: 'mixed', profileChosen: true, onboardingCompleted: true } }));
const sha = value => createHash('sha256').update(value).digest('hex');
const report = { scenario: 'r04-modal-lifecycle-v1', mode, language, pauseExceptions, lifecycle: [], pauses: [], checks: [], exceptions: [], consoleErrors: [], actions: [], screenshots: [], assets: {}, externalRequests: [] };
report.harnessHashes = Object.fromEntries(['r04-modal-lifecycle-native.mjs','native/session.mjs','native/run.py'].map(name=>[name,sha(fs.readFileSync(new URL(name,import.meta.url)))]));
for (const name of ['main.js', 'styles.css', 'manifest.json']) { const bytes = fs.readFileSync(`${build}/${name}`); fs.writeFileSync(`${pluginDir}/${name}`, bytes); report.assets[name] = sha(bytes); }
fs.copyFileSync(fileURLToPath(import.meta.url),root+'/harness.mjs');
const pause = ms => new Promise(r => setTimeout(r, ms));
let child = launchObsidian(root); const connections = [];
let main, endpoint;
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
    if (m.method === 'Debugger.paused') void paused(m.params, send).catch(e=>{report.diagnosticError=String(e);void send('Debugger.resume');});
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') report.consoleErrors.push(m.params);
    if (m.method === 'Runtime.exceptionThrown') report.exceptions.push({ target: target.id, ...m.params });
    if (m.method === 'Network.requestWillBeSent' && /^https?:/.test(m.params.request.url)) report.externalRequests.push(m.params.request.url);

  };
  const c = { socket, send, id: target.id, ev: async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value;
  } }; connections.push(c);
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['https://*', 'http://*'] }); return c;
}
async function wait(expression, c = main, attempts = 200) { for (let i = 0; i < attempts; i++) { if (await c.ev(expression)) return; await pause(50); } throw Error(`Readiness: ${expression}`); }
async function shot(name, c = main) { fs.writeFileSync(`${root}/${name}.png`, Buffer.from((await c.send('Page.captureScreenshot', { format:'png' })).data,'base64')); report.screenshots.push(name+'.png'); }
async function focus(c = main) { await c.send('Page.bringToFront'); await c.ev('window.electronWindow.focus();void 0'); await wait('document.hasFocus() && window.electronWindow.isFocused()', c); }
async function key(key, code, number, text, modifiers = 0) {
  report.actions.push({phase:report.phase,key,time:Date.now()});
  for (const type of ['keyDown','keyUp']) await main.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode:number, nativeVirtualKeyCode:number, modifiers, ...(type==='keyDown' && text ? {text,unmodifiedText:text}: {}) });
}
async function attach() {
  endpoint = await nativeEndpoint(root, child);
  let target; for (let i=0;i<200;i++) { target=(await(await fetch(`${endpoint}/json/list`)).json()).find(t=>t.url.startsWith('app://obsidian.md/')); if(target)break; await pause(50); }
  assert(target); main=await connection(target); await wait('!!window.app?.workspace?.layoutReady');
  assert.equal(await main.ev('app.vault.adapter.basePath'),vault);
  await wait("!!app.plugins.plugins['ai-knowledge-hub'] || !!document.querySelector('.mod-trust-folder')");
  if(await main.ev("!!document.querySelector('.mod-trust-folder')")) await main.ev("[...document.querySelectorAll('.mod-trust-folder button')].find(e=>/Trust author/.test(e.textContent)).click();void 0");
  await wait("!!app.commands.commands['ai-knowledge-hub:veynrel-open-health']");
  await main.ev(`window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.io={reads:[],writes:[],creates:[],metadata:0,enumerations:0,phase:'startup'};
    for(const name of ['read','cachedRead','modify','process','create']) {const original=app.vault[name].bind(app.vault);app.vault[name]=(...args)=>{const path=typeof args[0]==='string'?args[0]:args[0]?.path;
      io[name==='read'||name==='cachedRead'?'reads':name==='create'?'creates':'writes'].push({path,phase:io.phase});return original(...args);};}
    const enumerate=app.vault.getMarkdownFiles.bind(app.vault);app.vault.getMarkdownFiles=(...args)=>{io.enumerations++;return enumerate(...args);};
    const cache=app.metadataCache.getFileCache.bind(app.metadataCache);app.metadataCache.getFileCache=file=>{io.metadata++;return cache(file);};
    void 0`);
  await main.ev("window.keyTrace=[];for(const name of ['keydown','keypress','keyup','click'])document.addEventListener(name,e=>keyTrace.push({type:e.type,key:e.key,target:e.target.dataset?.healthAction??e.target.dataset?.orgAction??e.target.dataset?.taxonomyAction,prevented:e.defaultPrevented}),true);void 0");
  await focus(); await main.ev('window.electronWindow.setContentSize(1100,900);void 0'); await wait('innerWidth===1100');
  await main.ev("app.changeTheme('obsidian');void 0");
  report.versions=await main.ev("({obsidian:document.title.match(/Obsidian ([0-9.]+)/)?.[1],electron:process.versions.electron,chrome:process.versions.chrome,plugin:plugin.manifest.version})");
}

async function object(expression) {
  const r=await main.send('Runtime.evaluate',{expression}); assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.objectId;
}
async function properties(objectId) { return main.send('Runtime.getProperties',{objectId,ownProperties:true}); }
async function binding(functionId,name) {
  const props=await properties(functionId),scopes=props.internalProperties.find(p=>p.name==='[[Scopes]]').value.objectId;
  for(const scope of (await properties(scopes)).result) {
    if(!scope.value?.objectId)continue;
    const match=(await properties(scope.value.objectId)).result.find(p=>p.name===name);
    if(match?.value?.objectId)return match.value.objectId;
  }
  throw Error('Closure binding unavailable: '+name);
}
async function traceFunction(objectId,name) {
  const expression=event=>`(window.modalEvents.push({lifecycle:${JSON.stringify(event)},...modalSnapshot([...plugin.taxonomyModals].at(-1))}),false)`;
  const props=await properties(objectId),location=props.internalProperties.find(p=>p.name==='[[FunctionLocation]]')?.value?.value;
  if(location) {
    const possible=await main.send('Debugger.getPossibleBreakpoints',{start:location,restrictToFunction:true});
    report.breakpointLocations??={};report.breakpointLocations[name]=possible.locations;
    for(const [event,locations] of [['enter',possible.locations.slice(0,1)],['return',possible.locations.filter(p=>p.type==='return')]])for(const loc of locations)await main.send('Debugger.setBreakpoint',{location:{scriptId:loc.scriptId,lineNumber:loc.lineNumber,columnNumber:loc.columnNumber},condition:expression(name+':'+event)});
  }
}
async function paused(event,send) {
  const frame=event.callFrames[0];
  const r=await send('Debugger.evaluateOnCallFrame',{callFrameId:frame.callFrameId,expression:'window.modalSnapshot?.([...window.plugin?.taxonomyModals??[]].at(-1))',returnByValue:true});
  report.pauses.push({reason:event.reason,data:event.data,stack:event.callFrames.map(f=>({function:f.functionName,url:f.url,location:f.location})),snapshot:r.result.value});
  await send('Debugger.resume');
}
try {
  await attach();
  await main.send('Debugger.enable'); await main.send('Debugger.setPauseOnExceptions',{state:pauseExceptions?'all':'none'});
  await main.ev(`window.modalSnapshot=(m)=>({time:performance.now(),instance:!!m,identity:m?.identity,modal:m?.constructor?.name,containerParent:m?.containerEl?.parentNode?.nodeName,containerConnected:m?.containerEl?.isConnected,modalConnected:m?.modalEl?.isConnected,contentConnected:m?.contentEl?.isConnected,modalOwnerMain:m?.modalEl?.ownerDocument===document,contentOwnerMain:m?.contentEl?.ownerDocument===document,openState:m?.openState,showing:m?.isOpen,focus:document.activeElement?.outerHTML?.slice(0,300),hasFocus:document.hasFocus(),leaf:app.workspace.activeLeaf?.view?.getViewType(),stackDOM:[...document.querySelectorAll('.modal-container')].map(e=>({connected:e.isConnected,text:e.textContent.slice(0,100)})),hostStack:window.modalStackReader?.(),keyScopes:{sameModal:app.keymap.windowScopes.get(window)?.scope===m?.scope,depth:app.keymap.windowScopes.get(window)?.prevScopes?.length,keys:app.keymap.windowScopes.get(window)?.scope?.keys?.map(k=>({key:k.key,modifiers:k.modifiers}))}});window.modalEvents=[];for(const type of ['click','keydown','keyup','focusin','focusout'])document.addEventListener(type,e=>modalEvents.push({type,key:e.key,action:e.target.dataset?.healthAction,...modalSnapshot(null)}),true);window.modalObserver=new MutationObserver(records=>{for(const r of records)for(const [change,nodes] of [['added',r.addedNodes],['removed',r.removedNodes]])for(const n of nodes)if(n.nodeType===1&&(n.matches('.modal-container,.ai-taxonomy,.veynrel-health-home')||n.querySelector('.modal-container,.ai-taxonomy,.veynrel-health-home')))modalEvents.push({change,node:n.className,...modalSnapshot([...plugin.taxonomyModals].at(-1))});});modalObserver.observe(document.body,{childList:true,subtree:true});void 0`);
  const factory=await object('plugin.getToolsPort().openTagTaxonomy');
  const factorySource=await main.ev('plugin.getToolsPort().openTagTaxonomy.toString()');
  const classId=await binding(factory,factorySource.match(/new ([\w$]+)\(this\.app/)[1]);
  // CDP exposes closure bindings without constructing a modal or replacing a method.
  await main.send('Runtime.callFunctionOn',{objectId:classId,functionDeclaration:'function(){window.modalClass=this;}'});
  const source=await main.ev('modalClass.prototype.open.toString()');report.hostOpenSHA256=sha(source);
  const stackId=await binding(await object('modalClass.prototype.open'),source.match(/([\w$]+)\.push\(this,/)[1]);
  await main.send('Runtime.callFunctionOn',{objectId:stackId,functionDeclaration:'function(){const stack=this;window.modalStackReader=()=>({type:stack.windowStacks.get(window)?.constructor?.name,keys:Object.keys(stack.windowStacks.get(window)??{}),items:Array.isArray(stack.windowStacks.get(window))?stack.windowStacks.get(window).map(m=>({type:m.constructor.name,connected:m.modalEl?.isConnected,contentConnected:m.contentEl?.isConnected,ownerMain:m.contentEl?.ownerDocument===document})):undefined});}'});
  for(const name of ['open','onOpen','render','close','onClose'])await traceFunction(await object('modalClass.prototype.'+name),'Modal.'+name);
  const healthName=fs.readFileSync(build+'/main.js','utf8').match(/[\w$]+\(([\w$]+),"VeynrelHealthView"\)/)[1];
  const healthId=await binding(factory,healthName);
  await main.send('Runtime.callFunctionOn',{objectId:healthId,functionDeclaration:'function(){window.healthClass=this;}'});
  for(const name of ['onOpen','render','onClose'])await traceFunction(await object('healthClass.prototype.'+name),'Workspace.'+name);
  report.before=await main.ev('({settings:JSON.stringify(plugin.settings),io:structuredClone(io)})');
  await main.ev("io.phase='passive';app.commands.commands['ai-knowledge-hub:veynrel-open-health'].callback()");
  report.commandCompleted=await main.ev('performance.now()');
  await wait("!!app.workspace.getLeavesOfType('veynrel-health')[0]?.view?.tools");
  await main.ev("window.healthView=app.workspace.getLeavesOfType('veynrel-health')[0].view;void 0");
  await traceFunction(await object('healthView.tools.openTagTaxonomy'),'button-handler/factory');
  if(mode==='taxonomy') await main.ev("healthView.navigate({page:'tools'});void 0");
  const selector=mode==='taxonomy'?'[data-health-action=tool-openTagTaxonomy]':'[data-health-action=organization-audit]';
  await wait('!!document.querySelector('+JSON.stringify(selector)+')');
  for(const phase of ['first','reopen']) {
    report.phase=phase;await focus();await main.ev(`document.querySelector(${JSON.stringify(selector)}).focus();void 0`);
    await key('Enter','Enter',13,'\r');await wait("!!document.querySelector('.ai-taxonomy')");
    await main.ev('window.audit=[...plugin.taxonomyModals].at(-1);void 0');
    report.lifecycle.push({phase,snapshot:await main.ev('modalSnapshot(audit)')});
    await shot(phase);
    report.animationStates??=[];report.animationStates.push(await main.ev('audit.containerEl.getAnimations({subtree:true}).map(a=>({state:a.playState,timing:a.effect.getTiming()}))'));
    await main.ev('Promise.all(audit.containerEl.getAnimations({subtree:true}).map(a=>a.finished))');await focus();await key('Escape','Escape',27);await wait("!document.querySelector('.ai-taxonomy')");
    assert.equal(await main.ev('plugin.taxonomyModals.size'),0);report.checks.push(phase+' opens once and closes with Escape');
  }
  report.after=await main.ev('({settings:JSON.stringify(plugin.settings),io:structuredClone(io)})');
  assert.equal(report.after.settings,report.before.settings,'Passive UI preserves settings');
  assert.equal(report.after.io.metadata,report.before.io.metadata,'No passive metadata scan');
  assert.deepEqual(report.after.io.reads,report.before.io.reads,'No passive Markdown reads');
  assert.deepEqual(report.after.io.writes,report.before.io.writes,'No passive Markdown writes');
  assert.deepEqual(report.after.io.creates,report.before.io.creates,'No passive note creation');
  for(const [name,text] of Object.entries(originals))assert.equal(fs.readFileSync(vault+'/'+name,'utf8'),text);
  assert.equal(modelRequests.length,0);assert.equal(report.exceptions.length,0);assert.equal(report.consoleErrors.length,0);assert(!report.diagnosticError);
  report.checks.push('Settings and Markdown preserved; no passive scan, read, write or model call; no uncaught exception/console error');report.status='PASS';
} catch(e) {report.status='FAIL';report.error=String(e.stack??e);process.exitCode=1;}
finally {
  if(main)try{report.final=await main.ev('({io,events:modalEvents,ui:{route:healthView.route,preferences:plugin.settings.health},snapshot:modalSnapshot([...plugin.taxonomyModals].at(-1)),modals:plugin.taxonomyModals.size})');}catch(e){report.captureError=String(e);}
  report.modelRequests=modelRequests;for(const key of ['before','after'])if(report[key])report[key].settings=sha(report[key].settings);
  fs.writeFileSync(root+'/report.json',JSON.stringify(report,null,2)+'\n');
  for(const c of connections)c.socket.close();child.kill('SIGTERM');server.close();
  console.log(JSON.stringify({root,status:report.status,error:report.error,checks:report.checks}));
}
