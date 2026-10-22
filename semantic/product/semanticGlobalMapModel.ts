import { compareStrings, isVaultPath } from "../../health/domain/validation";
import type { SemanticIndexRevision } from "../../health/semanticHealthAnalysisPort";
import type { SemanticGlobalFocus, SemanticGlobalMap, SemanticGlobalNode } from "../../health/semanticGlobalMapPort";
import { GLOBAL_SEMANTIC_DOCUMENT_CAP, GLOBAL_SEMANTIC_NEIGHBORS } from "../globalSemanticMap";
import type { GlobalSemanticOptions, GlobalSemanticAnalysis, GlobalSemanticNeighbor, GlobalSemanticDocument, GlobalSemanticRelationship, SemanticFocusAnalysis } from "../globalSemanticMap";

export class InvalidGlobalSemanticResult extends Error {}
function requireValid(value: boolean): asserts value { if (!value) throw new InvalidGlobalSemanticResult(); }
const score = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= -1 && value <= 1;
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const edgeKey = (left: string, right: string): string => JSON.stringify([left, right].sort(compareStrings));

/** Complete selected-to-all scores for this captured map, never top-five approximations. */
export function projectSemanticFocus(result: SemanticFocusAnalysis | undefined, path: string, map: SemanticGlobalMap): SemanticGlobalFocus {
  requireValid(Boolean(result) && result!.path === path && Array.isArray(result!.scores) && result!.scores.length === map.nodes.length);
  const remaining = new Set(map.nodes.map((node) => node.path));
  requireValid(remaining.has(path));
  const scores = Array.from(result!.scores, (item: GlobalSemanticNeighbor) => {
    requireValid(Boolean(item) && remaining.delete(item.path) && score(item.score));
    if (item.path === path) requireValid(Math.abs(item.score - 1) < 1e-12);
    return Object.freeze({ path: item.path, score: item.score });
  }).sort((a, b) => compareStrings(a.path, b.path));
  return Object.freeze({ path, scores: Object.freeze(scores) });
}

/** Reject the whole result on malformed counts/paths/ranks/relationships. Copy only public fields. */
export function projectGlobalSemanticMap(result: GlobalSemanticAnalysis, revision: SemanticIndexRevision, capturedAt: number, selection?: GlobalSemanticOptions["selection"]): SemanticGlobalMap | undefined {
  requireValid(Boolean(result) && count(result.indexedNoteCount) && result.indexedNoteCount <= revision.vectorCount &&
    count(result.mappedNoteCount) && result.mappedNoteCount <= result.indexedNoteCount && count(capturedAt));
  if (result.state === "too-large") {
    requireValid(result.mappedNoteCount > GLOBAL_SEMANTIC_DOCUMENT_CAP); return undefined;
  }
  requireValid(result.mappedNoteCount <= GLOBAL_SEMANTIC_DOCUMENT_CAP);
  if (selection) {
    const summary = result.selection;
    requireValid(Boolean(summary) && summary!.revision === selection.revision);
    requireValid([summary!.eligibleNoteCount, summary!.excludedNoteCount, summary!.unknownNoteCount, summary!.excludedPairCount, summary!.unknownPairCount].every(count));
    requireValid(summary!.eligibleNoteCount === result.mappedNoteCount + summary!.excludedNoteCount && summary!.eligibleNoteCount <= GLOBAL_SEMANTIC_DOCUMENT_CAP &&
      summary!.eligibleNoteCount <= result.indexedNoteCount && summary!.unknownNoteCount <= summary!.eligibleNoteCount &&
      summary!.excludedPairCount + summary!.unknownPairCount <= summary!.eligibleNoteCount * (summary!.eligibleNoteCount - 1) / 2);
  } else requireValid(result.selection === undefined);
  if (result.state === "core-unavailable") return undefined;
  requireValid(result.state === "ready" && (result.mappedNoteCount > 0 || Boolean(selection && result.selection?.excludedNoteCount)) && Array.isArray(result.nodes) && result.nodes.length === result.mappedNoteCount);
  const documents = result.nodes as readonly GlobalSemanticDocument[];
  const paths = new Set<string>();
  for (const node of documents) {
    requireValid(Boolean(node) && isVaultPath(node.path) && !paths.has(node.path) && (!selection || selection.document(node.path) !== "exclude")); paths.add(node.path);
  }
  const nodes = Array.from(documents, (node): SemanticGlobalNode => {
    const available = selection ? [...paths].filter(path => path !== node.path && selection.pair(node.path, path) === "allow").length : paths.size - 1;
    requireValid(score(node.coreSimilarity) && Array.isArray(node.neighbors) && node.neighbors.length === Math.min(GLOBAL_SEMANTIC_NEIGHBORS, available));
    const seen = new Set<string>();
    const neighbors = Array.from(node.neighbors, (neighbor: GlobalSemanticNeighbor) => {
      requireValid(Boolean(neighbor) && paths.has(neighbor.path) && neighbor.path !== node.path && !seen.has(neighbor.path) && score(neighbor.score) && (!selection || selection.pair(node.path, neighbor.path) === "allow"));
      seen.add(neighbor.path); return Object.freeze({ path: neighbor.path, score: neighbor.score });
    });
    const sorted = [...neighbors].sort((a, b) => b.score - a.score || compareStrings(a.path, b.path));
    requireValid(neighbors.every((neighbor, i) => neighbor.path === sorted[i].path));
    requireValid(neighbors.length ? score(node.semanticConnectedness) &&
      Math.abs(node.semanticConnectedness - neighbors.reduce((sum, neighbor) => sum + neighbor.score, 0) / neighbors.length) < 1e-12 : node.semanticConnectedness === null);
    return Object.freeze({ id: node.path, path: node.path, basename: node.path.split("/").pop()!.replace(/\.md$/i, ""),
      coreSimilarity: node.coreSimilarity, semanticConnectedness: node.semanticConnectedness, neighbors: Object.freeze(neighbors) });
  }).sort((a, b) => compareStrings(a.path, b.path));
  const expected = new Map<string, { score: number; mutual: boolean }>();
  for (const node of nodes) for (const neighbor of node.neighbors) {
    const key = edgeKey(node.path, neighbor.path); const prior = expected.get(key);
    requireValid(!prior || prior.score === neighbor.score);
    expected.set(key, { score: neighbor.score, mutual: Boolean(prior) });
  }
  requireValid(Array.isArray(result.edges) && result.edges.length === expected.size);
  const edges = Array.from(result.edges, (edge: GlobalSemanticRelationship) => {
    requireValid(Boolean(edge) && paths.has(edge.left) && paths.has(edge.right) && compareStrings(edge.left, edge.right) < 0);
    const key = edgeKey(edge.left, edge.right); const relationship = expected.get(key);
    requireValid(Boolean(relationship) && score(edge.score) && edge.score === relationship!.score && edge.mutual === relationship!.mutual);
    expected.delete(key);
    return Object.freeze({ left: edge.left, right: edge.right, score: edge.score, mutual: edge.mutual });
  }).sort((a, b) => compareStrings(a.left, b.left) || compareStrings(a.right, b.right));
  return Object.freeze({ revision: Object.freeze({ ...revision }), indexedNoteCount: result.indexedNoteCount,
    mappedNoteCount: result.mappedNoteCount, nodes: Object.freeze(nodes), edges: Object.freeze(edges), capturedAt });
}
