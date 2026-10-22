import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App, PluginManifest } from "obsidian";
const mocks = vi.hoisted(() => {
  class Element {
    children: Element[] = []; text = ""; attrs: Record<string, string> = {}; disabled = false; listeners: (() => void)[] = [];
    private append(_tag: string, opts: { text?: string; attr?: Record<string, string> } = {}) { const e = new Element(); e.text = opts.text ?? ""; e.attrs = opts.attr ?? {}; this.children.push(e); return e; }
    createEl(tag: string, opts = {}) { return this.append(tag, opts); }
    createDiv(opts = {}) { return this.append("div", opts); } createSpan(opts = {}) { return this.append("span", opts); }
    addClass() {} setText(text: string) { this.text = text; } empty() { this.children = []; }
    addEventListener(_type: string, fn: () => void) { this.listeners.push(fn); }
    all(): Element[] { return [this, ...this.children.flatMap(e => e.all())]; }
    action(key: string) { return this.all().find(e => e.attrs["data-health-action"] === key)!; }
    click() { for (const fn of this.listeners) fn(); }
    texts() { return this.all().map(e => e.text).join("\n"); }
  }
  class Modal {
    static opened: Modal[] = []; contentEl = new Element(); titleEl = new Element();
    onOpen() {} onClose() {} open() { Modal.opened.push(this); this.onOpen(); } close() { this.onClose(); }
  }
  class TFile { extension = "md"; stat = { mtime: 1, size: 10 }; constructor(public path: string) {} }
  class TFolder { children: TFile[] = []; constructor(public path: string) {} }
  return { Element, Modal, TFile, TFolder, notices: [] as string[], call: vi.fn(async () => "Synthetic description") };
});
vi.mock("obsidian", () => ({ ...mocks, Plugin: class { constructor(public app: App) {} }, FuzzySuggestModal: class {}, PluginSettingTab: class {}, Component: class {}, setIcon: vi.fn(), getLanguage: () => "en", normalizePath: (p: string) => p.replace(/\/+/gu, "/").replace(/\/$/u, ""),
  Notice: class { containerEl = new mocks.Element(); constructor(message: string) { mocks.notices.push(message); } hide() {} setMessage() {} },
}));
vi.mock("./api", async importOriginal => ({ ...await importOriginal<typeof import("./api")>(), callOpenRouter: mocks.call }));
let Plugin: typeof import("./main").default;
import { DEFAULT_SETTINGS } from "./settings";
import { prepareMocs } from "./mocPreparation";
import { setLanguage } from "./i18n";
import type { ClusterRecord } from "./noteIndex";
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function fixture(clusters: ClusterRecord[] = [{ name: "Topic", description: "Saved description", filePaths: ["A/Note.md"] }]) {
  const files = new Map<string, InstanceType<typeof mocks.TFile> | InstanceType<typeof mocks.TFolder>>();
  const text = new Map<string, string>();
  const vault = { getAbstractFileByPath: vi.fn((p: string) => files.get(p)), read: vi.fn(async (f: { path: string }) => text.get(f.path) ?? ""),
    createFolder: vi.fn(async (p: string) => { if (!files.has(p)) files.set(p, new mocks.TFolder(p)); }),
    create: vi.fn(async (p: string, body: string) => { const f = new mocks.TFile(p); files.set(p, f); text.set(p, body); (files.get(p.slice(0, p.lastIndexOf("/"))) as InstanceType<typeof mocks.TFolder>).children.push(f); return f; }),
    modify: vi.fn(async (f: { path: string }, body: string) => { text.set(f.path, body); }),
  };
  const generated = new Set<string>(); const app = { vault, metadataCache: { getFileCache: (f: { path: string }) => ({ frontmatter: { type: generated.has(f.path) ? "moc" : undefined } }) } } as unknown as App;
  const plugin = new Plugin(app, {} as PluginManifest); plugin.settings = { ...structuredClone(DEFAULT_SETTINGS), mocFolder: "MOCs", provider: "ollama", baseUrl: "http://localhost:11434/v1", model: "synthetic" };
  const index = { getClusters: () => clusters }; Object.assign(plugin, { noteIndexPromise: Promise.resolve(index) });
  return { app, plugin, vault, clusters, generated, files, text, writes: () => vault.create.mock.calls.length + vault.modify.mock.calls.length + vault.createFolder.mock.calls.length };
}
beforeEach(async () => { Plugin = (await vi.importActual<typeof import("./main")>("./main.ts")).default; mocks.Modal.opened = []; mocks.notices = []; mocks.call.mockClear(); setLanguage("en"); });
afterEach(() => { vi.unstubAllGlobals(); });
const modal = () => mocks.Modal.opened.at(-1)!;
describe("MOC preparation protects all existing generator entry points", () => {
  it.each(["cancel", "close"])("%s performs no folder/file writes or requests", async action => {
    const f = fixture(); f.clusters[0].description = "";
    const pending = f.plugin.generateMOCsFromClusters(); await flush();
    expect(modal().contentEl.texts()).toContain("Model requests: 1"); expect(modal().contentEl.texts()).toContain("provider charges");
    expect(f.writes()).toBe(0); expect(mocks.call).not.toHaveBeenCalled();
    if (action === "cancel") modal().contentEl.action("moc-cancel").click(); else modal().close();
    await pending; expect(f.writes()).toBe(0); expect(mocks.call).not.toHaveBeenCalled();
  });
  it("deduplicates pending launches and retains handwritten suffixes and generated-file updates", async () => {
    const f = fixture(); f.clusters.push({ name: "Other", description: "Saved", filePaths: ["B/Note.md"] });
    await f.vault.createFolder("MOCs"); await f.vault.create("MOCs/Topic.md", "Handwritten"); await f.vault.create("MOCs/Other.md", "Old generated"); f.generated.add("MOCs/Other.md");
    const pending = f.plugin.generateMOCsFromClusters(); expect(f.plugin.generateMOCsFromClusters()).toBe(pending); await flush();
    expect(mocks.Modal.opened).toHaveLength(1); expect(modal().contentEl.texts()).toContain("No model requests or charges");
    modal().contentEl.action("moc-confirm").click(); await pending;
    expect(f.text.get("MOCs/Topic.md")).toBe("Handwritten"); expect(f.text.get("MOCs/Topic-2.md")).toContain("[[A/Note|Note]]");
    expect(f.text.get("MOCs/Other.md")).toContain("[[B/Note|Note]]"); expect(f.vault.modify).toHaveBeenCalledTimes(1); expect(mocks.call).not.toHaveBeenCalled();
  });
  it.each(["clusters", "folder", "model", "content", "classification"])("rejects stale %s before IO", async change => {
    const f = fixture(); f.clusters[0].description = "";
    await f.vault.createFolder("MOCs"); await f.vault.create("MOCs/Topic.md", "Old"); const written = f.writes();
    const pending = f.plugin.generateMOCsFromClusters(); await flush();
    if (change === "clusters") f.clusters[0].filePaths.push("B.md");
    if (change === "folder") f.plugin.settings.mocFolder = "Elsewhere";
    if (change === "model") f.plugin.settings.model = "other";
    if (change === "content") f.text.set("MOCs/Topic.md", "Changed without changing mtime");
    if (change === "classification") f.generated.add("MOCs/Topic.md");
    modal().contentEl.action("moc-confirm").click(); await pending;
    expect(mocks.notices.at(-1)).toContain("stale"); expect(f.writes()).toBe(written); expect(mocks.call).not.toHaveBeenCalled();
  });
  it("requires configured model only for missing descriptions and offers audit without a write button when empty", async () => {
    const f = fixture([]); const audit = vi.spyOn(f.plugin, "openAuditModeModal").mockResolvedValue();
    const pending = f.plugin.getToolsPort().generateMocs(); await flush();
    expect(modal().contentEl.action("moc-confirm")).toBeUndefined(); modal().contentEl.action("moc-audit").click(); await pending;
    expect(audit).toHaveBeenCalledOnce(); expect(f.writes()).toBe(0); expect(f.vault.getAbstractFileByPath).not.toHaveBeenCalled();
    f.clusters.push({ name: "Topic", description: "", filePaths: [] }); f.plugin.settings.model = "";
    const second = f.plugin.generateMOCsFromClusters(); await flush(); expect(modal().contentEl.action("moc-confirm").disabled).toBe(true);
    modal().contentEl.action("moc-confirm").click(); modal().close(); await second; expect(f.writes()).toBe(0);
  });
  it("uses the approved model snapshot with the original 200-token request only after confirmation", async () => {
    const f = fixture(); f.clusters[0].description = "";
    vi.stubGlobal("window", { setTimeout: (fn: () => void) => { fn(); return 0; } });
    const pending = f.plugin.generateMOCsFromClusters(); await flush();
    const frozenModel = f.plugin.settings.model;
    expect(mocks.call).not.toHaveBeenCalled(); modal().contentEl.action("moc-confirm").click(); await pending;
    expect(mocks.call).toHaveBeenCalledOnce();
    expect(mocks.call).toHaveBeenCalledWith(expect.objectContaining({ model: frozenModel }), expect.any(String), expect.stringContaining("A/Note.md"), { maxTokens: 200 });
    expect(f.text.get("MOCs/Topic.md")).toContain("Synthetic description");
  });
  it("does not revive a preparation after its plugin owner is unloaded", async () => {
    const f = fixture(); const pending = f.plugin.generateMOCsFromClusters(); await flush();
    Object.assign(f.plugin, { mocEpoch: 1 }); modal().close(); await pending;
    expect(f.writes()).toBe(0); expect(mocks.call).not.toHaveBeenCalled();
    let release!: (index: { getClusters: () => ClusterRecord[] }) => void;
    Object.assign(f.plugin, { noteIndexPromise: new Promise(resolve => { release = resolve; }) });
    const late = f.plugin.generateMOCsFromClusters(); Object.assign(f.plugin, { mocEpoch: 2 });
    release({ getClusters: () => f.clusters }); await late; expect(mocks.Modal.opened).toHaveLength(1);
  });
  it("fails closed on a destination read failure and blocks a file used as folder", async () => {
    const f = fixture(); await f.vault.createFolder("MOCs"); await f.vault.create("MOCs/Topic.md", "Old"); const written = f.writes();
    f.vault.read.mockRejectedValueOnce(new Error("private")); await f.plugin.generateMOCsFromClusters();
    expect(mocks.Modal.opened).toHaveLength(0); expect(f.writes()).toBe(written); expect(mocks.notices.at(-1)).not.toContain("private");
    f.files.set("MOCs", new mocks.TFile("MOCs")); const prepared = await prepareMocs(f.app, f.clusters, f.plugin.settings);
    expect(prepared.error).toContain("destination is a file");
  });
});
