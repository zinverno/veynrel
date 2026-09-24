import { afterEach, describe, expect, it, vi } from "vitest";
import type { App, PluginManifest } from "obsidian";
import { requestUrl } from "obsidian";
import manifest from "./manifest.json";
import type { AIHubSettings } from "./settings";
import { ConnectController } from "./connect/product/connectController";
import { ObsidianSemanticController } from "./semantic/obsidianSemanticController";

const review = vi.hoisted(() => ({ open: vi.fn(), applications: [] as unknown[] }));
vi.mock("./proposals/reviewModal", () => ({ ProposalReviewModal: class {
  constructor(_app: unknown, application: unknown) { review.applications.push(application); }
  open(): void { review.open(); }
} }));
vi.mock("obsidian", () => ({
  Plugin: class { constructor(public app: App, public manifest: PluginManifest) {} },
  Notice: class {}, Modal: class {}, PluginSettingTab: class {}, Component: class {},
  TFile: class {}, TFolder: class {}, getLanguage: () => "en", requestUrl: vi.fn(),
}));
afterEach(() => { vi.unstubAllGlobals(); vi.mocked(requestUrl).mockReset(); review.applications = []; review.open.mockClear(); });

async function fixture() {
  const { default: Plugin } = await vi.importActual<typeof import("./main")>("./main.ts");
  const { DEFAULT_SETTINGS } = await import("./settings");
  const stored: AIHubSettings = { ...structuredClone(DEFAULT_SETTINGS), apiKey: "PRIVATE_LLM_KEY", notifyOnCopy: true,
    semantic: { ...DEFAULT_SETTINGS.semantic, openRouterApiKey: "PRIVATE_EMBEDDING_KEY", openAICompatibleApiKey: "PRIVATE_EMBEDDING_KEY" },
    companion: { enabled: true, endpoint: "http://127.0.0.1:27124", token: "PRIVATE_COMPANION_TOKEN", timeoutMs: 2300,
      vaultId: "22222222-2222-4222-8222-222222222222" } };
  let disk = structuredClone(stored);
  const plugin = new Plugin({ vault: { configDir: ".obsidian" } } as App, manifest);
  plugin.loadData = vi.fn(async () => structuredClone(disk));
  const save = vi.fn(async (data: AIHubSettings) => { disk = structuredClone(data); }); plugin.saveData = save;
  await plugin.loadSettings();
  const semantic = new ObsidianSemanticController(plugin);
  Object.assign(plugin, { semanticController: semantic });
  const invalidation = vi.spyOn(semantic, "notifyCompanionSettingsChanged");
  const port = plugin.getCompanionSettingsPort();
  const engine = {
    getStatus: () => semantic.getCompanionStatus(), subscribeStatus: (fn: () => void) => semantic.subscribeCompanionStatus(fn),
    test: vi.fn(async (_settings: ReturnType<typeof port.get>) => {}), syncCurrent: vi.fn(async () => "synced" as const),
    getSemanticMirrorState: () => ({ enabled: false, cachedReady: false }), openProposalReview: () => plugin.openProposalReview(),
  };
  const controller = new ConnectController(port, engine);
  const draft = controller.createDraft("remote"); draft.endpoint = "https://candidate.example"; draft.token = "PRIVATE_CANDIDATE_TOKEN";
  return { plugin, port, engine, semantic, invalidation, controller, draft, save, stored, disk: () => disk };
}

describe("Connect shared settings transactions", () => {
  it("copies settings, commits only Simple fields after persistence, preserves the Advanced reference, isolates observers", async () => {
    const f = await fixture(); const before = f.port.get(), reference = f.plugin.settings.companion;
    f.port.get().token = "discarded"; expect(f.port.get()).toEqual(before);
    const listener = vi.fn(); f.port.subscribe(() => { throw new Error("private view"); }); const remove = f.port.subscribe(listener);
    let release!: () => void; const persist = f.save.getMockImplementation()!;
    f.save.mockImplementationOnce(async (value) => { await new Promise<void>((resolve) => { release = resolve; }); await persist(value); });
    const candidate = { ...before, endpoint: f.draft.endpoint, token: f.draft.token, timeoutMs: 9999, vaultId: "discarded" };
    const pending = f.port.update(candidate, before); candidate.token = "late-edit";
    await vi.waitFor(() => expect(f.save).toHaveBeenCalledTimes(1));
    expect(f.port.get()).toEqual(before); expect(listener).not.toHaveBeenCalled();
    release(); const saved = await pending;
    expect(saved).toEqual({ ...before, endpoint: f.draft.endpoint, token: f.draft.token });
    expect(f.plugin.settings.companion).toBe(reference); expect(f.disk().companion).toEqual(saved);
    expect(f.invalidation).toHaveBeenCalledTimes(1); expect(listener).toHaveBeenCalledTimes(1);
    remove(); await f.plugin.saveSettings(); expect(listener).toHaveBeenCalledTimes(1);
  });
  const changes = { enabled: false, endpoint: "https://advanced.example", token: "PRIVATE_ADVANCED_TOKEN", timeoutMs: 7000,
    vaultId: "33333333-3333-4333-8333-333333333333" };
  it.each(Object.keys(changes) as Array<keyof typeof changes>)("Advanced %s during test wins without any candidate save", async (key) => {
    const f = await fixture(); let release!: () => void;
    f.engine.test.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const pending = f.controller.connect(f.draft);
    Object.assign(f.plugin.settings.companion, { [key]: changes[key] });
    await f.plugin.saveSettings(); const advanced = f.port.get(); release();
    expect(await pending).toEqual({ ok: false, reason: "changed" });
    expect(f.port.get()).toEqual(advanced); expect(f.disk().companion).toEqual(advanced);
    expect(f.save).toHaveBeenCalledTimes(1); expect(f.controller.getSnapshot().state).not.toBe("ready");
  });
  it.each(Object.keys(changes) as Array<keyof typeof changes>)("Advanced %s during candidate saveData wins in memory and on disk", async (key) => {
    const f = await fixture(); let release!: () => void; const persist = f.save.getMockImplementation()!;
    f.save.mockImplementationOnce(async (value) => { await new Promise<void>((resolve) => { release = resolve; }); await persist(value); });
    const pending = f.controller.connect(f.draft);
    await vi.waitFor(() => expect(f.save).toHaveBeenCalledTimes(1));
    Object.assign(f.plugin.settings.companion, { [key]: changes[key] });
    f.plugin.notifyCompanionSettingsChanged(); const advanced = f.port.get(); const advancedSave = f.plugin.saveSettings();
    release(); expect(await pending).toEqual({ ok: false, reason: "save" }); await advancedSave;
    expect(f.port.get()).toEqual(advanced); expect(f.disk().companion).toEqual(advanced);
    expect(f.save).toHaveBeenCalledTimes(3); expect(f.controller.getSnapshot().state).not.toBe("ready");
  });
  it("queued Advanced save repairs disk even if corrective persistence fails", async () => {
    const f = await fixture(); let release!: () => void; const persist = f.save.getMockImplementation()!;
    f.save.mockImplementationOnce(async (value) => { await new Promise<void>((resolve) => { release = resolve; }); await persist(value); });
    f.save.mockRejectedValueOnce(new Error("PRIVATE_DISK_FAILURE"));
    const pending = f.controller.connect(f.draft); await vi.waitFor(() => expect(f.save).toHaveBeenCalledTimes(1));
    f.plugin.settings.companion.token = "newer"; const save = f.plugin.saveSettings();
    release(); expect(await pending).toEqual({ ok: false, reason: "save" }); await save;
    expect(f.disk().companion).toEqual(f.plugin.settings.companion); expect(f.disk().companion.token).toBe("newer");
  });
  it.each(["test", "persistence"])("preserves Health, Semantic, Deep, Recall preferences and ordinary UI edits during %s", async (phase) => {
    const f = await fixture(); let release!: () => void;
    if (phase === "test") f.engine.test.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    else {
      const persist = f.save.getMockImplementation()!;
      f.save.mockImplementationOnce(async (value) => { await new Promise<void>((resolve) => { release = resolve; }); await persist(value); });
    }
    const pending = f.controller.connect(f.draft);
    if (phase === "persistence") await vi.waitFor(() => expect(f.save).toHaveBeenCalledTimes(1));
    f.plugin.settings.notifyOnCopy = false; f.plugin.settings.language = "ru";
    const preferences = f.plugin.saveSettings({ ...f.plugin.settings.health, profile: "research", profileChosen: true });
    const semantic = f.plugin.getSemanticSettingsPort().update({ ...f.plugin.settings.semantic, embeddingModel: "new-model" });
    const deep = f.plugin.getLanguageModelSettingsPort().update({ ...f.plugin.getLanguageModelSettingsPort().get(), model: "new-llm-model" });
    if (phase === "test") await Promise.all([preferences, semantic, deep]);
    release(); expect(await pending).toEqual({ ok: true }); await Promise.all([preferences, semantic, deep]);
    expect(f.disk()).toEqual(f.plugin.settings);
    expect(f.disk()).toMatchObject({ notifyOnCopy: false, language: "ru", model: "new-llm-model",
      health: { profile: "research" }, semantic: { embeddingModel: "new-model" }, companion: { endpoint: f.draft.endpoint } });
    expect(f.disk().companion.vaultId).toBe(f.stored.companion.vaultId); expect(f.disk().companion.timeoutMs).toBe(2300);
  });
  it("failed test or save preserves current settings and can be retried", async () => {
    const f = await fixture(); const before = f.disk();
    f.engine.test.mockRejectedValueOnce(new Error("PRIVATE_BODY"));
    expect(await f.controller.connect(f.draft)).toEqual({ ok: false, reason: "server" }); expect(f.save).not.toHaveBeenCalled();
    f.save.mockRejectedValueOnce(new Error("PRIVATE_DISK"));
    expect(await f.controller.connect(f.draft)).toEqual({ ok: false, reason: "save" });
    expect(f.port.get()).toEqual(before.companion); expect(f.disk()).toEqual(before); expect(f.controller.getSnapshot().state).toBe("configured");
    expect(await f.controller.connect(f.draft)).toEqual({ ok: true });
  });
  it("actual existing status request sends no Vault body or provider credentials, and Check saves nothing", async () => {
    const f = await fixture(); vi.stubGlobal("window", { setTimeout, clearTimeout });
    vi.mocked(requestUrl).mockResolvedValue({ status: 200, text: '{"status":"ok","protocolVersion":1,"vaultCount":0}' } as never);
    f.engine.test.mockImplementation((settings) => f.semantic.rawTestCompanion(settings, undefined, false));
    expect(await f.controller.connect(f.draft)).toEqual({ ok: true }); f.save.mockClear();
    expect(await f.controller.check()).toEqual({ ok: true });
    expect(requestUrl).toHaveBeenCalledTimes(2); expect(f.save).not.toHaveBeenCalled();
    for (const [request] of vi.mocked(requestUrl).mock.calls) {
      expect(request).toEqual({ url: "https://candidate.example/v1/status", method: "GET", contentType: "application/json",
        headers: { Authorization: "Bearer PRIVATE_CANDIDATE_TOKEN", "x-companion-protocol-version": "1" }, throw: false });
      expect(JSON.stringify(request)).not.toMatch(/PRIVATE_LLM_KEY|PRIVATE_EMBEDDING_KEY|Markdown|chunks|findings|recall/u);
    }
  });
  it("Disable invalidates existing queue once and preserves all stored values without a request", async () => {
    const f = await fixture(); const before = f.port.get();
    await f.controller.disable();
    expect(f.disk().companion).toEqual({ ...before, enabled: false }); expect(f.invalidation).toHaveBeenCalledTimes(1);
    expect(requestUrl).not.toHaveBeenCalled(); expect(f.engine.test).not.toHaveBeenCalled();
  });
  it.each([true, false])("Disable supersedes an older Connect test when initially enabled=%s", async (enabled) => {
    const f = await fixture(); f.plugin.settings.companion.enabled = enabled; await f.plugin.saveSettings(); f.save.mockClear();
    const before = f.port.get(); let release!: () => void;
    f.engine.test.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const pending = f.controller.connect(f.controller.createDraft("local"));
    expect(await f.controller.disable()).toEqual({ ok: true }); release();
    expect(await pending).toEqual({ ok: false, reason: "changed" });
    expect(f.disk().companion).toEqual({ ...before, enabled: false });
    expect(f.port.get()).toEqual(f.disk().companion); expect(f.save).toHaveBeenCalledTimes(1);
  });
  it("Disable queued during candidate persistence wins and preserves the latest committed connection", async () => {
    const f = await fixture(); let release!: () => void; const persist = f.save.getMockImplementation()!;
    f.save.mockImplementationOnce(async (value) => { await new Promise<void>((resolve) => { release = resolve; }); await persist(value); });
    const pending = f.controller.connect(f.draft);
    await vi.waitFor(() => expect(f.save).toHaveBeenCalledTimes(1));
    const disable = f.controller.disable(); release();
    expect(await pending).toEqual({ ok: false, reason: "changed" }); expect(await disable).toEqual({ ok: true });
    expect(f.disk().companion).toEqual({ ...f.stored.companion, enabled: false, endpoint: f.draft.endpoint, token: f.draft.token });
    expect(f.port.get()).toEqual(f.disk().companion); expect(f.controller.getSnapshot().state).toBe("disabled");
  });
  it("Connect and the shared plugin review operation reuse one ProposalApplication per settings signature", async () => {
    const f = await fixture(); expect(review.open).not.toHaveBeenCalled(); expect(requestUrl).not.toHaveBeenCalled();
    f.controller.openProposalReview(); f.plugin.openProposalReview();
    expect(review.open).toHaveBeenCalledTimes(2); expect(review.applications[0]).toBe(review.applications[1]);
    f.plugin.settings.companion.token = "new"; f.plugin.notifyCompanionSettingsChanged(); f.plugin.openProposalReview();
    expect(review.applications[2]).not.toBe(review.applications[1]);
  });
});
