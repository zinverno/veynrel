// Offline experiment only: production algorithms, frozen real vectors, no HTTP transport.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';

export const directory = fileURLToPath(new URL('../docs/case-studies/connection-opportunities/', import.meta.url));
export const repository = fileURLToPath(new URL('../', import.meta.url));
export const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export const sha = data => createHash('sha256').update(data).digest('hex');
export const protocol = json(directory + 'protocol.json');
export const model = 'openai/text-embedding-3-small';
export const baseUrl = 'http://127.0.0.1:19643/v1';
export const filename = n => `note-${String(n).padStart(3, '0')}.md`;

export async function adapters() {
  const modules = ['chunking/markdownChunker', 'indexing/indexingService', 'vectorStore/localVectorStore',
    'semantic/semanticDiscoveryService', 'semantic/product/semanticGlobalMapModel',
    'health/topology/deriveTopology', 'health/connections/deriveConnectionComparison',
    'health/connections/connectionComparisonViewState'];
  const result = await build({ stdin: { resolveDir: repository, contents: modules.map(p => `export * from './${p}';`).join('\n') },
    bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
    plugins: [{ name: 'offline-language', setup(b) {
      b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'host' }));
      b.onLoad({ filter: /.*/, namespace: 'host' }, () => ({ contents: 'export const getLanguage=()=>"en";' }));
    } }] });
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].contents).toString('base64'));
}

export function corpus() {
  return protocol.noteNumbers.map(n => ({ path: filename(n), content: fs.readFileSync(directory + 'corpus/' + filename(n), 'utf8') }));
}

export function cachedVectors(chunks) {
  const manifest = json(directory + 'vectors.json'), bytes = fs.readFileSync(directory + 'vectors.f32.gz');
  assert.equal(sha(bytes), manifest.compressedSha256);
  const raw = gunzipSync(bytes);
  assert.equal(sha(raw), manifest.float32Sha256);
  assert.equal(raw.length, manifest.inputs.length * manifest.dimensions * 4);
  assert.deepEqual(chunks.map(c => ({ path: c.path, ordinal: c.ordinal, sha256: sha(c.text) })), manifest.inputs);
  const cache = new Map();
  for (const [index, chunk] of chunks.entries()) {
    const vector = Float32Array.from({ length: manifest.dimensions }, (_, d) => raw.readFloatLE((index * manifest.dimensions + d) * 4));
    assert(vector.every(Number.isFinite)); assert(Math.hypot(...vector) > 0);
    cache.set(chunk.text, vector);
  }
  return { manifest, cache };
}

export function summarize(comparison) {
  const { semanticRevision, topologyRevision, capturedAt, pairs, ...counts } = comparison;
  return { ...counts, ranks: Object.fromEntries(['mutual-top-3', 'mutual-top-5', 'one-sided-top-5'].map(rank =>
    [rank, pairs.filter(p => p.category === 'candidate' && p.semantic.rankClass === rank).length])) };
}

export function cohort(comparison, a) {
  const state = a.newConnectionComparisonViewState(); a.syncConnectionComparison(state, comparison);
  Object.assign(state, protocol.cohort);
  return a.filteredConnectionPairs(state).slice(0, protocol.cohort.take);
}

export async function prepare(root) {
  assert(/^\/tmp\/[a-zA-Z0-9_-]+$/.test(root), 'Use a new direct child of /tmp');
  assert(!fs.existsSync(root), 'Refusing to overwrite an existing run');
  const a = await adapters(), documents = corpus(), chunker = new a.MarkdownChunker();
  const chunks = documents.flatMap(d => chunker.chunk(d)), { manifest, cache } = cachedVectors(chunks);
  const hashes = Object.fromEntries(documents.map(d => [d.path, sha(d.content)]));
  assert.deepEqual(hashes, manifest.corpusSha256);
  let replayed = 0;
  const provider = { id: 'openai-compatible', model, dimensions: async () => manifest.dimensions,
    embed: async texts => texts.map(text => { assert(cache.has(text), 'Uncached input: no network fallback'); replayed++; return cache.get(text).slice(); }) };
  await assert.rejects(provider.embed(['unplanned input']), /Uncached input/);
  const vault = root + '/vault', plugin = vault + '/.obsidian/plugins/ai-knowledge-hub';
  fs.mkdirSync(plugin, { recursive: true }); fs.mkdirSync(root + '/profile');
  for (const d of documents) fs.writeFileSync(vault + '/' + d.path, d.content);
  const disk = p => { assert(!path.isAbsolute(p) && !p.split('/').includes('..')); return path.join(plugin, p); };
  const persistence = { exists: async p => fs.existsSync(disk(p)), readText: async p => fs.readFileSync(disk(p), 'utf8'),
    readBinary: async p => Uint8Array.from(fs.readFileSync(disk(p))).buffer,
    writeText: async (p, v) => fs.writeFileSync(disk(p), v), writeBinary: async (p, v) => fs.writeFileSync(disk(p), Buffer.from(v)),
    createDirectory: async p => fs.mkdirSync(disk(p), { recursive: true }), remove: async p => fs.unlinkSync(disk(p)),
    rename: async (from, to) => fs.renameSync(disk(from), disk(to)) };
  let store;
  const indexing = new a.IndexingService({ chunker, embeddingProvider: provider,
    embeddingSpace: { providerId: provider.id, model, baseUrl },
    vectorStoreFactory: options => (store = new a.LocalVectorStore({ ...options, persistence, basePath: 'semantic-index' })) });
  await indexing.initialize(); const indexingResult = await indexing.reconcileAll(documents, { retryTransient: false });
  const analysis = await new a.SemanticDiscoveryService(store, manifest.dimensions).analyzeGlobalSemanticMap();
  assert.equal(analysis.state, 'ready');
  const revision = { vectorGeneration: indexing.getStats().vectorGeneration, vectorCount: chunks.length, dimensions: manifest.dimensions,
    provider: provider.id, model, configurationRevision: 0, runtimeRevision: 1 };
  const semantic = a.projectGlobalSemanticMap(analysis, revision, 1);
  const snapshot = { notes: documents.map(d => ({ path: d.path, basename: d.path.slice(0, -3), mtime: 1,
    content: '', contentAvailable: false, linksAvailable: true, unresolvedLinks: [],
    resolvedOutgoing: protocol.preexistingDirectedLinks.filter(([from]) => filename(from) === d.path).map(([, to]) => filename(to)) })),
    coverage: { noteListComplete: true, contentComplete: false, linksComplete: true }, diagnostics: [], diagnosticsTruncated: 0 };
  const topology = await a.deriveTopology(snapshot, 1, new AbortController().signal);
  const comparison = a.deriveConnectionComparison(semantic, topology, 1), selected = cohort(comparison, a);
  assert.equal(selected.length, 10); assert.equal(new Set(selected.map(p => p.id)).size, 10);
  // Independent set join validates counts without reimplementing ranking.
  const key = (l, r) => JSON.stringify([l, r].sort());
  const explicit = new Set(topology.edges.map(e => key(e.source, e.target)));
  const sparse = new Set(semantic.edges.map(e => key(e.left, e.right)));
  assert.equal(comparison.alignedCount, [...sparse].filter(p => explicit.has(p)).length);
  assert.equal(comparison.candidateCount, [...sparse].filter(p => !explicit.has(p)).length);
  assert.equal(comparison.explicitOnlyCount, [...explicit].filter(p => !sparse.has(p)).length);
  const unavailable = selected[0].leftPath;
  const partial = a.deriveConnectionComparison(semantic, { ...topology,
    nodes: topology.nodes.map(n => n.path === unavailable ? { ...n, linksAvailable: false } : n) }, 1);
  assert(!partial.pairs.some(p => [p.leftPath, p.rightPath].includes(unavailable)));
  assert(partial.unclassifiedSemanticPairCount > 0);
  const output = { protocolSha256: sha(fs.readFileSync(directory + 'protocol.json')), corpusSha256: hashes,
    notes: documents.length, chunks: chunks.length, replayed, indexingResult, counts: summarize(comparison),
    cohort: selected, missingMetadata: { path: unavailable, counts: summarize(partial) } };
  const expected = directory + 'observations/offline.json';
  if (fs.existsSync(expected)) assert.deepEqual(JSON.parse(JSON.stringify(output)), json(expected), 'Frozen JSON outcome mismatch');
  fs.writeFileSync(root + '/offline.json', JSON.stringify(output, null, 2) + '\n');
  fs.writeFileSync(root + '/snapshots.json', JSON.stringify({ semantic, topology, comparison }, null, 2) + '\n');
  fs.writeFileSync(root + '/profile/obsidian.json', JSON.stringify({ vaults: { connectionCase: { path: vault, ts: Date.now(), open: true } } }));
  fs.writeFileSync(vault + '/.obsidian/community-plugins.json', '["ai-knowledge-hub"]');
  fs.writeFileSync(vault + '/.obsidian/app.json', '{"checkForUpdates":false,"showInlineTitle":false,"propertiesInDocument":"visible"}');
  fs.writeFileSync(plugin + '/data.json', JSON.stringify({ language: 'en', apiKey: '',
    semantic: { enabled: true, embeddingProvider: provider.id, embeddingModel: model, embeddingBaseUrl: baseUrl, openRouterApiKey: '', openAICompatibleApiKey: '' },
    rerank: { enabled: false }, decisions: { enabled: false }, companion: { enabled: false },
    health: { profile: 'mixed', profileChosen: true, onboardingCompleted: true } }, null, 2));
  for (const file of ['main.js', 'manifest.json', 'styles.css']) fs.copyFileSync(repository + file, plugin + '/' + file);
  console.log(JSON.stringify({ root, notes: documents.length, chunks: chunks.length, counts: output.counts, pairs: selected.map(p => [p.leftPath, p.rightPath]) }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepare(process.argv[2]);
