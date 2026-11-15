import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
vi.mock("obsidian", () => ({ TFile: class { path = ""; stat = { ctime: 1, mtime: 1, size: 1 }; } }));
import { TFile } from "obsidian";
import { OrganizationRegistry } from "./organizationRegistry";
import { organizationDocument, organizationPreferences } from "./organizationProfile";
import type { OrganizationPreferences } from "./organizationProfile";
const signal = () => new AbortController().signal;
function fixture() {
  let preferences = organizationPreferences(); const listeners = new Set<(file: TFile) => void>();
  const files = new Map<string, TFile>(), contents = new Map<TFile, string>();
  const add = (path: string, content = organizationDocument(null)) => { const f = new TFile(); f.path = path; f.stat.size = content.length; files.set(path, f); contents.set(f, content); return f; };
  const file = add("Rules.md");
  const app = { vault: { configDir: ".obsidian", getFileByPath: (path: string) => files.get(path), getAbstractFileByPath: (path: string) => files.get(path),
    on: (_event: string, listener: (file: TFile) => void) => { listeners.add(listener); return listener; }, offref: (listener: (file: TFile) => void) => listeners.delete(listener),
    read: vi.fn(async (f: TFile) => contents.get(f)!), create: vi.fn(async (path: string, content: string) => { if (files.has(path)) throw Error("exists"); return add(path, content); }), modify: vi.fn() } };
  const legacy = { version: 1 as const, categories: [] };
  const save = vi.fn(async (next: OrganizationPreferences, expected: OrganizationPreferences) => { if (JSON.stringify(expected) !== JSON.stringify(preferences)) throw Error("conflict"); preferences = next; });
  const changed = vi.fn(), registry = new OrganizationRegistry(app as unknown as App, { get: () => structuredClone(preferences), save }, () => legacy, changed);
  return { registry, app, save, file, files, contents, listeners, legacy, changed, preferences: () => preferences, setPreferences: (p: OrganizationPreferences) => { preferences = p; } };
}
describe("one active registry source, explicit previews and fail-closed persistence", () => {
  it("does no work on construction or passive getters; selected unloaded file never falls back", () => {
    const f = fixture(); expect(f.registry.profile).toEqual(f.legacy); f.setPreferences({ ...organizationPreferences(), registryPath: "Rules.md" });
    expect(f.registry.profile).toBeNull(); expect(f.app.vault.read).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled(); expect(f.listeners.size).toBe(0);
  });
  it("reads existing definitions, requires explicit confirmation, never rewrites the file, disconnects without copying", async () => {
    const f = fixture(), before = f.contents.get(f.file), review = await f.registry.prepare("connect", "Rules.md");
    expect(f.preferences().registryPath).toBeNull(); expect(f.save).not.toHaveBeenCalled();
    await f.registry.confirm(review, signal()); expect(f.registry.state).toBe("ready"); expect(f.registry.profile).toEqual({ version: 1, categories: [] });
    await f.registry.confirm(await f.registry.prepare("disconnect", ""), signal());
    expect(f.registry.profile).toEqual(f.legacy); expect(f.contents.get(f.file)).toBe(before); expect(f.app.vault.modify).not.toHaveBeenCalled();
    f.registry.dispose(); expect(f.listeners.size).toBe(0);
  });
  it.each(["missing", "invalid", "unsupported"])("E: %s registry is distinctly reported", async reason => {
    const f = fixture(); if (reason === "missing") f.files.clear();
    if (reason === "invalid") f.contents.set(f.file, "broken");
    if (reason === "unsupported") f.contents.set(f.file, organizationDocument(null).replace('"version": 1', '"version": 2'));
    await expect(f.registry.prepare("connect", "Rules.md")).rejects.toMatchObject({ reason }); expect(f.registry.state).toBe(reason); expect(f.save).not.toHaveBeenCalled();
  });
  it("E: concurrent file changes, even with identical stat, invalidate preview; no overwrite", async () => {
    const f = fixture(), review = await f.registry.prepare("connect", "Rules.md");
    f.contents.set(f.file, f.contents.get(f.file)!.replace("# Organization", "# Different"));
    await expect(f.registry.confirm(review, signal())).rejects.toMatchObject({ reason: "changed" }); expect(f.save).not.toHaveBeenCalled(); expect(f.app.vault.modify).not.toHaveBeenCalled();
  });
  it("loaded file events invalidate rules and notify consumers without reading or sending", async () => {
    const f = fixture(); await f.registry.confirm(await f.registry.prepare("connect", "Rules.md"), signal());
    f.app.vault.read.mockClear(); f.changed.mockClear(); f.listeners.forEach(listener => listener(f.file));
    expect(f.registry.profile).toBeNull(); expect(f.registry.state).toBe("changed"); expect(f.changed).toHaveBeenCalled(); expect(f.app.vault.read).not.toHaveBeenCalled();
  });
  it("creation is previewed, create-only, byte-preserving and does not silently connect", async () => {
    const f = fixture(), text = organizationDocument(null), review = await f.registry.prepare("create", "New.md", text);
    expect(f.app.vault.create).not.toHaveBeenCalled(); await f.registry.confirm(review, signal());
    expect(f.app.vault.create).toHaveBeenCalledExactlyOnceWith("New.md", text); expect(f.preferences().registryPath).toBeNull();
    expect(f.registry.state).toBe("created"); expect(f.save).not.toHaveBeenCalled();
    await expect(f.registry.prepare("create", "Rules.md", text)).rejects.toMatchObject({ reason: "conflict" });
  });
  it("refuses create collisions between preview/confirm, removed service markers and unsafe paths", async () => {
    const f = fixture(), text = organizationDocument(null), review = await f.registry.prepare("create", "New.md", text);
    f.files.set("New.md", f.file); await expect(f.registry.confirm(review, signal())).rejects.toMatchObject({ reason: "conflict" });
    await expect(f.registry.prepare("create", "Other.md", text.slice(text.indexOf("# Organization")))).rejects.toMatchObject({ reason: "invalid" });
    for (const path of ["../outside.md", "/outside.md", ".obsidian/rules.md"]) await expect(f.registry.prepare("connect", path)).rejects.toMatchObject({ reason: "invalid" });
    expect(f.app.vault.create).not.toHaveBeenCalled();
  });
  it("cancellation and another settings/profile edit reject a stale confirmation", async () => {
    const f = fixture(), review = await f.registry.prepare("connect", "Rules.md"), abort = new AbortController(); abort.abort();
    await expect(f.registry.confirm(review, abort.signal)).rejects.toMatchObject({ reason: "cancelled" });
    f.setPreferences({ ...organizationPreferences(), dismissed: ["org:abc"] });
    await expect(f.registry.confirm(review, signal())).rejects.toMatchObject({ reason: "conflict" }); expect(f.save).not.toHaveBeenCalled();
  });
  it("save failure preserves legacy profile and surfaces an error", async () => {
    const f = fixture(); f.save.mockRejectedValueOnce(Error("private disk detail"));
    await expect(f.registry.confirm(await f.registry.prepare("connect", "Rules.md"), signal())).rejects.toMatchObject({ reason: "save" });
    expect(f.registry.profile).toEqual(f.legacy); expect(f.registry.state).toBe("save");
  });
});
