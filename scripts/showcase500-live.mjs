import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL, SOURCE_SHA, BUILD_SHA, EMBEDDING, MODELS, ENDPOINT, adapters, check, json, hashJSON, sha256, freeze, mkdir, verifyCorpus, preflight } from './showcase500-rerank-v1.mjs';
import { readKey } from './rerank-comparison.mjs';
import { safeCode } from './rerank-comparison-budget.mjs';
import { ShowcaseBudget, STATE, LIMITS, reservation, receipt, verifyBill } from './showcase500-budget.mjs';

export const INDEX_PATH = '.obsidian/plugins/ai-knowledge-hub/semantic-index';
export const cacheIdentity = text => ({ textSha256: sha256(text), model: EMBEDDING, endpoint: ENDPOINT + '/embeddings', dimensions: 1536, encoding_format: 'float' });

export function compactPool(q, baseline, prepared, search) {
  return { query_id: q.query_id, baseline: baseline.map(d => ({ ...d,
    matches: d.matches.map(({ preview, ...match }) => match) })),
  prepared: prepared.map(p => ({ path: p.document.path, chunkId: p.chunkId, originalOrder: p.originalOrder,
    match: (({ preview, ...match }) => match)(p.match), textSha256: sha256(p.text) })), queryEmbeddingLookups: 1, search };
}

export function expandPool(saved) {
  const chunks = new Map(json(LOCAL + '/chunks.json').map(c => [c.id, c]));
  const q = json(LOCAL + '/queries.json').find(q => q.query_id === saved.query_id); check(q, 'unknown-query');
  return { ...saved, query: q.query, prepared: saved.prepared.map(p => {
    const chunk = chunks.get(p.chunkId); check(chunk && chunk.contentHash === p.match.contentHash, 'pool-chunk-changed');
    const text = Array.from(chunk.outbound).slice(0, 4000).join(''); check(sha256(text) === p.textSha256, 'pool-fragment-changed');
    return { ...p, text, document: saved.baseline.find(d => d.path === p.path) };
  }) };
}

export function inputs() {
  const chunks = json(LOCAL + '/chunks.json'), queries = json(LOCAL + '/queries.json');
  const unique = [...new Set(chunks.map(c => c.text))];
  const batches = [{ id: 'index-000', kind: 'index', texts: unique.slice(0, 1) }];
  for (let i = 1; i < unique.length; i += 64) batches.push({ id: 'index-' + String(batches.length).padStart(3, '0'), kind: 'index', texts: unique.slice(i, i + 64) });
  batches.push({ id: 'queries-000', kind: 'query', texts: queries.map(q => q.query) });
  return batches;
}

export function plan() {
  const files = ['manifest', 'chunks', 'queries', 'protocol', 'qrels', 'pricing-snapshot'];
  const hashes = Object.fromEntries(files.map(f => [f, sha256(fs.readFileSync(LOCAL + '/' + f + '.json'))]));
  const protocol = json(LOCAL + '/protocol.json'), chunks = json(LOCAL + '/chunks.json'), queries = json(LOCAL + '/queries.json');
  const indexEstimate = inputs().filter(b => b.kind === 'index').reduce((s, b) => s + reservation(EMBEDDING, b.texts).estimatedUSD, 0);
  const queryEstimate = reservation(EMBEDDING, queries.map(q => q.query)).estimatedUSD;
  const longest = chunks.reduce((a, c) => c.outbound?.length > a.length ? c.outbound : a, '');
  const estimate = (model, subset) => queries.filter(q => !subset || subset.includes(q.query_id))
    .reduce((s, q) => s + reservation(model, Array(30).fill(longest), q.query).estimatedUSD, 0);
  const costs = { index: indexEstimate, query: queryEstimate, voyage: estimate(MODELS[0]),
    cohere: estimate(MODELS[1], protocol.comparisonCases), qwen: estimate(MODELS[2], protocol.comparisonCases) };
  return { experiment: 'showcase500-rerank-v1', productionSha: SOURCE_SHA, buildSha256: BUILD_SHA, hashes,
    corpusSha256: json(LOCAL + '/manifest.json').corpusSha256, models: [EMBEDDING, ...MODELS], endpoint: ENDPOINT,
    dimensions: 1536, limits: LIMITS, date: '2026-10-13',
    rates: { [EMBEDDING]: { tokenUSD: .00000002 }, [MODELS[0]]: { tokenUSD: .00000002 },
      [MODELS[1]]: { searchUnitUSD: .001 }, [MODELS[2]]: { tokenUSD: .0000002 } },
    estimateUSD: { ...costs, total: Object.values(costs).reduce((a, b) => a + b, 0) },
    assumptions: 'UTF-8 bytes/3 estimate; rerank query counted per document; pre-retrieval projection uses 30 longest fragments. Reservations 3x estimate, minimum $0.00005; empirical allowances, not proven maximum HTTP invoices. First planned index input calibrates bill. No dimension probe, no retries, receipt cost and units required. Unknown stops all paid sends.',
    embeddingBatches: inputs().map(b => ({ id: b.id, kind: b.kind, inputs: b.texts.length, inputSha256: hashJSON(b.texts) })),
    rerankCases: queries.map(q => q.query_id), comparisonCases: protocol.comparisonCases, nativeCase: protocol.nativeCase,
    maximumRerankCalls: queries.length + protocol.comparisonCases.length * 2 };
}

export function validatePlan() {
  const manifest = json(LOCAL + '/manifest.json');
  verifyCorpus(manifest, LOCAL + '/vault');
  const frozen = json(LOCAL + '/plan.json'); check(hashJSON(frozen) === hashJSON(plan()), 'plan-changed');
  const qrels = json(LOCAL + '/qrels.json'), docs = json(LOCAL + '/documents.json'), queries = json(LOCAL + '/queries.json');
  check(docs.length === manifest.entries.filter(e => e.included).length && new Set(docs.map(d => d.path)).size === docs.length &&
    docs.every(d => manifest.entries.some(e => e.included && e.path === d.path && e.sha256 === sha256(d.content))), 'document-registry-changed');
  check(qrels.length === queries.length && qrels.every(q => queries.some(x => x.query_id === q.query_id) &&
    q.judgments.length === docs.length && new Set(q.judgments.map(j => j.document_id)).size === docs.length &&
    q.judgments.every(j => Number.isInteger(j.grade) && j.grade >= 0 && j.grade <= 3 && docs.some(d => d.document_id === j.document_id))), 'qrels-incomplete');
  return frozen;
}

export async function embed(journal, key, a) {
  mkdir(LOCAL + '/cache');
  for (const batch of inputs()) {
    validatePlan();
    const body = JSON.stringify({ model: EMBEDDING, input: batch.texts, encoding_format: 'float' });
    const op = { id: 'embedding-' + batch.id, kind: batch.kind, model: EMBEDDING, requestSha256: sha256(body),
      identitySha256: hashJSON(batch.texts.map(cacheIdentity)), ...reservation(EMBEDDING, batch.texts) };
    const file = LOCAL + '/cache/' + op.id + '.json';
    let outcome = journal.completed(op);
    if (!outcome) {
      const before = await preflight(key); check(before.status === 'PASS', 'key-preflight-blocked'); journal.reserve(op, before.usage);
      let observation, count = 0;
      globalThis.__showcaseTransport = async request => {
        check(++count === 1 && request.url === ENDPOINT + '/embeddings' && request.body === body, 'embedding-dispatch-mismatch');
        const start = performance.now();
        const r = await fetch(request.url, { method: 'POST', headers: { ...request.headers, 'Content-Type': request.contentType }, body,
          signal: AbortSignal.timeout(25000), redirect: 'error' });
        const text = await r.text();
        let payload; try { payload = JSON.parse(text); } catch { payload = null; }
        observation = receipt(payload, EMBEDDING, r.status, Math.round(performance.now() - start));
        return { status: r.status, text };
      };
      try {
        const provider = new a.OpenAICompatibleEmbeddingProvider({ provider: 'openrouter', model: EMBEDDING, baseUrl: ENDPOINT, apiKey: key });
        const vectors = (await provider.embed(batch.texts, { timeoutMs: 25000 })).map(v => [...v]);
        check(vectors.every(v => v.length === 1536), 'embedding-dimensions');
        freeze(file, { requestSha256: op.requestSha256, identitySha256: op.identitySha256, vectors });
        observation.validator = 'PASS'; observation.vectorSha256 = hashJSON(vectors);
      } catch (e) { observation = { ...observation, validator: 'FAIL', error: safeCode(e) }; }
      finally { delete globalThis.__showcaseTransport; }
      journal.settle(op.id, observation); outcome = observation;
      console.log(JSON.stringify({ id: op.id, usage: outcome.usage, latencyMs: outcome.latencyMs, validator: outcome.validator }));
    }
    verifyBill(outcome, EMBEDDING, op.reserve); check(outcome.validator === 'PASS', 'embedding-not-valid');
    check(fs.existsSync(file), 'paid-cache-missing');
    const cache = json(file);
    check(cache.requestSha256 === op.requestSha256 && cache.identitySha256 === op.identitySha256 && hashJSON(cache.vectors) === outcome.vectorSha256, 'cache-changed');
  }
}

export function cachedProvider() {
  const cached = new Map(), lookups = {};
  for (const b of inputs()) {
    const cache = json(LOCAL + '/cache/embedding-' + b.id + '.json');
    check(cache.identitySha256 === hashJSON(b.texts.map(cacheIdentity)), 'cache-identity-changed');
    b.texts.forEach((text, i) => cached.set(text, cache.vectors[i]));
  }
  return { id: 'openrouter', model: EMBEDDING, lookups, dimensions: async () => 1536,
    embed: async texts => texts.map(text => { check(cached.has(text), 'uncached-embedding');
      lookups[text] = (lookups[text] ?? 0) + 1; return new Float32Array(cached.get(text)); }) };
}

export async function buildIndexAndPools(a, journal) {
  const provider = cachedProvider(), docs = json(LOCAL + '/documents.json'), queries = json(LOCAL + '/queries.json'), chunker = new a.MarkdownChunker();
  const disk = p => { check(!path.isAbsolute(p) && !p.split('/').includes('..'), 'index-escape'); return LOCAL + '/vault/' + p; };
  const persistence = { exists: async p => fs.existsSync(disk(p)), readText: async p => fs.readFileSync(disk(p), 'utf8'),
    readBinary: async p => Uint8Array.from(fs.readFileSync(disk(p))).buffer,
    writeText: async (p, v) => fs.writeFileSync(disk(p), v, { mode: 0o600 }), writeBinary: async (p, v) => fs.writeFileSync(disk(p), Buffer.from(v), { mode: 0o600 }),
    createDirectory: async p => mkdir(disk(p)), remove: async p => fs.unlinkSync(disk(p)), rename: async (a, b) => fs.renameSync(disk(a), disk(b)) };
  let store;
  const indexing = new a.IndexingService({ chunker, embeddingProvider: provider,
    embeddingSpace: { providerId: 'openrouter', model: EMBEDDING, baseUrl: ENDPOINT },
    vectorStoreFactory: options => (store = new a.LocalVectorStore({ ...options, persistence, basePath: INDEX_PATH })) });
  await indexing.initialize(); await indexing.reconcileAll(docs, { retryTransient: false });
  const stats = indexing.getStats(); check(stats.vectorCount === json(LOCAL + '/chunks.json').length, 'incomplete-index');
  freeze(LOCAL + '/index-stats.json', stats);
  const service = new a.SemanticSearchService(provider, store, 1536);
  const source = { readPaths: async paths => ({ documents: docs.filter(d => paths.includes(d.path)), missingPaths: [] }) };
  mkdir(LOCAL + '/pools');
  for (const q of queries.filter(q => q.query_id !== json(LOCAL + '/protocol.json').nativeCase)) {
    const file = LOCAL + '/pools/' + q.query_id + '.json';
    if (fs.existsSync(file)) { journal.bind(q.query_id, sha256(fs.readFileSync(file))); continue; }
    const baseline = await service.search(q.query, { limit: 30, matchesPerDocument: 3 });
    const prepared = await a.prepareRerankCandidates(baseline, source, chunker, () => true);
    check(provider.lookups[q.query] === 1, 'query-embedding-count');
    freeze(file, compactPool(q, baseline, prepared, 'Node production'));
    journal.bind(q.query_id, sha256(fs.readFileSync(file)));
  }
  console.log(JSON.stringify({ index: stats, nodePools: queries.length - 1, uiPool: 'pending' }));
}

export async function run(phase) {
  const frozen = validatePlan(); check(new Date().toISOString().slice(0, 10) === frozen.date, 'tariffs-need-recheck');
  const key = readKey(); process.env.OPENROUTER_API_KEY = key; globalThis.window = globalThis;
  const initial = await preflight(key); check(initial.status === 'PASS', 'preflight-blocked');
  const journal = new ShowcaseBudget(STATE, hashJSON(frozen), initial.usage);
  try {
    for (const [name, hash] of Object.entries(frozen.hashes)) journal.bind(name, hash);
    const a = await adapters();
    if (phase === 'embeddings') { await embed(journal, key, a); await buildIndexAndPools(a, journal); }
    else if (phase === 'native') await (await import('./showcase500-native.mjs')).runNative({ journal, key, a, plan: frozen });
    else throw Error('unknown-phase');
    const after = await preflight(key);
    freeze(LOCAL + '/accounting-' + phase + '.json', { after, summary: journal.summary(), baselineUsage: journal.header.baselineUsage });
    console.log(JSON.stringify({ phase, ...journal.summary(), keyUsageUSD: after.usage }));
  } finally { journal.close(); delete process.env.OPENROUTER_API_KEY; delete globalThis.__showcaseTransport; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--live')) {
    const p = plan(); freeze(LOCAL + '/plan.json', p); console.log(JSON.stringify({ mode: 'dry-run', ...p }));
  } else run(process.argv.at(-1)).catch(e => { console.error(JSON.stringify({ status: 'STOPPED', code: /^[a-z0-9-]+$/.test(e.message) ? e.message : 'inspect-local-journal' })); process.exitCode = 1; });
}
