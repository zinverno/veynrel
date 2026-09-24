import { afterEach, describe, expect, it, vi } from "vitest";
import type { App, PluginManifest } from "obsidian";
import { requestUrl } from "obsidian";
import manifest from "./manifest.json";
import { DeepIntelligenceController } from "./deep/product/deepIntelligenceController";
import { testConnection, callOpenRouter } from "./api";
import type { AIHubSettings } from "./settings";
import { DeepHealthAnalysisAdapter } from "./deep/health/deepHealthAnalysisAdapter";

vi.mock("obsidian", () => ({
  Plugin: class { constructor(public app: App, public manifest: PluginManifest) {} },
  Notice: class {}, Modal: class {}, PluginSettingTab: class {}, Component: class {},
  TFile: class {}, TFolder: class {}, getLanguage: () => "en", requestUrl: vi.fn(),
}));
afterEach(() => { vi.unstubAllGlobals(); vi.mocked(requestUrl).mockReset(); });

async function fixture(storedPatch: Partial<AIHubSettings> = {}) {
  const { default: Plugin } = await vi.importActual<typeof import("./main")>("./main.ts");
  const { DEFAULT_SETTINGS } = await import("./settings");
  const stored = { ...structuredClone(DEFAULT_SETTINGS), provider: "openrouter" as const, apiKey: "synthetic-sentinel-key",
    model: "legacy-model", baseUrl: "https://llm.example/v1", temperature: 0.42, topK: 8,
    companion: { ...DEFAULT_SETTINGS.companion, vaultId: "22222222-2222-4222-8222-222222222222" }, ...storedPatch };
  let disk = structuredClone(stored); const plugin = new Plugin({} as App, manifest);
  plugin.loadData = vi.fn(async () => structuredClone(disk));
  const save = vi.fn(async (data: AIHubSettings) => { disk = structuredClone(data); }); plugin.saveData = save;
  await plugin.loadSettings();
  const engine = { notifyCompanionSettingsChanged: vi.fn(), notifySettingsChanged: vi.fn() }; Object.assign(plugin, { semanticController: engine });
  const port = plugin.getLanguageModelSettingsPort();
  const connection = { test: vi.fn(async (_settings: ReturnType<typeof port.get>) => {}) };
  const controller = new DeepIntelligenceController(port, connection);
  const next = { ...port.get(), provider: "custom" as const, model: "candidate-model", baseUrl: "https://custom.example/v1", apiKey: "" };
  return { plugin, port, next, connection, controller, engine, save, stored, disk: () => disk };
}

describe("shared language-model settings transactions", () => {
  it("failed cloud-to-local Advanced save cannot offer local consent or send notes to the committed cloud", async () => {
    const f = await fixture(); const getMarkdownFiles = vi.fn();
    const adapter = new DeepHealthAnalysisAdapter({ vault: { getMarkdownFiles } } as unknown as App, () => f.plugin.getDeepKnowledgeConfiguration());
    const cloudConsent = adapter.getConsent()!; expect(cloudConsent.providerKind).toBe("cloud");
    f.plugin.settings.provider = "ollama"; f.plugin.settings.baseUrl = "http://localhost:11434/v1";
    f.save.mockRejectedValueOnce(new Error("PRIVATE_DISK")); await expect(f.plugin.saveSettings()).rejects.toThrow();
    expect(f.controller.getSnapshot().provider).toBe("ollama"); expect(adapter.getConsent()).toBeUndefined();
    await expect(adapter.analyzeKnowledge(new AbortController().signal, cloudConsent)).rejects.toMatchObject({ code: "deep-config-changed" });
    expect(getMarkdownFiles).not.toHaveBeenCalled(); expect(requestUrl).not.toHaveBeenCalled();
    await f.plugin.saveSettings(); expect(adapter.getConsent()?.providerKind).toBe("local");
    await expect(adapter.analyzeKnowledge(new AbortController().signal, cloudConsent)).rejects.toMatchObject({ code: "deep-config-changed" });
    expect(getMarkdownFiles).not.toHaveBeenCalled(); expect(requestUrl).not.toHaveBeenCalled();
  });
  it("Knowledge captures only committed settings, increments an opaque revision for relevant changes, and preserves copies", async () => {
    const f = await fixture(); const initial = f.plugin.getDeepKnowledgeConfiguration();
    const copy = f.plugin.getDeepKnowledgeConfiguration(); copy.settings.model = "discarded"; copy.settings.deepAudit.batchSize = 99;
    expect(f.plugin.getDeepKnowledgeConfiguration()).toEqual(initial);
    f.plugin.settings.model = "unsaved";
    expect(f.plugin.getDeepKnowledgeConfiguration()).toEqual({ ...initial, current: false });
    f.save.mockRejectedValueOnce(new Error("PRIVATE_DISK"));
    await expect(f.plugin.saveSettings()).rejects.toThrow(); expect(f.plugin.getDeepKnowledgeConfiguration()).toEqual({ ...initial, current: false });
    await f.plugin.saveSettings(); const changed = f.plugin.getDeepKnowledgeConfiguration();
    expect(changed.settings.model).toBe("unsaved"); expect(changed.revision).toBeGreaterThan(initial.revision);
    f.plugin.settings.model = initial.settings.model; await f.plugin.saveSettings();
    expect(f.plugin.getDeepKnowledgeConfiguration().revision).toBeGreaterThan(changed.revision);
    const before = f.plugin.getDeepKnowledgeConfiguration();
    await f.plugin.saveSettings({ ...f.plugin.settings.health, profile: "research" });
    expect(f.plugin.getDeepKnowledgeConfiguration()).toEqual(before);
    for (const edit of [() => { f.plugin.settings.apiKey = "changed"; }, () => { f.plugin.settings.baseUrl = "https://other.example/v1"; },
      () => { f.plugin.settings.temperature = 0.5; }, () => { f.plugin.settings.topK++; },
      () => { f.plugin.settings.deepAudit.batchSize++; }, () => { f.plugin.settings.deepAudit.maxConcurrent++; },
      () => { f.plugin.settings.deepAudit.delayMs++; }]) {
      const revision = f.plugin.getDeepKnowledgeConfiguration().revision; edit(); await f.plugin.saveSettings();
      expect(f.plugin.getDeepKnowledgeConfiguration().revision).toBeGreaterThan(revision);
    }
    expect(f.connection.test).not.toHaveBeenCalled();
  });
  it("loads legacy provider inference without extra writes or testing", async () => {
    const f = await fixture({ provider: undefined, baseUrl: "http://localhost:11434/v1", apiKey: "" });
    expect(f.port.get().provider).toBe("ollama"); expect(f.controller.getSnapshot().state).toBe("configured");
    expect(f.save).not.toHaveBeenCalled(); expect(f.connection.test).not.toHaveBeenCalled();
    const listener = vi.fn(); f.port.subscribe(listener); await f.plugin.loadSettings(); expect(listener).toHaveBeenCalledTimes(1);
  });
  it("returns copies, copies candidates, persists before publication, and isolates subscribers", async () => {
    const f = await fixture(); const before = f.port.get(); const reference = f.plugin.settings;
    f.port.get().model = "discarded"; expect(f.port.get()).toEqual(before);
    const listener = vi.fn(); f.port.subscribe(() => { throw new Error("private view error"); }); const remove = f.port.subscribe(listener);
    let release!: () => void; const persist = f.save.getMockImplementation()!;
    f.save.mockImplementationOnce(async (data) => { await new Promise<void>((resolve) => { release = resolve; }); await persist(data); });
    const pending = f.port.update(f.next, before); f.next.model = "late-edit";
    await vi.waitFor(() => expect(f.save).toHaveBeenCalledTimes(1));
    expect(f.port.get()).toEqual(before); expect(listener).not.toHaveBeenCalled();
    release(); const result = await pending;
    expect(result.model).toBe("candidate-model"); expect(f.disk().model).toBe(result.model);
    expect(f.plugin.settings).toBe(reference); expect(listener).toHaveBeenCalledTimes(1);
    result.model = "discarded"; expect(f.port.get().model).toBe("candidate-model");
    remove(); await f.plugin.saveSettings(); expect(listener).toHaveBeenCalledTimes(1);
  });
  it.each(["provider", "model", "apiKey", "baseUrl"] as const)("rejects Connect after an Advanced %s edit during testing", async (key) => {
    const f = await fixture(); let release!: () => void;
    f.connection.test.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const pending = f.controller.connect(f.next);
    if (key === "provider") f.plugin.settings.provider = "groq";
    else f.plugin.settings[key] = "new-advanced-value";
    await f.plugin.saveSettings(); const advanced = f.port.get(); release();
    expect(await pending).toEqual({ ok: false, reason: "save" });
    expect(f.port.get()).toEqual(advanced); expect(f.disk()[key] === advanced[key]).toBe(true);
    expect(f.save).toHaveBeenCalledTimes(1); expect(f.controller.getSnapshot().state).toBe("configured");
  });
  it.each(["provider", "model", "apiKey", "baseUrl"] as const)("preserves Advanced %s edits made while candidate saveData is in flight", async (key) => {
    const f = await fixture(); let release!: () => void; const persist = f.save.getMockImplementation()!;
    f.save.mockImplementationOnce(async (data) => { await new Promise<void>((resolve) => { release = resolve; }); await persist(data); });
    const pending = f.controller.connect(f.next);
    await vi.waitFor(() => expect(f.save).toHaveBeenCalledTimes(1));
    if (key === "provider") f.plugin.settings.provider = "groq";
    else f.plugin.settings[key] = "advanced-during-write";
    const advanced = f.port.get(); const advancedSave = f.plugin.saveSettings();
    release(); expect(await pending).toEqual({ ok: false, reason: "save" }); await advancedSave;
    expect(f.port.get()).toEqual(advanced); expect(f.disk()[key] === advanced[key]).toBe(true);
    expect(f.disk().model).not.toBe("candidate-model"); expect(f.controller.getSnapshot().state).toBe("configured");
    expect(f.save).toHaveBeenCalledTimes(3);
  });
  it("queued Advanced save restores bytes even if the corrective write fails", async () => {
    const f = await fixture(); let release!: () => void; const persist = f.save.getMockImplementation()!;
    f.save.mockImplementationOnce(async (data) => { await new Promise<void>((resolve) => { release = resolve; }); await persist(data); });
    f.save.mockRejectedValueOnce(new Error("synthetic-corrective-write-failure"));
    const pending = f.controller.connect(f.next); await vi.waitFor(() => expect(f.save).toHaveBeenCalledTimes(1));
    f.plugin.settings.model = "advanced-model"; const advancedSave = f.plugin.saveSettings();
    release(); expect(await pending).toEqual({ ok: false, reason: "save" }); await advancedSave;
    expect(f.disk().model).toBe("advanced-model"); expect(f.controller.getSnapshot().state).toBe("configured");
  });
  it("preserves concurrent Health, Semantic, Companion, UI, tuning changes during testing", async () => {
    const f = await fixture(); let release!: () => void;
    f.connection.test.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const pending = f.controller.connect(f.next);
    f.plugin.settings.companion.enabled = true; f.plugin.settings.notifyOnCopy = false;
    f.plugin.settings.deepAudit.batchSize = 2; f.plugin.settings.temperature = 0.7; f.plugin.settings.topK = 19;
    await Promise.all([
      f.plugin.saveSettings({ ...f.plugin.settings.health, profile: "research", profileChosen: true }),
      f.plugin.getSemanticSettingsPort().update({ ...f.plugin.settings.semantic, embeddingModel: "new-embedding-model" }),
      f.plugin.saveSettings(),
    ]);
    const before = structuredClone(f.disk()); release(); expect(await pending).toEqual({ ok: true });
    expect(f.disk()).toEqual({ ...before, provider: f.next.provider, model: f.next.model, baseUrl: f.next.baseUrl, apiKey: f.next.apiKey });
    expect(f.plugin.settings).toEqual(f.disk()); expect(f.engine.notifySettingsChanged).toHaveBeenCalledTimes(1);
  });
  it.each(["deep-first", "ordinary-first"])("preserves unrelated edits during persistence: %s", async (order) => {
    const f = await fixture(); let release!: () => void; const persist = f.save.getMockImplementation()!;
    f.save.mockImplementationOnce(async (data) => { await new Promise<void>((resolve) => { release = resolve; }); await persist(data); });
    const first = order === "deep-first" ? f.port.update(f.next) : f.plugin.saveSettings();
    await vi.waitFor(() => expect(f.save).toHaveBeenCalledTimes(1));
    f.plugin.settings.notifyOnCopy = false; f.plugin.settings.temperature = 0.8;
    const second = order === "deep-first" ? f.plugin.saveSettings() : f.port.update(f.next);
    release(); await Promise.all([first, second]);
    expect(f.disk().model).toBe("candidate-model"); expect(f.disk().notifyOnCopy).toBe(false); expect(f.disk().temperature).toBe(0.8);
  });
  it("failed test/save leaves settings and disk unchanged, exposes no raw error, and allows retry", async () => {
    const f = await fixture(); const before = structuredClone(f.disk());
    f.connection.test.mockRejectedValueOnce(new Error("synthetic-private-test"));
    expect(await f.controller.connect(f.next)).toEqual({ ok: false, reason: "connection" }); expect(f.save).not.toHaveBeenCalled();
    f.save.mockRejectedValueOnce(new Error("synthetic-private-storage"));
    expect(await f.controller.connect(f.next)).toEqual({ ok: false, reason: "save" });
    expect(f.plugin.settings).toEqual(before); expect(f.disk()).toEqual(before); expect(f.controller.getSnapshot().state).toBe("configured");
    expect(await f.controller.connect(f.next)).toEqual({ ok: true });
  });
  it("Advanced changes notify two product observers; Check writes zero settings", async () => {
    const f = await fixture(); const a = vi.fn(); const b = vi.fn(); const remove = f.controller.subscribe(a); f.controller.subscribe(b);
    expect(await f.controller.checkCurrentSetup()).toEqual({ ok: true }); expect(f.save).not.toHaveBeenCalled();
    f.plugin.settings.model = "advanced-model"; await f.plugin.saveSettings();
    expect(f.controller.getSnapshot()).toMatchObject({ model: "advanced-model", state: "configured" });
    expect(a).toHaveBeenCalledTimes(3); expect(b).toHaveBeenCalledTimes(3);
    remove(); await f.plugin.saveSettings(); expect(a).toHaveBeenCalledTimes(3); expect(b).toHaveBeenCalledTimes(4);
    expect(f.connection.test).toHaveBeenCalledTimes(1);
  });
  it.each(["ollama", "openrouter", "openai", "groq", "custom"] as const)("reuses the exact existing %s connection request and shared legacy transport", async (provider) => {
    const f = await fixture({ provider, model: "fixture-model", baseUrl: "http://127.0.0.1:54321/v1" });
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    vi.mocked(requestUrl).mockResolvedValue({ status: 200, text: '{"models":[{"name":"fixture-model"}],"choices":[{"message":{"content":"fixture"}}]}' } as never);
    const controller = new DeepIntelligenceController(f.port, { test: async (candidate) => { await testConnection({ ...f.plugin.settings, ...candidate }); } });
    expect(await controller.connect(controller.createDraft(provider))).toEqual({ ok: true });
    expect(requestUrl).toHaveBeenCalledTimes(1);
    const request = vi.mocked(requestUrl).mock.calls[0][0] as { url: string; body?: string; method: string };
    expect(request.url).toBe(`http://127.0.0.1:54321/${provider === "ollama" ? "api/tags" : "v1/chat/completions"}`);
    if (provider === "ollama") { expect(request.method).toBe("GET"); expect(request.body).toBeUndefined(); }
    else expect(JSON.parse(request.body!)).toEqual({ model: "fixture-model", messages: [{ role: "user", content: "Hi" }], max_tokens: 1 });
    f.save.mockClear(); await controller.checkCurrentSetup(); expect(f.save).not.toHaveBeenCalled(); expect(requestUrl).toHaveBeenCalledTimes(2);
    // This is the unchanged transport used by Deep Audit, writing, RAG, batch and flashcards.
    await callOpenRouter(f.plugin.settings, "synthetic-system", "synthetic-user");
    const body = JSON.parse((vi.mocked(requestUrl).mock.calls[2][0] as { body: string }).body) as { model: string };
    expect(body.model).toBe(f.port.get().model); expect(f.engine.notifySettingsChanged).not.toHaveBeenCalled();
    expect(f.disk().semantic).toEqual(f.stored.semantic); expect(f.disk().health).toEqual(f.stored.health);
  });
});
