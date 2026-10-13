// Installed release + existing isolated native driver. No product assets are patched on disk.
import fs from 'node:fs';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { LOCAL, RELEASE, BUILD_SHA, EMBEDDING, MODELS, ENDPOINT, json, check, freeze, mkdir, sha256, hashJSON, preflight, verifyCorpus } from './showcase500-rerank-v1.mjs';
import { compactPool, expandPool, inputs, validatePlan } from './showcase500-live.mjs';
import { installProbe, connect } from './rerank-comparison-native.mjs';
import { reservation, verifyBill } from './showcase500-budget.mjs';

async function refine(pool, provider, a, model) {
  return a.refineCandidates({ query: pool.query, original: pool.baseline,
    settings: { enabled: true, triggerMode: 'manual', provider: 'openrouter', model, apiKey: 'session-provider-memory' },
    signal: new AbortController().signal, prepare: async () => pool.prepared, allowed: () => true, isCurrent: () => true,
    publish: () => {}, provider });
}

export async function runNative({ journal, key, a, plan }) {
  validatePlan();
  const vault = LOCAL + '/vault', profile = LOCAL + '/native-profile', dir = vault + '/.obsidian/plugins/ai-knowledge-hub';
  mkdir(profile); mkdir(dir); mkdir(LOCAL + '/outcomes');
  const settings = { language: 'en', apiKey: '', semanticAutoSyncSuspended: true,
    semantic: { enabled: true, embeddingProvider: 'openrouter', embeddingModel: EMBEDDING, embeddingBaseUrl: ENDPOINT,
      openRouterApiKey: 'session-cache-only', openAICompatibleApiKey: '' },
    rerank: { enabled: true, triggerMode: 'manual', model: MODELS[0], apiKey: 'session-provider-memory' },
    decisions: { enabled: false }, companion: { enabled: false },
    health: { profile: 'mixed', profileChosen: true, onboardingCompleted: true } };
  if (!fs.existsSync(dir + '/data.json')) freeze(dir + '/data.json', settings);
  fs.writeFileSync(vault + '/.obsidian/community-plugins.json', '[]', { mode: 0o600 });
  fs.writeFileSync(vault + '/.obsidian/app.json', '{"checkForUpdates":false}', { mode: 0o600 });
  fs.writeFileSync(profile + '/obsidian.json', JSON.stringify({ vaults: { showcase: { path: vault, ts: Date.now(), open: true } } }), { mode: 0o600 });
  const assets = {};
  for (const name of ['main.js', 'manifest.json', 'styles.css']) {
    fs.copyFileSync(RELEASE + '/' + name, dir + '/' + name); assets[name] = sha256(fs.readFileSync(dir + '/' + name));
  }
  check(assets['main.js'] === BUILD_SHA, 'installed-build-mismatch');
  const observer = vault + '/.obsidian/plugins/showcase-observer'; mkdir(observer);
  fs.writeFileSync(observer + '/manifest.json', JSON.stringify({ id: 'showcase-observer', name: 'Local evaluation observer', version: '1.0.0', minAppVersion: '1.8.7', author: 'test', description: 'Disposable test observer' }));
  fs.writeFileSync(observer + '/main.js', "const api=require('obsidian');module.exports=class extends api.Plugin{onload(){window.__showcaseHost=api;}};");
  const server = http.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; await new Promise(r => server.close(r));
  const child = spawn('/usr/bin/electron43', ['/usr/lib/obsidian/app.asar', '--user-data-dir=' + profile,
    '--remote-debugging-port=' + port, '--disable-gpu', '--ozone-platform=x11'], { env: { ...process.env, OPENROUTER_API_KEY: key }, stdio: 'ignore' });
  let client;
  const native = { assets, checks: [], paidQueryEmbeddings: 1, nativeQueryCacheLookups: 0, uiCase: plan.nativeCase,
    embeddingTransport: 'One earlier paid embedding per query; exact real vector replay in installed UI, no second paid embedding.',
    rerankTransport: 'Installed 2.1.0 OpenRouterRerankProvider and original Obsidian requestUrl' };
  try {
    client = await connect(port); const { evaluate: ev, waitFor: wait } = client;
    const pass = (name, ok) => { check(ok, name); native.checks.push(name); };
    await wait('Boolean(window.app?.workspace?.layoutReady)');
    pass('isolated-full-vault', await ev(`app.vault.adapter.basePath===${JSON.stringify(vault)}`));
    await ev("(async()=>{if(!app.plugins.isEnabled())await app.plugins.setEnable(true);await app.plugins.loadManifests();await app.plugins.enablePlugin('showcase-observer');})()");
    // Only the frozen UI query is served from its paid cache. Any unplanned embedding fails closed.
    const q = json(LOCAL + '/queries.json').find(q => q.query_id === plan.nativeCase), queryBatch = inputs().find(b => b.kind === 'query');
    const queryCache = json(LOCAL + '/cache/embedding-' + queryBatch.id + '.json');
    const vector = queryCache.vectors[queryBatch.texts.indexOf(q.query)];
    await ev(`(()=>{
      window.__showcaseUI={query:${JSON.stringify(q.query)},vector:${JSON.stringify(vector)},embeddingCalls:0,results:[],fullCandidates:[],boundImports:0};
      const native=window.__showcaseHost.requestUrl;
      window.__showcaseRequest=async r=>{if(r.url===${JSON.stringify(ENDPOINT + '/embeddings')}){
        const b=JSON.parse(r.body);if(b.model!==${JSON.stringify(EMBEDDING)}||JSON.stringify(b.input)!==JSON.stringify([__showcaseUI.query])||__showcaseUI.embeddingCalls!==0)throw Error('uncached-native-embedding');
        __showcaseUI.embeddingCalls++;return {status:200,text:JSON.stringify({model:b.model,data:[{index:0,embedding:__showcaseUI.vector}]})};
      }if(r.url!==${JSON.stringify(ENDPOINT + '/rerank')})throw Error('unplanned-native-http');return native(r);};
      const originalEval=window.eval;
      window.eval=source=>{const evaluated=originalEval(source);if(!source.includes('//# sourceURL=plugin:ai-knowledge-hub'))return evaluated;
        return (require,module,exports)=>evaluated(id=>{const api=require(id);if(id!=='obsidian')return api;__showcaseUI.boundImports++;
          return new Proxy(api,{get:(target,key,receiver)=>key==='requestUrl'?__showcaseRequest:Reflect.get(target,key,receiver)});},module,exports);};
      window.__showcaseOriginalEval=originalEval;
    })()`);
    await ev("(async()=>{try{await app.plugins.enablePlugin('ai-knowledge-hub');}finally{window.eval=__showcaseOriginalEval;}window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.engine=plugin.semanticController;})()");
    await wait('Boolean(window.engine)');
    await ev(`(${installProbe.toString()})(${JSON.stringify({ fake: false, model: MODELS[0], endpoint: ENDPOINT + '/rerank' })})`);
    await ev(`(()=>{
      const search=engine.searchCandidates.bind(engine);engine.searchCandidates=async(...args)=>{const r=await search(...args);__showcaseUI.fullCandidates=structuredClone(r);return r;};
      const discover=engine.searchDiscover.bind(engine);engine.searchDiscover=async(...args)=>{const r=await discover(...args);if(r.session){const f=r.session.refine;r.session.refine=async()=>{const x=await f();__showcaseUI.results.push(structuredClone({stage:x.stage,results:x.results,evaluated:x.evaluated,candidates:x.candidates}));return x;};}return r;};
      const save=plugin.saveData.bind(plugin);plugin.saveData=data=>{if(JSON.stringify(data).includes('sk-or-'))throw Error('key-persistence-refused');return save(data);};
    })()`);
    pass('installed-version', await ev("plugin.manifest.version==='2.1.0' && __showcaseUI.boundImports>0"));
    const nativeOperationId = 'rerank-0-' + plan.nativeCase.toLowerCase();
    if (!journal.entries.has(nativeOperationId)) {
      await wait("!!app.commands.commands['ai-knowledge-hub:ai-semantic-search']");
      await ev("app.commands.executeCommandById('ai-knowledge-hub:ai-semantic-search')");
      await wait("!!document.querySelector('.ai-semantic-search-modal input')");
      await ev(`{const el=document.querySelector('.ai-semantic-search-modal input');el.value=${JSON.stringify(q.query)};el.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.ai-semantic-search-input-row button').click();}`);
      await wait("document.querySelector('.ai-semantic-search-status')?.dataset.state==='semantic'");
      pass('full-index-loaded', await ev('engine.runtimeSlot.runtime.getStats().vectorCount===1600'));
      pass('one-query-embedding-zero-rerank-before-button', await ev('__showcaseUI.embeddingCalls===1 && __rerankComparison.attempts===0'));
      const baseline = await ev('__showcaseUI.fullCandidates'); check(baseline.length === 30, 'native-candidate-count');
      const docs = json(LOCAL + '/documents.json');
      const prepared = await a.prepareRerankCandidates(baseline, { readPaths: async paths => ({ documents: docs.filter(d => paths.includes(d.path)), missingPaths: [] }) }, new a.MarkdownChunker(), () => true);
      freeze(LOCAL + '/pools/' + q.query_id + '.json', compactPool(q, baseline, prepared, 'Installed native UI production'));
    }
    const queries = json(LOCAL + '/queries.json');
    const poolHashes = Object.fromEntries(queries.map(q => [q.query_id, sha256(fs.readFileSync(LOCAL + '/pools/' + q.query_id + '.json'))]));
    for (const [name, hash] of Object.entries(poolHashes)) journal.bind(name, hash);
    freeze(LOCAL + '/pools-freeze.json', poolHashes); journal.bind('pools', hashJSON(poolHashes));
    // Full-corpus blind qrels were frozen before even these pools were generated.
    for (const [modelIndex, model] of MODELS.entries()) {
      const cases = modelIndex === 0 ? queries : queries.filter(q => plan.comparisonCases.includes(q.query_id));
      for (const q of cases) {
        validatePlan();
        const file = LOCAL + '/pools/' + q.query_id + '.json'; check(sha256(fs.readFileSync(file)) === poolHashes[q.query_id], 'pool-changed');
        const pool = expandPool(json(file));
        let sentTexts;
        await refine(pool, { rank: async (_q, texts) => { sentTexts = texts; return texts.map((_, index) => ({ index, relevanceScore: -index })); } }, a, model);
        check(sentTexts?.length >= 2, 'insufficient-fragments');
        const op = { id: `rerank-${modelIndex}-${q.query_id.toLowerCase()}`, model, caseId: q.query_id, kind: 'rerank',
          requestSha256: sha256(a.rerankBody(model, q.query, sentTexts)), ...reservation(model, sentTexts, q.query) };
        let outcome = journal.completed(op), result;
        const isUI = modelIndex === 0 && q.query_id === plan.nativeCase;
        if (!outcome) {
          const before = await preflight(key); check(before.status === 'PASS', 'key-preflight-blocked');
          journal.reserve(op, before.usage);
          await ev(`__rerankComparison.ticket=${JSON.stringify(op)};__rerankComparison.observation={};`);
          if (isUI) await ev("document.querySelector('[data-rerank-action=refine]').click();void 0");
          else await ev(`void engine.rerankProvider({enabled:true,triggerMode:'manual',provider:'openrouter',model:${JSON.stringify(model)},apiKey:'session-provider-memory'}).rank(${JSON.stringify(q.query)},${JSON.stringify(sentTexts)},new AbortController().signal).catch(()=>{});`);
          await wait('Boolean(__rerankComparison.observation?.done)', 450);
          outcome = await ev('__rerankComparison.observation'); journal.settle(op.id, outcome);
          await ev('__rerankComparison.ticket=null');
          console.log(JSON.stringify({ id: op.id, validator: outcome.validator, error: outcome.error, usage: outcome.usage, latencyMs: outcome.latencyMs }));
        }
        // Reproduce exact product fallback as well as successful sorting; never omit failed cases.
        result = await refine(pool, { rank: async () => {
          if (outcome.validator !== 'PASS') throw Error('saved-provider-failure');
          return a.validateRerankResponse({ model: outcome.resolvedModel, results: outcome.scores.map(s => ({ index: s.index, relevance_score: s.relevanceScore })) }, sentTexts.length);
        } }, a, model);
        check(result.results.every(r => r.score === pool.baseline.find(d => d.path === r.path)?.score), 'semantic-score-changed');
        freeze(LOCAL + '/outcomes/' + op.id + '.json', { query_id: q.query_id, model, operationId: op.id, result,
          retrieved: pool.baseline.length, sent: sentTexts.length,
          sentChunks: pool.prepared.filter(p => sentTexts.includes(p.text)).map(p => p.chunkId),
          omitted: pool.baseline.filter(d => !pool.prepared.some(p => p.document.path === d.path && sentTexts.includes(p.text))).map(d => ({ path: d.path, reason: pool.prepared.some(p => p.document.path === d.path) ? 'payload-limit' : 'no-proven-current-fragment' })), receipt: outcome });
        verifyBill(outcome, model, op.reserve);
        check(!['timeout', 'network', 'cancelled', 'internal'].includes(outcome.error), 'unknown-bill-stop');
        if (isUI && native.checks.includes('one-query-embedding-zero-rerank-before-button')) {
          await wait("document.querySelector('.ai-semantic-search-status')?.dataset.state==='reranked'");
          const ui = await ev('__showcaseUI.results.at(-1)');
          pass('ui-order-matches-production-replay', hashJSON(ui.results.map(r => [r.path, r.score, r.rerankScore])) === hashJSON(result.results.map(r => [r.path, r.score, r.rerankScore])));
          pass('refinement-no-second-query-embedding', await ev('__showcaseUI.embeddingCalls===1 && __rerankComparison.attempts===1'));
          await ev("document.querySelector('[data-rerank-action=original]').click();void 0");
          await wait("document.querySelector('.ai-semantic-search-status')?.dataset.state==='semantic'");
          await ev("document.querySelector('[data-rerank-action=refined]').click();void 0");
          await wait("document.querySelector('.ai-semantic-search-status')?.dataset.state==='reranked'");
          pass('order-toggles-no-api', await ev('__showcaseUI.embeddingCalls===1 && __rerankComparison.attempts===1'));
          const selected = result.results[0];
          const visibleTitle = await ev("document.querySelector('.ai-semantic-result-title')?.innerText");
          pass('local-title-visible', visibleTitle === selected.path.split('/').at(-1).replace(/\.md$/i, ''));
          await ev("document.querySelector('.ai-semantic-result-card').click();void 0");
          await wait(`app.workspace.getActiveFile()?.path===${JSON.stringify(selected.path)}`);
          const line = selected.rerankMatch.source.startLine;
          // openFile sets the active path before its promise resolves and the modal positions the cursor.
          await wait(`app.workspace.activeEditor?.editor?.getCursor().line===${line}`);
          pass('opens-selected-fragment', true);
          native.nativeQueryCacheLookups = await ev('__showcaseUI.embeddingCalls');
          freeze(LOCAL + '/native-ui.json', { ...native, status: 'PASS' });
        }
      }
    }
    await ev("app.setting.open();app.setting.openTabById('about');void 0");
    native.environment = await ev("({obsidian:app.setting.modalEl.innerText.match(/Version ([0-9.]+)/)?.[1],electron:process.versions.electron,platform:process.platform})");
    pass('no-key-in-data', !fs.readFileSync(dir + '/data.json').includes(Buffer.from(key)));
    pass('assets-unchanged', Object.entries(assets).every(([name, hash]) => sha256(fs.readFileSync(dir + '/' + name)) === hash));
    pass('original-and-copy-markdown-unchanged', verifyCorpus(json(LOCAL + '/manifest.json'), vault));
    freeze(LOCAL + '/native-final.json', { ...native, status: 'PASS', rerankAttemptsThisSession: await ev('__rerankComparison.attempts') });
  } finally {
    if (client) { await client.evaluate('__rerankComparison.ticket=null;window.close()').catch(() => {}); client.close(); }
    child.kill();
  }
}
