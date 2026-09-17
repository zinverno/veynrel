import { describe, expect, it, vi } from "vitest";
import { ObsidianHealthStorage, healthStorageRoot } from "./healthStorage";
import { FindingStore } from "./findingStore";
import { candidate } from "./testSupport";
import type { HealthFile } from "./types";

const root = healthStorageRoot("Private/Config", "ai-knowledge-hub");

function fixture() {
  const files = new Map<string, string>();
  const folders = new Set<string>();
  const adapter = {
    exists: vi.fn(async (path: string) => files.has(path) || folders.has(path)),
    read: vi.fn(async (path: string) => { const text = files.get(path); if (text === undefined) throw new Error("Missing"); return text; }),
    write: vi.fn(async (path: string, contents: string) => { files.set(path, contents); }),
    mkdir: vi.fn(async (path: string) => { folders.add(path); }),
    stat: vi.fn(async (path: string) => folders.has(path) ? { type: "folder" as const, ctime: 0, mtime: 0, size: 0 } : files.has(path) ? { type: "file" as const, ctime: 0, mtime: 0, size: 0 } : null),
  };
  return { files, folders, adapter, storage: new ObsidianHealthStorage(adapter, root) };
}

describe("Obsidian Health storage", () => {
  it("uses injected configDir/manifest ID and supports store round trips", async () => {
    expect(root).toBe("Private/Config/plugins/ai-knowledge-hub/health");
    expect(healthStorageRoot(".custom", "another-plugin")).toBe(".custom/plugins/another-plugin/health");
    const f = fixture();
    const store = new FindingStore(f.storage, () => 100);
    expect((await store.load()).findings).toBe("missing");
    expect(f.adapter.mkdir).not.toHaveBeenCalled();
    await store.reconcile({ scope: { source: "local", analyzerIds: ["broken-links"] }, candidates: [candidate()], complete: true });
    expect(f.files.has(`${root}/findings.json`)).toBe(true);
    expect([...f.files.keys()]).toEqual([`${root}/findings.json`]);
    expect(f.adapter.write.mock.calls[0][0]).toBe(`${root}/findings.json`);
    const reload = new FindingStore(f.storage);
    expect((await reload.load()).findings).toBe("loaded");
    expect(reload.list()).toEqual(store.list());
  });

  it("propagates write errors and recovers the queue", async () => {
    const f = fixture();
    await f.storage.write("findings.json", "old");
    f.adapter.write.mockRejectedValueOnce(new Error("Disk full"));
    await expect(f.storage.write("findings.json", "new")).rejects.toThrow("Disk full");
    expect(await f.storage.read("findings.json")).toBe("old");
    await f.storage.write("findings.json", "latest");
    expect(await f.storage.read("findings.json")).toBe("latest");
  });

  it("reports an interrupted write as invalid storage and blocks automatic overwrite on reload", async () => {
    const f = fixture();
    f.adapter.write.mockImplementationOnce(async (path) => { f.files.set(path, "{"); throw new Error("Interrupted"); });
    await expect(f.storage.write("findings.json", "{}")).rejects.toThrow("Interrupted");
    const store = new FindingStore(f.storage);
    expect((await store.load()).findings).toBe("invalid");
    expect(store.list()).toEqual([]);
    await expect(store.reconcile({ scope: { source: "local", analyzerIds: ["broken-links"] }, candidates: [], complete: true })).rejects.toThrow("write-blocked");
    expect(await f.storage.read("findings.json")).toBe("{");
  });

  it("serializes overlapping filesystem operations", async () => {
    const f = fixture();
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const entered = new Promise<void>((resolve) => { started = resolve; });
    f.adapter.write.mockImplementationOnce(async (path, contents) => { started(); await gate; f.files.set(path, contents); });
    const first = f.storage.write("findings.json", "first");
    const second = f.storage.write("findings.json", "second");
    await entered;
    expect(f.adapter.write).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(await f.storage.read("findings.json")).toBe("second");
  });

  it("tolerates concurrent directory creation but propagates real mkdir failures", async () => {
    const f = fixture();
    f.adapter.mkdir.mockImplementationOnce(async (path) => { f.folders.add(path); throw new Error("Already exists"); });
    await f.storage.write("findings.json", "ok");
    const bad = fixture();
    bad.adapter.mkdir.mockRejectedValueOnce(new Error("Denied"));
    await expect(bad.storage.write("findings.json", "bad")).rejects.toThrow("Denied");
    expect(bad.adapter.write).not.toHaveBeenCalled();
  });

  it("rejects a file in the directory chain", async () => {
    const f = fixture();
    f.files.set("Private", "not a directory");
    await expect(f.storage.write("findings.json", "bad")).rejects.toThrow("not a directory");
    expect(f.adapter.write).not.toHaveBeenCalled();
  });

  it.each(["", "/tmp", "../settings", "C:/settings", "a//b", "a/./b", "a\0b"])("rejects unsafe storage root %j", (path) => {
    const f = fixture();
    expect(() => healthStorageRoot(path, "ai-knowledge-hub")).toThrow();
    expect(() => new ObsidianHealthStorage(f.adapter, path)).toThrow();
  });

  it("rejects unsafe plugin IDs and runtime file names", async () => {
    expect(() => healthStorageRoot(".custom", "../elsewhere")).toThrow();
    expect(() => healthStorageRoot(".custom", "plugin.")).toThrow();
    const f = fixture();
    await expect(f.storage.read("../data.json" as HealthFile)).rejects.toThrow("Invalid health storage file");
    await expect(f.storage.write("../data.json" as HealthFile, "bad")).rejects.toThrow("Invalid health storage file");
    expect(f.adapter.write).not.toHaveBeenCalled();
  });
});
