import { describe, expect, it, vi } from "vitest";
import type { SemanticIndexState } from "../types";
import type { GlobalSemanticAnalysis, GlobalSemanticOptions, SemanticFocusAnalysis } from "../globalSemanticMap";
import { semanticIndexRevision } from "../semanticIndexRevision";
import { SemanticGlobalMapController } from "./semanticGlobalMapController";
import { projectGlobalSemanticMap } from "./semanticGlobalMapModel";

const ready: SemanticIndexState = { kind: "ready", vectorCount: 600, vectorGeneration: 1, dimensions: 3,
  provider: "ollama", providerLabel: "Ollama", model: "synthetic", configurationRevision: 0, runtimeRevision: 1 };
function analysis(size = 8) {
  const paths = Array.from({ length: size }, (_, i) => `Folder/Note ${String(i).padStart(2, "0")}.md`);
  const nodes = paths.map((path) => ({ path, coreSimilarity: 1, semanticConnectedness: Number(1),
    neighbors: paths.filter((p) => p !== path).slice(0, 5).map((p) => ({ path: p, score: 1 })) }));
  const edges = nodes.flatMap((a, i) => nodes.slice(i + 1).flatMap((b) => {
    const ab = a.neighbors.some((n) => n.path === b.path), ba = b.neighbors.some((n) => n.path === a.path);
    return ab || ba ? [{ left: a.path, right: b.path, score: 1, mutual: ab && ba }] : [];
  }));
  return { state: "ready" as const, indexedNoteCount: size + 2, mappedNoteCount: size, nodes, edges };
}
function fixture() {
  let state = { ...ready }; const listeners = new Set<() => void>();
  const engine = { getCachedIndexState: () => state, subscribeStatus: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
    analyzeSemanticFocus: vi.fn(async (path: string): Promise<SemanticFocusAnalysis | undefined> => ({ path, scores: analysis().nodes.map((node) => ({ path: node.path, score: node.path === path ? 1 : 0.4 })) })),
    analyzeGlobalSemanticMap: vi.fn(async (_options?: GlobalSemanticOptions): Promise<GlobalSemanticAnalysis> => analysis()) };
  const port = new SemanticGlobalMapController(engine);
  return { port, engine, listeners, update: (patch: Partial<SemanticIndexState>) => { state = { ...state, ...patch }; for (const l of listeners) l(); } };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }

describe("Global map session ownership", () => {
  it("is passive, caches across loads, searches only loaded data and freezes every public layer", async () => {
    const f = fixture(); expect(f.port.getSnapshot().state).toBe("idle"); expect(f.port.search("").total).toBe(0);
    expect(f.engine.analyzeGlobalSemanticMap).not.toHaveBeenCalled();
    f.engine.analyzeGlobalSemanticMap.mockResolvedValue(analysis(35)); await f.port.load(); await f.port.load();
    expect(f.engine.analyzeGlobalSemanticMap).toHaveBeenCalledOnce();
    expect(f.port.search(" FOLDER/nOtE ").nodes).toHaveLength(20); expect(f.port.search("Note 32").nodes[0].basename).toBe("Note 32");
    const map = f.port.getSnapshot().map!;
    for (const value of [map, map.revision, map.nodes, map.edges, map.nodes[0], map.nodes[0].neighbors, map.nodes[0].neighbors[0], map.edges[0]]) expect(Object.isFrozen(value)).toBe(true);
    f.port.dispose(); expect(f.listeners.size).toBe(0); expect(f.port.search("").total).toBe(0);
  });
  it.each(["vectorGeneration", "vectorCount", "dimensions", "provider", "model", "configurationRevision", "runtimeRevision"] as const)("invalidates %s without recomputing; explicit refresh owns R2", async (field) => {
    const f = fixture(); await f.port.load(); const first = f.port.getSnapshot().map;
    f.update({ [field]: typeof ready[field] === "number" ? Number(ready[field]) + 1 : "changed" });
    expect(f.port.getSnapshot().state).toBe("stale"); await f.port.load(); expect(f.engine.analyzeGlobalSemanticMap).toHaveBeenCalledOnce();
    expect(f.port.getSnapshot().map).toBe(first); await f.port.refresh();
    expect(f.port.getSnapshot().state).toBe("ready"); expect(f.port.getSnapshot().map?.revision[field]).not.toBe(first?.revision[field]); f.port.dispose();
  });
  it.each([true, false])("does not publish R1 after R2, even without status notification (%s)", async (notify) => {
    const f = fixture(); const gate = deferred<GlobalSemanticAnalysis>(); f.engine.analyzeGlobalSemanticMap.mockReturnValueOnce(gate.promise);
    const run = f.port.load(); expect(f.port.refresh()).toBe(run); await Promise.resolve();
    if (!notify) f.listeners.clear(); f.update({ vectorGeneration: 2 }); gate.resolve(analysis()); await run;
    expect(f.port.getSnapshot()).toMatchObject({ state: "stale", busy: false, reason: "changed" }); expect(f.port.getSnapshot().map).toBeUndefined();
    await f.port.refresh(); expect(f.port.getSnapshot().map?.revision.vectorGeneration).toBe(2); f.port.dispose();
  });
  it("aborts disposal and prevents late progress, publication and listener leaks", async () => {
    const f = fixture(); const gate = deferred<GlobalSemanticAnalysis>(); f.engine.analyzeGlobalSemanticMap.mockReturnValueOnce(gate.promise);
    const listener = vi.fn(); f.port.subscribe(listener); const run = f.port.load(); await Promise.resolve();
    const options = f.engine.analyzeGlobalSemanticMap.mock.calls[0][0]!;
    options.onProgress?.({ completedPairs: 10, totalPairs: 28 }); expect(f.port.getSnapshot().progress?.completedPairs).toBe(10);
    f.port.dispose(); const before = f.port.getSnapshot(), calls = listener.mock.calls.length;
    options.onProgress?.({ completedPairs: 28, totalPairs: 28 }); gate.resolve(analysis()); await run;
    expect(options.signal?.aborted).toBe(true); expect(f.port.getSnapshot()).toBe(before); expect(listener).toHaveBeenCalledTimes(calls); expect(f.listeners.size).toBe(0);
  });
  it("publishes controlled limits/core failure, hides raw errors, and refuses unavailable index", async () => {
    const f = fixture();
    for (const [state, count] of [["too-large", 501], ["core-unavailable", 8]] as const) {
      f.engine.analyzeGlobalSemanticMap.mockResolvedValueOnce({ state, indexedNoteCount: count, mappedNoteCount: count }); await f.port.refresh();
      expect(f.port.getSnapshot()).toMatchObject({ state: "unavailable", reason: state, mappedNoteCount: count }); expect(f.port.getSnapshot().map).toBeUndefined();
    }
    f.engine.analyzeGlobalSemanticMap.mockRejectedValueOnce(Error("secret transport details")); await f.port.refresh();
    expect(f.port.getSnapshot()).toMatchObject({ state: "error", reason: "failed" }); expect(JSON.stringify(f.port.getSnapshot())).not.toContain("secret");
    f.update({ kind: "disabled" }); await f.port.refresh(); expect(f.engine.analyzeGlobalSemanticMap).toHaveBeenCalledTimes(3); f.port.dispose();
  });
});

describe("Global map focus ownership", () => {
  const path = "Folder/Note 00.md";
  it("requires a loaded mapped note, freezes scores, keeps the global map, and resets locally", async () => {
    const f = fixture(); await f.port.focus(path); expect(f.engine.analyzeSemanticFocus).not.toHaveBeenCalled();
    await f.port.load(); const map = f.port.getSnapshot().map;
    await f.port.focus("Excluded.md"); expect(f.port.getSnapshot().focusError).toBe(true); expect(f.engine.analyzeSemanticFocus).not.toHaveBeenCalled();
    await f.port.focus(path); const focus = f.port.getSnapshot().focus!;
    expect(focus.path).toBe(path); expect(focus.scores).toHaveLength(8); expect(f.port.getSnapshot().map).toBe(map);
    for (const value of [focus, focus.scores, ...focus.scores]) expect(Object.isFrozen(value)).toBe(true);
    f.port.resetFocus(); expect(f.port.getSnapshot().focus).toBeUndefined(); expect(f.port.getSnapshot().map).toBe(map);
    expect(f.engine.analyzeSemanticFocus).toHaveBeenCalledOnce(); expect(f.engine.analyzeGlobalSemanticMap).toHaveBeenCalledOnce();
    await f.port.focus(path); await f.port.refresh(); expect(f.port.getSnapshot().focus).toBeUndefined(); f.port.dispose();
  });
  it.each(["vectorGeneration", "vectorCount", "dimensions", "provider", "model", "configurationRevision", "runtimeRevision", "kind"] as const)("marks map and focus stale on %s without computation", async field => {
    const f = fixture(); await f.port.load(); await f.port.focus(path); const before = f.port.getSnapshot();
    f.update({ [field]: typeof ready[field] === "number" ? Number(ready[field]) + 1 : field === "kind" ? "disabled" : "changed" });
    expect(f.port.getSnapshot()).toMatchObject({ state: "stale", map: before.map, focus: before.focus });
    await f.port.load(); await f.port.focus(path);
    expect(f.engine.analyzeSemanticFocus).toHaveBeenCalledOnce(); expect(f.engine.analyzeGlobalSemanticMap).toHaveBeenCalledOnce(); f.port.dispose();
  });
  it.each(["notified-revision", "silent-revision", "reset", "dispose"])("rejects late focus publication after %s", async action => {
    const f = fixture(); await f.port.load();
    const gate = deferred<SemanticFocusAnalysis>(); f.engine.analyzeSemanticFocus.mockReturnValueOnce(gate.promise);
    const run = f.port.focus(path); expect(f.port.focus(path)).toBe(run); await Promise.resolve();
    if (action === "silent-revision") f.listeners.clear();
    if (action.includes("revision")) f.update({ vectorGeneration: 2 });
    else if (action === "reset") f.port.resetFocus(); else f.port.dispose();
    const before = f.port.getSnapshot();
    gate.resolve({ path, scores: analysis().nodes.map(n => ({ path: n.path, score: 1 })) }); await run;
    expect(f.port.getSnapshot().focus).toBeUndefined();
    if (action === "dispose") { expect(f.port.getSnapshot()).toBe(before); expect(f.listeners.size).toBe(0); }
    else expect(f.port.getSnapshot()).toMatchObject({ state: action === "reset" ? "ready" : "stale", busy: false });
    expect(f.engine.analyzeGlobalSemanticMap).toHaveBeenCalledOnce(); f.port.dispose();
  });
  it("reset and a new focus own publication even while an old focus is pending", async () => {
    const f = fixture(); await f.port.load(); const gate = deferred<SemanticFocusAnalysis>();
    f.engine.analyzeSemanticFocus.mockReturnValueOnce(gate.promise); const old = f.port.focus(path); await Promise.resolve();
    f.port.resetFocus(); await f.port.focus("Folder/Note 01.md"); const snapshot = f.port.getSnapshot();
    gate.resolve({ path, scores: [] }); await old; expect(f.port.getSnapshot()).toBe(snapshot); f.port.dispose();
  });
  it.each(["missing", "duplicate", "unknown", "NaN", "range", "self", "source", "ineligible", "throw"])("rejects malformed focus (%s) without losing the current map/focus", async kind => {
    const f = fixture(); await f.port.load(); await f.port.focus(path); const before = f.port.getSnapshot();
    const result = { path, scores: analysis().nodes.map(n => ({ path: n.path, score: 1 })) };
    if (kind === "missing") result.scores.pop();
    if (kind === "duplicate") result.scores[1] = result.scores[0];
    if (kind === "unknown") result.scores[1].path = "../bad.md";
    if (kind === "NaN") result.scores[1].score = NaN;
    if (kind === "range") result.scores[1].score = -1.1;
    if (kind === "self") result.scores[0].score = 0.9;
    if (kind === "source") result.path = "Other.md";
    if (kind === "throw") f.engine.analyzeSemanticFocus.mockRejectedValueOnce(Error("private provider details"));
    else f.engine.analyzeSemanticFocus.mockResolvedValueOnce(kind === "ineligible" ? undefined : result);
    await f.port.focus(path); expect(f.port.getSnapshot()).toMatchObject({ state: "ready", focusError: true, busy: false });
    expect(f.port.getSnapshot().map).toBe(before.map); expect(f.port.getSnapshot().focus).toBe(before.focus);
    expect(JSON.stringify(f.port.getSnapshot())).not.toContain("private"); f.port.dispose();
  });
});

describe("Global map validation", () => {
  const corruptions: Array<[string, (r: ReturnType<typeof analysis>) => void]> = [
    ["duplicate path", r => { r.nodes[1].path = r.nodes[0].path; }], ["noncanonical path", r => { r.nodes[0].path = "../bad.md"; }],
    ["unknown neighbor", r => { r.nodes[0].neighbors[0].path = "Missing.md"; }], ["self neighbor", r => { r.nodes[0].neighbors[0].path = r.nodes[0].path; }],
    ["duplicate neighbor", r => { r.nodes[0].neighbors[1] = r.nodes[0].neighbors[0]; }], ["too many neighbors", r => { r.nodes[0].neighbors.push(r.nodes[0].neighbors[0]); }],
    ["missing neighbor", r => { r.nodes[0].neighbors.pop(); }], ["unsorted ranks", r => { r.nodes[0].neighbors.reverse(); }],
    ["NaN core", r => { r.nodes[0].coreSimilarity = NaN; }], ["infinite connectedness", r => { r.nodes[0].semanticConnectedness = Infinity; }],
    ["invalid mean", r => { r.nodes[0].semanticConnectedness = 0.5; }], ["invalid score", r => { r.nodes[0].neighbors[0].score = -1.01; }],
    ["null mean", r => { Object.assign(r.nodes[0], { semanticConnectedness: null }); }], ["invalid count", r => { r.indexedNoteCount = 1; }],
    ["fractional count", r => { r.mappedNoteCount = 8.5; }], ["sparse nodes", r => { r.nodes.length += 1; r.mappedNoteCount += 1; r.indexedNoteCount += 1; }],
    ["duplicate edge", r => { r.edges[1] = r.edges[0]; }], ["inconsistent mutual", r => { r.edges[0].mutual = !r.edges[0].mutual; }],
    ["edge score", r => { r.edges[0].score = 0.8; }], ["missing edge", r => { r.edges.pop(); }],
    ["noncanonical edge", r => { [r.edges[0].left, r.edges[0].right] = [r.edges[0].right, r.edges[0].left]; }],
  ];
  it.each(corruptions)("rejects the whole map: %s", async (_name, corrupt) => {
    const f = fixture(); const result = analysis(); corrupt(result); f.engine.analyzeGlobalSemanticMap.mockResolvedValueOnce(result); await f.port.load();
    expect(f.port.getSnapshot()).toMatchObject({ state: "error", reason: "invalid" }); expect(f.port.getSnapshot().map).toBeUndefined(); f.port.dispose();
  });
  it("copies fields and discards unexpected engine payloads", () => {
    const result = analysis(); Object.assign(result.nodes[0], { privateVector: new Float32Array([1]) });
    const map = projectGlobalSemanticMap(result, semanticIndexRevision(ready)!, 42)!; result.nodes[0].neighbors[0].score = 0;
    expect(map.nodes[0].neighbors[0].score).toBe(1); expect(JSON.stringify(map)).not.toContain("privateVector");
  });
});


describe("view-local scope owners", () => {
  it("keeps two windows independent and rejects late A to B to A publications", async () => {
    const f = fixture(), paths = analysis().nodes.map(node => node.path), gate = deferred<GlobalSemanticAnalysis>();
    const a = f.port.createScoped({ id: "A", revision: 1, paths });
    const other = f.port.createScoped({ id: "A", revision: 1, paths });
    expect(f.engine.analyzeGlobalSemanticMap).not.toHaveBeenCalled();
    f.engine.analyzeGlobalSemanticMap.mockReturnValueOnce(gate.promise);
    const pending = a.load(); await Promise.resolve(); a.dispose();
    const b = f.port.createScoped({ id: "B", revision: 2, paths: [] }); b.dispose();
    const freshA = f.port.createScoped({ id: "A", revision: 3, paths });
    await freshA.load(); gate.resolve(analysis()); await pending;
    expect(freshA.getSnapshot().map?.scope).toEqual({ id: "A", revision: 3, paths });
    expect(a.getSnapshot().map).toBeUndefined(); expect(other.getSnapshot().state).toBe("idle");
    expect(f.port.getSnapshot().state).toBe("idle");
    expect(f.engine.analyzeGlobalSemanticMap).toHaveBeenLastCalledWith(expect.objectContaining({ paths }));
    const cached = freshA.getSnapshot().map; await freshA.load(); expect(freshA.getSnapshot().map).toBe(cached);
    f.update({ vectorGeneration: 2 }); expect(freshA.getSnapshot().state).toBe("stale");
    freshA.dispose(); other.dispose(); f.port.dispose(); expect(f.listeners.size).toBe(0);
  });
  it("rejects paths from outside a requested scope without publishing a partial map", async () => {
    const f = fixture(), scoped = f.port.createScoped({ id: "small", revision: 0, paths: [analysis().nodes[0].path] });
    await scoped.load(); expect(scoped.getSnapshot()).toMatchObject({ state: "error", reason: "invalid" });
    expect(scoped.getSnapshot().map).toBeUndefined(); scoped.dispose(); f.port.dispose();
  });
});

it("scoped review selection invalidates pending policy/metadata results and detaches with its owner", async () => {
  const f = fixture(), callbacks = new Set<() => void>(); let revision = "1";
  const selection = { capture: () => ({ revision, document: () => "allow" as const, pair: () => "allow" as const, unknown: () => false }),
    subscribe: (fn: () => void) => { callbacks.add(fn); return () => { callbacks.delete(fn); }; } };
  const paths = analysis().nodes.map(n => n.path), port = f.port.createScoped({ id: "review", revision: 1, paths }, selection);
  const gate = deferred<GlobalSemanticAnalysis>(); f.engine.analyzeGlobalSemanticMap.mockReturnValueOnce(gate.promise);
  const pending = port.refresh(); await Promise.resolve();
  const options = f.engine.analyzeGlobalSemanticMap.mock.calls[0][0]!;
  expect(options.selection?.revision).toBe("1");
  revision = "2"; callbacks.forEach(fn => fn());
  expect(options.signal?.aborted).toBe(true); gate.resolve(analysis()); await pending;
  expect(port.getSnapshot().state).toBe("stale"); expect(port.getSnapshot().map).toBeUndefined();
  f.engine.analyzeGlobalSemanticMap.mockImplementation(async options => ({ ...analysis(), ...(options?.selection ? { selection: { revision: options.selection.revision, eligibleNoteCount: 8, excludedNoteCount: 0, unknownNoteCount: 0, excludedPairCount: 0, unknownPairCount: 0 } } : {}) }));
  await port.refresh(); expect(f.engine.analyzeGlobalSemanticMap.mock.lastCall![0]?.selection?.revision).toBe("2");
  expect(port.getSnapshot().state).toBe("ready");
  await f.port.refresh(); expect(f.engine.analyzeGlobalSemanticMap.mock.lastCall![0]?.selection).toBeUndefined();
  port.dispose(); expect(callbacks.size).toBe(0); f.port.dispose();
});

it("checks captured participation revision even if a source notification is delayed; capture failures stay errors", async () => {
  const f = fixture(); let revision = "old", fail = false;
  const selection = { capture: () => { if (fail) throw Error("metadata read"); return { revision, document: () => "allow" as const, pair: () => "allow" as const, unknown: () => false }; }, subscribe: () => () => {} };
  const port = f.port.createScoped({ id: "selected-folder", revision: 2, paths: analysis().nodes.map(n => n.path) }, selection);
  const gate = deferred<GlobalSemanticAnalysis>(); f.engine.analyzeGlobalSemanticMap.mockReturnValueOnce(gate.promise);
  const pending = port.refresh(); await Promise.resolve(); revision = "new"; gate.resolve(analysis()); await pending;
  expect(port.getSnapshot().state).toBe("stale"); expect(port.getSnapshot().map).toBeUndefined();
  fail = true; await port.refresh(); expect(port.getSnapshot().state).toBe("error"); expect(f.engine.analyzeGlobalSemanticMap).toHaveBeenCalledOnce();
  f.engine.analyzeGlobalSemanticMap.mockImplementation(async options => ({ ...analysis(), selection: { revision: options!.selection!.revision, eligibleNoteCount: 8, excludedNoteCount: 0, unknownNoteCount: 0, excludedPairCount: 0, unknownPairCount: 0 } }));
  fail = false; await port.refresh(); expect(port.getSnapshot().state).toBe("ready"); port.dispose(); f.port.dispose();
});
