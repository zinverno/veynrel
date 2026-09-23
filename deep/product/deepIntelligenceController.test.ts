import { describe, expect, it, vi } from "vitest";
import { DeepIntelligenceController } from "./deepIntelligenceController";
import type { LanguageModelSettingsSnapshot } from "./languageModelSettingsPort";
import { sameLanguageModelConnection } from "./languageModelSettingsPort";
import { PROVIDER_PROFILES } from "../../constants";
import type { DeepProvider } from "../../health/deepIntelligencePort";

vi.mock("obsidian", () => ({ getLanguage: () => "en", requestUrl: vi.fn() }));

function fixture(overrides: Partial<LanguageModelSettingsSnapshot> = {}) {
  let current: LanguageModelSettingsSnapshot = { provider: "openrouter", model: "existing-model", baseUrl: "https://llm.example/v1",
    apiKey: "synthetic-private-key", temperature: 0.42, topK: 7, ...overrides };
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };
  const settings = {
    get: () => ({ ...current }),
    update: vi.fn(async (next: LanguageModelSettingsSnapshot, expected?: LanguageModelSettingsSnapshot) => {
      if (expected && !sameLanguageModelConnection(current, expected)) throw new Error("obsolete");
      current = { ...next }; emit(); return { ...current };
    }),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  const connection = { test: vi.fn(async (_settings: LanguageModelSettingsSnapshot) => {}) };
  const controller = new DeepIntelligenceController(settings, connection);
  return { controller, settings, connection, listeners, change: (patch: Partial<LanguageModelSettingsSnapshot>) => { current = { ...current, ...patch }; emit(); } };
}

describe("Deep Intelligence explicit connection lifecycle", () => {
  it("consumes legacy settings without I/O or leaking keys; Ready is lifetime-only", async () => {
    const f = fixture();
    expect(f.controller.getSnapshot().state).toBe("configured");
    expect(f.connection.test).not.toHaveBeenCalled(); expect(f.settings.update).not.toHaveBeenCalled();
    expect(JSON.stringify(f.controller.getSnapshot()).includes(f.settings.get().apiKey)).toBe(false);
    await f.controller.checkCurrentSetup(); expect(f.controller.getSnapshot().state).toBe("ready");
    expect(new DeepIntelligenceController(f.settings, f.connection).getSnapshot().state).toBe("configured");
    expect(f.settings.update).not.toHaveBeenCalled();
  });
  it.each([{ model: " " }, { baseUrl: "" }, { apiKey: "" }, { provider: "invalid" as DeepProvider }])("leaves invalid legacy configuration untouched: %j", (patch) => {
    const f = fixture(patch); const before = f.settings.get();
    expect(f.controller.getSnapshot().state).toBe("unconfigured"); expect(f.settings.get()).toEqual(before);
    expect(f.settings.update).not.toHaveBeenCalled(); expect(f.connection.test).not.toHaveBeenCalled();
  });
  it.each(["ollama", "openrouter", "openai", "groq", "custom"] as const)("uses %s profiles and preserves same-provider customizations", (provider) => {
    const f = fixture({ provider }); const draft = f.controller.createDraft(provider);
    expect(draft).toEqual({ provider, apiKey: f.settings.get().apiKey, model: "existing-model", baseUrl: "https://llm.example/v1" });
    f.change({ provider: provider === "ollama" ? "openai" : "ollama" });
    expect(f.controller.createDraft(provider)).toEqual({ provider, apiKey: "", model: PROVIDER_PROFILES[provider].defaultModel,
      baseUrl: PROVIDER_PROFILES[provider].defaultBaseUrl });
    expect(f.controller.getProviders().find((item) => item.id === provider)?.requiresApiKey).toBe(PROVIDER_PROFILES[provider].requiresApiKey);
    expect(f.connection.test).not.toHaveBeenCalled();
  });
  it.each(["ollama", "openrouter", "openai", "groq", "custom"] as const)("connects %s through the injected test, keeping tuning", async (provider) => {
    const f = fixture(); const draft = f.controller.createDraft(provider);
    draft.model = "chosen-model"; draft.baseUrl ||= "https://custom.example/v1"; draft.apiKey = "synthetic-candidate";
    expect(await f.controller.connect(draft)).toEqual({ ok: true });
    expect(f.connection.test).toHaveBeenCalledExactlyOnceWith({ ...draft, temperature: 0.42, topK: 7 });
    expect(f.settings.update).toHaveBeenCalledTimes(1); expect(f.controller.getSnapshot().state).toBe("ready");
  });
  it.each(["openrouter", "openai", "groq"] as const)("rejects missing required %s key without I/O", async (provider) => {
    const f = fixture(); const draft = { ...f.controller.createDraft(provider), apiKey: "" };
    expect(await f.controller.connect(draft)).toEqual({ ok: false, reason: "invalid" });
    expect(f.connection.test).not.toHaveBeenCalled(); expect(f.settings.update).not.toHaveBeenCalled();
  });
  it.each(["ollama", "custom"] as const)("accepts optional empty %s key", async (provider) => {
    const f = fixture({ provider, apiKey: "" });
    expect(await f.controller.connect(f.controller.createDraft(provider))).toEqual({ ok: true });
  });
  it("copies before await, serializes operations, and isolates subscribers", async () => {
    const f = fixture(); let release!: () => void;
    f.connection.test.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const states: string[] = []; f.controller.subscribe(() => { throw new Error("detached"); });
    const remove = f.controller.subscribe(() => states.push(f.controller.getSnapshot().state));
    const draft = f.controller.createDraft("openrouter"); draft.model = "tested-model";
    const pending = f.controller.connect(draft); draft.model = "late-typing";
    expect(f.controller.getSnapshot()).toMatchObject({ state: "busy", operation: "connect" });
    expect(await f.controller.connect(draft)).toEqual({ ok: false, reason: "busy" });
    expect(await f.controller.checkCurrentSetup()).toEqual({ ok: false, reason: "busy" });
    expect(f.settings.update).not.toHaveBeenCalled(); release(); expect(await pending).toEqual({ ok: true });
    expect(f.settings.get().model).toBe("tested-model"); expect(states[0]).toBe("busy"); expect(states[states.length - 1]).toBe("ready");
    remove(); const count = states.length; f.change({ model: "advanced" }); expect(states).toHaveLength(count);
    expect(f.controller.getSnapshot().state).toBe("configured"); f.controller.dispose(); expect(f.listeners.size).toBe(0);
  });
  it.each(["provider", "model", "baseUrl", "apiKey"] as const)("invalidates Connected after an Advanced %s change without a request", async (key) => {
    const f = fixture(); await f.controller.checkCurrentSetup();
    f.change({ [key]: key === "provider" ? "groq" : "new-value" });
    expect(f.controller.getSnapshot().state).toBe("configured"); expect(f.connection.test).toHaveBeenCalledTimes(1);
    f.change({ apiKey: "" }); expect(f.controller.getSnapshot().state).toBe("unconfigured");
  });
  it("preserves committed configuration on failed tests and emits safe failures", async () => {
    const f = fixture(); const before = f.settings.get(); const listener = vi.fn(); f.controller.subscribe(listener);
    f.connection.test.mockRejectedValueOnce(new Error(`Authorization: ${before.apiKey}`));
    const result = await f.controller.connect(f.controller.createDraft("openrouter"));
    expect(result).toEqual({ ok: false, reason: "connection" }); expect(f.controller.getSnapshot().state).toBe("error");
    expect(f.settings.get()).toEqual(before); expect(f.settings.update).not.toHaveBeenCalled(); expect(listener).toHaveBeenCalledTimes(2);
    expect(JSON.stringify([result, f.controller.getSnapshot()]).includes(before.apiKey)).toBe(false);
  });
  it("does not associate a failed draft with another committed configuration", async () => {
    const f = fixture(); await f.controller.checkCurrentSetup();
    f.connection.test.mockRejectedValueOnce(new Error("fixture"));
    await f.controller.connect(f.controller.createDraft("ollama")); expect(f.controller.getSnapshot().state).toBe("ready");
  });
  it("failed saves cannot publish Ready; successful retry can", async () => {
    const f = fixture(); const before = f.settings.get(); f.settings.update.mockRejectedValueOnce(new Error("private storage error"));
    expect(await f.controller.connect(f.controller.createDraft("ollama"))).toEqual({ ok: false, reason: "save" });
    expect(f.controller.getSnapshot().state).toBe("configured"); expect(f.settings.get()).toEqual(before);
    expect(await f.controller.connect(f.controller.createDraft("ollama"))).toEqual({ ok: true });
  });
  it.each([true, false])("Check is read-only and ignores obsolete completion (success: %s)", async (success) => {
    const f = fixture(); let finish!: () => void;
    f.connection.test.mockImplementationOnce(() => new Promise<void>((resolve, reject) => { finish = success ? resolve : () => reject(new Error("private")); }));
    const pending = f.controller.checkCurrentSetup(); expect(f.controller.getSnapshot().operation).toBe("check");
    f.change({ model: "advanced-model" }); finish(); await pending;
    expect(f.controller.getSnapshot()).toMatchObject({ state: "configured", model: "advanced-model" });
    expect(f.settings.update).not.toHaveBeenCalled(); expect(f.connection.test).toHaveBeenCalledTimes(1);
  });
  it("never marks a different configuration Ready if it changes as update returns", async () => {
    const f = fixture(); f.settings.update.mockImplementationOnce(async () => {
      f.change({ model: "new-advanced-model" }); return f.settings.get();
    });
    expect(await f.controller.connect(f.controller.createDraft("ollama"))).toEqual({ ok: false, reason: "save" });
    expect(f.controller.getSnapshot()).toMatchObject({ state: "configured", model: "new-advanced-model" });
  });
  it("rejects an already-open draft after another view or Advanced changes the connection", async () => {
    const f = fixture(); const draft = f.controller.createDraft("ollama");
    f.change({ model: "newer-advanced-model" });
    expect(await f.controller.connect(draft)).toEqual({ ok: false, reason: "save" });
    expect(f.connection.test).not.toHaveBeenCalled(); expect(f.settings.update).not.toHaveBeenCalled();
    expect(f.controller.getSnapshot()).toMatchObject({ state: "configured", model: "newer-advanced-model" });
  });
});
