// Optional development-only wire test. Neither product imports sibling source at runtime.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const companion = resolve(process.env.VAULT_AUDIT_COMPANION_DIR || join(root, '../vault-audit-ai-companion'));
const fixturePath = 'tests/fixtures/companion-protocol-v1.json';
const fixtureText = await readFile(join(root, fixturePath), 'utf8');
assert.equal(await readFile(join(companion, fixturePath), 'utf8'), fixtureText, 'Protocol fixture drift between repositories');
await readFile(join(companion, 'dist/server.js')); // Fail before starting anything if not built.
const fixture = JSON.parse(fixtureText);
const scratch = await mkdtemp(join(tmpdir(), 'vault-companion-wire-'));
const results = [];
const requests = [];
let child, mcp, serverLog = '', passed = false;
const syncToken = 'wire-sync-synthetic-only', mcpToken = 'wire-mcp-synthetic-only';
const providerKey = 'wire-provider-placeholder-never-transmit';
const gitState = (directory) => ({
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim(),
  status: execFileSync('git', ['status', '--porcelain'], { cwd: directory, encoding: 'utf8' }).trim(),
});
const git = { plugin: gitState(root), companion: gitState(companion) };
const check = async (name, fn) => { await fn(); results.push({ name, result: 'PASS' }); };
const mock = createServer(async (req, res) => {
  for await (const _chunk of req) { /* Drain synthetic embedding request. */ }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ model: 'text-embedding-test', data: [{ embedding: [1, 0, 0] }] }));
});
await new Promise((ok) => mock.listen(0, '127.0.0.1', ok));
const reserve = createServer();
await new Promise((ok) => reserve.listen(0, '127.0.0.1', ok));
const port = reserve.address().port;
await new Promise((ok) => reserve.close(ok));
const base = `http://127.0.0.1:${port}`;
const headers = { authorization: `Bearer ${syncToken}`, [fixture.header]: '1', 'content-type': 'application/json' };
async function start() {
  child = spawn(process.execPath, ['dist/server.js'], { cwd: companion, stdio: ['ignore', 'pipe', 'pipe'], env: {
    PATH: process.env.PATH, HOST: '127.0.0.1', PORT: String(port), DATA_DIR: join(scratch, 'data'),
    COMPANION_TOKEN: syncToken, MCP_ENABLED: 'true', MCP_TOKEN: mcpToken, MCP_VAULT_ID: fixture.vaultId,
    MCP_EMBEDDING_TIMEOUT_MS: '1000', MCP_EMBEDDING_API_KEY: '', QDRANT_ENABLED: 'false',
    ALLOW_REMOTE_BIND: 'false', LOG_LEVEL: 'info',
  } });
  child.stdout.on('data', (data) => { serverLog += data; });
  child.stderr.on('data', (data) => { serverLog += data; });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${serverLog}`);
    try { if ((await fetch(`${base}/health`)).ok) return; } catch { /* Readiness retry. */ }
    await delay(50);
  }
  throw new Error('Companion readiness timeout');
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exit = new Promise((ok) => child.once('exit', (code, signal) => ok({ code, signal })));
  child.kill('SIGTERM');
  const result = await exit;
  assert.equal(result.code, 0, `Unclean Companion shutdown: ${JSON.stringify(result)}`);
}
try {
  await build({ stdin: { contents: `export { CompanionClient } from './companionSync/client';
export { ProposalApplication } from './proposals/application';
export { validProposalDetail } from './companionSync/proposalTypes';`, resolveDir: root },
    bundle: true, platform: 'node', format: 'esm', outfile: join(scratch, 'client.mjs'),
    plugins: [{ name: 'obsidian-transport-adapter', setup(builder) {
      builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'wire' }));
      builder.onLoad({ filter: /.*/, namespace: 'wire' }, () => ({ contents: 'export function requestUrl() { throw Error("Use injected wire transport"); }' }));
    } }],
  });
  const { CompanionClient, ProposalApplication, validProposalDetail } = await import(pathToFileURL(join(scratch, 'client.mjs')));
  globalThis.window = globalThis;
  const transport = async (request) => {
    requests.push(request);
    const response = await fetch(request.url, { method: request.method, headers: { ...request.headers, 'content-type': request.contentType }, ...(request.body ? { body: request.body } : {}) });
    const text = await response.text();
    return { status: response.status, headers: Object.fromEntries(response.headers), text, arrayBuffer: new TextEncoder().encode(text).buffer };
  };
  const settings = { enabled: true, endpoint: base, token: syncToken, timeoutMs: 1000, vaultId: fixture.vaultId, providerApiKey: providerKey };
  const client = new CompanionClient(settings, transport);
  await check('startup and authenticated v1 status', async () => { await start(); assert.equal((await client.status()).status, 'ok'); });
  await check('auth and protocol boundaries', async () => {
    for (const token of ['', mcpToken]) assert.equal((await fetch(`${base}/v1/status`, { headers: { ...headers, authorization: `Bearer ${token}` } })).status, 401);
    assert.equal((await fetch(`${base}/mcp`, { headers })).status, 401);
    const response = await fetch(`${base}/v1/status`, { headers: { ...headers, [fixture.header]: '2' } });
    assert.equal((await response.json()).error.code, 'PROTOCOL_VERSION_MISMATCH');
  });
  const batch = structuredClone(fixture.batch);
  const endpoint = `http://127.0.0.1:${mock.address().port}/v1`;
  batch.descriptor.baseUrl = endpoint;
  batch.descriptor.embeddingSpaceId = `embedding-space:v1|provider=openai-compatible|model=text-embedding-test|endpoint=${encodeURIComponent(endpoint)}|dimensions=3`;
  const note = batch.operations[0].note;
  await check('reconcile and semantic mirror sync', async () => {
    const plan = await client.plan(fixture.vaultId, { generation: 1, descriptor: batch.descriptor, notes: [note] });
    assert.deepEqual(plan.uploadPaths, [note.path]);
    assert.deepEqual(await client.applyBatch(fixture.vaultId, batch), fixture.batchResult);
    const status = await (await fetch(`${base}/v1/vaults/${fixture.vaultId}/status`, { headers })).json();
    assert.equal(status.noteCount, 1); assert.equal(status.chunkCount, 1);
  });
  const require = createRequire(join(companion, 'package.json'));
  const { Client, StreamableHTTPClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/client')));
  mcp = new Client({ name: 'sibling-wire-smoke', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { authProvider: { token: async () => mcpToken } }));
  const call = async (name, args = {}) => mcp.callTool({ name, arguments: args });
  await check('MCP retrieval and semantic search', async () => {
    assert.equal((await mcp.listTools()).tools.length, 7);
    assert.equal((await call('get_note', { path: note.path })).structuredContent.content, note.content);
    assert.notEqual((await call('search_vault', { query: 'Alpha' })).isError, true);
  });
  const files = new Map([[note.path, note.content]]);
  let writes = 0;
  const application = new ProposalApplication(client, fixture.vaultId, {
    configDir: '.obsidian', read: async (path) => files.get(path) ?? null,
    create: async (path, content, guard) => { guard(); assert(!files.has(path)); files.set(path, content); writes++; },
    update: async (path, transform) => { assert(files.has(path)); files.set(path, transform(files.get(path))); writes++; },
    remove: async (path, guard) => { guard(files.get(path)); files.delete(path); writes++; },
  });
  let proposal;
  await check('proposal queue and explicit approval boundary', async () => {
    const queued = await call('propose_change', { operation: 'UPDATE_NOTE', path: note.path, expectedContentHash: note.contentHash, proposedContent: fixture.proposal.proposedContent });
    assert.notEqual(queued.isError, true);
    const page = await client.listProposals(fixture.vaultId);
    assert.equal(page.proposals.length, 1);
    proposal = await client.getProposal(fixture.vaultId, page.proposals[0].proposalId);
    assert(validProposalDetail(proposal)); assert.equal(writes, 0);
    assert.equal((await application.approve(proposal)).status, 'APPLIED');
    assert.equal(files.get(note.path), fixture.proposal.proposedContent); assert.equal(writes, 1);
    await application.approve(proposal); assert.equal(writes, 1);
  });
  await check('rejection and unsafe proposal denial', async () => {
    await call('propose_change', { operation: 'CREATE_NOTE', path: 'Rejected.md', proposedContent: 'Do not apply' });
    const page = await client.listProposals(fixture.vaultId);
    const pending = page.proposals.find((item) => item.path === 'Rejected.md'); assert(pending);
    assert.equal((await application.reject(pending.proposalId)).status, 'REJECTED');
    assert(!files.has('Rejected.md')); assert.equal(writes, 1);
    for (const path of fixture.deniedPaths) assert.equal((await call('propose_change', { operation: 'CREATE_NOTE', path, proposedContent: 'inert' })).isError, true);
    assert.equal((await call('propose_change', { operation: 'SHELL', path: 'X.md', command: 'inert' })).isError, true);
    assert(!validProposalDetail({ ...proposal, proposedContent: 'tampered' }));
  });
  await check('invalid vectors and malformed JSON rejected', async () => {
    for (const vector of [[1, 0], [null, 0, 0], [1e40, 0, 0], [0, 0, 0], Array(200000).fill(1)]) {
      const invalid = structuredClone(batch); invalid.operations[0].note.chunks[0].embedding = vector;
      const response = await fetch(`${base}/v1/vaults/${fixture.vaultId}/sync/batch`, { method: 'POST', headers, body: JSON.stringify(invalid) });
      assert(response.status >= 400);
    }
    for (const value of ['NaN', 'Infinity']) {
      const invalid = structuredClone(batch); invalid.operations[0].note.chunks[0].embedding = ['SENTINEL', 0, 0];
      const response = await fetch(`${base}/v1/vaults/${fixture.vaultId}/sync/batch`, { method: 'POST', headers, body: JSON.stringify(invalid).replace('"SENTINEL"', value) });
      assert.equal(response.status, 400);
    }
  });
  await check('malformed server response and errors remain controlled', async () => {
    for (const [status, body, code] of [[200, {}, 'PROTOCOL_VERSION_MISMATCH'], [200, { protocolVersion: 1 }, 'INVALID_RESPONSE'], [500, { error: { code: 'SERVER_ERROR' } }, 'SERVER_ERROR']]) {
      const invalid = new CompanionClient(settings, async () => ({ status, text: JSON.stringify(body) }));
      await assert.rejects(invalid.status(), (error) => error.code === code);
    }
  });
  await check('disconnect, clean shutdown, restart and persisted reconnect', async () => {
    await mcp.close(); mcp = undefined;
    await stop(); await assert.rejects(client.status(), (error) => error.code === 'UNREACHABLE');
    await start(); assert.equal((await client.status()).vaultCount, 1);
    assert.equal((await client.getProposal(fixture.vaultId, proposal.proposalId)).status, 'APPLIED');
    const plan = await client.plan(fixture.vaultId, { generation: 1, descriptor: batch.descriptor, notes: [note] });
    assert.deepEqual(plan.unchangedPaths, [note.path]);
    await stop();
  });
  await check('provider credential isolation and sanitized logs', async () => {
    assert(!JSON.stringify(requests).includes(providerKey));
    for (const secret of [providerKey, syncToken, mcpToken]) assert(!serverLog.includes(secret));
    assert(!/uncaught|unhandled|TypeError|ReferenceError/i.test(serverLog));
  });
  passed = true;
  console.log(JSON.stringify({ git, protocol: 1, method: 'real Node Companion / actual plugin client with fetch transport / in-memory Vault adapter', results, serverLog }, null, 2));
} catch (error) {
  await writeFile(join(scratch, 'server.log'), serverLog);
  console.error(`Wire smoke failed; diagnostic directory: ${scratch}`);
  throw error;
} finally {
  await mcp?.close(); await stop();
  await new Promise((ok) => mock.close(ok));
  if (passed) await rm(scratch, { recursive: true, force: true });
}
