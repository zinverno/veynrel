export async function runOverviewUX({main,wait,pass,shot,phase,focus,key,connection,endpoint,pause,providerUrl,report,stopVideo}) {
  const activate = async selector => {
    await main.ev(`document.querySelector(${JSON.stringify(selector)}).focus();void 0`);
    await key('Enter','Enter',13,'\r');
  };
  const language = async value => {
    await main.ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await main.ev(`{const s=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));s.value='${value}';s.dispatchEvent(new Event('change'));}void 0`);
    await main.ev('plugin.settingsSave'); await main.ev('app.setting.close();hv.render();void 0'); await focus();
    await pass(`Native language ${value}`, `document.querySelector('[data-health-action=nav-recall]').textContent.includes('${value==='ru'?'Повторение':'Review'}')`);
  };
  await wait('app.vault.getMarkdownFiles().every(f=>!!app.metadataCache.getFileCache(f))');
  await main.ev('app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();window.electronWindow.setContentSize(1440,960);void 0');
  await wait('innerWidth===1440');
  if(phase!=='before') {
    await pass('Overview is the first screen, no passive note IO', "hv.route.page==='home'&&uxIO.pluginRead===0&&uxIO.pluginWrite===0");
    await pass('All five main sections visible outside overflow', "document.querySelectorAll('.veynrel-tabs button').length===5&&document.querySelectorAll('.veynrel-workspace-more [data-health-action=nav-tools]').length===0");
    await pass('No-index search is explicit and has setup', "document.querySelector('[data-health-action=overview-search]').disabled&&!!document.querySelector('[data-health-action=overview-setup]')");
    await shot('after-no-index');
    await activate('[data-health-action=overview-semantic]');
    await activate('[data-health-action=semantic-mode-map]');
    await pass('Missing semantics never draws a technical semantic grid', "hv.workbench.map.surface==='similarity'&&!document.querySelector('svg[data-camera]')&&!!document.querySelector('[data-health-action=workbench-setup]')");
    await shot('after-map-unavailable');
    await activate('[data-health-action=nav-home]');
    await activate('[data-health-action=overview-check]');
  } else await main.ev("hv.navigate({page:'health'});void 0");
  await activate('[data-health-action=scan]');
  await wait('!!hv.controller.getState().outcome&&!hv.controller.getState().busy');
  await pass('Check shows concrete sources and issues',"!!document.querySelector('.veynrel-finding-source')&&hv.controller.listFindings().some(f=>f.type==='broken-link')");
  if(phase!=='before') {
    await activate('[data-health-action=nav-home]');await activate('[data-health-action=overview-batch]');
    await pass('Overview opens bulk audit in Tools context',"hv.route.page==='process'&&document.querySelector('[data-health-action=nav-tools]').getAttribute('aria-current')==='page'");
    await shot('after-bulk-audit');
    await activate('[data-health-action=tool-openBatchProcessing]');
    await pass('Bulk audit opens the existing note/operation picker',"!!document.querySelector('.ai-hub-count-live')");
    await shot('after-bulk-picker');await key('Escape','Escape',27);
    await activate('[data-health-action=nav-home]');await activate('[data-health-action=overview-recall]');
    await wait("!!document.querySelector('[data-health-action=recall-refresh]')");
    await activate('[data-health-action=recall-refresh]');
    await wait("!!document.querySelector('[data-health-action=recall-start]')");
    await activate('[data-health-action=recall-start]');await wait("!!document.querySelector('[data-health-action=recall-reveal]')");
    await pass('Recall enters a real question; answer stays hidden',"!document.querySelector('[data-recall-answer]')&&!!document.querySelector('[data-recall-question]')");
    await shot('after-recall-question');await activate('[data-health-action=recall-back]');
    // Configure only this synthetic fixture via the existing settings owner. No live provider.
    await main.ev(`plugin.getSemanticSettingsPort().update({...plugin.settings.semantic,enabled:true,embeddingProvider:'ollama',embeddingModel:'overview-synthetic',embeddingBaseUrl:'${providerUrl}'})`);
    await main.ev('plugin.getSemanticController().refreshSemanticStatus()');
    await activate('[data-health-action=nav-home]');
    await wait("!document.querySelector('[data-health-action=overview-search]').disabled");
    await main.ev("document.querySelector('[data-health-action=overview-query]').focus();void 0");
    await main.send('Input.insertText',{text:'ideas and connections'});await key('Enter','Enter',13,'\r');
    await wait("!!document.querySelector('.ai-semantic-result-card')||!!document.querySelector('.modal-button-container .mod-cta')");
    if(await main.ev("!!document.querySelector('.modal-button-container .mod-cta')"))await activate('.modal-button-container .mod-cta');
    await wait("!!document.querySelector('.ai-semantic-result-card')");
    await pass('Overview query runs in the existing semantic search',"document.querySelector('.ai-semantic-search-input-row input').value==='ideas and connections'");
    await shot('after-search-results');await key('Escape','Escape',27);
    await activate('[data-health-action=nav-tools]');
    await main.ev("document.querySelector('[data-tool-segment=tool-openAtomization]').focus();void 0");
    await pass('Ring focus explains the selected tool',"document.querySelector('.veynrel-tool-center').textContent.includes('Atomization')");
    await key('Enter','Enter',13,'\r');
    await pass('Ring keyboard opens the tool detail',"!!document.querySelector('.veynrel-tool-detail [data-health-action=tool-openAtomization]')");
    await shot('after-ring-detail');await activate('[data-health-action=tool-back]');
    await pass('Back restores ring focus',"document.activeElement.getAttribute('data-tool-segment')==='tool-openAtomization'");
    const point = await main.ev("(()=>{const r=document.querySelector('[data-tool-segment=tool-openAskVault] text').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await main.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await pass('Ring pointer hover explains Ask Vault',"document.querySelector('.veynrel-tool-center').textContent.includes('Ask')");
    for(const type of ['mousePressed','mouseReleased'])await main.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
    await pass('Ring pointer click opens the tool detail',"!!document.querySelector('.veynrel-tool-detail [data-health-action=tool-openAskVault]')");
    await shot('after-ring-pointer');await activate('[data-health-action=tool-back]');
    await activate('[data-health-action=catalog-tool-openAtomization]');
    await pass('Linear list opens the same tool detail',"!!document.querySelector('.veynrel-tool-detail [data-health-action=tool-openAtomization]')");
    await activate('[data-health-action=tool-openAtomization]');
    await pass('Atomization opens the existing note picker',"!!document.querySelector('.prompt')");await key('Escape','Escape',27);
    await activate('[data-health-action=nav-home]');
    await pass('Studio absent from commands, ribbon and registered views',"!Object.keys(app.commands.commands).some(k=>k.includes('studio'))&&!document.querySelector('[aria-label*=Studio]')&&!app.viewRegistry.viewByType['veynrel-studio']");
    await main.ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await pass('Studio absent from settings',"!app.setting.modalEl.textContent.includes('Studio')&&!app.setting.modalEl.textContent.includes('Community website')");
    await shot('after-settings');await main.ev('app.setting.close();void 0');await focus();await stopVideo();
  }
  for(const value of ['ru','en']) {
    await language(value);
    for(const theme of ['dark','light']) {
      await main.ev(`app.changeTheme('${theme==='dark'?'obsidian':'moonstone'}');void 0`);
      for(const width of phase==='before'?[1440]:[1440,390]) {
        await main.ev(`window.electronWindow.setContentSize(${width},960);void 0`);await wait(`innerWidth===${width}`);
        for(const [name,page]of [['overview','home'],['check','health'],['semantics',phase==='before'?'discover':'semantic'],['tools','tools'],['recall','recall']]) {
          await main.ev(`hv.navigate({page:'${page}'});void 0`);
          if(page==='recall')await wait("!!document.querySelector('[data-health-action=recall-refresh]')");
          await pass(`${name} ${value}/${theme}/${width}: no horizontal overflow`,"hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1");
          await pass(`${name}: no missing translation keys`,"!/@(?:overview|tools|workspace|polish)\\./.test(hv.contentEl.textContent)");
          if(phase!=='before')await pass(`${name}: Studio absent`,"!hv.contentEl.textContent.includes('Studio')");
          await shot(`${phase}-${name}-${value}-${theme}-${width}`);
          if(name==='overview'&&width===390){await main.ev('hv.contentEl.scrollTop=hv.contentEl.scrollHeight;void 0');await shot(`${phase}-${name}-${value}-${theme}-${width}-bottom`);}
        }
      }
    }
  }
  if(phase==='before')return;
  await main.ev('window.electronWindow.setContentSize(1440,960);void 0');await wait('innerWidth===1440');
  await activate('[data-health-action=nav-home]');
  await main.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await pass('Reduced motion disables page entry animation',"matchMedia('(prefers-reduced-motion: reduce)').matches&&getComputedStyle(document.querySelector('.veynrel-health-page-enter')).animationName==='none'");
  await shot('after-reduced-motion');
  await main.ev("document.querySelector('[data-health-action=nav-home]').focus();void 0");await key('Tab','Tab',9);
  await pass('Tab reaches Check directly',"document.activeElement.getAttribute('data-health-action')==='nav-health'");await key('Enter','Enter',13,'\r');
  await pass('Keyboard navigation focuses the destination heading',"document.activeElement.hasAttribute('data-health-heading')");
  await main.ev("window.uxSplit=app.workspace.getLeaf('split');uxSplit.setViewState({type:'veynrel-health',active:true})");
  await pass('Real split mounts a separate Overview',"app.workspace.getLeavesOfType('veynrel-health').length===2&&uxSplit.view.route.page==='home'&&hv.route.page==='health'");await shot('after-split');
  await main.ev('uxSplit.detach();void 0');
  await main.ev("window.uxPop=app.workspace.getLeaf('window');uxPop.setViewState({type:'veynrel-health',active:true})");
  await wait('uxPop.view.containerEl.ownerDocument!==document');
  let target;for(let i=0;i<100;i++){target=(await(await fetch(`${endpoint}/json/list`)).json()).find(t=>t.type==='page'&&t.id!==main.id);if(target)break;await pause(50);}
  if(!target)throw Error('Popout target missing');const pop=await connection(target);await focus(pop);
  await pass('Popout owns five explicit destinations and Overview',"document.querySelectorAll('.veynrel-tabs button').length===5&&!!document.querySelector('.veynrel-overview')",pop);
  await pop.ev("document.querySelector('[data-health-action=nav-tools]').focus();void 0");
  for(const type of ['keyDown','keyUp'])await pop.send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,...(type==='keyDown'?{text:'\r'}:{})});
  await pass('Tool catalog uses the popout document',"!!document.querySelector('.veynrel-tool-list')&&document.activeElement.hasAttribute('data-health-heading')",pop);
  await shot('after-popout-tools',pop);await main.ev('uxPop.detach();void 0');await focus();
  report.semanticEvidence='Synthetic stored vectors + loopback query embeddings; real production search path, not semantic quality.';
}
