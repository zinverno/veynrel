import type { MapPoint } from "./workbenchModel";
import type { Viewport } from "../ui/graphViewport";
export const MAP_WIDTH = 1000, MAP_HEIGHT = 640;
export interface MapItem extends MapPoint { members?: readonly string[]; label?: string }
/** All files are accounted for. Group IDs are presentation-only and never passed to file actions. */
export function mapItems(points: readonly MapPoint[]): MapItem[] {
  if (points.length <= 500) return normalizePoints(points);
  const sorted = [...points].sort((a,b) => a.path < b.path ? -1 : 1), size = Math.max(100, Math.ceil(sorted.length / 64));
  const groups: MapItem[] = [];
  for (let i = 0; i < sorted.length; i += size) {
    const members = sorted.slice(i, i + size).map(point => point.path), first = members[0], last = members[members.length - 1];
    const prefix = first.split("/").slice(0, -1).filter((part, n, all) => last.startsWith(`${all.slice(0,n+1).join("/")}/`)).join("/");
    groups.push({ path: `group:${i}`, x: (groups.length % 8) * 100, y: Math.floor(groups.length / 8) * 100,
      members, label: prefix || `${first.split("/").pop()} … ${last.split("/").pop()}` });
  }
  return normalizePoints(groups);
}
function normalizePoints<T extends MapPoint>(points: readonly T[]): T[] {
  const minX = Math.min(0, ...points.map(p => p.x)), maxX = Math.max(1, ...points.map(p => p.x));
  const minY = Math.min(0, ...points.map(p => p.y)), maxY = Math.max(1, ...points.map(p => p.y));
  const scale = Math.min(860 / Math.max(200, maxX-minX), 500 / Math.max(200, maxY-minY));
  return points.map(p => ({ ...p, x: 500+(p.x-(minX+maxX)/2)*scale, y: 320+(p.y-(minY+maxY)/2)*scale }));
}
export interface XY { x: number; y: number }
/** Bounded Voronoi cells: no other document center can be enclosed by a member's zone. */
export function membershipCells(points: readonly MapItem[]): ReadonlyMap<string, readonly XY[]> {
  const result = new Map<string, XY[]>();
  for (const p of points) {
    if (p.members) continue;
    let polygon = [{ x:p.x-60, y:p.y-60 }, { x:p.x+60, y:p.y-60 }, { x:p.x+60, y:p.y+60 }, { x:p.x-60, y:p.y+60 }];
    for (const q of points) {
      if (p === q || Math.abs(q.x-p.x) > 180 || Math.abs(q.y-p.y) > 180) continue;
      const nx = q.x-p.x, ny = q.y-p.y, mid = (q.x*q.x+q.y*q.y-p.x*p.x-p.y*p.y)/2;
      const next: XY[] = [];
      for (let i=0; i<polygon.length; i++) {
        const a = polygon[i], b = polygon[(i+1)%polygon.length], da = a.x*nx+a.y*ny-mid, db = b.x*nx+b.y*ny-mid;
        if (da <= 0) next.push(a);
        if ((da <= 0) !== (db <= 0)) { const t = da/(da-db); next.push({ x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t }); }
      }
      polygon = next;
    }
    result.set(p.path, polygon);
  }
  return result;
}
export function insetCell(polygon: readonly XY[], center: XY, inset: number): string {
  return polygon.length ? polygon.map((p,i) => `${i ? "L" : "M"}${center.x+(p.x-center.x)*(1-inset)},${center.y+(p.y-center.y)*(1-inset)}`).join(" ")+" Z" : "";
}
/** Cancel shared cell edges instead of drawing a misleading convex hull around nonmembers. */
export function zoneBoundary(cells: readonly (readonly XY[])[]): string {
  const edges = new Map<string, readonly [XY,XY]>();
  const key = (p:XY):string => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  for (const polygon of cells) for (let i=0;i<polygon.length;i++) {
    const a=polygon[i],b=polygon[(i+1)%polygon.length],ka=key(a),kb=key(b),id=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`;
    if(edges.has(id))edges.delete(id);else edges.set(id,[a,b]);
  }
  return [...edges.values()].map(([a,b])=>`M${a.x},${a.y} L${b.x},${b.y}`).join(" ");
}
export function wheelFactor(delta: number, mode: number, pageHeight: number): number {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? pageHeight : 1);
  return Math.exp(-Math.max(-240, Math.min(240, pixels)) * .0025);
}
export function fitPoints(points: readonly XY[], width = MAP_WIDTH, height = MAP_HEIGHT): Viewport {
  if (!points.length) return { x:0, y:0, zoom:1 };
  const left = Math.min(...points.map(p=>p.x)), right = Math.max(...points.map(p=>p.x));
  const top = Math.min(...points.map(p=>p.y)), bottom = Math.max(...points.map(p=>p.y));
  const zoom = Math.max(.05,Math.min(4, (width-100)/Math.max(160,right-left), (height-100)/Math.max(160,bottom-top)));
  return { x:500-(left+right)/2*zoom, y:320-(top+bottom)/2*zoom, zoom };
}
