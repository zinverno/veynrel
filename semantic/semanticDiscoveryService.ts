import type {
  VectorChunkMetadata,
  VectorStore,
  VectorStoreSnapshot,
} from "../vectorStore/types";
import {
  SemanticSourceNotIndexedError,
  SemanticValidationError,
} from "./errors";
import type {
  SemanticChunkMatch,
  SemanticDocumentSimilarity,
  SemanticDuplicateOptions,
  SemanticDuplicatePair,
  SemanticSimilarNotesOptions,
} from "./types";
import { GLOBAL_SEMANTIC_DOCUMENT_CAP, GLOBAL_SEMANTIC_NEIGHBORS } from "./globalSemanticMap";
import type { GlobalSemanticAnalysis, GlobalSemanticNeighbor, GlobalSemanticOptions, GlobalSemanticRelationship, SemanticFocusAnalysis } from "./globalSemanticMap";

export const DEFAULT_SIMILAR_NOTES_LIMIT = 10;
export const DEFAULT_DUPLICATE_PAIR_LIMIT = 100;
export const DEFAULT_DUPLICATE_THRESHOLD = 0.95;
export const MIN_DOCUMENT_MEANINGFUL_CHARACTERS = 32;
/**
 * Unit Float32 chunks can retain aggregate cancellation noise around a few
 * 1e-6 in hundreds of dimensions. Keeping the mean resultant length above
 * 1e-5 rejects numerically ill-conditioned directions while remaining far
 * below the coherence of a meaningfully aligned document.
 */
export const MIN_DOCUMENT_COHERENCE = 1e-5;

export const DEFAULT_MATCHES_PER_DOCUMENT = 3;
const MAX_RESULT_LIMIT = 500;
const MAX_MATCHES_PER_DOCUMENT = 10;
const MEANINGFUL_CHARACTER = /[\p{L}\p{N}]/u;

interface PreparedOptions {
  limit: number;
  matchesPerDocument: number;
}

interface PreparedDocument {
  path: string;
  rows: number[];
  vector: Float64Array | null;
  meaningfulCharacters: number;
}

interface PreparedSnapshot {
  snapshot: VectorStoreSnapshot;
  documents: PreparedDocument[];
}

interface DuplicateCandidate {
  left: PreparedDocument;
  right: PreparedDocument;
  score: number;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareDuplicateCandidateParts(
  leftScore: number,
  leftLeftPath: string,
  leftRightPath: string,
  rightScore: number,
  rightLeftPath: string,
  rightRightPath: string,
): number {
  return (
    rightScore - leftScore ||
    compareStrings(leftLeftPath, rightLeftPath) ||
    compareStrings(leftRightPath, rightRightPath)
  );
}

function compareDuplicateCandidates(
  left: DuplicateCandidate,
  right: DuplicateCandidate,
): number {
  return compareDuplicateCandidateParts(
    left.score,
    left.left.path,
    left.right.path,
    right.score,
    right.left.path,
    right.right.path,
  );
}

/** Maintains a worst-candidate-first heap with at most `limit` entries. */
function offerDuplicateCandidate(
  heap: DuplicateCandidate[],
  left: PreparedDocument,
  right: PreparedDocument,
  score: number,
  limit: number,
): void {
  if (heap.length < limit) {
    heap.push({ left, right, score });
    let index = heap.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (compareDuplicateCandidates(heap[index], heap[parent]) <= 0) break;
      [heap[index], heap[parent]] = [heap[parent], heap[index]];
      index = parent;
    }
    return;
  }

  const worst = heap[0];
  if (
    compareDuplicateCandidateParts(
      score,
      left.path,
      right.path,
      worst.score,
      worst.left.path,
      worst.right.path,
    ) >= 0
  ) {
    return;
  }

  heap[0] = { left, right, score };
  let index = 0;
  while (true) {
    const leftChild = index * 2 + 1;
    if (leftChild >= heap.length) return;
    const rightChild = leftChild + 1;
    let worseChild = leftChild;
    if (
      rightChild < heap.length &&
      compareDuplicateCandidates(heap[rightChild], heap[leftChild]) > 0
    ) {
      worseChild = rightChild;
    }
    if (compareDuplicateCandidates(heap[worseChild], heap[index]) <= 0) return;
    [heap[index], heap[worseChild]] = [heap[worseChild], heap[index]];
    index = worseChild;
  }
}

function positiveSafeInteger(
  value: unknown,
  label: string,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > maximum
  ) {
    throw new SemanticValidationError(
      `${label} must be a positive safe integer not greater than ${maximum}.`,
    );
  }
  return value;
}

function validatePath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    value.includes("\0") ||
    value.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.includes("\\")
  ) {
    throw new SemanticValidationError(
      "Source path must be a canonical vault-relative path.",
    );
  }
  if (
    value
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new SemanticValidationError(
      "Source path must be a canonical vault-relative path.",
    );
  }
  return value;
}

function prepareOptions(
  raw: SemanticSimilarNotesOptions | SemanticDuplicateOptions | undefined,
  defaultLimit: number,
): PreparedOptions {
  if (
    raw !== undefined &&
    (typeof raw !== "object" || raw === null || Array.isArray(raw))
  ) {
    throw new SemanticValidationError("Discovery options must be an object.");
  }
  return {
    limit: positiveSafeInteger(
      raw?.limit ?? defaultLimit,
      "Discovery limit",
      MAX_RESULT_LIMIT,
    ),
    matchesPerDocument: positiveSafeInteger(
      raw?.matchesPerDocument ?? DEFAULT_MATCHES_PER_DOCUMENT,
      "matchesPerDocument",
      MAX_MATCHES_PER_DOCUMENT,
    ),
  };
}

function stableNorm(vector: Float64Array): number {
  let scale = 0;
  let sum = 1;
  for (let index = 0; index < vector.length; index++) {
    const absolute = Math.abs(vector[index]);
    if (absolute === 0) continue;
    if (scale < absolute) {
      const ratio = scale / absolute;
      sum = 1 + sum * ratio * ratio;
      scale = absolute;
    } else {
      const ratio = absolute / scale;
      sum += ratio * ratio;
    }
  }
  return scale === 0 ? 0 : scale * Math.sqrt(sum);
}

function meaningfulCharacterCount(previews: ReadonlySet<string>): number {
  let count = 0;
  for (const preview of previews) {
    for (const character of preview) {
      if (MEANINGFUL_CHARACTER.test(character)) count++;
    }
  }
  return count;
}

function normalizedMean(
  rows: readonly number[],
  vectors: Float32Array,
  dimensions: number,
): Float64Array | null {
  if (rows.length === 0) return null;
  const mean = new Float64Array(dimensions);
  for (const row of rows) {
    const start = row * dimensions;
    for (let column = 0; column < dimensions; column++) {
      const value = vectors[start + column];
      if (!Number.isFinite(value)) {
        throw new SemanticValidationError(
          "Vector snapshot contains a non-finite component.",
        );
      }
      mean[column] += value;
    }
  }
  const norm = stableNorm(mean);
  const coherence = norm / rows.length;
  if (
    !Number.isFinite(norm) ||
    !Number.isFinite(coherence) ||
    coherence <= MIN_DOCUMENT_COHERENCE
  ) {
    return null;
  }
  for (let column = 0; column < dimensions; column++) {
    mean[column] /= norm;
  }
  return mean;
}

function cosine(
  left: Float64Array,
  right: Float64Array | Float32Array,
  rightOffset = 0,
): number {
  let score = 0;
  for (let index = 0; index < left.length; index++) {
    score += left[index] * right[rightOffset + index];
  }
  if (!Number.isFinite(score)) {
    throw new SemanticValidationError(
      "Document similarity produced a non-finite score.",
    );
  }
  const clamped = Math.max(-1, Math.min(1, score));
  return Object.is(clamped, -0) ? 0 : clamped;
}

function copyMatch(
  metadata: VectorChunkMetadata,
  score: number,
): SemanticChunkMatch {
  const match: SemanticChunkMatch = {
    id: metadata.id,
    path: metadata.path,
    headingPath: [...metadata.headingPath],
    ordinal: metadata.ordinal,
    contentHash: metadata.contentHash,
    source: { ...metadata.source },
    score,
  };
  if (metadata.preview !== undefined) match.preview = metadata.preview;
  return match;
}

function yieldGlobalAnalysis(): Promise<void> {
  // Pure engine also runs outside Obsidian; no DOM/window owner or repeating timer.
  const timerHost = typeof window === "undefined" ? { setTimeout } : window;
  return new Promise((resolve) => timerHost.setTimeout(resolve, 0));
}

export class SemanticDiscoveryService {
  constructor(
    private readonly vectorStore: VectorStore,
    private readonly dimensions: number,
    private readonly duplicateThreshold = DEFAULT_DUPLICATE_THRESHOLD,
  ) {
    if (!vectorStore || typeof vectorStore.readSnapshot !== "function") {
      throw new SemanticValidationError(
        "A snapshot-capable vector store is required.",
      );
    }
    positiveSafeInteger(dimensions, "Dimensions", 0xffff_ffff);
    if (
      typeof duplicateThreshold !== "number" ||
      !Number.isFinite(duplicateThreshold) ||
      duplicateThreshold < -1 ||
      duplicateThreshold > 1
    ) {
      throw new SemanticValidationError(
        "Duplicate threshold must be finite and between -1 and 1.",
      );
    }
  }

  /** Catalog of the same snapshot, without document-centroid computation. */
  listIndexedPaths(): readonly string[] {
    return Object.freeze([...new Set(this.validatedSnapshot().metadata.map((item) => validatePath(item.path)))].sort(compareStrings));
  }

  /** Exact, read-only analysis. Prepare the SAME document centroids once, retain only O(N*K) pairs.
   * Yield every 2048 comparisons so loading/progress, cancellation and revision events can run. */
  async analyzeGlobalSemanticMap(options: GlobalSemanticOptions = {}): Promise<GlobalSemanticAnalysis> {
    const check = (): void => { if (options.signal?.aborted) throw new Error("Global semantic analysis cancelled"); };
    check();
    // Let the explicit local-loading state paint before preparing the snapshot.
    await yieldGlobalAnalysis();
    check();
    const prepared = this.prepareSnapshot();
    const paths = options.paths === undefined ? undefined : new Set(options.paths.map(validatePath));
    const scoped = paths ? prepared.documents.filter(document => paths.has(document.path)) : prepared.documents;
    const eligible = scoped.filter((document) => this.eligible(document));
    // A policy cannot bypass the selected semantic coverage cap.
    if (eligible.length > GLOBAL_SEMANTIC_DOCUMENT_CAP) return { indexedNoteCount: scoped.length, mappedNoteCount: eligible.length, state: "too-large" };
    const policy = options.selection;
    const documents = policy ? eligible.filter(document => policy.document(document.path) !== "exclude") : eligible;
    const selection = policy ? { revision: policy.revision, eligibleNoteCount: eligible.length,
      excludedNoteCount: eligible.length - documents.length, unknownNoteCount: eligible.filter(d => policy.unknown(d.path)).length,
      excludedPairCount: 0, unknownPairCount: 0 } : undefined;
    if (selection && policy) {
      let checked = 0;
      for (let a = 0; a < eligible.length; a++) for (let b = a + 1; b < eligible.length; b++) {
        const result = policy.pair(eligible[a].path, eligible[b].path);
        if (result === "exclude") selection.excludedPairCount++;
        else if (result === "unknown") selection.unknownPairCount++;
        if (++checked % 2048 === 0) { await yieldGlobalAnalysis(); check(); }
      }
      check();
    }
    const counts = { indexedNoteCount: scoped.length, mappedNoteCount: documents.length, ...(selection ? { selection } : {}) };
    if (selection?.excludedNoteCount && !documents.length) return { ...counts, state: "ready", nodes: [], edges: [] };
    const core = new Float64Array(this.dimensions);
    for (const document of documents) {
      validatePath(document.path);
      for (let column = 0; column < this.dimensions; column++) core[column] += document.vector![column];
    }
    const norm = stableNorm(core);
    // Mean resultant length protects against cancellation noise, as for document centroids.
    if (!documents.length || !Number.isFinite(norm) || norm / documents.length <= MIN_DOCUMENT_COHERENCE) {
      return { ...counts, state: "core-unavailable" };
    }
    for (let column = 0; column < this.dimensions; column++) core[column] /= norm;
    const neighbors: GlobalSemanticNeighbor[][] = documents.map(() => []);
    const compare = (a: GlobalSemanticNeighbor, b: GlobalSemanticNeighbor): number => b.score - a.score || compareStrings(a.path, b.path);
    const offer = (list: GlobalSemanticNeighbor[], path: string, score: number): void => {
      const candidate = { path, score };
      if (list.length === GLOBAL_SEMANTIC_NEIGHBORS && compare(candidate, list[list.length - 1]) >= 0) return;
      list.push(candidate); list.sort(compare);
      if (list.length > GLOBAL_SEMANTIC_NEIGHBORS) list.pop();
    };
    const totalPairs = documents.length * (documents.length - 1) / 2;
    let completedPairs = 0;
    const progress = (): void => {
      try { options.onProgress?.({ completedPairs, totalPairs }); } catch { /* Observers cannot change analysis. */ }
    };
    progress();
    for (let left = 0; left < documents.length; left++) {
      for (let right = left + 1; right < documents.length; right++) {
        if (!policy || policy.pair(documents[left].path, documents[right].path) === "allow") {
          const score = cosine(documents[left].vector!, documents[right].vector!);
          offer(neighbors[left], documents[right].path, score);
          offer(neighbors[right], documents[left].path, score);
        }
        if (++completedPairs % 2048 === 0) {
          progress(); await yieldGlobalAnalysis(); check();
        }
      }
    }
    check(); progress();
    const byPath = new Map(documents.map((document, index) => [document.path, neighbors[index]]));
    const edges = new Map<string, GlobalSemanticRelationship>();
    const nodes = documents.map((document, index) => {
      const nearest = neighbors[index];
      for (const neighbor of nearest) {
        const [left, right] = [document.path, neighbor.path].sort(compareStrings);
        const mutual = byPath.get(neighbor.path)!.some((item) => item.path === document.path);
        edges.set(JSON.stringify([left, right]), { left, right, score: neighbor.score, mutual });
      }
      return { path: document.path, coreSimilarity: cosine(document.vector!, core),
        semanticConnectedness: nearest.length ? nearest.reduce((sum, item) => sum + item.score, 0) / nearest.length : null,
        neighbors: nearest };
    });
    return { ...counts, state: "ready", nodes,
      edges: [...edges.values()].sort((a, b) => compareStrings(a.left, b.left) || compareStrings(a.right, b.right)) };
  }

  /** One validated snapshot, the same eligible centroids, then O(N*D) focus comparisons. */
  analyzeSemanticFocus(rawSourcePath: string): SemanticFocusAnalysis | undefined {
    const sourcePath = validatePath(rawSourcePath);
    const prepared = this.prepareSnapshot();
    const documents = prepared.documents.filter((document) => this.eligible(document));
    if (documents.length > GLOBAL_SEMANTIC_DOCUMENT_CAP) return undefined;
    const source = documents.find((document) => document.path === sourcePath);
    if (!source) return undefined;
    return { path: sourcePath, scores: documents.map((document) => ({
      path: validatePath(document.path), score: cosine(source.vector!, document.vector!),
    })) };
  }

  findSimilarNotes(
    rawSourcePath: string,
    rawOptions?: SemanticSimilarNotesOptions,
  ): SemanticDocumentSimilarity[] {
    const sourcePath = validatePath(rawSourcePath);
    const options = prepareOptions(rawOptions, DEFAULT_SIMILAR_NOTES_LIMIT);
    const prepared = this.prepareSnapshot();
    if (prepared.documents.length === 0) return [];
    const source = prepared.documents.find(
      (document) => document.path === sourcePath,
    );
    if (!source) throw new SemanticSourceNotIndexedError();
    if (!this.eligible(source)) return [];

    return prepared.documents
      .filter(
        (document) =>
          document.path !== sourcePath && this.eligible(document),
      )
      .map((document) => ({
        path: document.path,
        score: cosine(source.vector as Float64Array, document.vector as Float64Array),
        matches: this.bestMatches(
          source.vector as Float64Array,
          document,
          prepared.snapshot,
          options.matchesPerDocument,
        ),
      }))
      .sort(
        (left, right) =>
          right.score - left.score || compareStrings(left.path, right.path),
      )
      .slice(0, options.limit);
  }

  findPotentialDuplicates(
    rawOptions?: SemanticDuplicateOptions,
  ): SemanticDuplicatePair[] {
    const options = prepareOptions(rawOptions, DEFAULT_DUPLICATE_PAIR_LIMIT);
    const prepared = this.prepareSnapshot();
    const documents = prepared.documents.filter((document) =>
      this.eligible(document),
    );
    const topCandidates: DuplicateCandidate[] = [];

    for (let leftIndex = 0; leftIndex < documents.length; leftIndex++) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < documents.length;
        rightIndex++
      ) {
        const left = documents[leftIndex];
        const right = documents[rightIndex];
        const score = cosine(
          left.vector as Float64Array,
          right.vector as Float64Array,
        );
        if (score >= this.duplicateThreshold) {
          offerDuplicateCandidate(
            topCandidates,
            left,
            right,
            score,
            options.limit,
          );
        }
      }
    }

    return topCandidates
      .sort(compareDuplicateCandidates)
      .map(({ left, right, score }) => ({
        leftPath: left.path,
        rightPath: right.path,
        score,
        leftMatches: this.bestMatches(
          right.vector as Float64Array,
          left,
          prepared.snapshot,
          options.matchesPerDocument,
        ),
        rightMatches: this.bestMatches(
          left.vector as Float64Array,
          right,
          prepared.snapshot,
          options.matchesPerDocument,
        ),
      }));
  }

  private validatedSnapshot(): VectorStoreSnapshot {
    const snapshot = this.vectorStore.readSnapshot();
    if (
      !snapshot ||
      !Number.isSafeInteger(snapshot.generation) ||
      snapshot.generation < 0 ||
      snapshot.dimensions !== this.dimensions ||
      !Array.isArray(snapshot.metadata) ||
      !(snapshot.vectors instanceof Float32Array) ||
      snapshot.vectors.length !== snapshot.metadata.length * this.dimensions
    ) {
      throw new SemanticValidationError(
        "Vector store returned an invalid discovery snapshot.",
      );
    }

    return snapshot;
  }

  private prepareSnapshot(): PreparedSnapshot {
    const snapshot = this.validatedSnapshot();
    const grouped = new Map<string, number[]>();
    for (let row = 0; row < snapshot.metadata.length; row++) {
      const metadata = snapshot.metadata[row];
      const rows = grouped.get(metadata.path) ?? [];
      rows.push(row);
      grouped.set(metadata.path, rows);
    }

    const documents = [...grouped.entries()]
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([path, rows]) => {
        rows.sort((left, right) => {
          const leftMetadata = snapshot.metadata[left];
          const rightMetadata = snapshot.metadata[right];
          return (
            leftMetadata.ordinal - rightMetadata.ordinal ||
            compareStrings(leftMetadata.id, rightMetadata.id)
          );
        });
        const previews = new Set<string>();
        for (const row of rows) {
          const preview = snapshot.metadata[row].preview;
          if (preview) previews.add(preview);
        }
        return {
          path,
          rows,
          vector: normalizedMean(rows, snapshot.vectors, this.dimensions),
          meaningfulCharacters: meaningfulCharacterCount(previews),
        };
      });
    return { snapshot, documents };
  }

  private eligible(document: PreparedDocument): boolean {
    return (
      document.vector !== null &&
      document.meaningfulCharacters >= MIN_DOCUMENT_MEANINGFUL_CHARACTERS
    );
  }

  private bestMatches(
    query: Float64Array,
    document: PreparedDocument,
    snapshot: VectorStoreSnapshot,
    limit: number,
  ): SemanticChunkMatch[] {
    return document.rows
      .map((row) => ({
        metadata: snapshot.metadata[row],
        score: cosine(
          query,
          snapshot.vectors,
          row * this.dimensions,
        ),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          compareStrings(left.metadata.id, right.metadata.id),
      )
      .slice(0, limit)
      .map(({ metadata, score }) => copyMatch(metadata, score));
  }
}
