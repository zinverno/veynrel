import { t } from "../../i18n";
import { healthButton } from "../ui/renderHealthHome";
import { fitGraph, panGraph, zoomGraph } from "../ui/graphViewport";
import type { Viewport } from "../ui/graphViewport";
import type { MapPoint, WorkbenchModel } from "./workbenchModel";

export interface WorkbenchGraphState { links: boolean; semantic: boolean; viewport: Viewport }
export const newWorkbenchGraphState = (): WorkbenchGraphState => ({ links: true, semantic: true, viewport: fitGraph() });

/** One map, two independently patterned layers. Selected endpoints never manufacture an edge. */
export function renderWorkbenchGraph(parent: HTMLElement, model: WorkbenchModel, points: readonly MapPoint[], selected: readonly string[],
  state: WorkbenchGraphState, select: (path: string) => void, redraw: () => void): void {
  const toolbar = parent.createDiv({ cls: "veynrel-workbench-map-tools" });
  for (const [key, label] of [["links", "links"], ["semantic", "meaning"]] as const) {
    const button = healthButton(toolbar, t(`@workbench.${label}`), () => { state[key] = !state[key]; redraw(); }, `workbench-layer-${key}`);
    button.setAttribute("aria-pressed", String(state[key]));
  }
  const scene = parent.createDiv({ cls: "veynrel-workbench-map" });
  const svg = scene.createSvg("svg");
  svg.setAttribute("viewBox", "0 0 800 560"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", t("@workbench.map-label"));
  const element = (tag: string, attributes: Record<string, string | number>, host: Element = svg): SVGElement => {
    const node = host.createSvg(tag as keyof SVGElementTagNameMap);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  };
  const visible = new Set(selected);
  for (const edge of model.edges) if (selected.includes(edge.source) || selected.includes(edge.target)) {
    if (visible.size < 80) { visible.add(edge.source); visible.add(edge.target); }
  }
  if (!selected.length) points.slice(0, 80).forEach(point => visible.add(point.path));
  const shown = points.filter(point => visible.has(point.path));
  const minX = shown.length ? Math.min(...shown.map(point => point.x)) : 0, maxX = shown.length ? Math.max(...shown.map(point => point.x)) : 1;
  const minY = shown.length ? Math.min(...shown.map(point => point.y)) : 0, maxY = shown.length ? Math.max(...shown.map(point => point.y)) : 1;
  const scale = Math.min(700 / Math.max(200, maxX - minX), 440 / Math.max(200, maxY - minY));
  const byPath = new Map(points.map(point => [point.path, { x: 400 + (point.x-(minX+maxX)/2)*scale, y: 280 + (point.y-(minY+maxY)/2)*scale }]));
  const group = element("g", {});
  const transform = (): void => group.setAttribute("transform", `translate(${state.viewport.x} ${state.viewport.y}) scale(${state.viewport.zoom})`);
  transform();
  for (const edge of model.edges) {
    if (edge.kind === "link" ? !state.links : !state.semantic) continue;
    if (!visible.has(edge.source) || !visible.has(edge.target)) continue;
    if (selected.length && !selected.includes(edge.source) && !selected.includes(edge.target)) continue;
    const a = byPath.get(edge.source)!, b = byPath.get(edge.target)!;
    const line = element("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: `veynrel-workbench-edge is-${edge.kind}`,
      "data-source": edge.source, "data-target": edge.target, "data-kind": edge.kind }, group);
    element("title", {}, line).textContent = `${edge.source} ${edge.kind === "link" ? "→" : "···"} ${edge.target}`;
    if (edge.kind === "link") {
      const angle = Math.atan2(b.y-a.y,b.x-a.x), x = b.x-Math.cos(angle)*9, y = b.y-Math.sin(angle)*9;
      element("path", { d: `M ${x-7*Math.cos(angle-.5)} ${y-7*Math.sin(angle-.5)} L ${x} ${y} L ${x-7*Math.cos(angle+.5)} ${y-7*Math.sin(angle+.5)}`,
        class: "veynrel-workbench-arrow" }, group);
    }
  }
  for (const point of shown) {
    const position = byPath.get(point.path)!, chosen = selected.includes(point.path);
    const circle = element("circle", { cx: position.x, cy: position.y, r: chosen ? 8 : 5,
      class: `veynrel-workbench-node${chosen ? " is-selected" : ""}`, "data-path": point.path }, group);
    element("title", {}, circle).textContent = point.path;
    circle.addEventListener("click", () => select(point.path));
    if (chosen) element("text", { x: position.x + (position.x > 400 ? -12 : 12), y: position.y + (selected.indexOf(point.path) === 0 ? -20 : 30), "text-anchor": position.x > 400 ? "end" : "start", class: "veynrel-workbench-label" }, group).textContent = point.path.split("/").slice(-2).join("/");
  }
  let drag: { x: number; y: number } | undefined;
  svg.addEventListener("pointerdown", event => { if ((event.target as Element).tagName === "circle") return; drag = { x: event.clientX, y: event.clientY }; svg.setPointerCapture(event.pointerId); });
  svg.addEventListener("pointermove", event => {
    if (!drag) return;
    const ratio = 800 / Math.max(1, svg.getBoundingClientRect().width);
    state.viewport = panGraph(state.viewport, (event.clientX-drag.x)*ratio, (event.clientY-drag.y)*ratio);
    drag = { x: event.clientX, y: event.clientY }; transform();
  });
  svg.addEventListener("pointerup", () => { drag = undefined; }); svg.addEventListener("pointercancel", () => { drag = undefined; });
  const controls = parent.createDiv({ cls: "veynrel-workbench-map-tools" });
  for (const [key, factor] of [["in", 1.25], ["out", 0.8]] as const) healthButton(controls, t(`@workbench.zoom-${key}`), () => {
    state.viewport = zoomGraph(state.viewport, factor, 400, 280); transform();
  }, `workbench-zoom-${key}`);
  healthButton(controls, t("@workbench.fit"), () => { state.viewport = fitGraph(); transform(); }, "workbench-fit");
  for (const [key, x, y] of [["left", 60, 0], ["right", -60, 0], ["up", 0, 60], ["down", 0, -60]] as const)
    healthButton(controls, t(`@workbench.pan-${key}`), () => { state.viewport = panGraph(state.viewport, x, y); transform(); }, `workbench-pan-${key}`);
  parent.createEl("p", { text: t("@workbench.legend"), cls: "veynrel-data-note" });
  parent.createEl("p", { text: t("@workbench.map-limit", { shown: shown.length, total: model.nodes.length }), cls: "veynrel-data-note" });
}
