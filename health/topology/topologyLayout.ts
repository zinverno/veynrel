import { compareStrings } from "../domain/validation";
import type { VaultTopologySnapshot } from "./types";

export interface TopologyPoint { readonly path: string; readonly x: number; readonly y: number; readonly radius: number }
export interface TopologyBounds { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface TopologyLayout {
  readonly points: readonly TopologyPoint[];
  readonly components: readonly (TopologyBounds & { readonly id: string })[];
  readonly bounds: TopologyBounds;
}

/** Deterministic BFS rings and shelf packing. No pairwise repulsion or physics. */
export function layoutTopology(map: VaultTopologySnapshot): TopologyLayout {
  const nodes = new Map(map.nodes.map((node) => [node.path, node]));
  const adjacent = new Map(map.nodes.map((node) => [node.path, new Set<string>()]));
  for (const edge of map.edges) { adjacent.get(edge.source)!.add(edge.target); adjacent.get(edge.target)!.add(edge.source); }
  const neighbors = new Map([...adjacent].map(([path, paths]) => [path, [...paths].sort(compareStrings)]));
  const blocks: Array<{ id: string; size: number; points: Array<{ path: string; x: number; y: number }> }> = [];
  const singles: string[] = [];
  for (const component of map.components) {
    if (component.paths.length === 1) { singles.push(component.paths[0]); continue; }
    const root = [...component.paths].sort((a, b) => nodes.get(b)!.degree - nodes.get(a)!.degree || compareStrings(a, b))[0];
    const queue = [root]; const depths = new Map([[root, 0]]); const levels: string[][] = [[root]];
    for (let index = 0; index < queue.length; index++) {
      const path = queue[index]; const depth = depths.get(path)! + 1;
      for (const neighbor of neighbors.get(path)!) if (!depths.has(neighbor)) {
        depths.set(neighbor, depth); queue.push(neighbor);
        (levels[depth] ??= []).push(neighbor);
      }
    }
    let radius = 0;
    const points = [{ path: root, x: 0, y: 0 }];
    for (const level of levels.slice(1)) {
      level.sort(compareStrings);
      radius = Math.max(radius + 32, level.length * 22 / (2 * Math.PI));
      level.forEach((path, index) => {
        const angle = 2 * Math.PI * index / level.length - Math.PI / 2;
        points.push({ path, x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
      });
    }
    // Area follows component size so the primary component always gets the largest region.
    const size = Math.max(120, Math.sqrt(component.paths.length) * 50);
    const shrink = (size - 48) / (2 * Math.max(1, radius));
    blocks.push({ id: component.id, size, points: points.map((point) => ({ path: point.path, x: point.x * shrink, y: point.y * shrink })) });
  }
  const targetWidth = Math.max(200, ...blocks.map((block) => block.size), Math.sqrt(blocks.reduce((sum, block) => sum + block.size ** 2, 0)) * 1.35);
  const raw: Array<{ path: string; x: number; y: number }> = [];
  const boxes: Array<TopologyBounds & { id: string }> = [];
  let x = 0; let y = 0; let rowHeight = 0; let width = 0;
  for (const block of blocks) {
    if (x > 0 && x + block.size > targetWidth) { y += rowHeight + 32; x = 0; rowHeight = 0; }
    for (const point of block.points) raw.push({ path: point.path, x: x + block.size / 2 + point.x, y: y + block.size / 2 + point.y });
    boxes.push({ id: block.id, x, y, width: block.size, height: block.size });
    width = Math.max(width, x + block.size); rowHeight = Math.max(rowHeight, block.size); x += block.size + 32;
  }
  let height = y + rowHeight;
  if (singles.length) {
    // A separate stable region for observed zero-degree nodes, including unknowns in partial maps.
    const columns = Math.max(1, Math.ceil(Math.sqrt(singles.length * 2)));
    const top = height ? height + 48 : 0;
    singles.sort(compareStrings).forEach((path, index) => raw.push({ path, x: 24 + (index % columns) * 28, y: top + 24 + Math.floor(index / columns) * 28 }));
    width = Math.max(width, columns * 28 + 20); height = top + Math.ceil(singles.length / columns) * 28 + 20;
  }
  const scale = 920 / Math.max(width, height, 100);
  const offsetX = (1000 - width * scale) / 2; const offsetY = (1000 - height * scale) / 2;
  return Object.freeze({ bounds: Object.freeze({ x: 0, y: 0, width: 1000, height: 1000 }),
    points: Object.freeze(raw.map((point) => Object.freeze({ path: point.path, x: offsetX + point.x * scale, y: offsetY + point.y * scale,
      radius: Math.min(10, (4 + Math.min(4, Math.sqrt(nodes.get(point.path)!.degree))) * scale) }))),
    components: Object.freeze(boxes.map((box) => Object.freeze({ id: box.id, x: offsetX + box.x * scale, y: offsetY + box.y * scale, width: box.width * scale, height: box.height * scale }))),
  });
}

export interface Viewport { readonly x: number; readonly y: number; readonly zoom: number }
export const fitTopology = (): Viewport => ({ x: 0, y: 0, zoom: 1 });
export function clampZoom(value: number): number { return Number.isFinite(value) ? Math.max(0.4, Math.min(4, value)) : 1; }
export function panTopology(view: Viewport, dx: number, dy: number): Viewport {
  const bound = (n: number): number => Number.isFinite(n) ? Math.max(-4000, Math.min(4000, n)) : 0;
  return { x: bound(view.x + dx), y: bound(view.y + dy), zoom: clampZoom(view.zoom) };
}
export function zoomTopology(view: Viewport, factor: number, x: number, y: number): Viewport {
  const zoom = clampZoom(view.zoom * factor); const ratio = zoom / clampZoom(view.zoom);
  return panTopology({ x: view.x, y: view.y, zoom }, (x - view.x) * (1 - ratio), (y - view.y) * (1 - ratio));
}
