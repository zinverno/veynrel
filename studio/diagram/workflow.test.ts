import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => {
  class FileView {} class EditableFileView extends FileView {}
  return { TFile: class {}, TFolder: class {}, FileView, EditableFileView, MarkdownView: class extends EditableFileView {}, getLanguage: () => "en", requestUrl: vi.fn() };
});
import { MarkdownView, requestUrl, TFile, TFolder } from "obsidian";
import type { App } from "obsidian";
import { callOpenRouter } from "../../api";
import type { LanguageModelSettingsSnapshot } from "../../deep/product/languageModelSettingsPort";
import { testAdapter } from "../testAdapter";
import { studioNotePort, studioInventory } from "../obsidianNotes";
import { StudioStorage } from "../storage";
import { StudioJournal } from "../journal";
import { StudioApply } from "../apply";
import { RecipeRunner } from "../runner";
import { BUILTIN_RECIPES } from "../builtins";
import { StudioOperations } from "../operations";
import { DiagramJournal } from "./journal";
import { ExcalidrawAdapter, EXCALIDRAW_VERSION, sameScene, sceneSignature, validateScene } from "./adapter";
import type { DiagramEA, NativeElement } from "./adapter";
import { DiagramWorkflow } from "./workflow";
import type { DiagramSpec } from "./spec";

const graph: DiagramSpec = { schemaVersion: 1, kind: "flowchart", title: "Request",
  nodes: [{ id: "a", shape: "rectangle", label: "Receive" }, { id: "b", shape: "diamond", label: "Valid?" }, { id: "c", shape: "ellipse", label: "Accept" }],
  edges: [{ id: "e1", from: "a", to: "b", label: "" }, { id: "e2", from: "b", to: "c", label: "Yes" }] };
const response = (content = JSON.stringify(graph), finish = "stop", refusal?: string) => ({ status: 200, text: JSON.stringify({ choices: [{ message: { content, ...(refusal ? { refusal } : {}) }, finish_reason: finish }] }) }) as never;
afterEach(() => vi.unstubAllGlobals());
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
function fixture() {
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  const disk = testAdapter(), sourceContent = "Receive a request. If valid, accept it.\n";
  const source = Object.assign(new TFile(), { path: "Source.md", stat: { ctime: 1, mtime: 2, size: sourceContent.length } });
  const files = [source], folders = [Object.assign(new TFolder(), { path: "Drawings" })]; disk.files.set(source.path, sourceContent); disk.folders.add("Drawings");
  disk.files.set("Untouched.excalidraw.md", "unrelated");
  let leaves: { view: { file?: TFile; getViewData?: () => string }; getViewState(): { state: { file: string } } }[] = [];
  const app = {
    vault: {
      configDir: ".obsidian", adapter: disk.adapter, getFileByPath: (path: string) => files.find(f => f.path === path && disk.files.has(path)) ?? null,
      getAbstractFileByPath: (path: string) => files.find(f => f.path === path) ?? folders.find(f => f.path === path) ?? null,
      getAllLoadedFiles: () => [...files, ...folders], getMarkdownFiles: () => files,
      read: vi.fn(async (file: TFile) => disk.files.get(file.path)!),
      create: vi.fn(async (path: string, raw: string) => {
        if (disk.files.has(path)) throw Error("exists"); disk.files.set(path, raw);
        const file = Object.assign(new TFile(), { path, stat: { ctime: 3, mtime: 3, size: raw.length } }); files.push(file); return file;
      }),
      process: vi.fn(),
    },
    metadataCache: { getFirstLinkpathDest: (path: string) => files.find(f => f.path === path) ?? null },
    workspace: { iterateAllLeaves: (fn: (leaf: unknown) => void) => leaves.forEach(fn), getLeaf: vi.fn(() => ({ setViewState: vi.fn(async () => {}), view: { getViewType: () => "excalidraw" } })), revealLeaf: vi.fn(async () => {}) },
    plugins: { plugins: {} as Record<string, unknown> },
  };
  const instances: DiagramEA[] = [];
  function ea(): DiagramEA {
    const base = (type: string, x: number, y: number, width: number, height: number, id = "auto") => {
      api.elementsDict[id] = { id, type, x, y, width, height, strokeColor: String(api.style.strokeColor), backgroundColor: String(api.style.backgroundColor), boundElements: [], link: null }; return id;
    };
    const api: DiagramEA = {
      style: {}, canvas: {}, elementsDict: {}, imagesDict: {}, targetView: null, destroyed: false,
      getAPI: () => { const instance = ea(); instances.push(instance); return instance; },
      destroy: vi.fn(() => { api.destroyed = true; }), measureText: s => ({ width: Math.max(...s.split("\n").map(l => l.length * 10)), height: s.split("\n").length * 23 }),
      addRect: (x, y, w, h, id) => base("rectangle", x, y, w, h, id), addEllipse: (x, y, w, h, id) => base("ellipse", x, y, w, h, id), addDiamond: (x, y, w, h, id) => base("diamond", x, y, w, h, id),
      addText: (x, y, text, options, id) => { const result = base("text", x, y, options?.width ?? 100, options?.height ?? 23, id); api.elementsDict[result].text = text; return result; },
      addArrow: (points, options, id) => {
        const result = base("arrow", points[0][0], points[0][1], Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0])), Math.max(...points.map(p => p[1])) - Math.min(...points.map(p => p[1])), id);
        const arrow = api.elementsDict[result]; arrow.points = points.map(p => [p[0] - arrow.x, p[1] - arrow.y]);
        arrow.startBinding = { elementId: options.startObjectId, mode: "orbit", fixedPoint: options.startFixedPoint };
        arrow.endBinding = { elementId: options.endObjectId, mode: "orbit", fixedPoint: options.endFixedPoint };
        for (const binding of [arrow.startBinding, arrow.endBinding]) api.elementsDict[binding.elementId].boundElements!.push({ id: result, type: "arrow" }); return result;
      },
      getElements: () => Object.values(api.elementsDict), decompressFromBase64: () => { throw Error("not used"); },
      create: async options => {
        options.validateBeforeCreate();
        const raw = `---\nexcalidraw-plugin: raw\nexcalidraw-autoexport: none\nexcalidraw-open-md: false\n---\n# Excalidraw Data\n\n## Text Elements\n${api.getElements().filter(e => e.type === "text").map(e => `${e.rawText} ^${e.id}\n\n`).join("")}${api.getElements().filter(e => e.type !== "text" && e.link).map(e => `${e.link} ^${e.id}\n\n`).join("")}%%\n## Drawing\n\x60\x60\x60json\n${JSON.stringify({ type: "excalidraw", elements: api.getElements(), files: {} })}\n\x60\x60\x60\n`;
        await app.vault.create(options.exactPath, raw); return options.exactPath;
      },
    }; return api;
  }
  const globalEA = ea(), excalidraw = { manifest: { version: EXCALIDRAW_VERSION }, ea: globalEA, settings: { autoexportExcalidraw: false } };
  app.plugins.plugins["obsidian-excalidraw-plugin"] = excalidraw;
  const actualApp = app as unknown as App, notes = studioNotePort(actualApp), settings = { provider: "ollama" as const, model: "synthetic", baseUrl: "http://127.0.0.1:1234/v1", apiKey: "", temperature: 0.2, topK: 5 };
  const operations = new StudioOperations(), storage = new StudioStorage(disk.adapter, app.vault.configDir, "ai-knowledge-hub"), adapter = new ExcalidrawAdapter(actualApp);
  const port = { notes, inventory: () => studioInventory(actualApp), settings: { get: () => ({ ...settings }), update: async (s: LanguageModelSettingsSnapshot) => s, subscribe: () => () => {} }, complete: callOpenRouter };
  const journal = new DiagramJournal(storage), workflow = new DiagramWorkflow(port, adapter, journal, operations);
  const writer = new StudioApply(new StudioJournal(storage), notes, operations), runner = new RecipeRunner(port, writer);
  const request = vi.mocked(requestUrl); request.mockReset(); request.mockResolvedValue(response());
  const prepare = () => workflow.prepare("flowchart", "Source.md", "Drawings/Review.excalidraw.md", { direction: "down", theme: "neutral" }, 32768);
  const generate = async () => workflow.generate(await prepare());
  return { ...disk, source, sourceContent, app, instances, globalEA, excalidraw, notes, settings, operations, storage, adapter, journal, workflow, writer, runner, request, prepare, generate,
    editor: (raw = sourceContent, inspectable = true) => { const view = Object.assign(inspectable ? new MarkdownView({} as never) : {}, { file: source, getViewData: () => raw, getViewType: () => "markdown" }); leaves = [{ view, getViewState: () => ({ state: { file: source.path } }) }]; return view; },
    restart: () => new DiagramWorkflow(port, adapter, new DiagramJournal(storage), new StudioOperations()),
  };
}

describe("optional native capability and element contract", () => {
  it("builds separate editable shapes, bound texts/arrows and exactly one code-owned source link", async () => {
    const f = fixture(), p = await f.generate(); validateScene(p.plan.scene);
    const els = p.plan.scene.elements;
    expect(els.filter(e => e.type === "arrow")).toHaveLength(2);
    expect(els.filter(e => e.type === "text" && e.containerId)).toHaveLength(5);
    expect(els.filter(e => e.link).map(e => e.link)).toEqual(["[[Source.md]]"]);
    expect(els.some(e => ["image", "embeddable", "iframe"].includes(e.type))).toBe(false);
    expect(f.instances.every(e => e.destroyed)).toBe(true); expect(f.globalEA.elementsDict).toEqual({}); expect(f.globalEA.destroyed).toBe(false);
  });
  it("sanitizes hostile model labels before they reach EA or Markdown serialization", async () => {
    const f = fixture(), hostile = '![[Hidden]] [x](https://bad.invalid) obsidian://open <svg>\n%% ^block';
    f.request.mockResolvedValue(response(JSON.stringify({ ...graph, nodes: graph.nodes.map(n => ({ ...n, label: hostile })) })));
    const p = await f.generate(); const result = await f.workflow.create(p); expect(result.state).toBe("created");
    const scene = await f.adapter.read(p.target); expect(scene!.elements.filter(e => e.type === "text").every(e => !/\[|\]|<|>|:|%|\^/u.test(e.text!))).toBe(true);
  });
  it.each(["absent", "version", "autoexport", "getAPI"])("blocks %s before any request", async mode => {
    const f = fixture();
    if (mode === "absent") delete f.app.plugins.plugins["obsidian-excalidraw-plugin"];
    if (mode === "version") f.excalidraw.manifest.version = "2.28.0";
    if (mode === "autoexport") f.excalidraw.settings.autoexportExcalidraw = true;
    if (mode === "getAPI") f.globalEA.getAPI = undefined as never;
    await expect(f.prepare()).rejects.toThrow(); expect(f.request).not.toHaveBeenCalled(); expect(f.app.vault.create).not.toHaveBeenCalled();
  });
  it("never resets or destroys the global workbench if a broken getAPI returns it", async () => {
    const f = fixture(); f.globalEA.getAPI = () => f.globalEA;
    await expect(f.prepare()).rejects.toThrow("incompatible"); expect(f.globalEA.destroyed).toBe(false);
  });
});
describe("one shared workflow and exact consent over the real transport", () => {
  it("sends nothing before consent; sends the exact displayed body; writes nothing before create", async () => {
    const f = fixture(); f.editor(); const before = new Map(f.files), p = await f.prepare();
    expect(f.request).not.toHaveBeenCalled(); expect(f.files).toEqual(before);
    const r = await f.workflow.generate(p); expect(f.request).toHaveBeenCalledTimes(1);
    expect((f.request.mock.calls[0][0] as { body: string }).body).toBe(p.body); expect(f.files).toEqual(before);
    expect((await f.workflow.create(r)).state).toBe("created"); expect(f.files.get("Source.md")).toBe(f.sourceContent);
    expect(f.files.get("Untouched.excalidraw.md")).toBe("unrelated"); expect(f.app.vault.process).not.toHaveBeenCalled();
    expect(f.app.vault.read.mock.calls.every(([file]) => ["Source.md", r.target].includes(file.path))).toBe(true);
  });
  it.each(["unsaved", "uninspectable"])("blocks %s editor", async mode => {
    const f = fixture(); f.editor(mode === "unsaved" ? "unsaved" : f.sourceContent, mode !== "uninspectable");
    await expect(f.prepare()).rejects.toThrow(mode === "unsaved" ? "unsaved" : "read-editor"); expect(f.request).not.toHaveBeenCalled();
  });
  it.each(["settings", "source", "buffer", "plugin"])("rechecks %s between consent and sending", async mode => {
    const f = fixture(), p = await f.prepare();
    if (mode === "settings") f.settings.model = "changed";
    if (mode === "source") f.files.set("Source.md", "changed");
    if (mode === "buffer") f.editor("unsaved");
    if (mode === "plugin") delete f.app.plugins.plugins["obsidian-excalidraw-plugin"];
    await expect(f.workflow.generate(p)).rejects.toThrow(); expect(f.request).not.toHaveBeenCalled();
  });
  it.each(["length", "refusal", "invalid", "empty", "limit"])("rejects %s response through callOpenRouter", async mode => {
    const f = fixture(); f.request.mockResolvedValue(response(mode === "invalid" ? "not JSON" : mode === "empty" ? '{"nodes":[]}' : mode === "limit" ? "x".repeat(33_000) : JSON.stringify(graph), mode === "length" ? "length" : "stop", mode === "refusal" ? "No" : undefined));
    await expect(f.generate()).rejects.toThrow(); expect(f.workflow.proposal).toBeUndefined(); expect(f.app.vault.create).not.toHaveBeenCalled(); expect(f.request).toHaveBeenCalledTimes(1);
  });
  it("cancels after sending without pretending to recall the provider and blocks both tabs/Markdown/Undo", async () => {
    const f = fixture(), p = await f.prepare(); let release!: (value: never) => void;
    f.request.mockImplementation(() => new Promise(resolve => { release = resolve; }) as never);
    const pending = f.workflow.generate(p); await vi.waitFor(() => expect(f.request).toHaveBeenCalledOnce());
    await expect(f.workflow.generate(p)).rejects.toThrow("busy");
    await expect(f.runner.prepare(BUILTIN_RECIPES[0], BUILTIN_RECIPES[0].parameters, { paths: ["Source.md"] }, 32768)).rejects.toThrow("busy");
    await expect(f.writer.history()).rejects.toThrow("busy");
    f.workflow.cancel(); release(response());
    await expect(pending).rejects.toThrow("cancelled"); expect(f.workflow.proposal).toBeUndefined(); expect(f.app.vault.create).not.toHaveBeenCalled();
  });
  it("changes geometry locally and rejects old confirmations", async () => {
    const f = fixture(), old = await f.generate();
    const next = await f.workflow.revise(old, { direction: "right", theme: "amethyst" }, "Drawings/New.excalidraw.md");
    expect(next.id).not.toBe(old.id); expect(f.request).toHaveBeenCalledOnce();
    await expect(f.workflow.create(old)).rejects.toThrow("stale"); expect((await f.workflow.create(next)).state).toBe("created");
  });
  it.each(["source", "unsaved", "plugin", "cancel"])("blocks %s change after Review", async mode => {
    const f = fixture(), p = await f.generate();
    if (mode === "source") f.files.set("Source.md", "changed"); if (mode === "unsaved") f.editor("unsaved");
    if (mode === "plugin") delete f.app.plugins.plugins["obsidian-excalidraw-plugin"]; if (mode === "cancel") f.workflow.cancel();
    await expect(f.workflow.create(p)).rejects.toThrow(); expect(f.app.vault.create).not.toHaveBeenCalled();
  });
  it("refuses a reloaded plugin even at the same version until a new local Review", async () => {
    const f = fixture(), p = await f.generate();
    f.app.plugins.plugins["obsidian-excalidraw-plugin"] = { ...f.excalidraw };
    await expect(f.workflow.create(p)).rejects.toThrow("reloaded"); expect(await f.journal.entries()).toEqual([]);
    const next = await f.workflow.revise(p, p.plan.layout.options, p.target);
    expect((await f.workflow.create(next)).state).toBe("created"); expect(f.request).toHaveBeenCalledOnce();
  });
});
describe("create-only persistence, history and conservative recovery", () => {
  it.each(["../escape.excalidraw.md", ".hidden/a.excalidraw.md", "Missing/a.excalidraw.md", "Drawings/../a.excalidraw.md", "Drawings/a.md", "Drawings/CON.excalidraw.md", "Drawings/.x.excalidraw.md"])("refuses unsafe target %s", async target => {
    const f = fixture(); await expect(f.adapter.checkTarget(target)).rejects.toThrow("path"); expect(f.app.vault.create).not.toHaveBeenCalled();
  });
  it.each(["exact", "case", "unicode", "folder"])("refuses %s collisions before and after Review", async mode => {
    const f = fixture(), p = await f.generate();
    const path = mode === "case" ? "Drawings/REVIEW.excalidraw.md" : mode === "unicode" ? "Drawings/Ｒｅｖｉｅｗ.excalidraw.md" : p.target;
    if (mode === "folder") f.folders.add(path); else f.files.set(path, "existing");
    await expect(f.workflow.create(p)).rejects.toThrow("occupied"); expect(f.app.vault.create).not.toHaveBeenCalled();
    await expect(f.prepare()).rejects.toThrow("occupied");
  });
  it("writes durable intent first and repeated confirmation never creates twice", async () => {
    const f = fixture(), p = await f.generate();
    const create = f.app.vault.create.getMockImplementation()!;
    f.app.vault.create.mockImplementation(async (path, raw) => { const rows = await f.journal.entries(); expect(rows).toHaveLength(1); expect(rows[0].intent!.target).toBe(path); expect(rows[0].receipt).toBeUndefined(); return create(path, raw); });
    const result = await f.workflow.create(p); expect(await f.workflow.create(p)).toBe(result); expect(f.app.vault.create).toHaveBeenCalledOnce();
    expect((await f.workflow.history())[0].state).toBe("created");
  });
  it("a journal failure prevents file creation", async () => {
    const f = fixture(), p = await f.generate(); vi.spyOn(f.journal, "prepare").mockRejectedValue(Error("disk full"));
    expect((await f.workflow.create(p)).state).toBe("not-created"); expect(f.app.vault.create).not.toHaveBeenCalled();
    await f.workflow.create(p); expect(f.app.vault.create).not.toHaveBeenCalled();
  });
  it.each(["before-write", "after-write", "receipt"])("keeps %s failure unresolved across restart until explicit observed recovery", async mode => {
    const f = fixture(), p = await f.generate();
    const create = f.app.vault.create.getMockImplementation()!;
    if (mode !== "receipt") f.app.vault.create.mockImplementation(async (path, raw) => { if (mode === "after-write") await create(path, raw); throw Error("interrupted"); });
    else vi.spyOn(f.journal, "mark").mockRejectedValueOnce(Error("receipt failed"));
    expect((await f.workflow.create(p)).state).toBe("unconfirmed"); const count = f.app.vault.create.mock.calls.length;
    const restarted = f.restart(); expect(restarted.proposal).toBeUndefined();
    const row = (await restarted.history())[0]; expect(row.state).toBe("unconfirmed"); expect(f.app.vault.create).toHaveBeenCalledTimes(count);
    const ticket = await restarted.reviewRecovery(p.id); await restarted.recover(ticket);
    expect((await restarted.history())[0].state).toBe(mode === "before-write" ? "not-created" : "created");
    expect(f.app.vault.create).toHaveBeenCalledTimes(count); expect(f.request).toHaveBeenCalledOnce();
  });
  it("detects scene edits and unavailable files without deleting anything", async () => {
    const f = fixture(), p = await f.generate(); await f.workflow.create(p);
    const raw = f.files.get(p.target)!; f.files.set(p.target, raw.replace('"Receive"', '"My edits"'));
    expect((await f.workflow.history())[0].state).toBe("changed-unavailable");
    f.files.delete(p.target); expect((await f.workflow.history())[0].state).toBe("changed-unavailable");
  });
  it("ignores native serialization bookkeeping but detects binding and text edits", async () => {
    const f = fixture(), p = await f.generate(), elements = copy(p.plan.scene.elements) as NativeElement[];
    const expected = sceneSignature(elements); elements.reverse(); elements.forEach(e => { e.version = 99; e.updated = 1234; e.index = "a0"; });
    expect(sceneSignature(elements)).toBe(expected);
    elements.find(e => e.type === "arrow")!.endBinding!.elementId = "wrong"; expect(sceneSignature(elements)).not.toBe(expected);
  });
  it("open errors do not cause another create or request", async () => {
    const f = fixture(), p = await f.generate(); await f.workflow.create(p);
    f.app.workspace.getLeaf.mockImplementation(() => { throw Error("failed to open"); });
    await expect(f.workflow.open(p.id)).rejects.toThrow("open"); await expect(f.workflow.open(p.id)).rejects.toThrow("open");
    expect(f.app.vault.create).toHaveBeenCalledOnce(); expect(f.request).toHaveBeenCalledOnce(); expect((await f.workflow.history())[0].state).toBe("created");
  });
  it("history refuses corrupted evidence and never uses Excalidraw text/transclusion loaders", async () => {
    const f = fixture(), p = await f.generate(); await f.workflow.create(p);
    const intentPath = [...f.files.keys()].find(path => path.endsWith("intent.json"))!; f.files.set(intentPath, "{}");
    expect((await f.workflow.history())[0].state).toBe("damaged"); expect(f.app.vault.process).not.toHaveBeenCalled();
  });
  it("removes compressed Markdown line breaks before calling the pinned EA decoder", async () => {
    const f = fixture(), p = await f.generate(); await f.workflow.create(p);
    const raw = f.files.get(p.target)!, json = /```json\n([\s\S]*?)\n```/u.exec(raw)![1];
    f.files.set(p.target, raw.replace(/```json\n[\s\S]*?\n```/u, "```compressed-json\nABCD\n\nEFGH\n```"));
    const fresh = f.globalEA.getAPI.bind(f.globalEA), decode = vi.fn((input: string) => { expect(input).toBe("ABCDEFGH"); return json; });
    f.globalEA.getAPI = () => { const ea = fresh(); ea.decompressFromBase64 = decode; return ea; };
    expect((await f.workflow.history())[0].state).toBe("created"); expect(decode).toHaveBeenCalledOnce();
  });
  it("accepts only bounded native endpoint adjustment, preserving routes, nodes, labels and bindings", async () => {
    const f = fixture(), p = await f.generate(), expected = p.plan.scene.elements, changed = copy(expected) as NativeElement[];
    const arrow = changed.find(e => e.type === "arrow")!;
    arrow.points![0][0] += 6; expect(sameScene(expected, changed)).toBe(true);
    arrow.points![0][0] += 3; expect(sameScene(expected, changed)).toBe(false);
    arrow.points![0][0] -= 3; arrow.points![1][0] += 1; expect(sameScene(expected, changed)).toBe(false);
  });
  it.each(["frontmatter", "transclusion", "metadata-text", "metadata-link"])("refuses %s modification outside scene JSON", async mode => {
    const f = fixture(), p = await f.generate(); await f.workflow.create(p);
    let raw = f.files.get(p.target)!;
    if (mode === "frontmatter") raw = raw.replace("excalidraw-open-md: false", "excalidraw-onload-script: bad");
    if (mode === "transclusion") raw = raw.replace("## Text Elements", "## Text Elements\n![[Untouched]]");
    if (mode === "metadata-text") raw = raw.replace("Receive ^", "Altered ^");
    if (mode === "metadata-link") raw = raw.replace("[[Source.md]]", "[[Untouched.md]]");
    f.files.set(p.target, raw); expect((await f.workflow.history())[0].state).toBe("changed-unavailable");
    await expect(f.workflow.open(p.id)).rejects.toThrow(); expect(f.app.workspace.getLeaf).not.toHaveBeenCalled();
  });
  it("rechecks source after intent persistence, with no write if it changed", async () => {
    const f = fixture(), p = await f.generate(), prepare = f.journal.prepare.bind(f.journal);
    vi.spyOn(f.journal, "prepare").mockImplementation(async intent => { await prepare(intent); f.files.set("Source.md", "changed after intent"); });
    expect((await f.workflow.create(p)).state).toBe("not-created"); expect(f.app.vault.create).not.toHaveBeenCalled();
    expect((await f.workflow.history())[0].state).toBe("not-created");
  });
  it("consumes a recovery ticket and refuses if evidence changes before confirmation", async () => {
    const f = fixture(), p = await f.generate(); vi.spyOn(f.journal, "mark").mockRejectedValueOnce(Error("disk"));
    await f.workflow.create(p); const restarted = f.restart(), ticket = await restarted.reviewRecovery(p.id);
    f.files.set(p.target, f.files.get(p.target)!.replace("Receive ^", "New text ^"));
    await expect(restarted.recover(ticket)).rejects.toThrow("stale"); await expect(restarted.recover(ticket)).rejects.toThrow("used");
    expect(f.app.vault.create).toHaveBeenCalledOnce();
  });
  it.each(["disk-only", "folder", "inaccessible"])("does not recover an %s target as absent", async mode => {
    const f = fixture(), p = await f.generate(); f.app.vault.create.mockRejectedValueOnce(Error("unknown"));
    await f.workflow.create(p);
    if (mode === "disk-only") f.files.set(p.target, "external file");
    if (mode === "folder") f.folders.add(p.target);
    if (mode === "inaccessible") vi.mocked(f.storage.adapter.exists).mockImplementation(async path => { if (path === p.target) throw Error("permission"); return f.files.has(path) || f.folders.has(path); });
    const row = (await f.workflow.history())[0]; expect(row.state).toBe("unconfirmed"); expect(row.recovery).toBeUndefined();
    await expect(f.workflow.reviewRecovery(p.id)).rejects.toThrow("conflict");
  });
  it.each(["open-stop", "open-dispose", "review-dispose", "recover-stop", "recover-dispose"])("blocks pending %s before its next effect", async mode => {
    const f = fixture(), p = await f.generate();
    if (!mode.startsWith("open")) vi.spyOn(f.journal, "mark").mockRejectedValueOnce(Error("receipt"));
    await f.workflow.create(p);
    const ticket = mode.startsWith("recover") ? await f.workflow.reviewRecovery(p.id) : undefined;
    const read = f.adapter.read.bind(f.adapter); let release!: () => void;
    vi.spyOn(f.adapter, "read").mockImplementationOnce(async path => { await new Promise<void>(resolve => { release = resolve; }); return read(path); });
    const pending = mode.startsWith("open") ? f.workflow.open(p.id) : ticket ? f.workflow.recover(ticket) : f.workflow.reviewRecovery(p.id);
    const rejected = expect(pending).rejects.toThrow("cancelled"); await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    if (mode.endsWith("dispose")) f.workflow.dispose(); else f.workflow.cancel(); release(); await rejected;
    expect(f.app.workspace.getLeaf).not.toHaveBeenCalled();
    expect((await f.journal.entries())[0].receipt?.state).toBe(mode.startsWith("open") ? "created" : undefined);
  });
  it("blocks recovery receipt writing when cancelled during the storage existence check", async () => {
    const f = fixture(), p = await f.generate(); vi.spyOn(f.journal, "mark").mockRejectedValueOnce(Error("receipt"));
    await f.workflow.create(p); const ticket = await f.workflow.reviewRecovery(p.id), originalCreate = f.storage.create.bind(f.storage);
    let release!: () => void;
    vi.spyOn(f.storage, "create").mockImplementationOnce(async (path, raw, active) => {
      vi.mocked(f.storage.adapter.exists).mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve; }); return false; });
      return originalCreate(path, raw, active);
    });
    const pending = f.workflow.recover(ticket), rejected = expect(pending).rejects.toThrow("cancelled");
    await vi.waitFor(() => expect(release).toBeTypeOf("function")); f.workflow.cancel(); release(); await rejected;
    expect((await f.journal.entries())[0].receipt).toBeUndefined();
  });
});
