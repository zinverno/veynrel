import { describe, expect, it, vi } from "vitest";
import { FindingStore } from "./findingStore";
import { findingIdFromFingerprint } from "../domain/identity";
import { candidate, MemoryHealthStorage, scanRun } from "./testSupport";
import type { FindingCandidate } from "../domain/finding";
import type { ReconcileRequest } from "./types";

const scope = { source: "local", analyzerIds: ["broken-links"] } as const;
const request = (candidates: FindingCandidate[], overrides: Partial<ReconcileRequest> = {}): ReconcileRequest => ({ scope, candidates, complete: true, ...overrides });

async function fixture() {
  let now = 100;
  const storage = new MemoryHealthStorage();
  const store = new FindingStore(storage, () => now);
  await store.load();
  const item = candidate();
  const id = findingIdFromFingerprint(item.fingerprint);
  return { storage, store, item, id, time: (value: number) => { now = value; } };
}

describe("finding lifecycle", () => {
  it("creates an open finding, preserves fields and firstSeenAt, refreshes descriptive evidence", async () => {
    const f = await fixture();
    expect(await f.store.reconcile(request([f.item]))).toEqual({ created: 1, updated: 0, resolved: 0 });
    expect(f.store.get(f.id)).toEqual({ ...f.item, id: f.id, state: "open", firstSeenAt: 100, lastSeenAt: 100 });
    f.time(200);
    expect(await f.store.reconcile(request([{ ...f.item, title: "Localized title", evidence: [{ kind: "count", value: 2 }] }]))).toEqual({ created: 0, updated: 1, resolved: 0 });
    expect(f.store.get(f.id)).toMatchObject({ id: f.id, firstSeenAt: 100, lastSeenAt: 200, state: "open", title: "Localized title", evidence: [{ kind: "count", value: 2 }] });
  });

  it("resolves only the complete source/analyzer scope, with no effect on lastSeenAt", async () => {
    const f = await fixture();
    await f.store.reconcile(request([f.item]));
    const other = candidate({ analyzerId: "orphans", type: "orphan" });
    await f.store.reconcile(request([other], { scope: { source: "local", analyzerIds: ["orphans"] } }));
    for (const source of ["semantic", "deep-ai", "recall"] as const) {
      await f.store.reconcile(request([candidate({ source })], { scope: { source, analyzerIds: ["broken-links"] } }));
    }
    f.time(200);
    expect(await f.store.reconcile(request([]))).toEqual({ created: 0, updated: 0, resolved: 1 });
    expect(f.store.get(f.id)).toMatchObject({ state: "resolved", lastSeenAt: 100 });
    expect(f.store.list({ state: "open" })).toHaveLength(4);
  });

  it("does not resolve absences from partial coverage but accepts positive observations", async () => {
    const f = await fixture();
    await f.store.reconcile(request([f.item]));
    f.time(200);
    expect(await f.store.reconcile(request([], { complete: false }))).toEqual({ created: 0, updated: 0, resolved: 0 });
    expect(f.store.get(f.id)?.state).toBe("open");
    await f.store.reconcile(request([f.item], { complete: false }));
    expect(f.store.get(f.id)?.lastSeenAt).toBe(200);
  });

  it("retains dismissal across absence, reappearance, and reload; explicit reopen persists", async () => {
    const f = await fixture();
    await f.store.reconcile(request([f.item]));
    await f.store.dismiss(f.id);
    await f.store.reconcile(request([]));
    f.time(200);
    await f.store.reconcile(request([f.item]));
    const reload = new FindingStore(f.storage, () => 300);
    await reload.load();
    expect(reload.get(f.id)).toMatchObject({ state: "dismissed", lastSeenAt: 200, firstSeenAt: 100 });
    await reload.reopen(f.id);
    const again = new FindingStore(f.storage);
    await again.load();
    expect(again.get(f.id)?.state).toBe("open");
  });

  it("keeps snooze before deadline and reopens at the deadline only when detected", async () => {
    const f = await fixture();
    await f.store.reconcile(request([f.item]));
    await f.store.snooze(f.id, 300);
    const reload = new FindingStore(f.storage, () => 200);
    await reload.load();
    expect(reload.get(f.id)).toMatchObject({ state: "snoozed", snoozedUntil: 300 });
    f.time(299);
    await f.store.reconcile(request([f.item]));
    expect(f.store.get(f.id)).toMatchObject({ state: "snoozed", snoozedUntil: 300 });
    f.time(300);
    expect(f.store.get(f.id)?.state).toBe("snoozed");
    await f.store.reconcile(request([f.item]));
    expect(f.store.get(f.id)).toMatchObject({ state: "open", firstSeenAt: 100, lastSeenAt: 300 });
    expect(f.store.get(f.id)).not.toHaveProperty("snoozedUntil");
  });

  it("uses the injected current clock for snooze expiry, not an earlier observation time", async () => {
    const f = await fixture();
    await f.store.reconcile(request([f.item]));
    await f.store.snooze(f.id, 300);
    f.time(400);
    await f.store.reconcile(request([f.item], { seenAt: 200 }));
    expect(f.store.get(f.id)).toMatchObject({ state: "open", lastSeenAt: 200 });
  });

  it("resolves missing snoozed findings only on complete coverage and clears the deadline", async () => {
    const f = await fixture();
    await f.store.reconcile(request([f.item]));
    await f.store.snooze(f.id, 300);
    await f.store.reconcile(request([], { complete: false }));
    expect(f.store.get(f.id)?.state).toBe("snoozed");
    expect(await f.store.reconcile(request([]))).toMatchObject({ resolved: 1 });
    expect(f.store.get(f.id)?.state).toBe("resolved");
    expect(f.store.get(f.id)).not.toHaveProperty("snoozedUntil");
  });

  it("reopens a resolved regression with the original identity and firstSeenAt", async () => {
    const f = await fixture();
    await f.store.reconcile(request([f.item]));
    await f.store.reconcile(request([]));
    f.time(500);
    expect(await f.store.reconcile(request([f.item]))).toEqual({ created: 0, updated: 1, resolved: 0 });
    expect(f.store.get(f.id)).toMatchObject({ id: f.id, state: "open", firstSeenAt: 100, lastSeenAt: 500 });
  });

  it.each([NaN, Infinity, -1, 0, 100, 100.5, 8_640_000_000_000_001])("rejects invalid or elapsed snooze deadline %s", async (until) => {
    const f = await fixture();
    await f.store.reconcile(request([f.item]));
    await expect(f.store.snooze(f.id, until)).rejects.toThrow("deadline");
    expect(f.store.get(f.id)?.state).toBe("open");
  });

  it("rejects invalid IDs and unknown mutations predictably", async () => {
    const f = await fixture();
    expect(() => f.store.get("")).toThrow("Invalid finding ID");
    await expect(f.store.dismiss("")).rejects.toThrow("Invalid finding ID");
    await expect(f.store.snooze("bad", 200)).rejects.toThrow("Invalid finding ID");
    await expect(f.store.reopen(f.id)).rejects.toThrow("not found");
    expect(f.store.get(f.id)).toBeUndefined();
  });

  it("rejects duplicate candidates, changed ownership, invalid clocks, stale timestamps and out-of-scope candidates without partial writes", async () => {
    const f = await fixture();
    await f.store.reconcile(request([f.item]));
    const before = f.storage.files.get("findings.json");
    await expect(f.store.reconcile(request([f.item, f.item]))).rejects.toThrow("Duplicate");
    await expect(f.store.reconcile(request([{ ...f.item, type: "different" }]))).rejects.toThrow("ownership");
    await expect(f.store.reconcile(request([candidate({ source: "semantic" })]))).rejects.toThrow("scope");
    await expect(f.store.reconcile(request([], { seenAt: 99 }))).rejects.toThrow("Stale");
    await expect(f.store.reconcile(request([], { seenAt: NaN }))).rejects.toThrow("timestamp");
    f.time(Infinity);
    await expect(f.store.reconcile(request([]))).rejects.toThrow("clock");
    expect(f.storage.files.get("findings.json")).toBe(before);
  });
});

describe("store boundaries", () => {
  it("filters scalar/array states, dimensions, sources and combinations with deterministic ordering", async () => {
    const f = await fixture();
    await f.store.reconcile(request([f.item, candidate({ notePaths: ["B.md"] })]));
    await f.store.dismiss(f.id);
    const semantic = candidate({ source: "semantic", dimension: "connections" });
    f.time(200);
    await f.store.reconcile(request([semantic], { scope: { source: "semantic", analyzerIds: ["broken-links"] } }));
    expect(f.store.list({ state: "dismissed" }).map((item) => item.id)).toEqual([f.id]);
    expect(f.store.list({ state: ["open", "dismissed"] })).toHaveLength(3);
    expect(f.store.list({ dimension: "connections" })).toHaveLength(1);
    expect(f.store.list({ source: ["local"] })).toHaveLength(2);
    expect(f.store.list({ source: "local", state: "open", dimension: ["structure"] })).toHaveLength(1);
    expect(f.store.list({ state: [] })).toEqual([]);
    const list = f.store.list();
    expect(list[0].lastSeenAt).toBe(200);
    expect(list.slice(1).map((item) => item.id)).toEqual(list.slice(1).map((item) => item.id).sort());
  });

  it("isolates input objects, returned findings, arrays and scan version maps", async () => {
    const f = await fixture();
    const pending = f.store.reconcile(request([f.item]));
    f.item.evidence[0].value = 999;
    f.item.notePaths.push("Injected.md");
    await pending;
    const finding = f.store.get(f.id)!;
    finding.evidence[0].value = 500;
    finding.actions[0].path = "Injected.md";
    finding.notePaths.push("Injected.md");
    f.store.list()[0].title = "Mutated";
    expect(f.store.get(f.id)).toMatchObject({ title: "Broken link", notePaths: ["Notes/A.md"], evidence: [{ value: 1 }], actions: [{ path: "Notes/A.md" }] });
    const run = scanRun();
    const save = f.store.recordScanRun(run);
    run.analyzerVersions["broken-links"] = "bad";
    await save;
    f.store.listScanRuns()[0].analyzerVersions["broken-links"] = "bad";
    expect(f.store.listScanRuns()[0].analyzerVersions["broken-links"]).toBe("1");
  });

  it("serializes overlapping mutations and exposes only durable state", async () => {
    const f = await fixture();
    await f.store.reconcile(request([f.item]));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const write = f.storage.write.bind(f.storage);
    const spy = vi.spyOn(f.storage, "write").mockImplementationOnce(async (file, contents) => { await gate; await write(file, contents); });
    const first = f.store.dismiss(f.id);
    const second = f.store.snooze(f.id, 500);
    const third = f.store.reopen(f.id);
    await Promise.resolve();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(f.store.get(f.id)?.state).toBe("open");
    release();
    await Promise.all([first, second, third]);
    expect(spy).toHaveBeenCalledTimes(3);
    const reload = new FindingStore(f.storage);
    await reload.load();
    expect(reload.get(f.id)?.state).toBe("open");
    expect(reload.get(f.id)).not.toHaveProperty("snoozedUntil");
  });

  it("keeps committed memory on failure and continues the queue without leaking a failed mutation", async () => {
    const f = await fixture();
    await f.store.reconcile(request([f.item]));
    vi.spyOn(f.storage, "write").mockRejectedValueOnce(new Error("disk full"));
    await expect(f.store.dismiss(f.id)).rejects.toThrow("disk full");
    expect(f.store.get(f.id)?.state).toBe("open");
    await f.store.snooze(f.id, 500);
    const reload = new FindingStore(f.storage);
    await reload.load();
    expect(reload.get(f.id)).toMatchObject({ state: "snoozed", snoozedUntil: 500 });
  });

  it("requires load and does not reload stale disk over subsequent mutations", async () => {
    const storage = new MemoryHealthStorage();
    const store = new FindingStore(storage, () => 100);
    expect(() => store.list()).toThrow("not loaded");
    await expect(store.reconcile(request([]))).rejects.toThrow("not loaded");
    await store.load();
    const item = candidate();
    await store.reconcile(request([item]));
    await Promise.all([store.dismiss(findingIdFromFingerprint(item.fingerprint)), store.load()]);
    expect(store.list()[0].state).toBe("dismissed");
  });
});
