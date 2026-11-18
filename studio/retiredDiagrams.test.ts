import { existsSync, readFileSync } from "node:fs";
import { afterEach, assert, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ ItemView: class {}, TFile: class {}, TFolder: class {}, MarkdownView: class {}, FileView: class {}, EditableFileView: class {}, TextFileView: class {}, getLanguage: () => "en", requestUrl: vi.fn() }));
const studioView = vi.hoisted(() => ({ View: class { suggestSource = vi.fn<(path: string, back: () => void) => void>(); } }));
vi.mock("./view", () => ({ STUDIO_VIEW_TYPE: "veynrel-studio", VeynrelStudioView: studioView.View }));
import type { Plugin } from "obsidian";
import * as transport from "../api";
import { registerStudio } from "./registerStudio";
import { testAdapter } from "./testAdapter";

import { studioFeatures } from "./features";
beforeEach(() => { studioFeatures.enabled = true; });
afterEach(() => { studioFeatures.enabled = false; });

const settings = { provider: "openrouter" as const, baseUrl: "https://openrouter.ai/api/v1", model: "example/model", apiKey: "", temperature: 0.2, topK: 5 };

describe("retired diagram runtime", () => {
  it("registers only the retained Studio owner without probing installed plugins", () => {
    const disk = testAdapter(), commands: { id: string }[] = [], cleanup: (() => void)[] = [];
    const plugins = new Proxy({}, { get() { throw Error("Third-party plugin probe"); } });
    const plugin = { app: { plugins, vault: { adapter: disk.adapter, configDir: ".custom" }, workspace: { getLeavesOfType: () => [] } }, manifest: { id: "ai-knowledge-hub" },
      registerView: vi.fn(), addCommand: (command: { id: string }) => commands.push(command), addRibbonIcon: vi.fn(), register: (fn: () => void) => cleanup.push(fn) };
    const owner = registerStudio(plugin as unknown as Plugin, { get: () => settings, update: async s => s, subscribe: () => () => {} });
    expect(owner).toBeDefined();
    expect(owner).not.toHaveProperty("diagrams");
    expect(commands.map(c => c.id)).toEqual(["veynrel-open-studio"]);
    expect(disk.adapter.read).not.toHaveBeenCalled(); expect(disk.adapter.write).not.toHaveBeenCalled();
    cleanup.forEach(fn => fn());
  });

  it("ignores archived diagram journals while retaining Markdown history namespaces", async () => {
    const disk = testAdapter(), root = ".custom/plugins/ai-knowledge-hub/studio";
    disk.folders.add(`${root}/diagrams`);
    const id = "11111111-1111-4111-8111-111111111111";
    disk.folders.add(`${root}/diagrams/${id}`);
    disk.files.set(`${root}/diagrams/${id}/intent.json`, readFileSync(new URL("../scripts/studio-first-open-legacy/intent.json", import.meta.url), "utf8"));
    disk.files.set(`${root}/diagrams/damaged.json`, "{ incomplete archival record");
    disk.files.set("Drawing.excalidraw.md", "Existing drawing bytes\n");
    const before = new Map(disk.files), cleanup: (() => void)[] = [];
    const plugin = { app: { vault: { adapter: disk.adapter, configDir: ".custom" }, workspace: { getLeavesOfType: () => [] } }, manifest: { id: "ai-knowledge-hub" },
      registerView: vi.fn(), addCommand: vi.fn(), addRibbonIcon: vi.fn(), register: (fn: () => void) => cleanup.push(fn) };
    const owner = registerStudio(plugin as unknown as Plugin, { get: () => settings, update: async s => s, subscribe: () => () => {} });
    assert.isDefined(owner);
    expect(await owner.writer.history()).toEqual([]); expect(await owner.writer.journal.runs()).toEqual([]); expect(await owner.creator.history()).toEqual([]);
    expect(disk.files).toEqual(before); expect(disk.adapter.write).not.toHaveBeenCalled(); expect(disk.adapter.rename).not.toHaveBeenCalled();
    expect(vi.mocked(disk.adapter.read).mock.calls).toEqual([]);
    cleanup.forEach(fn => fn());
  });

  it("has no diagram module, route, adapter or preview in active Studio sources", () => {
    expect(existsSync(new URL("./diagram", import.meta.url))).toBe(false);
    for (const file of ["registerStudio.ts", "view.ts", "ports.ts", "ui.ts", "illustrations.ts"])
      expect(readFileSync(new URL(file, import.meta.url), "utf8")).not.toMatch(/DiagramPanel|DiagramWorkflow|DiagramProposal|ExcalidrawAdapter|\.\/diagram\/|veynrel-diagram|"diagram"|"flowchart"/u);
    expect(readFileSync(new URL("../styles.css", import.meta.url), "utf8")).not.toMatch(/veynrel-diagram|veynrel-studio-diagram|veynrel-studio-mode\b|veynrel-studio-canvas/u);
  });

  it("removes the diagram-only metadata API and schema routing, even for stale call options", () => {
    expect(transport).not.toHaveProperty("readOpenRouterEndpoints"); expect(transport).not.toHaveProperty("StructuredOutputUnavailableError");
    const oldOptions = { maxTokens: 2000, structuredOutput: { name: "diagram_spec_v1", schema: {}, endpoint: "example/region" } };
    const body = transport.buildChatBody(settings, "Markdown only", "Synthetic source", oldOptions);
    expect(body).not.toHaveProperty("response_format"); expect(body).not.toHaveProperty("provider");
    expect(body.messages).toEqual([{ role: "system", content: "Markdown only" }, { role: "user", content: "Synthetic source" }]);
  });
});


it("returns to a registered inactive Notes leaf and never resurrects a closed leaf", async () => {
  const disk = testAdapter(), view = new studioView.View();
  const previous = { view: { getViewType: () => "veynrel-health", containerEl: { isConnected: false } } };
  const leaf = { view, setViewState: vi.fn(async () => {}) };
  let alive = true;
  const workspace = { getLeavesOfType: (type: string) => type === "veynrel-studio" ? [leaf] : alive ? [previous] : [],
    getActiveViewOfType: () => ({ leaf: previous }), revealLeaf: vi.fn(async () => {}), setActiveLeaf: vi.fn() };
  const plugin = { app: { vault: { adapter: disk.adapter, configDir: ".custom" }, workspace }, manifest: { id: "ai-knowledge-hub" },
    registerView: vi.fn(), addCommand: vi.fn(), addRibbonIcon: vi.fn(), register: vi.fn() };
  const owner = registerStudio(plugin as unknown as Plugin, { get: () => settings, update: async s => s, subscribe: () => () => {} });
  assert.isDefined(owner);
  owner.inventory = () => ["Selected.md"];
  await owner.openNote!("Selected.md");
  expect(view.suggestSource.mock.calls[0][0]).toBe("Selected.md");
  expect(owner.runner.state).toBe("idle"); expect(disk.adapter.read).not.toHaveBeenCalled(); expect(disk.adapter.write).not.toHaveBeenCalled();
  const back = view.suggestSource.mock.calls[0][1]; back(); await Promise.resolve();
  expect(workspace.setActiveLeaf).toHaveBeenCalledWith(previous, { focus: true });
  alive = false; workspace.setActiveLeaf.mockClear(); workspace.revealLeaf.mockClear(); back(); await Promise.resolve();
  expect(workspace.revealLeaf).not.toHaveBeenCalled(); expect(workspace.setActiveLeaf).not.toHaveBeenCalled();
  owner.runner.dispose(); owner.operations.dispose();
});

it("hides all Studio entry points and detaches restored views without touching stored data", () => {
  studioFeatures.enabled = false;
  const disk = testAdapter(), detach = vi.fn(), callbacks: (() => void)[] = [];
  const plugin = { app: { vault: { adapter: disk.adapter, configDir: ".custom" }, workspace: {
    onLayoutReady: (fn: () => void) => callbacks.push(fn), getLeavesOfType: () => [{ detach }],
  } }, manifest: { id: "ai-knowledge-hub" }, registerView: vi.fn(), addCommand: vi.fn(), addRibbonIcon: vi.fn(), register: vi.fn() };
  const owner = registerStudio(plugin as unknown as Plugin, { get: () => settings, update: async s => s, subscribe: () => () => {} });
  expect(plugin.registerView).not.toHaveBeenCalled(); expect(plugin.addCommand).not.toHaveBeenCalled(); expect(plugin.addRibbonIcon).not.toHaveBeenCalled();
  expect(owner).toBeUndefined();
  expect(detach).not.toHaveBeenCalled(); callbacks.forEach(fn => fn()); expect(detach).toHaveBeenCalledOnce();
  expect(disk.adapter.read).not.toHaveBeenCalled(); expect(disk.adapter.write).not.toHaveBeenCalled(); expect(disk.adapter.rename).not.toHaveBeenCalled();
});
