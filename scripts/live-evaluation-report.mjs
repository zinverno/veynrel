// Offline evidence replay. Never reads the credential or invokes a provider/native app.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BudgetJournal } from './live-evaluation-budget.mjs';
import { evaluationPlan, LIVE_STATE } from './live-evaluation-native.mjs';
import { preflight, ROOT, sha256 } from './rerank-decisions-live.mjs';

export function classify(entry, expected, alternatives) {
  if (!entry) return 'NOT RUN';
  if (entry.status !== 'validated') return 'technical-failure';
  const result = entry.outcome?.result;
  if (!result) return 'missing-evidence';
  if (result.tied.length > 1) return 'ambiguous';
  return result.choice === expected ? 'primary-match' : alternatives.includes(result.choice) ? 'allowed-alternative' : 'disagreement';
}

export async function replayLiveReport() {
  const evaluation = await evaluationPlan(false), report = await preflight();
  // Reporting must never create an empty replacement ledger.
  await fs.access(LIVE_STATE + '/budget.jsonl');
  const journal = new BudgetJournal(LIVE_STATE + '/budget.jsonl', evaluation.fingerprint);
  try {
    const run = JSON.parse(await fs.readFile(LIVE_STATE + '/evidence.json', 'utf8'));
    if (run.planFingerprint !== evaluation.fingerprint) throw Error('evidence-plan-mismatch');
    report.mode = 'live-evaluation'; report.planFingerprint = evaluation.fingerprint;
    report.replayCheckoutCommit = report.checkoutCommit; delete report.checkoutCommit;
    report.startedAt = run.startedAt; report.finishedAt = run.finishedAt; report.resumedAt = run.resumedAt ?? null;
    report.environment = { ...report.environment, nativeVersion: run.native?.obsidian ?? null,
      electronVersion: run.native?.electron ?? null, nativePlatform: run.native?.platform ?? 'NOT RUN' };
    report.replayRunnerSha256 = sha256(await fs.readFile(path.join(ROOT, 'scripts/live-evaluation-native.mjs')));
    report.nativeSyntheticEmbeddingCalls = run.embeddingCalls ?? null;
    report.nativeChecks = run.checks;
    report.blockers = ['Rerank: unverified OpenRouter billing upper bound'];
    const native = journal.entries.get(evaluation.plan.native.decisionsCaseId);
    report.liveAdapter = { rerank: 'BLOCKED', decisions: [...journal.entries.values()].every(e => e.status === 'validated') && native ? 'PASS' : 'INCOMPLETE' };
    report.nativeLive = { rerank: 'BLOCKED', decisions: native?.outcome?.nativeChecksPassed ? 'PASS' : 'NOT PASSED' };
    report.semanticQuality = { rerank: 'NOT EVALUATED', decisions: 'small synthetic set; see per-input results' };
    report.nativePlan.decisionsStatus = report.nativeLive.decisions;
    report.nativePlan.rerankStatus = 'BLOCKED';
    const entries = [...journal.entries.values()], accounting = journal.summary();
    report.budget.sent = { rerank: entries.filter(e => e.capability === 'rerank' && e.outcome?.dispatched).length,
      decisions: entries.filter(e => e.capability === 'decisions' && e.outcome?.dispatched).length, embeddings: 0, connectionTests: 0,
      total: entries.filter(e => e.outcome?.dispatched).length };
    report.budget.reservedOperations = accounting.requests;
    report.budget.providerReportedUSD = entries.some(e => e.costBasis === 'provider') ?
      Number(entries.reduce((sum, e) => sum + (e.reportedCostUSD ?? 0), 0).toFixed(12)) : null;
    report.budget.calculatedFromUsageUSD = entries.some(e => e.costBasis === 'usage-at-reviewed-rate') ? accounting.calculatedNanodollars / 1e9 : null;
    report.budget.usageCrossCheckUSD = entries.every(e => e.capability === 'decisions' && Number.isInteger(e.usage.input_tokens)) ?
      entries.reduce((sum, e) => sum + e.usage.input_tokens * 42, 0) / 1e9 : null;
    report.budget.spentByThisRunUSD = (accounting.providerNanodollars + accounting.calculatedNanodollars) / 1e9;
    report.budget.unresolvedReservesUSD = accounting.unresolvedNanodollars / 1e9;
    const attach = (row, entry) => ({ ...row, status: entry ? entry.status : 'NOT RUN',
      latencyMs: entry?.durationMs ?? null, usage: entry?.usage ?? null,
      costUSD: entry?.reportedCostUSD ?? (entry?.costNanodollars == null ? null : entry.costNanodollars / 1e9),
      costBasis: entry?.costBasis ?? 'unknown', reservationUSD: entry ? entry.reserve / 1e9 : null,
      choice: entry?.outcome?.result?.choice ?? null, probabilities: entry?.outcome?.result?.probabilities ?? null,
      confidence: entry?.outcome?.result?.confidence ?? null, tied: entry?.outcome?.result?.tied ?? null,
      requestedModel: evaluation.plan.pricing.decisions.model, resolvedModel: entry?.outcome?.result?.resolvedModel ?? null,
      correspondence: classify(entry, row.expected, row.alternatives), httpStatus: entry?.outcome?.httpStatus ?? null });
    report.entries = report.entries.map(row => row.capability === 'decisions' ? attach(row, journal.entries.get(row.caseId))
      : { ...row, status: 'BLOCKED', reason: evaluation.plan.pricing.rerank.reason });
    report.nativeDecisions = { ...attach({ caseId: evaluation.plan.native.decisionsCaseId, capability: 'decisions',
      expected: evaluation.plan.native.expected, alternatives: evaluation.plan.native.alternatives }, native),
      stage: native?.outcome?.nativeStage, stages: native?.outcome?.stages, previewMatched: native?.outcome?.previewMatched,
      previewRequests: native?.outcome?.previewRequests, tentativeVisible: native?.outcome?.tentativeVisible,
      checksPassed: native?.outcome?.nativeChecksPassed, separateFromEvaluation20: true };
    const rows = report.entries.filter(e => e.capability === 'decisions');
    report.decisionsSummary = Object.fromEntries(['primary-match', 'allowed-alternative', 'disagreement', 'ambiguous', 'technical-failure', 'NOT RUN']
      .map(status => [status, rows.filter(e => e.correspondence === status).length]));
    report.orderStability = report.orderStability.map(pair => {
      const a = rows.find(e => e.caseId === pair.pairId + '-AB'), b = rows.find(e => e.caseId === pair.pairId + '-BA');
      const complete = a.status === 'validated' && b.status === 'validated';
      return { pairId: pair.pairId, status: complete ? 'evaluated' : 'NOT EVALUATED',
        choiceAgrees: complete ? a.choice === b.choice : null,
        ambiguousSetAgrees: complete ? [...a.tied].sort().join(',') === [...b.tied].sort().join(',') : null };
    });
    return report;
  } finally { journal.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await replayLiveReport();
    await fs.writeFile(path.join(ROOT, 'docs/rerank-decisions-live-evidence.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ report: 'updated from saved evidence; no network', budget: report.budget,
      decisions: report.decisionsSummary, stablePairs: report.orderStability.filter(p => p.choiceAgrees).length }));
  } catch { console.error('Offline report failed; preserve the journal and do not repeat paid operations.'); process.exitCode = 1; }
}
