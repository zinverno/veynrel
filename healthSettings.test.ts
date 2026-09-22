import { describe, expect, it, vi } from "vitest";
import type { App, PluginManifest } from "obsidian";
import { HealthPreferencesController, DEFAULT_HEALTH_PREFERENCES } from "./health/preferences";
import type { HealthPreferences } from "./health/preferences";
import manifest from "./manifest.json";

vi.mock("obsidian", () => ({
  Plugin: class { constructor(public app: App, public manifest: PluginManifest) {} },
  Notice: class {}, Modal: class {}, PluginSettingTab: class {}, Component: class {},
  TFile: class {}, TFolder: class {}, getLanguage: () => "en",
}));

async function fixture(health?: unknown) {
  const { default: Plugin } = await vi.importActual<typeof import("./main")>("./main.ts");
  const { DEFAULT_SETTINGS } = await import("./settings");
  // Synthetic sentinels only. Compare equality as a boolean so credentials never enter failure output.
  const stored = { ...structuredClone(DEFAULT_SETTINGS), apiKey: "synthetic-llm", model: "retained-model", health,
    semantic: { ...DEFAULT_SETTINGS.semantic, enabled: true, openRouterApiKey: "synthetic-semantic", openAICompatibleApiKey: "synthetic-compatible" },
    companion: { ...DEFAULT_SETTINGS.companion, token: "synthetic-companion", vaultId: "22222222-2222-4222-8222-222222222222" },
  };
  let disk = structuredClone(stored);
  const plugin = new Plugin({} as App, manifest);
  plugin.loadData = vi.fn(async () => structuredClone(disk));
  const save = vi.fn(async (data: typeof stored) => { disk = structuredClone(data); }); plugin.saveData = save;
  await plugin.loadSettings();
  const preferences = new HealthPreferencesController(() => plugin.settings.health, (next) => plugin.saveSettings(next));
  const unrelated = (settings: typeof stored) => { const { health: _health, ...rest } = settings; return JSON.stringify(rest); };
  return { plugin, preferences, save, stored, disk: () => disk, unrelated };
}

describe("Health settings integration", () => {
  it.each([
    [undefined, DEFAULT_HEALTH_PREFERENCES],
    [{ profile: "research", profileChosen: true, onboardingCompleted: false, onboardingVersion: 1 },
      { profile: "research", profileChosen: true, onboardingCompleted: false, onboardingVersion: 1 }],
    [{ profile: "unknown", profileChosen: "yes", onboardingCompleted: 1 }, DEFAULT_HEALTH_PREFERENCES],
  ])("loads bounded Health defaults without changing existing settings", async (stored, expected) => {
    const f = await fixture(stored);
    expect(f.plugin.settings.health).toEqual(expected);
    expect(f.unrelated(f.plugin.settings) === f.unrelated(f.stored)).toBe(true);
    expect(f.save).not.toHaveBeenCalled();
  });
  it("persists only the Health change, retains all credentials and resumes chosen intent after reload", async () => {
    const f = await fixture();
    await f.preferences.update({ profile: "research", profileChosen: true });
    expect(f.unrelated(f.disk()) === f.unrelated(f.stored)).toBe(true);
    await f.plugin.loadSettings();
    expect(f.preferences.get()).toEqual({ ...DEFAULT_HEALTH_PREFERENCES, profile: "research", profileChosen: true });
    await f.preferences.update({ onboardingCompleted: true }); await f.plugin.loadSettings();
    expect(f.preferences.get().onboardingCompleted).toBe(true);
    expect(f.unrelated(f.disk()) === f.unrelated(f.stored)).toBe(true);
  });
  it("keeps both settings and effective profile unchanged until saveData succeeds, including failures", async () => {
    const f = await fixture(); const previous = f.preferences.get();
    let reject!: (reason: Error) => void;
    f.save.mockImplementationOnce(() => new Promise((_resolve, no) => { reject = no; }));
    const next = f.preferences.update({ profile: "research", profileChosen: true });
    await vi.waitFor(() => expect(f.save).toHaveBeenCalledTimes(1));
    expect(f.plugin.settings.health).toEqual(previous); expect(f.preferences.get()).toEqual(previous);
    const rejection = expect(next).rejects.toThrow("synthetic failure"); reject(new Error("synthetic failure")); await rejection;
    expect(f.plugin.settings.health).toEqual(previous); expect(f.disk().health).toBeUndefined();
    await f.preferences.update({ profile: "work" }); expect(f.preferences.get().profile).toBe("work");
  });
  it("serializes an ordinary settings save behind a pending profile save without losing either change", async () => {
    const f = await fixture(); let release!: () => void;
    const persist = f.save.getMockImplementation()!;
    f.save.mockImplementationOnce(async (data) => { await new Promise<void>((resolve) => { release = resolve; }); await persist(data); });
    const profile = f.preferences.update({ profile: "research" });
    await vi.waitFor(() => expect(f.save).toHaveBeenCalledTimes(1));
    f.plugin.settings.notifyOnCopy = false; const ordinary = f.plugin.saveSettings();
    release(); await Promise.all([profile, ordinary]);
    expect((f.disk().health as HealthPreferences).profile).toBe("research"); expect(f.disk().notifyOnCopy).toBe(false);
  });
});
