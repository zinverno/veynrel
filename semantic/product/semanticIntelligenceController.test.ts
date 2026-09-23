import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestUrlParam, RequestUrlResponse } from "obsidian";
import { DEFAULT_EMBEDDING_SETTINGS, EMBEDDING_PROVIDER_PROFILES } from "../../embeddings/types";
import type { EmbeddingSettings } from "../../embeddings/types";
import type { SemanticStatus } from "../types";
import { SemanticIntelligenceController } from "./semanticIntelligenceController";

const request = vi.hoisted(() => vi.fn<(request: RequestUrlParam) => Promise<RequestUrlResponse>>());
vi.mock("obsidian", () => ({ requestUrl: request, getLanguage: () => "en" }));

function fixture(initial: Partial<EmbeddingSettings> = {}) {
  let effective = { ...DEFAULT_EMBEDDING_SETTINGS, ...initial };
  let status: SemanticStatus = { kind: "not-initialized", vectorCount: 0, dimensions: 0,
    vectorGeneration: 0, providerLabel: "OpenRouter", model: effective.embeddingModel };
  const settings = { get: () => ({ ...effective }), update: vi.fn(async (next: EmbeddingSettings) => {
    effective = { ...next }; return { ...effective };
  }) };
  const engine = { getSemanticStatus: vi.fn(() => ({ ...status })),
    refreshSemanticStatus: vi.fn(async () => ({ ...status })), indexVault: vi.fn(async () => undefined),
    rebuildIndex: vi.fn(async () => undefined), openSearch: vi.fn() };
  const controller = new SemanticIntelligenceController(settings, engine);
  return { controller, engine, settings, setStatus: (next: Partial<SemanticStatus>) => { status = { ...status, ...next }; } };
}

beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("window", { setTimeout, clearTimeout });
  request.mockImplementation(async (input) => {
    const isLocal = typeof input === "object" && input.url.includes("11434");
    return { status: 200, text: JSON.stringify(isLocal ? { embeddings: [[1, 0, 0]] } : { data: [{ embedding: [1, 0, 0] }] }) } as never;
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("Semantic Intelligence product adapter", () => {
  it.each([false, true])("reads cached status and drafts without provider traffic or persistence (enabled %s)", (enabled) => {
    const f = fixture({ enabled });
    for (const mode of ["local", "cloud", "custom"] as const) {
      const draft = f.controller.createDraft(mode); draft.model = "edited"; draft.apiKey = "synthetic-draft";
      f.controller.getSnapshot();
    }
    expect(request).not.toHaveBeenCalled(); expect(f.settings.update.mock.calls.length).toBe(0);
    expect(f.engine.refreshSemanticStatus).not.toHaveBeenCalled(); expect(f.engine.indexVault).not.toHaveBeenCalled();
    expect(f.engine.rebuildIndex).not.toHaveBeenCalled();
  });

  it.each(["local", "cloud", "custom"] as const)("Connect %s tests the fixed phrase, then commits, then inspects; never indexes", async (mode) => {
    const f = fixture(); const draft = f.controller.createDraft(mode); draft.apiKey = "synthetic-embedding";
    if (mode === "custom") { draft.baseUrl = "https://embeddings.example/v1"; draft.model = "custom-model"; }
    const result = await f.controller.connect(draft);
    expect(result).toEqual({ ok: true, dimensions: 3 });
    expect(f.settings.update).toHaveBeenCalledTimes(1); expect(f.engine.refreshSemanticStatus).toHaveBeenCalledTimes(1);
    expect(request.mock.invocationCallOrder[0]).toBeLessThan(f.settings.update.mock.invocationCallOrder[0]);
    expect(f.settings.update.mock.invocationCallOrder[0]).toBeLessThan(f.engine.refreshSemanticStatus.mock.invocationCallOrder[0]);
    const candidate = f.settings.get(); const profile = EMBEDDING_PROVIDER_PROFILES[candidate.embeddingProvider];
    expect(candidate.embeddingProvider).toBe(mode === "local" ? "ollama" : mode === "cloud" ? "openrouter" : "openai-compatible");
    expect(candidate.embeddingModel).toBe(mode === "custom" ? draft.model : profile.defaultModel);
    expect(candidate.embeddingBaseUrl).toBe(mode === "custom" ? draft.baseUrl : profile.defaultBaseUrl);
    const input = request.mock.calls[0][0];
    expect(typeof input).toBe("object");
    if (typeof input === "string") throw new Error("Expected a structured request");
    expect((JSON.parse(input.body as string) as { input: string[] }).input).toEqual(["Vault Audit AI embedding test"]);
    expect(f.engine.indexVault).not.toHaveBeenCalled(); expect(f.engine.rebuildIndex).not.toHaveBeenCalled();
    expect(f.controller.getSnapshot().state).toBe("configured");
    expect(JSON.stringify(f.controller.getSnapshot()).includes(draft.apiKey)).toBe(false);
  });

  it.each(["local", "cloud", "custom"] as const)("failed %s test retains effective settings and returns no raw error", async (mode) => {
    const f = fixture({ enabled: true }); const previous = JSON.stringify(f.settings.get());
    const draft = f.controller.createDraft(mode); draft.apiKey = "synthetic-embedding";
    request.mockRejectedValueOnce(new Error("synthetic-private-response"));
    expect(await f.controller.connect(draft)).toEqual({ ok: false, reason: "connection" });
    expect(JSON.stringify(f.settings.get()) === previous).toBe(true);
    expect(f.settings.update.mock.calls.length).toBe(0); expect(f.engine.refreshSemanticStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["ftp://example.test", "model", "", false], ["not-a-url", "model", "", false],
    ["https://example.test?key=anything", "model", "", false], ["http://localhost:1234/v1", "", "", false],
    ["https://api.openai.com/v1", "model", "", false], ["https://api.openai.com/v1", "model", "synthetic", true],
    ["http://localhost:1234/v1", "model", "", true],
  ])("Custom uses existing validation (%s, model/key rules)", async (baseUrl, model, apiKey, valid) => {
    const f = fixture(); const result = await f.controller.connect({ mode: "custom", baseUrl, model, apiKey });
    expect(result.ok).toBe(valid); expect(request).toHaveBeenCalledTimes(valid ? 1 : 0);
    expect(f.settings.update).toHaveBeenCalledTimes(valid ? 1 : 0);
  });

  it("requires a separate Cloud embedding key and retains the other provider's key", async () => {
    const f = fixture({ openAICompatibleApiKey: "synthetic-custom" }); const draft = f.controller.createDraft("cloud");
    expect(await f.controller.connect(draft)).toEqual({ ok: false, reason: "invalid" });
    draft.apiKey = "synthetic-cloud"; await f.controller.connect(draft);
    expect(f.settings.get().openRouterApiKey === draft.apiKey).toBe(true);
    expect(f.settings.get().openAICompatibleApiKey === "synthetic-custom").toBe(true);
  });

  it("copies drafts and uses current custom values without enabling a disabled configuration", () => {
    const f = fixture({ embeddingProvider: "openai-compatible", embeddingBaseUrl: "http://localhost:1234/v1", embeddingModel: "retained" });
    const draft = f.controller.createDraft("custom"); expect(draft.model).toBe("retained");
    draft.model = "edited"; expect(f.controller.createDraft("custom").model).toBe("retained");
    expect(f.controller.getSnapshot().state).toBe("disabled");
  });

  it("successful test with failed persistence leaves the engine unnotified and settings unchanged", async () => {
    const f = fixture(); const before = JSON.stringify(f.settings.get());
    f.settings.update.mockRejectedValueOnce(new Error("synthetic-private-save-error"));
    expect(await f.controller.connect(f.controller.createDraft("local"))).toEqual({ ok: false, reason: "save" });
    expect(JSON.stringify(f.settings.get()) === before).toBe(true);
    expect(f.engine.refreshSemanticStatus).not.toHaveBeenCalled();
  });

  it("allows only one operation and notifies subscribers at start and completion", async () => {
    const f = fixture(); let release!: () => void;
    const response = request.getMockImplementation()!;
    request.mockImplementationOnce(async (input) => { await new Promise<void>((resolve) => { release = resolve; }); return response(input); });
    const listener = vi.fn(); const unsubscribe = f.controller.subscribe(listener);
    const draft = f.controller.createDraft("local"); const pending = f.controller.connect(draft);
    draft.model = "changed-after-click";
    expect(f.controller.getSnapshot().busy).toBe(true);
    expect(await f.controller.connect(draft)).toEqual({ ok: false, reason: "busy" });
    await f.controller.checkCurrentSetup(); await f.controller.buildIndex(); await f.controller.rebuildIndex();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1)); release(); await pending;
    expect(f.settings.get().embeddingModel).toBe(EMBEDDING_PROVIDER_PROFILES.ollama.defaultModel);
    expect(f.engine.refreshSemanticStatus).toHaveBeenCalledTimes(1); expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe(); await f.controller.checkCurrentSetup(); expect(listener).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["disabled", 0, "configured"], ["not-initialized", 0, "configured"], ["initializing", 0, "busy"],
    ["indexing", 5, "busy"], ["ready", 0, "configured"], ["ready", 5, "ready"],
    ["incompatible", 5, "incompatible"], ["error", 0, "error"],
  ] as const)("maps %s/%s conservatively to %s", (kind, vectorCount, state) => {
    const f = fixture({ enabled: true }); f.setStatus({ kind, vectorCount });
    expect(f.controller.getSnapshot().state).toBe(state);
  });

  it("checks, builds, rebuilds and searches exclusively through the existing engine", async () => {
    const f = fixture({ enabled: true });
    await f.controller.checkCurrentSetup(); expect(f.engine.refreshSemanticStatus).toHaveBeenCalledTimes(1);
    await f.controller.buildIndex(); expect(f.engine.indexVault).toHaveBeenCalledTimes(1);
    f.setStatus({ kind: "incompatible" }); f.controller.getSnapshot();
    expect(f.engine.rebuildIndex).not.toHaveBeenCalled(); await f.controller.rebuildIndex();
    expect(f.engine.rebuildIndex).toHaveBeenCalledTimes(1);
    f.controller.openSearch(); expect(f.engine.openSearch).not.toHaveBeenCalled();
    f.setStatus({ kind: "ready", vectorCount: 10 }); f.controller.openSearch();
    expect(f.engine.openSearch).toHaveBeenCalledTimes(1);
  });
});
