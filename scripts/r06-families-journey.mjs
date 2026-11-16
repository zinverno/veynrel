// Journey only: process, display, CDP, recording and byte guards belong to r06-map-native.
export async function runFamilyJourney({ev,pass,shot,activate,field,key,wait,focus,main,report}) {
  await activate('workbench-families');
  await pass('Real validated top-K publishes tentative cores',"document.querySelectorAll('[data-semantic-family]').length>=3");
  report.familyEvidence=await ev("({families:[...document.querySelectorAll('[data-semantic-family]')].map(e=>e.getAttribute('data-semantic-family')),revision:wb.data.semantic.getSnapshot().map.revision})");
  await pass('Docker/database bridge belongs to two distinct cores',"[...document.querySelectorAll('[data-semantic-family]')].filter(e=>e.getAttribute('data-semantic-family').includes('Bridges/Docker database.md')).length===2");
  await pass('Different-purpose ML pair and untagged diary do not create families',"![...document.querySelectorAll('[data-semantic-family]')].some(e=>['ML/','Journal/'].some(p=>e.getAttribute('data-semantic-family').includes(p)))");
  await shot('families-overview');
  await ev('window.familyOverview=JSON.stringify(wb.graph.viewport);window.familyCoordinates=JSON.stringify(wb.points);window.familyLayouts=wb.layoutCount;void 0');
  const family=await ev("[...document.querySelectorAll('[data-semantic-family]')].find(e=>e.getAttribute('data-semantic-family').includes('Docker/Guide.md')).getAttribute('data-health-action')");
  await activate(family);
  await pass('Family focuses existing coordinates without layout work','JSON.stringify(wb.points)===familyCoordinates&&wb.layoutCount===familyLayouts&&wb.graph.focus.length===3');
  await shot('family-members');
  await activate('family-note-'+encodeURIComponent('Bridges/Docker database.md'));
  await pass('Selected note retains both memberships and exact path',"wb.note==='Bridges/Docker database.md'&&wb.element.querySelector('.veynrel-workbench-selection').querySelectorAll('[data-health-action^=membership-]').length===2");
  await activate('relations-'+encodeURIComponent('Bridges/Docker database.md'));
  await shot('note-context');
  // Real keyboard text and native button activation, no element.click replacement.
  await ev("document.querySelector('[data-health-action=workbench-second]').focus();void 0");
  await main.send('Input.insertText',{text:'Database/Guide.md'});
  await pass('Duplicate basenames remain exact paths in bounded search',"document.querySelectorAll('[data-note-choice]').length===1&&document.querySelector('[data-note-choice]').getAttribute('data-note-choice')==='Database/Guide.md'");
  await key('ArrowDown','ArrowDown',40);await key('Enter','Enter',13,'\r');
  await wait('!!wb.selected');await ev('window.pairCamera=JSON.stringify(wb.graph.viewport);window.pairFamily=wb.families.selected;void 0');
  await shot('pair-selection');await activate('workbench-compare');await wait("!!document.querySelector('[data-pair-heading]')");
  await pass('Existing Pair Inspector opens without model consent or Markdown mutation','io.network===0&&io.writes===0');
  await shot('pair-inspector');await activate('workbench-back');
  await pass('Pair Back retains family, camera and coordinates','wb.families.selected===pairFamily&&JSON.stringify(wb.graph.viewport)===pairCamera&&JSON.stringify(wb.points)===familyCoordinates');
  await activate('workbench-family-back');await pass('Family Back restores overview camera exactly','JSON.stringify(wb.graph.viewport)===familyOverview&&JSON.stringify(wb.points)===familyCoordinates');
  for(const language of ['en','ru']) {
    await ev('app.setting.open();app.setting.openTabById("ai-knowledge-hub");void 0');
    await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'));}void 0`);
    await ev('plugin.settingsSave');await ev('app.setting.close();hv.render();void 0');await focus();
    if(!await ev("!!document.querySelector('[data-health-action=workbench-refresh]')"))await activate('review-map');
    await ev('window.wb=hv.workbench.map;void 0');
    for(const theme of ['light','dark']) {
      await ev(`app.changeTheme('${theme==='light'?'moonstone':'obsidian'}');void 0`);await wait(`document.body.classList.contains('theme-${theme}')`);
      await main.send('Emulation.setDeviceMetricsOverride',{width:390,height:850,deviceScaleFactor:1,mobile:false});
      await pass(`${language}/${theme}: bounded family controls fit 390px`,"hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1&&!!document.querySelector('[data-health-action=workbench-families]')");
      await shot(`families-${language}-${theme}-390`);
    }
  }
  await main.send('Emulation.clearDeviceMetricsOverride');
  await activate('workbench-clear-selection');
  await ev('window.preStale=JSON.stringify(wb.points);wb.data.semantic.invalidate();void 0');await wait('!wb.pendingRender');
  await pass('Synthetic owner invalidation withdraws stale family evidence',"wb.data.semantic.getSnapshot().state==='stale'&&!document.querySelector('[data-semantic-family]')&&!wb.families.selected&&JSON.stringify(wb.points)===preStale");
  await activate('workbench-refresh');await wait('!wb.data.busy&&!wb.pendingRender&&wb.simulation.alpha===0');
  await pass('Explicit refresh restores current family projection',"document.querySelectorAll('[data-semantic-family]').length>=3");
  await activate('workbench-map-toggle');await activate('workbench-mode-notes');await field('workbench-search','Guide');
  await pass('List alternative retains both duplicate basenames',"document.querySelectorAll('[data-workbench-path]').length===2");
  await shot('list-alternative');
}
