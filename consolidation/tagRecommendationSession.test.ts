import { afterEach, describe, expect, it, vi } from "vitest";
import type { TFile } from "obsidian";
vi.mock("obsidian", () => ({ getLanguage: () => "en", requestUrl: vi.fn(), TFile: class {} }));
import { requestUrl } from "obsidian";
import { callOpenRouter } from "../api";
import cases from "../tests/fixtures/tag-recommendations.json";
import { TagRecommendationSession } from "./tagRecommendationSession";
import { TAG_OPTIONS, TagRecommendationError } from "./tagRecommendationContract";
import type { TagTaxonomyProfile } from "./taxonomyProfile";
import type { TaxonomyInventory } from "./taxonomyScan";
import type { SavedNote } from "./savedNote";
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function fixture(name = "theory_with_small_example") {
  const item = structuredClone(cases.find(c => c.name === name)!);
  let note: SavedNote = { path: "folder/Same.md", file: {} as TFile, content: item.content, modified: 1, bytes: item.content.length };
  let profile = item.profile as TagTaxonomyProfile | null;
  let inventory: TaxonomyInventory | undefined = { state: "complete", total: 4, eligible: 3, excluded: 1, processed: 3, unavailable: 0, empty: 0, tags: item.tags.map(tag => ({ tag, notes: 1 })) };
  const settings = { provider: "custom" as const, model: "test-model", apiKey: "secret-test-key", baseUrl: "https://example.test/v1", temperature: 0.3, topK: 10 };
  const listeners = new Set<() => void>(), profileListeners = new Set<() => void>();
  const deps = {
    settings: { get: () => ({ ...settings }), subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; } },
    profile: { get: () => structuredClone(profile), subscribe: (fn: () => void) => { profileListeners.add(fn); return () => { profileListeners.delete(fn); }; } },
    inventory: () => inventory,
    read: vi.fn(async (_path: string) => note),
    complete: vi.fn(async (_settings: typeof settings, _system: string, _user: string, _signal: AbortSignal) => JSON.stringify(item.response)),
  };
  const session = new TagRecommendationSession(deps);
  return { session, deps, settings, item, listeners, profileListeners,
    change: () => { note = { ...note, content: note.content + " changed", modified: 2 }; },
    content: (content: string) => { note = { ...note, content }; },
    profile: (next: TagTaxonomyProfile | null) => { profile = next; },
    inventory: (next: TaxonomyInventory | undefined) => { inventory = next; } };
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("tag consent, freshness and one-request lifecycle", () => {
  it("does no IO on construction or exact-path selection; consent exposes all data without API key", async () => {
    const f = fixture(); f.session.select("folder/Same.md"); await f.session.confirm();
    expect(f.deps.read).not.toHaveBeenCalled(); expect(f.deps.complete).not.toHaveBeenCalled();
    await f.session.prepare(); expect(f.deps.complete).not.toHaveBeenCalled();
    expect(f.deps.read).toHaveBeenCalledWith("folder/Same.md"); const consent = f.session.view.consent!;
    expect(consent).toMatchObject({ path: "folder/Same.md", endpoint: "https://example.test/v1/chat/completions", model: "test-model", tags: 3, excluded: 1 });
    const body = JSON.parse(consent.body) as { messages: { content: string }[] };
    expect(JSON.parse(body.messages[1].content)).toEqual({ source: f.item.content, confirmedProfile: f.item.profile, observedTags: f.item.tags });
    expect(JSON.stringify(f.session.view)).not.toContain("secret-test-key"); expect(consent.bytes).toBe(new TextEncoder().encode(consent.body).byteLength);
    await f.session.confirm(); expect(f.deps.complete).toHaveBeenCalledOnce(); expect(f.deps.read).toHaveBeenCalledTimes(3);
    expect(f.session.view.stage).toBe("result"); await f.session.confirm(); expect(f.deps.complete).toHaveBeenCalledOnce();
  });
  it.each(cases)("supports fake scenario $name", async item => {
    const f = fixture(item.name); await f.session.prepare(); await f.session.confirm(); expect(f.session.view.result).toEqual(item.response);
  });
  it("uses the existing transport and sends exactly the displayed body once", async () => {
    const f = fixture(); vi.stubGlobal("window", { setTimeout, clearTimeout });
    vi.mocked(requestUrl).mockResolvedValue({ status: 200, text: JSON.stringify({ choices: [{ message: { content: JSON.stringify(f.item.response) } }] }) } as never);
    f.deps.complete.mockImplementation((settings, system, user, signal) => callOpenRouter(settings, system, user, { ...TAG_OPTIONS, signal }));
    await f.session.prepare(); const body = f.session.view.consent!.body; expect(requestUrl).not.toHaveBeenCalled();
    await f.session.confirm(); expect(requestUrl).toHaveBeenCalledOnce(); expect(vi.mocked(requestUrl).mock.calls[0][0]).toMatchObject({ body });
  });
  it.each(["missing", "stale", "cancelled", "limited", "unavailable", "partial"])("blocks %s inventory, with no reads or requests", async mode => {
    const f = fixture(), inventory = f.deps.inventory()!;
    if (mode === "missing") f.inventory(undefined);
    else if (["stale", "cancelled", "limited"].includes(mode)) inventory.state = mode as TaxonomyInventory["state"];
    else if (mode === "unavailable") inventory.unavailable = 1;
    else inventory.processed--;
    await f.session.prepare(); expect(f.session.view.error).toBe("inventory"); expect(f.deps.read).not.toHaveBeenCalled(); expect(f.deps.complete).not.toHaveBeenCalled();
  });
  it("requires a confirmed profile and bounded complete inputs", async () => {
    const f = fixture(); f.profile(null); await f.session.prepare(); expect(f.session.view.error).toBe("profile");
    const g = fixture(); g.content("x".repeat(20001)); await g.session.prepare(); expect(g.session.view.error).toBe("tooLarge");
    const h = fixture(); h.deps.inventory()!.tags = Array.from({ length: 501 }, (_, i) => ({ tag: `topic/t${i}`, notes: 1 }));
    await h.session.prepare(); expect(h.session.view.error).toBe("tooLarge"); expect(h.deps.read).not.toHaveBeenCalled();
    const i = fixture(); i.content("\0".repeat(20000)); i.deps.inventory()!.tags = Array.from({ length: 500 }, (_, n) => ({ tag: `topic/${n}${"a".repeat(400)}`, notes: 1 }));
    await i.session.prepare(); expect(i.session.view.error).toBe("tooLarge");
    for (const sample of [f,g,h,i]) expect(sample.deps.complete).not.toHaveBeenCalled();
  });
  it.each(["before", "during"])("rejects source mutation %s send, even without events", async when => {
    const f = fixture(); await f.session.prepare();
    if (when === "before") f.change(); else f.deps.complete.mockImplementation(async () => { f.change(); return JSON.stringify(f.item.response); });
    await f.session.confirm(); expect(f.session.view.stage).toBe("stale"); expect(f.deps.complete).toHaveBeenCalledTimes(when === "before" ? 0 : 1);
  });
  it.each(["settings", "profile", "inventory"])("invalidates %s before/during/after send", async target => {
    for (const when of ["before", "during", "after"]) {
      const f = fixture();
      const change = () => {
        if (target === "settings") f.settings.model = "different";
        if (target === "profile") f.profile({ ...f.item.profile, categories: [] } as TagTaxonomyProfile);
        if (target === "inventory") f.inventory({ ...f.deps.inventory()!, state: "stale" });
      };
      await f.session.prepare();
      if (when === "before") change();
      if (when === "during") f.deps.complete.mockImplementation(async () => { change(); return JSON.stringify(f.item.response); });
      await f.session.confirm();
      if (when === "after") { change(); if (target === "inventory") f.session.invalidate(); else for (const fn of [...f.listeners, ...f.profileListeners]) fn(); }
      expect(f.session.view.stage).toBe("stale"); expect(f.session.view.result).toBeUndefined(); expect(f.deps.complete).toHaveBeenCalledTimes(when === "before" ? 0 : 1);
    }
  });
  it.each(["cancel", "close", "invalidate"] as const)("%s aborts waiting and hides late output; double-click sends once", async action => {
    const f = fixture(), response = deferred<string>(); f.deps.complete.mockReturnValue(response.promise);
    await f.session.prepare(); const run = f.session.confirm(); await Promise.resolve(); await f.session.confirm();
    expect(f.deps.complete).toHaveBeenCalledOnce(); f.session[action](); const changed = vi.fn(); f.session.onChange = changed;
    expect(f.deps.complete.mock.calls[0][3].aborted).toBe(true); response.resolve(JSON.stringify(f.item.response)); await run;
    expect(f.session.view.result).toBeUndefined(); expect(changed).not.toHaveBeenCalled(); expect(f.session.hasDispatched).toBe(true);
    if (action === "close") { expect(f.listeners.size + f.profileListeners.size).toBe(0); await f.session.prepare(); expect(changed).not.toHaveBeenCalled(); }
  });
  it("cancels preparation and never reuses consent after selection or dismissal", async () => {
    const f = fixture(), read = deferred<SavedNote>(); const original = await f.deps.read(""); f.deps.read.mockClear(); f.deps.read.mockReturnValueOnce(read.promise);
    const run = f.session.prepare(); await f.session.prepare(); expect(f.deps.read).toHaveBeenCalledOnce();
    f.session.cancel(); read.resolve(original); await run; await f.session.confirm(); expect(f.deps.complete).not.toHaveBeenCalled();
    await f.session.prepare(); f.session.select("other/Same.md"); await f.session.confirm(); expect(f.deps.complete).not.toHaveBeenCalled();
    await f.session.prepare(); await f.session.confirm(); f.session.dismiss(); await f.session.confirm(); expect(f.deps.complete).toHaveBeenCalledOnce();
    await f.session.prepare(); expect(f.session.view.stage).toBe("consent"); expect(f.deps.complete).toHaveBeenCalledOnce();
  });
  it.each(["prepare", "before", "after"])("withholds results if the source disappears at %s", async when => {
    const f = fixture(); if (when !== "prepare") await f.session.prepare();
    if (when === "after") f.deps.complete.mockImplementation(async () => { f.deps.read.mockRejectedValueOnce(new TagRecommendationError("source")); return JSON.stringify(f.item.response); });
    else f.deps.read.mockRejectedValueOnce(new TagRecommendationError("source"));
    if (when === "prepare") await f.session.prepare(); else await f.session.confirm();
    expect(f.session.view.error).toBe("source"); expect(f.deps.complete).toHaveBeenCalledTimes(when === "after" ? 1 : 0);
  });
  it("never retries transport failures or exposes raw provider data", async () => {
    const f = fixture(); await f.session.prepare(); f.deps.complete.mockRejectedValue(Error("secret response"));
    await f.session.confirm(); await f.session.confirm(); expect(f.deps.complete).toHaveBeenCalledOnce(); expect(f.session.view).toEqual({ stage: "error", error: "transport" });
    await f.session.prepare(); f.deps.complete.mockResolvedValue("invalid JSON"); await f.session.confirm(); expect(f.session.view.error).toBe("invalidResponse");
  });
  it.each(["https://secret:password@example.test/v1", "https://example.test/v1?key=secret", "file:///private"])("refuses unsafe destination %s", async baseUrl => {
    const f = fixture(); f.settings.baseUrl = baseUrl; await f.session.prepare(); expect(f.session.view.error).toBe("configuration"); expect(f.deps.read).not.toHaveBeenCalled();
  });
  it("unrelated settings notifications do not invalidate a result", async () => {
    const f = fixture(); await f.session.prepare(); await f.session.confirm(); for (const fn of [...f.listeners, ...f.profileListeners]) fn();
    expect(f.session.view.stage).toBe("result");
  });
});
