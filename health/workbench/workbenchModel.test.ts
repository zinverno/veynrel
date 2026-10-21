import { describe, expect, it, vi } from "vitest";
import { WorkbenchData } from "./workbenchData";
import { linkFact, pairId, reconcileWorkbenchSelection, workbenchLayout, workbenchModel } from "./workbenchModel";
import { semanticMap, topologyMap, semanticRevision } from "../connections/testFixtures";
import { deriveConnectionComparison } from "../connections/deriveConnectionComparison";
import type { VaultTopologyProductSnapshot } from "../topology/types";
import type { SemanticGlobalMapProductSnapshot } from "../semanticGlobalMapPort";
import type { ConnectionComparisonProductSnapshot } from "../connectionComparisonPort";
import type { FindingCandidate } from "../domain/finding";

const candidate = (a: string, b: string): FindingCandidate => ({ fingerprint: pairId(a,b), analyzerId: "semantic-duplicates", dimension: "connections",
  type: "semantic-duplicate", source: "semantic", impact: "review", confidence: "high", title: "Candidate", explanation: "Index candidate",
  notePaths: [a,b], evidence: [{ kind: "similarity-score", value: 0.99 }], actions: [] });
function port<T>(initial: T) {
  let value = initial; const listeners = new Set<() => void>();
  const getSnapshot = () => value;
  const refresh = vi.fn(async () => {});
  return { getSnapshot, refresh, load: refresh, dispose: vi.fn(), subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    publish: (snapshot: T) => { value = snapshot; listeners.forEach(listener => listener()); }, listeners };
}
async function fixture(paths = ["A.md", "B.md", "C.md", "D.md", "E.md", "F.md", "G.md", "X.md", "One/Same.md", "Two/Same.md"]) {
  const semantic = port<SemanticGlobalMapProductSnapshot>({ state: "ready", map: semanticMap(), busy: false, supportedNoteCount: 500 });
  const topology = port<VaultTopologyProductSnapshot>({ state: "ready", map: await topologyMap() });
  const comparison = port<ConnectionComparisonProductSnapshot>({ state: "ready", comparison: deriveConnectionComparison(semantic.getSnapshot().map!, topology.getSnapshot().map!, 1) });
  const source = { analyzeDuplicates: vi.fn(async () => ({ revision: semanticRevision, candidates: [candidate("A.md", "X.md")], complete: true })), verifyCurrent: vi.fn(async () => {}) };
  const data = new WorkbenchData({ id: "all", revision: 1, paths }, { topology, duplicates: source, createComparison: () => comparison,
    createSemantic: () => ({ ...semantic, focus: vi.fn(async () => {}), resetFocus: vi.fn(), search: () => ({ nodes: [], total: 0 }) }) });
  return { data, semantic, topology, comparison, source };
}

describe("workbench source projection", () => {
  it("opens passively and joins exact paths, including duplicate basenames and non-indexed notes", async () => {
    const f = await fixture(), model = workbenchModel(f.data, []);
    expect(f.source.analyzeDuplicates).not.toHaveBeenCalled(); expect(f.semantic.refresh).not.toHaveBeenCalled(); expect(f.topology.refresh).not.toHaveBeenCalled();
    expect(model.nodes.filter(node => node.path.endsWith("Same.md"))).toHaveLength(2);
    expect(model.nodes.find(node => node.path === "X.md")).toMatchObject({ semantic: false, linksAvailable: true });
    expect(model.nodes.find(node => node.path === "G.md")).toMatchObject({ semantic: true, linksAvailable: false });
    expect(model.nodes.find(node => node.path === "One/Same.md")).toMatchObject({ semantic: false, linksAvailable: false });
    f.data.dispose();
  });
  it("preserves candidates outside semantic top-K, canonical pair IDs, scope boundaries and global basis", async () => {
    const f = await fixture(["A.md", "X.md"]); await f.data.refresh();
    const model = workbenchModel(f.data, [candidate("X.md", "A.md"), candidate("A.md", "B.md")]);
    expect(model.repeats).toHaveLength(1); expect(model.repeats[0]).toMatchObject({ id: pairId("X.md","A.md"), paths: ["A.md","X.md"], basis: "duplicate" });
    expect(model.edges.some(edge => edge.kind === "semantic" && edge.target === "X.md")).toBe(false);
    expect(model.external).toContainEqual({ source: "A.md", target: "C.md" });
    expect(model.nodes.map(node => node.path)).toEqual(["A.md", "X.md"]); expect(f.source.analyzeDuplicates).toHaveBeenCalledOnce();
    f.data.dispose();
  });
  it("retains directed real links and refuses unknown absence for either missing endpoint", async () => {
    const f = await fixture(), model = workbenchModel(f.data, []);
    expect(pairId("B.md","C.md")).toBe(pairId("C.md","B.md"));
    expect(linkFact(model,["B.md","C.md"])).toBe("both");
    expect(linkFact(model,["A.md","C.md"])).toBe("forward");
    expect(linkFact(model,["C.md","A.md"])).toBe("backward");
    expect(linkFact(model,["A.md","B.md"])).toBe("absent");
    for (const paths of [["A.md","E.md"],["E.md","A.md"],["A.md","One/Same.md"]] as const) expect(linkFact(model,paths)).toBe("unknown");
    f.data.dispose();
  });
  it.each(["semantic", "topology"] as const)("never joins a fresh %s with an older comparison", async source => {
    const f = await fixture(); expect(workbenchModel(f.data, []).comparisonCurrent).toBe(true);
    if (source === "semantic") f.semantic.publish({ ...f.semantic.getSnapshot(), map: { ...semanticMap(), revision: { ...semanticRevision, vectorGeneration: 2 } } });
    else f.topology.publish({ ...f.topology.getSnapshot(), state: "stale" });
    const model = workbenchModel(f.data, []); expect(model.comparisonCurrent).toBe(false); expect(model.connections).toEqual([]);
    if (source === "topology") expect(linkFact(model,["A.md","B.md"])).toBe("unknown");
    f.data.dispose();
  });
  it("keeps real topology and list when semantic coverage is 501, and does not invent scores", async () => {
    const f = await fixture(); f.semantic.publish({ state: "unavailable", reason: "too-large", supportedNoteCount: 500, busy: false, mappedNoteCount: 501 });
    const model = workbenchModel(f.data, []); expect(model.nodes).toHaveLength(10); expect(model.edges.every(edge => edge.kind === "link")).toBe(true);
    expect(model.nodes.every(node => !node.semantic)).toBe(true); expect(model.connections).toEqual([]); f.data.dispose();
  });
  it("retains raw semantic weight and provenance without assigning a score to Markdown links", async()=>{
    const f=await fixture(),model=workbenchModel(f.data,[]),source=f.semantic.getSnapshot().map!;
    for(const edge of model.edges.filter(edge=>edge.kind==="semantic")){
      const original=source.edges.find(item=>item.left===edge.source&&item.right===edge.target)!;
      expect(edge.score).toBe(original.score);expect(edge.revision).toEqual(source.revision);expect(edge.mutual).toBe(original.mutual);
    }
    expect(model.edges.filter(edge=>edge.kind==="link").every(edge=>edge.score===undefined&&edge.revision===undefined)).toBe(true);f.data.dispose();
  });
  it("keeps layout deterministic without layer or selection inputs, including a 1000-note bounded fallback", async () => {
    const f = await fixture(), model = workbenchModel(f.data, []), before = workbenchLayout(model.nodes,model.edges);
    expect(workbenchLayout([...model.nodes].reverse(),model.edges)).toEqual(before);
    const large = Array.from({ length: 1000 }, (_, i) => ({ path: `N${i}.md`, semantic: false, linksAvailable: false }));
    const output = workbenchLayout(large, []); expect(output).toHaveLength(1000); expect(output.every(p => Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);
    f.data.dispose();
  });
  it("disposal aborts duplicates and ignores late results, keeping a separate window untouched", async () => {
    const f = await fixture(), other = await fixture(); let finish!: (result: Awaited<ReturnType<typeof f.source.analyzeDuplicates>>) => void;
    f.source.analyzeDuplicates.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const listener = vi.fn(); f.data.subscribe(listener); const pending = f.data.refresh();
    const calls = listener.mock.calls.length; f.data.dispose();
    finish({ revision: semanticRevision, candidates: [candidate("A.md", "B.md")], complete: true }); await pending;
    expect(f.data.duplicates).toBeUndefined(); expect(listener).toHaveBeenCalledTimes(calls);
    expect(f.topology.listeners.size).toBe(0); expect(f.semantic.dispose).toHaveBeenCalledOnce(); expect(f.comparison.dispose).toHaveBeenCalledOnce();
    expect(other.data.duplicateState).toBe("idle"); other.data.dispose();
  });
  it("preserves the source ranking, including shared-neighbor priority before score", async () => {
    const f = await fixture(), source = f.comparison.getSnapshot().comparison!;
    expect(workbenchModel(f.data, []).connections.map(pair => pair.id)).toEqual(source.pairs.filter(pair => pair.category === "candidate").map(pair => pair.id));
    f.data.dispose();
  });
  it("keeps selected paths while replacing obsolete connection provenance, then clears deleted endpoints", async () => {
    const f = await fixture(), model = workbenchModel(f.data, []), selected = model.connections[0];
    expect(selected.basis).toBe("connection");
    const refreshed = { ...model, connections: [] };
    expect(reconcileWorkbenchSelection(refreshed, selected)).toEqual({ id: selected.id, paths: selected.paths, basis: "selected" });
    expect(reconcileWorkbenchSelection({ ...refreshed, nodes: [] }, selected)).toBeUndefined();
    f.data.dispose();
  });
  it("source errors are distinct from checked empty results and raw errors never reach the snapshot", async () => {
    const f = await fixture(); f.source.analyzeDuplicates.mockRejectedValueOnce(Error("private-response-secret"));
    await f.data.refresh(); expect(f.data.duplicateState).toBe("error"); expect(f.data.duplicates).toBeUndefined();
    f.source.analyzeDuplicates.mockResolvedValueOnce({ revision: semanticRevision, candidates: [], complete: true });
    await f.data.refresh(); expect(f.data.duplicateState).toBe("ready"); expect(f.data.duplicates?.candidates).toEqual([]); f.data.dispose();
  });
});
