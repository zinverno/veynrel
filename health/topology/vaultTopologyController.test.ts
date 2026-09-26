import { afterEach, describe, expect, it, vi } from "vitest";
import { VaultTopologyController } from "./vaultTopologyController";
import { syntheticTopologyFixture } from "./syntheticFixture";
import { createLocalVaultRevision } from "../analyzers/local/localVaultRevision";
import type { LocalVaultSnapshot } from "../analyzers/local/types";
import { createObsidianVaultTopology } from "./obsidianVaultTopology";
import { appFixture } from "../obsidian/testSupport";
vi.mock("obsidian", () => ({ parseLinktext: (path: string) => ({ path, subpath: "" }) }));
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const metadata: LocalVaultSnapshot = { ...syntheticTopologyFixture(), notes: syntheticTopologyFixture().notes.slice(0, 3) };
  const source = { captureMetadata: vi.fn(async (_signal: AbortSignal) => metadata),
    captureRevision: vi.fn(async () => createLocalVaultRevision(metadata.notes)) };
  const remove = vi.fn(); const controller = new VaultTopologyController(source, remove);
  return { controller, source, metadata, remove };
}

describe("transient topology ownership", () => {
  it("is passive on creation/subscription and coalesces duplicate loads/refreshes", async () => {
    const f = fixture(); const listener = vi.fn(); const unsubscribe = f.controller.subscribe(listener);
    expect(f.controller.getSnapshot()).toEqual({ state: "idle" }); expect(f.source.captureMetadata).not.toHaveBeenCalled();
    const load = f.controller.load(); expect(f.controller.refresh()).toBe(load); expect(f.controller.load()).toBe(load);
    expect(f.controller.getSnapshot().state).toBe("loading"); await load;
    expect(f.controller.getSnapshot().state).toBe("ready"); expect(f.source.captureMetadata).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(f.controller.getSnapshot().map)).toBe(true);
    await f.controller.load(); expect(f.source.captureMetadata).toHaveBeenCalledTimes(1);
    await f.controller.refresh(); expect(f.source.captureMetadata).toHaveBeenCalledTimes(2);
    unsubscribe(); f.controller.markStale(); expect(listener).toHaveBeenCalledTimes(4);
    f.controller.dispose(); expect(f.remove).toHaveBeenCalledTimes(1);
  });
  it("discards changed captures and preserves only an explicitly stale prior successful map", async () => {
    const f = fixture(); await f.controller.load(); const previous = f.controller.getSnapshot().map;
    f.source.captureRevision.mockResolvedValueOnce({ noteCount: 3, signature: "changed", complete: true });
    await f.controller.refresh(); expect(f.controller.getSnapshot()).toMatchObject({ state: "stale", error: "changed", map: previous });
    f.source.captureRevision.mockResolvedValueOnce({ ...previous!.revision, complete: false });
    await f.controller.refresh(); expect(f.controller.getSnapshot().state).toBe("stale");
    await f.controller.refresh(); expect(f.controller.getSnapshot().state).toBe("ready");
    f.controller.dispose();
  });
  it("rejects metadata-event races even when inventory revision is unchanged", async () => {
    const f = fixture();
    f.source.captureMetadata.mockImplementationOnce(async () => { f.controller.markStale(); return f.metadata; });
    await f.controller.load(); expect(f.controller.getSnapshot()).toMatchObject({ state: "stale", error: "changed" });
    expect(f.controller.getSnapshot().map).toBeUndefined();
    await f.controller.refresh(); expect(f.controller.getSnapshot().state).toBe("ready"); f.controller.dispose();
  });
  it("does not auto-reload on stale events and hides raw errors while allowing retry", async () => {
    const f = fixture(); await f.controller.load(); f.controller.markStale();
    expect(f.controller.getSnapshot().state).toBe("stale"); expect(f.source.captureMetadata).toHaveBeenCalledTimes(1);
    f.source.captureMetadata.mockRejectedValueOnce(new Error("SECRET note body"));
    await f.controller.refresh(); expect(f.controller.getSnapshot().state).toBe("error");
    expect(JSON.stringify(f.controller.getSnapshot())).not.toContain("SECRET");
    await f.controller.refresh(); expect(f.controller.getSnapshot().state).toBe("ready"); f.controller.dispose();
  });
  it("prevents late publish on disposal even if the source ignores abort", async () => {
    const f = fixture(); let release!: (metadata: LocalVaultSnapshot) => void;
    f.source.captureMetadata.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const listener = vi.fn(); f.controller.subscribe(listener);
    const loadA = f.controller.load(); await Promise.resolve();
    const loadB = f.controller.refresh(); expect(loadB).toBe(loadA); // Explicit coalescing: no competing generation B.
    const signal = f.source.captureMetadata.mock.calls[0][0];
    f.controller.dispose(); await loadA; expect(signal.aborted).toBe(true);
    release(f.metadata); await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1); expect(f.controller.getSnapshot()).toEqual({ state: "idle" });
    await f.controller.refresh(); expect(f.source.captureMetadata).toHaveBeenCalledTimes(1);
    f.controller.dispose(); expect(f.remove).toHaveBeenCalledTimes(1);
  });
  it("registers plugin-lifetime metadata/vault listeners, marks every relevant event stale and disposes all of them", async () => {
    const f = appFixture(); const controller = createObsidianVaultTopology(f.app);
    const network = vi.fn(() => { throw new Error("Forbidden network"); }); vi.stubGlobal("fetch", network);
    expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
    await controller.load(); expect(f.vault.getMarkdownFiles).toHaveBeenCalledTimes(2);
    const vaultCalls = f.vault.on.mock.calls as unknown as Array<[string, (file: { path: string }, oldPath?: string) => void]>;
    for (const [name, handler] of vaultCalls) {
      handler({ path: "A.md" }, name === "rename" ? "Old.md" : undefined);
      expect(controller.getSnapshot().state).toBe("stale");
      const count = f.vault.getMarkdownFiles.mock.calls.length; await Promise.resolve();
      expect(f.vault.getMarkdownFiles).toHaveBeenCalledTimes(count);
      await controller.refresh(); expect(controller.getSnapshot().state).toBe("ready");
    }
    vaultCalls.find(([name]) => name === "modify")![1]({ path: "Private/Config/excluded.md" });
    expect(controller.getSnapshot().state).toBe("ready");
    const cacheCalls = f.metadataCache.on.mock.calls as unknown as Array<[string, (file: { path: string }) => void]>;
    cacheCalls.find(([name]) => name === "changed")![1]({ path: "A.md" }); expect(controller.getSnapshot().state).toBe("stale");
    await controller.refresh(); cacheCalls.find(([name]) => name === "resolved")![1]({ path: "" });
    expect(controller.getSnapshot().state).toBe("stale");
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.adapter.read).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    controller.dispose(); expect(f.vault.offref).toHaveBeenCalledTimes(4); expect(f.metadataCache.offref).toHaveBeenCalledTimes(2);
  });
});
