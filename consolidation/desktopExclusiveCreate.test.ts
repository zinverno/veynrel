import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import type { FileHandle } from "node:fs/promises";
vi.mock("obsidian", () => ({ Platform: { isDesktopApp: true }, FileSystemAdapter: class {} }));
import { FileSystemAdapter, Platform } from "obsidian";
import type { App } from "obsidian";
import { inspectDesktopCreation } from "./desktopExclusiveCreate";

const roots: string[] = [];
afterEach(async () => { Platform.isDesktopApp = true; for (const root of roots.splice(0)) await fs.promises.rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await fs.promises.mkdtemp(path.join(tmpdir(), "exclusive-create-unit-")); roots.push(root);
  await fs.promises.mkdir(root + "/Atoms");
  const adapter = Object.assign(new FileSystemAdapter(), { getBasePath: () => root, getFullPath: (p: string) => path.join(root, p) });
  const app = { vault: { adapter, configDir: ".config" } } as unknown as App;
  const handles: FileHandle[] = [];
  const io = { ...fs.promises, statfs: vi.fn(async (p: fs.PathLike) => ({ ...await fs.promises.statfs(p), type: 0x9123683e })),
    open: vi.fn(async (...args: Parameters<typeof fs.promises.open>) => { const h = await fs.promises.open(...args); handles.push(h); return h; }) };
  const load = vi.fn(() => ({ fs: { ...fs, promises: io } as unknown as typeof fs, path, platform: "linux" }));
  const cap = () => inspectDesktopCreation(app, "confirmed-local-unsynchronized", load);
  const creator = async () => { const c = await cap(); if (!c.available) throw Error(c.reason); return c; };
  return { root, adapter, app, handles, io, load, cap, creator };
}
describe("desktop creation capability", () => {
  it.each(["unknown", "network", "synchronized"] as const)("refuses %s storage before loading Node", async scope => {
    const f = await fixture(); expect(await inspectDesktopCreation(f.app, scope, f.load)).toEqual({ available: false, reason: "environment" }); expect(f.load).not.toHaveBeenCalled();
  });
  it("mobile and unknown adapters cannot load Node or create", async () => {
    const f = await fixture(); Platform.isDesktopApp = false;
    expect(await f.cap()).toMatchObject({ available: false, reason: "platform" });
    Platform.isDesktopApp = true; f.app.vault.adapter = {} as FileSystemAdapter;
    expect(await f.cap()).toMatchObject({ available: false, reason: "adapter" }); expect(f.load).not.toHaveBeenCalled();
  });
  it.each(["win32", "darwin"])("refuses unverified %s platform", async platform => {
    const f = await fixture(); const node = f.load(); f.load.mockReturnValue({ ...node, platform });
    expect(await f.cap()).toMatchObject({ available: false, reason: "platform" });
  });
  it.each([0x6969, 0xff534d42, 0x65735546, 0xef53, 0x01021994])("refuses unverified filesystem %i", async type => {
    const f = await fixture(); f.io.statfs.mockResolvedValue({ ...await fs.promises.statfs(f.root), type });
    expect(await f.cap()).toMatchObject({ available: false, reason: "filesystem" }); expect(f.io.open).not.toHaveBeenCalled();
  });
  it("closes every descriptor and verifies exact Unicode/CRLF bytes", async () => {
    const f = await fixture(), c = await f.creator(), markdown = "# Опыт 🪶\r\n\r\né остаётся гипотезой.\r\n";
    const created = await c.create("Atoms/Опыт.md", markdown); await c.verify(created);
    expect(await fs.promises.readFile(f.root + "/Atoms/Опыт.md", "utf8")).toBe(markdown);
    expect(f.handles.every(h => h.fd === -1)).toBe(true);
    expect(f.io.open.mock.calls.some(c => c[1] === "wx")).toBe(true);
  });
  it("two independent creators cannot overwrite the winning file", async () => {
    const f = await fixture(), a = await f.creator(), b = await f.creator();
    const outcomes = await Promise.allSettled([a.create("Atoms/Race.md", "first"), b.create("Atoms/Race.md", "second")]);
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const winner = outcomes.find(r => r.status === "fulfilled");
    if (winner?.status !== "fulfilled") throw Error("No winner");
    expect(await fs.promises.readFile(f.root + "/Atoms/Race.md", "utf8")).toBe(winner.value.markdown);
    expect(f.handles.every(h => h.fd === -1)).toBe(true);
  });
  it("refuses a competitor created immediately before exclusive open", async () => {
    const f = await fixture(), c = await f.creator(), open = f.io.open.getMockImplementation()!;
    f.io.open.mockImplementation(async (...args) => { if (args[1] === "wx") await fs.promises.writeFile(f.root + "/Atoms/Race.md", "competitor", { flag: "wx" }); return open(...args); });
    await expect(c.create("Atoms/Race.md", "ours")).rejects.toMatchObject({ reason: "occupied", mayHaveCreated: false });
    expect(await fs.promises.readFile(f.root + "/Atoms/Race.md", "utf8")).toBe("competitor"); expect(f.handles.every(h => h.fd === -1)).toBe(true);
  });
  it.each(["Atoms/../Outside.md", "/Outside.md", ".config/Hidden.md", "Atoms/Missing/Note.md"])("refuses invalid/missing path %s", async p => {
    const f = await fixture(), c = await f.creator(); await expect(c.create(p, "text")).rejects.toMatchObject({ mayHaveCreated: false });
    expect(f.handles.every(h => h.fd === -1)).toBe(true);
  });
  it("refuses case/NFKC collisions and symlinks, including dangling final links", async () => {
    const f = await fixture(), c = await f.creator(); await fs.promises.writeFile(f.root + "/Atoms/ATOM.md", "owner");
    await expect(c.create("Atoms/Atom.md", "ours")).rejects.toMatchObject({ reason: "occupied", mayHaveCreated: false });
    await fs.promises.writeFile(f.root + "/Atoms/Ｆａｃｔ.md", "owner");
    await expect(c.create("Atoms/Fact.md", "ours")).rejects.toMatchObject({ reason: "occupied", mayHaveCreated: false });
    await fs.promises.symlink(f.root + "/Atoms", f.root + "/Alias");
    await expect(c.create("Alias/Escape.md", "ours")).rejects.toMatchObject({ mayHaveCreated: false });
    await fs.promises.symlink(f.root + "/Missing.md", f.root + "/Atoms/Link.md");
    await expect(c.create("Atoms/Link.md", "ours")).rejects.toMatchObject({ mayHaveCreated: false });
    expect(fs.existsSync(f.root + "/Missing.md")).toBe(false);
  });
  it.each(["write", "sync", "close"])("preserves partial evidence and attempts all closes on %s error", async stage => {
    const f = await fixture(), c = await f.creator(), open = f.io.open.getMockImplementation()!;
    f.io.open.mockImplementation(async (...args) => {
      const h = await open(...args);
      if (args[1] === "wx") {
        const close = h.close.bind(h);
        if (stage === "close") h.close = async () => { await close(); throw Object.assign(Error("close"), { code: "EIO" }); };
        else h[stage === "write" ? "writeFile" : "sync"] = async () => { throw Object.assign(Error(stage), { code: "EIO" }); };
      }
      return h;
    });
    await expect(c.create("Atoms/Partial.md", "ours")).rejects.toMatchObject({ mayHaveCreated: true });
    expect(fs.existsSync(f.root + "/Atoms/Partial.md")).toBe(true); expect(f.handles.every(h => h.fd === -1)).toBe(true);
    if (stage === "write") expect(await fs.promises.readFile(f.root + "/Atoms/Partial.md", "utf8")).toBe("");
  });
  it("later modification, removal or replacement revokes verification", async () => {
    const f = await fixture(), c = await f.creator(), created = await c.create("Atoms/New.md", "ours");
    await fs.promises.writeFile(f.root + "/Atoms/New.md", "theirs"); await expect(c.verify(created)).rejects.toThrow();
    await fs.promises.unlink(f.root + "/Atoms/New.md"); await expect(c.verify(created)).rejects.toThrow();
    await fs.promises.writeFile(f.root + "/Atoms/New.md", "ours"); await expect(c.verify(created)).rejects.toThrow();
    expect(f.handles.every(h => h.fd === -1)).toBe(true);
  });
  it("keeps Apply blocked: moving the pinned parent can leave an empty file beyond the vault boundary", async () => {
    const f = await fixture(), c = await f.creator(), open = f.io.open.getMockImplementation()!;
    const outside = await fs.promises.mkdtemp(path.join(tmpdir(), "exclusive-other-synthetic-vault-")); roots.push(outside);
    f.io.open.mockImplementation(async (...args) => {
      if (args[1] === "wx") await fs.promises.rename(f.root + "/Atoms", outside + "/Moved");
      return open(...args);
    });
    expect(c.applyReady).toBe(false);
    await expect(c.create("Atoms/New.md", "ours")).rejects.toMatchObject({ reason: "changed", mayHaveCreated: true });
    expect(await fs.promises.readFile(outside + "/Moved/New.md", "utf8")).toBe("");
    expect(f.handles.every(h => h.fd === -1)).toBe(true);
  });
});
