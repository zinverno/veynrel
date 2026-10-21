import type { FindingCandidate } from "../domain/finding";
import type { ConnectionComparisonPair } from "../connectionComparisonPort";
import { sameSemanticIndexRevision } from "../semanticHealthAnalysisPort";
import { sameLocalVaultRevision } from "../analyzers/local/localVaultRevision";
import type { WorkbenchData } from "./workbenchData";
import type { SemanticIndexRevision } from "../semanticHealthAnalysisPort";

export const pairId = (a: string, b: string): string => JSON.stringify(a < b ? [a, b] : [b, a]);
export interface WorkbenchPair {
  id: string; paths: readonly [string, string]; basis: "duplicate" | "finding" | "connection" | "selected";
  score?: number; comparison?: ConnectionComparisonPair;
}
export interface WorkbenchNode { path: string; semantic: boolean; linksAvailable: boolean }
export interface WorkbenchEdge { source: string; target: string; kind: "link" | "semantic"; score?: number; mutual?: boolean; revision?: Readonly<SemanticIndexRevision> }
export interface WorkbenchModel {
  nodes: readonly WorkbenchNode[]; edges: readonly WorkbenchEdge[];
  repeats: readonly WorkbenchPair[]; connections: readonly WorkbenchPair[];
  linksCurrent: boolean; semanticCurrent: boolean; comparisonCurrent: boolean;
  external: readonly { source: string; target: string }[];
}

/** Exact paths and source revisions only; no similarity calculation, text read or absence inference. */
export function workbenchModel(data: WorkbenchData, findings: readonly FindingCandidate[]): WorkbenchModel {
  const paths = new Set(data.scope.paths), topology = data.dependencies.topology.getSnapshot(), semantic = data.semantic?.getSnapshot();
  const comparison = data.comparison?.getSnapshot(), map = semantic?.map, links = topology.map;
  const linksCurrent = topology.state === "ready", semanticCurrent = semantic?.state === "ready";
  const comparisonCurrent = Boolean(linksCurrent && semanticCurrent && comparison?.state === "ready" &&
    sameSemanticIndexRevision(comparison.comparison?.semanticRevision, map?.revision) && links && comparison.comparison &&
    sameLocalVaultRevision(comparison.comparison.topologyRevision, links.revision));
  const linked = new Map(links?.nodes.map(node => [node.path, node]));
  const indexed = new Set(map?.nodes.map(node => node.path));
  const nodes = data.scope.paths.map(path => ({ path, semantic: indexed.has(path), linksAvailable: linksCurrent && linked.get(path)?.linksAvailable === true }));
  const edges: WorkbenchEdge[] = [];
  for (const edge of links?.edges ?? []) if (paths.has(edge.source) && paths.has(edge.target)) edges.push({ ...edge, kind: "link" });
  for (const edge of map?.edges ?? []) if (paths.has(edge.left) && paths.has(edge.right)) edges.push({ source: edge.left, target: edge.right, kind: "semantic", score: edge.score, mutual: edge.mutual, revision: map!.revision });
  const repeats = new Map<string, WorkbenchPair>();
  const offer = (candidate: FindingCandidate, basis: WorkbenchPair["basis"]): void => {
    if (candidate.notePaths.length !== 2 || !candidate.notePaths.every(path => paths.has(path))) return;
    const [a, b] = [...candidate.notePaths].sort(); if (a === b) return;
    const id = pairId(a, b), score = candidate.evidence.find(item => item.kind === "similarity-score")?.value;
    if (!repeats.has(id)) repeats.set(id, { id, paths: [a, b], basis, ...(typeof score === "number" ? { score } : {}) });
  };
  for (const candidate of data.duplicates?.candidates ?? []) offer(candidate, "duplicate");
  for (const candidate of findings) if (["semantic-duplicate", "exact-duplicate-group", "duplicate-title-group"].includes(candidate.type)) offer(candidate, "finding");
  const connections = comparisonCurrent ? (comparison!.comparison?.pairs ?? []).filter(pair => pair.category === "candidate" &&
    paths.has(pair.leftPath) && paths.has(pair.rightPath)).map((pair): WorkbenchPair => ({ id: pair.id, paths: [pair.leftPath, pair.rightPath],
    basis: "connection", score: pair.semantic?.score, comparison: pair })) : [];
  return { nodes, edges, repeats: [...repeats.values()], connections, linksCurrent, semanticCurrent, comparisonCurrent,
    external: (links?.edges ?? []).filter(edge => paths.has(edge.source) !== paths.has(edge.target)) };
}

/** Keep identity, but never retain an obsolete candidate's factual basis after refresh. */
export function reconcileWorkbenchSelection(model: WorkbenchModel, selected?: WorkbenchPair): WorkbenchPair | undefined {
  if (!selected || !selected.paths.every(path => model.nodes.some(node => node.path === path))) return;
  return [...model.repeats, ...model.connections].find(pair => pair.id === selected.id) ??
    { id: selected.id, paths: selected.paths, basis: "selected" };
}

export function linkFact(model: WorkbenchModel, [a, b]: readonly [string, string]): "both" | "forward" | "backward" | "absent" | "unknown" {
  if (!model.linksCurrent) return "unknown";
  const forward = model.edges.some(edge => edge.kind === "link" && edge.source === a && edge.target === b);
  const backward = model.edges.some(edge => edge.kind === "link" && edge.source === b && edge.target === a);
  if (forward || backward) return forward && backward ? "both" : forward ? "forward" : "backward";
  return model.nodes.filter(node => [a, b].includes(node.path) && node.linksAvailable).length === 2 ? "absent" : "unknown";
}

export interface MapPoint { path: string; x: number; y: number }
export function edgeAttraction(edge: WorkbenchEdge): { length: number; strength: number } {
  if (edge.kind === "semantic" && edge.score !== undefined && Number.isFinite(edge.score)) {
    const weight = Math.max(0, Math.min(1, (edge.score + 1) / 2));
    return { length: 150 - 110 * weight, strength: .015 + .07 * weight };
  }
  return { length: 110, strength: .025 };
}
/** Fixed 32 passes, no timers or simulation loop. Geometry is not a cosine scale. */
export function workbenchLayout(nodes: readonly WorkbenchNode[], edges: readonly WorkbenchEdge[]): readonly MapPoint[] {
  const ordered = [...nodes].sort((a, b) => a.path < b.path ? -1 : 1), columns = Math.max(1, Math.ceil(Math.sqrt(ordered.length)));
  const points = ordered.map((node, i) => ({ path: node.path, x: (i % columns) * 80, y: Math.floor(i / columns) * 80 }));
  if (points.length > 500) return points;
  const indices = new Map(points.map((point, i) => [point.path, i]));
  const pairs = new Map(edges.map(edge => [`${edge.kind}:${pairId(edge.source, edge.target)}`, { a: indices.get(edge.source), b: indices.get(edge.target), ...edgeAttraction(edge) }]));
  for (let pass = 0; pass < 32; pass++) {
    const dx = points.map(() => 0), dy = points.map(() => 0);
    for (let a = 0; a < points.length; a++) for (let b = a + 1; b < points.length; b++) {
      const x = points[b].x - points[a].x, y = points[b].y - points[a].y, squared = Math.max(1, x*x + y*y);
      if (squared > 14400) continue;
      const force = Math.min(0.25, 600 / squared);
      dx[a] -= x * force; dy[a] -= y * force; dx[b] += x * force; dy[b] += y * force;
    }
    for (const { a, b, length, strength } of pairs.values()) {
      if (a === undefined || b === undefined) continue;
      const x = points[b].x - points[a].x, y = points[b].y - points[a].y, distance = Math.hypot(x, y) || 1;
      const force = (distance - length) / distance * strength;
      dx[a] += x * force; dy[a] += y * force; dx[b] -= x * force; dy[b] -= y * force;
    }
    points.forEach((point, i) => { point.x += Math.max(-15, Math.min(15, dx[i])); point.y += Math.max(-15, Math.min(15, dy[i])); });
  }
  return points;
}
