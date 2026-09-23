import { describe, expect, it, vi } from "vitest";
import type { App, PluginManifest } from "obsidian";
import manifest from "./manifest.json";
import { SemanticIntelligenceController } from "./semantic/product/semanticIntelligenceController";
import type { SemanticStatus } from "./semantic/types";
import { requestUrl } from "obsidian";
import type { AIHubSettings } from "./settings";

vi.mock("obsidian", () => ({
  Plugin: class { constructor(public app: App, public manifest: PluginManifest) {} },
  Notice: class {}, Modal: class {}, PluginSettingTab: class {}, Component: class {},
  TFile: class {}, TFolder: class {}, getLanguage: () => "en", requestUrl: vi.fn(),
}));

async function fixture() {
  const { default: Plugin } = await vi.importActual<typeof import("./main")>("./main.ts"); const { DEFAULT_SETTINGS } = await import("./settings");
  const stored = { ...structuredClone(DEFAULT_SETTINGS), provider: "openrouter" as const, apiKey: "synthetic-llm-key",
    model: "sentinel-llm-model", baseUrl: "https://llm.example/v1", temperature: 0.42,
    companion: { ...DEFAULT_SETTINGS.companion, vaultId: "22222222-2222-4222-8222-222222222222" } };
  let disk = structuredClone(stored); const plugin = new Plugin({} as App, manifest);
  plugin.loadData = vi.fn(async () => structuredClone(disk));
  const save = vi.fn(async (data: typeof stored) => { disk = structuredClone(data); }); plugin.saveData = save;
  await plugin.loadSettings();
  const engine = { notifySettingsChanged: vi.fn(), getSemanticStatus: () => ({ kind: "not-initialized", vectorCount: 0 } as SemanticStatus),
    refreshSemanticStatus: vi.fn(async () => ({} as SemanticStatus)), indexVault: vi.fn(), rebuildIndex: vi.fn(),
    openSearch: vi.fn(), openSimilarNotes: vi.fn(), openPotentialDuplicates: vi.fn() };
  Object.assign(plugin, { semanticController: engine });
  const port = plugin.getSemanticSettingsPort();
  const next = { ...port.get(), enabled: true, embeddingModel: "new-model", openRouterApiKey: "synthetic-embedding-key" };
  return { plugin, port, next, engine, save, stored, disk: () => disk };
}

describe("transactional semantic settings in the plugin save queue", () => {
  it.each([false, true])("preserves an Advanced edit made during the setup disk write (corrective write failure: %s)", async (correctionFails) => {
    const f = await fixture(); let release!: () => void; const persist = f.save.getMockImplementation()!;
    f.save.mockImplementationOnce(async (data) => { await new Promise<void>((resolve) => { release = resolve; }); await persist(data); });
    if (correctionFails) f.save.mockRejectedValueOnce(new Error("synthetic-correction-failure"));
    const pending = f.port.update(f.next, f.port.get());
    const rejected = expect(pending).rejects.toThrow(/^Could not save semantic settings\.$/u);
    await vi.waitFor(() => expect(f.save).toHaveBeenCalledTimes(1));
    f.plugin.settings.semantic.embeddingModel = "advanced-edit-during-write";
    const advancedSave = f.plugin.saveSettings();
    release(); await rejected; await advancedSave;
    expect(f.plugin.settings.semantic.embeddingModel).toBe("advanced-edit-during-write");
    expect(f.disk().semantic.embeddingModel).toBe("advanced-edit-during-write");
    expect(f.plugin.settings.semantic.enabled).toBe(false); expect(f.disk().semantic.enabled).toBe(false);
    expect(f.engine.notifySettingsChanged).not.toHaveBeenCalled();
  });
  it("rejects an obsolete Connect candidate if Advanced settings change during the test", async () => {
    const f = await fixture(); vi.stubGlobal("window", { setTimeout, clearTimeout });
    let release!: () => void;
    const response = new Promise<Awaited<ReturnType<typeof requestUrl>>>((resolve) => {
      release = () => resolve({ status: 200, text: '{"data":[{"embedding":[1,0,0]}]}' } as never);
    });
    vi.mocked(requestUrl).mockReturnValueOnce(response as ReturnType<typeof requestUrl>);
    try {
      const controller = new SemanticIntelligenceController(f.port, f.engine);
      const draft = controller.createDraft("cloud"); draft.apiKey = "synthetic-cloud";
      const pending = controller.connect(draft);
      f.plugin.settings.semantic.openAICompatibleApiKey = "synthetic-advanced-edit";
      await f.plugin.saveSettings(); release();
      expect(await pending).toEqual({ ok: false, reason: "save" });
      expect(f.plugin.settings.semantic.openAICompatibleApiKey === "synthetic-advanced-edit").toBe(true);
      expect(f.disk().semantic.openAICompatibleApiKey === "synthetic-advanced-edit").toBe(true);
      expect(f.plugin.settings.semantic.enabled).toBe(false);
      expect(f.engine.notifySettingsChanged).not.toHaveBeenCalled(); expect(f.engine.refreshSemanticStatus).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it("returns copies, persists before publishing, and invalidates exactly once after success", async () => {
    const f = await fixture(); const old = JSON.stringify(f.port.get()); const reference = f.plugin.settings.semantic;
    const copy = f.port.get(); copy.embeddingModel = "not-effective";
    expect(JSON.stringify(f.port.get()) === old).toBe(true);
    let release!: () => void; const persist = f.save.getMockImplementation()!;
    f.save.mockImplementationOnce(async (data) => { await new Promise<void>((resolve) => { release = resolve; }); await persist(data); });
    const expected = JSON.stringify(f.next); const pending = f.port.update(f.next); f.next.embeddingModel = "late-edit";
    await vi.waitFor(() => expect(f.save).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(f.port.get()) === old).toBe(true); expect(f.engine.notifySettingsChanged).not.toHaveBeenCalled();
    release(); const result = await pending;
    expect(JSON.stringify(f.disk().semantic) === expected).toBe(true); expect(JSON.stringify(f.port.get()) === expected).toBe(true);
    expect(f.plugin.settings.semantic === reference).toBe(true);
    expect(f.engine.notifySettingsChanged).toHaveBeenCalledExactlyOnceWith({ reconcile: false });
    result.embeddingModel = "not-effective"; expect(f.port.get().embeddingModel).toBe("new-model");
  });

  it("does not publish, invalidate or leak errors when saveData rejects; retry still works", async () => {
    const f = await fixture(); const before = JSON.stringify(f.plugin.settings);
    f.save.mockRejectedValueOnce(new Error("synthetic-private-save-details"));
    await expect(f.port.update(f.next)).rejects.toThrow(/^Could not save semantic settings\.$/u);
    expect(JSON.stringify(f.plugin.settings) === before).toBe(true); expect(JSON.stringify(f.disk()) === before).toBe(true);
    expect(f.engine.notifySettingsChanged).not.toHaveBeenCalled(); await f.port.update(f.next);
    expect(f.engine.notifySettingsChanged).toHaveBeenCalledTimes(1);
  });

  it.each(["semantic-first", "ordinary-first"])("retains both concurrent settings changes: %s", async (order) => {
    const f = await fixture(); let release!: () => void; const persist = f.save.getMockImplementation()!;
    f.save.mockImplementationOnce(async (data) => { await new Promise<void>((resolve) => { release = resolve; }); await persist(data); });
    if (order === "ordinary-first") f.plugin.settings.notifyOnCopy = false;
    const first = order === "semantic-first" ? f.port.update(f.next) : f.plugin.saveSettings();
    await vi.waitFor(() => expect(f.save).toHaveBeenCalledTimes(1));
    f.plugin.settings.notifyOnCopy = false;
    const second = order === "semantic-first" ? f.plugin.saveSettings() : f.port.update(f.next);
    release(); await Promise.all([first, second]);
    expect(f.disk().notifyOnCopy).toBe(false); expect(f.plugin.settings.notifyOnCopy).toBe(false);
    expect(JSON.stringify(f.disk().semantic) === JSON.stringify(f.next)).toBe(true);
    expect(f.engine.notifySettingsChanged).toHaveBeenCalledTimes(1);
  });

  it("successful Cloud setup leaves all language-model settings and other settings unchanged", async () => {
    const f = await fixture(); vi.stubGlobal("window", { setTimeout, clearTimeout });
    vi.mocked(requestUrl).mockResolvedValueOnce({ status: 200, text: '{"data":[{"embedding":[1,0,0]}]}' } as never);
    try {
      const controller = new SemanticIntelligenceController(f.port, f.engine);
      const draft = controller.createDraft("cloud"); expect(draft.apiKey === f.stored.apiKey).toBe(false);
      draft.apiKey = "synthetic-cloud-key"; expect((await controller.connect(draft)).ok).toBe(true);
      const withoutSemantic = (settings: AIHubSettings) => { const { semantic: _semantic, ...rest } = settings; return JSON.stringify(rest); };
      expect(withoutSemantic(f.plugin.settings) === withoutSemantic(f.stored)).toBe(true);
      expect(withoutSemantic(f.disk()) === withoutSemantic(f.stored)).toBe(true);
      expect(f.plugin.settings.semantic.openRouterApiKey === draft.apiKey).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });
});
