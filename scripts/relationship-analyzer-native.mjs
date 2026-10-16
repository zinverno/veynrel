// Run through the existing disposable Pair Inspector harness:
// node scripts/pair-inspector-native.mjs /tmp/pair-inspector-relationship-fresh --relationships
// Scripted responses verify the contract/UI, never real-model classification quality.
import fs from 'node:fs';
import assert from 'node:assert/strict';

export async function relationshipScenario({ ev, wait, cdp, close, root, vault, paths: [a, b], ROOT }) {
  const cases = JSON.parse(fs.readFileSync(ROOT + '/tests/fixtures/relationships.json', 'utf8'));
  const originals = [fs.readFileSync(vault + '/' + a, 'utf8'), fs.readFileSync(vault + '/' + b, 'utf8')];
  const checks = [], refusals = [];
  const stage = name => wait(`document.querySelector('[data-relationship-stage]')?.dataset.relationshipStage===${JSON.stringify(name)}`);
  const action = name => ev(`document.querySelector('[data-relationship-action=${name}]').click()`);
  const pass = async (name, expression) => { assert(await ev(expression), name); checks.push(name); console.log(name); };
  const open = async () => {
    await ev(`engine.inspectPair({leftPath:${JSON.stringify(a)},rightPath:${JSON.stringify(b)}})`);
    await wait("['ready','stale'].includes(document.querySelector('.ai-pair-inspector [role=status]')?.dataset.state)");
    // External fixture edits can finish MetadataCache processing after initial open.
    if (await ev("document.querySelector('.ai-pair-inspector [role=status]').dataset.state==='stale'")) {
      await ev("document.querySelector('.ai-pair-inspector button').click()");
    }
    await wait("document.querySelectorAll('.ai-pair-source').length===2");
  };
  const closeCurrent = async () => { if (await ev("!!document.querySelector('.ai-pair-inspector')")) { await close(); await wait("!document.querySelector('.ai-pair-inspector')"); } };
  const write = async (left, right) => {
    await closeCurrent();
    const changes = [[a, left], [b, right]].filter(([path, data]) => fs.readFileSync(vault + '/' + path, 'utf8') !== data);
    if (!changes.length) return;
    // Wait for actual native cache completion, not just Vault's earlier stat update.
    await ev(`window.relWrite={expected:new Map(${JSON.stringify(changes)}),seen:new Set(),resolved:false};
      relWrite.changed=app.metadataCache.on('changed',(file,data)=>{if(relWrite.expected.get(file.path)===data)relWrite.seen.add(file.path)});
      relWrite.done=app.metadataCache.on('resolved',()=>{if(relWrite.seen.size===relWrite.expected.size)relWrite.resolved=true});void 0`);
    for (const [path, data] of changes) fs.writeFileSync(vault + '/' + path, data);
    for (const [path] of changes) {
      const modified = fs.statSync(vault + '/' + path).mtimeMs;
      await wait(`Math.abs(app.vault.getFileByPath(${JSON.stringify(path)}).stat.mtime-${modified})<2`);
    }
    await wait('relWrite.resolved');
    await ev('app.metadataCache.offref(relWrite.changed);app.metadataCache.offref(relWrite.done);void 0');
  };
  await closeCurrent();
  await ev(`window.rel={calls:[],mode:'ok',pending:[],sessions:[]};
    rel.savedModel={provider:plugin.settings.provider,model:plugin.settings.model,apiKey:plugin.settings.apiKey,baseUrl:plugin.settings.baseUrl,temperature:plugin.settings.temperature};
    Object.assign(plugin.settings,{provider:'custom',model:'synthetic-relationship',apiKey:'synthetic-relationship-key',baseUrl:'https://example.invalid/v1',temperature:0.2});
    rel.factory=engine.relationshipSession;
    engine.relationshipSession=paths=>{const session=rel.factory(paths);rel.sessions.push(session);session.deps.complete=async(settings,system,user,signal)=>{
      rel.calls.push({model:settings.model,system,user});rel.signal=signal;const response=JSON.parse(JSON.stringify(rel.fixture.response));
      if(rel.mode==='slow')await new Promise(resolve=>rel.pending.push(resolve));
      if(rel.mode==='invalid')return 'not JSON';
      if(rel.mode==='badQuote')response.claims[0].quoteA='fabricated evidence';
      return JSON.stringify(response);
    };return session;};void 0`);
  try {
    for (const item of cases) {
      await write(item.a, item.b);
      await ev(`rel.fixture=${JSON.stringify(item)};rel.mode='ok';rel.before=rel.calls.length;void 0`);
      await open(); await pass(item.name + ': opening is local', 'rel.calls.length===rel.before');
      await action('analyze'); await stage('consent');
      await pass(item.name + ': complete exact consent, no request yet', `rel.calls.length===rel.before&&JSON.stringify(JSON.parse(JSON.parse(document.querySelector('.ai-relationship pre').textContent).messages[1].content))===JSON.stringify({A:rel.fixture.a,B:rel.fixture.b})&&!document.querySelector('.ai-relationship').textContent.includes('synthetic-relationship-key')`);
      if (item.name === 'near_duplicates') {
        await ev("document.querySelector('.ai-relationship details').open=true");
        for (const theme of ['theme-light', 'theme-dark']) for (const width of [1200, 390]) {
          await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
          await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}')`);
          await pass(`RU consent ${theme} ${width}: no overflow`, "[...document.querySelectorAll('.ai-relationship,.ai-relationship pre')].every(e=>e.scrollWidth<=e.clientWidth+1)");
        }
        await ev("document.querySelector('.ai-relationship').scrollIntoView({block:'start'})");
        fs.writeFileSync(root + '/relationship-consent-ru.png', Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
      }
      await ev("{const button=document.querySelector('[data-relationship-action=confirm]');button.click();button.click();}void 0"); await stage('result');
      await pass(item.name + ': exactly one confirmed request and expected relation', `rel.calls.length===rel.before+1&&rel.sessions.at(-1).view.result.relation===${JSON.stringify(item.response.relation)}`);
      if (['partial_overlap', 'theory_and_context', 'contradiction', 'versions'].includes(item.name)) {
        await pass(item.name + ': only supplied and verified quote sides render', `rel.fixture.response.claims.every((claim,i)=>{
          const card=document.querySelectorAll('.ai-relationship .ai-semantic-duplicate-card')[i];
          const quotes=[claim.quoteA,claim.quoteB].filter(q=>q!==null);
          return JSON.stringify([...card.querySelectorAll('pre')].map(e=>e.textContent))===JSON.stringify(quotes)&&card.querySelectorAll('p').length===1+quotes.length;
        })`);
      }
      if (['conflicting', 'unrelated', 'insufficient_context'].includes(item.response.relation)) refusals.push({ fixture: item.name, relation: item.response.relation, action: item.response.recommendation.action });
      if (item.name === 'standalone_large_section') await pass('Source beyond inspector preview is sent whole', "JSON.parse(rel.calls.at(-1).user).A.length>12000&&JSON.parse(rel.calls.at(-1).user).A.includes('A bounded queue')");
      await action('dismiss'); await stage('dismissed');
    }
    const item = cases[0]; await write(item.a, item.b); await ev(`rel.fixture=${JSON.stringify(item)};void 0`);
    await open();
    for (const mode of ['invalid', 'badQuote']) {
      await ev(`rel.mode=${JSON.stringify(mode)};void 0`); await action('analyze'); await stage('consent'); await action('confirm'); await stage('error');
      await pass(mode + ': no recommendation displayed', "!rel.sessions.at(-1).view.result&&!document.querySelector('[data-relationship-action=dismiss]')"); refusals.push({ fixture: mode, state: 'error' });
    }
    const context = cases.find(c => c.name === 'theory_and_context'); await write(context.a, context.b); await open();
    for (const [field, value] of [['quoteA', null], ['quoteB', 'fabricated optional quote']]) {
      await ev(`rel.fixture=${JSON.stringify(context)};rel.fixture.response.claims[1][${JSON.stringify(field)}]=${JSON.stringify(value)};rel.mode='ok';void 0`);
      await action('analyze'); await stage('consent'); await action('confirm'); await stage('error');
      await pass(field + ': invalid contextual evidence yields no recommendation', '!rel.sessions.at(-1).view.result');
      refusals.push({ fixture: field === 'quoteA' ? 'missing required contextual quote' : 'fabricated optional quote', state: 'error' });
    }
    await write(item.a, item.b); await open(); await ev(`rel.fixture=${JSON.stringify(item)};void 0`);
    await ev("rel.mode='ok';rel.before=rel.calls.length;void 0"); await action('analyze'); await stage('consent');
    fs.writeFileSync(vault + '/' + a, item.a + '\nChanged before confirmation.'); await stage('stale');
    await pass('File change revokes consent without dispatch', 'rel.calls.length===rel.before');
    await write(item.a, item.b); await open(); await action('analyze'); await stage('consent');
    await ev("rel.mode='slow';void 0"); await action('confirm'); await stage('running'); await wait('rel.pending.length===1');
    fs.writeFileSync(vault + '/' + a, item.a + '\nChanged during the request.'); await stage('stale');
    await pass('File change aborts in-flight waiting', 'rel.signal.aborted'); await ev('rel.pending.shift()();void 0');
    await pass('Late reply cannot restore invalidated result', '!rel.sessions.at(-1).view.result');
    await write(item.a, item.b); await open(); await action('analyze'); await stage('consent');
    await action('confirm'); await wait('rel.pending.length===1'); await action('cancel'); await stage('cancelled');
    await pass('Cancel aborts waiting', 'rel.signal.aborted'); await ev('rel.pending.shift()();void 0');
    await action('analyze'); await stage('consent'); await action('confirm'); await wait('rel.pending.length===1');
    await closeCurrent(); await pass('Close aborts waiting and clears session', "rel.signal.aborted&&rel.sessions.at(-1).view.stage==='idle'"); await ev('rel.pending.shift()();void 0');
    await open(); await ev("rel.mode='ok';void 0"); await action('analyze'); await stage('consent'); await action('confirm'); await stage('result');
    await ev("plugin.settings.model='different-synthetic-model';plugin.notifyLanguageModelSettingsChanged();void 0"); await stage('stale');
    await pass('Model change removes completed result', '!rel.sessions.at(-1).view.result');
    await action('analyze'); await stage('consent'); await action('confirm'); await stage('result');
    fs.writeFileSync(vault + '/' + a, item.a + '\nChanged after the result.'); await stage('stale');
    await pass('Saved source change removes completed result', '!rel.sessions.at(-1).view.result');
    await write('X'.repeat(20001), item.b); await open(); await ev('rel.before=rel.calls.length;void 0'); await action('analyze'); await stage('error');
    await pass('Oversized pair refuses instead of sending a partial preview', "rel.sessions.at(-1).view.error==='tooLarge'&&rel.calls.length===rel.before"); refusals.push({ fixture: 'tooLarge', state: 'local refusal, no request' });
    await write(item.a, item.b);
    await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await ev("{const s=[...app.setting.modalEl.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='ru'));s.value='en';s.dispatchEvent(new Event('change'));app.setting.close();}void 0"); await ev('plugin.settingsSave');
    await open(); await action('analyze'); await stage('consent'); await action('confirm'); await stage('result');
    for (const theme of ['theme-light', 'theme-dark']) for (const width of [390, 1200]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}')`);
      await pass(`EN result ${theme} ${width}: no overflow`, "[...document.querySelectorAll('.ai-relationship,.ai-relationship pre')].every(e=>e.scrollWidth<=e.clientWidth+1)");
    }
    await ev("document.querySelector('.ai-relationship').scrollIntoView({block:'start'})");
    await pass('EN result shows provisional analysis and exact-quote limits', "document.querySelector('.ai-relationship').textContent.includes('preliminary model recommendations')&&document.querySelector('.ai-relationship').textContent.includes('exact match verified')");
    fs.writeFileSync(root + '/relationship-result-en.png', Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await pass('Analysis performs no Markdown writes or real provider/network calls', 'io.write===0&&io.network===0');
    return { status: 'PASS', checks, refusals, fakeRequests: await ev('rel.calls.length'), limitation: 'Scripted fake transport responses; no real model accuracy or classification quality measured.' };
  } finally {
    await closeCurrent(); await ev('Object.assign(plugin.settings,rel.savedModel);engine.relationshipSession=rel.factory;void 0');
    await write(...originals); await open();
  }
}
