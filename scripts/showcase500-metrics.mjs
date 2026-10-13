import { check } from './rerank-comparison-budget.mjs';

export function measure(order, judgments, { diagnostic = false, weakGain = true } = {}) {
  check(new Set(order).size === order.length, 'duplicate-ranked-document');
  const grades = new Map(judgments.filter(j => j.grade !== null).map(j => [j.document_id, j.grade]));
  check(order.every(id => grades.has(id)), 'ranked-document-unjudged');
  check([...grades.values()].every(g => Number.isInteger(g) && g >= 0 && g <= 3), 'invalid-grade');
  const positions = judgments.filter(j => j.grade >= 2).map(j => ({ document_id: j.document_id, grade: j.grade,
    rank: order.includes(j.document_id) ? order.indexOf(j.document_id) + 1 : null }));
  const result = { positions, assessed: grades.size, unjudged: judgments.filter(j => j.grade === null).length };
  if (diagnostic) return { ...result, quality: null, top10: order.slice(0, 10).map(id => ({ document_id: id, grade: grades.get(id) })) };
  const dcg = a => a.slice(0, 10).reduce((s, g, i) => s + (g === 1 && !weakGain ? 0 : 2 ** g - 1) / Math.log2(i + 2), 0);
  const ideal = dcg([...grades.values()].sort((a, b) => b - a));
  const first = order.slice(0, 10).findIndex(id => grades.get(id) >= 2);
  return { ...result, hit1: Number(first === 0), hit3: Number(first >= 0 && first < 3), mrr10: first < 0 ? 0 : 1 / (first + 1),
    ndcg10: ideal ? dcg(order.map(id => grades.get(id))) / ideal : null,
    grade3Rank: order.findIndex(id => grades.get(id) === 3) < 0 ? null : order.findIndex(id => grades.get(id) === 3) + 1 };
}

export function change(before, after) {
  const delta = after - before;
  return Math.abs(delta) <= 1e-9 ? 'Unchanged' : delta > 0 ? 'Improved' : 'Regressed';
}

export function bootstrap(rows, seed = 500210, iterations = 10000) {
  const groups = new Map();
  for (const row of rows) { const a = groups.get(row.intent_id) ?? []; a.push(row.delta); groups.set(row.intent_id, a); }
  const values = [...groups.values()].map(a => a.reduce((s, x) => s + x, 0) / a.length);
  if (!values.length) return null;
  const random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const samples = Array.from({ length: iterations }, () => values.reduce(s => s + values[Math.floor(random() * values.length)], 0) / values.length).sort((a, b) => a - b);
  return { meanDelta: values.reduce((s, x) => s + x, 0) / values.length,
    lower: samples[Math.floor(iterations * .025)], upper: samples[Math.ceil(iterations * .975) - 1], intents: values.length, iterations };
}
