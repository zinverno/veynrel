import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type {
  VectorEntry,
  VectorSearchOptions,
  VectorSearchResult,
  VectorStore,
  VectorStoreMutation,
  VectorStoreStats,
} from "../vectorStore";
import { SemanticSourceNotIndexedError } from "./errors";
import {
  DEFAULT_DUPLICATE_PAIR_LIMIT,
  DEFAULT_DUPLICATE_THRESHOLD,
  MIN_DOCUMENT_COHERENCE,
  MIN_DOCUMENT_MEANINGFUL_CHARACTERS,
  SemanticDiscoveryService,
} from "./semanticDiscoveryService";

const LONG_PREVIEW = "meaningful semantic note content with enough characters";

function entry(
  id: string,
  path: string,
  vector: readonly number[],
  ordinal = 0,
  preview = LONG_PREVIEW,
  startLine = ordinal * 10,
): VectorEntry {
  return {
    id,
    path,
    headingPath: [path.replace(/\.md$/u, ""), `Section ${ordinal}`],
    ordinal,
    contentHash: `hash-${id}`,
    source: {
      startOffset: ordinal * 100,
      endOffset: ordinal * 100 + preview.length,
      startLine,
      endLine: startLine + 1,
    },
    preview,
    vector: new Float32Array(vector),
  };
}

class SnapshotStore implements VectorStore {
  generation = 1;
  mutations = 0;
  snapshotReads = 0;
  afterRead: (() => void) | null = null;
  readonly search = vi.fn(
    async (
      _query: Float32Array,
      _options: VectorSearchOptions,
    ): Promise<VectorSearchResult[]> => [],
  );
  private entries: VectorEntry[];

  constructor(
    entries: readonly VectorEntry[],
    readonly dimensions = entries[0]?.vector.length ?? 2,
  ) {
    this.entries = this.copyEntries(entries);
  }

  async initialize(): Promise<void> {}

  listMetadata() {
    return this.entries.map(({ vector: _vector, ...metadata }) => ({
      ...metadata,
      headingPath: [...metadata.headingPath],
      source: { ...metadata.source },
    }));
  }

  readSnapshot() {
    this.snapshotReads++;
    const current = this.copyEntries(this.entries);
    const snapshot = {
      generation: this.generation,
      dimensions: this.dimensions,
      embeddingSpaceId: "discovery-test",
      metadata: current.map(({ vector: _vector, ...metadata }) => metadata),
      vectors: new Float32Array(
        current.flatMap((item) => [...item.vector]),
      ),
    };
    const afterRead = this.afterRead;
    this.afterRead = null;
    afterRead?.();
    return snapshot;
  }

  async applyChanges(_mutation: VectorStoreMutation): Promise<void> {
    this.mutations++;
    this.generation++;
  }

  async clear(): Promise<void> {
    this.entries = [];
    this.generation++;
  }

  getStats(): VectorStoreStats {
    return {
      initialized: true,
      count: this.entries.length,
      dimensions: this.dimensions,
      embeddingSpaceId: "discovery-test",
      generation: this.generation,
      binaryBytes: this.entries.length * this.dimensions * 4,
    };
  }

  replace(entries: readonly VectorEntry[]): void {
    this.entries = this.copyEntries(entries);
    this.generation++;
  }

  private copyEntries(entries: readonly VectorEntry[]): VectorEntry[] {
    return entries.map((item) => ({
      ...item,
      headingPath: [...item.headingPath],
      source: { ...item.source },
      vector: new Float32Array(item.vector),
    }));
  }
}

function similarHarness(entries: readonly VectorEntry[]) {
  const store = new SnapshotStore(entries);
  return {
    store,
    service: new SemanticDiscoveryService(store, store.dimensions),
  };
}

function unitVector(values: readonly number[]): number[] {
  const norm = Math.hypot(...values);
  return values.map((value) => value / norm);
}

interface ReferenceDuplicatePair {
  leftPath: string;
  rightPath: string;
  score: number;
}

function compareReferencePairs(
  left: ReferenceDuplicatePair,
  right: ReferenceDuplicatePair,
): number {
  return (
    right.score - left.score ||
    (left.leftPath < right.leftPath
      ? -1
      : left.leftPath > right.leftPath
        ? 1
        : 0) ||
    (left.rightPath < right.rightPath
      ? -1
      : left.rightPath > right.rightPath
        ? 1
        : 0)
  );
}

function referenceSingleChunkDuplicates(
  entries: readonly VectorEntry[],
  threshold: number,
  limit: number,
): ReferenceDuplicatePair[] {
  const documents = entries
    .map((item) => {
      const vector = Array.from(item.vector);
      const norm = Math.hypot(...vector);
      return {
        path: item.path,
        vector: vector.map((value) => value / norm),
      };
    })
    .sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    );
  const pairs: ReferenceDuplicatePair[] = [];
  for (let leftIndex = 0; leftIndex < documents.length; leftIndex++) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < documents.length;
      rightIndex++
    ) {
      const left = documents[leftIndex];
      const right = documents[rightIndex];
      let score = 0;
      for (let index = 0; index < left.vector.length; index++) {
        score += left.vector[index] * right.vector[index];
      }
      score = Math.max(-1, Math.min(1, score));
      if (score >= threshold) {
        pairs.push({
          leftPath: left.path,
          rightPath: right.path,
          score,
        });
      }
    }
  }
  return pairs.sort(compareReferencePairs).slice(0, limit);
}

function projectDuplicatePairs(
  pairs: readonly {
    leftPath: string;
    rightPath: string;
    score: number;
  }[],
): ReferenceDuplicatePair[] {
  return pairs.map(({ leftPath, rightPath, score }) => ({
    leftPath,
    rightPath,
    score,
  }));
}

function expectEquivalentPairs(
  actual: readonly ReferenceDuplicatePair[],
  expected: readonly ReferenceDuplicatePair[],
): void {
  expect(actual.map(({ leftPath, rightPath }) => [leftPath, rightPath]))
    .toEqual(expected.map(({ leftPath, rightPath }) => [leftPath, rightPath]));
  expect(actual).toHaveLength(expected.length);
  for (let index = 0; index < actual.length; index++) {
    expect(actual[index].score).toBeCloseTo(expected[index].score, 12);
  }
}

function rankedSingleChunkEntries(count: number): VectorEntry[] {
  const ordered = Array.from({ length: count }, (_, index) => {
    const angle = index * 0.01;
    return entry(
      `ranked-${index}`,
      `Ranked/${String(count - index).padStart(3, "0")}.md`,
      [Math.cos(angle), Math.sin(angle)],
    );
  });
  return [
    ...ordered.filter((_item, index) => index % 2 === 0).reverse(),
    ...ordered.filter((_item, index) => index % 2 === 1),
  ];
}

describe("SemanticDiscoveryService document centroids", () => {
  it("preserves one-chunk and identical-chunk directions", () => {
    for (const sourceEntries of [
      [entry("source", "Source.md", [0.6, 0.8])],
      [
        entry("source-0", "Source.md", [0.6, 0.8], 0),
        entry("source-1", "Source.md", [0.6, 0.8], 1),
      ],
    ]) {
      const { service } = similarHarness([
        ...sourceEntries,
        entry("axis-x", "Axis X.md", [1, 0]),
        entry("axis-y", "Axis Y.md", [0, 1]),
      ]);
      const byPath = new Map(
        service.findSimilarNotes("Source.md").map((result) => [
          result.path,
          result.score,
        ]),
      );
      expect(byPath.get("Axis X.md")).toBeCloseTo(0.6, 6);
      expect(byPath.get("Axis Y.md")).toBeCloseTo(0.8, 6);
      expect([...byPath.values()].every(Number.isFinite)).toBe(true);
    }
  });

  it("L2-normalizes an eligible multi-chunk centroid", () => {
    const { service } = similarHarness([
      entry("source-0", "Source.md", [1, 0], 0),
      entry("source-1", "Source.md", [0, 1], 1),
      entry("axis-x", "Axis X.md", [1, 0]),
      entry("axis-y", "Axis Y.md", [0, 1]),
    ]);
    const byPath = new Map(
      service.findSimilarNotes("Source.md").map((result) => [
        result.path,
        result.score,
      ]),
    );
    const x = byPath.get("Axis X.md") as number;
    const y = byPath.get("Axis Y.md") as number;
    expect(x).toBeCloseTo(Math.SQRT1_2, 12);
    expect(y).toBeCloseTo(Math.SQRT1_2, 12);
    expect(Math.hypot(x, y)).toBeCloseTo(1, 12);
  });

  it("rejects exact cancellation as both source and destination", () => {
    const { service } = similarHarness([
      entry("opposite-0", "Opposite.md", [1, 0], 0),
      entry("opposite-1", "Opposite.md", [-1, 0], 1),
      entry("stable", "Stable.md", [1, 0]),
    ]);
    expect(service.findSimilarNotes("Opposite.md")).toEqual([]);
    expect(service.findSimilarNotes("Stable.md")).toEqual([]);
    expect(service.findPotentialDuplicates()).toEqual([]);
  });

  it("rejects positive and negative Float32 cancellation residuals through 1e-6", () => {
    // The 1e-5 mean-resultant floor is above component-level Float32 noise and
    // the aggregate cancellation noise expected in hundreds of dimensions.
    expect(MIN_DOCUMENT_COHERENCE).toBe(1e-5);
    for (const magnitude of [1e-9, 1e-8, 1e-7, 1e-6]) {
      const outcomes = [-magnitude, magnitude].map((residual) => {
        const { service } = similarHarness([
          entry("unstable-0", "Unstable.md", [1, 0], 0),
          entry(
            "unstable-1",
            "Unstable.md",
            unitVector([-1, residual]),
            1,
          ),
          entry("stable", "Stable.md", [0, 1]),
        ]);
        return {
          source: service.findSimilarNotes("Unstable.md"),
          destination: service.findSimilarNotes("Stable.md"),
          duplicates: service.findPotentialDuplicates(),
        };
      });
      expect(outcomes).toEqual([
        { source: [], destination: [], duplicates: [] },
        { source: [], destination: [], duplicates: [] },
      ]);
    }
  });

  it("keeps a clearly coherent multi-chunk representation finite and unit length", () => {
    const { service } = similarHarness([
      entry("source-0", "Source.md", [1, 0], 0),
      entry("source-1", "Source.md", [0.8, 0.6], 1),
      entry("axis-x", "Axis X.md", [1, 0]),
      entry("axis-y", "Axis Y.md", [0, 1]),
    ]);
    const results = service.findSimilarNotes("Source.md");
    const byPath = new Map(results.map((result) => [result.path, result.score]));
    const expectedNorm = Math.hypot(1.8, 0.6);
    const x = byPath.get("Axis X.md") as number;
    const y = byPath.get("Axis Y.md") as number;
    expect(x).toBeCloseTo(1.8 / expectedNorm, 6);
    expect(y).toBeCloseTo(0.6 / expectedNorm, 6);
    expect(Math.hypot(x, y)).toBeCloseTo(1, 6);
    expect(results.every((result) => Number.isFinite(result.score))).toBe(true);
  });
});

describe("SemanticDiscoveryService similar notes", () => {
  it("excludes the source, ranks the closest document first, and groups chunks", () => {
    const { service, store } = similarHarness([
      entry("source-0", "Source.md", [1, 0], 0),
      entry("source-1", "Source.md", [1, 0], 1),
      entry("near-0", "Near.md", [0.98, 0.198997], 0),
      entry("near-1", "Near.md", [0.9, 0.43589], 1),
      entry("far", "Far.md", [0, 1]),
    ]);

    const results = service.findSimilarNotes("Source.md");

    expect(results.map((result) => result.path)).toEqual([
      "Near.md",
      "Far.md",
    ]);
    expect(results.some((result) => result.path === "Source.md")).toBe(false);
    expect(results[0].matches.map((match) => match.id)).toEqual([
      "near-0",
      "near-1",
    ]);
    expect(store.search).not.toHaveBeenCalled();
  });

  it("uses path order as the deterministic score tie-break", () => {
    const { service } = similarHarness([
      entry("source", "Source.md", [1, 0]),
      entry("z", "z.md", [0, 1]),
      entry("upper", "A.md", [0, 1]),
      entry("lower", "a.md", [0, 1]),
    ]);
    expect(
      service.findSimilarNotes("Source.md").map((result) => result.path),
    ).toEqual(["A.md", "a.md", "z.md"]);
  });

  it("handles an empty index, absent source, one-document Vault, and short source", () => {
    expect(
      new SemanticDiscoveryService(new SnapshotStore([], 2), 2)
        .findSimilarNotes("Missing.md"),
    ).toEqual([]);

    const absent = similarHarness([entry("only", "Only.md", [1, 0])]);
    expect(() => absent.service.findSimilarNotes("Missing.md")).toThrow(
      SemanticSourceNotIndexedError,
    );
    expect(absent.service.findSimilarNotes("Only.md")).toEqual([]);

    const short = similarHarness([
      entry("short", "Short.md", [1, 0], 0, "TODO"),
      entry("other", "Other.md", [1, 0]),
    ]);
    expect(short.service.findSimilarNotes("Short.md")).toEqual([]);
  });

  it("keeps one coherent snapshot when indexing commits during the read", () => {
    const source = entry("source", "Source.md", [1, 0]);
    const oldNear = entry("near", "Near.md", [1, 0]);
    const oldFar = entry("far", "Far.md", [0, 1]);
    const { service, store } = similarHarness([source, oldNear, oldFar]);
    store.afterRead = () => {
      store.replace([
        source,
        entry("near", "Near.md", [0, 1]),
        entry("far", "Far.md", [1, 0]),
      ]);
    };

    expect(service.findSimilarNotes("Source.md")[0].path).toBe("Near.md");
    expect(service.findSimilarNotes("Source.md")[0].path).toBe("Far.md");
  });

  it("returns defensive chunk metadata with exact source lines", () => {
    const { service } = similarHarness([
      entry("source", "Source.md", [1, 0]),
      entry("target", "Folder/Target.md", [1, 0], 0, LONG_PREVIEW, 42),
    ]);
    const first = service.findSimilarNotes("Source.md");
    expect(first[0].matches[0].source.startLine).toBe(42);
    first[0].matches[0].headingPath[0] = "mutated";
    first[0].matches[0].source.startLine = 99;
    const second = service.findSimilarNotes("Source.md");
    expect(second[0].matches[0].headingPath[0]).toBe("Folder/Target");
    expect(second[0].matches[0].source.startLine).toBe(42);
  });
});

describe("SemanticDiscoveryService potential duplicates", () => {
  it("includes one canonical high-similarity pair without A-A or B-A", () => {
    const { service } = similarHarness([
      entry("a", "A.md", [1, 0]),
      entry("b", "B.md", [0.98, 0.198997]),
      entry("c", "C.md", [0, 1]),
    ]);
    const pairs = service.findPotentialDuplicates();
    expect(pairs.map((pair) => [pair.leftPath, pair.rightPath])).toEqual([
      ["A.md", "B.md"],
    ]);
    expect(pairs[0].leftMatches[0].path).toBe("A.md");
    expect(pairs[0].rightMatches[0].path).toBe("B.md");
  });

  it("excludes below-threshold pairs and includes the exact boundary", () => {
    const belowStore = new SnapshotStore([
      entry("a", "A.md", [1, 0]),
      entry("b", "B.md", [0.9, 0.43589]),
    ]);
    expect(
      new SemanticDiscoveryService(belowStore, 2).findPotentialDuplicates(),
    ).toEqual([]);

    const boundaryStore = new SnapshotStore([
      entry("a", "A.md", [1, 0]),
      entry("b", "B.md", [1, 0]),
    ]);
    expect(
      new SemanticDiscoveryService(boundaryStore, 2, 1)
        .findPotentialDuplicates()
        .map((pair) => pair.score),
    ).toEqual([1]);
  });

  it("applies the inclusive threshold to the computed Float32 score", () => {
    const target = DEFAULT_DUPLICATE_THRESHOLD;
    const store = new SnapshotStore([
      entry("a", "A.md", [1, 0]),
      entry(
        "b",
        "B.md",
        unitVector([target, Math.sqrt(1 - target * target)]),
      ),
    ]);
    const measured = new SemanticDiscoveryService(store, 2, -1)
      .findPotentialDuplicates()[0].score;
    const defaultThresholdResult = new SemanticDiscoveryService(store, 2)
      .findPotentialDuplicates();

    expect(defaultThresholdResult.length === 1).toBe(
      measured >= DEFAULT_DUPLICATE_THRESHOLD,
    );
    expect(
      new SemanticDiscoveryService(store, 2, measured)
        .findPotentialDuplicates(),
    ).toHaveLength(1);
  });

  it("sorts equal-score pairs deterministically by canonical paths", () => {
    const store = new SnapshotStore([
      entry("z", "z.md", [1, 0]),
      entry("a", "A.md", [1, 0]),
      entry("b", "B.md", [1, 0]),
    ]);
    const pairs = new SemanticDiscoveryService(store, 2, 0.999)
      .findPotentialDuplicates();
    expect(pairs.map((pair) => [pair.leftPath, pair.rightPath])).toEqual([
      ["A.md", "B.md"],
      ["A.md", "z.md"],
      ["B.md", "z.md"],
    ]);
  });

  it("applies the exact short-note eligibility boundary", () => {
    const minimum = "x".repeat(MIN_DOCUMENT_MEANINGFUL_CHARACTERS);
    const below = "x".repeat(MIN_DOCUMENT_MEANINGFUL_CHARACTERS - 1);
    const store = new SnapshotStore([
      entry("eligible-a", "Eligible A.md", [1, 0], 0, minimum),
      entry("eligible-b", "Eligible B.md", [1, 0], 0, minimum),
      entry("short", "Short.md", [1, 0], 0, below),
    ]);
    expect(
      new SemanticDiscoveryService(store, 2, 1)
        .findPotentialDuplicates()
        .map((pair) => [pair.leftPath, pair.rightPath]),
    ).toEqual([["Eligible A.md", "Eligible B.md"]]);
  });

  it("builds one representation per multi-chunk document", () => {
    const store = new SnapshotStore([
      entry("a-0", "A.md", [1, 0], 0),
      entry("a-1", "A.md", [0, 1], 1),
      entry("b-0", "B.md", [1, 0], 0),
      entry("b-1", "B.md", [0, 1], 1),
    ]);
    const pairs = new SemanticDiscoveryService(store, 2, 0.999)
      .findPotentialDuplicates();
    expect(pairs).toHaveLength(1);
    expect(pairs[0].score).toBeCloseTo(1, 12);
    expect(pairs[0].leftMatches).toHaveLength(2);
    expect(pairs[0].rightMatches).toHaveLength(2);
  });

  it("sorts three distinct qualifying scores from highest to lowest", () => {
    const store = new SnapshotStore([
      entry("z", "Z.md", [1, 0]),
      entry("a", "A.md", [Math.cos(0.2), Math.sin(0.2)]),
      entry("m", "M.md", [Math.cos(0.05), Math.sin(0.05)]),
    ]);
    const pairs = new SemanticDiscoveryService(store, 2, 0.95)
      .findPotentialDuplicates({ limit: 3 });
    expect(pairs.map(({ leftPath, rightPath }) => [leftPath, rightPath]))
      .toEqual([
        ["M.md", "Z.md"],
        ["A.md", "M.md"],
        ["A.md", "Z.md"],
      ]);
    expect(pairs[0].score).toBeGreaterThan(pairs[1].score);
    expect(pairs[1].score).toBeGreaterThan(pairs[2].score);
  });

  it.each([
    { name: "fewer than K", count: 5, limit: 20 },
    { name: "exactly K", count: 6, limit: 15 },
    { name: "more than K", count: 20, limit: 37 },
    { name: "K equals one", count: 8, limit: 1 },
  ])("matches the full-sort reference with $name", ({ count, limit }) => {
    const entries = rankedSingleChunkEntries(count);
    const expected = referenceSingleChunkDuplicates(entries, 0.95, limit);
    const actual = projectDuplicatePairs(
      new SemanticDiscoveryService(new SnapshotStore(entries), 2, 0.95)
        .findPotentialDuplicates({ limit }),
    );
    expectEquivalentPairs(actual, expected);
  });

  it("matches the global full-sort top 100 with score/path order independent of insertion", () => {
    const entries = rankedSingleChunkEntries(20);
    const expected = referenceSingleChunkDuplicates(
      entries,
      DEFAULT_DUPLICATE_THRESHOLD,
      DEFAULT_DUPLICATE_PAIR_LIMIT,
    );
    const fullReference = referenceSingleChunkDuplicates(
      entries,
      DEFAULT_DUPLICATE_THRESHOLD,
      500,
    );
    const forward = projectDuplicatePairs(
      new SemanticDiscoveryService(new SnapshotStore(entries), 2)
        .findPotentialDuplicates(),
    );
    const shuffled = projectDuplicatePairs(
      new SemanticDiscoveryService(new SnapshotStore([...entries].reverse()), 2)
        .findPotentialDuplicates(),
    );

    expect(fullReference.length).toBeGreaterThan(DEFAULT_DUPLICATE_PAIR_LIMIT);
    expect(forward).toHaveLength(DEFAULT_DUPLICATE_PAIR_LIMIT);
    expectEquivalentPairs(forward, expected);
    expectEquivalentPairs(shuffled, expected);
    expect(forward.at(-1)?.score ?? -1).toBeGreaterThanOrEqual(
      fullReference[DEFAULT_DUPLICATE_PAIR_LIMIT].score,
    );
    for (let index = 1; index < forward.length; index++) {
      expect(compareReferencePairs(forward[index - 1], forward[index]))
        .toBeLessThanOrEqual(0);
    }
  });

  it("keeps equal-score top-K selection deterministic", () => {
    const entries = Array.from({ length: 12 }, (_, index) =>
      entry(
        `equal-${index}`,
        `Equal/${String(12 - index).padStart(2, "0")}.md`,
        [1, 0],
      ),
    );
    const expected = referenceSingleChunkDuplicates(entries, 1, 20);
    for (const order of [entries, [...entries].reverse()]) {
      const actual = projectDuplicatePairs(
        new SemanticDiscoveryService(new SnapshotStore(order), 2, 1)
          .findPotentialDuplicates({ limit: 20 }),
      );
      expectEquivalentPairs(actual, expected);
    }
  });

  it("returns empty for zero or one eligible document", () => {
    expect(
      new SemanticDiscoveryService(new SnapshotStore([], 2), 2)
        .findPotentialDuplicates(),
    ).toEqual([]);
    const one = new SnapshotStore([entry("a", "A.md", [1, 0])]);
    expect(
      new SemanticDiscoveryService(one, 2).findPotentialDuplicates(),
    ).toEqual([]);
  });

  it("is read-only and does not advance the store generation", () => {
    const store = new SnapshotStore([
      entry("a", "A.md", [1, 0]),
      entry("b", "B.md", [1, 0]),
    ]);
    const generation = store.getStats().generation;
    new SemanticDiscoveryService(store, 2).findPotentialDuplicates();
    expect(store.getStats().generation).toBe(generation);
    expect(store.mutations).toBe(0);
    expect(store.search).not.toHaveBeenCalled();
  });

  it("handles 500 synthetic documents with bounded output", () => {
    const dimensions = 8;
    const entries = Array.from({ length: 500 }, (_, index) => {
      const vector = Array.from({ length: dimensions }, () => 0);
      vector[index % dimensions] = 1;
      return entry(`doc-${index}`, `Notes/${index}.md`, vector);
    });
    const store = new SnapshotStore(entries, dimensions);
    const service = new SemanticDiscoveryService(store, dimensions, 1);
    const started = Date.now();
    const results = service.findPotentialDuplicates();
    const elapsed = Date.now() - started;

    expect(results).toHaveLength(DEFAULT_DUPLICATE_PAIR_LIMIT);
    expect(elapsed).toBeLessThan(5000);
    expect(store.snapshotReads).toBe(1);
  });
});

describe("SemanticDiscoveryService production boundaries", () => {
  it("has no provider, Obsidian, Node, network, or mutable-index dependency", () => {
    const source = readFileSync(
      new URL("./semanticDiscoveryService.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/from ["']obsidian["']/u);
    expect(source).not.toMatch(/from ["']node:/u);
    expect(source).not.toContain("EmbeddingProvider");
    expect(source).not.toContain("requestUrl");
    expect(source).not.toContain("applyChanges(");
    expect(source).not.toContain(".clear(");
  });
});


describe("indexed document catalog", () => {
  it("deduplicates chunk paths in canonical order without similarity or mutation", () => {
    const { store, service } = similarHarness([entry("c", "C.md", [1, 0]), entry("b1", "B.md", [0, 1]),
      entry("a1", "A.md", [1, 0]), entry("b2", "B.md", [0, 1]), entry("a2", "A.md", [1, 0])]);
    expect(service.listIndexedPaths()).toEqual(["A.md", "B.md", "C.md"]);
    expect(store.snapshotReads).toBe(1); expect(store.mutations).toBe(0); expect(store.search).not.toHaveBeenCalled();
  });
  it("validates the same snapshot structure for catalog and discovery", () => {
    const { store, service } = similarHarness([entry("a", "A.md", [1, 0])]);
    const snapshot = store.readSnapshot(); snapshot.vectors = new Float32Array(1);
    vi.spyOn(store, "readSnapshot").mockReturnValue(snapshot);
    expect(() => service.listIndexedPaths()).toThrow("invalid discovery snapshot");
    expect(() => service.findSimilarNotes("A.md")).toThrow("invalid discovery snapshot");
  });
});

describe("Semantic focus analysis", () => {
  it("reads one snapshot and reuses multi-chunk centroids for exact selected-to-all scores, including beyond top five", () => {
    const f = similarHarness([entry("a1", "A.md", [1, 0]), entry("a2", "A.md", [0, 1], 1),
      entry("b", "B.md", [1, 0]), entry("c", "C.md", [-1, 0]),
      ...Array.from({ length: 8 }, (_, i) => entry(`n${i}`, `N${i}.md`, [0, 1])),
      entry("short", "Short.md", [1, 0], 0, "short"), entry("x1", "Cancelled.md", [1, 0]), entry("x2", "Cancelled.md", [-1, 0], 1)]);
    const global = vi.spyOn(f.service, "analyzeGlobalSemanticMap"), nearby = vi.spyOn(f.service, "findSimilarNotes");
    const focus = f.service.analyzeSemanticFocus("A.md")!;
    expect(f.store.snapshotReads).toBe(1); expect(f.store.mutations).toBe(0);
    expect(global).not.toHaveBeenCalled(); expect(nearby).not.toHaveBeenCalled();
    expect(focus.scores).toHaveLength(11);
    expect(focus.scores.find(n => n.path === "A.md")!.score).toBeCloseTo(1, 12);
    expect(focus.scores.find(n => n.path === "B.md")!.score).toBeCloseTo(1 / Math.sqrt(2), 12);
    expect(focus.scores.find(n => n.path === "C.md")!.score).toBeCloseTo(-1 / Math.sqrt(2), 12);
    for (const neighbor of f.service.findSimilarNotes("A.md")) expect(focus.scores.find(n => n.path === neighbor.path)!.score).toBe(neighbor.score);
    expect(Object.keys(focus)).toEqual(["path", "scores"]);
    expect(Object.keys(focus.scores[0])).toEqual(["path", "score"]);
    for (const path of ["Short.md", "Cancelled.md", "Missing.md"]) expect(f.service.analyzeSemanticFocus(path)).toBeUndefined();
    expect(() => f.service.analyzeSemanticFocus("../bad.md")).toThrow();
  });
  it("keeps the exact 500-document cap", () => {
    const rows = Array.from({ length: 501 }, (_, i) => entry(`n${i}`, `N${i}.md`, [1, 0]));
    expect(similarHarness(rows.slice(0, 500)).service.analyzeSemanticFocus("N0.md")!.scores).toHaveLength(500);
    expect(similarHarness(rows).service.analyzeSemanticFocus("N0.md")).toBeUndefined();
  });
  it("rejects an invalid vector snapshot", () => {
    const f = similarHarness([entry("a", "A.md", [1, 0])]);
    const snapshot = f.store.readSnapshot(); snapshot.vectors = new Float32Array(1);
    vi.spyOn(f.store, "readSnapshot").mockReturnValue(snapshot);
    expect(() => f.service.analyzeSemanticFocus("A.md")).toThrow("invalid discovery snapshot");
  });
});

describe("Global Semantic Map exact analysis", () => {
  it("uses the known normalized mean direction and identical Neighborhood centroids/scores", async () => {
    const f = similarHarness([entry("a", "A.md", [1, 0]), entry("b", "B.md", [0, 1]), entry("c", "C.md", [1, 0]),
      entry("empty", "Empty.md", [1, 0], 0, "short"), entry("cancel1", "Cancel.md", [1, 0]), entry("cancel2", "Cancel.md", [-1, 0], 1)]);
    const result = await f.service.analyzeGlobalSemanticMap();
    expect(result.state).toBe("ready"); if (result.state !== "ready") throw Error("Expected map");
    expect(result.indexedNoteCount).toBe(5); expect(result.mappedNoteCount).toBe(3);
    expect(result.nodes.map((node) => node.coreSimilarity)).toEqual([2 / Math.sqrt(5), 1 / Math.sqrt(5), 2 / Math.sqrt(5)]);
    expect(f.store.snapshotReads).toBe(1); expect(f.store.mutations).toBe(0);
    for (const node of result.nodes) {
      const neighbors = f.service.findSimilarNotes(node.path).map(({ path, score }) => ({ path, score }));
      expect(node.neighbors).toEqual(neighbors);
      expect(node.semanticConnectedness).toBe(neighbors.reduce((sum, item) => sum + item.score, 0) / neighbors.length);
    }
    expect(result.nodes[0].semanticConnectedness).toBe(0.5);
    expect(result.edges).toEqual([{ left: "A.md", right: "B.md", score: 0, mutual: true },
      { left: "A.md", right: "C.md", score: 1, mutual: true }, { left: "B.md", right: "C.md", score: 0, mutual: true }]);
    expect(await f.service.analyzeGlobalSemanticMap()).toEqual(result);
  });
  it("keeps exact available top-5, canonical ties, negative scores and union/mutual edges without thresholds", async () => {
    const entries = Array.from({ length: 9 }, (_, i) => entry(String(i), `${i}.md`, unitVector([Math.cos(i), Math.sin(i), 0.15])));
    entries.push(entry("tie", "Tie.md", [...entries[0].vector]));
    const f = similarHarness(entries); const progress = vi.fn();
    const result = await f.service.analyzeGlobalSemanticMap({ onProgress: progress });
    if (result.state !== "ready") throw Error("Expected map");
    for (const node of result.nodes) {
      expect(node.neighbors).toEqual(f.service.findSimilarNotes(node.path, { limit: 5 }).map(({ path, score }) => ({ path, score })));
      expect(node.neighbors).toHaveLength(5); expect(node.neighbors.some((n) => n.path === node.path)).toBe(false);
      expect(node.semanticConnectedness).toBeCloseTo(node.neighbors.reduce((sum, n) => sum + n.score, 0) / 5, 12);
    }
    const ranks = new Map(result.nodes.map((node) => [node.path, node.neighbors]));
    for (const edge of result.edges) {
      const a = ranks.get(edge.left)!.some((n) => n.path === edge.right), b = ranks.get(edge.right)!.some((n) => n.path === edge.left);
      expect(a || b).toBe(true); expect(edge.mutual).toBe(a && b); expect(edge.left < edge.right).toBe(true);
    }
    expect(result.edges.some((edge) => !edge.mutual)).toBe(true);
    expect(new Set(result.edges.map((e) => JSON.stringify([e.left, e.right]))).size).toBe(result.edges.length);
    expect(result.edges.length).toBeLessThanOrEqual(result.nodes.length * 5);
    expect(progress).toHaveBeenLastCalledWith({ completedPairs: 45, totalPairs: 45 });
    expect(JSON.stringify(result)).not.toMatch(/vectors|preview|headingPath|contentHash/);
    const tied = similarHarness(Array.from({ length: 8 }, (_, i) => entry(String(i), `${i}.md`, [1, 0])));
    const ties = await tied.service.analyzeGlobalSemanticMap(); if (ties.state !== "ready") throw Error();
    expect(ties.nodes[7].neighbors.map((n) => n.path)).toEqual(["0.md", "1.md", "2.md", "3.md", "4.md"]);
  });
  it("normalizes multichunk centroids using the existing definition", async () => {
    const f = similarHarness([entry("a0", "A.md", [1, 0]), entry("a1", "A.md", [0, 1], 1), entry("b", "B.md", [-1, 0])]);
    const result = await f.service.analyzeGlobalSemanticMap(); if (result.state !== "ready") throw Error();
    expect(result.nodes[0].neighbors[0].score).toBeCloseTo(-Math.SQRT1_2);
    expect(result.nodes[0].neighbors[0].score).toBe(f.service.findSimilarNotes("A.md")[0].score);
  });
  it("handles ill-conditioned cores and singletons without fabricated values", async () => {
    const cancelled = similarHarness([entry("a", "A.md", [1, 0]), entry("b", "B.md", [-1, 0])]);
    expect(await cancelled.service.analyzeGlobalSemanticMap()).toEqual({ state: "core-unavailable", indexedNoteCount: 2, mappedNoteCount: 2 });
    const one = await similarHarness([entry("a", "A.md", [1, 0])]).service.analyzeGlobalSemanticMap();
    if (one.state !== "ready") throw Error();
    expect(one.nodes[0]).toMatchObject({ coreSimilarity: 1, semanticConnectedness: null, neighbors: [] }); expect(one.edges).toEqual([]);
    expect(await similarHarness([]).service.analyzeGlobalSemanticMap()).toEqual({ state: "core-unavailable", indexedNoteCount: 0, mappedNoteCount: 0 });
  });
  it("supports the exact cap, refuses cap+1 without comparing or sampling, and supports cancellation", async () => {
    const { GLOBAL_SEMANTIC_DOCUMENT_CAP: cap } = await import("./globalSemanticMap");
    const rows = Array.from({ length: cap + 1 }, (_, i) => entry(String(i), `${String(i).padStart(4, "0")}.md`, [1, 0]));
    const progress = vi.fn(); const f = similarHarness(rows.slice(0, cap));
    const result = await f.service.analyzeGlobalSemanticMap({ onProgress: progress });
    expect(result.state).toBe("ready"); expect(result.mappedNoteCount).toBe(cap);
    expect(progress).toHaveBeenLastCalledWith({ completedPairs: cap * (cap - 1) / 2, totalPairs: cap * (cap - 1) / 2 });
    progress.mockClear();
    expect(await similarHarness(rows).service.analyzeGlobalSemanticMap({ onProgress: progress })).toEqual({ state: "too-large", indexedNoteCount: cap + 1, mappedNoteCount: cap + 1 });
    expect(progress).not.toHaveBeenCalled();
    const abort = new AbortController();
    await expect(f.service.analyzeGlobalSemanticMap({ signal: abort.signal, onProgress: () => abort.abort() })).rejects.toThrow("cancelled");
    expect(f.store.mutations).toBe(0);
  });
});


describe("explicit scoped global map compatibility", () => {
  it.each([0, 1, 150, 500, 501])("caps %i eligible documents before any pairwise work", async count => {
    const f = similarHarness(Array.from({ length: count }, (_, i) => entry(`s${i}`, `Scope/N${String(i).padStart(4, "0")}.md`, [1, i / 1000])));
    const progress = vi.fn();
    const result = await f.service.analyzeGlobalSemanticMap({ paths: f.service.listIndexedPaths(), onProgress: progress });
    expect(result.state).toBe(count > 500 ? "too-large" : count === 0 ? "core-unavailable" : "ready");
    expect(result.mappedNoteCount).toBe(count);
    if (count > 500 || count === 0) expect(progress).not.toHaveBeenCalled();
    else expect(progress).toHaveBeenLastCalledWith({ completedPairs: count * (count - 1) / 2, totalPairs: count * (count - 1) / 2 });
    expect(f.store.mutations).toBe(0);
  });
  it("recalculates within a real subset of 501, preserving unscoped ranking and eligibility", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => entry(`s${i}`, `${i < 150 ? "Scope" : "Scope-old"}/N${i}.md`, [1, i / 800]));
    rows.push(entry("short", "Scope/Short.md", [1, 0], 0, "tiny"));
    const f = similarHarness(rows), chosen = rows.filter(row => row.path.startsWith("Scope/"));
    const progress = vi.fn();
    const globalBefore = await f.service.analyzeGlobalSemanticMap(); expect(globalBefore.state).toBe("too-large");
    const scoped = await f.service.analyzeGlobalSemanticMap({ paths: chosen.map(row => row.path), onProgress: progress });
    expect(scoped).toEqual(await similarHarness(chosen).service.analyzeGlobalSemanticMap());
    expect(scoped).toMatchObject({ state: "ready", indexedNoteCount: 151, mappedNoteCount: 150 });
    expect(progress).toHaveBeenLastCalledWith({ completedPairs: 11175, totalPairs: 11175 });
    expect(await f.service.analyzeGlobalSemanticMap()).toEqual(globalBefore);
    expect(f.store.mutations).toBe(0);
  });
});
