import { describe, expect, it, vi } from "vitest";
import { ObsidianRecallStorage, recallStorageRoot } from "./obsidianRecallStorage";
import { RecallStore } from "./recallStore";
import { candidate, request } from "../testSupport";

function fixture() {
  const files = new Map<string, string>(), folders = new Set<string>();
  const adapter = {
    exists: vi.fn(async (path: string) => files.has(path) || folders.has(path)),
    read: vi.fn(async (path: string) => { const bytes = files.get(path); if (bytes === undefined) throw new Error("Missing"); return bytes; }),
    write: vi.fn(async (path: string, bytes: string) => { files.set(path, bytes); }),
    mkdir: vi.fn(async (path: string) => { folders.add(path); }),
    stat: vi.fn(async (path: string) => folders.has(path) ? { type: "folder" as const, mtime: 0, ctime: 0, size: 0 }
      : files.has(path) ? { type: "file" as const, mtime: 0, ctime: 0, size: files.get(path)!.length } : null),
  };
  const storage = new ObsidianRecallStorage(adapter, "Private/Config", "veynrel-test");
  return { files, folders, adapter, storage, store: new RecallStore(storage), path: "Private/Config/plugins/veynrel-test/recall/cards.json" };
}

describe("Recall dedicated DataAdapter storage", () => {
  it("uses only manifest/config-derived recall/cards.json and round trips", async () => {
    const f = fixture(); expect(f.adapter.exists).not.toHaveBeenCalled();
    expect(await f.store.load()).toEqual({ status: "missing", writable: true }); expect(f.adapter.write).not.toHaveBeenCalled();
    expect(f.adapter.mkdir).not.toHaveBeenCalled();
    await f.store.reconcile(request([candidate()]));
    expect([...f.files.keys()]).toEqual([f.path]);
    const restarted = new RecallStore(f.storage); await restarted.load(); expect(restarted.listCards()).toEqual(f.store.listCards());
    expect(f.adapter.read.mock.calls.map(([path]) => path)).toEqual([f.path]);
  });

  it("tolerates an already-created directory, but refuses files in the parent chain", async () => {
    const f = fixture(); f.adapter.mkdir.mockImplementationOnce(async (path) => { f.folders.add(path); throw new Error("Already exists"); });
    await f.store.load(); await f.store.reconcile(request([candidate()]));
    const bad = fixture(); bad.files.set("Private", "file"); await bad.store.load();
    await expect(bad.store.reconcile(request([candidate()]))).rejects.toThrow("could not be saved"); expect(bad.adapter.write).not.toHaveBeenCalled();
  });

  it("preserves truncated bytes after an interrupted write, in the same owner and after restart", async () => {
    const f = fixture(); await f.store.load();
    f.adapter.write.mockImplementationOnce(async (path) => { f.files.set(path, "{"); throw new Error("Interrupted"); });
    await expect(f.store.reconcile(request([candidate()]))).rejects.toThrow("could not be saved");
    await expect(f.store.reconcile(request([candidate()]))).rejects.toThrow("write-blocked"); expect(f.store.listCards()).toEqual([]);
    const restarted = new RecallStore(f.storage); expect(await restarted.load()).toEqual({ status: "invalid", writable: false });
    await expect(restarted.reconcile(request([]))).rejects.toThrow("write-blocked"); expect(f.files.get(f.path)).toBe("{");
    expect(f.adapter.write).toHaveBeenCalledTimes(1);
  });

  it.each(["", "/absolute", "../escape", "a//b", "a/./b", "C:/windows", "a\0b"])("rejects invalid config path %j without IO", (path) => {
    const f = fixture(); expect(() => new ObsidianRecallStorage(f.adapter, path, "veynrel")).toThrow();
    expect(f.adapter.exists).not.toHaveBeenCalled();
  });

  it.each(["../plugin", "plugin/elsewhere", "plugin.", ""])("rejects plugin ID %j", (id) => {
    expect(() => recallStorageRoot("Private/Config", id)).toThrow();
  });
});
