// Native input, synthetic notes and local HTTP only; production builder/parser/writer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
export async function atomizationChecks(c) {
 const {ev,wait,click,clickSelector,shot,startVideo,stopVideo,pass,locale,cdp,pause,settle,root,vault,before,markdown,requests,checks,metrics,screenshots,sourceCommit}=c;
 const stage=s=>wait(`document.querySelector('[data-atom-stage="${s}"]')`);
 const key=async name=>{const n={Enter:13,Escape:27,Tab:9}[name];await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:n,...(name==='Enter'?{text:'\r'}:{})});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name,windowsVirtualKeyCode:n});await settle();};
 const keyboard=async action=>{await ev(`document.querySelector('[data-health-action="${action}"]').focus();void 0`);await key('Enter');};
 await ev("await app.vault.createFolder('Atomization');void 0");
 const original='# Synthetic source\n\nA source can describe two independent concepts.\n\nAll original text and trailing spaces remain.  \n';
 const names=['Cancel','Preview','Stale','Collision','Partial','Editor','Menu','Write refusal','Appearance'];
 for(const name of names)await ev(`await app.vault.create(${JSON.stringify('Atomization/'+name+'.md')},${JSON.stringify(original)});void 0`);
 const samples=markdown(vault); await ev("plugin.settings.atomsLocation='folder';void 0");
 const open=async name=>{
  await ev(`plugin.settings.atomsFolder=${JSON.stringify('Generated/'+name)};void 0`);
  await click('process-atomization');await wait("!!document.querySelector('.prompt-input')");
  await cdp('Input.insertText',{text:'Atomization/'+name+'.md'});await pause(200);await key('Enter');await stage('consent');
 };
 const generate=async()=>{
  const expected=await ev("[...plugin.atomizationModals][0].session.user");
  const system=await ev("[...plugin.atomizationModals][0].session.system");
  assert.equal(await ev("document.querySelector('.veynrel-atom-literal').textContent"),expected);
  const n=requests.length; await keyboard('atom-generate');await stage('proposals'); assert.equal(requests.length,n+1);
  assert.deepEqual(JSON.parse(requests.at(-1)).messages,[{role:'system',content:system},{role:'user',content:expected}]);
  checks.push('Consent saved text equals real HTTP request '+requests.length);
 };
 const closed=()=>wait('plugin.atomizationTasks.size===0');
 await click('nav-process');await wait("!!document.querySelector('[data-health-action=process-atomization]')");await shot('processing-atomization');
 await pass('Three cards; atomization replaces duplicate review entrance',"document.querySelectorAll('.veynrel-processing-card').length===3&&!document.querySelector('[data-health-action=process-workbench]')");
 await open('Cancel');await shot('atom-consent-ru-dark');await ev("document.querySelector('[data-health-action=atom-cancel]').focus();void 0");await key('Tab');await pass('Native Tab reaches the explicit AI consent button',"document.activeElement.dataset.healthAction==='atom-generate'");await key('Escape');await closed(); assert.equal(requests.length,0);assert.deepEqual(markdown(vault),samples);checks.push('Native picker and Escape before AI: zero requests and writes');
 await startVideo('atomization-route');await open('Preview');await generate();await shot('atom-proposals');assert.deepEqual(markdown(vault),samples);
 await clickSelector('[data-atom-id="1"]');await click('atom-review');await stage('review');await shot('atom-exact-review');assert.deepEqual(markdown(vault),samples);
 await click('atom-back');await stage('proposals');await click('atom-cancel');await closed();assert.deepEqual(markdown(vault),samples);checks.push('Proposal exclusion, review, back and cancellation preserve every Markdown byte');
 await open('Stale');await generate();await click('atom-review');await stage('review');
 await ev("await app.vault.modify(app.vault.getFileByPath('Atomization/Stale.md'),'Synthetic manual edit before writing.');void 0");
 await click('atom-apply');await stage('result');await shot('atom-stale-refusal');await pass('Stale source refuses before folder creation',"!app.vault.getAbstractFileByPath('Generated/Stale')&&!!document.querySelector('[role=alert]')");await click('atom-close');await closed();
 await ev("await app.vault.createFolder('Generated/Collision');void 0");await open('Collision');await generate();await click('atom-review');await stage('review');
 await ev("await app.vault.create('Generated/Collision/Atomic concept Alpha.md','External synthetic owner');void 0");
 await click('atom-apply');await stage('result');await shot('atom-collision-refusal');assert.equal(fs.readFileSync(vault+'/Generated/Collision/Atomic concept Alpha.md','utf8'),'External synthetic owner');await click('atom-close');await closed();checks.push('Destination appeared after review: existing contents preserved');
 await open('Partial');await generate();await click('atom-review');await stage('review');
 await ev("window.atomCreate=app.vault.create.bind(app.vault);window.failAtomOnce=true;app.vault.create=(p,text,...args)=>{if(p==='Generated/Partial/Atomic concept Beta.md'&&failAtomOnce){failAtomOnce=false;return Promise.reject(Error('synthetic disk failure'))}return atomCreate(p,text,...args)};void 0");
 const beforeRetry=requests.length;await click('atom-apply');await stage('result');await shot('atom-partial');
 await pass('Partial result names one created file and leaves source untouched',"[...plugin.atomizationModals][0].session.createdPaths.length===1&&![...plugin.atomizationModals][0].session.done");assert.equal(fs.readFileSync(vault+'/Atomization/Partial.md','utf8'),original);
 await click('atom-retry');await stage('review');await shot('atom-partial-recheck');await keyboard('atom-apply');await stage('result');await shot('atom-success');
 await pass('Explicit retry completes without a second model request',"[...plugin.atomizationModals][0].session.done&&[...plugin.atomizationModals][0].session.createdPaths.length===2");assert.equal(requests.length,beforeRetry);assert(fs.readFileSync(vault+'/Atomization/Partial.md','utf8').startsWith(original));await click('atom-close');await closed();await stopVideo();
 await open('Write refusal');await generate();await click('atom-review');await stage('review');
 await ev("app.vault.create=(p,text,...args)=>p.startsWith('Generated/Write refusal/')?Promise.reject(Error('synthetic read-only target')):atomCreate(p,text,...args);void 0");
 await click('atom-apply');await stage('result');await shot('atom-write-refusal');await pass('First-write refusal is not success and reports zero created files',"![...plugin.atomizationModals][0].session.done&&[...plugin.atomizationModals][0].session.createdPaths.length===0");await click('atom-close');await closed();await ev('app.vault.create=atomCreate;void 0');
 // Entrances from a real Markdown editor, including the native context menu.
 for(const name of ['Editor','Menu']){
  await ev(`window.atomLeaf=app.workspace.getLeaf('tab');await atomLeaf.openFile(app.vault.getFileByPath('Atomization/${name}.md'));plugin.settings.atomsFolder='Generated/${name}';void 0`);
  if(name==='Editor')await ev("app.commands.executeCommandById('ai-knowledge-hub:ai-atomize-note');void 0");
  else {
   const r=await ev("atomLeaf.view.contentEl.querySelector('.cm-content').getBoundingClientRect().toJSON()");
   await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x+40,y:r.y+25,button:'right',clickCount:1});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x+40,y:r.y+25,button:'right',clickCount:1});
   await wait("[...document.querySelectorAll('.menu-item')].some(e=>e.textContent.includes('атомарные'))");
   await ev("[...document.querySelectorAll('.menu-item')].find(e=>e.textContent.includes('атомарные')).setAttribute('data-native-atom-menu','true');void 0");await clickSelector('[data-native-atom-menu]');
  }
  await stage('consent');const count=requests.length;await shot('atom-'+name.toLowerCase()+'-consent');
  if(name==='Editor'){
   await generate();await click('atom-review');await stage('proposals');await shot('atom-editor-guard');await pass('Open source editor blocks write review',"!!document.querySelector('.veynrel-atom-flow [role=alert]')");
   await click('atom-close-tabs');await wait("!app.workspace.getLeavesOfType('markdown').some(l=>l.view.file?.path==='Atomization/Editor.md')");await pass('Explicit close-saved-tabs preserves the generated proposals',"!app.workspace.getLeavesOfType('markdown').some(l=>l.view.file?.path==='Atomization/Editor.md')");await click('atom-review');await stage('review');await click('atom-cancel');
  } else {await click('atom-cancel');assert.equal(requests.length,count);await ev('atomLeaf.detach();void 0');}
  await closed();checks.push(name+' entrance cannot bypass consent');
 }
 await ev('app.workspace.setActiveLeaf(hv.leaf,{focus:true});void 0');await click('nav-process');
 for(const language of ['ru','en'])for(const theme of ['theme-dark','theme-light'])for(const width of [1280,390]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await locale(language);
  await ev(`document.body.removeClass('theme-dark','theme-light');document.body.addClass('${theme}');hv.render();void 0`);
  await shot(`processing-atom-${language}-${theme}-${width}`);await open('Appearance');await shot(`atom-consent-${language}-${theme}-${width}`);
  await pass(`Consent fits ${language}/${theme}/${width}`,"[...document.querySelectorAll('.veynrel-atom-flow')].every(e=>e.scrollWidth<=e.clientWidth+1)");
  await generate();await shot(`atom-proposals-${language}-${theme}-${width}`);await click('atom-review');await stage('review');await shot(`atom-review-${language}-${theme}-${width}`);
  if(width===390){await ev("document.querySelector('[data-health-action=atom-apply]').scrollIntoView({block:'center'});void 0");await shot(`atom-review-actions-${language}-${theme}-${width}`);}
  const contrast=await ev(`(()=>{const e=document.querySelector('.veynrel-atom-flow .mod-cta'),s=getComputedStyle(e),c=document.createElement('canvas'),ctx=c.getContext('2d');c.width=c.height=1;const lum=p=>[...p].slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);ctx.fillStyle=s.backgroundColor;ctx.fillRect(0,0,1,1);const bg=lum(ctx.getImageData(0,0,1,1).data);ctx.fillStyle=s.color;ctx.fillRect(0,0,1,1);const fg=lum(ctx.getImageData(0,0,1,1).data);return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)})()`);assert(contrast>=4.5);metrics.buttonContrast??=[];metrics.buttonContrast.push({language,theme,width,ratio:contrast});
  await pass(`Review keyboard and width ${language}/${theme}/${width}`,"[...document.querySelectorAll('.veynrel-atom-flow')].every(e=>e.scrollWidth<=e.clientWidth+1)");await keyboard('atom-cancel');await closed();
 }
 await cdp('Emulation.clearDeviceMetricsOverride');await ev("require('@electron/remote').getCurrentWebContents().setZoomFactor(2);void 0");await pause(250);await open('Appearance');await shot('atom-200-percent');await pass('Consent at global 200% zoom has reachable controls',"document.querySelector('.veynrel-atom-flow').scrollWidth<=document.querySelector('.veynrel-atom-flow').clientWidth+1");await keyboard('atom-cancel');await closed();await ev("require('@electron/remote').getCurrentWebContents().setZoomFactor(1);void 0");
 for(const name of names.filter(n=>!['Partial','Stale'].includes(n)))assert.equal(fs.readFileSync(vault+'/Atomization/'+name+'.md','utf8'),original);
 for(const [p,h]of Object.entries(before))assert.equal(markdown(vault)[p],h);
 assert.equal(await ev('io.network'),0);
 metrics.runtime=await ev("({obsidian:require('@electron/remote').app.getVersion(),electron:process.versions.electron})");
 checks.push('Original six review notes unchanged; all cancelled atomization sources byte-identical; source retained after confirmed write; no Undo claimed');
 fs.writeFileSync(root+'/report.json',JSON.stringify({sourceCommit,checks,metrics,screenshots,httpRequests:requests.length,httpDestination:'loopback only',originalReviewMarkdownUnchanged:true,liveModel:'NOT RUN',partialFailure:'injected Vault.create rejection; actual remaining writes and parser',before:samples,after:markdown(vault)},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,root}));
}
