// Adapted from PR #71's fsynced journal; this experiment has its own immutable plan and ledger.
import fs from 'node:fs';
import path from 'node:path';

export const PLAN = 20_000_000, CEILING = 30_000_000;
export const check = (ok, code) => { if (!ok) throw Error(code); };
export const nanos = value => typeof value === 'number' && Number.isFinite(value) && value >= 0
  ? Math.ceil(value * 1e9 - 1e-6) : null;
export const safeCode = error => ['auth', 'credits', 'rate-limit', 'server', 'request', 'network',
  'timeout', 'cancelled', 'invalid-response', 'configuration'].includes(error?.code) ? error.code : 'internal';

export class BudgetJournal {
  constructor(directory, fingerprint, baselineUsage, { planning = PLAN, ceiling = CEILING } = {}) {
    check(Number.isSafeInteger(planning) && planning > 0 && Number.isSafeInteger(ceiling) &&
      planning <= ceiling && ceiling <= CEILING, 'invalid-limits');
    check(/^[a-f0-9]{64}$/.test(fingerprint) && nanos(baselineUsage) !== null, 'invalid-plan');
    fs.mkdirSync(path.dirname(directory), { recursive: true, mode: 0o700 });
    const established = fs.existsSync(directory);
    if (!established) fs.mkdirSync(directory, { mode: 0o700 });
    this.file = directory + '/budget.jsonl'; this.lock = directory + '/budget.lock';
    check(!established || fs.existsSync(this.file), 'missing-established-journal');
    fs.closeSync(fs.openSync(this.lock, 'wx', 0o600));
    this.entries = new Map();
    try {
      if (!established) this.append({ version: 1, fingerprint, ceiling, planning, baselineUsage }, 'wx');
      const rows = fs.readFileSync(this.file, 'utf8').trimEnd().split('\n').map(line => JSON.parse(line));
      this.header = rows.shift();
      check(this.header.version === 1 && this.header.fingerprint === fingerprint && this.header.ceiling === ceiling &&
        this.header.planning === planning && nanos(this.header.baselineUsage) !== null, 'journal-plan-mismatch');
      for (const row of rows) {
        check(typeof row.id === 'string' && Number.isSafeInteger(row.reserve) && row.reserve > 0 &&
          ['reserved', 'settled', 'reconciled'].includes(row.state), 'invalid-journal');
        const old = this.entries.get(row.id);
        check(row.state === 'reserved' ? !old && row.cost === null :
          (row.state === 'reconciled' ? old?.state === 'settled' && old.cost === null : old?.state === 'reserved') && old.reserve === row.reserve &&
          (row.cost === null || Number.isSafeInteger(row.cost) && row.cost >= 0), 'invalid-journal-sequence');
        this.entries.set(row.id, row);
      }
    } catch (error) { this.close(); throw error; }
  }
  append(row, flags = 'a') {
    const fd = fs.openSync(this.file, flags, 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(row) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    const dir = fs.openSync(path.dirname(this.file), 'r');
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
  }
  summary() {
    let spent = 0, unresolved = 0;
    for (const e of this.entries.values()) { if (e.cost === null) unresolved += e.reserve; else spent += e.cost; }
    return { requests: this.entries.size, spentNanodollars: spent, unresolvedNanodollars: unresolved, committedNanodollars: spent + unresolved };
  }
  reserve(op, currentUsage) {
    check(!this.closed, 'closed-journal');
    check(!this.entries.has(op.id), 'already-sent');
    check([...this.entries.values()].every(e => ['settled', 'reconciled'].includes(e.state) && e.cost !== null && e.cost <= e.reserve &&
      !['network', 'timeout', 'cancelled', 'internal'].includes(e.outcome?.error)), 'reconciliation-required');
    check(Number.isSafeInteger(op.reserve) && op.reserve > 0 && /^[a-z0-9-]+$/.test(op.id), 'invalid-reservation');
    const observed = nanos(currentUsage - this.header.baselineUsage);
    check(observed !== null, 'accounting-regressed');
    const committed = Math.max(this.summary().committedNanodollars, observed);
    check(committed + op.reserve <= this.header.planning && committed + op.reserve <= this.header.ceiling, 'money-limit');
    const row = { id: op.id, model: op.model, caseId: op.caseId, requestSha256: op.requestSha256,
      state: 'reserved', reserve: op.reserve, cost: null, startedAt: new Date().toISOString() };
    this.append(row); this.entries.set(op.id, row);
  }
  settle(id, outcome) {
    const old = this.entries.get(id);
    check(!this.closed && old?.state === 'reserved', 'invalid-settlement');
    const cost = ['network', 'timeout', 'cancelled'].includes(outcome.error) ? null : nanos(outcome.costUSD);
    const row = { ...old, state: 'settled', cost, outcome, finishedAt: new Date().toISOString() };
    this.append(row); this.entries.set(id, row);
  }
  reconcileReceipt(id, currentUsage) {
    const old = this.entries.get(id), cost = nanos(old?.outcome?.usage?.cost);
    check(!this.closed && old?.state === 'settled' && old.cost === null && old.outcome.validator === 'PASS' &&
      !old.outcome.error && cost !== null && cost <= old.reserve, 'receipt-reconciliation-refused');
    const cumulative = nanos(currentUsage - this.header.baselineUsage);
    check(cumulative !== null && Math.abs(cumulative - this.summary().spentNanodollars - cost) <= 2,
      'cumulative-billing-mismatch');
    const row = { ...old, state: 'reconciled', cost, reconciledAt: new Date().toISOString(), outcome: { ...old.outcome,
      costUSD: old.outcome.usage.cost, costBasis: 'response-cost-reconciled-cumulative-key-usage', keyUsageAfterUSD: currentUsage } };
    this.append(row); this.entries.set(id, row);
  }
  close() { if (!this.closed) { this.closed = true; fs.unlinkSync(this.lock); } }
}
