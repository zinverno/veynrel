import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ requestUrl: vi.fn(), getLanguage: () => "en" }));
import { ConnectController } from "./product/connectController";
import { CompanionClientError } from "../companionSync/errors";
import type { CompanionConnectionStatus, CompanionSettings } from "../companionSync/types";
import { companionConfigurationSignature } from "./product/companionSettingsPort";
import type { CompanionSettingsUpdate } from "./product/companionSettingsPort";
import { connectViewModel } from "../health/ui/connectViewModel";

function fixture(patch: Partial<CompanionSettings> = {}) {
  let current: CompanionSettings = { enabled: true, endpoint: "http://127.0.0.1:27124", token: "PRIVATE_PLUGIN_TOKEN",
    vaultId: "22222222-2222-4222-8222-222222222222", timeoutMs: 3000, ...patch };
  let status: CompanionConnectionStatus = { kind: "idle" };
  const settingsListeners = new Set<() => void>(), engineListeners = new Set<() => void>();
  const settings = { get: () => ({ ...current }), update: vi.fn(async (next: CompanionSettingsUpdate, expected?: CompanionSettings) => {
    if (expected && companionConfigurationSignature(expected) !== companionConfigurationSignature(current)) throw new Error("changed");
    current = { ...current, ...next }; for (const listener of settingsListeners) listener(); return { ...current };
  }), subscribe: (listener: () => void) => { settingsListeners.add(listener); return () => { settingsListeners.delete(listener); }; } };
  const engine = {
    getStatus: () => ({ ...status }),
    subscribeStatus: (listener: () => void) => { engineListeners.add(listener); return () => { engineListeners.delete(listener); }; },
    test: vi.fn(async (_settings: CompanionSettings) => {}),
    syncCurrent: vi.fn(async (): Promise<"synced" | "semantic-required"> => "synced"),
    getSemanticMirrorState: () => ({ enabled: false, cachedReady: false }), openProposalReview: vi.fn(),
  };
  const controller = new ConnectController(settings, engine);
  const change = (patch: Partial<CompanionSettings>) => { current = { ...current, ...patch }; status = { kind: "idle" }; for (const listener of settingsListeners) listener(); };
  const publish = (next: CompanionConnectionStatus) => { status = next; for (const listener of engineListeners) listener(); };
  return { controller, settings, engine, change, publish, settingsListeners, engineListeners };
}

describe("Connect product owner", () => {
  it.each([
    [{ enabled: false }, "disabled"], [{ token: "" }, "unconfigured"], [{ endpoint: "http://remote.example" }, "unconfigured"], [{}, "configured"],
  ] as const)("derives legacy startup state passively: %j", (patch, state) => {
    const f = fixture(patch); expect(f.controller.getSnapshot().state).toBe(state);
    f.controller.createDraft("local"); f.controller.createDraft("remote"); f.controller.createSyncConfirmation();
    expect(f.engine.test).not.toHaveBeenCalled(); expect(f.engine.syncCurrent).not.toHaveBeenCalled();
    expect(f.engine.openProposalReview).not.toHaveBeenCalled(); expect(f.settings.update).not.toHaveBeenCalled();
  });
  it("preserves configured drafts in their mode and clears credentials across modes", () => {
    const f = fixture({ endpoint: "http://localhost:3001" });
    expect(f.controller.createDraft("local")).toEqual({ mode: "local", endpoint: "http://localhost:3001", token: "PRIVATE_PLUGIN_TOKEN" });
    expect(f.controller.createDraft("remote")).toEqual({ mode: "remote", endpoint: "", token: "" });
    f.change({ endpoint: "https://companion.example/prefix" });
    expect(f.controller.createDraft("local")).toEqual({ mode: "local", endpoint: "http://127.0.0.1:27124", token: "" });
  });
  it("Connect tests only a candidate and enables it after persistence, without requiring Semantic", async () => {
    const f = fixture({ enabled: false });
    const draft = f.controller.createDraft("local"); const before = f.settings.get();
    expect(await f.controller.connect(draft)).toEqual({ ok: true });
    expect(f.engine.test).toHaveBeenCalledExactlyOnceWith({ ...before, enabled: true });
    expect(f.settings.update).toHaveBeenCalledExactlyOnceWith({ ...before, enabled: true }, before);
    expect(f.controller.getSnapshot()).toMatchObject({ state: "ready", semanticEnabled: false, mirrorKnownReady: false });
    expect(f.engine.syncCurrent).not.toHaveBeenCalled();
    const restarted = new ConnectController(f.settings, f.engine);
    expect(restarted.getSnapshot().state).toBe("configured"); expect(f.engine.test).toHaveBeenCalledTimes(1);
  });
  it.each(["AUTH_REQUIRED", "PROTOCOL_VERSION_MISMATCH", "TIMEOUT", "CONFIGURATION_ERROR", "SERVER_ERROR"] as const)("failed candidate %s preserves committed settings and sanitizes failure", async (code) => {
    const f = fixture(); const before = f.settings.get();
    f.engine.test.mockRejectedValueOnce(new CompanionClientError(code));
    const draft = f.controller.createDraft("remote"); draft.endpoint = "https://remote.example"; draft.token = "candidate-private";
    const result = await f.controller.connect(draft);
    expect(result.ok).toBe(false); expect(f.settings.get()).toEqual(before); expect(f.settings.update).not.toHaveBeenCalled();
    expect(JSON.stringify([result, f.controller.getSnapshot(), connectViewModel(f.controller.getSnapshot())])).not.toMatch(/PRIVATE|candidate-private|Bearer|AUTH_REQUIRED/u);
  });
  it.each(["http://remote.example", "https://user:PRIVATE_PLUGIN_TOKEN@remote.example", "https://remote.example/?token=PRIVATE_PLUGIN_TOKEN", "file:///tmp/file"])("rejects invalid endpoint without a request: %s", async (endpoint) => {
    const f = fixture(); const draft = f.controller.createDraft("remote"); Object.assign(draft, { endpoint, token: "secret" });
    expect(await f.controller.connect(draft)).toEqual({ ok: false, reason: "invalid" });
    expect(f.engine.test).not.toHaveBeenCalled(); expect(f.settings.update).not.toHaveBeenCalled();
    f.change({ endpoint }); expect(f.controller.getSnapshot().endpointLabel).toBe("");
  });
  it("Check tests current settings once, single flights across observers, and writes nothing", async () => {
    const f = fixture(); let release!: () => void;
    f.engine.test.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const a = vi.fn(), b = vi.fn(); f.controller.subscribe(a); const remove = f.controller.subscribe(b);
    f.controller.subscribe(() => { throw new Error("view failed"); });
    const pending = f.controller.check(); expect(f.controller.getSnapshot()).toMatchObject({ busy: true, operation: "check" });
    expect(await f.controller.check()).toEqual({ ok: false, reason: "busy" });
    release(); expect(await pending).toEqual({ ok: true }); expect(a).toHaveBeenCalledTimes(2); expect(b).toHaveBeenCalledTimes(2);
    remove(); f.change({ timeoutMs: 4000 }); expect(a).toHaveBeenCalledTimes(3); expect(b).toHaveBeenCalledTimes(2);
    expect(f.controller.getSnapshot().state).toBe("configured"); expect(f.settings.update).not.toHaveBeenCalled();
    expect(f.engine.test).toHaveBeenCalledTimes(1);
  });
  it.each(["enabled", "endpoint", "token", "timeoutMs", "vaultId"] as const)("Advanced %s invalidates Ready without network", async (field) => {
    const f = fixture(); await f.controller.check();
    const updates = { enabled: false, endpoint: "https://remote.example", token: "new", timeoutMs: 7000, vaultId: "33333333-3333-4333-8333-333333333333" };
    f.change({ [field]: updates[field] });
    expect(f.controller.getSnapshot().state).toBe(field === "enabled" ? "disabled" : "configured");
    expect(f.engine.test).toHaveBeenCalledTimes(1);
  });
  it("late Check cannot restore Ready after Advanced changes", async () => {
    const f = fixture(); let release!: () => void;
    f.engine.test.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const pending = f.controller.check(); f.change({ token: "new" }); release();
    expect(await pending).toEqual({ ok: false, reason: "changed" }); expect(f.controller.getSnapshot().state).toBe("configured");
  });
  it("confirmation is passive, exact-configuration bound and one use", async () => {
    const f = fixture(); const confirmation = f.controller.createSyncConfirmation()!;
    expect(f.engine.syncCurrent).not.toHaveBeenCalled(); expect(JSON.stringify(confirmation)).not.toContain("PRIVATE");
    f.change({ endpoint: "https://remote.example" });
    expect(await f.controller.sync(confirmation)).toEqual({ ok: false, reason: "changed" }); expect(f.engine.syncCurrent).not.toHaveBeenCalled();
    const next = f.controller.createSyncConfirmation()!; expect(next.local).toBe(false);
    expect(await f.controller.sync(next)).toEqual({ ok: true });
    expect(await f.controller.sync(next)).toEqual({ ok: false, reason: "changed" }); expect(f.engine.syncCurrent).toHaveBeenCalledTimes(1);
  });
  it("keeps Semantic-required and failed sync visible without writes", async () => {
    const f = fixture(); await f.controller.check(); f.engine.syncCurrent.mockResolvedValueOnce("semantic-required");
    expect(await f.controller.sync(f.controller.createSyncConfirmation()!)).toEqual({ ok: false, reason: "semantic-required" });
    expect(f.controller.getSnapshot().state).toBe("ready");
    f.engine.syncCurrent.mockRejectedValueOnce(new Error("PRIVATE_RESPONSE"));
    expect(await f.controller.sync(f.controller.createSyncConfirmation()!)).toEqual({ ok: false, reason: "server" });
    expect(f.controller.getSnapshot()).toMatchObject({ state: "error", mirrorKnownReady: false }); expect(f.settings.update).not.toHaveBeenCalled();
  });
  it("background status reaches every observer, preserves a separate mirror state, and disposes subscriptions", async () => {
    const f = fixture(); const listener = vi.fn(); f.controller.subscribe(listener); await f.controller.check();
    f.publish({ kind: "syncing", operation: "sync" }); expect(f.controller.getSnapshot().state).toBe("syncing");
    f.publish({ kind: "ready", mirrorKnownReady: true, lastSuccessAt: 123 });
    expect(f.controller.getSnapshot()).toMatchObject({ state: "ready", mirrorKnownReady: true, lastSuccessAt: 123 });
    f.publish({ kind: "error", code: "raw unknown private body" });
    expect(f.controller.getSnapshot()).toMatchObject({ state: "error", error: "server" });
    expect(JSON.stringify(f.controller.getSnapshot())).not.toContain("private body");
    f.controller.dispose(); expect(f.settingsListeners.size).toBe(0); expect(f.engineListeners.size).toBe(0);
    expect(await f.controller.connect(f.controller.createDraft("local"))).toEqual({ ok: false, reason: "busy" });
    expect(f.controller.createSyncConfirmation()).toBeUndefined(); f.controller.openProposalReview();
    expect(f.engine.test).toHaveBeenCalledTimes(1); expect(f.engine.openProposalReview).not.toHaveBeenCalled();
  });
  it("Disable preserves endpoint, token, timeout and stable identity, including during background sync", async () => {
    const f = fixture(); const before = f.settings.get();
    f.publish({ kind: "syncing", operation: "sync" });
    expect(await f.controller.disable()).toEqual({ ok: true });
    expect(f.settings.get()).toEqual({ ...before, enabled: false });
    expect(f.engine.test).not.toHaveBeenCalled(); expect(f.engine.syncCurrent).not.toHaveBeenCalled();
  });
  it("proposal review is explicit and accepts a configured connection without testing or syncing", () => {
    const f = fixture(); expect(f.engine.openProposalReview).not.toHaveBeenCalled(); f.controller.openProposalReview();
    expect(f.engine.openProposalReview).toHaveBeenCalledTimes(1); expect(f.engine.test).not.toHaveBeenCalled(); expect(f.engine.syncCurrent).not.toHaveBeenCalled();
    f.change({ enabled: false }); f.controller.openProposalReview(); expect(f.engine.openProposalReview).toHaveBeenCalledTimes(1);
  });
});
