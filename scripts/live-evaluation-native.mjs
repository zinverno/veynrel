// Narrow native driver. All paid work uses the installed plugin's original requestUrl transport.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { BudgetJournal, safeCode } from './live-evaluation-budget.mjs';
import { ROOT, frozenCases, productionAdapters, sha256, MODELS, ENDPOINTS } from './rerank-decisions-live.mjs';

export const KEY_FILE = '/home/zinvernix/.config/veynrel/openrouter-test.key';
export const LIVE_ROOT = '/tmp/veynrel-live-evaluation-v1/live';
export const LIVE_STATE = '/home/zinvernix/.local/state/veynrel/live-evaluation-v1';
export const FAKE_ROOT = '/tmp/veynrel-live-evaluation-v1/fake';
const PLAN_FILE = path.join(ROOT, 'docs/rerank-decisions-live-plan-v1.json');
const PLAN_SHA256 = '645986893576e863232c7b67065cf3aac1891248fbae4dbbbe8109171f2ff25e';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (ok, code) => { if (!ok) throw Error(code); };

export async function openPaidJournal(directory, fingerprint) {
  await fs.mkdir(path.dirname(directory), { recursive: true, mode: 0o700 });
  try { await fs.mkdir(directory, { mode: 0o700 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    // An established evaluation with missing accounting is never initialized as a fresh run.
    check(await fs.access(directory + '/budget.jsonl').then(() => true, () => false), 'missing-established-journal');
  }
  return new BudgetJournal(directory + '/budget.jsonl', fingerprint);
}

export function verifyNativeObservation(op, observation) {
  if (!op.native || observation.error) return observation;
  const passed = op.capability === 'decisions'
    ? observation.nativeStage === 'result' && observation.previewMatched && observation.previewRequests === 0 && observation.tentativeVisible
    : observation.embeddingCalls === 1 && observation.updates?.map(u => u.stage).join(',') === 'semantic,refining,reranked' &&
      observation.updates.every(u => u.results.length === 10);
  observation.nativeChecksPassed = Boolean(passed);
  if (!passed) observation.error = 'internal';
  return observation;
}

export async function evaluationPlan(fake = false) {
  const bytes = await fs.readFile(PLAN_FILE), plan = JSON.parse(bytes);
  check(sha256(bytes) === PLAN_SHA256, 'plan-changed');
  const cases = await frozenCases(), adapters = await productionAdapters();
  check(sha256(await fs.readFile(path.join(ROOT, 'main.js'))) === plan.buildSha256, 'build-mismatch');
  const nativePair = { ...cases.decisions[0], id: plan.native.decisionsCaseId,
    fragmentA: plan.native.heading + '\n\n' + cases.decisions[0].fragmentA,
    fragmentB: plan.native.heading + '\n\n' + cases.decisions[0].fragmentB };
  const operations = [nativePair, ...cases.decisions].map(item => ({ id: item.id, capability: 'decisions',
    native: item === nativePair, bodyHash: sha256(adapters.decisionsBody(MODELS.decisions, item)),
    reserve: plan.pricing.decisions.reserveNanodollars, item }));
  // The complete Rerank native/fixed path is exercised for free while its live price gate is closed.
  const nativeRerank = { id: plan.native.rerankCaseId, capability: 'rerank', native: true,
    reserve: fake ? 4_000_000 : plan.pricing.rerank.reserveNanodollars,
    item: { query: cases.rerank[0].query, documents: [nativePair.fragmentA, nativePair.fragmentB,
      ...cases.rerank.flatMap(c => c.fragments.map(f => plan.native.heading + '\n\n' + f.text))] } };
  const rerank = [nativeRerank, ...cases.rerank.map(item => ({ id: item.id, capability: 'rerank', native: false,
    reserve: fake ? 4_000_000 : plan.pricing.rerank.reserveNanodollars, item,
    bodyHash: sha256(adapters.rerankBody(MODELS.rerank, item.query, item.fragments.map(f => f.text))) }))];
  operations.push(...rerank);
  return { plan, cases, nativePair, operations, fingerprint: sha256(Buffer.concat([bytes, Buffer.from(fake ? ':fake' : ':live')])) };
}

// Restart uses saved outcomes, never a second provider call. Unknown accounting fails closed.
export async function executeOperations(evaluation, journal, driver, fake) {
  for (const operation of evaluation.operations) {
    if (!fake && !evaluation.plan.pricing[operation.capability].liveAllowed) continue;
    const prior = journal.entries.get(operation.id);
    if (prior) {
      check(prior.status === 'validated' && prior.costNanodollars !== null && prior.outcome, 'reconciliation-required');
      continue;
    }
    await driver.prepare(operation);
    let observation;
    try {
      await journal.run(operation.id, operation.capability, operation.reserve, async () => {
        observation = verifyNativeObservation(operation, await driver.execute(operation));
        if (observation.error) throw Object.assign(Error(observation.error), { code: observation.error });
        return observation;
      }, () => ({ usage: observation?.usage }), () => observation);
    } finally { await driver.disarm(); }
    const entry = journal.entries.get(operation.id);
    check(entry.costNanodollars !== null && entry.costNanodollars <= entry.reserve, 'reconciliation-required');
  }
}

// Runs inside the disposable renderer. Never return credentials, bodies or headers over CDP.
export function installProbe(config) {
  const plugin = app.plugins.plugins['ai-knowledge-hub'], engine = plugin.semanticController;
  const key = config.fake ? 'synthetic-only' : process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  const categories = ['same_information', 'partial_overlap', 'related_distinct', 'unrelated', 'insufficient_context'];
  const codes = ['auth', 'credits', 'rate-limit', 'server', 'request', 'network', 'timeout', 'cancelled', 'invalid-response', 'configuration', 'stale'];
  const probe = window.__veynrelEvaluation = { ticket: null, observation: null, attempts: 0, candidates: [], updates: [], stages: [] };
  const stages = ['preparing', 'ready', 'assessing', 'result', 'error', 'stale'];
  new MutationObserver(mutations => {
    for (const mutation of mutations) if (mutation.target.closest('.ai-overlap-modal')) {
      for (const stage of [mutation.oldValue, mutation.target.getAttribute('data-state')]) {
        if (stages.includes(stage) && probe.stages.at(-1) !== stage) probe.stages.push(stage);
      }
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-state'], attributeOldValue: true });
  const digest = text => require('node:crypto').createHash('sha256').update(text).digest('hex');
  const summarizeDocuments = results => results.map(r => ({ id: config.noteIds[r.path], semanticScore: r.score, rerankScore: r.rerankScore ?? null }));
  const search = engine.searchCandidates.bind(engine);
  engine.searchCandidates = async (...args) => { const results = await search(...args); probe.candidates = summarizeDocuments(results); return results; };
  const discover = engine.searchDiscover.bind(engine);
  engine.searchDiscover = async (query, publish, signal) => {
    const remember = update => probe.updates.push({ stage: update.stage, results: summarizeDocuments(update.results) });
    const result = await discover(query, update => { remember(update); publish(update); }, signal);
    remember(result); return result;
  };
  for (const capability of ['decisions', 'rerank']) {
    const factoryName = capability + 'Provider', method = capability === 'decisions' ? 'assess' : 'rank';
    const factory = engine[factoryName];
    engine[factoryName] = settings => {
      // Key is in this provider copy only, never plugin.settings / saveData.
      const provider = factory({ ...settings, apiKey: key });
      const transport = provider.transport;
      provider.transport = async request => {
        const ticket = probe.ticket;
        if (!ticket || ticket.used || ticket.capability !== capability || (!config.fake && !config.allowed.includes(capability))) throw Error('unarmed');
        if (request.url !== config.endpoints[capability] || request.method !== 'POST') throw Error('unexpected-endpoint');
        const body = JSON.parse(request.body);
        if (ticket.bodyHash) {
          if (digest(request.body) !== ticket.bodyHash) throw Error('unexpected-body');
        } else {
          const texts = body.documents;
          if (body.model !== config.models.rerank || body.query !== ticket.item.query || !Array.isArray(texts) ||
              texts.length !== ticket.item.documents.length || texts.some(t => !ticket.item.documents.includes(t)) || new Set(texts).size !== texts.length ||
              request.body !== JSON.stringify({ model: body.model, query: body.query, documents: texts, top_n: texts.length, provider: { allow_fallbacks: false } })) throw Error('unexpected-body');
        }
        ticket.used = true;
        probe.attempts++;
        const observation = probe.observation;
        observation.dispatched = true;
        const response = config.fake ? { status: 200, text: JSON.stringify(capability === 'decisions' ? {
          model: config.models.decisions + '-20260917', usage: { input_tokens: 500, output_tokens: 20, cost: 0.000021 },
          answers: { overlap: { type: 'choice', choice: 'partial_overlap', confidence: 1,
            probabilities: Object.fromEntries(categories.map(c => [c, c === 'partial_overlap' ? 1 : 0])) } },
        } : { model: config.models.rerank, usage: { search_units: 1 },
          results: body.documents.map((_, index) => ({ index, relevance_score: index })) }) } : await transport(request);
        observation.httpStatus = Number.isInteger(response.status) ? response.status : null;
        // The exact response goes to the production validator. Only numeric accounting is copied.
        try {
          const payload = JSON.parse(response.text);
          observation.usage = {};
          for (const field of ['cost', 'input_tokens', 'output_tokens', 'total_tokens', 'search_units']) {
            if (typeof payload?.usage?.[field] === 'number' && Number.isFinite(payload.usage[field]) && payload.usage[field] >= 0)
              observation.usage[field] = payload.usage[field];
          }
          if (payload?.usage?.cost !== undefined && observation.usage.cost === undefined) observation.usage.cost = null;
        } catch { /* No raw response retained. */ }
        return response;
      };
      const invoke = provider[method].bind(provider);
      provider[method] = async (...args) => {
        const observation = probe.observation;
        try {
          const result = await invoke(...args);
          if (capability === 'decisions') observation.result = { choice: result.choice, probabilities: result.probabilities,
            confidence: result.confidence, tied: result.tied, requestedModel: result.requestedModel,
            resolvedModel: /^(typesafe\/)?jev-1\.13(?:[-.][0-9]+)*$/.test(result.resolvedModel ?? '') ? result.resolvedModel : null,
            criteriaVersion: result.criteriaVersion };
          else observation.result = result.map(r => ({ index: r.index, relevanceScore: r.relevanceScore }));
          return result;
        } catch (error) {
          if (observation) observation.error = codes.includes(error?.code) ? error.code : 'internal';
          throw error;
        } finally { if (observation) observation.done = true; }
      };
      return provider;
    };
  }
  // Synthetic placeholders satisfy local settings checks; real keys never enter persisted settings.
  Object.assign(plugin.settings.decisions, { enabled: true, apiKey: 'session-key-in-provider-memory', model: config.models.decisions });
  Object.assign(plugin.settings.rerank, { enabled: config.fake || config.allowed.includes('rerank'), apiKey: 'session-key-in-provider-memory', model: config.models.rerank });
  engine.notifyDecisionsSettingsChanged(); engine.notifyRerankSettingsChanged();
}

async function connect(port) {
  let page;
  for (let i = 0; i < 200; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p => p.url.startsWith('app://obsidian.md/')); } catch { /* Wait only for local native startup. */ }
    if (page) break; await pause(100);
  }
  check(page, 'native-not-ready');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(Error('cdp-connect')); });
  let id = 0; const pending = new Map();
  socket.onmessage = event => { const message = JSON.parse(event.data); if (message.id && pending.has(message.id)) {
    const entry = pending.get(message.id); pending.delete(message.id); clearTimeout(entry.timer);
    message.error ? entry.reject(Error('cdp-error')) : entry.resolve(message.result);
  } };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const number = ++id;
    const timer = setTimeout(() => { pending.delete(number); reject(Error('cdp-timeout')); }, 25_000);
    pending.set(number, { resolve, reject, timer }); socket.send(JSON.stringify({ id: number, method, params }));
  });
  const evaluate = async expression => { const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    check(!result.exceptionDetails, 'native-evaluate'); return result.result.value; };
  const waitFor = async expression => {
    for (let i = 0; i < 400; i++) { if (await evaluate(expression)) return; await pause(50); }
    throw Object.assign(Error('native-timeout'), { code: 'timeout' });
  };
  return { cdp, evaluate, waitFor, close: () => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('cdp-closed')); } pending.clear(); socket.close(); } };
}

async function prepareProfile(root, evaluation, embeddingPort) {
  const vault = root + '/vault', pluginDir = vault + '/.obsidian/plugins/ai-knowledge-hub';
  const fixture = { '00-A.md': evaluation.cases.decisions[0].fragmentA, '01-B.md': evaluation.cases.decisions[0].fragmentB };
  const noteIds = { '00-A.md': 'native-A', '01-B.md': 'native-B' };
  let index = 0;
  for (const item of evaluation.cases.rerank) for (const fragment of item.fragments) {
    const name = `R-${String(index++).padStart(2, '0')}.md`; fixture[name] = fragment.text; noteIds[name] = fragment.id;
  }
  await fs.mkdir(pluginDir, { recursive: true }); await fs.mkdir(root + '/profile', { recursive: true });
  for (const [name, text] of Object.entries(fixture)) {
    const content = `# ${evaluation.plan.native.heading}\n\n${text}`;
    try { await fs.writeFile(vault + '/' + name, content, { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; check(await fs.readFile(vault + '/' + name, 'utf8') === content, 'fixture-changed'); }
  }
  const settings = { language: 'en', apiKey: '', semantic: { enabled: true, embeddingProvider: 'openai-compatible',
    embeddingModel: 'synthetic-live-evaluation', embeddingBaseUrl: `http://127.0.0.1:${embeddingPort}/v1`,
    openRouterApiKey: '', openAICompatibleApiKey: '' }, companion: { enabled: false },
    health: { profile: 'mixed', profileChosen: true, onboardingCompleted: true } };
  // Only the disposable profile; no secret is present in these settings, including on resume.
  await fs.writeFile(pluginDir + '/data.json', JSON.stringify(settings), { mode: 0o600 });
  await fs.writeFile(vault + '/.obsidian/community-plugins.json', '["ai-knowledge-hub"]');
  await fs.writeFile(vault + '/.obsidian/app.json', '{"checkForUpdates":false}');
  await fs.writeFile(root + '/profile/obsidian.json', JSON.stringify({ vaults: { evaluation: { path: vault, ts: Date.now(), open: true } } }));
  for (const name of ['main.js', 'manifest.json', 'styles.css']) await fs.copyFile(path.join(ROOT, name), pluginDir + '/' + name);
  return { vault, pluginDir, noteIds };
}

export async function runNative({ fake = false, fakeRoot } = {}) {
  const evaluation = await evaluationPlan(fake);
  check(fake || new Date().toISOString().slice(0, 10) === evaluation.plan.checkedOn, 'tariffs-need-recheck');
  check(!fakeRoot || fake && fakeRoot.startsWith(FAKE_ROOT + '-') && !fakeRoot.includes('..'), 'invalid-fake-root');
  const root = fake ? fakeRoot ?? FAKE_ROOT : LIVE_ROOT;
  const state = fake ? root : LIVE_STATE;
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const journal = fake ? new BudgetJournal(state + '/budget.jsonl', evaluation.fingerprint) : await openPaidJournal(state, evaluation.fingerprint);
  let server, child, connection, currentStep = 'setup';
  const report = { mode: fake ? 'fake-native' : 'live-native', planFingerprint: evaluation.fingerprint,
    sourceCommit: evaluation.plan.sourceCommit, buildSha256: evaluation.plan.buildSha256,
    startedAt: new Date().toISOString(), native: null, checks: [], blocked: { rerank: evaluation.plan.pricing.rerank.reason } };
  try {
    try {
      const previous = JSON.parse(await fs.readFile(state + '/evidence.json', 'utf8'));
      check(previous.planFingerprint === evaluation.fingerprint, 'evidence-plan-mismatch');
      report.native = previous.native; report.checks = previous.checks; report.startedAt = previous.startedAt;
      report.resumedAt = new Date().toISOString(); report.embeddingCalls = previous.embeddingCalls;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    // Refuse restarts with uncertain accounting before launching another app or touching the key.
    for (const e of journal.entries.values()) check(e.status === 'validated' && e.costNanodollars !== null && e.costNanodollars <= e.reserve && e.outcome, 'reconciliation-required');
    if (evaluation.operations.filter(o => fake || evaluation.plan.pricing[o.capability].liveAllowed).every(o => journal.entries.has(o.id))) {
      report.checks.push('restart skipped every completed operation'); return report;
    }
    let embeddings = 0;
    server = http.createServer(async (req, res) => {
      try { let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 200_000) throw Error('size'); }
        const { input } = JSON.parse(body); check(Array.isArray(input) && !req.headers.authorization, 'embedding-fixture'); embeddings++;
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: input.map((_, index) => ({ index, embedding: [1, 0.2, 0.1] })) }));
      } catch { res.writeHead(400); res.end('{}'); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const fixture = await prepareProfile(root, evaluation, server.address().port);
    const portProbe = http.createServer(); await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
    const port = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve));
    let key = fake ? '' : (await fs.readFile(KEY_FILE, 'utf8')).trim();
    check(fake || /^[\x21-\x7e]+$/.test(key), 'missing-credential');
    currentStep = 'native-start';
    child = spawn('/usr/bin/electron43', ['/usr/lib/obsidian/app.asar', `--user-data-dir=${root}/profile`,
      `--remote-debugging-port=${port}`, '--disable-gpu', '--ozone-platform=x11'],
    { env: { ...process.env, OPENROUTER_API_KEY: key }, stdio: 'ignore' });
    key = ''; // No secret value in argv, source, logs, CDP expression or plugin data.json.
    child.on('error', () => {});
    connection = await connect(port);
    const { evaluate, waitFor } = connection;
    currentStep = 'wait-plugin';
    await waitFor("typeof app!=='undefined' && !!app.plugins?.plugins?.['ai-knowledge-hub']?.semanticController");
    currentStep = 'verify-vault';
    check(await evaluate(`app.vault.adapter.basePath===${JSON.stringify(fixture.vault)}`), 'wrong-vault');
    await evaluate('(async()=>{await new Promise(r=>app.workspace.onLayoutReady(r));return true})()');
    currentStep = 'install-probe';
    await evaluate(`(${installProbe.toString()})(${JSON.stringify({ fake, allowed: Object.keys(evaluation.plan.pricing).filter(c => evaluation.plan.pricing[c].liveAllowed),
      endpoints: ENDPOINTS, models: MODELS, noteIds: fixture.noteIds })});true`);
    await evaluate("app.setting.open();app.setting.openTabById('about');true");
    report.native = await evaluate("({obsidian:app.setting.modalEl.innerText.match(/Version ([0-9.]+)/)?.[1]??null,electron:process.versions.electron,platform:process.platform})");
    check(report.native.obsidian, 'native-version');
    await evaluate("app.setting.close();true");
    currentStep = 'index-fixture';
    await evaluate("(async()=>{const e=app.plugins.plugins['ai-knowledge-hub'].semanticController;e.confirm=async()=>true;await e.indexVault();return true})()");
    check(await evaluate('__veynrelEvaluation.attempts===0'), 'passive-provider-call');
    report.checks.push('workspace and indexing: zero capability requests');
    const closeModal = async selector => { await evaluate(`document.querySelector(${JSON.stringify(selector)})?.closest('.modal')?.querySelector('.modal-close-button,.modal-header-button')?.click();true`); await waitFor(`!document.querySelector(${JSON.stringify(selector)})`); };
    const driver = {
      async prepare(op) {
        currentStep = op.id + '-prepare';
        await closeModal('.ai-overlap-modal'); await closeModal('.ai-semantic-search-modal');
        await evaluate('__veynrelEvaluation.stages=[];true');
        if (op.native && op.capability === 'decisions') {
          await evaluate("app.plugins.plugins['ai-knowledge-hub'].semanticController.openPotentialDuplicates();true");
          await waitFor("!![...document.querySelectorAll('.ai-semantic-duplicate-card')].find(c=>c.innerText.includes('00-A.md')&&c.innerText.includes('01-B.md'))");
          const before = await evaluate('__veynrelEvaluation.attempts');
          await evaluate("[...document.querySelectorAll('.ai-semantic-duplicate-card')].find(c=>c.innerText.includes('00-A.md')&&c.innerText.includes('01-B.md')).querySelector('button').click();true");
          await waitFor("document.querySelector('.ai-overlap-modal [role=status]')?.dataset.state==='ready'");
          check(await evaluate(`JSON.stringify([...document.querySelectorAll('.ai-overlap-text')].map(e=>e.textContent))===${JSON.stringify(JSON.stringify([op.item.fragmentA, op.item.fragmentB]))}`), 'preview-mismatch');
          check(await evaluate('__veynrelEvaluation.attempts') === before, 'preview-sent-request');
          report.checks.push('native preview exact; zero preview requests');
        } else if (op.native) { await evaluate("app.plugins.plugins['ai-knowledge-hub'].semanticController.openSearch();true"); }
      },
      async execute(op) {
        currentStep = op.id + '-execute';
        const embeddingBefore = embeddings;
        await evaluate(`__veynrelEvaluation.ticket=${JSON.stringify({ id: op.id, capability: op.capability, bodyHash: op.bodyHash, item: op.native && op.capability === 'rerank' ? op.item : undefined })};
          __veynrelEvaluation.observation={dispatched:false,usage:null,result:null,error:null,done:false};__veynrelEvaluation.updates=[];true`);
        if (op.native && op.capability === 'decisions') {
          await evaluate("document.querySelector('.ai-overlap-modal .mod-cta').click();true");
        } else if (op.native) {
          await evaluate(`document.querySelector('.ai-semantic-search-modal input').value=${JSON.stringify(op.item.query)};document.querySelector('.ai-semantic-search-input-row button').click();true`);
        } else {
          const args = op.capability === 'decisions' ? JSON.stringify({ fragmentA: op.item.fragmentA, fragmentB: op.item.fragmentB })
            : JSON.stringify(op.item.query) + ',' + JSON.stringify(op.item.fragments.map(f => f.text));
          await evaluate(`{const p=app.plugins.plugins['ai-knowledge-hub'];void p.semanticController.${op.capability}Provider(p.settings.${op.capability}).${op.capability === 'decisions' ? 'assess' : 'rank'}(${args},new AbortController().signal).catch(()=>{});}true`);
        }
        await waitFor('__veynrelEvaluation.observation.done');
        if (op.native) await waitFor(op.capability === 'decisions'
          ? "['result','error','stale'].includes(document.querySelector('.ai-overlap-modal [role=status]')?.dataset.state)"
          : "['reranked','fallback','error','skipped'].includes(document.querySelector('.ai-semantic-search-status')?.dataset.state)");
        const observation = await evaluate('structuredClone(__veynrelEvaluation.observation)');
        delete observation.done;
        if (op.native && op.capability === 'decisions') {
          observation.nativeStage = await evaluate("document.querySelector('.ai-overlap-modal [role=status]').dataset.state");
          observation.previewMatched = true; observation.previewRequests = 0;
          observation.stages = await evaluate('structuredClone(__veynrelEvaluation.stages)');
          observation.tentativeVisible = await evaluate("document.querySelector('.ai-overlap-modal').innerText.includes('not the entire notes') && (document.querySelector('.ai-overlap-result').innerText.includes('The model suggests') || document.querySelector('.ai-overlap-result').innerText.includes('The model did not identify a single category'))");
        } else if (op.native) {
          observation.updates = await evaluate('structuredClone(__veynrelEvaluation.updates)');
          observation.candidates = await evaluate('structuredClone(__veynrelEvaluation.candidates)');
          observation.embeddingCalls = embeddings - embeddingBefore;
        }
        return observation;
      },
      async disarm() { await evaluate('__veynrelEvaluation.ticket=null;true'); },
    };
    await executeOperations(evaluation, journal, driver, fake);
    report.checks.push('all permitted operations completed; no connection probes');
    report.embeddingCalls = embeddings;
  } catch (error) {
    report.stoppedAt = currentStep;
    report.stopCode = safeCode(error);
    // Own driver errors are fixed identifiers; never expose an arbitrary provider/OS message.
    const reasons = ['build-mismatch', 'reconciliation-required', 'evidence-plan-mismatch', 'native-not-ready', 'cdp-connect',
      'cdp-error', 'cdp-timeout', 'native-evaluate', 'native-timeout', 'fixture-changed', 'missing-credential', 'wrong-vault',
      'native-version', 'passive-provider-call', 'preview-mismatch', 'preview-sent-request', 'second-search-embedding', 'money-limit', 'request-limit'];
    if (reasons.includes(error?.message)) report.driverReason = error.message;
  } finally {
    report.accounting = journal.summary(); report.entries = [...journal.entries.values()];
    report.finishedAt = new Date().toISOString();
    try { await fs.writeFile(state + '/evidence.json', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); }
    finally {
      if (connection) { try { await connection.evaluate('setTimeout(()=>window.close(),100);true'); } catch { /* Local cleanup only. */ } connection.close(); }
      try { if (child) { await pause(500); if (child.exitCode === null) child.kill('SIGTERM'); } }
      finally {
        try { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }
        finally { journal.close(); }
      }
    }
  }
  return report;
}
