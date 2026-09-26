import { describe, expect, it, vi } from "vitest";
import { deriveTopology } from "./deriveTopology";
import { clampZoom, fitTopology, layoutTopology, panTopology, zoomTopology } from "./topologyLayout";
import { searchTopology, topologyMetrics, topologyRelationships, topologyStatus, TOPOLOGY_EDGE_LIMIT } from "./topologyPresentation";
import { syntheticTopologyFixture } from "./syntheticFixture";
import type { LocalNoteSnapshot } from "../analyzers/local/types";
import { setLanguage } from "../../i18n";
vi.mock("obsidian", () => ({ getLanguage: () => "en" }));

function fixture(links: Record<string, string[]>) {
  return { notes: Object.entries(links).map(([name, targets]) => ({ path: `${name}.md`, basename: name, mtime: 1,
    contentAvailable: false, linksAvailable: true, resolvedOutgoing: targets.map((target) => `${target}.md`), unresolvedLinks: [] })) as LocalNoteSnapshot[],
    coverage: { noteListComplete: true, contentComplete: false, linksComplete: true }, diagnostics: [], diagnosticsTruncated: 0 };
}
const derive = (links: Record<string, string[]>) => deriveTopology(fixture(links), 100, new AbortController().signal);

describe("real topology", () => {
  it.each([
    [{ A: ["B"], B: ["C"], C: [] }, ["B.md"]],
    [{ A: ["B"], B: ["C"], C: ["A"] }, []],
    [{ A: ["B", "C"], B: ["C"], C: ["X"], X: ["D"], D: ["E", "F"], E: ["F"], F: [] }, ["C.md", "D.md", "X.md"]],
    [{ A: ["B", "C"], B: [], C: [] }, ["A.md"]],
  ] satisfies Array<[Record<string, string[]>, string[]]>)("derives articulation points from %j", async (links, connectors) => {
    const map = await derive(links);
    expect(map.nodes.filter((node) => node.connector).map((node) => node.path)).toEqual(connectors);
    expect(map.connectorCount).toBe(connectors.length);
  });
  it("handles empty, singleton and only-orphan graphs", async () => {
    const empty = await derive({}); expect(empty).toMatchObject({ noteCount: 0, componentCount: 0, orphanCount: 0 });
    expect(layoutTopology(empty).points).toEqual([]);
    const one = await derive({ A: [] });
    expect(one).toMatchObject({ noteCount: 1, resolvedLinkCount: 0, componentCount: 1, orphanCount: 1 });
    expect(one.nodes[0].orphan).toBe(true);
    const many = await derive({ A: [], B: [], C: [] }); expect(many.orphanCount).toBe(3);
    expect(new Set(layoutTopology(many).points.map(({ x, y }) => `${x},${y}`)).size).toBe(3);
  });
  it("uses weak components with canonical largest/tie ordering including one-note components", async () => {
    const map = await derive({ D: [], C: ["D"], B: ["A"], A: [], Z: [] });
    expect(map.components.map((component) => component.paths)).toEqual([["A.md", "B.md"], ["C.md", "D.md"], ["Z.md"]]);
    expect(map.components.map((component) => component.primary)).toEqual([true, false, false]);
    expect(map.nodes.find((node) => node.path === "Z.md")!.orphan).toBe(true);
  });
  it("preserves reciprocal directed edges, deduplicates repeats and ignores self/out-of-scope edges", async () => {
    const map = await derive({ A: ["A", "B", "B", "Excluded"], B: ["A"] });
    expect(map.edges).toEqual([{ source: "A.md", target: "B.md" }, { source: "B.md", target: "A.md" }]);
    expect(map.nodes[0]).toMatchObject({ incoming: 1, outgoing: 1, degree: 2 });
    expect(topologyRelationships(map)).toEqual({ relationships: [{ source: "A.md", target: "B.md", reciprocal: true }], shown: 2, total: 2 });
  });
  it("never claims trustworthy orphans/connectors or absence from partial metadata", async () => {
    const input = fixture({ A: ["B"], B: ["C"], C: [], Unknown: ["A"] });
    input.notes[3] = { ...input.notes[3], linksAvailable: false, unresolvedLinks: [{ target: "Not evidence", count: 1 }] };
    const map = await deriveTopology(input, 10, new AbortController().signal);
    expect(map.complete).toBe(false); expect(map.orphanCount).toBeUndefined(); expect(map.connectorCount).toBeUndefined();
    expect(map.nodes.every((node) => !node.orphan && !node.connector)).toBe(true);
    expect(map.edges).toHaveLength(2); expect(map.brokenTargets).toEqual([]);
    setLanguage("en"); expect(topologyMetrics(map).map((metric) => metric.label)).toContain("Observed components");
    expect(topologyStatus({ state: "ready", map })).toBe("Partial map");
    setLanguage("ru"); expect(topologyMetrics(map).map((metric) => metric.label)).toContain("Наблюдаемые компоненты");
  });
  it("aggregates bounded unresolved targets separately and retains no contents", async () => {
    const input = fixture({ A: [], B: [] });
    const target = '<img src="x">#missing';
    input.notes[0] = { ...input.notes[0], content: "SECRET", contentAvailable: true, unresolvedLinks: [{ target, count: 2 }, { target, count: 1 }] };
    input.notes[1] = { ...input.notes[1], unresolvedLinks: [{ target, count: 4 }] };
    const map = await deriveTopology(input, 10, new AbortController().signal);
    expect(map).toMatchObject({ brokenTargetCount: 1, brokenOccurrenceCount: 7, orphanCount: 2 });
    expect(map.brokenTargets[0]).toMatchObject({ target, occurrences: 7, sources: [{ path: "A.md", occurrences: 3 }, { path: "B.md", occurrences: 4 }] });
    expect(map.brokenTargets[0].id).toMatch(/^target-[a-f0-9]+$/u);
    expect(JSON.stringify(map)).not.toContain("SECRET");
    expect(Object.isFrozen(map.nodes[0])).toBe(true); expect(Object.isFrozen(map.edges)).toBe(true);
    expect(Object.isFrozen(map.components[0].paths)).toBe(true); expect(Object.isFrozen(map.brokenTargets[0].sources[0])).toBe(true);
    input.notes[0] = { ...input.notes[0], unresolvedLinks: [{ target: "x".repeat(4097), count: 1 }] };
    await expect(deriveTopology(input, 10, new AbortController().signal)).rejects.toThrow("Invalid local vault snapshot");
  });
  it("rejects invalid input and aborts CPU work", async () => {
    await expect(deriveTopology(fixture({ A: [] }), NaN, new AbortController().signal)).rejects.toThrow();
    const abort = new AbortController(); const pending = deriveTopology(syntheticTopologyFixture(), 10, abort.signal);
    abort.abort(); await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
  it("lays out the deterministic 1000-note fixture with all directed edges and finite normalized coordinates", async () => {
    const start = performance.now();
    const map = await deriveTopology(syntheticTopologyFixture(), 10, new AbortController().signal);
    const derived = performance.now(); const layout = layoutTopology(map); const finished = performance.now();
    process.stdout.write(JSON.stringify({ topologyFixture: { nodes: map.noteCount, directedEdges: map.resolvedLinkCount, components: map.componentCount,
      derivationMs: derived - start, layoutMs: finished - derived } }) + "\n");
    expect(map).toMatchObject({ noteCount: 1000, resolvedLinkCount: 4052, componentCount: 23, orphanCount: 20, connectorCount: 20 });
    expect(layout).toEqual(layoutTopology(map)); expect(layout.points).toHaveLength(1000);
    for (const point of layout.points) {
      for (const value of [point.x, point.y, point.radius]) expect(Number.isFinite(value)).toBe(true);
      expect(point.x).toBeGreaterThanOrEqual(0); expect(point.x).toBeLessThanOrEqual(1000);
      expect(point.y).toBeGreaterThanOrEqual(0); expect(point.y).toBeLessThanOrEqual(1000);
    }
    expect(layout.components[0].width).toBeGreaterThan(layout.components[1].width);
    expect(topologyRelationships(map).shown).toBe(map.resolvedLinkCount);
    expect(searchTopology(map.nodes, "note-00")).toMatchObject({ total: 100 });
    expect(searchTopology(map.nodes, "SYNTHETIC/NOTE-0001").nodes[0].path).toBe("Synthetic/Note-0001.md");
    expect(searchTopology(map.nodes, "NOTE").nodes).toHaveLength(20);
    expect(searchTopology(map.nodes, "no such note").nodes).toEqual([]);
  });
  it("reports deterministic visual-edge omission while preserving full product data", async () => {
    const map = await derive({ A: [], B: [] });
    const edges = Array.from({ length: TOPOLOGY_EDGE_LIMIT + 3 }, (_, index) => ({ source: "A.md", target: `${index}.md` }));
    const rendered = topologyRelationships({ ...map, edges });
    expect(rendered).toMatchObject({ shown: TOPOLOGY_EDGE_LIMIT, total: TOPOLOGY_EDGE_LIMIT + 3 });
    expect(edges).toHaveLength(TOPOLOGY_EDGE_LIMIT + 3);
  });
  it("fits, clamps zoom and keeps pan/zoom transforms finite and bounded", () => {
    const fit = fitTopology(); expect(fit).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(clampZoom(-20)).toBe(0.4); expect(clampZoom(100)).toBe(4); expect(clampZoom(NaN)).toBe(1);
    expect(panTopology(fit, 10, -20)).toEqual({ x: 10, y: -20, zoom: 1 });
    expect(zoomTopology(fit, 2, 500, 500)).toEqual({ x: -500, y: -500, zoom: 2 });
    expect(panTopology(fit, Infinity, NaN)).toEqual(fit); expect(panTopology(fit, 1e9, -1e9)).toMatchObject({ x: 4000, y: -4000 });
  });
});
