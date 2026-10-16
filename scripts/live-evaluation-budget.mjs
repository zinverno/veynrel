// One evaluation, one durable journal. No network, retries, or account mutations here.
import fs from 'node:fs';
import path from 'node:path';

export const PLAN_NANODOLLARS = 80_000_000;
export const MAX_REQUESTS = 32;
const codes = new Set(['auth', 'credits', 'rate-limit', 'server', 'request', 'network',
  'timeout', 'cancelled', 'invalid-response', 'configuration', 'stale']);
export const safeCode = error => codes.has(error?.code) ? error.code : 'internal';
const nonnegative = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;

// Allowlisted numeric fields only. Never persist a response body or an error message.
export function receipt(payload, capability) {
  const raw = payload?.usage;
  const usage = {};
  for (const key of ['search_units', 'input_tokens', 'output_tokens', 'total_tokens']) {
    if (Number.isSafeInteger(raw?.[key]) && raw[key] >= 0) usage[key] = raw[key];
  }
  let cost = null, basis = 'unknown';
  if (raw?.cost !== undefined) {
    if (nonnegative(raw.cost)) { cost = Math.ceil(raw.cost * 1e9); basis = 'provider'; }
  } else if (capability === 'rerank' && usage.search_units !== undefined) {
    cost = usage.search_units * 1_000_000; basis = 'usage-at-reviewed-rate';
  } else if (capability === 'decisions' && usage.input_tokens !== undefined) {
    cost = usage.input_tokens * 42; basis = 'usage-at-reviewed-rate';
  }
  if (!Number.isSafeInteger(cost) || cost < 0) { cost = null; basis = 'unknown'; }
  return { usage, costNanodollars: cost, costBasis: basis,
    reportedCostUSD: basis === 'provider' ? raw.cost : null };
}

export class BudgetJournal {
  constructor(file, fingerprint, { ceiling = PLAN_NANODOLLARS, maximum = MAX_REQUESTS } = {}) {
    if (!/^[a-f0-9]{64}$/.test(fingerprint) || !Number.isSafeInteger(ceiling) || ceiling <= 0 ||
        ceiling > PLAN_NANODOLLARS || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > MAX_REQUESTS)
      throw Error('invalid-plan');
    this.file = file;
    this.lock = file + '.lock';
    this.ceiling = ceiling;
    this.maximum = maximum;
    this.entries = new Map();
    // ponytail: exclusive lock for this single sequential evaluation, never auto-recover a crash.
    const lock = fs.openSync(this.lock, 'wx', 0o600);
    fs.closeSync(lock);
    try {
      const header = { version: 1, fingerprint, ceiling, maximum };
      if (!fs.existsSync(file)) this.append(header, 'wx');
      const lines = fs.readFileSync(file, 'utf8').trimEnd().split('\n').map(line => JSON.parse(line));
      if (JSON.stringify(lines.shift()) !== JSON.stringify(header)) throw Error('journal-plan-mismatch');
      for (const entry of lines) {
        if (!/^[A-Za-z0-9-]+$/.test(entry.id) || !['rerank', 'decisions'].includes(entry.capability) ||
            !Number.isSafeInteger(entry.reserve) || entry.reserve <= 0 ||
            !['reserved', 'validated', ...codes, 'internal'].includes(entry.status) ||
            !(entry.costNanodollars === null || (Number.isSafeInteger(entry.costNanodollars) && entry.costNanodollars >= 0)))
          throw Error('invalid-journal');
        const previous = this.entries.get(entry.id);
        if (entry.status === 'reserved' ? !!previous : !previous || previous.status !== 'reserved' ||
            previous.reserve !== entry.reserve || previous.capability !== entry.capability)
          throw Error('invalid-journal-sequence');
        this.entries.set(entry.id, entry);
      }
    } catch (error) { this.close(); throw error; }
  }
  append(entry, flags = 'a') {
    const fd = fs.openSync(this.file, flags, 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(entry) + '\n'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    const dir = fs.openSync(path.dirname(this.file), 'r');
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
  }
  summary() {
    let provider = 0, calculated = 0, unresolved = 0;
    for (const entry of this.entries.values()) {
      if (entry.costNanodollars === null) unresolved += entry.reserve;
      else if (entry.costBasis === 'provider') provider += entry.costNanodollars;
      else calculated += entry.costNanodollars;
    }
    return { requests: this.entries.size, providerNanodollars: provider, calculatedNanodollars: calculated,
      unresolvedNanodollars: unresolved, committedNanodollars: provider + calculated + unresolved };
  }
  reserve(id, capability, amount) {
    if (this.closed) throw Error('closed-journal');
    if (!/^[A-Za-z0-9-]+$/.test(id) || !['rerank', 'decisions'].includes(capability) ||
        !Number.isSafeInteger(amount) || amount <= 0) throw Error('invalid-reservation');
    if (this.entries.has(id)) throw Error('already-sent');
    // A restart never retries an operation, resolves an unknown bill, or bypasses a technical failure.
    if ([...this.entries.values()].some(e => e.status !== 'validated' || e.costNanodollars === null || e.costNanodollars > e.reserve))
      throw Error('reconciliation-required');
    const totals = this.summary();
    if (totals.requests >= this.maximum) throw Error('request-limit');
    if (totals.committedNanodollars + amount > this.ceiling) throw Error('money-limit');
    const entry = { id, capability, reserve: amount, status: 'reserved', durationMs: null,
      usage: {}, costNanodollars: null, costBasis: 'unknown' };
    this.append(entry); // Durable before the caller is allowed to send anything.
    this.entries.set(id, entry);
  }
  async run(id, capability, amount, invoke, getReceipt = () => undefined, getOutcome = () => undefined) {
    this.reserve(id, capability, amount);
    const start = performance.now();
    let result, failure;
    try { result = await invoke(); } catch (error) { failure = error; }
    const status = failure ? safeCode(failure) : 'validated';
    // A late response must not clear the reserve after a local timeout/disconnect.
    const bill = ['timeout', 'cancelled', 'network'].includes(status)
      ? receipt(undefined, capability) : receipt(getReceipt(), capability);
    const entry = { ...this.entries.get(id), status, durationMs: Math.round(performance.now() - start), ...bill,
      outcome: getOutcome(result) };
    this.append(entry);
    this.entries.set(id, entry);
    if (failure) throw Object.assign(Error(status), { code: status });
    return result;
  }
  close() {
    if (!this.closed) { this.closed = true; fs.unlinkSync(this.lock); }
  }
}
