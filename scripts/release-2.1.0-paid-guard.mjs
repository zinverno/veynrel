// Narrow one-shot transport observer. No provider response is changed in live mode.
import { BudgetJournal, check, nanos } from './rerank-comparison-budget.mjs';
import { createHash } from 'node:crypto';
export const limits = { planning: 2_000_000, ceiling: 5_000_000 };
export const digest = value => createHash('sha256').update(value).digest('hex');
export const embeddingModel = 'openai/text-embedding-3-small', rerankModel = 'voyageai/rerank-3-lite';
export const query = 'Which note explains why retries wait longer after repeated failures?';
export const notes = [
  'A retry with exponential backoff increases the delay between attempts after transient failures. Jitter spreads simultaneous clients over time. Stop after a bounded number of attempts.',
  '# Database indexes\n\nA database index speeds up reads by organizing keys. Indexes require disk space and add work to writes.',
  '# Local backups\n\nKeep a second copy on a separate disk. Verify that a saved archive can be restored before relying on it.',
  '# Language practice\n\nShort daily reading and speaking exercises help maintain vocabulary. Review unfamiliar words in context.',
  '# Cache invalidation\n\nA cache avoids repeated computation. Expiration limits stale values, while explicit invalidation reacts to changed source data.',
  '# Network timeouts\n\nA timeout bounds how long a client waits. The server may still finish a request after the client stops waiting.',
  '# Task scheduling\n\nA weekly plan reserves time for deep work and leaves room for unexpected maintenance. Review unfinished tasks at the end of the week.',
  '# Document organization\n\nRelated notes can be connected with links. Clear explanations are more useful than collecting many loosely related tags.',
];
export function requestOperation(request, plan) {
  check(request.method === 'POST' && typeof request.body === 'string' && Buffer.byteLength(request.body) < 16000, 'unexpected-request');
  const b = JSON.parse(request.body); let id;
  if (request.url === 'https://openrouter.ai/api/v1/embeddings') {
    check(b.model === embeddingModel && b.encoding_format === 'float' && Array.isArray(b.input), 'embedding-contract');
    const input = JSON.stringify(b.input);
    id = input === JSON.stringify(['Vault Audit AI embedding test']) ? 'embedding-dimensions'
      : input === JSON.stringify([query]) ? 'embedding-query'
      : input === JSON.stringify(plan.embeddingTexts) ? 'embedding-index' : null;
  } else if (request.url === 'https://openrouter.ai/api/v1/rerank') {
    check(b.model === rerankModel && b.query === query && b.top_n === 8 && b.provider?.allow_fallbacks === false &&
      Array.isArray(b.documents) && b.documents.length === 8 && new Set(b.documents).size === 8 &&
      b.documents.every(t => plan.outboundTexts.includes(t) && !t.includes('note-')), 'rerank-contract'); id = 'manual-rerank';
  }
  check(id, 'unplanned-paid-request');
  return { id, model: b.model, caseId: 'release-2.1.0-e2e', requestSha256: digest(request.body), reserve: id === 'manual-rerank' ? 1_000_000 : 250_000 };
}
export function guardedTransport({ journal, plan, transport, preflight, observe = () => {} }) {
  let active = false, stopped = false;
  return async request => {
    check(!active && !stopped, 'paid-run-stopped'); active = true;
    let op, sent = false;
    const started = Date.now();
    try {
      op = requestOperation(request, plan);
      const before = await preflight(); journal.reserve(op, before.usage); sent = true;
      const response = await transport(request);
      let payload; try { payload = JSON.parse(response.text); } catch { throw Error('unknown-response'); }
      const usage = {};
      for (const field of ['cost', 'total_tokens', 'prompt_tokens', 'input_tokens', 'search_units'])
        if (nanos(payload.usage?.[field]) !== null) usage[field] = payload.usage[field];
      const identifier = value => typeof value === 'string' && /^[A-Za-z0-9 ._:/-]{1,200}$/.test(value) ? value : null;
      const outcome = { httpStatus: response.status, requestedModel: op.model, resolvedModel: identifier(payload.model),
        provider: identifier(payload.provider), generationId: identifier(payload.id), usage, costUSD: usage.cost ?? null,
        costBasis: usage.cost === undefined ? 'unknown' : 'provider-response', latencyMs: Date.now() - started };
      journal.settle(op.id, outcome); observe({ id: op.id, ...outcome });
      check(response.status === 200 && nanos(usage.cost) !== null && nanos(usage.cost) <= op.reserve, 'unconfirmed-or-unexpected-bill');
      const tokens = usage.total_tokens ?? usage.prompt_tokens;
      check(Number.isSafeInteger(tokens) && tokens > 0 && Math.abs(nanos(usage.cost) - nanos(tokens * .00000002)) <= 2, 'unexpected-price');
      const after = await preflight();
      check(nanos(after.usage - journal.header.baselineUsage) !== null &&
        nanos(after.usage - journal.header.baselineUsage) <= journal.summary().spentNanodollars + 2, 'usage-exceeds-receipts');
      return response;
    } catch {
      stopped = true;
      if (sent && journal.entries.get(op.id)?.state === 'reserved') journal.settle(op.id, { error: 'network', costUSD: null });
      throw Error('paid-run-stopped');
    } finally { active = false; }
  };
}

// Runs inside the isolated Obsidian renderer, against its original requestUrl.
export function install(plan, directory, baseline, fake = false, host) {
  const key = fake ? 'synthetic-only' : process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_API_KEY;
  check(key, 'missing-memory-key');
  const original = host.requestUrl;
  const journal = new BudgetJournal(directory, digest(JSON.stringify(plan)), baseline, limits);
  check(journal.entries.size === 0, 'paid-operations-already-recorded');
  const probe = window.__release210 = { receipts: [], candidates: [], updates: [], validator: 'NOT RUN', journal };
  const preflight = async () => {
    if(fake) return { usage: baseline + journal.summary().spentNanodollars / 1e9 };
    const response = await original({ url: 'https://openrouter.ai/api/v1/key', headers: { Authorization: `Bearer ${key}` }, throw: false });
    const data = JSON.parse(response.text).data;
    check(response.status === 200 && nanos(data?.usage) !== null && data.limit_remaining >= .005 &&
      (!data.expires_at || Date.parse(data.expires_at) > Date.now()), 'key-accounting-unavailable'); return { usage: data.usage };
  };
  const transport = fake ? async request => {
    const b = JSON.parse(request.body), usage = { total_tokens: 100, cost: .000002 };
    return { status: 200, text: JSON.stringify(request.url.endsWith('/rerank') ? { model: b.model, usage,
      results: b.documents.map((_, index) => ({ index, relevance_score: 1 - index / 10 })) }
      : { model: b.model, usage, data: b.input.map((_, index) => ({ index, embedding: [1,.2,.1] })) }) };
  } : original;
  probe.transport = guardedTransport({ journal, plan, transport, preflight, observe: receipt => probe.receipts.push(receipt) });
  probe.attach = () => {
  const plugin = app.plugins.plugins['ai-knowledge-hub'], engine = plugin.semanticController;
  // Keep placeholders in plugin settings; only freshly constructed providers receive the memory-only key.
  const runtimeFactory = engine.runtimeFactory;
  engine.runtimeFactory = options => runtimeFactory({ ...options, settings: { ...options.settings, openRouterApiKey: key } });
  const rankFactory = engine.rerankProvider;
  engine.rerankProvider = settings => {
    const provider = rankFactory({ ...settings, apiKey: key }), rank = provider.rank.bind(provider);
    provider.rank = async (...args) => { const result = await rank(...args); probe.validator = 'PASS'; return result; }; return provider;
  };
  const candidates = engine.searchCandidates.bind(engine);
  engine.searchCandidates = async (...args) => { const results = await candidates(...args); probe.candidates = structuredClone(results); return results; };
  const discover = engine.searchDiscover.bind(engine);
  engine.searchDiscover = async (q, publish, signal) => {
    const remember = update => { probe.updates.push(structuredClone({ stage: update.stage, results: update.results })); };
    const result = await discover(q, update => { remember(update); publish(update); }, signal); remember(result);
    if (result.session) { const refine = result.session.refine; result.session.refine = async () => { const update = await refine(); remember(update); return update; }; }
    return result;
  };
  const save = plugin.saveData.bind(plugin);
  plugin.saveData = data => { check(!JSON.stringify(data).includes(key), 'key-persistence-refused'); return save(data); };
  };
  probe.finish = async () => { probe.accounting = await preflight(); probe.summary = journal.summary(); journal.close(); };
}
