import { describe, expect, it } from "vitest";
import { DIAGRAM_LIMITS, inertLabel, parseDiagramSpec, validateDiagramSpec } from "./spec";
import type { DiagramSpec } from "./spec";
import { layoutDiagram } from "./layout";

export const graph: DiagramSpec = {
  schemaVersion: 1, kind: "flowchart", title: "Проверка запроса",
  nodes: [{ id: "start", label: "Получить запрос", shape: "ellipse" }, { id: "check", label: "Данные корректны?\nНеопределённость сохранена", shape: "diamond" },
    { id: "accept", label: "Принять", shape: "rectangle" }, { id: "reject", label: "Запросить исправление", shape: "rectangle" }, { id: "other", label: "Отдельный компонент", shape: "rectangle" }],
  edges: [{ id: "a", from: "start", to: "check", label: "" }, { id: "b", from: "check", to: "accept", label: "Да" }, { id: "c", from: "check", to: "reject", label: "Нет" },
    { id: "d", from: "reject", to: "start", label: "Повторить" }, { id: "self", from: "other", to: "other", label: "Самосвязь" }],
};
const measure = (s: string) => ({ width: Math.max(...s.split("\n").map(l => Array.from(l).length * 11)), height: s.split("\n").length * 23 });
describe("DiagramSpec strict data contract", () => {
  it("accepts Cyrillic, multiline labels, cycles and disconnected nodes immutably", () => {
    const spec = parseDiagramSpec(JSON.stringify(graph), "flowchart"); expect(spec).toEqual(graph); expect(Object.isFrozen(spec.nodes[0])).toBe(true);
  });
  it.each([
    null, [], {}, { ...graph, nodes: [] }, { ...graph, schemaVersion: 2 }, { ...graph, schemaVersion: "1" }, { ...graph, kind: "script" },
    { ...graph, extra: "no" }, { ...graph, title: "" }, { ...graph, title: "x".repeat(121) }, { ...graph, nodes: "nodes" }, { ...graph, edges: {} },
    { ...graph, nodes: [{ ...graph.nodes[0], x: 10 }] }, { ...graph, nodes: [{ ...graph.nodes[0], label: 10 }] },
    { ...graph, nodes: [{ ...graph.nodes[0], label: "a\u0000" }] }, { ...graph, nodes: [{ ...graph.nodes[0], label: "a\u202e" }] },
    { ...graph, nodes: [{ ...graph.nodes[0], shape: "image" }] }, { ...graph, nodes: [{ ...graph.nodes[0], id: "../x" }] },
    { ...graph, nodes: [{ ...graph.nodes[0], id: "x".repeat(25) }] }, { ...graph, nodes: [graph.nodes[0], graph.nodes[0]] },
    { ...graph, edges: [{ ...graph.edges[0], to: "missing" }] }, { ...graph, edges: [{ ...graph.edges[0], id: "start" }] },
    { ...graph, edges: [{ ...graph.edges[0], url: "https://x" }] }, { ...graph, edges: [graph.edges[0], graph.edges[0]] },
    { ...graph, nodes: [{ ...graph.nodes[0], label: "x".repeat(241) }] }, { ...graph, edges: [{ ...graph.edges[0], label: "x".repeat(81) }] },
  ])("rejects malformed data without repair", value => expect(() => validateDiagramSpec(value)).toThrow());
  it("rejects unknown mode, fences, truncated JSON and deep objects before parsing", () => {
    for (const raw of ["```json\n{}\n```", JSON.stringify(graph).slice(0, -2), '{"x":' + '['.repeat(1000) + '0', "null"]) expect(() => parseDiagramSpec(raw, "flowchart")).toThrow();
    expect(() => parseDiagramSpec(JSON.stringify(graph), "structure")).toThrow();
  });
  it("does not silently truncate excessive graph/output sizes", () => {
    expect(() => validateDiagramSpec({ ...graph, nodes: Array.from({ length: 31 }, (_, i) => ({ ...graph.nodes[0], id: `n${i}` })) })).toThrow("limit");
    expect(() => validateDiagramSpec({ ...graph, edges: Array.from({ length: 61 }, (_, i) => ({ ...graph.edges[0], id: `e${i}` })) })).toThrow("limit");
    expect(() => parseDiagramSpec(" ".repeat(DIAGRAM_LIMITS.response + 1), "flowchart")).toThrow("limit");
  });
  it("accepts hostile labels as data, but strips active syntax only in rendered text", () => {
    const hostile = '![[Secret]] [open](https://host.invalid) obsidian://open <script> `code`\n## Drawing\n%% ^block';
    const spec = validateDiagramSpec({ ...graph, title: hostile, nodes: [{ id: "x", shape: "rectangle", label: hostile }], edges: [] });
    expect(spec.nodes[0].label).toBe(hostile);
    expect(inertLabel(hostile)).not.toMatch(/\[|\]|<|>|:|`|%|\^|#/u);
    expect(inertLabel(hostile)).toContain("Secret");
  });
});
describe("bounded deterministic layout", () => {
  it.each(["down", "right"] as const)("places branches, cycles, self edges and components %s without node overlap", direction => {
    const plan = layoutDiagram(graph, { direction, theme: "neutral" }, measure);
    expect(plan).toEqual(layoutDiagram(graph, { direction, theme: "neutral" }, measure));
    expect(plan.nodes).toHaveLength(graph.nodes.length); expect(plan.edges).toHaveLength(graph.edges.length);
    expect(plan.warnings).toEqual(expect.arrayContaining(["feedback", "components"]));
    for (const a of plan.nodes) {
      expect([a.x, a.y, a.width, a.height].every(Number.isFinite)).toBe(true);
      expect(a.text.width).toBeLessThan(a.width); expect(a.text.height).toBeLessThan(a.height);
      for (const b of plan.nodes) if (a !== b) expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
    }
    expect(plan.width).toBeLessThanOrEqual(DIAGRAM_LIMITS.canvas); expect(plan.height).toBeLessThanOrEqual(DIAGRAM_LIMITS.canvas);
    for (const e of plan.edges) expect(e.points.flat().every(Number.isFinite)).toBe(true);
    const isolated = plan.nodes.find(n => n.id === "other")!;
    const returning = plan.edges.find(e => e.id === "d")!;
    for (const p of returning.points) expect(p[direction === "down" ? 0 : 1]).toBeLessThan(direction === "down" ? isolated.x : isolated.y);
  });
  it("wraps long words and paragraphs without shrinking text", () => {
    const spec = validateDiagramSpec({ ...graph, nodes: [{ id: "x", label: "д".repeat(240), shape: "diamond" }], edges: [] });
    const plan = layoutDiagram(spec, { direction: "right", theme: "amethyst" }, measure);
    expect(plan.nodes[0].text.text.split("\n").length).toBeGreaterThan(5); expect(plan.nodes[0].height).toBeGreaterThan(200);
  });
  it("rejects bad measurements and an oversized canvas explicitly", () => {
    expect(() => layoutDiagram(graph, { direction: "down", theme: "neutral" }, () => ({ width: NaN, height: Infinity }))).toThrow();
    const spec = { ...graph, nodes: Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, label: "line\n".repeat(45), shape: "diamond" as const })), edges: [] };
    expect(() => layoutDiagram(spec, { direction: "right", theme: "neutral" }, measure)).toThrow("limit");
  });
});
