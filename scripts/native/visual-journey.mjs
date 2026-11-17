export async function runVisualUX({main,wait,pass,shot,phase,key,focus,providerUrl,report,stopVideo,pause,connection,endpoint}) {
  const activate=async selector=>{await main.ev(`document.querySelector(${JSON.stringify(selector)}).focus();void 0`);await key('Enter','Enter',13,'\r');};
  const language=async value=>{
    await main.ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await main.ev(`{const s=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));s.value='${value}';s.dispatchEvent(new Event('change'));}void 0`);
    await main.ev('plugin.settingsSave');await main.ev('app.setting.close();hv.render();void 0');await focus();
  };
  const size=async(width,height)=>{
    await main.ev(`window.electronWindow.setContentSize(${width+44},${height+80});void 0`);
    await wait(`Math.abs(hv.contentEl.clientWidth-${width})<60`);
    const offset=await main.ev(`({w:innerWidth-hv.contentEl.clientWidth,h:innerHeight-hv.contentEl.clientHeight})`);
    await main.ev(`window.electronWindow.setContentSize(${width+offset.w},${height+offset.h});void 0`);
    await wait(`hv.contentEl.clientWidth===${width}&&hv.contentEl.clientHeight===${height}`);
  };
  await wait('app.vault.getMarkdownFiles().every(f=>!!app.metadataCache.getFileCache(f))');
  await main.ev('app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();void 0');
  await pass('First Overview has no passive plugin note IO',"hv.route.page==='home'&&uxIO.pluginRead===0&&uxIO.pluginWrite===0");
  if(phase!=='before') {
    await pass('Unavailable index has an explicit setup path',"document.querySelector('[data-health-action=overview-search]').disabled&&!!document.querySelector('[data-health-action=overview-setup]')");
    await shot('after-no-index');
  }
  await main.ev("hv.navigate({page:'health'});void 0");await activate('[data-health-action=scan]');
  await wait('!!hv.controller.getState().outcome&&!hv.controller.getState().busy');
  await main.ev("hv.navigate({page:'recall'});void 0");await wait("!!document.querySelector('[data-health-action=recall-refresh]')");
  await activate('[data-health-action=recall-refresh]');await wait("!!document.querySelector('[data-health-action=recall-start]')");
  await main.ev(`plugin.getSemanticSettingsPort().update({...plugin.settings.semantic,enabled:true,embeddingProvider:'ollama',embeddingModel:'overview-synthetic',embeddingBaseUrl:'${providerUrl}'})`);
  await main.ev('plugin.getSemanticController().refreshSemanticStatus()');
  await language('ru');
  report.geometry=[];
  for(const theme of ['dark','light']) {
    await main.ev(`app.changeTheme('${theme==='dark'?'obsidian':'moonstone'}');void 0`);
    for(const [width,height] of [[1280,830],[390,1089]]) {
      await size(width,height);
      await main.ev("hv.navigate({page:'home'});void 0");
      await pass('Overview no horizontal overflow', 'hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1');
      await main.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:5,y:5});
      await main.ev("document.querySelector('[data-health-heading]').focus();void 0");
      await shot(`${phase}-overview-${theme}-${width}`);
      if(phase!=='before') {
        await pass('No global tabs or summary folder selector',"!document.querySelector('.veynrel-tabs')&&!document.querySelector('[data-health-action=scope-picker]')");
        await pass('Whole panels have one link and no nested controls',"document.querySelectorAll('.veynrel-overview-grid > a').length===5&&!document.querySelector('.veynrel-overview-grid a :is(a,button,input)')");
        report.geometry.push(await main.ev(`(()=>{const root=hv.contentEl.getBoundingClientRect();return {theme:'${theme}',width:${width},cards:[...document.querySelectorAll('.veynrel-overview-panel')].map(e=>{const r=e.getBoundingClientRect();return {key:e.dataset.healthAction,x:r.x-root.x,y:r.y-root.y,w:r.width,h:r.height}})}})()`));
        await activate('[data-health-action=overview-tools]');
      } else await main.ev("hv.navigate({page:'tools'});void 0");
      if(width===390)await size(390,780);
      await main.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:5,y:5});
      await shot(`${phase}-tools-idle-${theme}-${width}`);
      if(phase==='before')continue;
      await pass('One unbroken base, no ring numbers or permanent list',"document.querySelectorAll('.veynrel-ring-base').length===1&&!document.querySelector('.veynrel-tool-wheel text')&&!document.querySelector('.veynrel-tool-list')");
      const point=await main.ev("(()=>{const r=document.querySelector('.veynrel-tool-wheel svg').getBoundingClientRect();return{x:r.x+r.width*(230+46)/460,y:r.y+r.height*(230-172)/460}})()");
      await main.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await pause(800);
      await pass('Pointer highlights one arc and explains bulk audit',"document.querySelector('.veynrel-ring-highlight').getAttribute('visibility')==='visible'&&document.querySelector('.veynrel-tool-center').textContent.includes('Массовый аудит')");
      await shot(`${phase}-tools-hover-${theme}-${width}`);
      await main.ev("document.querySelector('[data-tool-segment]').focus();void 0");
      await pass('Ring focus has a visible outline',"document.querySelector('.veynrel-ring-focus').getAttribute('visibility')==='visible'");
      await shot(`${phase}-tools-focus-${theme}-${width}`);
      await key('Escape','Escape',27);
      await pass('Escape clears selection and retains a keyboard destination',"document.querySelector('.veynrel-ring-highlight').getAttribute('visibility')==='hidden'&&document.activeElement.dataset.healthAction==='tool-chooser'");
    }
  }

  for (const lang of ['ru','en']) {
    await language(lang);
    for (const theme of ['dark','light']) {
      await main.ev(`app.changeTheme('${theme==='dark'?'obsidian':'moonstone'}');void 0`);
      for (const [width,height] of [[1280,830],[390,1090]]) {
        await size(width,height);
        for (const [name,page] of [['check','health'],['semantics','semantic'],['bulk','process'],['recall','recall']]) {
          await main.ev("hv.navigate({page:'home'});void 0");
          if(phase==='before') await main.ev(`hv.navigate({page:'${page}'});void 0`);
          else await activate(`[data-health-action=overview-${name==='semantics'?'semantic':name==='bulk'?'batch':name}]`);
          await pass(`${name} ${lang}/${theme}/${width} fits`, 'hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1');
          await pass(`${name} localized and Studio hidden`, "!/@(?:visual|overview|tools|workspace)\\./.test(hv.contentEl.textContent)&&!hv.contentEl.textContent.includes('Studio')");
          await shot(`${phase}-${name}-${lang}-${theme}-${width}`);
        }
      }
    }
  }
  if(phase==='before') {await stopVideo();return;}
  await language('en');await size(1280,830);
  await activate('[data-health-action=nav-home]');
  const passiveRequests=report.providerRequests.length;
  await main.ev('window.passiveIO=JSON.stringify(uxIO);void 0');
  await main.ev("document.querySelector('[data-health-action=overview-query]').focus();void 0");
  await main.send('Input.insertText',{text:'ideas and connections'});await pause(400);
  if(report.providerRequests.length!==passiveRequests)throw Error('Typing unexpectedly contacted provider');
  report.checks.push('Typing query does not contact provider');
  await pass('Typing query does not read or write notes', 'JSON.stringify(uxIO)===passiveIO');
  await key('Enter','Enter',13,'\r');
  await wait("!!document.querySelector('.ai-semantic-result-card')||!!document.querySelector('.modal-button-container .mod-cta')");
  if(await main.ev("!!document.querySelector('.modal-button-container .mod-cta')")) await activate('.modal-button-container .mod-cta');
  await wait("!!document.querySelector('.ai-semantic-result-card')");
  await pass('Exact query reaches existing search and produces actual results', "document.querySelector('.ai-semantic-search-input-row input').value==='ideas and connections'");
  await shot('after-search-results');await key('Escape','Escape',27);
  await activate('[data-health-action=overview-batch]');await activate('[data-health-action=tool-openBatchProcessing]');
  await pass('Bulk route opens existing Batch picker', "!!document.querySelector('.ai-hub-count-live')");await shot('after-batch-picker');await key('Escape','Escape',27);
  await activate('[data-health-action=nav-home]');await activate('[data-health-action=overview-recall]');await activate('[data-health-action=recall-start]');
  await wait("!!document.querySelector('[data-health-action=recall-reveal]')");await pass('Recall starts real question without revealing answer', "!!document.querySelector('[data-recall-question]')&&!document.querySelector('[data-recall-answer]')");await shot('after-recall-question');await activate('[data-health-action=recall-back]');
  await activate('[data-health-action=nav-home]');await activate('[data-health-action=overview-tools]');
  await main.ev("document.querySelector('[data-tool-segment=tool-openAtomization]').focus();void 0");await key('ArrowRight','ArrowRight',39);await pass('Ring arrows move focus without launching',"document.activeElement.dataset.toolSegment==='tool-generateMocs'&&!document.querySelector('.prompt')");await key('ArrowLeft','ArrowLeft',37);await key('Enter','Enter',13,'\r');
  await pass('Ring Enter opens existing Atomization note picker', "!!document.querySelector('.prompt')");await shot('after-ring-enter');await key('Escape','Escape',27);
  await activate('[data-health-action=tool-chooser]');await pass('Optional native name chooser opens',"!!document.querySelector('.prompt-input')");await key('Escape','Escape',27);
  await size(390,1090);await main.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  const touchPoint=await main.ev("(()=>{const r=document.querySelector('.veynrel-tool-wheel svg').getBoundingClientRect();return{x:r.x+r.width*(230+126)/460,y:r.y+r.height*(230-126)/460}})()");
  await main.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touchPoint,radiusX:2,radiusY:2}]});await main.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await pass('Emulated touch selects without opening',"!document.querySelector('.prompt')&&!document.querySelector('[data-health-action=tool-open-selected]').hidden");await shot('after-touch-selection');
  await activate('[data-health-action=tool-open-selected]');await pass('Explicit center action opens selected Atomization',"!!document.querySelector('.prompt')");await key('Escape','Escape',27);await main.send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await activate('[data-health-action=nav-home]');await activate('[data-health-action=overview-semantic]');await activate('[data-health-action=semantic-mode-notes]');
  for(const theme of ['dark','light']) {
    await main.ev(`app.changeTheme('${theme==='dark'?'obsidian':'moonstone'}');void 0`);
    await activate('[data-health-action=scope-picker]');await pass('Folder picker uses native searchable popup',"!!document.querySelector('.prompt-input')");await shot(`after-folder-picker-${theme}`);await key('Escape','Escape',27);
  }
  for(const [mode,panel] of [['focus','semantic-map'],['neighborhood','semantic-neighborhood'],['opportunities','connection-opportunities']]) {
    await activate('[data-health-action=nav-home]');await activate('[data-health-action=overview-semantic]');await activate(`[data-health-action=semantic-mode-${mode}]`);
    await pass(`Semantic ${mode} reaches its existing full inspector`, `!!document.querySelector('[data-workbench-inspector="${panel}"]')`);
    await shot(`after-semantic-${mode}`);
  }
  for(const mode of ['map','families']) {
    await activate('[data-health-action=nav-home]');await activate('[data-health-action=overview-semantic]');await activate(`[data-health-action=semantic-mode-${mode}]`);
    await pass(`Semantic ${mode} reaches the existing map`, "hv.workbench.map.surface==='similarity'");
    if(mode==='families')await pass('Families actually open', 'hv.workbench.map.families.open');
  }
  await activate('[data-health-action=nav-home]');
  await pass('Studio absent from commands and registered views',"!Object.keys(app.commands.commands).some(k=>k.includes('studio'))&&!app.viewRegistry.viewByType['veynrel-studio']");
  await main.ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");await pass('Studio absent from settings',"!app.setting.modalEl.textContent.includes('Studio')");await main.ev('app.setting.close();void 0');await focus();
  await main.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await pass('Reduced motion disables page entry animation',"matchMedia('(prefers-reduced-motion: reduce)').matches&&getComputedStyle(document.querySelector('.veynrel-health-page-enter')).animationName==='none'");await shot('after-reduced-motion');
  await main.ev("document.querySelector('[data-health-action=overview-query]').focus();void 0");await key('Tab','Tab',9);await key('Tab','Tab',9);
  await pass('Narrow keyboard order reaches Check after search',"document.activeElement.dataset.healthAction==='overview-check'");await key('Enter','Enter',13,'\r');
  await pass('Destination heading receives focus',"document.activeElement.hasAttribute('data-health-heading')");
  await size(1280,830);
  await main.ev("window.uxSplit=app.workspace.getLeaf('split');uxSplit.setViewState({type:'veynrel-health',active:true})");
  await pass('Split has independent Overview route',"app.workspace.getLeavesOfType('veynrel-health').length===2&&uxSplit.view.route.page==='home'&&hv.route.page==='health'");await shot('after-split');await main.ev('uxSplit.detach();void 0');
  await main.ev("window.uxPop=app.workspace.getLeaf('window');uxPop.setViewState({type:'veynrel-health',active:true})");await wait('uxPop.view.containerEl.ownerDocument!==document');
  let target;for(let i=0;i<100;i++){target=(await(await fetch(`${endpoint}/json/list`)).json()).find(t=>t.type==='page'&&t.id!==main.id);if(target)break;await pause(50);}
  if(!target)throw Error('Popout target missing');const pop=await connection(target);await focus(pop);
  await pass('Popout opens Overview without global tabs',"!!document.querySelector('.veynrel-overview')&&!document.querySelector('.veynrel-tabs')",pop);
  await pop.ev("document.querySelector('[data-health-action=overview-tools]').click();void 0");
  await pass('Ring mounts in popout document',"!!document.querySelector('.veynrel-ring-base')&&document.activeElement.hasAttribute('data-health-heading')",pop);await shot('after-popout-tools',pop);await main.ev('uxPop.detach();void 0');await focus();
  await pass('Closing popout preserves main controller',"!!hv.controller.getState().snapshot");
  await stopVideo();report.semanticEvidence='Synthetic stored vectors + loopback query embeddings; production search path, not semantic quality.';
  report.unverified=['Physical touch','Screen reader','Historical Community document ownership','Historical cold10k','Other historical e.isShown triggers'];
}
