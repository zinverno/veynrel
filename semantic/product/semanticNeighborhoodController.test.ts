import { describe, expect, it, vi } from "vitest";
import type { SemanticDocumentSimilarity, SemanticIndexState } from "../types";
import { SemanticNeighborhoodController } from "./semanticNeighborhoodController";
import { neighborhoodRevision, projectNeighborhood } from "./semanticNeighborhoodModel";

const ready: SemanticIndexState = { kind: "ready", vectorCount: 12, vectorGeneration: 1, dimensions: 3,
  provider: "ollama", providerLabel: "Ollama", model: "synthetic", configurationRevision: 0, runtimeRevision: 1 };
function result(path = "B.md", score = 0.91): SemanticDocumentSimilarity {
  return { path, score, matches: [0, 1, 2].map((ordinal) => ({ id: `${path}-${ordinal}`, path, score: score - ordinal * 0.01,
    headingPath: ["Heading", `Section ${ordinal}`], ordinal, contentHash: "hash", preview: "<img src=x onerror=alert(1)> stored preview",
    source: { startLine: ordinal, endLine: ordinal + 1, startOffset: ordinal * 10, endOffset: ordinal * 10 + 9 } })) };
}
function fixture() {
  let state = { ...ready };
  const listeners = new Set<() => void>();
  const engine = { getCachedIndexState: () => state, subscribeStatus: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
    listIndexedPaths: vi.fn(async (): Promise<readonly string[]> => ["A.md", "B.md", "C.md", "D.md"]),
    findSimilarNotes: vi.fn(async (_path: string) => [result(), result("C.md", 0.82), result("D.md", 0.64)]) };
  const port = new SemanticNeighborhoodController(engine);
  return { port, engine, listeners, update: (patch: Partial<SemanticIndexState>) => { state = { ...state, ...patch }; for (const l of listeners) l(); } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe("Semantic Neighborhood session controller", () => {
  it("stays passive, prepares once, searches canonical indexed paths locally, and retains exact frozen evidence", async () => {
    const f = fixture(); const listener = vi.fn(); f.port.subscribe(listener);
    expect(f.port.getSnapshot().state).toBe("idle");
    expect(f.port.searchSources("A").paths).toEqual([]);
    expect(f.engine.listIndexedPaths).not.toHaveBeenCalled(); expect(f.engine.findSimilarNotes).not.toHaveBeenCalled();
    f.engine.listIndexedPaths.mockResolvedValue(["D.md", "C.md", "B.md", "A.md"]);
    await f.port.prepare(); await f.port.prepare();
    expect(f.engine.listIndexedPaths).toHaveBeenCalledOnce();
    expect(f.port.searchSources("  b.MD  ")).toEqual({ paths: ["B.md"], total: 1 });
    await f.port.load("A.md");
    const map = f.port.getSnapshot().map!;
    expect(map.neighbors.map((n) => [n.path, n.similarity])).toEqual([["B.md", 0.91], ["C.md", 0.82], ["D.md", 0.64]]);
    expect(map.edges).toEqual([0.91, 0.82, 0.64].map((score, i) => ({ source: "A.md", target: ["B.md", "C.md", "D.md"][i], score })));
    expect(map.source.similarity).toBeUndefined(); expect(map.source.role).toBe("source");
    expect(map.neighbors[0].evidence).toHaveLength(3);
    expect(map.neighbors[0].evidence[1]).toEqual({ headingPath: ["Heading", "Section 1"], preview: "<img src=x onerror=alert(1)> stored preview", startLine: 1, endLine: 2, score: 0.9 });
    expect(JSON.stringify(map)).not.toContain("contentHash");
    expect(Object.isFrozen(map)).toBe(true); expect(Object.isFrozen(map.neighbors[0].evidence[0].headingPath)).toBe(true);
    f.port.chooseAnother(); expect(f.port.getSnapshot().state).toBe("choosing");
    expect(f.engine.listIndexedPaths).toHaveBeenCalledOnce(); f.port.dispose(); expect(f.listeners.size).toBe(0);
  });
  it("bounds local substring results to 20 and counts all matches", async () => {
    const f = fixture(); f.engine.listIndexedPaths.mockResolvedValue(Array.from({ length: 30 }, (_, i) => `Folder/Note ${String(i).padStart(2, "0")}.md`));
    await f.port.prepare(); expect(f.port.searchSources(" FOLDER/nOtE ")).toEqual({ paths: Array.from({ length: 20 }, (_, i) => `Folder/Note ${String(i).padStart(2, "0")}.md`), total: 30 });
    expect(f.engine.findSimilarNotes).not.toHaveBeenCalled(); f.port.dispose();
  });
  it.each(["vectorGeneration", "vectorCount", "dimensions", "provider", "model", "configurationRevision", "runtimeRevision"] as const)("marks %s changes stale without recomputing", async (field) => {
    const f = fixture(); await f.port.load("A.md");
    f.update({ [field]: typeof ready[field] === "number" ? Number(ready[field]) + 1 : "other" });
    expect(f.port.getSnapshot().state).toBe("stale"); expect(f.engine.findSimilarNotes).toHaveBeenCalledTimes(1);
    await f.port.refresh(); expect(f.port.getSnapshot().state).toBe("ready"); expect(f.engine.findSimilarNotes).toHaveBeenCalledTimes(2); f.port.dispose();
  });
  it("coalesces pending loads and discards a changed generation before publication", async () => {
    const f = fixture(); await f.port.prepare(); const held = deferred<SemanticDocumentSimilarity[]>();
    f.engine.findSimilarNotes.mockReturnValueOnce(held.promise);
    const load = f.port.load("A.md"); expect(f.port.load("B.md")).toBe(load); expect(f.port.refresh()).toBe(load);
    await Promise.resolve(); f.update({ vectorGeneration: 2 }); held.resolve([result()]); await load;
    expect(f.port.getSnapshot()).toMatchObject({ state: "stale", reason: "changed", busy: false });
    expect(f.port.getSnapshot().map).toBeUndefined();
    await f.port.refresh(); expect(f.port.getSnapshot().state).toBe("ready"); f.port.dispose();
  });
  it("checks the revision without relying on subscription delivery", async () => {
    const f = fixture(); await f.port.prepare(); f.listeners.clear();
    f.engine.findSimilarNotes.mockImplementationOnce(async () => { f.update({ vectorGeneration: 2 }); return [result()]; });
    await f.port.load("A.md"); expect(f.port.getSnapshot()).toMatchObject({ state: "stale", reason: "changed" }); f.port.dispose();
  });
  it("discards a stale catalog and prevents publication/listener leaks after disposal", async () => {
    const f = fixture(); const held = deferred<readonly string[]>(); f.engine.listIndexedPaths.mockReturnValueOnce(held.promise);
    const listener = vi.fn(); f.port.subscribe(listener); const pending = f.port.prepare(); await Promise.resolve();
    f.port.dispose(); const snapshot = f.port.getSnapshot(); const count = listener.mock.calls.length;
    held.resolve(["A.md"]); await pending; expect(f.port.getSnapshot()).toBe(snapshot); expect(listener).toHaveBeenCalledTimes(count); expect(f.listeners.size).toBe(0);
  });
  it("rejects a catalog revision race and a similarity result that finishes after disposal", async () => {
    const f = fixture(); const catalog = deferred<readonly string[]>();
    f.engine.listIndexedPaths.mockReturnValueOnce(catalog.promise);
    const preparing = f.port.prepare(); await Promise.resolve(); f.update({ vectorGeneration: 2 });
    catalog.resolve(["A.md", "B.md"]); await preparing;
    expect(f.port.getSnapshot()).toMatchObject({ state: "stale", reason: "changed" });
    expect(f.port.searchSources("").paths).toEqual([]);
    await f.port.prepare();
    const result = deferred<SemanticDocumentSimilarity[]>(); f.engine.findSimilarNotes.mockReturnValueOnce(result.promise);
    const pending = f.port.load("A.md"); await Promise.resolve(); f.port.dispose(); const before = f.port.getSnapshot();
    result.resolve([]); await pending; expect(f.port.getSnapshot()).toBe(before); expect(before.map).toBeUndefined();
  });
  it("allows one explicit recenter, handles empty neighborhoods and removed sources", async () => {
    const f = fixture(); await f.port.load("A.md");
    f.engine.findSimilarNotes.mockResolvedValueOnce([]); await f.port.load("B.md");
    expect(f.port.getSnapshot().map).toMatchObject({ source: { path: "B.md" }, neighbors: [], edges: [] });
    expect(f.engine.findSimilarNotes.mock.calls.map(([path]) => path)).toEqual(["A.md", "B.md"]);
    f.update({ vectorGeneration: 2 }); f.engine.listIndexedPaths.mockResolvedValue(["A.md"]); await f.port.refresh();
    expect(f.port.getSnapshot()).toMatchObject({ state: "error", reason: "source-removed" });
    f.port.chooseAnother(); expect(f.port.searchSources("").paths).toEqual(["A.md"]); f.port.dispose();
  });
  it.each(["disabled", "not-initialized", "incompatible", "indexing"] as const)("does not treat %s as current or automatically recover", async (kind) => {
    const f = fixture(); await f.port.load("A.md"); f.update({ kind });
    expect(f.port.getSnapshot().state).toBe(kind === "indexing" ? "stale" : "unavailable");
    await f.port.refresh(); expect(f.engine.findSimilarNotes).toHaveBeenCalledTimes(1); f.port.dispose();
  });
  it("bounds generic errors and rejects malformed catalogs", async () => {
    const f = fixture(); f.engine.listIndexedPaths.mockRejectedValueOnce(new Error("sk-secret provider response"));
    await f.port.prepare(); expect(f.port.getSnapshot()).toMatchObject({ state: "error", reason: "failed" });
    expect(JSON.stringify(f.port.getSnapshot())).not.toContain("secret");
    f.engine.listIndexedPaths.mockResolvedValueOnce(["A.md", "../bad.md"]); await f.port.prepare();
    expect(f.port.getSnapshot()).toMatchObject({ state: "error", reason: "invalid" }); f.port.dispose();
  });
});

describe("immutable semantic projection rejects entire malformed results", () => {
  const malformed: Array<[string, (r: SemanticDocumentSimilarity[]) => void]> = [
    ...[NaN, Infinity, 1.01, -1.01].map((value): [string, (r: SemanticDocumentSimilarity[]) => void] => [String(value), (r) => { r[0].score = value; }]),
    ["duplicate", (r) => { r.push(result()); }], ["source", (r) => { r[0].path = "A.md"; }],
    ["path", (r) => { r[0].path = "../B.md"; }], ["unknown", (r) => { r[0].path = "Not indexed.md"; }],
    ["too many", (r) => { r.push(...Array.from({ length: 10 }, () => result())); }],
    ["evidence path", (r) => { r[0].matches[0].path = "C.md"; }],
    ["evidence score", (r) => { r[0].matches[0].score = NaN; }],
    ["evidence range", (r) => { r[0].matches[0].source.startLine = -1; }],
    ["evidence heading", (r) => { r[0].matches[0].headingPath = [null as never]; }],
    ["evidence preview", (r) => { r[0].matches[0].preview = {} as never; }],
    ["evidence bound", (r) => { r[0].matches.push(r[0].matches[0]); }],
    ["sparse", (r) => { r.length = 2; }],
  ];
  it.each(malformed)("rejects %s", async (_name, corrupt) => {
    const f = fixture(); const rows = [result()]; corrupt(rows); f.engine.findSimilarNotes.mockResolvedValue(rows);
    await f.port.load("A.md"); expect(f.port.getSnapshot()).toMatchObject({ state: "error", reason: "invalid" });
    expect(f.port.getSnapshot().map).toBeUndefined(); f.port.dispose();
  });
  it("preserves negative cosine and copies the engine result", () => {
    const rows = [result("B.md", -0.3)]; const map = projectNeighborhood("A.md", rows, ["A.md", "B.md"], neighborhoodRevision(ready)!, 42);
    rows[0].matches[0].headingPath[0] = "changed";
    expect(map.neighbors[0].similarity).toBe(-0.3); expect(map.neighbors[0].evidence[0].headingPath[0]).toBe("Heading");
  });
});

describe("R06.2b independent neighborhood sessions", () => {
  it("is passive and cancelling a source request cannot publish over another window", async () => {
    const f=fixture(), other=f.port.createSession(), gate=deferred<SemanticDocumentSimilarity[]>();
    expect(f.engine.listIndexedPaths).not.toHaveBeenCalled();
    await f.port.prepare(); f.engine.findSimilarNotes.mockReturnValueOnce(gate.promise);
    const pending=f.port.load("A.md"); await Promise.resolve(); f.port.cancel();
    expect(f.port.getSnapshot()).toMatchObject({state:"idle",busy:false});
    await other.load("A.md"); const snapshot=other.getSnapshot(); gate.resolve([result()]); await pending;
    expect(f.port.getSnapshot().map).toBeUndefined(); expect(other.getSnapshot()).toBe(snapshot);
    f.port.dispose(); other.dispose(); expect(f.listeners.size).toBe(0);
  });
});
