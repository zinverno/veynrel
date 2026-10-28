import { l } from "../messages";
import { button } from "../ui";
import { PALETTES } from "./layout";
import type { DiagramLayout, TextBox } from "./layout";

/** No HTML parser, model markup, URLs or Excalidraw view involved. */
export function diagramPreview(root: HTMLElement, plan: DiagramLayout): void {
  const document = root.ownerDocument, ns = "http://www.w3.org/2000/svg", palette = PALETTES[plan.options.theme];
  const controls = root.createDiv({ cls: "veynrel-studio-actions" }), frame = root.createDiv({ cls: "veynrel-diagram-preview", attr: { tabindex: "0", "aria-label": l("Diagram preview; scroll to pan", "Предпросмотр схемы; прокрутка для перемещения") } });
  const svg = document.createElementNS(ns, "svg"); frame.append(svg);
  svg.setAttribute("viewBox", `0 0 ${plan.width} ${plan.height}`); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", plan.title.text);
  const add = (tag: string, attrs: Record<string, string | number>, parent: Element = svg): Element => {
    const el = document.createElementNS(ns, tag); for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value)); parent.append(el); return el;
  };
  add("rect", { width: plan.width, height: plan.height, fill: palette.canvas });
  const text = (box: TextBox, background = false) => {
    if (background) add("rect", { x: box.x - 4, y: box.y - 3, width: box.width + 8, height: box.height + 6, fill: palette.canvas });
    const element = add("text", { x: box.x + box.width / 2, y: box.y, fill: palette.stroke, "font-family": "Helvetica, Arial, sans-serif", "font-size": 20, "text-anchor": "middle" });
    box.text.split("\n").forEach((line, i) => { const span = add("tspan", { x: box.x + box.width / 2, y: box.y + 20 + i * 23 }, element); span.textContent = line; });
  };
  text(plan.title);
  for (const edge of plan.edges) {
    add("polyline", { points: edge.points.map(p => p.join(",")).join(" "), fill: "none", stroke: palette.accent, "stroke-width": 2 });
    const end = edge.points[edge.points.length - 1], before = edge.points[edge.points.length - 2], angle = Math.atan2(end[1] - before[1], end[0] - before[0]);
    const wing = (sign: number) => [end[0] - 12 * Math.cos(angle + sign * 0.45), end[1] - 12 * Math.sin(angle + sign * 0.45)];
    add("polyline", { points: [wing(1), end, wing(-1)].map(p => p.join(",")).join(" "), fill: "none", stroke: palette.accent, "stroke-width": 2 });
  }
  for (const n of plan.nodes) {
    const attrs = { fill: palette.fill, stroke: palette.stroke, "stroke-width": 2 };
    if (n.shape === "ellipse") add("ellipse", { ...attrs, cx: n.x + n.width / 2, cy: n.y + n.height / 2, rx: n.width / 2, ry: n.height / 2 });
    else if (n.shape === "diamond") add("polygon", { ...attrs, points: `${n.x + n.width / 2},${n.y} ${n.x + n.width},${n.y + n.height / 2} ${n.x + n.width / 2},${n.y + n.height} ${n.x},${n.y + n.height / 2}` });
    else add("rect", { ...attrs, x: n.x, y: n.y, width: n.width, height: n.height });
    text(n.text);
  }
  for (const edge of plan.edges) if (edge.text) text(edge.text, true);
  add("rect", { x: 40, y: plan.height - 70, width: 240, height: 50, fill: palette.fill, stroke: palette.stroke, "stroke-width": 2 });
  text({ x: 40, y: plan.height - 58, width: 240, height: 25, text: "Источник / Source" });
  let scale = 1;
  const zoom = (next: number) => {
    scale = Math.max(1, Math.min(8, next));
    svg.style.setProperty("width", `${scale * 100}%`); svg.style.setProperty("height", `${scale * 100}%`);
  };
  button(controls, l("Fit", "Вписать"), "diagram-fit", () => { zoom(1); frame.scrollTo(0, 0); });
  button(controls, l("Zoom in", "Увеличить"), "diagram-zoom-in", () => zoom(scale * 1.5));
  button(controls, l("Zoom out", "Уменьшить"), "diagram-zoom-out", () => zoom(scale / 1.5));
  frame.addEventListener("keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "+" || event.key === "=") { event.preventDefault(); zoom(scale * 1.5); }
    if (event.key === "-") { event.preventDefault(); zoom(scale / 1.5); }
    if (event.key === "0") { event.preventDefault(); zoom(1); frame.scrollTo(0, 0); }
  });
  let drag: { x: number; y: number; left: number; top: number } | undefined;
  frame.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, left: frame.scrollLeft, top: frame.scrollTop };
    frame.setPointerCapture(event.pointerId); frame.focus();
  });
  frame.addEventListener("pointermove", event => { if (drag) frame.scrollTo(drag.left + drag.x - event.clientX, drag.top + drag.y - event.clientY); });
  frame.addEventListener("pointerup", () => { drag = undefined; }); frame.addEventListener("pointercancel", () => { drag = undefined; });
  zoom(1);
}
