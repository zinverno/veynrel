import assert from 'node:assert/strict';
export async function runFollowupUX({main,wait,pass,shot,phase,key,focus,providerUrl,report,stopVideo,pause,connection,endpoint}) {
  const after=phase!=='before';
  const activate=async selector=>{await main.ev(`document.querySelector(${JSON.stringify(selector)}).focus();void 0`);await key('Enter','Enter',13,'\r');};
  const action=key=>`[data-health-action="${key}"]`;
  const home=async()=>{if(await main.ev("!!document.querySelector('[data-health-action=nav-home]')"))await activate(action('nav-home'));};
  const route=async name=>{await home();await activate(action('overview-'+name));};
  const language=async value=>{
    await main.ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await main.ev(`{const s=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));s.value='${value}';s.dispatchEvent(new Event('change'));}void 0`);
    await main.ev('plugin.settingsSave');await main.ev('app.setting.close();hv.render();void 0');await focus();
  };
  const size=async(width,height)=>{
    await main.ev(`window.electronWindow.setContentSize(${width+44},${height+80});void 0`);
    await wait(`Math.abs(hv.contentEl.getBoundingClientRect().width-${width})<60`);
    const offset=await main.ev('({w:innerWidth-Math.round(hv.contentEl.getBoundingClientRect().width),h:innerHeight-Math.round(hv.contentEl.getBoundingClientRect().height)})');
    await main.ev(`window.electronWindow.setContentSize(${width+offset.w},${height+offset.h});void 0`);
    await wait(`Math.round(hv.contentEl.getBoundingClientRect().width)===${width}&&Math.round(hv.contentEl.getBoundingClientRect().height)===${height}`);
  };
  const escape=()=>key('Escape','Escape',27);
  const hover=async selector=>{const p=await main.ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await main.send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await pause(250);};
  await wait('app.vault.getMarkdownFiles().every(f=>!!app.metadataCache.getFileCache(f))');
  await main.ev('app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();void 0');
  await pass('Overview has no passive plugin note IO',"hv.route.page==='home'&&uxIO.pluginRead===0&&uxIO.pluginWrite===0");
  await route('check');await activate(action('scan'));await wait('!!hv.controller.getState().outcome&&!hv.controller.getState().busy');
  await route('recall');await wait(`!!document.querySelector('${action('recall-refresh')}')`);await activate(action('recall-refresh'));await wait(`!!document.querySelector('${action('recall-start')}')`);
  await main.ev(`plugin.getSemanticSettingsPort().update({...plugin.settings.semantic,enabled:true,embeddingProvider:'ollama',embeddingModel:'overview-synthetic',embeddingBaseUrl:'${providerUrl}'})`);
  await main.ev('plugin.getSemanticController().refreshSemanticStatus()');
  if(phase!=='interactions') for(const lang of ['ru','en']) {
    await language(lang);
    for(const theme of ['dark','light']) {
      await main.ev(`app.changeTheme('${theme==='dark'?'obsidian':'moonstone'}');void 0`);
      for(const [width,height] of [[1280,830],[390,1090]]) {
        await size(width,height);const suffix=`${lang}-${theme}-${width}`;
        for(const name of ['batch','semantic']) {
          await route(name);await pause(100);
          await pass(`${name} ${suffix} fits`, 'hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1');
          await shot(`${phase}-${name}-${suffix}`);
          if(width===390){await main.ev('hv.contentEl.scrollTop=hv.contentEl.scrollHeight;void 0');await shot(`${phase}-${name}-bottom-${suffix}`);await main.ev('hv.contentEl.scrollTop=0;void 0');}
          if(after&&name==='semantic')await pass(`Semantic grid geometry ${suffix}`, `(()=>{const e=[...document.querySelectorAll('.veynrel-semantic-grid>a')].map(e=>e.getBoundingClientRect());return ${width===390?'e[1].y>=e[0].bottom&&e[2].y===e[1].y&&e[1].width>140':'e[1].y===e[0].y&&e[3].y>=e[0].bottom&&e[0].width>e[1].width*1.9'}})()`);
          if(after)await pass(`${name} whole panels`, `document.querySelectorAll('.veynrel-${name==='batch'?'processing':'semantic'}-grid > a').length===${name==='batch'?4:7}&&!document.querySelector('.veynrel-${name==='batch'?'processing':'semantic'}-grid a :is(button,a,input)')`);
        }
        await route('check');await activate('[data-health-action=category-links]');await main.ev("{const e=document.querySelector('[data-health-action=finding-search]');e.value='';e.dispatchEvent(new Event('input'));}void 0");
        await shot(`${phase}-findings-${suffix}`);
        await hover('[data-health-action^="repair-"]');await shot(`${phase}-finding-hover-${suffix}`);
        await main.ev("document.querySelector('[data-health-action^=repair-]').focus();void 0");await key('Tab','Tab',9);await key('Tab','Tab',9,undefined,8); // CDP modifier bit 8 is Shift; return to primary.
        await pass(`Primary finding action owns keyboard focus ${suffix}`, "document.activeElement.dataset.healthAction?.startsWith('repair-')&&document.activeElement.matches(':focus-visible')");
        await shot(`${phase}-finding-focus-${suffix}`);
        const search=action('finding-search');await main.ev(`document.querySelector('${search}').focus();void 0`);await main.send('Input.insertText',{text:'Long source'});await shot(`${phase}-finding-long-${suffix}`);
        await route('tools');await main.ev(`window.electronWindow.setContentSize(${width},${height});void 0`);await wait(`innerWidth===${width}&&innerHeight===${height}`);await activate(action('tool-chooser'));await wait("!!document.querySelector('.prompt-input')");await shot(`${phase}-chooser-${suffix}`,main,true);
        await escape();
        if(after){
          await main.ev("document.querySelector('[data-tool-segment=tools-process]').focus();void 0");await key('Enter','Enter',13,'\r');await wait("!!document.querySelector('.veynrel-tool-explanation')");await shot(`${phase}-explanation-${suffix}`,main,true);await escape();
        } else { report.checks.push(`Explanation absent at #156 (${suffix}); chooser captured, no invented before dialog`); }
        await size(width,height);
        if(lang==='ru') {
          await route('tools');await main.ev("document.querySelector('[data-tool-segment]').focus();void 0");await escape();await main.ev("document.querySelector('[data-health-heading]').focus();void 0");await main.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:5,y:5});await shot(`${phase}-ring-idle-${suffix}`);
          const p=await main.ev("(()=>{const r=document.querySelector('.veynrel-tool-wheel svg').getBoundingClientRect();return{x:r.x+r.width*276/460,y:r.y+r.height*58/460}})()");await main.send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await pause(800);await shot(`${phase}-ring-hover-${suffix}`);
          await home();await shot(`${phase}-overview-${suffix}`);
          if(!after&&theme==='dark'&&width===1280){await route('tools');await main.ev("document.querySelector('[data-tool-segment=tool-openAtomization]').focus();void 0");await key('Enter','Enter',13,'\r');await wait("!!document.querySelector('.prompt-input')");await shot('before-ring-enter-existing-picker',main,true);await escape();}
        }
      }
    }
  }
  if(!after){await stopVideo();return;}
  await language('en');await size(1280,830);await main.ev("app.changeTheme('obsidian');void 0");
  await route('tools');
  const ringPoint = await main.ev("(()=>{const r=document.querySelector('.veynrel-tool-wheel svg').getBoundingClientRect();return{x:r.x+r.width*276/460,y:r.y+r.height*58/460}})()");
  await main.send('Input.dispatchMouseEvent', {type:'mouseMoved', ...ringPoint});
  await pass('Mouse hover selects a ring segment', "!document.querySelector('[data-health-action=tool-open-selected]').hidden&&!document.querySelector('.veynrel-tool-explanation')");
  for (const type of ['mousePressed','mouseReleased']) await main.send('Input.dispatchMouseEvent', {type, button:'left', clickCount:1, ...ringPoint});
  await pass('Mouse click opens the segment explanation', "!!document.querySelector('.veynrel-tool-explanation')");
  await escape();
  await main.ev(`window.adapterIO={read:0,write:0};window.adapterEvents=[];for(const k of ['read','readBinary','write','writeBinary','append','mkdir','remove','rename']){const old=app.vault.adapter[k]?.bind(app.vault.adapter);if(old)app.vault.adapter[k]=(...a)=>{adapterIO[k.startsWith('read')?'read':'write']++;adapterEvents.push({kind:k,path:a[0],stack:new Error().stack});return old(...a)}};void 0`);
  const passive=async open=>{
    await pause(1500);report.adapterEvents=await main.ev('adapterEvents');const before=await main.ev('JSON.stringify({uxIO,adapterIO})'),requests=report.providerRequests.length,external=report.externalRequests.length;
    await open();await pause(300);
    report.adapterEvents=await main.ev('adapterEvents');assert.equal(await main.ev('JSON.stringify({uxIO,adapterIO})'),before,'Explanation must not read or write files');
    assert.equal(report.providerRequests.length,requests);assert.equal(report.externalRequests.length,external);report.checks.push('Explanation opens with zero note/index/file IO or provider requests');
  };
  await activate(action('tool-chooser'));
  await pass('Chooser keeps 12 catalog entries and 5 editor commands, all with native icons',"document.querySelectorAll('.veynrel-tool-choice').length===17&&[...document.querySelectorAll('.veynrel-tool-choice')].every(e=>e.querySelector('svg'))");
  await main.send('Input.insertText',{text:'Atomization'});await wait("document.querySelectorAll('.suggestion-item').length===1");
  await passive(()=>key('Enter','Enter',13,'\r'));
  await pass('Chooser selection opens the shared explanation',"!!document.querySelector('.veynrel-tool-explanation')&&!document.querySelector('.prompt-input')");
  await shot('after-chooser-explanation');
  await activate(action('tool-info-open'));await wait("!!document.querySelector('.prompt-input')");
  await pass('Open tool calls the existing Markdown picker',"!!plugin.atomizationPicker?.containerEl.isConnected");await shot('after-existing-atomization-picker');await escape();
  await main.ev("window.nativeLaunches=0;const original=plugin.atomizationPicker;void 0");
  await passive(async()=>{await main.ev("document.querySelector('[data-tool-segment=tool-openAtomization]').focus();void 0");await key('Enter','Enter',13,'\r');});
  await activate(action('tool-info-cancel'));await pause(50);
  await pass('Ring Cancel restores the exact SVG origin',"document.activeElement.dataset.toolSegment==='tool-openAtomization'&&!document.querySelector('.modal-container')");
  await passive(()=>key('Enter','Enter',13,'\r'));await escape();await pause(50);
  await pass('Ring Escape restores the origin',"document.activeElement.dataset.toolSegment==='tool-openAtomization'");
  await activate(action('tool-open-selected'));await main.ev("document.querySelector('.veynrel-tool-explanation .modal-header-button').click();void 0");await pause(50);
  await pass('Close X restores central button',"document.activeElement.dataset.healthAction==='tool-open-selected'");
  await activate(action('tool-chooser'));await main.send('Input.insertText',{text:'Ask vault'});await wait("document.querySelectorAll('.suggestion-item').length===1");await key('Enter','Enter',13,'\r');await escape();await pause(50);
  await pass('Chooser explanation Escape restores its trigger',"document.activeElement.dataset.healthAction==='tool-chooser'");
  await activate(action('tool-chooser'));await key('ArrowDown','ArrowDown',40);await key('Enter','Enter',13,'\r');
  await pass('Native chooser arrows and Enter choose Atomization',"document.querySelector('.veynrel-tool-explanation').textContent.includes('Atomization')");
  // Count the unchanged public launcher boundary while allowing its actual picker to open.
  await main.ev("window.actualAtomize=hv.tools.openAtomization;hv.tools.openAtomization=(...args)=>{nativeLaunches++;return actualAtomize(...args)};document.querySelector('[data-health-action=tool-info-open]').click();void 0");
  await pass('Explicit launch invokes the existing owner once',"nativeLaunches===1&&!!document.querySelector('.prompt-input')");await escape();await main.ev('hv.tools.openAtomization=actualAtomize;void 0');
  await size(390,1090);await main.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  const touchPoint=await main.ev("(()=>{const r=document.querySelector('.veynrel-tool-wheel svg').getBoundingClientRect();return{x:r.x+r.width*356/460,y:r.y+r.height*104/460}})()");
  await main.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touchPoint,radiusX:2,radiusY:2}]});await main.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await pass('Emulated touch selects one arc without opening',"!document.querySelector('.modal-container')&&!document.querySelector('[data-health-action=tool-open-selected]').hidden");
  await activate(action('tool-open-selected'));await pass('Touch center opens the same explanation',"!!document.querySelector('.veynrel-tool-explanation')");await shot('after-touch-explanation',main,true);await escape();await main.send('Emulation.setTouchEmulationEnabled',{enabled:false});await size(1280,830);
  await route('batch');await pass('No saved MOC groups is honest and offers preparation',"document.querySelector('[data-health-action=tool-openDeepAudit]').textContent.includes('Run a deep audit first')");
  await activate(action('tool-openBatchProcessing'));await pass('Bulk panel opens existing Batch',"!!document.querySelector('.ai-hub-count-live')");await shot('after-bulk-existing-picker');await escape();
  await activate(action('process-deep-audit'));await shot('after-deep-mode');await pass('Deep Audit opens its mode chooser',"!!document.querySelector('.modal')");await escape();
  await activate(action('process-atomization'));await pass('Atomization panel opens existing picker',"!!document.querySelector('.prompt-input')");await escape();
  await activate(action('tool-openDeepAudit'));await pass('MOC preparation opens Deep Audit mode',"!!document.querySelector('.modal')");await escape();
  await route('semantic');
  const requestCount=report.providerRequests.length;const io=await main.ev('JSON.stringify(uxIO)');
  await main.ev("document.querySelector('[data-health-action=overview-query]').focus();void 0");await main.send('Input.insertText',{text:'ideas and connections'});await pause(200);
  assert.equal(report.providerRequests.length,requestCount);assert.equal(await main.ev('JSON.stringify(uxIO)'),io);report.checks.push('Semantic typing is passive');
  await key('Enter','Enter',13,'\r');await wait("!!document.querySelector('.ai-semantic-result-card')||!!document.querySelector('.modal-button-container .mod-cta')");
  if(await main.ev("!!document.querySelector('.modal-button-container .mod-cta')"))await activate('.modal-button-container .mod-cta');
  await wait("!!document.querySelector('.ai-semantic-result-card')");await shot('after-semantic-search-results');await escape();
  for(const [mode,intent] of [['map','map'],['families','families'],['notes','pair'],['neighborhood','neighborhood'],['opportunities','opportunities'],['focus','focus'],['similar','similar']]){
    await route('semantic');await activate(action(mode==='similar'?'semantic-similar':'semantic-mode-'+mode));
    await pass(`Semantic ${mode} opens its explicit surface`, `!!document.querySelector('[data-semantic-intent="${intent}"]')`);await shot('after-route-'+mode);
  }
  await route('check');await main.ev("{const e=document.querySelector('[data-health-action=finding-search]');e.value='';e.dispatchEvent(new Event('input'));}void 0");
  const geometry=await main.ev("(()=>{const e=document.querySelector('[data-health-action^=repair-]');const r=e.getBoundingClientRect();return{w:r.width,h:r.height}})()");
  await hover('[data-health-action^="repair-"]');
  await pass('Finding hover does not move or resize actions',`(()=>{const r=document.querySelector('[data-health-action^=repair-]').getBoundingClientRect();return r.width===${geometry.w}&&r.height===${geometry.h}})()`);
  await pass('Finding actions have wrench/info labels, soft primary and ghost secondary',"(()=>{const a=document.querySelector('[data-health-action^=repair-]'),b=a.nextElementSibling;return a.querySelector('.lucide-wrench')&&b.querySelector('.lucide-info')&&a.textContent==='Fix…'&&b.textContent==='More details'&&getComputedStyle(a).boxShadow==='none'&&getComputedStyle(b).backgroundColor==='rgba(0, 0, 0, 0)'})()");
  await activate('[data-health-action^="repair-"]');await wait("!!document.querySelector('.ai-local-note')");await pass('Fix opens existing preparation, not Apply',"!!document.querySelector('.ai-local-note')");await shot('after-finding-preparation');await escape();
  await activate('.veynrel-finding-actions [data-health-action^="finding-"]');await pass('More details keeps existing finding evidence',"!!document.querySelector('.veynrel-findings-detail')");await shot('after-finding-evidence');
  await size(390,1090);await route('check');await main.ev("{const e=document.querySelector('[data-health-action=finding-search]');e.value='Long source';e.dispatchEvent(new Event('input'));}void 0");
  await pass('Long names and 390 actions fit below the problem',"(()=>{const e=document.querySelector('.veynrel-finding-actions');return e.getBoundingClientRect().y>=e.previousElementSibling.getBoundingClientRect().bottom&&hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1})()");
  await main.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await route('semantic');await pass('Reduced motion remains respected',"getComputedStyle(document.querySelector('.veynrel-health-page-enter')).animationName==='none'");await shot('after-reduced-motion');
  await size(1280,830);await home();
  await pass('Disabled Studio exposes no write owner, command or view',"plugin.studio===undefined&&plugin.getToolsPort().openStudioNote===undefined&&!Object.keys(app.commands.commands).some(k=>k.includes('studio'))&&!app.viewRegistry.viewByType['veynrel-studio']");
  await main.ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");await pass('Studio hidden in settings',"!app.setting.modalEl.textContent.includes('Studio')");await main.ev('app.setting.close();void 0');await focus();
  await main.ev("window.uxSplit=app.workspace.getLeaf('split');uxSplit.setViewState({type:'veynrel-health',active:true})");
  await main.ev("uxSplit.view.contentEl.querySelector('[data-health-action=overview-semantic]').click();void 0");
  await pass('Split semantic panels use their own width and preserve main Overview',"uxSplit.view.contentEl.querySelectorAll('.veynrel-semantic-grid>a').length===7&&uxSplit.view.contentEl.scrollWidth<=uxSplit.view.contentEl.clientWidth+1&&hv.route.page==='home'");await shot('after-split');await main.ev('uxSplit.detach();void 0');
  await main.ev("window.uxPop=app.workspace.getLeaf('window');uxPop.setViewState({type:'veynrel-health',active:true})");await wait('uxPop.view.containerEl.ownerDocument!==document');
  let target;for(let i=0;i<100;i++){target=(await(await fetch(`${endpoint}/json/list`)).json()).find(t=>t.type==='page'&&t.id!==main.id);if(target)break;await pause(50);}
  assert(target,'Popout target');const pop=await connection(target);await focus(pop);
  await pop.ev("document.querySelector('[data-health-action=overview-tools]').click();document.querySelector('[data-tool-segment=tools-process]').focus();void 0");
  for(const type of ['keyDown','keyUp'])await pop.send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await pass('Shared explanation belongs to the popout document',"!!document.querySelector('.veynrel-tool-explanation')",pop);await shot('after-popout-explanation',pop);
  for(const type of ['keyDown','keyUp'])await pop.send('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await pause(100);
  await pass('Popout Escape restores its exact segment',"document.activeElement.dataset.toolSegment==='tools-process'&&!document.querySelector('.veynrel-tool-explanation')",pop);
  await main.ev('uxPop.detach();void 0');await focus();await pass('Closing popout preserves main controller',"!!hv.controller.getState().snapshot");
  await stopVideo();report.semanticEvidence='Synthetic stored index and loopback query vectors; existing owners; explicit semantic routes are verified separately, not a semantic quality claim.';
  report.unverified=['Physical touch','Screen reader','Historical Community document ownership','Historical cold10k','Other historical e.isShown triggers'];
}
