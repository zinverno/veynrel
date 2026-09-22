import { describe, expect, it, vi } from "vitest";
import { FindingStore } from "./findingStore";
import { candidate, MemoryHealthStorage } from "./testSupport";
import type { ReconcileRequest } from "./types";

const request = (id: string, complete = true, present = true): ReconcileRequest => ({
  scope: { source: "local", analyzerIds: [id] }, complete, seenAt: 100,
  candidates: present ? [candidate({ analyzerId: id })] : [],
});
async function fixture() {
  const storage = new MemoryHealthStorage();
  const store = new FindingStore(storage, () => 100);
  await store.load();
  return { store, storage, write: vi.spyOn(storage, "write") };
}

describe("batch reconciliation", () => {
  it("commits two analyzers in one write and preserves single-request semantics", async () => {
    const { store, write } = await fixture();
    expect(await store.reconcileBatch([request("b"), request("a")])).toEqual({ created: 2, updated: 0, resolved: 0, updatedAt: 100 });
    expect(write).toHaveBeenCalledTimes(1);
    expect(store.list()).toHaveLength(2);
    expect(await store.reconcile(request("a"))).toEqual({ created: 0, updated: 1, resolved: 0 });
    expect(store.getFindingsUpdatedAt()).toBe(101);
  });

  it("resolves complete absence only and leaves partial/unincluded scopes untouched", async () => {
    const { store, write } = await fixture();
    await store.reconcileBatch([request("a"), request("b"), request("c")]);
    write.mockClear();
    expect(await store.reconcileBatch([request("a", true, false), request("b", false, false)])).toMatchObject({ resolved: 1 });
    expect(store.list({ state: "open" }).map((item) => item.analyzerId).sort()).toEqual(["b", "c"]);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it.each(["invalid", "outside-scope", "duplicate-identity"])("validates the entire batch before writes: %s", async (kind) => {
    const { store, write } = await fixture();
    const second = request("b");
    if (kind === "invalid") second.seenAt = NaN;
    if (kind === "outside-scope") second.candidates = [candidate({ analyzerId: "c" })];
    if (kind === "duplicate-identity") second.candidates = [...second.candidates, ...second.candidates];
    await expect(store.reconcileBatch([request("a"), second])).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
    expect(store.list()).toEqual([]);
  });

  it("rejects overlapping ownership, including repeated IDs within a scope", async () => {
    const { store, write } = await fixture();
    await expect(store.reconcileBatch([request("a"), request("a")])).rejects.toThrow("Conflicting");
    await expect(store.reconcileBatch([{ ...request("a"), scope: { source: "local", analyzerIds: ["a", "a"] } }])).rejects.toThrow("Conflicting");
    expect(write).not.toHaveBeenCalled();
  });

  it("publishes neither state nor receipt after write or pre-commit guard failure", async () => {
    const { store, write } = await fixture();
    write.mockRejectedValueOnce(new Error("disk full"));
    await expect(store.reconcileBatch([request("a"), request("b")])).rejects.toThrow("disk full");
    expect(store.list()).toEqual([]);
    expect(store.getFindingsUpdatedAt()).toBeUndefined();
    write.mockClear();
    await expect(store.reconcileBatch([request("a")], { beforeCommit: () => Promise.reject(new Error("stale")) })).rejects.toThrow("stale");
    expect(write).not.toHaveBeenCalled();
    await store.reconcileBatch([request("b")]);
    expect(store.list()).toHaveLength(1);
  });

  it("serializes batches, holds published state until write completion, and runs guards in the queue", async () => {
    const { store, storage, write } = await fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    write.mockImplementationOnce(async (file, text) => { await gate; storage.files.set(file, text); });
    const first = store.reconcileBatch([request("a")]);
    const guard = vi.fn(async () => {});
    const second = store.reconcileBatch([request("b")], { beforeCommit: guard });
    await Promise.resolve(); await Promise.resolve();
    expect(guard).not.toHaveBeenCalled();
    expect(store.list()).toEqual([]);
    release(); await Promise.all([first, second]);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(store.list()).toHaveLength(2);
  });

  it("copies caller input and serializes equivalent reordered batches identically", async () => {
    const a = await fixture(); const b = await fixture();
    const first = request("a");
    const pending = a.store.reconcileBatch([request("b"), first]);
    first.candidates[0].title = "Changed outside store";
    await pending;
    await b.store.reconcileBatch([request("a"), request("b")]);
    expect(a.storage.files.get("findings.json")).toBe(b.storage.files.get("findings.json"));
  });

  it("does not write empty batches and advances receipts across reloads even at the same clock time", async () => {
    const { store, storage, write } = await fixture();
    expect(await store.reconcileBatch([])).toEqual({ created: 0, updated: 0, resolved: 0 });
    expect(write).not.toHaveBeenCalled();
    await store.reconcileBatch([request("a")]);
    const reload = new FindingStore(storage, () => 100); await reload.load();
    expect((await reload.reconcileBatch([request("b")])).updatedAt).toBe(101);
  });
});
