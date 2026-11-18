export async function runSemanticStates({main,wait,pass,shot,key,report,pause,connection,endpoint,focus}) {
  const activate=async id=>{await main.ev(`document.querySelector('[data-health-action="${id}"]').focus();void 0`);await key('Enter','Enter',13,'\r');};
  const entry=async name=>{if(await main.ev("!!document.querySelector('[data-health-action=nav-home]')"))await activate('nav-home');await activate('overview-semantic');await activate('semantic-mode-'+name);};
  const choose=async path=>{await activate('semantic-source');await main.send('Input.insertText',{text:path});await key('Enter','Enter',13,'\r');};
  await entry('neighborhood');await choose('Source.md');
  await main.ev('window.routeData=hv.scenario.data;window.realPrepare=routeData.dependencies.prepareExisting;routeData.dependencies.prepareExisting=()=>new Promise(r=>window.releaseRoutePrepare=()=>realPrepare().then(r));void 0');
  await activate('semantic-compute');await choose('Note-2.md');await main.ev('releaseRoutePrepare();void 0');await pause(100);
  await pass('Late A preparation cannot load into selected B',"hv.scenario.context.entry.sourcePath==='Note-2.md'&&!hv.scenario.data.neighborhood.getSnapshot().map");
  await main.ev('routeData.dependencies.prepareExisting=realPrepare;void 0');await activate('semantic-compute');await wait('!!hv.scenario.data.neighborhood.getSnapshot().map');await shot('state-late-A-selected-B');
  // Actual vault identity change, not a fabricated route status. Restore the synthetic file afterwards.
  await main.ev("app.vault.rename(app.vault.getFileByPath('Note-2.md'),'Renamed-2.md')");
  await wait("!!document.querySelector('[data-semantic-state=source-missing]')");
  await pass('Rename retains exact old source and intent',"hv.scenario.context.entry.sourcePath==='Note-2.md'&&hv.scenario.context.entry.intent==='neighborhood'");await shot('state-renamed-source');
  await main.ev("app.vault.rename(app.vault.getFileByPath('Renamed-2.md'),'Note-2.md')");
  await entry('neighborhood');await choose('Source.md');await activate('semantic-compute');await wait('!!hv.scenario.data.neighborhood.getSnapshot().map');
  // Metadata revision recreates view-owned projections; retained fragments are explicitly stale.
  await main.ev("app.vault.rename(app.vault.getFileByPath('Note-3.md'),'Renamed-3.md')");await wait("!!document.querySelector('[data-semantic-state=stale]')");await shot('state-stale-fragments');
  await main.ev("app.vault.rename(app.vault.getFileByPath('Renamed-3.md'),'Note-3.md')");
  await entry('neighborhood');await choose('Source.md');
  // Fault injection at the existing read-only engine boundary, exercising the real controller and UI.
  await main.ev('window.realSimilar=plugin.getSemanticController().findSimilarNotes;plugin.getSemanticController().findSimilarNotes=async()=>{throw Error("synthetic read failure")};void 0');await activate('semantic-compute');await wait("!!document.querySelector('[data-semantic-state=error]')");await shot('state-error');
  await main.ev('plugin.getSemanticController().findSimilarNotes=async()=>[];void 0');await activate('semantic-compute');await wait("!!document.querySelector('[data-semantic-state=empty]')");await shot('state-empty');
  await main.ev('plugin.getSemanticController().findSimilarNotes=realSimilar;void 0');
  report.faultInjection=['Neighborhood error/empty use explicit engine-boundary synthetic injections; screenshots are labelled, not semantic quality results.'];
  await entry('opportunities');await activate('connections-refresh');await wait("!!document.querySelector('.veynrel-connections-list button')");
  await main.ev("document.querySelector('.veynrel-connections-list button').click();void 0");await activate('connections-open-pair');await wait("!!document.querySelector('[data-review-keep]:not(:disabled)')");
  await main.ev("document.querySelector('[data-review-keep]').focus();void 0");await key('Enter','Enter',13,'\r');await wait("!!document.querySelector('[data-health-action=connections-open-pair]')");
  await pass('Pair decision returns to selected opportunity and durable owner', "hv.scenario.context.entry.intent==='opportunities'&&!!hv.scenario.comparison.selectedPair&&hv.scenario.pair.decisions.list().length===1");await shot('opportunity-durable-decision');
  await main.ev("window.realCache=app.metadataCache.getFileCache;app.metadataCache.getFileCache=function(f){return f.path==='Note-4.md'?null:realCache.call(this,f)};hv.scenario.data.dependencies.topology.refresh()");await activate('connections-refresh');await wait("!!document.querySelector('[data-semantic-state=partial]')");await shot('state-partial-metadata');
  await pass('Missing metadata remains unclassified',"hv.scenario.data.globalComparison.getSnapshot().comparison.semanticNotesUnavailableLinksCount>0");await main.ev('app.metadataCache.getFileCache=realCache;hv.scenario.data.dependencies.topology.refresh()');
  await main.ev("app.vault.createFolder('Scope fixture').then(()=>app.vault.create('Scope fixture/Only.md','# Scoped synthetic material')).then(()=>undefined)");await wait("hv.areaIndex.snapshot.folders.some(f=>f.path==='Scope fixture')");await entry('families');
  await main.ev('window.scopeData=hv.scenario.data;window.scopePrepare=scopeData.dependencies.prepareExisting;scopeData.dependencies.prepareExisting=()=>new Promise(r=>window.releaseScope=()=>scopePrepare().then(r));void 0');await activate('semantic-compute');await activate('scope-picker');await main.send('Input.insertText',{text:'Scope fixture'});await key('Enter','Enter',13,'\r');await main.ev('releaseScope();void 0');await pause(100);
  await pass('Changing scope invalidates late preparation and keeps requested paths',"hv.scenario.data.scope.id==='folder:Scope fixture'&&hv.scenario.data.scope.paths.length===1&&!hv.scenario.data.semantic.getSnapshot().map");await shot('state-changed-scope');
  await activate('scope-picker');await key('Enter','Enter',13,'\r');await main.ev("app.vault.delete(app.vault.getAbstractFileByPath('Scope fixture'),true)");
  // Two independent semantic views over the same shared topology owner.
  await entry('map');await main.ev("window.routeSplit=app.workspace.getLeaf('split');routeSplit.setViewState({type:'veynrel-health',active:true})");
  await main.ev("routeSplit.view.contentEl.querySelector('[data-health-action=overview-semantic]').click();routeSplit.view.contentEl.querySelector('[data-health-action=semantic-mode-notes]').click();void 0");
  await pass('Split shows its own explicit A/B selector',"!!routeSplit.view.contentEl.querySelector('[data-health-action=semantic-pair-0]')&&hv.scenario.context.entry.intent==='map'");await shot('routes-split');
  await main.ev('window.sharedTopology=hv.scenario.data.dependencies.topology;window.sharedRefresh=sharedTopology.refresh();routeSplit.detach();void 0');await main.ev('sharedRefresh');
  await pass('Closing a view leaves shared topology ready',"sharedTopology.getSnapshot().state==='ready'&&hv.scenario.context.entry.intent==='map'");
  await main.ev("window.routePop=app.workspace.getLeaf('window');routePop.setViewState({type:'veynrel-health',active:true})");await wait('routePop.view.containerEl.ownerDocument!==document');
  let target;for(let i=0;i<100;i++){target=(await(await fetch(`${endpoint}/json/list`)).json()).find(t=>t.type==='page'&&t.id!==main.id);if(target)break;await pause(50);}
  const pop=await connection(target);await focus(pop);
  await pop.ev("document.querySelector('[data-health-action=overview-semantic]').click();document.querySelector('[data-health-action=semantic-mode-notes]').click();void 0");
  await pass('Popout route owns its explicit pair selector',"!!document.querySelector('[data-health-action=semantic-pair-0]')",pop);await shot('routes-popout-pair',pop);
  await pop.ev("document.querySelector('[data-health-action=semantic-back]').click();void 0");await pass('Popout Back returns to its hub',"document.querySelectorAll('.veynrel-semantic-grid>a').length===7",pop);
  await main.ev('routePop.detach();void 0');await focus();
}
