import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { App, PluginManifest } from "obsidian";

const mocks = vi.hoisted(() => ({ opened: [] as unknown[] }));
vi.mock("obsidian", () => ({
  Plugin: class { constructor(public app: App) {} },
  Modal: class { open() { mocks.opened.push(this); } },
  Notice: vi.fn(), PluginSettingTab: class {}, Component: class {}, TFile: class {}, TFolder: class {}, getLanguage: () => "en",
}));
afterEach(() => { vi.restoreAllMocks(); mocks.opened.length = 0; });

describe("Tools host delegates to authoritative legacy workflows", () => {
  it("launches the exact batch and audit modals, existing RAG controller, MOC generator and legacy report once", async () => {
    const { default: Plugin, BatchProcessModal } = await vi.importActual<typeof import("./main")>("./main.ts");
    const { DEFAULT_SETTINGS } = await import("./settings");
    const plugin = new Plugin({} as App, {} as PluginManifest);
    plugin.settings = { ...structuredClone(DEFAULT_SETTINGS), provider: "ollama", model: "fixture", baseUrl: "http://localhost:11434/v1" };
    const rag = { openAskVault: vi.fn() };
    Object.assign(plugin, { semanticController: rag });
    const batch = vi.spyOn(plugin, "runBatchProcessing").mockResolvedValue();
    const deep = vi.spyOn(plugin, "runDeepVaultAudit").mockResolvedValue();
    const mocs = vi.spyOn(plugin, "generateMOCsFromClusters").mockResolvedValue();
    const legacy = vi.spyOn(plugin, "runVaultAudit").mockResolvedValue();
    const port = plugin.getToolsPort();
    expect(mocks.opened).toEqual([]);
    port.openBatchProcessing(); expect(mocks.opened[0]).toBeInstanceOf(BatchProcessModal);
    await port.openDeepAudit(); expect(mocks.opened[1]?.constructor.name).toBe("AuditModeModal");
    expect(mocks.opened).toHaveLength(2); expect(batch).not.toHaveBeenCalled(); expect(deep).not.toHaveBeenCalled();
    port.openAskVault(); expect(rag.openAskVault).toHaveBeenCalledTimes(1);
    await port.generateMocs(); expect(mocs).toHaveBeenCalledTimes(1);
    await port.runLegacyVaultAudit(); expect(legacy).toHaveBeenCalledTimes(1);
  });
  it("retains the authoritative missing-LLM validation before Deep Audit opens", async () => {
    const { default: Plugin } = await vi.importActual<typeof import("./main")>("./main.ts");
    const { DEFAULT_SETTINGS } = await import("./settings");
    const { Notice } = await import("obsidian");
    vi.mocked(Notice).mockClear();
    const plugin = new Plugin({} as App, {} as PluginManifest); plugin.settings = structuredClone(DEFAULT_SETTINGS);
    await plugin.getToolsPort().openDeepAudit();
    expect(mocks.opened).toHaveLength(0); expect(Notice).toHaveBeenCalledTimes(1);
  });
  it("keeps existing batch command callbacks and editor ownership; no private settings navigation", () => {
    const main = readFileSync("main.ts", "utf8");
    for (const id of ["ai-hub-open-panel", "ai-batch-process"]) {
      expect(main).toMatch(new RegExp(`id: "${id}",\\s*name: [^\\n]+\\s*callback: \\(\\) => new BatchProcessModal\\(this.app, this\\).open\\(\\)`, "u"));
    }
    const view = readFileSync("health/ui/VeynrelHealthView.ts", "utf8");
    const catalog = readFileSync("health/ui/toolsViewModel.ts", "utf8");
    expect(view + catalog).not.toMatch(/getActiveViewOfType|getActiveFile|lastEditor|executeCommandById|openTabById|app\.setting|\bas any\b/u);
    expect(view + catalog).not.toMatch(/new (?:DeepAuditEngine|RagService|BatchProcessModal|ObsidianSemanticController|NoteIndexManager)/u);
  });
});
