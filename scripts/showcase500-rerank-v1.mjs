// Fixed, opt-in experiment. All private artifacts live outside Git; imports never read credentials.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { check } from './rerank-comparison-budget.mjs';
import { sha256, readKey } from './rerank-comparison.mjs';
import { freeze } from './rerank-hard-v1.mjs';

export { check, sha256, freeze };
export const SOURCE_SHA = '6df435f1f1cd1f9421f908b816dcae02df1a4f9e';
export const BUILD_SHA = 'b486f747a407aa4aee5229378aa5446d6c766a45a1087c46bff966d3e736031c';
export const RELEASE = '/tmp/veynrel-showcase500-release';
export const LOCAL = '/tmp/veynrel-showcase500-local';
export const EMBEDDING = 'openai/text-embedding-3-small';
export const MODELS = ['voyageai/rerank-3-lite', 'cohere/rerank-v3.5', 'qwen/qwen3-reranker-8b'];
export const ENDPOINT = 'https://openrouter.ai/api/v1';
export const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export const hashJSON = value => sha256(JSON.stringify(value));
export const mkdir = dir => fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

export function verifyRelease(root = RELEASE) {
  check(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() === SOURCE_SHA, 'release-source-mismatch');
  check(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim() === '', 'release-source-dirty');
  check(json(root + '/manifest.json').version === '2.1.0', 'release-version-mismatch');
  check(sha256(fs.readFileSync(root + '/main.js')) === BUILD_SHA, 'release-build-mismatch');
}

// Same esbuild adapter technique as rerank-comparison-semantic, with a separate pinned release root.
export async function adapters(root = RELEASE) {
  verifyRelease(root);
  const exports = ['chunking/markdownChunker', 'indexing/indexingService', 'vectorStore/localVectorStore',
    'semantic/semanticSearchService', 'rerank/prepareCandidates', 'rerank/refinedSearch', 'rerank/openRouterRerank',
    'rerank/types', 'embeddings/providers'];
  const bundle = await build({ stdin: { resolveDir: root, sourcefile: 'showcase-adapter.ts',
    contents: exports.map(p => `export * from './${p}';`).join('\n') }, bundle: true, write: false,
  platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'explicit-transport', setup(b) {
    b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'showcase' }));
    b.onLoad({ filter: /.*/, namespace: 'showcase' }, () => ({ contents:
      'export const getLanguage=()=>"en"; export const requestUrl=r=>{if(!globalThis.__showcaseTransport)throw Error("offline-tripwire");return globalThis.__showcaseTransport(r);};' }));
  } }] });
  return import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
}

const excluded = name => name.startsWith('.') || ['node_modules', 'attachments'].includes(name.toLowerCase());
export function secretFlags(text) {
  return [
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
    ['provider-key', /\b(?:sk-(?:or-v1-|proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{25,}|AKIA[A-Z0-9]{16})\b/],
    ['credential-assignment', /\b(?:api[_-]?key|password|secret[_-]?key|access[_-]?token)\s*[:=]\s*["']?[A-Za-z0-9/+_-]{16,}/i],
    ['sensitive-record', /\b(?:social security number|passport number|номер паспорта|номер банковской карты)\s*[:=]\s*\S+/i],
  ].filter(([, re]) => re.test(text)).map(([name]) => name);
}

export function inventory(source) {
  const root = fs.realpathSync(source);
  check(fs.statSync(root).isDirectory(), 'source-not-directory');
  const entries = [];
  function walk(relative = '') {
    for (const name of fs.readdirSync(path.join(root, relative)).sort()) {
      const rel = relative ? relative + '/' + name : name, full = path.join(root, rel), st = fs.lstatSync(full);
      if (st.isSymbolicLink()) { entries.push({ path: rel, size: st.size, sha256: null, included: false, reason: 'symlink-not-followed' }); continue; }
      if (excluded(name)) { entries.push({ path: rel, size: st.size, sha256: null, included: false, reason: 'excluded-directory-or-dotfile' }); continue; }
      if (st.isDirectory()) { walk(rel); continue; }
      if (!st.isFile() || !/\.md$/i.test(name)) {
        entries.push({ path: rel, size: st.size, sha256: null, included: false, reason: 'not-regular-markdown' }); continue;
      }
      check(fs.realpathSync(full).startsWith(root + path.sep), 'source-escape');
      const fd = fs.openSync(full, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      let bytes;
      try { bytes = fs.readFileSync(fd); } finally { fs.closeSync(fd); }
      const flags = secretFlags(bytes.toString('utf8'));
      entries.push({ path: rel, size: bytes.length, sha256: sha256(bytes), included: !flags.length,
        reason: flags.length ? 'sensitive-content-review-required' : 'regular-markdown', flags });
    }
  }
  walk();
  return { canonicalPath: root, entries, corpusSha256: hashJSON(entries.filter(e => e.sha256).map(e => [e.path, e.sha256, e.included])) };
}

export function copyCorpus(source, destination) {
  const manifest = inventory(source);
  check(!path.resolve(destination).startsWith(manifest.canonicalPath + path.sep) && path.resolve(destination) !== manifest.canonicalPath, 'copy-inside-original');
  mkdir(destination);
  for (const e of manifest.entries.filter(e => e.included)) {
    const full = path.join(manifest.canonicalPath, e.path);
    check(fs.realpathSync(full).startsWith(manifest.canonicalPath + path.sep), 'source-escape');
    const fd = fs.openSync(full, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let bytes;
    try { bytes = fs.readFileSync(fd); } finally { fs.closeSync(fd); }
    check(sha256(bytes) === e.sha256, 'source-changed-during-copy');
    const out = path.join(destination, e.path); mkdir(path.dirname(out));
    if (fs.existsSync(out)) check(sha256(fs.readFileSync(out)) === e.sha256, 'copy-changed');
    else fs.writeFileSync(out, bytes, { flag: 'wx', mode: 0o600 });
  }
  return manifest;
}

export function verifyCorpus(manifest, copy) {
  const current = inventory(manifest.canonicalPath);
  check(current.corpusSha256 === manifest.corpusSha256, 'original-markdown-changed');
  for (const e of manifest.entries.filter(e => e.included)) {
    const file = path.join(copy, e.path);
    check(!fs.lstatSync(file).isSymbolicLink() && fs.realpathSync(file).startsWith(fs.realpathSync(copy) + path.sep) &&
      sha256(fs.readFileSync(file)) === e.sha256, 'working-copy-changed');
  }
  return true;
}

export function distribution(values) {
  const a = [...values].sort((a, b) => a - b), n = a.length;
  return { count: n, min: a[0] ?? null, median: n ? (a[Math.floor((n - 1) / 2)] + a[Math.floor(n / 2)]) / 2 : null,
    p95: n ? a[Math.ceil(n * .95) - 1] : null, max: a.at(-1) ?? null,
    mean: n ? a.reduce((s, x) => s + x, 0) / n : null, total: a.reduce((s, x) => s + x, 0) };
}

export async function prepare(source, local = LOCAL) {
  mkdir(local); fs.chmodSync(local, 0o700);
  const manifest = copyCorpus(source, local + '/vault'); freeze(local + '/manifest.json', manifest);
  const a = await adapters(), chunker = new a.MarkdownChunker();
  const docs = manifest.entries.filter(e => e.included).map((e, i) => {
    const content = fs.readFileSync(local + '/vault/' + e.path, 'utf8');
    return { document_id: 'D' + String(i + 1).padStart(3, '0'), path: e.path, content, sha256: e.sha256 };
  });
  const chunks = docs.flatMap(d => chunker.chunk(d).map(c => ({ ...c, document_id: d.document_id, outbound: chunker.outboundText(c) })));
  freeze(local + '/documents.json', docs); freeze(local + '/chunks.json', chunks);
  const groups = new Map();
  for (const d of docs) { const list = groups.get(d.sha256) ?? []; list.push(d.document_id); groups.set(d.sha256, list); }
  const stats = { regularMarkdown: manifest.entries.filter(e => e.sha256).length, included: docs.length,
    excluded: manifest.entries.filter(e => !e.included).length, secretBlocked: manifest.entries.filter(e => e.flags?.length).length,
    chunks: chunks.length, documentBytes: distribution(docs.map(d => Buffer.byteLength(d.content))),
    chunkCodePoints: distribution(chunks.map(c => Array.from(c.text).length)),
    multiSectionDocuments: docs.filter(d => (d.content.match(/^#{1,6} /gm) ?? []).length > 1).length,
    multiChunkDocuments: docs.filter(d => chunks.filter(c => c.document_id === d.document_id).length > 1).length,
    emptyDocuments: docs.filter(d => !d.content.trim()).length,
    exactDuplicateGroups: [...groups.values()].filter(g => g.length > 1), corpusSha256: manifest.corpusSha256 };
  freeze(local + '/corpus-stats.json', stats); verifyCorpus(manifest, local + '/vault');
  return stats;
}

export async function preflight(key, send = fetch) {
  const response = await send(ENDPOINT + '/key', { headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15000), redirect: 'error' });
  const result = { checkedAt: new Date().toISOString(), httpStatus: response.status };
  if (response.status !== 200) return { ...result, status: 'BLOCKED', reason: 'key-http' };
  const { data } = await response.json();
  for (const f of ['usage', 'limit', 'limit_remaining']) result[f] = typeof data?.[f] === 'number' && Number.isFinite(data[f]) ? data[f] : null;
  result.expires_at = typeof data?.expires_at === 'string' ? data.expires_at : null;
  result.status = result.usage !== null && result.usage >= 0 && result.limit_remaining >= .08 &&
    (data.expires_at === null || Date.parse(result.expires_at) > Date.now()) ? 'PASS' : 'BLOCKED';
  if (result.status === 'BLOCKED') result.reason = result.expires_at && Date.parse(result.expires_at) <= Date.now() ? 'key-expired' : 'key-budget-or-expiry';
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), phase = args.find(s => !s.startsWith('--')) ?? 'dry-run';
  try {
    if (phase === 'prepare') {
      const source = args[args.indexOf('--source') + 1]; check(args.includes('--source') && source, 'source-required');
      console.log(JSON.stringify(await prepare(source)));
    } else if (phase === 'preflight') {
      check(args.includes('--live'), 'explicit-live-required');
      const key = readKey(); process.env.OPENROUTER_API_KEY = key;
      try { const result = await preflight(key); freeze(LOCAL + '/preflight.json', result); console.log(JSON.stringify(result)); }
      finally { delete process.env.OPENROUTER_API_KEY; }
    } else {
      verifyRelease(); console.log(JSON.stringify({ mode: 'dry-run', credentialAccess: false, paidCalls: 0,
        source: SOURCE_SHA, build: BUILD_SHA, prepared: fs.existsSync(LOCAL + '/corpus-stats.json') ? json(LOCAL + '/corpus-stats.json') : null }));
    }
  } catch (e) { console.error(JSON.stringify({ status: 'BLOCKED', code: /^[a-z0-9-]+$/.test(e.message) ? e.message : 'local-or-network-error' })); process.exitCode = 1; }
}
