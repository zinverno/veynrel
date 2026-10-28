// Synthetic native acceptance: npm run build, then node scripts/studio-excalidraw-native.mjs
// /tmp/veynrel-diagram-native-<unique> /tmp/veynrel-excalidraw-2.29.0-assets
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../', import.meta.url)), root = process.argv[2], assets = process.argv[3];
assert(root?.startsWith('/tmp/veynrel-diagram-native-') && !root.includes('..') && !fs.existsSync(root));
assert.equal(JSON.parse(fs.readFileSync(`${assets}/manifest.json`, 'utf8')).version, '2.29.0');
const vault = `${root}/vault`, config = `${vault}/.obsidian`, profile = `${root}/profile`;
fs.mkdirSync(`${config}/plugins`, { recursive: true }); fs.mkdirSync(profile); fs.mkdirSync(`${vault}/Drawings`);
const originals = { 'Source.md': '# Request processing\n\nReceive a request. Check whether the data are valid. If yes, accept it. If no, ask for corrections, then receive it again.\n\nA separate glossary contains definitions.\n', 'Untouched.md': '# Never read this note\nPrivate synthetic control.\n' };
for (const [path, raw] of Object.entries(originals)) fs.writeFileSync(`${vault}/${path}`, raw);
const graph = { schemaVersion: 1, kind: 'flowchart', title: 'Request processing', nodes: [
  { id: 'receive', label: 'Receive request', shape: 'rectangle' }, { id: 'check', label: 'Data valid?', shape: 'diamond' },
  { id: 'accept', label: 'Accept', shape: 'ellipse' }, { id: 'reject', label: 'Ask for corrections', shape: 'rectangle' },
  { id: 'glossary', label: 'Glossary\n![[Untouched]] [link](https://model-data.invalid/x) obsidian://open <script>', shape: 'rectangle' },
], edges: [{ id: 'e1', from: 'receive', to: 'check', label: '' }, { id: 'e2', from: 'check', to: 'accept', label: 'Yes' },
  { id: 'e3', from: 'check', to: 'reject', label: 'No' }, { id: 'e4', from: 'reject', to: 'receive', label: 'Retry' }] };
const sha = raw => createHash('sha256').update(raw).digest('hex');
const report = { checks: [], screenshots: [], exceptions: [], network: [], artifacts: {}, versions: {}, requests: [],
  limits: 'Synthetic model via real callOpenRouter/requestUrl HTTP path. No paid API or real-model quality claim. Linux desktop only; no physical mobile or screen-reader claim.' };
for (const [id, from] of [['ai-knowledge-hub', ROOT], ['obsidian-excalidraw-plugin', assets]]) {
  const to = `${config}/plugins/${id}`; fs.mkdirSync(to);
  for (const name of ['main.js', 'styles.css', 'manifest.json']) { fs.copyFileSync(`${from}/${name}`, `${to}/${name}`); report.artifacts[`${id}/${name}`] = sha(fs.readFileSync(`${to}/${name}`)); }
}
let providerMode = 'normal', releaseProvider;
const server = createServer(async (req, res) => {
  let body = ''; for await (const chunk of req) body += chunk; assert.equal(req.url, '/v1/chat/completions'); report.requests.push(body);
  if (providerMode === 'defer') await new Promise(resolve => { releaseProvider = resolve; });
  const kind = JSON.parse(body).messages[0].content.includes('structural diagram') ? 'structure' : 'flowchart';
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ...graph, kind }) }, finish_reason: providerMode === 'length' ? 'length' : 'stop' }] }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
fs.writeFileSync(`${config}/plugins/ai-knowledge-hub/data.json`, JSON.stringify({ language: 'en', provider: 'ollama', model: 'diagram-synthetic', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: '', semanticAutoSyncSuspended: true, semantic: { enabled: false }, decisions: { enabled: false }, companion: { enabled: false }, health: { onboardingCompleted: true } }));
fs.writeFileSync(`${config}/plugins/obsidian-excalidraw-plugin/data.json`, JSON.stringify({ checkForUpdates: false, showReleaseNotes: false, showWelcomeModal: false, autoexportSVG: true, autoexportPNG: true, autoexportExcalidraw: false, compress: true, matchTheme: true, enableOnloadScripts: false, startupScriptPath: '', templateFilePath: 'Untouched.md' }));
// Begin with Excalidraw installed but disabled; enable only inside this disposable vault.
fs.writeFileSync(`${config}/community-plugins.json`, '["ai-knowledge-hub"]');
fs.writeFileSync(`${config}/app.json`, '{"checkForUpdates":false}');
fs.writeFileSync(`${profile}/obsidian.json`, JSON.stringify({ updateDisabled: true, vaults: { diagrams: { path: vault, ts: Date.now(), open: true } } }));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const start = () => spawn('/usr/bin/electron43', ['/usr/lib/obsidian/app.asar', `--user-data-dir=${profile}`, '--remote-debugging-port=9291', '--disable-gpu', '--ozone-platform=x11'], { stdio: ['ignore', 'ignore', fs.openSync(`${root}/electron.log`, 'a')] });
let child, socket, sequence = 0;
const pending = new Map();
const cdp = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++sequence, { resolve, reject }); socket.send(JSON.stringify({ id: sequence, method, params })); });
const ev = async expression => { const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
const wait = async expression => { for (let i = 0; i < 400; i++) { if (await ev(expression)) return; await pause(50); } throw Error(`Timeout: ${expression}; ${await ev('document.body.innerText.slice(-2500)')}`); };
const pass = async (name, expr) => { if (expr) assert(await ev(expr), name); report.checks.push(name); console.log(name); };
async function connect() {
  let page; for (let i = 0; i < 300; i++) { try { page = (await (await fetch('http://127.0.0.1:9291/json/list')).json()).find(p => p.url.startsWith('app://obsidian.md/')); } catch {} if (page) break; await pause(100); }
  assert(page, 'native page ready'); socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => { const m = JSON.parse(event.data); if (m.method === 'Runtime.exceptionThrown') report.exceptions.push(m.params); if (m.method === 'Network.requestWillBeSent') report.network.push({ url: m.params.request.url, type: m.params.type }); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (p) m.error ? p.reject(m.error) : p.resolve(m.result); } };
  await cdp('Runtime.enable'); await cdp('Debugger.enable'); await cdp('Network.enable');
  await wait('!!window.app?.workspace?.layoutReady'); assert.equal(await ev('app.vault.adapter.basePath'), vault);
  await wait("!!app.plugins.plugins['ai-knowledge-hub']?.studio || !!document.querySelector('.mod-trust-folder')");
  if (await ev("!!document.querySelector('.mod-trust-folder')")) await ev("[...document.querySelectorAll('.mod-trust-folder button')].find(e=>/Trust author/.test(e.textContent)).click();void 0");
  await wait("!!app.plugins.plugins['ai-knowledge-hub']?.studio?.diagrams");
  await ev("window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.studio=plugin.studio;window.d=studio.diagrams;window.io={reads:[],creates:[]};const read=app.vault.read.bind(app.vault),create=app.vault.create.bind(app.vault);app.vault.read=async f=>{io.reads.push(f.path);return read(f)};app.vault.create=async(p,s,o)=>{io.creates.push(p);return create(p,s,o)};void 0");
  await cdp('Page.bringToFront');
}
const click = async (action, modal = false) => {
  const selector = `${modal ? '.veynrel-studio-dialog' : '.veynrel-studio'} [data-studio-action="${action}"]`;
  await cdp('Page.bringToFront'); await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  const point = await ev(`(async()=>{const e=document.querySelector(${JSON.stringify(selector)});for(let a=e.parentElement;a;a=a.parentElement)if(a.tagName==='DETAILS')a.open=true;e.scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(r));const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, ...point, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) });
};
const shot = async name => { fs.writeFileSync(`${root}/${name}.png`, Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64')); report.screenshots.push(`${name}.png`); };
async function studioOpen() { await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-studio');void 0"); await wait("!!document.querySelector('[data-studio-action=diagram]')"); await click('diagram'); }
// CSS alpha backgrounds are composited over their actual ancestor surfaces, without rounding.
function measuredColors(element) {
 const win=element.ownerDocument.defaultView,s=win.getComputedStyle(element);
 const rgba=value=>{if(!/^rgba?\(/.test(value))throw Error(`Unsupported computed color: ${value}`);const v=value.match(/[\d.]+/g).map(Number);return [v[0],v[1],v[2],v[3]??1]};
 const layers=[];for(let e=element;e;e=e.parentElement){const c=rgba(win.getComputedStyle(e).backgroundColor);layers.push(c);if(c[3]===1)break;}
 if(layers.at(-1)[3]!==1)throw Error('No measured opaque ancestor');
 let background=[0,0,0];for(const c of layers.reverse())background=background.map((b,i)=>c[i]*c[3]+b*(1-c[3]));
 const text=rgba(s.color);return {background:s.backgroundColor,text:s.color,border:s.borderColor,primary:s.getPropertyValue('--background-primary').trim(),secondary:s.getPropertyValue('--background-secondary').trim(),effectiveBackground:background,effectiveText:background.map((b,i)=>text[i]*text[3]+b*(1-text[3]))};
}
// Inspect real enabled controls with pointer hover and keyboard-visible focus.
async function actionStates(selector, label) {
 const samples=[];
 for(const state of ['normal','hover','focus']) {
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});
  await ev("document.activeElement?.blur();void 0");
  const point=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing active action');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  if(state==='hover')await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
  if(state==='focus'){for(const type of ['keyDown','keyUp'])await cdp('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab'});await ev(`document.querySelector(${JSON.stringify(selector)}).focus();void 0`);for(const type of ['keyDown','keyUp'])await cdp('Input.dispatchKeyEvent',{type,key:'Shift',code:'ShiftLeft',modifiers:type==='keyDown'?8:0});}
  await pause(150);
  const sample=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),s=getComputedStyle(e);let p=e.parentElement;while(p.parentElement&&getComputedStyle(p).backgroundColor==='rgba(0, 0, 0, 0)')p=p.parentElement;
   const probe=e.ownerDocument.createElement('span');e.append(probe);probe.style.background='var(--${state==='hover'?'interactive-hover':'interactive-normal'})';probe.style.color='var(--text-normal)';const ps=getComputedStyle(probe),tokens={background:ps.backgroundColor,text:ps.color};probe.remove();
   return {...(${measuredColors.toString()})(e),image:s.backgroundImage,opacity:s.opacity,fontSize:s.fontSize,fontWeight:s.fontWeight,border:s.borderWidth,outline:s.outlineColor,outlineWidth:s.outlineWidth,outlineStyle:s.outlineStyle,offset:s.outlineOffset,surface:(${measuredColors.toString()})(p).effectiveBackground,focused:e.ownerDocument.activeElement===e,focusVisible:e.matches(':focus-visible'),hover:e.matches(':hover'),tokens};})()`);
  const lum=c=>{if(!Array.isArray(c)){assert(c.startsWith('rgb('),c);c=c.match(/[\d.]+/g).slice(0,3)}return c.map(x=>{const n=Number(x)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0)};
  const ratio=(a,b)=>{a=lum(a);b=lum(b);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  const measurement={label,state,...sample,textRatio:ratio(sample.effectiveText,sample.effectiveBackground),focusRatio:ratio(sample.outline,sample.surface)};
  samples.push(measurement);report.actionSamples.push(measurement);
  assert.equal(sample.text,sample.tokens.text,`${label} ${state}: text token`);assert.equal(sample.background,sample.tokens.background,`${label} ${state}: neutral surface token`);
  assert.equal(sample.image,'none');assert.equal(sample.opacity,'1');assert(measurement.textRatio>=4.5,`${label} ${state}: text contrast ${measurement.textRatio}`);
  assert(Number(sample.fontWeight)>=600&&parseFloat(sample.border)>=1,'priority also conveyed by weight and border');
  if(state==='focus'){assert(sample.focused&&parseFloat(sample.outlineWidth)>=2&&sample.outlineStyle==='solid'&&parseFloat(sample.offset)>=2);assert(measurement.focusRatio>=3,`${label} focus contrast ${measurement.focusRatio}`);}
  if(state==='hover')assert(sample.hover);
 }
 return samples;
}
async function locale(language) {
  await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
  await ev(`{const s=[...app.setting.modalEl.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='ru'));s.value='${language}';s.dispatchEvent(new Event('change'));}void 0`);
  await ev('plugin.settingsSave'); await ev('app.setting.close();void 0');
  await ev("app.workspace.getLeavesOfType('veynrel-studio').forEach(l=>l.detach());void 0"); await studioOpen();
}
const themeRoot = process.env.VEYNREL_THEME_FIXTURE;
if (themeRoot) for (const n of ['appearance.json','themes','snippets']) if(fs.existsSync(`${themeRoot}/${n}`)) fs.cpSync(`${themeRoot}/${n}`,`${config}/${n}`,{recursive:true});

try {
 child=start(); await connect(); await studioOpen(); await locale('ru');
 await cdp('Emulation.setDeviceMetricsOverride',{width:1649,height:928,deviceScaleFactor:1,mobile:false});
 await ev("app.workspace.leftSplit.expand();void 0");
 await shot('diagram-unavailable-desktop');
 await ev("app.plugins.enablePluginAndSave('obsidian-excalidraw-plugin')"); await wait("d.adapter.capability().state==='ready'");
 await ev("document.querySelectorAll('.modal-close-button').forEach(e=>e.click());void 0"); await click('diagram-refresh');
 for (const route of ['diagram','library','history']) {await click(route);await pause(300);await shot(`${route}-desktop`);}
 await ev("(async()=>{const leaf=app.workspace.getLeaf('split');await leaf.setViewState({type:'veynrel-health',active:true});})()");
 await wait("!!document.querySelector('.veynrel-health-view')"); await click('library'); await pause(400); await shot('health-studio-pair');
 report.colors=await ev("[...document.querySelectorAll('.veynrel-health-view,.veynrel-studio')].map(e=>({root:e.className,background:getComputedStyle(e).backgroundColor,primary:getComputedStyle(e).getPropertyValue('--background-primary'),accent:getComputedStyle(e).getPropertyValue('--interactive-accent')}))");
 // Real theme/accent changes in this disposable profile; no injected palette.
 report.matrix=[];
 for(const name of ['Red Graphite','','Minimal']) for(const mode of ['obsidian','moonstone']) for(const accent of ['#7c009e','#087f8c']) {
   await ev(`app.customCss.setTheme(${JSON.stringify(name)});app.changeTheme(${JSON.stringify(mode)});app.setAccentColor(${JSON.stringify(accent)});void 0`);await pause(400);
   await pass(`${name||'Default'} ${mode} class is active`,`document.body.classList.contains('${mode==='obsidian'?'theme-dark':'theme-light'}')`);
   const sample=await ev(`(()=>{const health=document.querySelector('.veynrel-health-view'),studioEl=document.querySelector('.veynrel-studio');
     const control=document.createElement('div');control.className='theme-native-control';document.querySelector('.workspace-leaf-content').append(control);
     const studioPrimary=studioEl.createEl('button',{cls:'mod-cta',text:'Measure'}),healthPrimary=health.createEl('button',{cls:'mod-cta',text:'Measure'});
     const normal=control.createEl('button',{text:'Native'}),primary=control.createEl('button',{text:'Native primary',cls:'mod-cta'}),field=control.createEl('input',{type:'text'});
     const colors=${measuredColors.toString()};
     const result={health:colors(health),studio:colors(studioEl),healthSurface:colors(health.querySelector('.veynrel-core-panel')),studioField:colors(studioEl.querySelector('input')),healthField:colors(health.querySelector('select')),nativeField:colors(field),nativeButton:colors(normal),nativePrimary:colors(primary),studioPrimary:colors(studioPrimary),healthPrimary:colors(healthPrimary)};control.remove();studioPrimary.remove();healthPrimary.remove();return result;})()`);
   const luminance=color=>{if(!Array.isArray(color)){assert(color.startsWith('rgb('),color);color=color.match(/[\d.]+/g).slice(0,3)}return color.map(x=>{const n=Number(x)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0)};
   const contrast=(a,b)=>{a=luminance(a);b=luminance(b);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
   const ratios={text:contrast(sample.studio.effectiveText,sample.studio.effectiveBackground),healthSurface:contrast(sample.healthSurface.effectiveText,sample.healthSurface.effectiveBackground),nativePrimary:contrast(sample.nativePrimary.effectiveText,sample.nativePrimary.effectiveBackground),studioPrimary:contrast(sample.studioPrimary.effectiveText,sample.studioPrimary.effectiveBackground)};
   report.matrix.push({name:name||'Default',mode,accent,...sample,ratios});
   assert(ratios.text>=4.5 && ratios.healthSurface>=4.5 && ratios.studioPrimary>=4.5,'primary, panel and neutral action text contrast');
   assert.equal(sample.health.background,sample.studio.background,'same host primary');
   assert.equal(sample.studioPrimary.background,sample.nativeButton.background,'Studio native neutral background');
   assert.equal(sample.studioPrimary.text,sample.nativeButton.text,'Studio native neutral text');
   assert.equal(sample.healthPrimary.background,sample.nativeButton.background,'Health native neutral background');
   assert.equal(sample.health.text,sample.studio.text,'same host text');
   assert.equal(sample.studioField.background,sample.nativeField.background,'host field background');
   assert.equal(sample.healthField.background,sample.nativeField.background,'Health host field background');
   await shot(`pair-${name||'Default'}-${mode}-${accent.slice(1)}`);
 }
 await pass('12 live theme/accent pairs inherit matching host surfaces, text and fields');
 await ev("app.customCss.setTheme('Red Graphite');app.changeTheme('obsidian');app.setAccentColor('#7c009e');app.workspace.getLeavesOfType('veynrel-health').forEach(l=>l.detach());void 0");await pause(300);
 await click('diagram');
 await pass('Idle has no operation completion and compact picker has no initial file list',"document.querySelector('.veynrel-studio-operation').hidden && document.querySelectorAll('.veynrel-studio-picker label').length===0");
 await ev("document.querySelector('.veynrel-studio input[type=search]').focus();void 0");await cdp('Input.insertText',{text:'Source'});
 await pass('Search reveals matching full path',"document.querySelector('.veynrel-studio-picker').textContent.includes('Source.md')");
 for(const key of ['Tab',' ']) for(const type of ['keyDown','keyUp']) await cdp('Input.dispatchKeyEvent',{type,key,code:key==='Tab'?'Tab':'Space'});
 await pass('Keyboard selection returns focus to search',"document.querySelector('.veynrel-studio-picked').textContent.includes('Source.md')&&document.activeElement.type==='search'");
 await ev("document.querySelector('input[value=structure]').focus();void 0");for(const type of ['keyDown','keyUp']) await cdp('Input.dispatchKeyEvent',{type,key:'ArrowRight',code:'ArrowRight'});
 await ev("const name=document.querySelector('[data-diagram-field=name]');name.value='My diagram';name.dispatchEvent(new Event('input'));void 0");
 await click('library');await click('diagram');
 await pass('Back retains source, kind and exact destination draft',"document.querySelector('.veynrel-studio-picked').textContent.includes('Source.md')&&document.querySelector('input[value=flowchart]').checked&&document.querySelector('[data-diagram-field=name]').value==='My diagram'");
 await pass('Desktop preparation action is visible with selected source',"(()=>{const r=document.querySelector('[data-studio-action=diagram-prepare]').getBoundingClientRect();return r.bottom<innerHeight&&r.top>0})()");await shot('diagram-selected-desktop');
 assert.equal(report.requests.length,0);assert.deepEqual(await ev('io.reads'),[]);
 await click('history');await wait("!!document.querySelector('[data-studio-action=history-diagram]')");
 await pass('Empty history offers real entry points without fictional drawing explanation',"!document.querySelector('.veynrel-studio-body').textContent.includes('Исходник не изменён')&&!document.querySelector('.veynrel-studio-body').textContent.includes('История схем')");
 await shot('empty-history');await click('history-diagram');
 const excalidraw='app.plugins.plugins["obsidian-excalidraw-plugin"]';
 for(const [label,version,autoexport] of [['version','2.28.0',false],['autoexport','2.29.0',true],['both','2.28.0',true]]) {
   await ev(`${excalidraw}.manifest.version='${version}';${excalidraw}.settings.autoexportExcalidraw=${autoexport};void 0`);await click('diagram-refresh');await shot(`unavailable-${label}`);
   const text=await ev("document.querySelector('.veynrel-studio-body [role=status]').textContent");
   assert.equal(text.includes('2.28.0'),label!=='autoexport');assert.equal(text.includes('автоматический экспорт'),label!=='version');
 }
 await ev(`${excalidraw}.manifest.version='2.29.0';${excalidraw}.settings.autoexportExcalidraw=false;void 0`);await click('diagram-refresh');
 await pass('Version and autoexport causes are independently actionable; draft retained',"document.querySelector('[data-diagram-field=name]').value==='My diagram'");
 await ev("(async()=>{const leaf=app.workspace.getLeaf('split');await leaf.setViewState({type:'veynrel-health',active:true});app.workspace.leftSplit.expand()})()");
 await cdp('Emulation.setDeviceMetricsOverride',{width:1800,height:928,deviceScaleFactor:1,mobile:false});await pause(200);
 report.split=await ev("[...document.querySelectorAll('.veynrel-health-view,.veynrel-studio')].map(e=>({class:e.className,width:e.clientWidth}))");assert(report.split.every(e=>e.width>680&&e.width<780));await shot('pair-real-split');
 await ev("app.workspace.getLeavesOfType('veynrel-health').forEach(l=>l.detach());void 0");
 for(const width of [1024,390]) {
   await cdp('Emulation.setDeviceMetricsOverride',{width,height:928,deviceScaleFactor:1,mobile:false});await ev("app.workspace.leftSplit.collapse();void 0");await pause(200);
   const actual=await ev("document.querySelector('.veynrel-studio').clientWidth");await cdp('Emulation.setDeviceMetricsOverride',{width:width+(width-actual),height:928,deviceScaleFactor:1,mobile:false});await pause(150);
   report.checks.push(`Measured Studio panel ${await ev("document.querySelector('.veynrel-studio').clientWidth")}px`);
   for(const route of ['diagram','library','history']) {await click(route);await pause(100);await shot(`${route}-${width}`);await pass(`${route} ${width} has no page overflow`,"document.querySelector('.veynrel-studio').scrollWidth<=document.querySelector('.veynrel-studio').clientWidth+1");}
 }
 await cdp('Emulation.setDeviceMetricsOverride',{width:1649,height:928,deviceScaleFactor:1,mobile:false});
 await ev("require('electron').webFrame.setZoomFactor(2);void 0");await click('diagram');await shot('diagram-200-percent');
 await ev("require('electron').webFrame.setZoomFactor(1);void 0");
 await click('diagram-prepare');await wait("d.state==='prepared'");await click('diagram-generate');await wait("!!d.proposal");
 const frozen=await ev('JSON.stringify(d.proposal)');const calls=report.requests.length;
 await ev("app.customCss.setTheme('Minimal');app.changeTheme('moonstone');app.setAccentColor('#087f8c');void 0");await pause(300);
 assert.equal(await ev('JSON.stringify(d.proposal)'),frozen);assert.equal(report.requests.length,calls);await shot('review-theme-change');
 await pass('Live theme change leaves immutable diagram scene/payload and provider count unchanged');
 report.actionSamples=[];
 await ev("(async()=>{const leaf=app.workspace.getLeaf('split');await leaf.setViewState({type:'veynrel-health',active:true});app.workspace.leftSplit.expand()})()");
 const proposalBeforeActions=await ev('JSON.stringify(d.proposal)'),requestCount=report.requests.length;
 for(const name of ['Red Graphite','','Minimal'])for(const mode of ['obsidian','moonstone'])for(const accent of ['#7c009e','#087f8c']) {
  await ev(`app.customCss.setTheme(${JSON.stringify(name)});app.changeTheme('${mode}');app.setAccentColor('${accent}');void 0`);await pause(400);
  const label=`${name||'Default'}/${mode}/${accent}`;
  await actionStates('.veynrel-health-view .veynrel-health-primary',`${label}/Health`);
  await actionStates('[data-studio-action=diagram-create-review]',`${label}/Studio`);
  if(name==='Red Graphite'&&mode==='obsidian'&&accent==='#7c009e')await shot('readable-red-graphite-health-studio');
  await click('diagram-create-review');await wait("!!document.querySelector('[data-studio-action=diagram-confirm-create]')");
  await actionStates('[data-studio-action=diagram-confirm-create]',`${label}/Confirmation`);
  if(name==='Red Graphite'&&mode==='obsidian'&&accent==='#7c009e')await shot('readable-red-graphite-confirmation-focus');
  for(const type of ['keyDown','keyUp'])await cdp('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait("!document.querySelector('.veynrel-studio-dialog')");
 }
 assert.equal(report.actionSamples.length,108);assert.equal(report.requests.length,requestCount);assert.equal(await ev('JSON.stringify(d.proposal)'),proposalBeforeActions);
 await pass('108 actual active-action states: text >=4.5, focus >=3, neutral tokens, no operation or proposal change');
 await ev("app.workspace.getLeavesOfType('veynrel-health').forEach(l=>l.detach());void 0");
 await ev("window.pop=app.workspace.openPopoutLeaf();pop.setViewState({type:'veynrel-studio',active:true})");await wait("!!pop.view.contentEl.querySelector('.veynrel-studio-body')");
 await ev("app.setAccentColor('#7c009e');app.changeTheme('obsidian');void 0");await pause(400);
 report.popout=await ev("(()=>{const e=pop.view.contentEl,w=e.ownerDocument.defaultView;return {differentWindow:w!==window,background:w.getComputedStyle(e).backgroundColor,primary:w.getComputedStyle(e).getPropertyValue('--background-primary'),theme:e.ownerDocument.body.className}})()");assert(report.popout.differentWindow);assert(report.popout.theme.includes('theme-dark'));
 await pass('Popout inherits live theme in its own document');await ev('pop.detach();void 0');
 await pause(200); assert.equal(report.exceptions.length,0,'No renderer exceptions');
 report.outcome='PASS';

} catch (e) {
  report.outcome = 'FAIL'; report.error = String(e?.stack ?? e);
  for(const x of report.exceptions) {try {const src=await cdp('Debugger.getScriptSource',{scriptId:x.exceptionDetails.stackTrace.callFrames[0].scriptId});report.exceptionSource=src.scriptSource.slice(x.exceptionDetails.columnNumber-400,x.exceptionDetails.columnNumber+500);}catch{}}
  try { report.ui = await ev('document.body.innerText.slice(-6000)'); report.runtime = await ev('({state:d.state,error:d.error,result:d.result,capability:d.adapter.capability()})'); await shot('failure'); } catch {}
  console.error(e); process.exitCode = 1;
} finally {
  fs.writeFileSync(`${root}/native-report.json`, JSON.stringify(report, null, 2));
  socket?.close(); child?.kill('SIGTERM'); server.closeAllConnections(); server.close();
}
