import { freeze } from "../recipe";
import { DIAGRAM_LIMITS, inertLabel, requireDiagram } from "./spec";
import type { DiagramSpec, Shape } from "./spec";

export interface DiagramOptions { direction: "down" | "right"; theme: "neutral" | "amethyst" }
export interface Box { x: number; y: number; width: number; height: number }
export interface TextBox extends Box { text: string }
export interface LayoutNode extends Box { id: string; shape: Shape; text: TextBox; rank: number }
export interface LayoutEdge { id: string; from: string; to: string; points: [number, number][]; start: [number, number]; end: [number, number]; text?: TextBox; feedback: boolean }
export interface DiagramLayout { options: DiagramOptions; nodes: readonly LayoutNode[]; edges: readonly LayoutEdge[]; title: TextBox; width: number; height: number; warnings: readonly string[] }
export type MeasureText = (text: string) => { width: number; height: number };
export const PALETTES = {
  neutral: { canvas: "#ffffff", stroke: "#343a40", fill: "#f1f3f5", accent: "#343a40" },
  amethyst: { canvas: "#faf8ff", stroke: "#34313d", fill: "#ede5ff", accent: "#7041a6" },
} as const;

function wrap(raw: string, max: number, measure: MeasureText): TextBox {
  const lines: string[] = [];
  for (const paragraph of inertLabel(raw).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/(\s+)/u)) {
      if (line && measure(line + word).width > max) { lines.push(line.trimEnd()); line = ""; }
      for (const char of word) {
        if (line && measure(line + char).width > max) { lines.push(line); line = ""; }
        if (line || char.trim()) line += char;
      }
    }
    lines.push(line.trimEnd());
  }
  const text = lines.join("\n"), size = measure(text);
  requireDiagram(Number.isFinite(size.width) && Number.isFinite(size.height) && size.width >= 0 && size.height > 0 && size.width <= max + 60, "adapter");
  return { x: 0, y: 0, text, width: Math.ceil(size.width), height: Math.ceil(size.height) };
}

export function layoutDiagram(spec: DiagramSpec, options: DiagramOptions, measure: MeasureText): DiagramLayout {
  requireDiagram(["down", "right"].includes(options.direction) && ["neutral", "amethyst"].includes(options.theme), "spec");
  const nodes: LayoutNode[] = spec.nodes.map(n => {
    const text = wrap(n.label, 220, measure), factor = n.shape === "rectangle" ? 1 : 2;
    return { id: n.id, shape: n.shape, rank: 0, x: 0, y: 0, width: Math.max(180, (text.width + 40) * factor), height: Math.max(84, (text.height + 32) * factor), text };
  });
  const byId = new Map(nodes.map(n => [n.id, n]));
  // DFS marks back edges, then longest paths on the remaining DAG preserve the main flow.
  const visited = new Set<string>(), stack = new Set<string>(), back = new Set<string>(), order: string[] = [];
  const visit = (id: string) => {
    visited.add(id); stack.add(id);
    for (const edge of spec.edges.filter(e => e.from === id)) {
      if (stack.has(edge.to)) back.add(edge.id); else if (!visited.has(edge.to)) visit(edge.to);
    }
    stack.delete(id); order.push(id);
  };
  const roots = nodes.filter(n => !spec.edges.some(e => e.to === n.id));
  for (const node of [...roots, ...nodes]) if (!visited.has(node.id)) visit(node.id);
  for (const id of order.reverse()) for (const edge of spec.edges.filter(e => e.from === id && !back.has(e.id))) {
    byId.get(edge.to)!.rank = Math.max(byId.get(edge.to)!.rank, byId.get(id)!.rank + 1);
  }
  // Weak components occupy separate bands. Node order follows the validated source order.
  const components: LayoutNode[][] = [], assigned = new Set<string>();
  for (const node of nodes) {
    if (assigned.has(node.id)) continue;
    const ids = new Set([node.id]), queue = [node.id]; assigned.add(node.id);
    while (queue.length) {
      const id = queue.shift()!;
      for (const e of spec.edges) if (e.from === id || e.to === id) {
        const next = e.from === id ? e.to : e.from;
        if (!assigned.has(next)) { assigned.add(next); ids.add(next); queue.push(next); }
      }
    }
    components.push(nodes.filter(n => ids.has(n.id)));
  }
  const down = options.direction === "down", title = wrap(spec.title, 600, measure);
  title.x = 40; title.y = 30;
  const start = title.height + 130, rankGap = 240;
  const feedbackLanes = new Map<string, number>();
  let band = 60;
  for (const component of components) {
    let primary = start, widest = 0;
    const ranks = [...new Set(component.map(n => n.rank))].sort((a, b) => a - b);
    for (const rank of ranks) {
      let secondary = band, thickness = 0;
      for (const node of component.filter(n => n.rank === rank)) {
        node.x = down ? secondary : primary; node.y = down ? primary : secondary + start;
        node.text.x = node.x + (node.width - node.text.width) / 2;
        node.text.y = node.y + (node.height - node.text.height) / 2;
        secondary += (down ? node.width : node.height) + 100;
        thickness = Math.max(thickness, down ? node.height : node.width);
      }
      widest = Math.max(widest, secondary - band); primary += thickness + rankGap;
    }
    const extent = Math.max(...component.map(n => down ? n.x + n.width : n.y + n.height));
    const feedback = spec.edges.filter(e => component.some(n => n.id === e.from) && (back.has(e.id) || byId.get(e.to)!.rank <= byId.get(e.from)!.rank));
    feedback.forEach((e, i) => feedbackLanes.set(e.id, extent + 100 + i * 100));
    // Reserve return lanes inside this component's band, before placing disconnected components.
    band += widest + 220 + feedback.length * 100;
  }
  const right = Math.max(...nodes.map(n => n.x + n.width)), bottom = Math.max(...nodes.map(n => n.y + n.height));
  const edges: LayoutEdge[] = spec.edges.map(e => {
    const a = byId.get(e.from)!, b = byId.get(e.to)!, feedback = back.has(e.id) || b.rank <= a.rank;
    let points: [number, number][], startPoint: [number, number], endPoint: [number, number];
    if (feedback) {
      const outside = feedbackLanes.get(e.id)!;
      startPoint = down ? [1, 0.5] : [0.5, 1]; endPoint = startPoint;
      const startXY: [number, number] = down ? [a.x + a.width, a.y + a.height / 2] : [a.x + a.width / 2, a.y + a.height];
      const endXY: [number, number] = down ? [b.x + b.width, b.y + b.height / 2] : [b.x + b.width / 2, b.y + b.height];
      if (a === b) endXY[down ? 1 : 0] += 24;
      points = down ? [startXY, [outside, startXY[1]], [outside, endXY[1]], endXY] : [startXY, [startXY[0], outside], [endXY[0], outside], endXY];
    } else {
      startPoint = down ? [0.5, 1] : [1, 0.5]; endPoint = down ? [0.5, 0] : [0, 0.5];
      const axy: [number, number] = down ? [a.x + a.width / 2, a.y + a.height] : [a.x + a.width, a.y + a.height / 2];
      const bxy: [number, number] = down ? [b.x + b.width / 2, b.y] : [b.x, b.y + b.height / 2];
      const siblings = spec.edges.filter(other => other.from === e.from && !back.has(other.id));
      const straight = down ? axy[0] === bxy[0] : axy[1] === bxy[1];
      // Keep straight-branch labels beyond the fan-out bends, so a sibling arrow does not cover them.
      const fraction = straight ? 0.6 : 0.2 + 0.2 * (siblings.findIndex(other => other.id === e.id) + 1) / (siblings.length + 1);
      const middle = down ? axy[1] + (bxy[1] - axy[1]) * fraction : axy[0] + (bxy[0] - axy[0]) * fraction;
      points = down ? [axy, [axy[0], middle], [bxy[0], middle], bxy] : [axy, [middle, axy[1]], [middle, bxy[1]], bxy];
    }
    let text: TextBox | undefined;
    if (e.label) {
      text = wrap(e.label, 160, measure);
      text.x = (points[1][0] + points[2][0]) / 2 - text.width / 2;
      text.y = (points[1][1] + points[2][1]) / 2 - text.height / 2;
    }
    return { id: e.id, from: e.from, to: e.to, points, start: startPoint, end: endPoint, text, feedback };
  });
  const width = Math.max(right, title.width + 40, ...edges.flatMap(e => e.points.map(p => p[0] + 120))) + 80;
  const height = Math.max(bottom, ...edges.flatMap(e => e.points.map(p => p[1] + 80))) + 100;
  requireDiagram(Number.isFinite(width) && Number.isFinite(height) && width <= DIAGRAM_LIMITS.canvas && height <= DIAGRAM_LIMITS.canvas, "limit");
  return freeze({ options: { ...options }, nodes, edges, title, width, height,
    warnings: [...(back.size ? ["feedback"] : []), ...(components.length > 1 ? ["components"] : []), "crossings", "inert-text"] });
}
