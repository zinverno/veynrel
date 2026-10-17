// Synthetic native UI only. Run via pair-inspector-native.mjs --change-planner.
import fs from 'node:fs';
import assert from 'node:assert/strict';

export async function changePlannerScenario({ ev, wait, cdp, close, focusMain, root, vault, paths, ROOT }) {
  const fixture = JSON.parse(fs.readFileSync(ROOT + '/tests/fixtures/change-planner.json', 'utf8'));
  const a = 'Planner/English/Same.md', b = 'Planner/Русский/Same.md', checks = [];
  const pass = async (name, expression) => { assert(await ev(expression), name); checks.push(name); console.log(name); };
  const act = name => ev(`document.querySelector('[data-planner-action=${name}]').click()`);
  const field = (name, value) => ev(`{const e=document.querySelector('[data-planner-field=${name}]');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change'));}void 0`);
  const stage = name => wait(`document.querySelector('[data-planner-stage]')?.dataset.plannerStage===${JSON.stringify(name)}`);
  const closePair = async () => { if (await ev("!!document.querySelector('.ai-pair-inspector')")) { await close(); await wait("!document.querySelector('.ai-pair-inspector')"); } };
  const write = async (left, right) => {
    await closePair(); const changes = [[a, left], [b, right]].filter(([path, data]) => !fs.existsSync(vault + '/' + path) || fs.readFileSync(vault + '/' + path, 'utf8') !== data);
    if (!changes.length) return;
    await ev(`window.plannerWrite={expected:new Map(${JSON.stringify(changes)}),seen:new Set(),resolved:false};
      plannerWrite.changed=app.metadataCache.on('changed',(file,data)=>{if(plannerWrite.expected.get(file.path)===data)plannerWrite.seen.add(file.path)});
      plannerWrite.done=app.metadataCache.on('resolved',()=>{if(plannerWrite.seen.size===plannerWrite.expected.size)plannerWrite.resolved=true});void 0`);
    for (const [path, data] of changes) { fs.mkdirSync(vault + '/' + path.slice(0, path.lastIndexOf('/')), { recursive: true }); fs.writeFileSync(vault + '/' + path, data); }
    await wait('plannerWrite.resolved');
    await ev('app.metadataCache.offref(plannerWrite.changed);app.metadataCache.offref(plannerWrite.done);void 0');
  };
  await closePair();
  await ev(`window.plannerTest={fixture:${JSON.stringify(fixture)},calls:0};
    plannerTest.settings={provider:plugin.settings.provider,model:plugin.settings.model,apiKey:plugin.settings.apiKey,baseUrl:plugin.settings.baseUrl};
    Object.assign(plugin.settings,{provider:'custom',model:'synthetic-planner',apiKey:'synthetic-only',baseUrl:'https://example.invalid/v1'});
    plannerTest.factory=engine.relationshipSession;engine.relationshipSession=paths=>{const s=plannerTest.factory(paths);s.deps.complete=async()=>{plannerTest.calls++;return JSON.stringify(plannerTest.fixture.response)};return s;};void 0`);
  const open = async () => {
    await focusMain(); await ev(`engine.inspectPair({leftPath:${JSON.stringify(a)},rightPath:${JSON.stringify(b)}})`);
    await wait("document.querySelectorAll('.ai-pair-note').length===2");
    await ev("document.querySelector('[data-relationship-action=analyze]').click()");
    await wait("!!document.querySelector('[data-relationship-action=confirm]')");
    await ev("document.querySelector('[data-relationship-action=confirm]').click()");
    await wait("!!document.querySelector('[data-planner-action=open]')");
    await ev('plannerTest.beforeCalls=plannerTest.calls;plannerTest.beforeReads=io.read.length;void 0');
    await act('open'); await stage('choosing');
    await ev('window.planSession=[...engine.pairInspectors].at(-1).planner;void 0');
    await pass('Planner prepares locally from exactly the two selected files', `plannerTest.calls===plannerTest.beforeCalls&&io.read.length===plannerTest.beforeReads+2&&io.read.slice(-2).every(p=>${JSON.stringify([a, b])}.includes(p))`);
  };
  const select = async (operation, range = 0) => {
    await field('operation', operation); await field('range', range);
    await pass('Exact range requires confirmation', "document.querySelector('[data-planner-action=build]').disabled&&!!document.querySelector('[data-planner-selection]')");
    await ev("document.querySelector('[data-planner-field=confirm]').click()");
  };
  const build = async () => { await act('build'); await stage('ready'); };
  try {
    await write(fixture.a, fixture.b);
    for (const language of ['ru', 'en']) {
      await closePair(); await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
      await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'));}void 0`);
      await ev('plugin.settingsSave'); await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'); await ev('app.setting.close();void 0');
      await open();
      await select('replace_with_embed');
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
      await wait("!document.querySelector('.notice')");
      await cdp('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
      await ev("document.querySelector('.ai-change-planner').scrollIntoView({block:'start'});void 0");
      fs.writeFileSync(`${root}/planner-${language}-selection.png`, Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
      await ev("document.querySelector('[data-planner-action=build]').focus()");
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r' });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' }); await stage('ready');
      await pass(language + ': keyboard build, exact embed and preserved context', `planSession.view.plan.after===${JSON.stringify(`![[${b.slice(0, -3)}]]` + fixture.a.slice(fixture.response.claims[0].quoteA.length))}&&plannerTest.calls===plannerTest.beforeCalls`);
      await pass(language + ': safe diff and no application control', "document.querySelectorAll('.ai-change-planner .ai-proposal-removed').length===1&&document.querySelectorAll('.ai-change-planner .ai-proposal-added').length===1&&!document.querySelector('.ai-change-planner img,.ai-change-planner iframe')&&![...document.querySelectorAll('.ai-change-planner button')].some(e=>/^(Apply|Применить)$/.test(e.textContent))&&!document.querySelector('.ai-change-planner').textContent.includes('@planner.')");
      for (const theme of ['theme-light', 'theme-dark']) for (const width of [1200, 390]) {
        await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');document.querySelector('.ai-planner-result').scrollIntoView({block:'start'});void 0`);
        const overflow = await ev("[...document.querySelectorAll('.ai-change-planner,.ai-change-planner select,.ai-change-planner pre,.ai-change-planner .ai-proposal-diff')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>({tag:e.tagName,cls:e.className,scroll:e.scrollWidth,client:e.clientWidth,text:e.textContent.slice(0,60)}))");
        if (overflow.length) console.log(JSON.stringify(overflow));
        await pass(`${language} ${theme} ${width}: plan and diff fit`, "[...document.querySelectorAll('.ai-change-planner,.ai-change-planner select,.ai-change-planner pre,.ai-change-planner .ai-proposal-diff')].every(e=>e.scrollWidth<=e.clientWidth+1)");
        fs.writeFileSync(`${root}/planner-${language}-${theme}-${width}.png`, Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
      }
      await cdp('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
      await ev("for(const e of document.querySelectorAll('[data-planner-text]'))e.parentElement.open=true;document.querySelector('[data-planner-text=before]').parentElement.scrollIntoView({block:'start'});void 0");
      fs.writeFileSync(`${root}/planner-${language}-before-after.png`, Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
      await field('range', 1); await pass('Changing a selection removes the old plan and clears confirmation', "!planSession.view.plan&&document.querySelector('[data-planner-action=build]').disabled");
      await field('operation', 'no_change'); await build(); await pass('No-change is a full outcome without a diff', 'planSession.view.plan.after===planSession.view.plan.before&&planSession.view.plan.edit===null&&!document.querySelector(".ai-change-planner .ai-proposal-diff")');
    }
    await select('add_link', 2); await build();
    await pass('A to B normal link has full path and preserves all other text', `planSession.view.plan.after===${JSON.stringify(fixture.a.trimEnd() + ` [[${b.slice(0, -3)}]]\n`)}`);
    await field('source', 1); await select('add_link'); await build();
    await pass('B to A link resolves homonyms from a different folder', `planSession.view.plan.targetPath===${JSON.stringify(a)}&&app.metadataCache.getFirstLinkpathDest(${JSON.stringify(a.slice(0, -3))},${JSON.stringify(b)}).path===${JSON.stringify(a)}`);
    await ev("app.metadataCache.trigger('resolved');void 0"); await stage('stale'); await pass('Metadata invalidates the completed plan', '!planSession.view.plan');
    await act('prepare'); await stage('choosing'); await field('operation', 'no_change'); await build();
    await ev("plugin.settings.model='synthetic-changed';plugin.notifyLanguageModelSettingsChanged();void 0");
    await pass('Model settings invalidate the analysis and clear its plan', "!document.querySelector('[data-planner-stage]')&&!document.querySelector('[data-planner-action=open]')");
    await closePair(); await open(); await select('replace_with_embed');
    await ev('plannerTest.read=planSession.deps.read;plannerTest.reads=0;planSession.deps.read=()=>{plannerTest.reads++;return new Promise(resolve=>plannerTest.finish=()=>plannerTest.read().then(resolve))};void 0');
    await ev('plannerTest.choice={operation:"replace_with_embed",source:0,selection:planSession.view.input.pair[0].cache.sections.filter(s=>s.type==="paragraph").map(s=>({start:s.position.start.offset,end:s.position.end.offset,text:planSession.view.input.pair[0].content.slice(s.position.start.offset,s.position.end.offset)}))[0],confirmed:true};void 0');
    await act('build'); await ev('void planSession.build(plannerTest.choice)'); await closePair(); await ev('plannerTest.finish()');
    await pass('Close and double click block late plans', 'plannerTest.reads===1&&!planSession.view.plan&&!document.querySelector(".ai-change-planner")');
    await open(); await select('add_link'); await act('cancel'); await stage('cancelled');
    await pass('Cancel drops source snapshots and plan', '!planSession.view.input&&!planSession.view.plan');
    for (const [name, left, right, error] of [
      ['existing link', fixture.a + `\n[[${b.slice(0, -3)}]]\n`, fixture.b, 'existing'],
      ['direct embed cycle', fixture.a, fixture.b + `\n![[${a.slice(0, -3)}]]\n`, 'cycle'],
      ['target dependency', fixture.a, fixture.b + '\n![[Missing dependency]]\n', 'dependencies'],
      ['unique context in selected paragraph', fixture.a.replace('\n\n', '\n'), fixture.b, 'protected'],
    ]) {
      await write(left, right); await open(); await select('replace_with_embed'); await act('build'); await stage('error');
      await pass(name + ': clear refusal, no plan', `planSession.view.error===${JSON.stringify(error)}&&!planSession.view.plan`);
    }
    await write(fixture.a, fixture.b); await open(); await select('replace_with_embed'); await build();
    fs.writeFileSync(vault + '/' + a, fixture.a + '\nSaved change.');
    await wait("!document.querySelector('[data-planner-stage]')"); await pass('Saved source changes remove the plan', '!planSession.view.plan');
    await write(fixture.a, fixture.b); await open(); await select('replace_with_embed'); await build();
    await ev("window.plannerRenameResolved=false;window.plannerRenameRef=app.metadataCache.on('resolved',()=>{plannerRenameResolved=true});void 0");
    fs.renameSync(vault + '/' + b, vault + '/' + 'Planner/Русский/Moved.md');
    await wait("!document.querySelector('[data-planner-stage]')"); await pass('Moving the target removes the plan', '!planSession.view.plan');
    // Let the rename's metadata event finish before opening the next unrelated inspector.
    await wait('plannerRenameResolved');await ev('app.metadataCache.offref(plannerRenameRef);void 0');
    await pass('Planning has no provider calls or Markdown writes', 'io.write===0&&io.network===0&&plannerTest.calls===plannerTest.beforeCalls');
    assert.equal(fs.readFileSync(vault + '/' + a, 'utf8'), fixture.a);
    assert.equal(fs.readFileSync(vault + '/' + 'Planner/Русский/Moved.md', 'utf8'), fixture.b);
    return { status: 'PASS', checks, fakeRelationshipRequests: await ev('plannerTest.calls'), plannerProviderRequests: 0,
      fixture: { source: a, target: b, contextualExample: 'preserved', homonyms: true },
      limitations: 'Synthetic fake Relationship Analyzer only; no real model quality claim. Native Linux desktop, emulated widths, standard themes.' };
  } finally {
    await closePair(); await ev('Object.assign(plugin.settings,plannerTest.settings);engine.relationshipSession=plannerTest.factory;void 0');
    await ev(`engine.inspectPair({leftPath:${JSON.stringify(paths[0])},rightPath:${JSON.stringify(paths[1])}})`);
    // Cleanup follows the visible Refresh flow if delayed vault events invalidate the new read.
    for(let attempt=0;attempt<3;attempt++) {
      await wait("['ready','stale'].includes(document.querySelector('.ai-pair-inspector [role=status]')?.dataset.state)");
      if(await ev("document.querySelectorAll('.ai-pair-note').length===2"))break;
      await ev("new Promise(resolve=>setTimeout(resolve,250))");
      await ev("document.querySelector('.ai-pair-inspector .ai-semantic-search-controls button').click();void 0");
    }
    await wait("document.querySelectorAll('.ai-pair-note').length===2");
  }
}
