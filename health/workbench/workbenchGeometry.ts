import type { MapPoint } from "./workbenchModel";
import type { Viewport } from "../ui/graphViewport";
export const MAP_WIDTH = 1000, MAP_HEIGHT = 640;
export const canvasWorldWidth=(width:number,height:number):number=>height>0?width*MAP_HEIGHT/height:MAP_WIDTH;
export interface MapItem extends MapPoint { members?: readonly string[]; label?: string }
/** All files are accounted for. Group IDs are presentation-only and never passed to file actions. */
export function mapItems(points: readonly MapPoint[]): MapItem[] {
  if (points.length <= 500) return [...points];
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
export function wheelFactor(delta: number, mode: number, pageHeight: number): number {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? pageHeight : 1);
  return Math.exp(-Math.max(-80, Math.min(80, pixels)) * .002);
}
export function fitPoints(points: readonly XY[], width = MAP_WIDTH, height = MAP_HEIGHT): Viewport {
  if (!points.length) return { x:0, y:0, zoom:1 };
  const left = Math.min(...points.map(p=>p.x)), right = Math.max(...points.map(p=>p.x));
  const top = Math.min(...points.map(p=>p.y)), bottom = Math.max(...points.map(p=>p.y));
  const zoom = Math.max(.05,Math.min(4, (width-100)/Math.max(160,right-left), (height-100)/Math.max(160,bottom-top)));
  return { x:500-(left+right)/2*zoom, y:320-(top+bottom)/2*zoom, zoom };
}
