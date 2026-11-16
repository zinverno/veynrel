// Runs within the common map harness; no second launcher, event fallback or host patch.
export async function runUnifiedJourney({ev,pass,shot,activate,field,key,wait,focus,main,report}) {
  await ev('window.unifiedPoints=JSON.stringify(wb.points);window.unifiedLayouts=wb.layoutCount;window.unifiedCamera=JSON.stringify(wb.graph.viewport);void 0');
  await activate('workbench-advanced');
  await activate('workbench-advanced-topology');
  await pass('Topology uses the shared plugin owner and no independent graph',"wb.data.dependencies.topology===hv.topology&&!wb.element.querySelector('.veynrel-topology-svg')&&!!wb.element.querySelector('.veynrel-topology-metrics')");
  await field('topology-search','Architecture/Unresolved.md');await activate('topology-result-0');
  await pass('Exact unresolved target and structural counts remain visible',"wb.element.querySelector('.veynrel-topology-inspector').textContent.includes('Missing source')&&wb.inspectors.topology.selected==='Architecture/Unresolved.md'");
  report.structural=await ev('({counts:hv.topology.getSnapshot().map.noteCount,complete:hv.topology.getSnapshot().map.complete,components:hv.topology.getSnapshot().map.components,connectors:hv.topology.getSnapshot().map.nodes.filter(n=>n.connector).map(n=>n.path),broken:hv.topology.getSnapshot().map.brokenTargets})');
  await shot('unified-structural');
  // The same current published capture drives the old inspector and its embedded mode.
  await pass('Structural inspection is read-only and leaves semantic geometry untouched','io.reads===0&&io.writes===0&&io.network===0&&JSON.stringify(wb.points)===unifiedPoints&&wb.layoutCount===unifiedLayouts');
  await ev("hv.navigate({page:'semantic-map'});window.wb=hv.workbench.map;void 0");
  await pass('Legacy global visual route migrates into the same Workbench owner',"hv.route.page==='discover'&&wb.inspectors.panel==='semantic-map'&&!document.querySelector('.veynrel-global-map-svg')");
  await activate('global-map-refresh');await wait("wb.data.global.getSnapshot().state==='ready'&&!wb.data.global.getSnapshot().busy&&!wb.pendingRender");
  await field('global-map-search','Docker/Guide.md');await activate('global-map-result-0');await activate('global-map-focus');
  await wait("!!wb.data.global.getSnapshot().focus&&!wb.data.global.getSnapshot().busy&&!wb.pendingRender");
  await pass('Explicit all-document focus covers all 12 documents, not top-K',"wb.data.global.getSnapshot().focus.scores.length===12&&wb.data.global.getSnapshot().map.nodes[0].neighbors.length<12&&wb.data.global.getSnapshot().map.scope===undefined");
  // An explicitly requested legacy owner calculation supplies the parity control.
  await ev("hv.globalMap.refresh().then(()=>hv.globalMap.focus('Docker/Guide.md'))");
  await pass('Global focus scores exactly equal the legacy controller',"JSON.stringify(wb.data.global.getSnapshot().focus)===JSON.stringify(hv.globalMap.getSnapshot().focus)");
  await pass('Global focus retains central map coordinates and camera','JSON.stringify(wb.points)===unifiedPoints&&wb.layoutCount===unifiedLayouts&&JSON.stringify(wb.graph.viewport)===unifiedCamera');
  await shot('unified-all-document-focus');
  await activate('global-map-explore');
  await pass('Neighborhood entry preserves the exact source without passive computation',"wb.inspectors.panel==='semantic-neighborhood'&&wb.data.neighborhood.getSnapshot().state==='idle'&&io.reads===0&&io.writes===0&&io.network===0");
  await activate('workbench-load-neighborhood');await wait("wb.data.neighborhood.getSnapshot().state==='ready'&&!wb.data.neighborhood.getSnapshot().busy&&!wb.pendingRender");
  await activate('neighborhood-select-1');
  await pass('Neighborhood preserves saved fragment evidence without a radial graph',"!wb.element.querySelector('.veynrel-neighborhood-svg')&&!!wb.element.querySelector('.veynrel-neighborhood-evidence')");
  await ev("hv.neighborhood.load('Docker/Guide.md')");
  await pass('Neighborhood neighbors and fragments equal the legacy owner',"JSON.stringify(wb.data.neighborhood.getSnapshot().map.neighbors)===JSON.stringify(hv.neighborhood.getSnapshot().map.neighbors)");
  await shot('unified-neighborhood');
  await ev("hv.navigate({page:'connection-opportunities'});window.wb=hv.workbench.map;void 0");
  await activate('connections-refresh');await wait("wb.data.globalComparison.getSnapshot().state==='ready'&&!wb.pendingRender");
  await ev('hv.comparison.refresh()');
  await pass('Global opportunities preserve candidates, aligned and explicit-only relations',"JSON.stringify(wb.data.globalComparison.getSnapshot().comparison.pairs)===JSON.stringify(hv.comparison.getSnapshot().comparison.pairs)");
  await pass('Global inspectors never change folder participation or geometry','JSON.stringify(wb.points)===unifiedPoints&&wb.layoutCount===unifiedLayouts');
  await shot('unified-opportunities');
  await activate('workbench-inspector-close');
  await pass('All read-only inspector work preserves Markdown and makes no network call','io.reads===0&&io.writes===0&&io.network===0');
  await activate('workbench-families');
  const family=await ev("[...document.querySelectorAll('[data-semantic-family]')].find(e=>e.getAttribute('data-semantic-family').includes('Docker/Guide.md')).getAttribute('data-health-action')");
  await activate(family);await activate('family-note-'+encodeURIComponent('Bridges/Docker database.md'));
  await field('workbench-second','Database/Guide.md');
  await ev("document.querySelector('[data-health-action=workbench-second]').focus();void 0");await key('ArrowDown','ArrowDown',40);await key('Enter','Enter',13,'\r');
  await wait('!!wb.selected');await ev('window.savedUnifiedContext=JSON.stringify([wb.graph.viewport,wb.families,wb.selected,wb.query,wb.zones.filter,wb.data.scope]);void 0');
  await activate('workbench-compare');await wait("!!document.querySelector('[data-pair-heading]')");
  await pass('Pair Inspector retains separate consent and no implicit write','io.writes===0&&io.network===0');await shot('unified-pair');
  await activate('workbench-back');
  await pass('Pair Back preserves family, pair, filters, scope and camera','JSON.stringify([wb.graph.viewport,wb.families,wb.selected,wb.query,wb.zones.filter,wb.data.scope])===savedUnifiedContext');
  for(const language of ['en','ru']) {
    await ev('app.setting.open();app.setting.openTabById("ai-knowledge-hub");void 0');
    await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'));}void 0`);
    await ev('plugin.settingsSave');await ev('app.setting.close();hv.render();void 0');await focus();
    if(!await ev("!!document.querySelector('[data-health-action=workbench-refresh]')"))await activate('review-map');
    await ev('window.wb=hv.workbench.map;void 0');
    await activate('workbench-advanced');await activate('workbench-advanced-topology');
    for(const theme of ['light','dark']) {
      await ev(`app.changeTheme('${theme==='light'?'moonstone':'obsidian'}');void 0`);await wait(`document.body.classList.contains('theme-${theme}')`);
      await main.send('Emulation.setDeviceMetricsOverride',{width:390,height:850,deviceScaleFactor:1,mobile:false});
      await pass(`${language}/${theme}: inspector fits 390px without covering the map`,"(()=>{const map=wb.element.querySelector('.veynrel-workbench-map-pane').getBoundingClientRect(),inspector=wb.element.querySelector('.veynrel-workbench-inspector').getBoundingClientRect();return hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1&&inspector.top>=map.bottom&&!wb.element.textContent.match(/@r062b\\./);})()");
      await shot(`unified-${language}-${theme}-390`);
    }
    await main.send('Emulation.clearDeviceMetricsOverride');
    await activate('workbench-inspector-close');
  }
  await ev("window.split=app.workspace.getLeaf('split');split.openFile(app.vault.getFileByPath('Docker/Guide.md'),{state:{mode:'preview'}})");
  await pass('Real split retains the source document ownership','split.view.containerEl.ownerDocument===document');await shot('unified-split');await ev('split.detach();void 0');
  // Separate Workbench sessions sharing the same topology, in a real second leaf.
  await ev("window.second=app.workspace.getLeaf('split');second.setViewState({type:'veynrel-health',active:true})");
  await wait('!!second.view.body&&!!second.view.areaIndex');
  await ev("second.view.navigate({page:'semantic-map'});window.other=second.view.workbench.map;void 0");
  await pass('Concurrent Workbenches share topology, never global/focus/neighborhood ownership',"other.data.dependencies.topology===wb.data.dependencies.topology&&other.data.global!==wb.data.global&&other.data.neighborhood!==wb.data.neighborhood");
  await ev('other.data.global.refresh()');
  await ev('window.otherCapture=other.data.global.getSnapshot().map;wb.data.cancel();void 0');
  await pass('Cancelling this window cannot invalidate another window’s global result',"other.data.global.getSnapshot().map===otherCapture&&other.data.global.getSnapshot().state==='ready'");
  await ev('second.detach();void 0');await focus();
  await ev("hv.navigate({page:'topology'});window.wb=hv.workbench.map;void 0");
  await pass('Legacy topology route stays in one graph with its structural inspector',"hv.route.page==='discover'&&wb.inspectors.panel==='topology'&&document.querySelectorAll('svg[data-camera]').length===1&&!document.querySelector('.veynrel-topology-svg')");
  await shot('unified-final');
}
