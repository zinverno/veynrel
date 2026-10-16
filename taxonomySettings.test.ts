import { describe, expect, it, vi } from "vitest";
import type { App, PluginManifest } from "obsidian";
import type { AIHubSettings } from "./settings";
import type { TagTaxonomyProfile } from "./consolidation/taxonomyProfile";
vi.mock("obsidian", () => ({ Plugin: class { constructor(public app: App, public manifest: PluginManifest) {} },
  Modal: class {}, Notice: class {}, PluginSettingTab: class {}, Component: class {}, TFile: class {}, TFolder: class {}, getLanguage: () => "en" }));
const profile = (name = "Роль"): TagTaxonomyProfile => ({ version: 1, categories: [{ id: "role", name, purpose: "role", multiplicity: "one_primary", interpretation: "global", prefixes: ["role", "тип"], tags: ["Практика"] }] });
async function fixture(value?: unknown) {
  const { default: Plugin } = await vi.importActual<typeof import("./main")>("./main.ts"); const { DEFAULT_SETTINGS } = await import("./settings");
  let disk: Record<string, unknown> = { ...structuredClone(DEFAULT_SETTINGS), companion: { ...DEFAULT_SETTINGS.companion, vaultId: "22222222-2222-4222-8222-222222222222" }, ...(value === undefined ? {} : { tagTaxonomyProfile: value }) };
  const app = { vault: { getMarkdownFiles: vi.fn(), read: vi.fn(), modify: vi.fn() } };
  const plugin = new Plugin(app as unknown as App, {} as PluginManifest);
  plugin.loadData = vi.fn(async () => structuredClone(disk));
  const save = vi.fn(async (value: AIHubSettings) => { disk = JSON.parse(JSON.stringify(value)) as Record<string, unknown>; }); plugin.saveData = save;
  await plugin.loadSettings(); const port = plugin.getTaxonomyProfilePort();
  return { plugin, app, port, save, disk: () => disk, persist: (next = profile(), expected = port.get(), signal = new AbortController().signal) => port.save(next, expected, signal) };
}
describe("taxonomy uses the existing serialized settings owner", () => {
  it.each([undefined, { version: 99, categories: [] }, { version: 1, categories: "corrupt" }, { ...profile(), notes: "must not persist" }])("loads old/invalid profiles without new writes or work", async value => {
    const f = await fixture(value); expect(f.port.get()).toBeNull(); expect(f.plugin.settings.tagTaxonomyProfile).toBeUndefined();
    expect(f.save).not.toHaveBeenCalled(); expect(f.app.vault.getMarkdownFiles).not.toHaveBeenCalled(); expect(f.app.vault.read).not.toHaveBeenCalled();
  });
  it("saves only confirmed rules, preserves other settings and reloads isolated copies", async () => {
    const f = await fixture(), before = structuredClone(f.disk()), next = profile();
    await f.persist(next); next.categories[0].name = "external mutation";
    expect(f.disk()).toEqual({ ...before, tagTaxonomyProfile: profile() });
    expect(f.app.vault.modify).not.toHaveBeenCalled(); await f.plugin.loadSettings(); expect(f.port.get()).toEqual(profile());
    f.port.get()!.categories[0].tags.push("mutated"); expect(f.port.get()).toEqual(profile());
  });
  it("rejects stale editors and invalid profiles instead of replacing newer rules", async () => {
    const f = await fixture(); const a = f.persist(profile("First"), null), b = f.persist(profile("Second"), null);
    await a; await expect(b).rejects.toMatchObject({ reason: "conflict" }); expect(f.port.get()).toEqual(profile("First"));
    await expect(f.persist({ ...profile(), version: 2 } as unknown as TagTaxonomyProfile)).rejects.toMatchObject({ reason: "invalid" });
    expect(f.save).toHaveBeenCalledTimes(1);
  });
  it("serializes concurrent taxonomy, Advanced, Health and model settings changes without lost updates", async () => {
    const f = await fixture(); let release!: () => void; const persist = f.save.getMockImplementation()!;
    f.save.mockImplementationOnce(async value => { await new Promise<void>(resolve => { release = resolve; }); await persist(value); });
    const taxonomy = f.persist(); await vi.waitFor(() => expect(f.save).toHaveBeenCalledOnce());
    expect(f.port.get()).toBeNull(); f.plugin.settings.notifyOnCopy = false;
    const ordinary = f.plugin.saveSettings(), health = f.plugin.saveSettings({ ...f.plugin.settings.health, profile: "research" });
    const lm = f.plugin.getLanguageModelSettingsPort(); const model = lm.update({ ...lm.get(), model: "new-model" });
    release(); await Promise.all([taxonomy, ordinary, health, model]);
    expect(f.disk()).toMatchObject({ tagTaxonomyProfile: profile(), notifyOnCopy: false, health: { profile: "research" }, model: "new-model" });
  });
  it("keeps the confirmed profile on save failure and permits retry after a fresh confirmation", async () => {
    const f = await fixture(profile()); f.save.mockRejectedValueOnce(new Error("PRIVATE_DISK_ERROR"));
    await expect(f.persist(profile("changed"))).rejects.toMatchObject({ reason: "save" });
    expect(f.port.get()).toEqual(profile()); expect(f.disk().tagTaxonomyProfile).toEqual(profile());
    await f.persist(profile("changed")); expect(f.port.get()).toEqual(profile("changed"));
  });
  it("does not write a queued profile after cancellation", async () => {
    const f = await fixture(); let release!: () => void; const persist = f.save.getMockImplementation()!;
    f.save.mockImplementationOnce(async value => { await new Promise<void>(resolve => { release = resolve; }); await persist(value); });
    const first = f.plugin.saveSettings(); await vi.waitFor(() => expect(f.save).toHaveBeenCalledOnce());
    const abort = new AbortController(); const queued = f.persist(profile(), null, abort.signal); abort.abort(); release();
    await first; await expect(queued).rejects.toMatchObject({ reason: "cancelled" }); expect(f.save).toHaveBeenCalledOnce(); expect(f.port.get()).toBeNull();
  });
});
