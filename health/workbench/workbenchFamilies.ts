import type { SemanticGlobalMap, SemanticGlobalMapProductSnapshot } from "../semanticGlobalMapPort";

export interface SemanticFamily {
  readonly id: string;
  readonly paths: readonly string[];
  readonly relationships: readonly { left: string; right: string; score: number }[];
}
export interface FamilyProjection {
  readonly map: SemanticGlobalMap;
  readonly families: readonly SemanticFamily[];
  readonly represented: number;
}
const cache = new WeakMap<SemanticGlobalMap, FamilyProjection>();
const order = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/** A conservative top-K presentation heuristic, not a thematic classification. */
export function semanticFamilies(snapshot?: SemanticGlobalMapProductSnapshot): FamilyProjection | undefined {
  if (snapshot?.state !== "ready" || snapshot.busy || !snapshot.map) return;
  const map = snapshot.map, previous = cache.get(map);
  if (previous) return previous;
  const paths = new Set(map.nodes.map(node => node.path));
  const retained = new Map<string, Set<string>>();
  for (const node of map.nodes) {
    // Published top-K is five. Refuse unknown/unbounded input instead of a general clique search.
    if (node.neighbors.length > 5) continue;
    const row = [...node.neighbors].filter(n => paths.has(n.path) && n.path !== node.path && Number.isFinite(n.score))
      .sort((a, b) => b.score - a.score || order(a.path, b.path));
    const gaps = row.slice(0, -1).map((n, i) => ({ after: i + 1, gap: n.score - row[i + 1].score }))
      .sort((a, b) => b.gap - a.gap);
    const boundary = gaps[0];
    if (!boundary || boundary.after < 2 || boundary.gap < .05 ||
      gaps[1] && Math.abs(boundary.gap - gaps[1].gap) < 1e-10 || row[boundary.after - 1].score <= 0) continue;
    retained.set(node.path, new Set(row.slice(0, boundary.after).map(n => n.path)));
  }
  const adjacency = new Map<string, Set<string>>();
  const scores = new Map<string, number>();
  const pair = (a: string, b: string): string => JSON.stringify([a, b].sort(order));
  for (const edge of map.edges) {
    if (!edge.mutual || !Number.isFinite(edge.score) || !retained.get(edge.left)?.has(edge.right) || !retained.get(edge.right)?.has(edge.left)) continue;
    for (const [a, b] of [[edge.left, edge.right], [edge.right, edge.left]]) {
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      adjacency.get(a)!.add(b);
    }
    scores.set(pair(edge.left, edge.right), edge.score);
  }
  const cores = new Map<string, string[]>();
  for (const path of [...paths].sort(order)) {
    const neighbors = [...(adjacency.get(path) ?? [])].sort(order);
    if (neighbors.length > 5) continue;
    for (let mask = 0; mask < 1 << neighbors.length; mask++) {
      const members = [path, ...neighbors.filter((_, i) => mask & 1 << i)].sort(order);
      if (members.length < 3 || members[0] !== path ||
        members.some((a, i) => members.slice(i + 1).some(b => !adjacency.get(a)?.has(b)))) continue;
      // Every extension of a clique must also neighbor this anchor.
      if (neighbors.some(n => !members.includes(n) && members.every(p => adjacency.get(n)?.has(p)))) continue;
      cores.set(JSON.stringify(members), members);
    }
  }
  const families = [...cores.entries()].sort(([a], [b]) => order(a, b)).map(([key, members]): SemanticFamily => Object.freeze({
    id: JSON.stringify(["mutual-core-v1", map.scope?.id ?? "all", key]), paths: Object.freeze(members),
    relationships: Object.freeze(members.flatMap((left, i) => members.slice(i + 1).map(right => Object.freeze({ left, right, score: scores.get(pair(left, right))! })))),
  }));
  const result = Object.freeze({ map, families: Object.freeze(families), represented: new Set(families.flatMap(f => f.paths)).size });
  cache.set(map, result); return result;
}
