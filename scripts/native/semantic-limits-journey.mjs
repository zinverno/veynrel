export async function runSemanticLimits({main,wait,pass,shot,key,providerUrl,report,phase}) {
  const activate=async id=>{await main.ev(`document.querySelector('[data-health-action="${id}"]').focus();void 0`);await key('Enter','Enter',13,'\r');};
  await main.ev("app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();app.changeTheme('obsidian');void 0");
  await main.ev(`plugin.getSemanticSettingsPort().update({...plugin.settings.semantic,enabled:true,embeddingProvider:'ollama',embeddingModel:'overview-synthetic',embeddingBaseUrl:'${providerUrl}'})`);
  await main.ev('plugin.getSemanticController().refreshSemanticStatus()');
  if(phase==='before') {
    await main.ev('window.electronWindow.setContentSize(1360,950);void 0');await wait('innerWidth===1360');
    await pass('Baseline #157 has no floating command or root',"!document.querySelector('.veynrel-floating')&&!app.commands.commands['ai-knowledge-hub:veynrel-floating-actions']");
    await shot('before-overview');await main.ev("app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('markdown')[0],{focus:true});void 0");await shot('before-floating-absent',main,true);await main.ev('app.workspace.setActiveLeaf(hv.leaf,{focus:true});void 0');
    for(const entry of ['map','families','notes','neighborhood','opportunities','focus','similar']) {
      if(await main.ev("!!document.querySelector('[data-health-action=nav-home]')"))await activate('nav-home');
      await activate('overview-semantic');await activate(entry==='similar'?'semantic-similar':'semantic-mode-'+entry);
      await shot('before-'+entry,main,entry==='similar');
      if(entry==='similar')await key('Escape','Escape',27);
    }
    report.baseline='Native pinned #157 assets. Old destinations captured without pretending they implement the new route contract.';return;
  }
  await activate('overview-semantic');await activate('semantic-mode-focus');await activate('semantic-source');
  await main.send('Input.insertText',{text:'Source.md'});await key('Enter','Enter',13,'\r');await activate('semantic-compute');
  await wait('!hv.scenario.data.globalSemantic.getSnapshot().busy');
  await pass('Global focus above cap refuses all computation',"hv.scenario.data.globalSemantic.getSnapshot().reason==='too-large'&&!hv.scenario.data.globalSemantic.getSnapshot().focus&&document.querySelectorAll('[data-focus-path]').length===0&&!!document.querySelector('[data-semantic-state=cap-refused]')");
  await shot('global-focus-cap-refused');
  report.cap=await main.ev('(()=>{const s=hv.scenario.data.globalSemantic.getSnapshot();return{reason:s.reason,indexedNotes:s.indexedNoteCount,mapped:s.mappedNoteCount,cap:s.supportedNoteCount,computed:s.focus?.scores.length??0}})()');
}
