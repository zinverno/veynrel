import { describe, expect, it, vi } from "vitest";
import type { App, PluginManifest, Setting } from "obsidian";
import manifest from "./manifest.json";

vi.mock("obsidian", () => ({
  Plugin: class { constructor(public app: App, public manifest: PluginManifest) {} },
  PluginSettingTab: class {}, Setting: class {}, Notice: class {}, Modal: class {}, Component: class {},
  TFile: class {}, TFolder: class {}, getLanguage: () => "en", setIcon: vi.fn(), requireApiVersion: () => false,
}));

async function fixture(semanticEnabled = false) {
  const { default: AIHubPlugin } = await vi.importActual<typeof import("./main")>("./main.ts");
  const { AIHubSettingTab, DEFAULT_SETTINGS } = await import("./settings");
  const stored = { ...structuredClone(DEFAULT_SETTINGS), model: "saved-model",
    semantic: { ...DEFAULT_SETTINGS.semantic, enabled: semanticEnabled },
    companion: { ...DEFAULT_SETTINGS.companion, vaultId: "22222222-2222-4222-8222-222222222222" } };
  let disk = structuredClone(stored);
  const plugin = new AIHubPlugin({} as App, manifest);
  plugin.loadData = vi.fn(async () => structuredClone(disk));
  const saveData = vi.fn(async (next: typeof stored) => { disk = structuredClone(next); });
  plugin.saveData = saveData;
  await plugin.loadSettings();
  const semanticController = { notifySettingsChanged: vi.fn(), notifyCompanionSettingsChanged: vi.fn() };
  vi.spyOn(plugin, "getSemanticController").mockReturnValue(semanticController as never);
  Object.assign(plugin, { semanticController });
  const tab = new AIHubSettingTab({} as App, plugin);
  const textChange = (key: string) => {
    const row = tab.getSettingDefinitions().flatMap((section) => section.items)
      .find((item) => item.keys.includes(key))!;
    let onChange!: (value: string) => Promise<void>;
    class TextControl {
      inputEl = { setAttribute: vi.fn() };
      setPlaceholder(): TextControl { return this; }
      setValue(): TextControl { return this; }
      onChange(callback: (value: string) => Promise<void>): TextControl { onChange = callback; return this; }
    }
    const text = new TextControl();
    const setting = { nameEl: { createSpan: () => ({}), prepend: vi.fn() },
      addText(callback: (value: TextControl) => unknown) { callback(text); return setting; } };
    row.render!(setting as unknown as Setting);
    return (value: string) => onChange(value);
  };
  const enabledRow = tab.getSettingDefinitions().flatMap((section) => section.items)
    .find((item) => item.keys.includes("semantic.enabled"))!;
  let changeSemanticEnabled!: (value: boolean) => Promise<void>;
  class ToggleControl {
    setValue(): ToggleControl { return this; }
    onChange(callback: (value: boolean) => Promise<void>): ToggleControl { changeSemanticEnabled = callback; return this; }
  }
  const toggle = new ToggleControl();
  const toggleSetting = { nameEl: { createSpan: () => ({}), prepend: vi.fn() },
    addToggle(callback: (value: ToggleControl) => unknown) { callback(toggle); return toggleSetting; } };
  enabledRow.render!(toggleSetting as unknown as Setting);
  return { plugin, saveData, semanticController, disk: () => disk, changeModel: textChange("model"),
    changeSemanticModel: textChange("semantic.embeddingModel"), changeCompanionToken: textChange("companion.token"),
    changeSemanticEnabled };
}

describe("Advanced data.json durability", () => {
  it("keeps the committed model effective when its Advanced save fails", async () => {
    const f = await fixture();
    f.saveData.mockRejectedValueOnce(new Error("synthetic disk failure"));
    await expect(f.changeModel("unsaved-model")).rejects.toThrow("synthetic disk failure");
    expect(f.disk().model).toBe("saved-model");
    expect(f.plugin.settings.model).toBe("saved-model");
  });

  it("does not let a failed Advanced save leak into the next queued Health save", async () => {
    const f = await fixture();
    let reject!: (error: Error) => void;
    f.saveData.mockImplementationOnce(() => new Promise((_resolve, no) => { reject = no; }));
    const failed = f.changeModel("unsaved-model");
    await vi.waitFor(() => expect(f.saveData).toHaveBeenCalledTimes(1));
    const health = f.plugin.saveSettings({ ...f.plugin.settings.health, profile: "research" });
    reject(new Error("synthetic disk failure"));
    await expect(failed).rejects.toThrow("synthetic disk failure");
    await health;
    expect(f.disk().health.profile).toBe("research");
    expect(f.disk().model).toBe("saved-model");
    expect(f.plugin.settings.model).toBe("saved-model");
  });

  it("keeps a newer Advanced edit queued behind a failed save", async () => {
    const f = await fixture();
    let reject!: (error: Error) => void;
    f.saveData.mockImplementationOnce(() => new Promise((_resolve, no) => { reject = no; }));
    const failed = f.changeModel("failed-model");
    await vi.waitFor(() => expect(f.saveData).toHaveBeenCalledTimes(1));
    const newer = f.changeModel("newer-model");
    reject(new Error("synthetic disk failure"));
    await expect(failed).rejects.toThrow("synthetic disk failure");
    await newer;
    expect(f.disk().model).toBe("newer-model");
    expect(f.plugin.settings.model).toBe("newer-model");
  });

  it("keeps a newer same-tick Advanced edit when the earlier queued save fails", async () => {
    const f = await fixture();
    f.saveData.mockRejectedValueOnce(new Error("synthetic disk failure"));
    const failed = f.changeModel("failed-model");
    const newer = f.changeModel("newer-model");
    await expect(failed).rejects.toThrow("synthetic disk failure");
    await newer;
    expect(f.disk().model).toBe("newer-model");
    expect(f.plugin.settings.model).toBe("newer-model");
  });

  it("restores nested Semantic settings and runtime policy on failed Advanced save", async () => {
    const f = await fixture();
    const semantic = f.plugin.settings.semantic;
    const original = semantic.embeddingModel;
    f.saveData.mockRejectedValueOnce(new Error("synthetic disk failure"));
    await expect(f.changeSemanticModel("unsaved-embedding-model")).rejects.toThrow("synthetic disk failure");
    expect(f.plugin.settings.semantic).toBe(semantic);
    expect(semantic.embeddingModel).toBe(original);
    expect(f.disk().semantic.embeddingModel).toBe(original);
    expect(f.semanticController.notifySettingsChanged).toHaveBeenCalledTimes(2);
    expect(f.semanticController.notifySettingsChanged).toHaveBeenLastCalledWith({ reconcile: false });
  });

  it("defers semantic reconciliation until an Advanced enable is durable", async () => {
    const f = await fixture();
    let reject!: (error: Error) => void;
    f.saveData.mockImplementationOnce(() => new Promise((_resolve, no) => { reject = no; }));
    const failed = f.changeSemanticEnabled(true);
    await vi.waitFor(() => expect(f.saveData).toHaveBeenCalledTimes(1));
    expect(f.semanticController.notifySettingsChanged.mock.calls).toEqual([[{ reconcile: false }]]);
    reject(new Error("synthetic disk failure"));
    await expect(failed).rejects.toThrow("synthetic disk failure");
    expect(f.plugin.settings.semantic.enabled).toBe(false);
    expect(f.disk().semantic.enabled).toBe(false);
    expect(f.semanticController.notifySettingsChanged.mock.calls).toEqual([
      [{ reconcile: false }], [{ reconcile: false }],
    ]);

    await f.changeSemanticEnabled(true);
    expect(f.plugin.settings.semantic.enabled).toBe(true);
    expect(f.disk().semantic.enabled).toBe(true);
    expect(f.semanticController.notifySettingsChanged.mock.calls.slice(2)).toEqual([
      [{ reconcile: false }], [],
    ]);
  });

  it("does not reconcile a newer semantic edit while its save is pending", async () => {
    const f = await fixture(true);
    const persist = f.saveData.getMockImplementation()!;
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    f.saveData.mockImplementationOnce(async (next) => {
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      await persist(next);
    });
    f.saveData.mockImplementationOnce(async (next) => {
      await new Promise<void>((resolve) => { releaseSecond = resolve; });
      await persist(next);
    });
    const first = f.changeSemanticModel("first-embedding-model");
    await vi.waitFor(() => expect(f.saveData).toHaveBeenCalledTimes(1));
    const newer = f.changeSemanticModel("newer-embedding-model");
    releaseFirst();
    await first;
    await vi.waitFor(() => expect(f.saveData).toHaveBeenCalledTimes(2));
    const whileNewerPending = [...f.semanticController.notifySettingsChanged.mock.calls];
    releaseSecond();
    await newer;
    expect(whileNewerPending).toEqual([[{ reconcile: false }], [{ reconcile: false }]]);
    expect(f.disk().semantic.embeddingModel).toBe("newer-embedding-model");
  });

  it("restores nested Companion token and invalidates its pre-save runtime signature", async () => {
    const f = await fixture();
    const companion = f.plugin.settings.companion;
    const original = companion.token;
    f.saveData.mockRejectedValueOnce(new Error("synthetic disk failure"));
    await expect(f.changeCompanionToken("synthetic-unsaved-token")).rejects.toThrow("synthetic disk failure");
    expect(f.plugin.settings.companion).toBe(companion);
    expect(companion.token).toBe(original);
    expect(f.disk().companion.token).toBe(original);
    expect(f.semanticController.notifyCompanionSettingsChanged).toHaveBeenCalledTimes(2);
  });
});
