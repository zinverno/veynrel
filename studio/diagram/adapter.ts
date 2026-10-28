import { TFile, TFolder } from "obsidian";
import type { App } from "obsidian";
import { atomKey, validateAtomizationPath } from "../../consolidation/atomizationPlan";
import { freeze } from "../recipe";
import { DiagramError, requireDiagram } from "./spec";
import type { DiagramSpec } from "./spec";
import { layoutDiagram, PALETTES } from "./layout";
import type { DiagramLayout, DiagramOptions, TextBox } from "./layout";

export const EXCALIDRAW_VERSION = "2.29.0";
export const EXCALIDRAW_ID = "obsidian-excalidraw-plugin";
export interface NativeElement {
  id: string; type: string; x: number; y: number; width: number; height: number;
  link?: string | null; text?: string; originalText?: string; rawText?: string; containerId?: string | null;
  boundElements?: { id: string; type: string }[] | null; points?: [number, number][];
  startBinding?: { elementId: string; mode: string; fixedPoint: [number, number] } | null;
  endBinding?: { elementId: string; mode: string; fixedPoint: [number, number] } | null;
  isDeleted?: boolean; strokeColor: string; backgroundColor: string;
  [key: string]: unknown;
}
/** Narrow local contract checked against 2.29.0 source; its published d.ts omits exactPath. */
export interface DiagramEA {
  targetView: unknown; destroyed?: boolean;
  style: Record<string, unknown>; canvas: Record<string, unknown>; elementsDict: Record<string, NativeElement>; imagesDict: Record<string, unknown>;
  getAPI(): DiagramEA; destroy(): void; measureText(text: string): { width: number; height: number };
  addRect(x: number, y: number, w: number, h: number, id?: string): string;
  addEllipse(x: number, y: number, w: number, h: number, id?: string): string;
  addDiamond(x: number, y: number, w: number, h: number, id?: string): string;
  addText(x: number, y: number, text: string, options?: { width?: number; height?: number; textAlign?: string; textVerticalAlign?: string }, id?: string): string;
  addArrow(points: [number, number][], options: { startObjectId: string; endObjectId: string; startFixedPoint: [number, number]; endFixedPoint: [number, number]; startArrowHead: null; endArrowHead: "arrow" }, id?: string): string;
  getElements(): NativeElement[];
  create(options: { exactPath: string; silent: true; validateBeforeCreate: () => void; frontmatterKeys: Record<string, string | boolean> }): Promise<string>;
  decompressFromBase64(raw: string): string;
}
interface ExcalidrawPlugin { manifest: { version: string }; ea: DiagramEA; settings: { autoexportExcalidraw?: boolean } }
export interface DiagramScene { format: 1; elements: readonly NativeElement[]; canvas: Record<string, unknown>; sourcePath: string; sourceElement: string }
export interface DiagramPlan { layout: DiagramLayout; scene: DiagramScene }
export interface Capability { state: "unavailable" | "incompatible" | "ready" | "busy" | "error"; version?: string; reason?: string }
export interface DiagramAdapter {
  capability(): Capability;
  plan(spec: DiagramSpec, options: DiagramOptions, source: TFile, target: string): DiagramPlan;
  verifyPlan(plan: DiagramPlan): void;
  checkTarget(path: string): Promise<void>;
  create(plan: DiagramPlan, path: string, guard: () => void): Promise<void>;
  read(path: string): Promise<{ raw: string; elements: NativeElement[] } | null>;
  open(path: string): Promise<void>;
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const elementId = (prefix: string, index: number) => `${prefix}${String(index).padStart(6, "0")}`;
const frontmatter = { "excalidraw-plugin": "raw", "excalidraw-autoexport": "none", "excalidraw-open-md": false };

export function nativeScene(ea: DiagramEA, layout: DiagramLayout, sourcePath: string): DiagramScene {
  const palette = PALETTES[layout.options.theme];
  Object.assign(ea.style, { fontFamily: 2, fontSize: 20, strokeColor: palette.stroke, backgroundColor: palette.fill, fillStyle: "solid", strokeWidth: 2, roughness: 0, roundness: null, opacity: 100, angle: 0 });
  Object.assign(ea.canvas, { theme: "light", viewBackgroundColor: palette.canvas, gridSize: 0 });
  const text = (box: TextBox, id: string, container?: string) => {
    ea.addText(box.x, box.y, box.text, { width: box.width || 1, height: box.height, textAlign: "center", textVerticalAlign: "middle" }, id);
    const el = ea.elementsDict[id];
    Object.assign(el, { x: box.x, y: box.y, width: box.width || 1, height: box.height, text: box.text, originalText: box.text, rawText: box.text, containerId: container ?? null, link: null });
    if (container) (ea.elementsDict[container].boundElements ??= []).push({ id, type: "text" });
  };
  text(layout.title, "vtitle00");
  const ids = new Map<string, string>();
  layout.nodes.forEach((n, i) => {
    const id = elementId("vn", i); ids.set(n.id, id);
    const method = n.shape === "ellipse" ? "addEllipse" : n.shape === "diamond" ? "addDiamond" : "addRect";
    ea[method](n.x, n.y, n.width, n.height, id); text(n.text, elementId("vt", i), id);
  });
  ea.style.strokeColor = palette.accent;
  layout.edges.forEach((e, i) => {
    const id = elementId("ve", i);
    ea.addArrow(clone(e.points), { startObjectId: ids.get(e.from)!, endObjectId: ids.get(e.to)!, startFixedPoint: e.start,
      endFixedPoint: e.end, startArrowHead: null, endArrowHead: "arrow" }, id);
    if (e.text) text(e.text, elementId("vl", i), id);
  });
  ea.style.strokeColor = palette.stroke;
  const sourceElement = "vsource0";
  ea.addRect(40, layout.height - 70, 240, 50, sourceElement);
  ea.elementsDict[sourceElement].link = `[[${sourcePath}]]`;
  text({ x: 60, y: layout.height - 58, width: 200, height: 25, text: "Источник / Source" }, "vsource1", sourceElement);
  const elements = clone(ea.getElements());
  elements.forEach((e, i) => { e.seed = i + 1; e.versionNonce = i + 1; e.updated = 0; });
  const scene = { format: 1 as const, elements, canvas: clone(ea.canvas), sourcePath, sourceElement };
  validateScene(scene); return freeze(scene);
}

export function validateScene(scene: DiagramScene): void {
  requireDiagram(scene.format === 1 && scene.elements.length > 0 && scene.elements.length <= 183, "adapter");
  const ids = new Map(scene.elements.map(e => [e.id, e]));
  requireDiagram(ids.size === scene.elements.length, "adapter");
  for (const e of scene.elements) {
    requireDiagram(["rectangle", "ellipse", "diamond", "text", "arrow"].includes(e.type) && !e.isDeleted &&
      [e.x, e.y, e.width, e.height].every(n => Number.isFinite(n) && Math.abs(n) <= 24_000) &&
      (!e.link || e.id === scene.sourceElement && e.link === `[[${scene.sourcePath}]]`) &&
      !e.fileId && !e.customData && !e.embeddable && !e.script, "adapter");
    if (e.type === "text") requireDiagram(typeof e.text === "string" && !/[[\]<>:`\\^%#$]/u.test(e.text) &&
      e.originalText === e.text && e.rawText === e.text && (!e.containerId || ids.get(e.containerId)?.boundElements?.some(b => b.id === e.id && b.type === "text")), "adapter");
    if (e.type === "arrow") for (const binding of [e.startBinding, e.endBinding]) {
      requireDiagram(binding && ids.get(binding.elementId)?.boundElements?.some(b => b.type === "arrow" && b.id === e.id), "adapter");
    }
  }
}

/** Compare content/geometry/bindings, allowing bookkeeping and native text-metric normalization. */
export function sceneSignature(elements: readonly NativeElement[]): string {
  return JSON.stringify(elements.filter(e => !e.isDeleted).map(e => ({ id: e.id, type: e.type,
    geometry: e.type === "arrow" || e.type === "text" && e.containerId ? null : e.type === "text" ? [e.x, e.y] : [e.x, e.y, e.width, e.height],
    text: e.type === "text" ? (e.rawText ?? e.originalText ?? e.text) : null,
    visibleText: e.type === "text" ? e.text?.replace(/\s+/gu, " ").trim() : null, container: e.containerId ?? null, link: e.link || null,
    stroke: e.strokeColor, fill: e.backgroundColor,
    style: [e.fontSize, e.fontFamily, e.lineHeight, e.strokeWidth, e.strokeStyle, e.fillStyle, e.roughness, e.opacity, e.angle, e.roundness, e.textAlign, e.verticalAlign, e.startArrowhead, e.endArrowhead],
    groups: e.groupIds ?? [],
    route: e.points?.slice(1, -1).map(p => [Math.round((p[0] + e.x) * 100) / 100, Math.round((p[1] + e.y) * 100) / 100]) ?? null,
    start: e.startBinding ? [e.startBinding.elementId, e.startBinding.mode, e.startBinding.fixedPoint] : null,
    end: e.endBinding ? [e.endBinding.elementId, e.endBinding.mode, e.endBinding.fixedPoint] : null,
    bound: [...(e.boundElements ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
  })).sort((a, b) => a.id.localeCompare(b.id)));
}

export function sameScene(expected: readonly NativeElement[], actual: readonly NativeElement[]): boolean {
  if (sceneSignature(expected) !== sceneSignature(actual)) return false;
  // Native 2.29.0 recomputes orbit-bound endpoints with a 6px gap on first open.
  return expected.filter(e => e.type === "arrow").every(e => {
    const a = actual.find(a => a.id === e.id)!;
    if (!e.points || !a.points || e.points.length !== a.points.length) return false;
    return [0, e.points.length - 1].every(i => Math.hypot(e.x + e.points![i][0] - a.x - a.points![i][0], e.y + e.points![i][1] - a.y - a.points![i][1]) <= 8);
  });
}

function verifyMarkdownMetadata(raw: string, drawingOffset: number, elements: readonly NativeElement[]): void {
  const front = /^---\n([\s\S]*?)\n---\n/u.exec(raw);
  requireDiagram(front, "adapter");
  const fields = front[1].trim().split("\n").map(line => line.trim()).filter(Boolean);
  requireDiagram(fields.length === 3 && fields.some(line => /^excalidraw-plugin: (raw|parsed)$/u.test(line)) &&
    fields.includes("excalidraw-autoexport: none") && fields.includes("excalidraw-open-md: false"), "adapter");
  let metadata = raw.slice(front[0].length, drawingOffset);
  for (const e of elements) {
    if (e.isDeleted) continue;
    if (e.type === "text") {
      const token = `${e.rawText ?? e.originalText ?? e.text} ^${e.id}`;
      requireDiagram(metadata.includes(token), "adapter"); metadata = metadata.replace(token, "");
    } else if (e.link) {
      const original = `${e.link} ^${e.id}`, normalized = `${e.id}: ${e.link}`;
      requireDiagram(metadata.includes(original) || metadata.includes(normalized), "adapter");
      metadata = metadata.replace(metadata.includes(original) ? original : normalized, "");
    }
  }
  metadata = metadata.replace(/^##? (Excalidraw Data|Text Elements|Element Links)$/gmu, "").replace(/^%%$/gmu, "").replace(/^\^_dummy!_$/gmu, "");
  requireDiagram(!metadata.trim(), "adapter");
}

export class ExcalidrawAdapter implements DiagramAdapter {
  private busy = false;
  private failed = false;
  private planOwners = new WeakMap<DiagramPlan, ExcalidrawPlugin>();
  constructor(private readonly app: App) {}
  private plugin(): ExcalidrawPlugin | undefined {
    // Obsidian's optional plugin registry is isolated to this capability boundary.
    return (this.app as unknown as { plugins?: { plugins?: Record<string, ExcalidrawPlugin> } }).plugins?.plugins?.[EXCALIDRAW_ID];
  }
  capability(): Capability {
    const p = this.plugin();
    if (!p) {
      const installed = (this.app as unknown as { plugins?: { manifests?: Record<string, unknown> } }).plugins?.manifests?.[EXCALIDRAW_ID];
      return { state: "unavailable", reason: installed ? "disabled" : "not-installed" };
    }
    const reasons: string[] = [];
    if (p.manifest?.version !== EXCALIDRAW_VERSION) reasons.push("version");
    if (typeof p.ea?.getAPI !== "function" || p.ea.destroyed) reasons.push("api");
    if (p.settings?.autoexportExcalidraw) reasons.push("autoexport");
    if (reasons.length) return { state: "incompatible", version: p.manifest?.version, reason: reasons.join(",") };
    return { state: this.busy ? "busy" : this.failed ? "error" : "ready", version: p.manifest.version };
  }
  private ready(): ExcalidrawPlugin {
    const c = this.capability(); requireDiagram(c.state !== "unavailable", "unavailable"); requireDiagram(c.state !== "incompatible", "incompatible");
    requireDiagram(!this.busy, "adapter"); return this.plugin()!;
  }
  private instance(plugin: ExcalidrawPlugin): DiagramEA {
    const ea = plugin.ea.getAPI();
    try {
      requireDiagram(ea !== plugin.ea && !ea.targetView && !ea.destroyed && ["destroy", "measureText", "addRect", "addEllipse", "addDiamond", "addText", "addArrow", "getElements", "create", "decompressFromBase64"].every(k => typeof (ea as unknown as Record<string, unknown>)[k] === "function") &&
        Object.keys(ea.elementsDict).length === 0 && Object.keys(ea.imagesDict).length === 0, "incompatible");
      return ea;
    } catch (e) { if (ea !== plugin.ea) ea.destroy?.(); throw e; }
  }
  plan(spec: DiagramSpec, options: DiagramOptions, source: TFile, target: string): DiagramPlan {
    const plugin = this.ready(), ea = this.instance(plugin);
    try {
      try { validateAtomizationPath(source.path, this.app.vault.configDir); } catch { throw new DiagramError("source-link"); }
      requireDiagram(this.app.vault.getFileByPath(source.path) === source && !/[[\]|#^\r\n]/u.test(source.path) &&
        this.app.metadataCache.getFirstLinkpathDest(source.path, target) === source, "source-link");
      Object.assign(ea.style, { fontFamily: 2, fontSize: 20 });
      const layout = layoutDiagram(spec, options, t => ea.measureText(t));
      const plan = freeze({ layout, scene: nativeScene(ea, layout, source.path) }); this.planOwners.set(plan, plugin); return plan;
    } finally { ea.destroy(); }
  }
  verifyPlan(plan: DiagramPlan): void { requireDiagram(this.planOwners.get(plan) === this.ready(), "reloaded"); }
  private targetSync(path: string): void {
    try { validateAtomizationPath(path, this.app.vault.configDir); } catch { throw new DiagramError("path"); }
    requireDiagram(path.endsWith(".excalidraw.md"), "path");
    const parts = path.split("/"), loaded = this.app.vault.getAllLoadedFiles();
    for (let i = 0; i < parts.length; i++) {
      const prefix = parts.slice(0, i + 1).join("/"), last = i === parts.length - 1;
      requireDiagram(!loaded.some(f => atomKey(f.path) === atomKey(prefix) && (last || f.path !== prefix)), "occupied");
      if (!last) requireDiagram(this.app.vault.getAbstractFileByPath(prefix) instanceof TFolder, "path");
    }
  }
  async checkTarget(path: string): Promise<void> {
    this.targetSync(path);
    const parts = path.split("/");
    for (let i = 0; i < parts.length; i++) {
      const parent = parts.slice(0, i).join("/"), prefix = parts.slice(0, i + 1).join("/"), last = i === parts.length - 1;
      const listing = await this.app.vault.adapter.list(parent);
      requireDiagram(![...listing.files, ...listing.folders].some(p => atomKey(p) === atomKey(prefix) && (last || p !== prefix)), "occupied");
      if (!last) requireDiagram((await this.app.vault.adapter.stat(prefix))?.type === "folder", "path");
    }
    requireDiagram(!await this.app.vault.adapter.exists(path), "occupied"); this.targetSync(path);
  }
  async create(plan: DiagramPlan, path: string, guard: () => void): Promise<void> {
    this.verifyPlan(plan); const plugin = this.ready(); await this.checkTarget(path); guard();
    requireDiagram(plugin === this.plugin(), "unavailable");
    const ea = this.instance(plugin); this.busy = true;
    try {
      validateScene(plan.scene);
      ea.elementsDict = Object.fromEntries(clone(plan.scene.elements).map(e => [e.id, e])); ea.canvas = clone(plan.scene.canvas);
      const result = await ea.create({ exactPath: path, silent: true, frontmatterKeys: { ...frontmatter }, validateBeforeCreate: () => {
        requireDiagram(plugin === this.plugin() && !ea.destroyed && !plugin.settings.autoexportExcalidraw, "unavailable"); this.targetSync(path); guard();
      } });
      requireDiagram(result === path, "adapter"); this.failed = false;
    } catch (e) { this.failed = true; throw e; }
    finally { ea.destroy(); this.busy = false; }
  }
  async read(path: string): Promise<{ raw: string; elements: NativeElement[] } | null> {
    const file = this.app.vault.getFileByPath(path);
    if (!file) {
      requireDiagram(!this.app.vault.getAbstractFileByPath(path) && !await this.app.vault.adapter.exists(path), "adapter");
      return null;
    }
    requireDiagram(file instanceof TFile && file.stat.size <= 4_000_000, "adapter");
    const raw = await this.app.vault.read(file); requireDiagram(raw.length <= 1_000_000, "adapter");
    // Decode data only. getSceneFromFile also parses text transclusions; history must never follow changed links.
    const match = /(?:^|\n)##? Drawing\n```(json|compressed-json)\n([\s\S]*?)\n```/u.exec(raw.replace(/\r\n/gu, "\n"));
    requireDiagram(match && !/^##? Embedded Files$/mu.test(raw), "adapter");
    let json = match[2];
    if (match[1] === "compressed-json") {
      // 2.29.0's EA helper does not strip actual newlines; Markdown compression inserts them every 256 bytes.
      const ea = this.instance(this.ready()); try { json = ea.decompressFromBase64(json.replace(/[\r\n]/gu, "")); } finally { ea.destroy(); }
    }
    requireDiagram(typeof json === "string" && json.length <= 1_000_000, "adapter");
    const scene = JSON.parse(json) as { type?: string; elements?: NativeElement[]; files?: Record<string, unknown> };
    requireDiagram(scene.type === "excalidraw" && Array.isArray(scene.elements) && scene.elements.length <= 183 && Object.keys(scene.files ?? {}).length === 0, "adapter");
    verifyMarkdownMetadata(raw.replace(/\r\n/gu, "\n"), match.index, scene.elements);
    return { raw, elements: scene.elements };
  }
  async open(path: string): Promise<void> {
    this.ready(); const file = this.app.vault.getFileByPath(path); requireDiagram(file, "open");
    try {
      const leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: "excalidraw", state: { file: file.path }, active: true });
      requireDiagram(leaf.view.getViewType() === "excalidraw", "open"); await this.app.workspace.revealLeaf(leaf);
    } catch { throw new DiagramError("open"); }
  }
}
