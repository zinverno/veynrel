import { runFloatingSource } from './floating-source-journey.mjs';
import { runSemanticStates } from './semantic-state-journey.mjs';
import { runSemanticLimits } from './semantic-limits-journey.mjs';
import { runFloatingActions } from './floating-actions-journey.mjs';
import assert from 'node:assert/strict';
export async function runSemanticFloating(ctx) {
  const {main,wait,pass,shot,phase,key,focus,providerUrl,report,pause}=ctx;
  if(['before','cap'].includes(phase))return runSemanticLimits(ctx);
  if(phase==='edges')return runFloatingSource(ctx);
  if(phase==='panel')return runFloatingActions(ctx);
  const mark=async name=>{(report.ioStages??=[]).push({name,time:Date.now()/1000,io:await main.ev('({...uxIO,...stageIO})'),providerCalls:report.providerRequests.length});};
  const action = id => `[data-health-action="${id}"]`;
  const activate = async selector => { await main.ev(`document.querySelector(${JSON.stringify(selector)}).focus();void 0`); await key('Enter','Enter',13,'\r'); };
  const home = async () => { if(await main.ev(`!!document.querySelector('${action('nav-home')}')`))await activate(action('nav-home')); };
  const entry = async intent => { await home(); await activate(action('overview-semantic')); await activate(action(intent==='similar'?'semantic-similar':'semantic-mode-'+(intent==='pair'?'notes':intent))); };
  const choose = async (path,id='semantic-source') => { await activate(action(id)); await wait("!!document.querySelector('.prompt-input')"); await main.send('Input.insertText',{text:path}); await key('Enter','Enter',13,'\r'); await wait("!document.querySelector('.prompt-input')"); };
  await wait('app.vault.getMarkdownFiles().every(f=>!!app.metadataCache.getFileCache(f))');
  await main.ev('app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();window.electronWindow.setContentSize(1360,950);void 0'); await focus();
  await main.ev("app.changeTheme('obsidian');void 0"); await wait("document.body.classList.contains('theme-dark')");
  await shot('regression-overview'); await activate(action('overview-tools')); await shot('regression-ring');
  await mark('before-semantic-open');await entry('neighborhood');await mark('semantic-open'); await shot('routes-no-index');
  await pass('No-index retains neighborhood intent and source choice',"hv.scenario.context.entry.intent==='neighborhood'&&!!document.querySelector('[data-semantic-state=no-index]')");
  await activate(action('semantic-setup')); await wait(`!!document.querySelector('${action('semantic-setup-return')}')`); await activate(action('semantic-setup-return'));await mark('setup-return');
  await pass('Setup returns to the original intent',"hv.scenario.context.entry.intent==='neighborhood'");
  await main.ev(`plugin.getSemanticSettingsPort().update({...plugin.settings.semantic,enabled:true,embeddingProvider:'ollama',embeddingModel:'overview-synthetic',embeddingBaseUrl:'${providerUrl}'})`);
  await main.ev('plugin.getSemanticController().refreshSemanticStatus()');
  for (const lang of ['en','ru']) {
    if(lang==='ru'){await main.ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");await main.ev("{const s=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));s.value='ru';s.dispatchEvent(new Event('change'));}void 0");await main.ev('plugin.settingsSave');await main.ev('app.setting.close();hv.render();void 0');await focus();}
  for (const intent of ['map','families','pair','neighborhood','opportunities','focus','similar']) {
    const count=report.providerRequests.length;
    await entry(intent); await pass(`${intent} keeps its own first surface`, `document.querySelector('[data-semantic-intent="${intent}"]')!==null`);
    assert.equal(report.providerRequests.length,count,'Entry sends no model/embedding request');
    if(['neighborhood','focus','similar'].includes(intent)) {
      await pass(`${intent} requires an explicit source`,"!!document.querySelector('[data-semantic-state=source-missing]')");
      await choose('Source.md'); await pass(`${intent} choose does not compute`,"!hv.scenario.data.neighborhood.getSnapshot().map&&!hv.scenario.data.globalSemantic.getSnapshot().map");
      await activate(action('semantic-compute')); await wait('!hv.scenario.data.neighborhood.getSnapshot().busy&&!hv.scenario.data.globalSemantic.getSnapshot().busy');
      if(intent==='focus') await pass('Focus computes every eligible document and displays a page',"hv.scenario.data.globalSemantic.getSnapshot().focus.scores.length===hv.scenario.data.globalSemantic.getSnapshot().map.nodes.length&&document.querySelectorAll('[data-focus-path]').length===40");
      else if(intent==='neighborhood') await pass('Neighborhood shows indexed fragment text and line evidence', "!!document.querySelector('[data-neighbor-path] blockquote')&&!!document.querySelector('[data-neighbor-path] small')");
      else await pass('Similar notes shows ranked document rows with a separate fragments action', "!!document.querySelector('[data-neighbor-path] strong')&&!!document.querySelector('[data-health-action=semantic-fragments]')&&!document.querySelector('[data-neighbor-path] blockquote')");
      if(intent==='focus') {while(await main.ev("!!document.querySelector('[data-health-action=semantic-more]')"))await activate(action('semantic-more'));await pass('Full global result is accessible beyond the first page',"document.querySelectorAll('[data-focus-path]').length===hv.scenario.data.globalSemantic.getSnapshot().focus.scores.length-1");}
    } else if(intent==='pair') {
      await choose('Source.md','semantic-pair-0'); await choose('Other.md','semantic-pair-1'); await shot('routes-pair-select-'+lang); await activate(action('semantic-compare'));
      await wait("!!document.querySelector('.veynrel-pair-review')||!!document.querySelector('[data-semantic-intent=pair] .consolidation-review')||hv.scenario.reviewOpen");
      await pass('Pair mounts the existing review without model requests','hv.scenario.reviewOpen');
      assert.equal(report.providerRequests.length,count); await shot('routes-pair-review-'+lang); await activate(action('semantic-pair-back'));
    } else {
      await activate(action(intent==='map'?'workbench-refresh':intent==='opportunities'?'connections-refresh':'semantic-compute'));
      await wait('!hv.scenario.data.busy&&!hv.scenario.data.semantic.getSnapshot().busy&&!hv.scenario.data.globalSemantic.getSnapshot().busy');
    }
    if(intent==='families') {
      await wait("!!document.querySelector('[data-health-action=semantic-family-0]')");
      await activate(action('semantic-family-0'));await main.ev('window.selectedFamily=hv.scenario.context.entry.familyId;void 0');
      await pass('Family displays member paths from the stored index', "document.querySelectorAll('[data-semantic-family] .veynrel-semantic-row').length>=2");
      await activate(action('semantic-family-map'));await pass('Family opens its existing map context',"hv.scenario.context.entry.familyId===selectedFamily&&hv.scenario.context.entry.intent==='map'");
      await activate(action('semantic-back'));await pass('Family Back restores selected membership',"hv.scenario.context.entry.familyId===selectedFamily&&!!document.querySelector('[data-semantic-family]')");
    }
    await shot('routes-'+intent+'-'+lang+'-dark');
    await main.ev("app.changeTheme('moonstone');void 0"); await shot('routes-'+intent+'-'+lang+'-light');
    await main.ev('window.electronWindow.setContentSize(390,950);void 0'); await wait('innerWidth===390');
    await pass(`${intent} narrow has no overflow`,'hv.contentEl.scrollWidth<=hv.contentEl.clientWidth+1'); await shot('routes-'+intent+'-'+lang+'-390');
    await main.ev("window.electronWindow.setContentSize(1360,950);app.changeTheme('obsidian');void 0");
  }
  }
  await entry('neighborhood'); await choose('Source.md'); await activate(action('semantic-compute')); await wait('!!document.querySelector("[data-neighbor-path]")');
  await main.ev('window.firstNeighbor=document.querySelector("[data-neighbor-path]").dataset.neighborPath;void 0');
  await activate('[data-health-action^="semantic-explore-"]'); await pass('Explore explicitly changes the source','hv.scenario.context.entry.sourcePath===firstNeighbor');
  await activate(action('semantic-back')); await pass('Back restores indexed fragments and source',"hv.scenario.context.entry.sourcePath==='Source.md'&&!!document.querySelector('[data-neighbor-path]')");
  await runSemanticStates(ctx);
  if(phase==='full')await runFloatingActions(ctx);
  report.semanticEvidence='Synthetic existing stored index; native scenario contents and existing owners. No semantic-quality claim.';
}
