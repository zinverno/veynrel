import { describe, expect, it, vi } from "vitest";
import { createConnectionRules } from "./connectionRules";
import type { Plugin } from "obsidian";

function fixture() {
  const files = new Map<string, string>(), callbacks = new Map<string, (file: object) => void>(), removers: (() => void)[] = [];
  const adapter = { exists: async (p: string) => files.has(p), read: async (p: string) => files.get(p)!, stat: async () => ({ type: "folder", ctime: 10 }),
    write: vi.fn(async (p: string, text: string) => { files.set(p, text); }), remove: async (p: string) => { files.delete(p); },
    rename: vi.fn(async (from: string, to: string) => { if (files.has(to)) throw Error("Destination exists"); files.set(to, files.get(from)!); files.delete(from); }) };
  const plugin = { manifest: { id: "synthetic" }, register: (fn: () => void) => removers.push(fn),
    app: { vault: { configDir: "Custom", adapter, getFolderByPath: (path: string) => ({ path }),
      on: (event: string, fn: (file: object) => void) => { callbacks.set(event, fn); return event; }, offref: (event: string) => { callbacks.delete(event); } } } } as unknown as Plugin;
  return { files, callbacks, adapter, removers, store: createConnectionRules(plugin), restart: () => createConnectionRules(plugin) };
}
describe("connection policy native storage boundary", () => {
  it("retains old state after partial write/replacement failure, reads backup and releases events", async () => {
    const f = fixture(), path = "Custom/plugins/synthetic/connection-rules.json";
    await f.store.add("within", { kind: "tag", value: "practice/task" });
    const id = f.store.list()[0].id;
    f.adapter.write.mockImplementationOnce(async (p, text) => { f.files.set(p, text.slice(0, 8)); throw Error("disk"); });
    await expect(f.store.enable(id, false)).rejects.toThrow();
    const next = f.restart(); await next.load(); expect(next.list()[0].enabled).toBe(true);
    const rename = f.adapter.rename.getMockImplementation()!;
    f.adapter.rename.mockImplementation(async (from, to) => { if (to === path) throw Error("replacement and rollback failed"); await rename(from, to); });
    await expect(next.enable(id, false)).rejects.toThrow(); expect(next.list()[0].enabled).toBe(true);
    expect(f.files.has(path)).toBe(false); const recovered = f.restart(); await recovered.load(); expect(recovered.list()[0].enabled).toBe(true);
    f.adapter.rename.mockImplementation(rename); await recovered.enable(id, false);
    const final = f.restart(); await final.load(); expect(final.list()[0].enabled).toBe(false);
    expect([...f.files.keys()].every(p => p.startsWith(path))).toBe(true);
    f.removers.forEach(remove => remove()); expect(f.callbacks.size).toBe(0);
  });
  it("invalidates folder identities on rename/delete without rebinding; corrupt primary blocks writes", async () => {
    const f = fixture(); await f.store.add("within", { kind: "folder", value: "Tasks" });
    const rule = f.store.list()[0]; expect(f.store.folderState(rule)).toBe("known");
    f.callbacks.get("rename")!({ children: [], path: "Moved" }); expect(f.store.folderState(rule)).toBe("unknown");
    f.adapter.stat = async () => ({ type: "folder", ctime: 11 }); await f.store.refreshFolders(); expect(f.store.folderState(rule)).toBe("missing");
    f.files.set("Custom/plugins/synthetic/connection-rules.json", "{"); const bad = f.restart();
    await expect(bad.load()).rejects.toThrow(); const calls = f.adapter.write.mock.calls.length;
    await expect(bad.enable(rule.id, false)).rejects.toThrow(); expect(f.adapter.write).toHaveBeenCalledTimes(calls);
  });
});
