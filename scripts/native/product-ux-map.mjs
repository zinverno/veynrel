// Synthetic UX-C journey, called only by the shared native launcher harness.
export async function runMapUX({main,wait,pass,shot,focus,key,report}) {
  const ev=main.ev;
  const activate=async id=>{await focus();await ev(`{const e=document.querySelector('[data-health-action="${id}"]');if(!e||e.disabled)throw Error('Unavailable: ${id}');e.scrollIntoView({block:'center'});e.focus();}void 0`);await key('Enter','Enter',13,'\r');};
  await ev("hv.navigate({page:'discover'});void 0");await activate('review-map');
  await ev('window.wb=hv.workbench.map;window.mapIO={...uxIO};void 0');
  await pass('Structure is default; no passive semantic calculation or Markdown IO',"wb.surface==='structure'&&wb.data.semantic.getSnapshot().state==='idle'&&uxIO.pluginRead===mapIO.pluginRead&&uxIO.pluginWrite===mapIO.pluginWrite");
  const started=performance.now();await activate('workbench-refresh');await wait("wb.data.dependencies.topology.getSnapshot().state==='ready'&&!wb.pendingRender");
  report.structureMs=performance.now()-started;
  await pass('Real directed links render without any semantic index',"!!wb.element.querySelector('[data-kind=link]')&&!wb.element.querySelector('[data-kind=semantic]')&&wb.data.semantic.getSnapshot().state==='idle'&&wb.structureSimulation.alpha===0");
  await ev('window.structureCoordinates=JSON.stringify(wb.points);void 0');
  await activate('workbench-layer-links');await activate('workbench-layer-links');
  await pass('Structural overlay is independent of geometry',"JSON.stringify(wb.points)===structureCoordinates");
  await ev("wb.element.querySelector('[data-path=\"Source.md\"]').focus();void 0");await key('Enter','Enter',13,'\r');await wait("wb.note==='Source.md'");
  await pass('Selected structural note has real incoming links and existing safe tag route',"!!wb.element.querySelector('[data-health-action=note-tag]')&&!!wb.element.querySelector('[data-health-action^=linked-incoming-]')");
  await shot('structure-selected');
  for(const language of ['en','ru']) {
    await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await ev(`{const s=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));s.value='${language}';s.dispatchEvent(new Event('change'));}void 0`);
    await ev('plugin.settingsSave');await ev('app.setting.close();hv.render();void 0');
    for(const theme of ['light','dark'])for(const width of [1100,390]) {
      await ev(`app.changeTheme('${theme==='light'?'moonstone':'obsidian'}');void 0`);
      await main.send('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false});
      await ev('wb.element.scrollIntoView({block:"start"});void 0');
      await pass(`Map ${language}/${theme}/${width}: no horizontal overflow`,"hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1");
      await shot(`structure-${language}-${theme}-${width}`);
    }
  }
  await main.send('Emulation.clearDeviceMetricsOverride');
  await main.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await activate('workbench-zoom-in');await ev('window.structureCamera=JSON.stringify(wb.graph.viewport);void 0');
  await activate('workbench-surface-similarity');await activate('workbench-refresh');await wait('!wb.data.busy&&!wb.pendingRender');
  await pass('Missing index has no pretend semantic grid and exposes setup',"wb.data.semantic.getSnapshot().state==='unavailable'&&!wb.element.querySelector('svg[data-camera]')&&!!wb.element.querySelector('[data-health-action=workbench-setup]')");await shot('similarity-no-index');
  await activate('workbench-setup');await pass('Setup is explicit and does not create an index',"hv.route.page==='settings'&&hv.semanticSetup?.step==='choose'");await shot('semantic-setup');
  await ev("hv.navigate({page:'discover'});void 0");
  if(!await ev("!!document.querySelector('[data-health-action=workbench-surface-structure]')"))await activate('review-map');
  await activate('workbench-surface-structure');
  await pass('Structure restores exact camera, selection and coordinates after setup',"wb.note==='Source.md'&&JSON.stringify(wb.graph.viewport)===structureCamera&&JSON.stringify(wb.points)===structureCoordinates");
  await activate('workbench-isolated');
  await pass('No-links filter uses complete owner evidence',"wb.data.dependencies.topology.getSnapshot().map.complete&&[...wb.element.querySelectorAll('[data-path]')].every(e=>wb.structureMap.nodes.find(n=>n.path===e.dataset.path)?.orphan)");await shot('confirmed-isolated');await activate('workbench-isolated');
  if(await ev("!!document.querySelector('[data-health-action=workbench-load-choices]')")){await activate('workbench-load-choices');await wait("wb.data.dependencies.rules.state==='ready'&&!wb.pendingRender");}
  await ev("document.querySelector('[data-health-action=workbench-second]').focus();void 0");await main.send('Input.insertText',{text:'Other.md'});
  await key('ArrowDown','ArrowDown',40);await key('Enter','Enter',13,'\r');await wait('!!wb.selected');
  await ev('window.pairMapState=JSON.stringify({camera:wb.graph.viewport,query:wb.query,scope:wb.data.scope,paths:wb.selected.paths});void 0');
  await activate('workbench-compare');await wait("!!document.querySelector('[data-pair-heading]')");await shot('structure-pair-inspector');await activate('workbench-back');
  await pass('Pair Back retains structural camera, scope, filter and exact pair',"JSON.stringify({camera:wb.graph.viewport,query:wb.query,scope:wb.data.scope,paths:wb.selected.paths})===pairMapState");
  await pass('Map, explicit metadata refresh and Pair review send no request or write',"uxIO.pluginWrite===mapIO.pluginWrite");
  report.mapIO=await ev('({before:mapIO,after:{...uxIO},semantic:wb.data.semantic.getSnapshot().state})');
  // A real second leaf observes the plugin-owned refresh after the first is closed.
  await ev("window.structSplit=app.workspace.getLeaf('split');structSplit.setViewState({type:'veynrel-health',active:true})");
  await ev("structSplit.view.navigate({page:'discover'});structSplit.view.workbench.openMap();void 0");
  await pass('Both Workbenches share topology, never a second scanner',"structSplit.view.workbench.map.data.dependencies.topology===wb.data.dependencies.topology");
  await ev('window.sharedRefresh=structSplit.view.workbench.map.data.dependencies.topology.refresh();structSplit.detach();void 0');await ev('sharedRefresh');
  await wait("wb.data.dependencies.topology.getSnapshot().state==='ready'&&!wb.pendingRender");
  await pass('Disposal of one window preserves shared topology refresh',"wb.data.dependencies.topology.getSnapshot().map.noteCount===154");await shot('structure-after-split-close');
}
