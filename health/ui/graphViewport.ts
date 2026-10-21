export interface Viewport { readonly x: number; readonly y: number; readonly zoom: number }
export const fitGraph = (): Viewport => ({ x: 0, y: 0, zoom: 1 });
export function clampZoom(value: number, maxZoom = 4, minZoom = 0.4): number { return Number.isFinite(value) ? Math.max(minZoom, Math.min(maxZoom, value)) : 1; }
export function panGraph(view: Viewport, dx: number, dy: number, maxZoom = 4, minZoom = 0.4): Viewport {
  const bound = (n: number): number => Number.isFinite(n) ? Math.max(-1000 * maxZoom, Math.min(1000 * maxZoom, n)) : 0;
  return { x: bound(view.x + dx), y: bound(view.y + dy), zoom: clampZoom(view.zoom, maxZoom, minZoom) };
}
export function zoomGraph(view: Viewport, factor: number, x: number, y: number, maxZoom = 4, minZoom = 0.4): Viewport {
  const zoom = clampZoom(view.zoom * factor, maxZoom, minZoom); const ratio = zoom / clampZoom(view.zoom, maxZoom, minZoom);
  return panGraph({ x: view.x, y: view.y, zoom }, (x - view.x) * (1 - ratio), (y - view.y) * (1 - ratio), maxZoom, minZoom);
}
