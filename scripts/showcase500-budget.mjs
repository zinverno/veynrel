// Isolated policy: historical BudgetJournal and its $0.03 ceiling remain unchanged.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { check, nanos } from './rerank-comparison-budget.mjs';
export const STATE = path.join(os.homedir(), '.local/state/veynrel/showcase500-rerank-v1');
export const LIMITS = Object.freeze({ planning: 80_000_000, ceiling: 100_000_000 });

export class ShowcaseBudget {
  constructor(directory, fingerprint, baselineUsage) {
    check(/^[a-f0-9]{64}$/.test(fingerprint) && nanos(baselineUsage) !== null, 'invalid-plan');
    const established = fs.existsSync(directory);
    if (!established) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = directory + '/budget.jsonl'; this.lock = directory + '/budget.lock';
    check(!established || fs.existsSync(this.file), 'missing-established-journal');
    fs.closeSync(fs.openSync(this.lock, 'wx', 0o600)); this.entries = new Map(); this.bindings = new Map();
    try {
      if (!established) this.append({ version: 'showcase500-v1', fingerprint, baselineUsage, ...LIMITS });
      const rows = fs.readFileSync(this.file, 'utf8').trimEnd().split('\n').map(s => JSON.parse(s));
      this.header = rows.shift();
      check(this.header.version === 'showcase500-v1' && this.header.fingerprint === fingerprint &&
        this.header.planning === LIMITS.planning && this.header.ceiling === LIMITS.ceiling && nanos(this.header.baselineUsage) !== null, 'journal-plan-mismatch');
      for (const row of rows) {
        if (row.state === 'binding') {
          check(!this.bindings.has(row.name) && /^[a-f0-9]{64}$/.test(row.sha256), 'invalid-binding');
          this.bindings.set(row.name, row.sha256); continue;
        }
        const old = this.entries.get(row.id);
        check(typeof row.id === 'string' && /^[a-z0-9-]+$/.test(row.id) && Number.isSafeInteger(row.reserve) && row.reserve > 0, 'invalid-journal');
        check(row.state === 'reserved' ? !old && row.cost === null :
          row.state === 'settled' && old?.state === 'reserved' && old.reserve === row.reserve &&
          old.requestSha256 === row.requestSha256 && (row.cost === null || Number.isSafeInteger(row.cost) && row.cost >= 0), 'invalid-journal-sequence');
        this.entries.set(row.id, row);
      }
    } catch (error) { this.close(); throw error; }
  }
  append(row) {
    const fd = fs.openSync(this.file, 'a', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(row) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    const dir = fs.openSync(path.dirname(this.file), 'r');
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
  }
  bind(name, sha256) {
    check(!this.closed && /^[a-f0-9]{64}$/.test(sha256), 'invalid-binding');
    if (this.bindings.has(name)) { check(this.bindings.get(name) === sha256, 'bound-artifact-changed'); return; }
    this.append({ state: 'binding', name, sha256 }); this.bindings.set(name, sha256);
  }
  summary() {
    let spent = 0, unresolved = 0;
    for (const e of this.entries.values()) { if (e.cost === null) unresolved += e.reserve; else spent += e.cost; }
    return { operations: this.entries.size, spentNanodollars: spent, unresolvedNanodollars: unresolved, committedNanodollars: spent + unresolved };
  }
  reserve(op, currentUsage) {
    check(!this.closed && !this.entries.has(op.id), 'already-sent');
    check([...this.entries.values()].every(e => e.state === 'settled' && e.cost !== null && e.cost <= e.reserve &&
      !['network', 'timeout', 'cancelled', 'internal'].includes(e.outcome?.error)), 'unknown-bill-stop');
    check(Number.isSafeInteger(op.reserve) && op.reserve > 0 && /^[a-z0-9-]+$/.test(op.id) && /^[a-f0-9]{64}$/.test(op.requestSha256), 'invalid-reservation');
    const delta = nanos(currentUsage - this.header.baselineUsage);
    check(delta !== null, 'accounting-regressed');
    check(delta <= this.summary().spentNanodollars + 2, 'unexplained-key-usage');
    check(Math.max(delta, this.summary().committedNanodollars) + op.reserve <= LIMITS.planning, 'planning-limit');
    check(Math.max(delta, this.summary().committedNanodollars) + op.reserve <= LIMITS.ceiling, 'absolute-limit');
    const row = { ...op, state: 'reserved', cost: null, startedAt: new Date().toISOString() };
    this.append(row); this.entries.set(op.id, row);
  }
  settle(id, outcome) {
    const old = this.entries.get(id); check(!this.closed && old?.state === 'reserved', 'invalid-settlement');
    const cost = ['network', 'timeout', 'cancelled', 'internal'].includes(outcome.error) ? null : nanos(outcome.usage?.cost);
    const row = { ...old, state: 'settled', cost, outcome, finishedAt: new Date().toISOString() };
    this.append(row); this.entries.set(id, row);
  }
  completed(op) {
    const old = this.entries.get(op.id); if (!old) return null;
    check(old.requestSha256 === op.requestSha256 && old.model === op.model, 'operation-changed');
    check(old.state === 'settled' && old.cost !== null && old.cost <= old.reserve, 'unknown-bill-stop');
    return old.outcome;
  }
  close() { if (!this.closed) { this.closed = true; fs.unlinkSync(this.lock); } }
}

export function reservation(model, texts, query = '') {
  // Planning allowance, not a mathematical maximum invoice: query tokens count once per pair.
  const estimatedTokens = Math.ceil((texts.reduce((s, t) => s + Buffer.byteLength(t), 0) + texts.length * Buffer.byteLength(query)) / 3);
  const estimatedUSD = model === 'cohere/rerank-v3.5' ? .001 * Math.ceil(texts.length / 100) :
    estimatedTokens * (model === 'qwen/qwen3-reranker-8b' ? .0000002 : .00000002);
  return { estimatedTokens, estimatedUSD, reserve: nanos(Math.max(.00005, estimatedUSD * 3)) };
}

export function receipt(payload, model, httpStatus, latencyMs) {
  const usage = {};
  for (const field of ['cost', 'total_tokens', 'prompt_tokens', 'input_tokens', 'search_units'])
    if (nanos(payload?.usage?.[field]) !== null) usage[field] = payload.usage[field];
  const safe = s => typeof s === 'string' && /^[A-Za-z0-9 ._:/-]{1,200}$/.test(s) ? s : null;
  return { usage, model, resolvedModel: safe(payload?.model), generationId: safe(payload?.id),
    provider: safe(payload?.provider), httpStatus, latencyMs, costBasis: usage.cost === undefined ? 'unknown' : 'response-usage-cost' };
}

export function verifyBill(outcome, model, reserve) {
  check(nanos(outcome.usage?.cost) !== null && nanos(outcome.usage.cost) <= reserve, 'unknown-or-over-reserve-bill');
  const units = model === 'cohere/rerank-v3.5' ? outcome.usage.search_units :
    outcome.usage.total_tokens ?? outcome.usage.prompt_tokens ?? outcome.usage.input_tokens;
  check(Number.isSafeInteger(units) && units > 0, 'unknown-usage-units');
  const expected = units * (model === 'cohere/rerank-v3.5' ? .001 : model === 'qwen/qwen3-reranker-8b' ? .0000002 : .00000002);
  check(Math.abs(nanos(expected) - nanos(outcome.usage.cost)) <= 2, 'price-mismatch');
}
