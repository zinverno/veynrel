import { t } from "../../i18n";
import { healthButton } from "../ui/renderHealthHome";
import { fitGraph, panGraph, zoomGraph } from "../ui/graphViewport";
import type { Viewport } from "../ui/graphViewport";
import type { WorkbenchModel } from "./workbenchModel";
import { fitPoints, insetCell, MAP_HEIGHT, MAP_WIDTH, wheelFactor, zoneBoundary } from "./workbenchGeometry";
import type { MapItem, XY } from "./workbenchGeometry";
import type { TagZone } from "./workbenchTags";

export interface WorkbenchGraphState { links: boolean; semantic: boolean; viewport: Viewport; focus?: readonly string[]; overview?: Viewport }
export const newWorkbenchGraphState = (): WorkbenchGraphState => ({ links: true, semantic: true, viewport: fitGraph() });
export function focusWorkbench(state: WorkbenchGraphState, paths: readonly string[], model: WorkbenchModel): void {
  state.overview ??= { ...state.viewport };
  const members = new Set(paths);
  model.edges.forEach(edge => { if (paths.includes(edge.source) || paths.includes(edge.target)) { members.add(edge.source); members.add(edge.target); } });
  state.focus = [...members];
}
export function overviewWorkbench(state: WorkbenchGraphState): void {
  if (state.overview) state.viewport = state.overview;
  state.focus = undefined; state.overview = undefined;
}
export interface GraphOptions {
  items: readonly MapItem[]; cells: ReadonlyMap<string, readonly XY[]>; zones: readonly TagZone[]; activeZones: readonly string[];
  zone?: string; selectZone(tag?: string): void; group(paths: readonly string[]): void;
}

/** Geometry is immutable for this render. Camera changes only a transform; no force loop or data IO. */
export function renderWorkbenchGraph(parent: HTMLElement, model: WorkbenchModel, selected: readonly string[], state: WorkbenchGraphState,
  options: GraphOptions, select: (path: string) => void, redraw: () => void): () => void {
  let live = true, frame: number | undefined, capture: number | undefined;
  let frameWindow: Window | undefined;
  const toolbar = parent.createDiv({ cls: "veynrel-workbench-map-tools" });
  const control = (label: string, action: () => void, id: string): HTMLButtonElement => {
    const button = healthButton(toolbar, label, () => { if (live) action(); }, id);
    button.setAttribute("aria-label", label); button.title = label; return button;
  };
  for (const key of ["links", "semantic"] as const) control(t(key === "links" ? "@workbench.links" : "@workbench.meaning"), () => {
    state[key] = !state[key]; redraw();
  }, `workbench-layer-${key}`).setAttribute("aria-pressed", String(state[key]));
  const scene = parent.createDiv({ cls: "veynrel-workbench-map" });
  const svg = scene.createSvg("svg");
  svg.setAttribute("viewBox", `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`); svg.setAttribute("role", "group");
  svg.setAttribute("tabindex", "0"); svg.setAttribute("aria-label", t("@mapnav.canvas"));
  const resize = ():void => {
    if(!live||!svg.clientHeight||!svg.clientWidth)return;
    const width=MAP_HEIGHT*svg.clientWidth/svg.clientHeight;
    svg.setAttribute("viewBox",`${500-width/2} 0 ${width} ${MAP_HEIGHT}`);
  };
  const observer=new (svg.ownerDocument.defaultView as Window & { ResizeObserver: typeof ResizeObserver }).ResizeObserver(resize);observer.observe(svg);resize();
  const element = (tag: string, attributes: Record<string, string | number>, host: Element = svg): SVGElement => {
    const node = host.createSvg(tag as keyof SVGElementTagNameMap);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  };
  const group = element("g", { "data-map-world": "true" });
  const items = options.items.filter(item => !state.focus || (item.members ?? [item.path]).some(path => state.focus!.includes(path)));
  const byPath = new Map(items.map(item => [item.path, item]));
  const activeZones = options.activeZones.map(tag => options.zones.find(zone => zone.tag === tag)).filter((zone): zone is TagZone => Boolean(zone));
  const zoneElements = new Map<string, SVGElement>(), zoneLabels = new Map<string, HTMLElement>();
  const nodes = new Map<string, SVGElement>(), labels: SVGElement[] = [];
  let focusedPath: string | undefined;
  const zoneLayer = element("g", { class: "veynrel-zone-layer" }, group);
  const zoneKeys=parent.createDiv({cls:"veynrel-zone-keys"});parent.insertBefore(zoneKeys,scene);
  for (const [index, zone] of activeZones.entries()) {
    const members = items.filter(item => !item.members && zone.members.has(item.path));
    if (!members.length) continue;
    const d = members.map(point => insetCell(options.cells.get(point.path) ?? [], point, 0)).join(" ");
    const area = element("g", { class: `veynrel-tag-zone zone-style-${index%4}`, "data-zone": zone.tag,
      "data-zone-index": index, tabindex: "0", role: "button", "aria-label": t("@mapnav.zone-label", { tag: zone.tag, count: zone.members.size }) }, zoneLayer);
    element("path",{d,class:"veynrel-zone-fill"},area);
    element("path",{d:zoneBoundary(members.map(point=>options.cells.get(point.path)??[])),class:"veynrel-zone-border"},area);
    zoneElements.set(zone.tag, area);
    const label=healthButton(zoneKeys,`${index+1} · #${zone.tag} · ${zone.members.size}`,()=>{if(live)options.selectZone(zone.tag);},`workbench-zone-key-${encodeURIComponent(zone.tag)}`);
    label.setAttribute("data-zone-title",zone.tag);label.setAttribute("aria-pressed",String(options.zone===zone.tag));
    label.addEventListener("pointerenter",()=>highlight(zone.tag));label.addEventListener("pointerleave",()=>highlight(options.zone));
    label.addEventListener("focus",()=>highlight(zone.tag));label.addEventListener("blur",()=>highlight(options.zone));
    zoneLabels.set(zone.tag,label);
    area.addEventListener("pointerenter", () => highlight(zone.tag)); area.addEventListener("pointerleave", () => highlight(options.zone));
    area.addEventListener("focus", () => highlight(zone.tag)); area.addEventListener("blur", () => highlight(options.zone));
    area.addEventListener("click", () => { if (live && !suppressClick) options.selectZone(zone.tag); });
    area.addEventListener("keydown", event => { if (live && ["Enter"," "].includes(event.key)) { event.preventDefault(); options.selectZone(zone.tag); } });
  }
  const eligibleEdges = model.edges.filter(edge => (edge.kind === "link" ? state.links : state.semantic) && byPath.has(edge.source) && byPath.has(edge.target));
  const relevant = eligibleEdges.filter(edge => !selected.length || selected.includes(edge.source) || selected.includes(edge.target));
  const shownEdges = relevant.slice(0, selected.length ? 80 : 45);
  for (const edge of shownEdges) {
    const a = byPath.get(edge.source)!, b = byPath.get(edge.target)!;
    const line = element("line", { x1:a.x, y1:a.y, x2:b.x, y2:b.y, class:`veynrel-workbench-edge is-${edge.kind}`,
      "data-source":edge.source, "data-target":edge.target, "data-kind":edge.kind }, group);
    element("title", {}, line).textContent = `${edge.source} ${edge.kind === "link" ? "→" : "···"} ${edge.target}${edge.score === undefined ? "" : ` · ${edge.score}`}`;
    if (edge.kind === "link") {
      const angle = Math.atan2(b.y-a.y,b.x-a.x), x = b.x-Math.cos(angle)*8, y = b.y-Math.sin(angle)*8;
      element("path", { d:`M ${x-6*Math.cos(angle-.5)} ${y-6*Math.sin(angle-.5)} L ${x} ${y} L ${x-6*Math.cos(angle+.5)} ${y-6*Math.sin(angle+.5)}`, class:"veynrel-workbench-arrow" }, group);
    }
  }
  const candidatePaths = new Set([...model.repeats,...model.connections].flatMap(pair=>pair.paths));
  for (const point of items) {
    const chosen = (point.members ?? [point.path]).some(path => selected.includes(path));
    const node = element(point.members ? "rect" : "circle", point.members ? { x:point.x-36, y:point.y-22, width:72, height:44, rx:10 } : { cx:point.x, cy:point.y, r:chosen ? 7 : 4.5 }, group);
    node.setAttribute("class", `veynrel-workbench-node${chosen ? " is-selected" : ""}${point.members ? " is-group" : ""}`);
    node.setAttribute(point.members ? "data-group" : "data-path", point.path);
    node.setAttribute("role", "button"); node.setAttribute("tabindex", "0");
    const name = point.members ? `${point.label} · ${point.members.length}` : point.path;
    node.setAttribute("aria-label", name); element("title", {}, node).textContent = name;
    nodes.set(point.path, node);
    const choose = (): void => { if (live && !suppressClick) point.members ? options.group(point.members) : select(point.path); };
    node.addEventListener("click", choose);
    node.addEventListener("keydown", event => { if (["Enter"," "].includes(event.key)) { event.preventDefault(); suppressClick=false;choose(); } });
    node.addEventListener("focus", () => { if (live) { node.classList.add("is-keyboard-focused");focusedPath=point.members?undefined:point.path;highlight(options.zone); } });
    node.addEventListener("blur", () => { node.classList.remove("is-keyboard-focused");focusedPath=undefined;highlight(options.zone); });
    if (candidatePaths.has(point.path)) element("path", { d:`M${point.x+7},${point.y-7} l3,-4 l3,4 l-3,4 Z`, class:"veynrel-candidate-marker" }, group);
    if(chosen) activeZones.forEach((zone,index)=>{if(zone.members.has(point.path)){
      const ring=element("circle",{cx:point.x,cy:point.y,r:11+index*3,class:`veynrel-membership-ring zone-style-${index%4}`,"data-membership":zone.tag},group);
      element("title",{},ring).textContent=`${index+1} · #${zone.tag}`;
    }});
    const label = element("text", { x:point.x+(point.members ? 0 : 10), y:point.y+(point.members ? 5 : selected.indexOf(point.path) === 1 ? 23 : -10),
      "text-anchor":point.members ? "middle" : "start", class:"veynrel-workbench-label", "data-always":String(chosen || Boolean(point.members)) }, group);
    label.textContent = point.members ? String(point.members.length) : point.path.split("/").pop()!.replace(/\.md$/u, ""); labels.push(label);
  }
  function highlight(tag?: string): void {
    if (!live) return;
    const zone = options.zones.find(zone => zone.tag === tag);
    for (const [path,node] of nodes) node.classList.toggle("is-zone-member", zone?.members.has(path) ?? false);
    for (const [key,area] of zoneElements) {
      const member = options.zones.find(zone => zone.tag === key)!;
      const active = key === tag || selected.some(path => member.members.has(path)) || Boolean(focusedPath&&member.members.has(focusedPath));
      area.classList.toggle("is-active", active); zoneLabels.get(key)?.classList.toggle("is-active", active);
    }
  }
  highlight(options.zone);
  const transform = (): void => {
    if (!live) return;
    group.setAttribute("transform", `translate(${state.viewport.x} ${state.viewport.y}) scale(${state.viewport.zoom})`);
    for (const label of labels) label.classList.toggle("is-label-hidden", label.getAttribute("data-always") !== "true" && (state.viewport.zoom < 2.2 || items.length > 200 && state.viewport.zoom < 4));
    svg.setAttribute("data-camera", JSON.stringify(state.viewport));
  };
  const schedule = (): void => { if (frame === undefined) { frameWindow=parent.ownerDocument.defaultView!; frame=frameWindow.requestAnimationFrame(() => { frame=undefined;transform(); }); } };
  transform();
  const svgPoint = (x: number, y: number): XY | undefined => {
    const matrix = svg.getScreenCTM(); if (!matrix) return;
    const point = svg.createSVGPoint(); point.x=x; point.y=y;
    return point.matrixTransform(matrix.inverse());
  };
  const wheel = (event: WheelEvent): void => {
    if (!live) return;
    const anchor = svgPoint(event.clientX,event.clientY); if (!anchor) return;
    event.preventDefault(); event.stopPropagation();
    state.viewport = zoomGraph(state.viewport,wheelFactor(event.deltaY,event.deltaMode,svg.clientHeight),anchor.x,anchor.y,12,.05); schedule();
  };
  svg.addEventListener("wheel",wheel,{ passive:false });
  let drag: { start:XY; last:XY; moved:boolean; id:number; document:Document } | undefined, suppressClick = false;
  const finish = (): void => {
    suppressClick = drag?.moved ?? suppressClick;
    drag?.document.removeEventListener("pointermove",move);
    drag?.document.removeEventListener("pointerup",finish);
    drag?.document.removeEventListener("pointercancel",finish);
    drag = undefined;
    const id = capture; capture = undefined;
    if (id !== undefined && svg.hasPointerCapture(id)) svg.releasePointerCapture(id);
  };
  svg.addEventListener("pointerdown", event => {
    if (!live || event.button !== 0) return;
    suppressClick = false;
    if ((event.target as Element).hasAttribute("data-path") || (event.target as Element).hasAttribute("data-group")) return;
    const point = svgPoint(event.clientX,event.clientY); if (!point) return;
    drag = { start:{ x:event.clientX,y:event.clientY }, last:point,moved:false,id:event.pointerId,document:svg.ownerDocument };
    drag.document.addEventListener("pointermove",move);drag.document.addEventListener("pointerup",finish);drag.document.addEventListener("pointercancel",finish);
  });
  const move = (event:PointerEvent):void => {
    if (!live || !drag || event.pointerId!==drag.id) return;
    const point = svgPoint(event.clientX,event.clientY); if (!point) return;
    if (!drag.moved && Math.hypot(event.clientX-drag.start.x,event.clientY-drag.start.y) > 4) {
      drag.moved=true;capture=event.pointerId;svg.setPointerCapture(capture);svg.focus({preventScroll:true});
    }
    if (drag.moved) { state.viewport=panGraph(state.viewport,point.x-drag.last.x,point.y-drag.last.y,12,.05); schedule(); }
    drag.last=point;
  };
  svg.addEventListener("lostpointercapture",finish);
  svg.addEventListener("keydown", event => {
    if (!live || event.altKey || event.ctrlKey || event.metaKey) return;
    const moves: Record<string,XY> = { ArrowLeft:{ x:50,y:0 }, ArrowRight:{ x:-50,y:0 }, ArrowUp:{ x:0,y:50 }, ArrowDown:{ x:0,y:-50 } };
    if (moves[event.key]) { event.preventDefault(); const move=moves[event.key]; state.viewport=panGraph(state.viewport,move.x,move.y,12,.05); schedule(); }
    else if (["+","=","-"].includes(event.key)) { event.preventDefault(); state.viewport=zoomGraph(state.viewport,event.key === "-" ? .8 : 1.25,500,320,12,.05); schedule(); }
  });
  for (const [key,factor,label] of [["in",1.25,"+"],["out",.8,"−"]] as const) {
    const button=control(t(`@workbench.zoom-${key}`),()=>{ state.viewport=zoomGraph(state.viewport,factor,500,320,12,.05); transform(); },`workbench-zoom-${key}`); button.textContent=label;
  }
  control(t("@workbench.fit"),()=>{ state.viewport=fitPoints(items,svg.viewBox.baseVal.width); transform(); },"workbench-fit");
  if (selected.length) control(t("@mapnav.show-selection"),()=>{ state.viewport=fitPoints(items.filter(item=>(item.members??[item.path]).some(path=>selected.includes(path))),svg.viewBox.baseVal.width); transform(); },"workbench-show-selection");
  parent.createDiv({ cls:"veynrel-map-legend", text:t("@mapnav.legend") });
  parent.createDiv({ cls:"veynrel-map-count", text:t("@mapnav.map-count", { shown:items.reduce((sum,item)=>sum+(item.members?.length??1),0), total:model.nodes.length,
    groups:items.filter(item=>item.members).length, edges:shownEdges.length, hidden:eligibleEdges.length-shownEdges.length }) });
  return () => { live=false; observer.disconnect();if (frame !== undefined) frameWindow?.cancelAnimationFrame(frame); finish(); svg.removeEventListener("wheel",wheel); };
}
