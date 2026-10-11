// Credential-free native smoke: npm run build; node scripts/rerank-native.mjs prepare /tmp/veynrel-rerank-native
// Launch isolated Obsidian with that profile on CDP 9261, then run this script with mode 'run'.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import crypto from 'node:crypto';
const [mode, root, scenario = 'automatic'] = process.argv.slice(2);
assert(['automatic', 'manual'].includes(scenario));
assert(['prepare', 'run'].includes(mode));
assert(root?.startsWith('/tmp/') && !root.includes('..'));
const vault = root + '/vault', pluginDir = vault + '/.obsidian/plugins/ai-knowledge-hub';
if (mode === 'prepare') {
  await fs.mkdir(pluginDir, { recursive: true }); await fs.mkdir(root + '/profile', { recursive: true });
  for (let i = 0; i < (scenario === 'manual' ? 34 : 12); i++) await fs.writeFile(`${vault}/Note-${String(i).padStart(2, '0')}.md`,
    (i < 2 ? '' : `# Synthetic ${i}\n\n`) + `Синтетический фрагмент ${i}. A local note about search and fragments.` +
    (i === 0 ? '' : `\n\n## Navigation\n\nSecond section ${i}.`));
  await fs.writeFile(pluginDir + '/data.json', JSON.stringify({ language: 'en', apiKey: '',
    semantic: { enabled: true, embeddingProvider: 'openai-compatible', embeddingModel: 'synthetic-rerank-smoke',
      embeddingBaseUrl: 'http://127.0.0.1:19361/v1', openRouterApiKey: '', openAICompatibleApiKey: '' },
    companion: { enabled: false }, health: { profile: 'mixed', profileChosen: true, onboardingCompleted: true } }));
  await fs.writeFile(vault + '/.obsidian/community-plugins.json', '["ai-knowledge-hub"]');
  await fs.writeFile(vault + '/.obsidian/app.json', '{"checkForUpdates":false}');
  await fs.writeFile(root + '/profile/obsidian.json', JSON.stringify({ vaults: { rerank: { path: vault, ts: Date.now(), open: true } } }));
  for (const name of ['main.js', 'manifest.json', 'styles.css']) await fs.copyFile(name, pluginDir + '/' + name);
  console.log(root); process.exit(0);
}
let embeddings = 0;
const server = http.createServer(async (req, res) => {
  req.setEncoding('utf8'); let body = ''; for await (const chunk of req) body += chunk;
  const { input } = JSON.parse(body); assert(Array.isArray(input)); assert(!req.headers.authorization); embeddings++;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: input.map((_, index) => ({ index, embedding: [1, 0.2, 0.1] })) }));
});
await new Promise(resolve => server.listen(19361, '127.0.0.1', resolve));
const pages = await (await fetch('http://127.0.0.1:9261/json/list')).json();
const page = pages.find(p => p.url.startsWith('app://obsidian.md/')); assert(page);
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0; const pending = new Map();
socket.onmessage = event => { const message = JSON.parse(event.data); if (message.id) { const entry = pending.get(message.id); pending.delete(message.id); message.error ? entry.reject(message.error) : entry.resolve(message.result); } };
const cdp = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value; };
const waitFor = async expression => { for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 50)); } throw Error('Native wait timed out: ' + expression); };
const checks = [];
const check = (name, value) => { assert(value, name); checks.push(name); };
const screenshot = async name => { const { data } = await cdp('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(root + '/' + name + '.png', Buffer.from(data, 'base64')); };
try {
  await waitFor("!!window.app?.vault && !!app.workspace?.layoutReady");
  check('isolated synthetic vault selected', await evaluate(`app.vault.adapter.basePath===${JSON.stringify(vault)}`));
  await evaluate("(async()=>{if(!app.plugins.isEnabled())await app.plugins.setEnable(true);if(!app.plugins.plugins['ai-knowledge-hub'])await app.plugins.enablePlugin('ai-knowledge-hub');})()");
  await evaluate("app.setting.close();for(const el of document.querySelectorAll('.ai-semantic-search-modal'))el.closest('.modal').querySelector('.modal-close-button,.modal-header-button').click();void 0");
  await waitFor("!document.querySelector('.ai-semantic-search-modal')");
  await waitFor("!!app.plugins.plugins['ai-knowledge-hub']?.semanticController");
  await evaluate(`(async()=>{await new Promise(r=>app.workspace.onLayoutReady(r)); window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.engine=plugin.semanticController;
    window.rerankCalls=[];window.mode='success';window.pendingRerank=[];
    const factory=engine.rerankProvider;engine.rerankProvider=settings=>{const provider=factory(settings);provider.transport=async request=>{
      const body=JSON.parse(request.body);rerankCalls.push(body);
      if(mode==='slow') await new Promise(resolve=>pendingRerank.push(resolve));
      if(mode==='failure')return {status:429,text:'synthetic private error, never display'};
      return {status:200,text:JSON.stringify({model:body.model,results:body.documents.map((_,index)=>({index,relevance_score:mode==='source-order'?-index:index}))})};};return provider;};
    window.noteReads=0;const read=app.vault.cachedRead;app.vault.cachedRead=function(...args){noteReads++;return read.apply(this,args)};
  })()`);
  if (scenario === 'manual') {
    const { manualRerankScenario } = await import('./manual-rerank-native.mjs');
    await manualRerankScenario({ evaluate, waitFor, check, screenshot, cdp, embeddings: () => embeddings });
  } else {
  check('legacy settings migrate with rerank off and empty independent key', await evaluate("plugin.settings.rerank.enabled===false && plugin.settings.rerank.apiKey===''") );
  await evaluate("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health')");
  await waitFor("!!app.workspace.getLeavesOfType('veynrel-health')[0]?.view.contentEl.querySelector('[data-health-action=nav-discover]')");
  await evaluate("window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;hv.contentEl.querySelector('[data-health-action=nav-discover]').click();app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
  await waitFor("!!app.setting.modalEl.querySelector('input[type=password]')");
  check('settings/workspace entry sends no rerank or embeddings', embeddings === 0 && await evaluate('rerankCalls.length===0'));
  check('privacy disclosure visible before enabling', await evaluate("app.setting.modalEl.innerText.includes('Requests are billed to your account')"));
  check('rerank key is masked', await evaluate("[...app.setting.modalEl.querySelectorAll('.setting-item')].find(el=>el.innerText.includes('OpenRouter API key for rerank'))?.querySelector('input')?.type==='password'"));
  await evaluate("app.setting.close();engine.confirm=async()=>true;engine.indexVault()");
  await waitFor("engine.getSemanticStatus().kind==='ready'");
  check('indexing does not rerank', await evaluate('rerankCalls.length===0'));
  const search = async query => {
    await evaluate(`{const el=document.querySelector('.ai-semantic-search-modal input');el.value=${JSON.stringify(query)};document.querySelector('.ai-semantic-search-input-row button').click();}`);
  };
  const stage = state => waitFor(`document.querySelector('.ai-semantic-search-status')?.dataset.state==='${state}'`);
  await evaluate("app.commands.executeCommandById('ai-knowledge-hub:ai-semantic-search')");
  await waitFor("!!document.querySelector('.ai-semantic-search-modal input')");
  const reads = await evaluate('noteReads'), beforeDisabled = embeddings;
  await search('synthetic query'); await stage('ready');
  check('disabled search uses one embedding and no reads/rerank', embeddings - beforeDisabled === 1 && await evaluate(`noteReads===${reads} && rerankCalls.length===0`));
  check('disabled search retains 10 results', await evaluate("document.querySelectorAll('.ai-semantic-result-card').length===10"));
  await evaluate("document.querySelector('.ai-semantic-search-modal').closest('.modal').querySelector('.modal-close-button,.modal-header-button').click();Object.assign(plugin.settings.rerank,{enabled:true,triggerMode:'automatic',apiKey:'synthetic-native-key'});engine.notifyRerankSettingsChanged();plugin.saveSettings()");
  await waitFor("!document.querySelector('.ai-semantic-search-modal')");
  const before = embeddings;
  await evaluate("mode='slow';engine.openSearch()"); await search('refine synthetic'); await stage('refining');
  check('originals visible and input usable during refinement', await evaluate("document.querySelectorAll('.ai-semantic-result-card').length===10 && !document.querySelector('.ai-semantic-search-modal input').disabled"));
  await waitFor('pendingRerank.length===1');
  check('single expanded search and bounded request', embeddings - before === 1 && await evaluate("rerankCalls[0].documents.length===12 && rerankCalls[0].top_n===12 && !JSON.stringify(rerankCalls[0]).includes('Note-')"));
  check('headerless and introduction final payloads preserve body only', await evaluate("rerankCalls[0].documents[0]==='Синтетический фрагмент 0. A local note about search and fragments.' && rerankCalls[0].documents[1]==='Синтетический фрагмент 1. A local note about search and fragments.'"));
  await screenshot('refining'); await evaluate("pendingRerank.shift()();mode='success'"); await stage('reranked');
  check('index mapping reorders results without changing semantic score', await evaluate("document.querySelector('.ai-semantic-result-title').innerText==='Note-11' && document.querySelector('.ai-semantic-result-score').innerText==='1.000'"));
  await screenshot('reranked');
  await evaluate("document.querySelector('.ai-semantic-result-card').click()");
  await waitFor("app.workspace.getActiveFile()?.path==='Note-11.md'"); check('note opens after rerank', true);
  await waitFor("!document.querySelector('.ai-semantic-search-modal')");
  await evaluate("mode='failure';engine.openSearch()"); await search('failure synthetic'); await stage('fallback');
  check('failure preserves semantic order and safe message', await evaluate("document.querySelector('.ai-semantic-result-title').innerText==='Note-00' && document.querySelector('.ai-semantic-search-status').innerText==='Could not refine results. Showing the original results.' && !document.body.innerText.includes('synthetic private error')"));
  await screenshot('fallback');
  await evaluate("mode='slow'"); await search('old slow query'); await stage('refining'); await waitFor('pendingRerank.length===1');
  await evaluate("mode='success'"); await search('new query'); await stage('reranked');
  await evaluate("pendingRerank.shift()()");
  check('late reply does not replace new query', await evaluate("document.querySelector('.ai-semantic-search-modal input').value==='new query' && document.querySelector('.ai-semantic-search-status').dataset.state==='reranked'"));
  await evaluate("mode='slow'"); await search('close query'); await stage('refining'); await waitFor('pendingRerank.length===1');
  await evaluate("document.querySelector('.ai-semantic-search-modal').closest('.modal').querySelector('.modal-close-button,.modal-header-button').click();pendingRerank.shift()()");
  await waitFor("!document.querySelector('.ai-semantic-search-modal')");
  check('closed search ignores late reply', await evaluate("!document.querySelector('.ai-semantic-search-modal')"));
  await evaluate("mode='success';app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
  const beforeTest = await evaluate('rerankCalls.length');
  await evaluate("[...app.setting.modalEl.querySelectorAll('.setting-item button')].find(el=>el.innerText==='Test rerank').click()");
  await waitFor(`rerankCalls.length===${beforeTest + 1}`);
  check('explicit connection test sends only synthetic documents', await evaluate("rerankCalls.at(-1).query==='Which fruit is yellow?' && rerankCalls.at(-1).documents.join('|')==='A banana is yellow.|A bicycle has two wheels.'"));
  await evaluate('app.setting.close()');
  const identity = await evaluate('engine.getCachedIndexState()');
  await evaluate("plugin.settings.rerank.model='explicit/changed-model';engine.notifyRerankSettingsChanged();plugin.saveSettings()");
  check('model change preserves index', JSON.stringify(identity) === JSON.stringify(await evaluate('engine.getCachedIndexState()')));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await evaluate("engine.openSearch()"); await search('narrow query'); await stage('reranked');
  check('narrow search has no horizontal overflow', await evaluate("{const el=document.querySelector('.ai-semantic-search-modal');el.scrollWidth<=el.clientWidth}"));
  await screenshot('narrow'); await evaluate("document.querySelector('.ai-semantic-search-modal').closest('.modal').querySelector('.modal-close-button,.modal-header-button').click()");
  for (const index of [0, 1]) {
    await evaluate("mode='source-order';engine.openSearch()"); await search('navigation'); await stage('reranked');
    check('local name retained for source ' + index, await evaluate(`document.querySelectorAll('.ai-semantic-result-title')[${index}].innerText===${JSON.stringify('Note-0' + index)}`));
    await evaluate(`document.querySelectorAll('.ai-semantic-result-card')[${index}].click()`);
    await waitFor(`app.workspace.getActiveFile()?.path===${JSON.stringify('Note-0' + index + '.md')}`);
    check('navigation targets headerless/introduction body ' + index, await evaluate('app.workspace.activeEditor.editor.getCursor().line===0'));
    await waitFor("!document.querySelector('.ai-semantic-search-modal')");
  }
  }
  await evaluate("app.setting.open();app.setting.openTabById('about');void 0");
  const observedVersion = await evaluate("app.setting.modalEl.innerText.match(/Version ([0-9.]+)/)?.[1]"); assert(observedVersion);
  await evaluate('app.setting.close()');
  const info = await evaluate("({installer:require('/usr/lib/obsidian/obsidian.asar/package.json').version,electron:process.versions.electron,platform:process.platform})");
  info.obsidian = observedVersion;
  const report = { ...info, scenario, date: new Date().toISOString(), checks, embeddings, rerankRequests: await evaluate('rerankCalls.length'),
    mainSha256: crypto.createHash('sha256').update(await fs.readFile(pluginDir + '/main.js')).digest('hex'),
    limitations: 'Native Linux Obsidian; fake rerank transport and local synthetic embedding server. No live model quality, paid requests, mobile, other OS, screen reader or custom theme coverage.' };
  await fs.writeFile(root + '/native.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
} finally { socket.close(); await new Promise(resolve => server.close(resolve)); }
