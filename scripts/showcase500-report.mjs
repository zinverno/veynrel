// Local full evidence plus an explicit allowlist of public aggregates; never publish source text or paths.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LOCAL, MODELS, json, sha256, hashJSON, freeze, distribution, check, verifyCorpus } from './showcase500-rerank-v1.mjs';
import { STATE } from './showcase500-budget.mjs';
import { measure, change, bootstrap } from './showcase500-metrics.mjs';
import { validatePlan } from './showcase500-live.mjs';

export function report() {
  const plan = validatePlan(), docs = json(LOCAL + '/documents.json'), queries = json(LOCAL + '/queries.json'), labels = json(LOCAL + '/qrels.json');
  const docIds = new Map(docs.map(d => [d.path, d.document_id]));
  const fragments = json(LOCAL + '/fragment-review.json');
  const ledger = fs.readFileSync(STATE + '/budget.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
  const entries = [...new Map(ledger.filter(r => r.id).map(r => [r.id, r])).values()];
  check(entries.every(e => e.state === 'settled' && e.cost !== null), 'unresolved-operations');
  const rows = [];
  for (const [modelIndex, model] of MODELS.entries()) {
    for (const q of queries.filter(q => modelIndex === 0 || plan.comparisonCases.includes(q.query_id))) {
      const pool = json(LOCAL + '/pools/' + q.query_id + '.json'), j = labels.find(j => j.query_id === q.query_id).judgments;
      const file = LOCAL + '/outcomes/' + `rerank-${modelIndex}-${q.query_id.toLowerCase()}.json`;
      const outcome = fs.existsSync(file) ? json(file) : null;
      const beforeOrder = pool.baseline.slice(0, 10).map(d => docIds.get(d.path));
      const afterOrder = outcome ? outcome.result.results.map(d => docIds.get(d.path)) : beforeOrder;
      const metric = (order, options) => { const { positions, ...result } = measure(order, j, options); return result; };
      const positive = q.status === 'positive', before = metric(beforeOrder, { diagnostic: !positive }), after = metric(afterOrder, { diagnostic: !positive });
      const relevant = j.filter(j => j.grade >= 2), inPool = new Set(pool.baseline.map(d => docIds.get(d.path)));
      const fragmentReview = fragments.queries.find(x => x.query_id === q.query_id);
      const counts = order => order.reduce((acc, id) => {
        const f = fragmentReview.fragment_judgments.find(f => f.document_id === id);
        const name = f?.classification ?? 'unjudged'; acc[name] = (acc[name] ?? 0) + 1; return acc;
      }, {});
      const beforeWeakZero = positive ? metric(beforeOrder, { weakGain: false }) : null;
      const afterWeakZero = positive ? metric(afterOrder, { weakGain: false }) : null;
      const result = { query_id: q.query_id, intent_id: q.intent_id, language: q.language, topic: q.topic, task_type: q.task_type,
        status: q.status, model, stage: outcome?.result.stage ?? 'NOT RUN', beforeOrder, afterOrder, before, after,
        beforeWeakZero, afterWeakZero, delta: positive ? after.ndcg10 - before.ndcg10 : null,
        change: positive ? change(before.ndcg10, after.ndcg10) : null,
        knownRelevant: relevant.length, relevantInPool: relevant.filter(j => inPool.has(j.document_id)).length,
        knownRelevantCoverage30: positive ? relevant.filter(j => inPool.has(j.document_id)).length / relevant.length : null,
        queryRetrievalMiss: positive && !relevant.some(j => inPool.has(j.document_id)),
        candidates: pool.baseline.length, sent: outcome?.sent ?? 0, omitted: outcome?.omitted ?? [],
        fragmentTop10: positive ? { before: counts(beforeOrder), after: counts(afterOrder) } : null,
        costUSD: outcome?.receipt?.usage?.cost ?? null, usage: outcome?.receipt?.usage ?? null,
        latencyMs: outcome?.receipt?.latencyMs ?? null,
        relevantPositions: relevant.map(j => ({ document_id: j.document_id, grade: j.grade,
          poolRank: inPool.has(j.document_id) ? pool.baseline.findIndex(d => docIds.get(d.path) === j.document_id) + 1 : null,
          beforeRank: beforeOrder.includes(j.document_id) ? beforeOrder.indexOf(j.document_id) + 1 : null,
          afterRank: afterOrder.includes(j.document_id) ? afterOrder.indexOf(j.document_id) + 1 : null })) };
      rows.push(result);
    }
  }
  const mean = a => a.length ? a.reduce((s, n) => s + n, 0) / a.length : null;
  const metricKeys = ['hit1', 'hit3', 'mrr10', 'ndcg10'];
  const aggregate = selected => {
    const p = selected.filter(r => r.status === 'positive'), success = selected.filter(r => r.stage === 'reranked');
    const side = key => Object.fromEntries(metricKeys.map(m => [m, mean(p.map(r => r[key][m]))]));
    return { cases: selected.length, positives: p.length, diagnostics: selected.length - p.length,
      successful: success.length, failures: selected.filter(r => ['fallback', 'skipped'].includes(r.stage)).length,
      notRun: selected.filter(r => r.stage === 'NOT RUN').length, before: side('before'), after: side('after'),
      changes: Object.fromEntries(['Improved', 'Unchanged', 'Regressed'].map(c => [c, p.filter(r => r.change === c).length])),
      weakGainZero: { beforeNdcg10: mean(p.map(r => r.beforeWeakZero.ndcg10)), afterNdcg10: mean(p.map(r => r.afterWeakZero.ndcg10)) },
      newlyUsefulFirst: p.filter(r => !r.before.hit1 && r.after.hit1).length,
      knownRelevantCoverage30: mean(p.map(r => r.knownRelevantCoverage30)), queryRetrievalMisses: p.filter(r => r.queryRetrievalMiss).length,
      bootstrap: bootstrap(p.map(r => ({ intent_id: r.intent_id, delta: r.delta }))),
      providerLatencyMs: { ...distribution(selected.filter(r => r.latencyMs !== null).map(r => r.latencyMs)), timeouts: 0 },
      costUSD: selected.reduce((s, r) => s + (r.costUSD ?? 0), 0), retrieved: selected.reduce((s, r) => s + r.candidates, 0),
      sent: selected.reduce((s, r) => s + r.sent, 0), omitted: selected.reduce((s, r) => s + r.omitted.length, 0) };
  };
  const voyage = rows.filter(r => r.model === MODELS[0]), positive = voyage.filter(r => r.status === 'positive');
  const group = key => [...new Set(voyage.map(r => r[key]))].map(k => {
    const g = aggregate(voyage.filter(r => r[key] === k));
    return { group: k, cases: g.cases, positives: g.positives, diagnostics: g.diagnostics,
      ...(g.positives ? { before: g.before, after: g.after, changes: g.changes, meanDeltaNdcg10: g.bootstrap.meanDelta } : {}),
      meanProviderLatencyMs: g.providerLatencyMs.mean, costUSD: g.costUSD };
  });
  const costs = { initialIndexUSD: entries.filter(e => e.kind === 'index').reduce((s, e) => s + e.cost, 0) / 1e9,
    queryEmbeddingsUSD: entries.filter(e => e.kind === 'query').reduce((s, e) => s + e.cost, 0) / 1e9,
    rerankUSD: Object.fromEntries(MODELS.map(model => [model, entries.filter(e => e.model === model).reduce((s, e) => s + e.cost, 0) / 1e9])),
    totalUSD: entries.reduce((s, e) => s + e.cost, 0) / 1e9 };
  const corpus = json(LOCAL + '/corpus-stats.json'), near = json(LOCAL + '/near-duplicates.json');
  const publicSummary = {
    experiment: plan.experiment, date: plan.date, version: '2.1.0', productionSha: plan.productionSha, buildSha256: plan.buildSha256,
    hashes: { ...plan.hashes, corpus: plan.corpusSha256, pools: hashJSON(json(LOCAL + '/pools-freeze.json')),
      fragmentReview: sha256(fs.readFileSync(LOCAL + '/fragment-review.json')) },
    corpus: { regularMarkdown: corpus.regularMarkdown, indexedDocuments: 500, chunks: corpus.chunks, uniqueEmbeddingInputs: 1599,
      excludedMarkdown: 0, excludedNonCorpusEntries: 2, exclusionReasons: ['original Obsidian configuration directory', 'non-Markdown instruction file'],
      language: 'English (all 500 ASCII)', thematicGroups: 10, documentsPerTheme: 50, domainTopicPairs: 100,
      allTemplateBased: true, technicalAnswerClaimsOutsideTemplates: 0, prosePatterns: 3, identicalFlashcardAnswers: 100,
      emptyDocuments: 0, multiSectionDocuments: 500, multiChunkDocuments: 500,
      exactDuplicateGroups: corpus.exactDuplicateGroups.length, nearDuplicateMethod: near.method, nearDuplicatePairs: near.pairCount,
      nearDuplicateGroupSizes: near.groups.map(g => g.length).sort((a, b) => a - b), documentBytes: corpus.documentBytes, chunkCodePoints: corpus.chunkCodePoints },
    queries: { target: 100, actual: queries.length, intents: new Set(queries.map(q => q.intent_id)).size, positives: positive.length,
      diagnostics: 20, ru: 12, en: 12, uncertain: 0, comparisonCases: plan.comparisonCases,
      limit: 'Only four distinct general review-workflow questions are supported; no topic-substitution padding. Positive topic/type balance and twenty-case comparison target cannot be met.' },
    annotation: { agent: true, human: false, assessedPairs: 12000, unjudgedPairs: 0, reviewQueries: 15, reviewPairs: 7500,
      rereviewChanges: 0, primaryInterpretiveDisagreementsResolvedBeforeModels: 1, allPositiveDocumentGrades: 3,
      method: 'Full-content semantic template assessment with exact full-document grammar validation; explicit qrels per document, no unread-zero defaults. Independent agent had no initial grades/ranks/scores. All qrels frozen before embeddings; fragment audit blinded to order and model outcomes.',
      nDCGBasis: 'fixed frozen agent qrels; full corpus assessed but no independent human ground truth' },
    voyage: aggregate(voyage), commonSubset: Object.fromEntries(MODELS.map(m => [m, aggregate(rows.filter(r => r.model === m && plan.comparisonCases.includes(r.query_id)))])),
    byLanguage: group('language'), byTopic: group('topic'), byTaskType: group('task_type'),
    fragments: { ...fragments.coverage, top10ByCase: positive.map(r => ({ query_id: r.query_id, ...r.fragmentTop10 })),
      modelComparisons: rows.filter(r => r.status === 'positive').map(r => ({ query_id: r.query_id, model: r.model, ...r.fragmentTop10 })),
      note: 'Full-document relevance and selected-fragment answer availability differ. Outside-pool equivalent documents are not query-level retrieval failures. No query intrinsically requires multiple chunks.' },
    cost: costs, accounting: { planningUSD: .08, absoluteUSD: .10, receiptUSD: costs.totalUSD,
      aggregateDeltaUSD: json(LOCAL + '/accounting-final.json').deltaUSD,
      reconciled: json(LOCAL + '/accounting-final.json').reconciled, aggregateUsageLagObserved: true },
    reliability: { embeddingCalls: 27, rerankCalls: 32, paidRetries: 0, dimensionProbes: 0, unresolvedBills: 0,
      productionValidatorPass: 32, providerFailures: 0, timeouts: 0, fallbackCases: 0 },
    native: { installedVersion: '2.1.0', uiCase: plan.nativeCase, fullIndex: true,
      liveSearchManualRerankAndToggles: 'PASS; original live invocation reached only the final cursor assertion failure',
      navigation: 'PASS in separate free saved-result UI replay; asynchronous cursor wait added only to test driver',
      extraPaidCallsForNavigation: 0, semanticScoresPreserved: true, realKeyInDataJson: false, assetsUnchanged: true,
      environment: json(LOCAL + '/native-final.json').environment,
      limitation: 'Cursor positioning was not successfully asserted in the original live session; separately verified with the same real saved result and all HTTP blocked. Query vector replayed from its exact paid cache in installed UI.' },
    originalMarkdownUnchanged: verifyCorpus(json(LOCAL + '/manifest.json'), LOCAL + '/vault'),
    conclusion: 'This template showcase validates the full retrieval/rerank path, cost, latency and fragment exposure. It does not discriminate document ranking quality or establish rerank benefit on substantive user knowledge. No product/default change is justified.',
  };
  // Derived report may be regenerated; frozen inputs and raw outcomes remain immutable.
  fs.writeFileSync(LOCAL + '/full-report.json', JSON.stringify({ summary: publicSummary, cases: rows }) + '\n', { mode: 0o600 });
  return publicSummary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const summary = report();
  if (process.argv.includes('--write-public')) fs.writeFileSync(new URL('../docs/showcase500-rerank-v1-summary.json', import.meta.url), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ voyage: summary.voyage, cost: summary.cost, commonSubset: summary.commonSubset, fragments: summary.fragments.top10ByCase }));
}
