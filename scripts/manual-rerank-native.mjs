// Runs only inside the credential-free, isolated scripts/rerank-native.mjs harness.
export async function manualRerankScenario({ evaluate, waitFor, check, screenshot, cdp, embeddings }) {
  const modal = "document.querySelector('.ai-semantic-search-modal')";
  const action = name => `${modal}?.querySelector('[data-rerank-action=${name}]')`;
  const state = name => waitFor(`document.querySelector('.ai-semantic-search-status')?.dataset.state==='${name}'`);
  const open = async () => { await evaluate('engine.openSearch()'); await waitFor(`!!${modal}`); };
  const close = async () => {
    await evaluate(`${modal}.closest('.modal').querySelector('.modal-close-button,.modal-header-button').click()`);
    await waitFor(`!${modal}`);
  };
  const search = async query => {
    await evaluate(`{const input=${modal}.querySelector('input');input.value=${JSON.stringify(query)};${modal}.querySelector('.ai-semantic-search-input-row button').click();}`);
  };
  const click = async name => { await evaluate(`${action(name)}.click()`); };
  const press = async key => {
    await cdp('Page.bringToFront');
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, text: key === 'Enter' ? '\r' : undefined,
      windowsVirtualKeyCode: key === 'Enter' ? 13 : 9 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: key === 'Enter' ? 13 : 9 });
  };
  const calls = () => evaluate('rerankCalls.length');

  check('new installation defaults to off/manual', await evaluate("!plugin.settings.rerank.enabled && plugin.settings.rerank.triggerMode==='manual'"));
  await evaluate("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health')");
  await waitFor("!!app.workspace.getLeavesOfType('veynrel-health')[0]?.view.contentEl.querySelector('[data-health-action=nav-discover]')");
  await evaluate("app.workspace.getLeavesOfType('veynrel-health')[0].view.contentEl.querySelector('[data-health-action=nav-discover]').click();app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
  await waitFor("!!app.setting.modalEl.querySelector('input[type=password]')");
  check('Discover and settings do not embed or rerank', embeddings() === 0 && await calls() === 0);
  check('mode selector is next to independent Rerank settings', await evaluate("[...app.setting.modalEl.querySelectorAll('.setting-item')].some(el=>el.innerText.includes('When should results be refined?') && el.querySelector('select')?.value==='manual')"));
  await evaluate("app.setting.close();engine.confirm=async()=>true;engine.indexVault()");
  await waitFor("engine.getSemanticStatus().kind==='ready'");
  check('indexing never reranks', await calls() === 0);
  await evaluate("Object.assign(plugin.settings.rerank,{enabled:true,triggerMode:'manual',apiKey:'synthetic-native-key'});engine.notifyRerankSettingsChanged();plugin.saveSettings()");
  await open();
  check('opening manual search has no refine button', await evaluate(`!${action('refine')}`));
  const before = embeddings(), reads = await evaluate('noteReads');
  await search('first synthetic search'); await state('semantic');
  await search('second synthetic search'); await state('semantic');
  check('two manual searches use two embeddings, zero rerank and no source reconstruction', embeddings() - before === 2 && await calls() === 0 && await evaluate(`noteReads===${reads}`));
  check('manual baseline shows 10 results and paid disclosure', await evaluate(`${modal}.querySelectorAll('.ai-semantic-result-card').length===10 && ${action('refine')}.innerText==='Refine results' && ${modal}.innerText.includes('request may incur a charge')`));
  await evaluate(`${action('refine')}.scrollIntoView({block:'end'})`); await screenshot('manual-baseline');
  await evaluate("mode='slow'");
  await evaluate(`${action('refine')}.focus()`); await press('Enter');
  await state('refining'); await waitFor('pendingRerank.length===1');
  await click('refine');
  check('keyboard refinement preserves originals and rejects double click', await calls() === 1 && await evaluate(`${action('refine')}.disabled && !${modal}.querySelector('input').disabled && ${modal}.querySelectorAll('.ai-semantic-result-card').length===10`));
  check('same 30 candidate pool reaches production serializer without filename fallbacks', embeddings() - before === 2 && await evaluate("rerankCalls[0].documents.length===30 && rerankCalls[0].top_n===30 && !JSON.stringify(rerankCalls[0]).includes('Note-') && rerankCalls[0].documents[0]==='Синтетический фрагмент 0. A local note about search and fragments.'"));
  await evaluate("mode='success';pendingRerank.shift()()"); await state('reranked');
  check('keyboard focus returns to the selected order switch', await evaluate("document.activeElement?.getAttribute('data-rerank-action')==='refined'"));
  check('production validator maps indices and preserves semantic scores', await evaluate(`${modal}.querySelector('.ai-semantic-result-title').innerText==='Note-29' && ${modal}.querySelector('.ai-semantic-result-score').innerText==='1.000' && ${modal}.innerText.includes('30 of 30')`));
  await evaluate(`${action('original')}.focus()`); await press('Enter'); await state('semantic');
  check('original order restored with keyboard and pressed state', await evaluate(`${modal}.querySelector('.ai-semantic-result-title').innerText==='Note-00' && ${action('original')}.getAttribute('aria-pressed')==='true'`));
  await click('refined'); await state('reranked');
  check('toggles do not embed or rerank again', embeddings() - before === 2 && await calls() === 1);
  await screenshot('manual-refined');
  await evaluate(`${modal}.querySelector('.ai-semantic-result-card').focus()`); await press('Enter');
  await waitFor("app.workspace.getActiveFile()?.path==='Note-29.md'");
  check('keyboard activation opens the selected current fragment', await evaluate('app.workspace.activeEditor.editor.getCursor().line===0'));
  await waitFor(`!${modal}`);

  await open(); await search('failure'); await state('semantic');
  await evaluate("mode='failure'"); const beforeFailure = await calls();
  await click('refine'); await state('fallback');
  check('safe fallback keeps originals and discloses explicitly paid retry', await evaluate(`${modal}.querySelector('.ai-semantic-result-title').innerText==='Note-00' && ${modal}.innerText.includes('another charge') && !document.body.innerText.includes('synthetic private error')`));
  check('failure is not retried automatically', await calls() === beforeFailure + 1);
  await evaluate("mode='success'"); await click('refine'); await state('reranked');
  check('separate retry click makes exactly one new call', await calls() === beforeFailure + 2);
  await close();

  for (const change of ['edit', 'new-search', 'close', 'mode', 'source']) {
    await open(); await search(`waiting-${change}`); await state('semantic');
    await evaluate("mode='slow'"); await click('refine'); await state('refining');
    await waitFor('pendingRerank.length===1');
    const count = await calls();
    if (change === 'edit') await evaluate(`{const input=${modal}.querySelector('input');input.value='draft query';input.dispatchEvent(new Event('input',{bubbles:true}));}`);
    if (change === 'new-search') { await search('new saved pool'); await state('semantic'); }
    if (change === 'close') await close();
    if (change === 'mode') await evaluate("plugin.settings.rerank.triggerMode='automatic';engine.notifyRerankSettingsChanged()");
    if (change === 'source') await evaluate("app.vault.modify(app.vault.getAbstractFileByPath('Note-00.md'),'Changed synthetic note after search.')");
    if (!['new-search', 'close'].includes(change)) await state('skipped');
    await evaluate("mode='success';pendingRerank.shift()()");
    check(`late response ignored after ${change}`, await calls() === count && await evaluate(change === 'close' ? `!${modal}` : `${modal}.querySelector('.ai-semantic-search-status').dataset.state==='${change === 'new-search' ? 'semantic' : 'skipped'}'`));
    if (change !== 'close') await close();
    await evaluate("plugin.settings.rerank.triggerMode='manual';engine.notifyRerankSettingsChanged()");
  }

  // Let the source-edit scenario's existing debounced indexing finish before testing a new stable session.
  await waitFor('engine.autoSync.timer===null && !engine.autoSync.activeBatch && !engine.autoSync.pending.upsertPaths.size');
  await evaluate('engine.indexVault()'); await waitFor("engine.getSemanticStatus().kind==='ready'");
  await open(); await search('saved but not sent'); await state('semantic');
  const countBeforeSettings = await calls();
  await evaluate("plugin.settings.rerank.apiKey='';engine.notifyRerankSettingsChanged()"); await state('skipped');
  check('changed settings remove old refine action without HTTP', await calls() === countBeforeSettings && await evaluate(`!${action('refine')}`));
  await close(); await open(); await search('not configured'); await state('semantic');
  check('missing key shows settings path instead of dead action', await evaluate(`!${action('refine')} && ${modal}.innerText.includes('Settings → Veynrel')`));
  await close();
  await evaluate("plugin.settings.rerank.apiKey='synthetic-native-key';engine.notifyRerankSettingsChanged();app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
  const indexIdentity = await evaluate('engine.getCachedIndexState()');
  await evaluate("{const row=[...app.setting.modalEl.querySelectorAll('.setting-item')].find(el=>el.innerText.includes('When should results be refined?'));const select=row.querySelector('select');select.value='automatic';select.dispatchEvent(new Event('change',{bubbles:true}));}");
  await waitFor("plugin.settings.rerank.triggerMode==='automatic'");
  await evaluate('(async()=>{await plugin.saveSettings();app.setting.close();})()');
  await open(); const autoBefore = await calls(), autoEmbeddings = embeddings();
  await search('automatic compatibility'); await state('reranked');
  check('automatic mode still refines after one search embedding', await calls() === autoBefore + 1 && embeddings() - autoEmbeddings === 1);
  check('triggerMode preserves index identity', JSON.stringify(indexIdentity) === JSON.stringify(await evaluate('engine.getCachedIndexState()')));
  await close();
  await evaluate("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
  check('mode survives settings reopening', await evaluate("[...app.setting.modalEl.querySelectorAll('.setting-item')].find(el=>el.innerText.includes('When should results be refined?')).querySelector('select').value==='automatic'"));
  await evaluate("plugin.settings.rerank.triggerMode='manual';engine.notifyRerankSettingsChanged();{const select=[...app.setting.modalEl.querySelectorAll('select')].find(el=>[...el.options].some(option=>option.value==='ru') && [...el.options].some(option=>option.value==='en'));select.value='ru';select.dispatchEvent(new Event('change',{bubbles:true}));}void 0");
  await waitFor("plugin.settings.language==='ru'");
  await evaluate('(async()=>{await plugin.saveSettings();app.setting.close();})()');
  await open(); await search('русский синтетический запрос'); await state('semantic');
  check('Russian manual labels and disclosure', await evaluate(`${action('refine')}.innerText==='Уточнить результаты' && ${modal}.innerText.includes('Запрос может быть платным')`));
  for (const width of [320, 390, 768, 1024, 1440]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: false });
    check(`manual controls fit ${width}px`, await evaluate(`${modal}.scrollWidth<=${modal}.clientWidth && ${action('refine')}.getBoundingClientRect().width<=${modal}.clientWidth`));
    check(`paid disclosure is fully visible at ${width}px`, await evaluate(`{const el=${modal};const footer=el.querySelector('.ai-semantic-refinement').getBoundingClientRect();const bounds=el.closest('.modal').getBoundingClientRect();footer.top>=bounds.top && footer.bottom<=bounds.bottom}`));
    if (width === 390) { await evaluate(`${action('refine')}.scrollIntoView({block:'end'})`); await screenshot('manual-narrow-ru'); }
  }
  await click('refine'); await state('reranked');
  check('Russian local order switches', await evaluate(`${action('original')}.innerText==='Исходный порядок' && ${action('refined')}.innerText==='После уточнения'`));
  await close();
}
