import { freeze, object, text } from "../recipe";

export const DIAGRAM_LIMITS = Object.freeze({ nodes: 30, edges: 60, title: 120, label: 240, edgeLabel: 80, response: 32_000, input: 24_000, outputTokens: 8192, canvas: 24_000 });
export type DiagramKind = "structure" | "flowchart";
export type Shape = "rectangle" | "ellipse" | "diamond";
export interface DiagramNode { id: string; label: string; shape: Shape }
export interface DiagramEdge { id: string; from: string; to: string; label: string }
export interface DiagramSpec { schemaVersion: 1; kind: DiagramKind; title: string; nodes: readonly DiagramNode[]; edges: readonly DiagramEdge[] }
export type DiagramFailure = "spec" | "limit" | "unavailable" | "incompatible" | "reloaded" | "adapter" | "path" | "occupied" | "source-link" | "open";
export class DiagramError extends Error { constructor(readonly code: DiagramFailure) { super(code); } }
export function requireDiagram(value: unknown, code: DiagramFailure): asserts value { if (!value) throw new DiagramError(code); }
const id = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z][a-zA-Z0-9_-]{0,23}$/u.test(v);
const label = (v: unknown, max: number, empty = false): v is string => text(v, max, empty) && !/[\p{Cf}\p{Cs}]/u.test(v);

export function validateDiagramSpec(value: unknown, kind?: DiagramKind): DiagramSpec {
  requireDiagram(object(value, ["schemaVersion", "kind", "title", "nodes", "edges"]) && value.schemaVersion === 1 &&
    (value.kind === "structure" || value.kind === "flowchart") && (!kind || value.kind === kind) && label(value.title, DIAGRAM_LIMITS.title) &&
    Array.isArray(value.nodes) && value.nodes.length > 0 && Array.isArray(value.edges), "spec");
  requireDiagram(value.nodes.length <= DIAGRAM_LIMITS.nodes && value.edges.length <= DIAGRAM_LIMITS.edges, "limit");
  const ids = new Set<string>();
  const nodes = value.nodes.map(n => {
    requireDiagram(object(n, ["id", "label", "shape"]) && id(n.id) && !ids.has(n.id) && label(n.label, DIAGRAM_LIMITS.label) &&
      (n.shape === "rectangle" || n.shape === "ellipse" || n.shape === "diamond"), "spec");
    ids.add(n.id); return { id: n.id, label: n.label, shape: n.shape };
  });
  const endpoints = new Set(ids);
  const edges = value.edges.map(e => {
    requireDiagram(object(e, ["id", "from", "to", "label"]) && id(e.id) && !ids.has(e.id) && id(e.from) && id(e.to) &&
      endpoints.has(e.from) && endpoints.has(e.to) && label(e.label, DIAGRAM_LIMITS.edgeLabel, true), "spec");
    ids.add(e.id); return { id: e.id, from: e.from, to: e.to, label: e.label };
  });
  return freeze({ schemaVersion: 1, kind: value.kind, title: value.title, nodes, edges }) as DiagramSpec;
}
export function parseDiagramSpec(raw: string, kind: DiagramKind): DiagramSpec {
  requireDiagram(raw.length <= DIAGRAM_LIMITS.response, "limit");
  // Reject deep input before JSON.parse; the schema has no recursive fields.
  let depth = 0, quoted = false, escaped = false;
  for (const c of raw) {
    if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === "{" || c === "[") { requireDiagram(++depth <= 4, "spec"); }
    else if (c === "}" || c === "]") depth--;
  }
  let value: unknown; try { value = JSON.parse(raw); } catch { throw new DiagramError("spec"); }
  return validateDiagramSpec(value, kind);
}

/** Fullwidth punctuation stays visible but cannot become Excalidraw links, embeds or Markdown section delimiters. */
export function inertLabel(value: string): string {
  return value.replace(/\r\n?/gu, "\n").replace(/\t/gu, "  ").replace(/[[\]<>:`\\^%#$]/gu, c => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
}
