import { describe, expect, it, vi } from "vitest";
const dom = vi.hoisted(() => {
  const document: { activeElement?: Element } = {};
  class Element {
    closest() { return null; }
    isConnected = true; hidden = false; scrollTop = 0; selectionStart = 0; selectionEnd = 0;
    contains(el: Element) { return this.all().includes(el); }
    setSelectionRange() {}
    children: Element[] = []; text = ""; tag = "div"; attrs: Record<string, string> = {}; cls = "";
    value = ""; disabled = false; checked = false; open = false; parentElement?: Element; ownerDocument = document;
    listeners = new Map<string, () => void>();
    appendChild(el: Element) { el.parentElement = this; this.children.push(el); return el; }
    empty() { this.children = []; this.text = ""; }
    addClass(...names: string[]) { this.cls += ` ${names.join(" ")}`; }
    setText(text: string) { this.text = text; }
    setAttribute(key: string, value: string) { this.attrs[key] = value; }
    removeAttribute(key: string) { delete this.attrs[key]; }
    getAttribute(key: string) { return this.attrs[key] ?? null; }
    create(tag: string, options: { text?: string; attr?: Record<string, string>; cls?: string; value?: string } = {}) {
      const el = new Element(); el.tag = tag; el.text = options.text ?? ""; el.attrs = options.attr ?? {}; el.cls = options.cls ?? ""; el.value = options.value ?? "";
      el.parentElement = this; this.children.push(el); return el;
    }
    createEl(tag: string, options = {}) { return this.create(tag, options); }
    createDiv(options = {}) { return this.create("div", options); }
    createSpan(options = {}) { return this.create("span", options); }
    addEventListener(key: string, fn: () => void) { this.listeners.set(key, fn); }
    all(): Element[] { return [this, ...this.children.flatMap(e => e.all())]; }
    matches(selector: string): boolean {
      return selector.split(",").some(part => {
        const value = part.trim(), match = /^\[([^=\]]+)(?:="([^"]*)")?\]$/u.exec(value);
        return match ? this.attrs[match[1]] !== undefined && (match[2] === undefined || this.attrs[match[1]] === match[2]) : this.tag === value;
      });
    }
    querySelector(selector: string) { return this.all().slice(1).find(el => el.matches(selector)); }
    querySelectorAll(selector: string) { return this.all().slice(1).filter(el => el.matches(selector)); }
    focus() { document.activeElement = this; }
    click() { if (!this.disabled) this.listeners.get("click")?.(); }
    change(value?: string) { if (value !== undefined) this.value = value; this.listeners.get("change")?.(); }
  }
  const modals: Modal[] = [];
  class Modal {
    getItems(): unknown[] { return []; }
    onChooseItem(_item: unknown) {}
    contentEl = new Element(); titleEl = new Element(); modalEl = new Element(); opened = false;
    constructor(readonly app: unknown) { modals.push(this); }
    onOpen() {} onClose() {}
    open() { this.opened = true; this.onOpen(); }
    close() { this.opened = false; this.onClose(); }
  }
  return { Element, Modal, modals, document };
});
vi.mock("obsidian", () => ({ getLanguage: () => "en", setIcon: vi.fn(), FuzzySuggestModal: dom.Modal }));
vi.mock("./workbenchView", () => ({ WorkbenchView: class { constructor() { throw Error("Non-map entry constructed a map"); } } }));
import type { App, TFile } from "obsidian";
import { SemanticScenarioView } from "./semanticScenarioView";
import { WorkbenchData } from "./workbenchData";
import type { SemanticEntry } from "./semanticEntry";
import type { SemanticIntelligencePort } from "../semanticIntelligencePort";
import type { SemanticGlobalMapPort, SemanticGlobalMapProductSnapshot } from "../semanticGlobalMapPort";
import type { SemanticNeighborhoodPort, SemanticNeighborhoodProductSnapshot } from "../semanticNeighborhoodPort";
import { semanticRevision } from "../connections/testFixtures";
import { setLanguage } from "../../i18n";

function setup(intent: SemanticEntry["intent"], sourcePath?: string, count = 3) {
  setLanguage("en"); dom.modals.length = 0; dom.document.activeElement = undefined;
  const files = new Map(Array.from({ length: count }, (_, i) => { const path = `${i}.md`; return [path, { path, basename: `${i}` } as TFile]; }));
  const app = { vault: { getFileByPath: (path: string) => files.get(path), getMarkdownFiles: () => [...files.values()] } } as unknown as App;
  const root = new dom.Element(), listeners = new Set<() => void>();
  const emit = () => listeners.forEach(f => f());
  let snapshot: SemanticGlobalMapProductSnapshot = { state: "idle", busy: false, supportedNoteCount: 500 };
  let neighborhood: SemanticNeighborhoodProductSnapshot = { state: "idle", busy: false, indexedNoteCount: count };
  const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
  const refresh = vi.fn(async () => {}), load = vi.fn(async (_path: string) => {});
  const global: SemanticGlobalMapPort = { getSnapshot: () => snapshot, subscribe, refresh, load: vi.fn(async () => {}), focus: vi.fn(async () => {}), resetFocus: vi.fn(), search: () => ({ nodes: [], total: 0 }), cancel: vi.fn(), dispose: vi.fn() };
  const neighbor: SemanticNeighborhoodPort = { getSnapshot: () => neighborhood, subscribe, prepare: vi.fn(async () => {}), load, refresh: vi.fn(async () => {}), searchSources: () => ({ paths: [], total: 0 }), chooseAnother: vi.fn(), cancel: vi.fn(), dispose: vi.fn() };
  const shared = { refresh: vi.fn(async () => {}), getSnapshot: () => ({ state: "idle" as const }), subscribe: () => () => {}, load: vi.fn(async () => {}), dispose: vi.fn() };
  const prepare = vi.fn(async () => {});
  const scope = { id: "all", revision: 1, paths: [...files.keys()] };
  const data = new WorkbenchData(scope, { topology: shared, createComparison: () => { throw Error("Unexpected comparison"); }, prepareExisting: prepare }, false);
  data.globalSemantic = global; data.semantic = global; data.neighborhood = neighbor;
  let ready = true;
  const semantic = { getSnapshot: () => ({ state: ready ? "ready" : "disabled" }) } as SemanticIntelligencePort;
  const mount = vi.fn((_parent: HTMLElement, _paths: readonly [string, string]) => vi.fn()), back = vi.fn(), settings = vi.fn();
  const view = new SemanticScenarioView(app, root as unknown as HTMLElement, data, { mount }, semantic, { intent, scope, sourcePath, returnTo: "semantic" }, { back, settings, openNote: vi.fn(), history: vi.fn() }, root as unknown as HTMLElement);
  const action = (key: string) => root.querySelector(`[data-health-action="${key}"]`)!;
  const choose = (key: string, path: string) => { action(key).click(); dom.modals.at(-1)!.onChooseItem(files.get(path)); };
  return { root, view, data, files, action, choose, mount, shared, prepare, global, neighbor, refresh, load, back, settings,
    texts: () => root.all().map(el => el.text).join("\n"),
    update: (next: SemanticGlobalMapProductSnapshot) => { snapshot = next; view.update(); emit(); },
    neighbors: (next: SemanticNeighborhoodProductSnapshot) => { neighborhood = next; view.update(); emit(); },
    noIndex: () => { ready = false; view.update(); },
  };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
describe("semantic intent surfaces", () => {
  it("opens all non-map entries without computation, model, body IO or a recent note", () => {
    for (const intent of ["families", "pair", "neighborhood", "opportunities", "focus", "similar"] as const) {
      const f = setup(intent); expect(f.prepare).not.toHaveBeenCalled(); expect(f.shared.refresh).not.toHaveBeenCalled();
      expect(f.refresh).not.toHaveBeenCalled(); expect(f.load).not.toHaveBeenCalled(); expect(f.mount).not.toHaveBeenCalled();
      if (["neighborhood", "focus", "similar"].includes(intent)) expect(f.root.querySelector('[data-semantic-state="source-missing"]')).toBeDefined();
      f.view.dispose(); expect(f.shared.dispose).not.toHaveBeenCalled();
    }
  });
  it("chooses distinct A/B and mounts the existing inspector once; Back restores focus", () => {
    const f = setup("pair"); f.choose("semantic-pair-0", "0.md"); f.action("semantic-pair-1").click();
    expect(dom.modals.at(-1)!.getItems()).not.toContain(f.files.get("0.md")); dom.modals.at(-1)!.onChooseItem(f.files.get("1.md"));
    const compare = f.action("semantic-compare"); compare.focus(); compare.click(); compare.click();
    expect(f.mount).toHaveBeenCalledOnce(); expect(f.mount.mock.calls[0][1]).toEqual(["0.md", "1.md"]);
    f.action("semantic-pair-back").click(); expect(dom.document.activeElement?.attrs["data-health-action"]).toBe("semantic-compare");
    expect(f.refresh).not.toHaveBeenCalled(); f.view.dispose();
  });
  it("keeps no-index intent, refuses removed/replaced sources, and offers setup", () => {
    const f = setup("neighborhood", "0.md"); f.noIndex(); f.action("semantic-setup").click(); expect(f.settings).toHaveBeenCalledOnce();
    expect(f.root.querySelector('[data-semantic-intent="neighborhood"]')).toBeDefined();
    f.files.set("0.md", { path: "0.md" } as TFile); f.view.update(); expect(f.root.querySelector('[data-semantic-state="source-missing"]')).toBeDefined();
    expect(f.action("semantic-load-existing").disabled).toBe(true); f.view.dispose();
  });
  it("invalidates a late A preparation after choosing B without cancelling shared topology", async () => {
    const f = setup("neighborhood", "0.md"); let resolve!: () => void;
    f.prepare.mockImplementationOnce(() => new Promise<void>(r => { resolve = r; }));
    f.action("semantic-compute").click(); f.choose("semantic-source", "1.md"); resolve(); await flush();
    expect(f.load).not.toHaveBeenCalled(); f.action("semantic-compute").click(); await flush();
    expect(f.load).toHaveBeenCalledExactlyOnceWith("1.md"); expect(f.shared.refresh).not.toHaveBeenCalled(); f.view.dispose();
  });
  it("distinguishes snippets from document results and restores source on Back", () => {
    const f = setup("neighborhood", "0.md");
    const source = { id: "0", path: "0.md", basename: "0", role: "source" as const, evidence: [] };
    f.neighbors({ state: "ready", busy: false, indexedNoteCount: 3, map: { revision: semanticRevision, source, neighbors: [{ id: "1", path: "1.md", basename: "1", role: "neighbor", similarity: .5, evidence: [{ headingPath: ["Heading"], startLine: 4, endLine: 9, preview: "Actual indexed fragment", score: .5 }] }], edges: [], indexedNoteCount: 3, capturedAt: 1 } });
    expect(f.texts()).toContain("Actual indexed fragment"); expect(f.texts()).toContain("Heading");
    f.action("semantic-explore-1.md").click(); expect(f.texts()).toContain("1.md"); expect(f.load).not.toHaveBeenCalled();
    f.action("semantic-back").click(); expect(f.texts()).toContain("Actual indexed fragment"); f.view.dispose();
  });
  it("exposes every all-document focus score, filtered displayed counts and unknown links", () => {
    const f = setup("focus", "0.md", 90);
    const nodes = [...f.files.keys()].map(path => ({ id: path, path, basename: path, coreSimilarity: .5, semanticConnectedness: .5, neighbors: [] }));
    f.update({ state: "ready", busy: false, supportedNoteCount: 500, map: { nodes, edges: [], revision: semanticRevision, capturedAt: 1, indexedNoteCount: 90, mappedNoteCount: 90 }, focus: { path: "0.md", scores: nodes.map(n => ({ path: n.path, score: .5 })) } });
    expect(f.root.querySelectorAll("[data-focus-path]")).toHaveLength(40); expect(f.texts()).toContain("unknown");
    f.action("semantic-more").click(); f.action("semantic-more").click(); expect(f.root.querySelectorAll("[data-focus-path]")).toHaveLength(89);
    const search = f.action("semantic-result-search"); search.value = "89.md"; search.listeners.get("input")!();
    expect(f.root.querySelectorAll("[data-focus-path]")).toHaveLength(1); expect(f.root.querySelector("[data-focus-counts]")?.text).toContain("1"); f.view.dispose();
  });
  it.each(["stale", "error", "unavailable"] as const)("keeps %s separate from empty/uncomputed", state => {
    const f = setup("families"); f.update({ state, reason: state === "unavailable" ? "too-large" : undefined, busy: false, supportedNoteCount: 500, indexedNoteCount: 501 });
    expect(f.root.querySelector(`[data-semantic-state="${state === "unavailable" ? "cap-refused" : state}"]`)).toBeDefined(); f.view.dispose();
  });
});

it("retains the actual source/query/history across scope revision and marks cached evidence stale", () => {
  const f = setup("neighborhood", "0.md");
  f.neighbors({ state: "ready", busy: false, indexedNoteCount: 3, map: { revision: semanticRevision,
    source: { id: "0", path: "0.md", basename: "0", role: "source", evidence: [] },
    neighbors: [{ id: "1", path: "1.md", basename: "1", role: "neighbor", similarity: .5, evidence: [] }], edges: [], indexedNoteCount: 3, capturedAt: 1 } });
  f.action("semantic-explore-1.md").click(); const state = f.view.captureNavigation();
  f.view.restoreNavigation(state); expect(f.texts()).toContain("1.md");
  f.action("semantic-back").click(); expect(f.root.querySelector('[data-semantic-state="stale"]')).toBeDefined();
  const removed = f.view.captureNavigation(); f.files.delete("0.md"); f.view.restoreNavigation(removed);
  expect(f.root.querySelector('[data-semantic-state="source-missing"]')).toBeDefined(); expect(f.texts()).toContain("0.md");
  expect(f.load).not.toHaveBeenCalled(); expect(f.shared.refresh).not.toHaveBeenCalled(); f.view.dispose();
});
