import { edgeAttraction, pairId } from "./workbenchModel";
import type { MapPoint, WorkbenchEdge, WorkbenchNode } from "./workbenchModel";

interface Particle extends MapPoint { vx: number; vy: number; fixed?: { x: number; y: number } }
export function pathSeed(path: string): number {
  let value = 2166136261;
  for (const char of path) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}
/** UI-owned coordinates only. Cooling is finite; the renderer owns scheduling/visibility. */
export class WorkbenchSimulation {
  points: Particle[] = [];
  private springs: { a: Particle; b: Particle; length: number; strength: number }[] = [];
  alpha = 0;
  ticks = 0;
  revisions = 0;
  paused = false;
  milliseconds = 0;
  update(nodes: readonly WorkbenchNode[], edges: readonly WorkbenchEdge[]): void {
    const previous = new Map(this.points.map(point => [point.path, point]));
    const ordered = [...nodes].sort((a,b) => pathSeed(a.path)-pathSeed(b.path) || a.path.localeCompare(b.path));
    this.points = ordered.map((node, i) => {
      const old = previous.get(node.path);
      if (old) return old;
      const angle = i * Math.PI * (3-Math.sqrt(5)), radius = 22 * Math.sqrt(i+1);
      return { path:node.path, x:500+Math.cos(angle)*radius, y:320+Math.sin(angle)*radius, vx:0, vy:0 };
    });
    const byPath = new Map(this.points.map(point => [point.path, point]));
    this.springs = [];
    const seen = new Set<string>();
    if (nodes.length <= 500) for (const edge of edges) {
      const id = `${edge.kind}:${pairId(edge.source,edge.target)}`, a=byPath.get(edge.source), b=byPath.get(edge.target);
      if (!a || !b || a===b || seen.has(id)) continue;
      if (edge.kind === "semantic" && (edge.score === undefined || !Number.isFinite(edge.score))) continue;
      seen.add(id); this.springs.push({ a,b,...edgeAttraction(edge) });
    }
    this.alpha = nodes.length > 1 && nodes.length <= 500 ? .65 : 0;
    this.revisions++;
  }
  pin(path: string, x: number, y: number): void {
    const point = this.points.find(point => point.path === path);
    if (!point || !Number.isFinite(x) || !Number.isFinite(y)) return;
    point.fixed = {x,y}; point.x=x;point.y=y;point.vx=0;point.vy=0;
    if (!this.paused && this.points.length<=500) this.alpha=Math.max(this.alpha,.22);
  }
  release(path: string): void { const point=this.points.find(point=>point.path===path);if(point)point.fixed=undefined; }
  tick(): boolean {
    if (this.paused || this.alpha < .006 || this.points.length > 500) return false;
    const started=performance.now(), alpha=this.alpha, points=this.points;
    for (let i=0;i<points.length;i++) for (let j=i+1;j<points.length;j++) {
      const a=points[i], b=points[j];let dx=b.x-a.x,dy=b.y-a.y;
      if (Math.abs(dx)+Math.abs(dy)<.001) { dx=.1;dy=.1; }
      const squared=dx*dx+dy*dy, distance=Math.sqrt(squared);
      const force=alpha*100/Math.max(100,squared)+(distance<18?(18-distance)/distance*.18:0);
      a.vx-=dx*force;a.vy-=dy*force;b.vx+=dx*force;b.vy+=dy*force;
    }
    for (const {a,b,length,strength} of this.springs) {
      const dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy)||1,force=(distance-length)/distance*strength*alpha;
      a.vx+=dx*force;a.vy+=dy*force;b.vx-=dx*force;b.vy-=dy*force;
    }
    for (const point of points) {
      if (point.fixed) {point.x=point.fixed.x;point.y=point.fixed.y;point.vx=0;point.vy=0;continue;}
      point.vx=(point.vx+(500-point.x)*.007*alpha)*.65;
      point.vy=(point.vy+(320-point.y)*.007*alpha)*.65;
      point.x+=Math.max(-7,Math.min(7,point.vx));point.y+=Math.max(-7,Math.min(7,point.vy));
    }
    this.alpha*=.96;this.ticks++;this.milliseconds+=performance.now()-started;
    if(this.alpha<.006){this.alpha=0;points.forEach(point=>{point.vx=0;point.vy=0;});}
    return true;
  }
  settle(): void { for(let i=0;i<160 && this.tick();i++) { /* finite nonanimated placement */ } }
}
