import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, MarkdownView: class {}, getLanguage: () => "en", requestUrl: vi.fn() }));
import { TFile, MarkdownView, requestUrl } from "obsidian";
import type { App } from "obsidian";
import { callOpenRouter } from "../api";
import { StudioStorage } from "./storage";
import { StudioJournal } from "./journal";
import { StudioApply } from "./apply";
import { RecipeRunner } from "./runner";
import { studioInventory, studioNotePort } from "./obsidianNotes";
import { BUILTIN_RECIPES } from "./builtins";
import { testAdapter } from "./testAdapter";

function fixture(count = 2) {
  const disk = testAdapter(), content = new Map<string, string>(), files: TFile[] = [];
  for (let i = 0; i < count; i++) {
    const path = `folder${i}/same.md`, raw = `# Original ${i}\nSaved facts.\n`;
    content.set(path, raw); files.push(Object.assign(new TFile(), { path, stat: { ctime: 1, mtime: 2, size: raw.length } }));
  }
  let leaves: unknown[] = [];
  const vault = {
    configDir: ".custom", adapter: disk.adapter, getFileByPath: (path: string) => files.find(f => f.path === path && content.has(path)) ?? null,
    getMarkdownFiles: () => files.filter(f => content.has(f.path)),
    read: vi.fn(async (f: TFile) => content.get(f.path)!),
    process: vi.fn(async (f: TFile, fn: (s: string) => string) => { const next = fn(content.get(f.path)!); content.set(f.path, next); f.stat.mtime++; f.stat.size = new TextEncoder().encode(next).length; return next; }),
  };
  const app = { vault, workspace: { iterateAllLeaves: (fn: (leaf: unknown) => void) => leaves.forEach(fn) } } as unknown as App;
  const settings = { provider: "ollama" as const, model: "synthetic", baseUrl: "http://127.0.0.1:1234/v1", apiKey: "", temperature: 0.2, topK: 5 };
  const port = studioNotePort(app), journal = new StudioJournal(new StudioStorage(disk.adapter, vault.configDir, "ai-knowledge-hub"));
  const writer = new StudioApply(journal, port), complete = vi.fn(async () => "# Structured\nPreserved facts.\n");
  const runner = new RecipeRunner({ notes: port, inventory: () => studioInventory(app), settings: { get: () => ({ ...settings }), update: async s => s, subscribe: () => () => {} }, complete }, writer);
  const prepare = (recipe = BUILTIN_RECIPES[0]) => runner.prepare(recipe, recipe.parameters, { paths: files.map(f => f.path) }, 32768);
  const generate = async (recipe = BUILTIN_RECIPES[0]) => runner.generate(await prepare(recipe));
  const apply = async () => { const r = await generate(); await runner.apply(r, r.rows.map(x => x.path)); return r; };
  return { ...disk, app, vault, files, content, port, settings, journal, writer, runner, complete, prepare, generate, apply,
    restart: () => new StudioApply(new StudioJournal(new StudioStorage(disk.adapter, vault.configDir, "ai-knowledge-hub")), studioNotePort(app)),
    editor: (file = files[0], raw = content.get(file.path)!, deferred = false) => {
      const view = Object.assign(new MarkdownView({} as never), { file: deferred ? null : file, getViewData: () => raw });
      leaves = [{ view, getViewState: () => ({ type: "markdown", state: { file: file.path } }) }];
    },
  };
}
describe("Studio consent and generation", () => {
  it("constructors and inventory have no note/network/storage writes", () => {
    const f = fixture(); expect(studioInventory(f.app)).toEqual(f.files.map(x => x.path));
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.complete).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
  });
  it("preparation freezes exact request bodies and never generates or writes", async () => {
    const f = fixture(), p = await f.prepare(); expect(p.requests).toHaveLength(2);
    const body = JSON.parse(p.requests[0].body) as { messages: { content: string }[] };
    expect(body.messages[1].content).toBe(p.requests[0].user);
    expect(p.requests[0].user).toContain("Original 0"); expect(p.requests[0].user).not.toContain("folder0");
    expect(Object.isFrozen(p.requests[0].options)).toBe(true); expect(f.complete).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
    f.runner.cancel(); await expect(f.runner.generate(p)).rejects.toThrow(); expect(f.complete).not.toHaveBeenCalled();
  });
  it.each(["model", "baseUrl", "temperature"])("rejects changed %s before sending", async key => {
    const f = fixture(), p = await f.prepare(); Object.assign(f.settings, { [key]: key === "temperature" ? 0.7 : "changed" });
    await expect(f.runner.generate(p)).rejects.toThrow("settings"); expect(f.complete).not.toHaveBeenCalled();
  });
  it("rejects a forged consent object and concurrent preparation", async () => {
    const f = fixture(), p = await f.prepare(); await expect(f.runner.generate({ ...p })).rejects.toThrow("stale");
    const first = f.prepare(); await expect(f.prepare()).rejects.toThrow("busy"); await first;
  });
  it("a stale confirmation from another tab does not invalidate a newly prepared run", async () => {
    const f = fixture(1), old = await f.generate(), next = await f.prepare();
    await expect(f.runner.apply(old, [old.rows[0].path])).rejects.toThrow("stale"); expect(f.runner.state).toBe("prepared");
    expect(f.runner.prepared).toBe(next); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it.each(["length", "context"])("rejects %s limits without truncation or calls", async mode => {
    const f = fixture(1); if (mode === "length") f.content.set(f.files[0].path, "a".repeat(24001));
    await expect(f.runner.prepare(BUILTIN_RECIPES[0], BUILTIN_RECIPES[0].parameters, { folder: "/" }, mode === "context" ? 1024 : 32768)).rejects.toThrow("size");
    expect(f.complete).not.toHaveBeenCalled(); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it.each(["", "  ", "a\0b", "x".repeat(48001)])("rejects empty/control/oversized results without offering Apply", async response => {
    const f = fixture(1); f.complete.mockResolvedValue(response); const r = await f.generate();
    expect(r.rows[0].status).toBe("failed"); expect(r.rows[0].after).toBeNull(); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it("rejects incomplete and tool responses through the existing transport, without retries", async () => {
    const f = fixture(1); vi.stubGlobal("window", { setTimeout, clearTimeout });
    for (const finish_reason of ["length", "tool_calls", null]) {
      vi.mocked(requestUrl).mockResolvedValue({ status: 200, text: JSON.stringify({ choices: [{ message: { content: "partial" }, finish_reason }] }) } as never);
      await expect(callOpenRouter(f.settings, "system", "user", { requireFinishReason: true })).rejects.toThrow();
    }
    expect(requestUrl).toHaveBeenCalledTimes(3); vi.unstubAllGlobals();
  });
  it("uses frozen replace/append output, and edits to recipe/settings cannot change Review", async () => {
    const f = fixture(1), recipe = structuredClone(BUILTIN_RECIPES[0]); recipe.output.action = "append";
    const r = await f.generate(recipe); expect(r.rows[0].after).toBe(`${r.rows[0].before}\n\n# Structured\nPreserved facts.\n`);
    recipe.steps[0].prompt = "changed"; f.settings.model = "changed";
    expect(Object.isFrozen(r.rows[0])).toBe(true); expect(f.vault.process).not.toHaveBeenCalled();
    await f.runner.apply(r, [r.rows[0].path]); expect(f.content.get(r.rows[0].path)).toBe(r.rows[0].after);
  });
  it("cancellation during an issued request holds the owner until it settles, then stops later calls", async () => {
    const f = fixture(); let release!: (s: string) => void;
    f.complete.mockImplementationOnce(() => new Promise(r => { release = r; })); const pending = f.generate();
    await vi.waitFor(() => expect(f.complete).toHaveBeenCalledTimes(1)); f.runner.cancel();
    await expect(f.prepare()).rejects.toThrow("busy"); release("late"); const r = await pending;
    expect(r.rows.map(x => x.status)).toEqual(["cancelled", "cancelled"]); expect(f.complete).toHaveBeenCalledTimes(1); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it("failed start receipt prevents any provider call", async () => {
    const f = fixture(); vi.mocked(f.adapter.write).mockRejectedValueOnce(Error("disk"));
    await expect(f.generate()).rejects.toThrow(); expect(f.complete).not.toHaveBeenCalled();
  });
});

describe("Studio guarded Apply and restart recovery", () => {
  it("selective batch applies canonical paths, with verified backups and separately confirmed Undo", async () => {
    const f = fixture(), r = await f.generate(); await f.runner.apply(r, [r.rows[1].path]);
    expect(f.content.get(r.rows[0].path)).toBe(r.rows[0].before); expect(f.content.get(r.rows[1].path)).toBe(r.rows[1].after);
    const history = await f.restart().history(); expect(history).toHaveLength(1); expect(history[0]).toMatchObject({ state: "applied", canUndo: true });
    const undo = await f.writer.reviewUndo(r.id, 0, "undo"); expect(f.vault.process).toHaveBeenCalledTimes(1);
    await f.writer.executeUndo(undo); expect(f.content.get(r.rows[1].path)).toBe(r.rows[1].before);
    expect((await f.restart().history())[0].state).toBe("undone"); expect(() => f.writer.executeUndo(undo)).toThrow("used"); expect(f.complete).toHaveBeenCalledTimes(2);
  });
  it.each(["content", "rename", "delete", "replace", "ctime"])("protects %s changes made during generation", async mode => {
    const f = fixture(1); f.complete.mockImplementationOnce(async () => {
      const file = f.files[0];
      if (mode === "content") f.content.set(file.path, "User edit");
      if (mode === "rename") file.path = "moved.md";
      if (mode === "delete") f.content.delete(file.path);
      if (mode === "replace") f.files[0] = Object.assign(new TFile(), { path: file.path, stat: { ...file.stat } });
      if (mode === "ctime") file.stat.ctime++;
      return "Transformed";
    });
    const r = await f.generate(), result = await f.runner.apply(r, [r.rows[0].path]);
    expect(result[0].outcome).toBe("conflict"); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it.each(["saved", "unsaved", "deferred"])("blocks %s editors before write", async mode => {
    const f = fixture(1), r = await f.generate(); f.editor(f.files[0], mode === "unsaved" ? "unsaved changes" : f.content.get(f.files[0].path), mode === "deferred");
    const result = await f.runner.apply(r, [r.rows[0].path]); expect(result[0]).toMatchObject({ outcome: "conflict", reason: "editor" }); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it("rejects edits and newly opened editors inside the process callback", async () => {
    for (const mode of ["content", "editor"]) {
      const f = fixture(1), r = await f.generate(), original = f.vault.process.getMockImplementation()!;
      f.vault.process.mockImplementationOnce(async (file, fn) => { if (mode === "content") f.content.set(file.path, "external"); else f.editor(); return original(file, fn); });
      expect((await f.runner.apply(r, [r.rows[0].path]))[0].outcome).toBe("unconfirmed");
      expect(f.content.get(r.rows[0].path)).toBe(mode === "content" ? "external" : r.rows[0].before);
    }
  });
  it("double confirmation and competing Apply cannot duplicate a write", async () => {
    const f = fixture(1), r = await f.generate(), pending = f.runner.apply(r, [r.rows[0].path]);
    await expect(f.runner.apply(r, [r.rows[0].path])).rejects.toThrow("busy"); await pending;
    await f.runner.apply(r, [r.rows[0].path]); expect(f.vault.process).toHaveBeenCalledTimes(1);
  });
  it("cancels mid-batch after confirming the issued write, never starts the next", async () => {
    const f = fixture(), r = await f.generate(), original = f.vault.process.getMockImplementation()!;
    f.vault.process.mockImplementationOnce(async (file, fn) => { const result = await original(file, fn); f.runner.cancel(); return result; });
    expect((await f.runner.apply(r, r.rows.map(x => x.path))).map(x => x.outcome)).toEqual(["applied", "skipped"]);
    expect((await f.restart().history()).map(x => x.state)).toEqual(["applied", "skipped"]);
  });
  it.each(["record.json", "backup.json", "0-apply-intent.json"])("blocks notes if %s cannot be durably verified", async suffix => {
    const f = fixture(), r = await f.generate(), original = vi.mocked(f.adapter.write).getMockImplementation()!;
    vi.mocked(f.adapter.write).mockImplementation(async (path, raw) => { if (path.endsWith(suffix)) throw Error("disk"); await original(path, raw); });
    expect((await f.runner.apply(r, r.rows.map(x => x.path)))[0].outcome).toBe("failed"); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it.each(["before", "after", "receipt"])("classifies crash %s physical write without replaying it", async point => {
    const f = fixture(), r = await f.generate(), original = f.vault.process.getMockImplementation()!;
    if (point === "receipt") {
      const write = vi.mocked(f.adapter.write).getMockImplementation()!;
      vi.mocked(f.adapter.write).mockImplementation(async (path, raw) => { if (path.endsWith("0-applied.json")) throw Error("disk"); await write(path, raw); });
    } else f.vault.process.mockImplementationOnce(async (file, fn) => { if (point === "after") await original(file, fn); throw Error("crash"); });
    expect((await f.runner.apply(r, r.rows.map(x => x.path))).map(x => x.outcome)).toEqual(["unconfirmed", "skipped"]);
    const restarted = f.restart(), [row] = await restarted.history();
    expect(row).toMatchObject({ state: "unconfirmed", recovery: point === "before" ? "skipped" : "applied" });
    expect(f.vault.process).toHaveBeenCalledTimes(1); expect(f.complete).toHaveBeenCalledTimes(2);
    if (point !== "receipt") {
      const recovery = await restarted.reviewUndo(r.id, 0, "recover"); await restarted.executeUndo(recovery);
      expect((await restarted.history())[0].state).toBe(point === "before" ? "skipped" : "applied"); expect(f.vault.process).toHaveBeenCalledTimes(1);
    }
  });
  it("torn receipt blocks automatic/manual writes and keeps both backups", async () => {
    const f = fixture(1), r = await f.apply(), dir = `${f.journal.root}/${r.id}`;
    const disk = f.journal.storage.adapter;
    await disk.write(`${dir}/0-applied.json`, "{");
    const restarted = f.restart(), [row] = await restarted.history(); expect(row).toMatchObject({ state: "damaged", canUndo: false });
    await expect(restarted.reviewUndo(r.id, 0, "undo")).rejects.toThrow(); expect(await disk.read(`${dir}/record.json`)).toBe(await disk.read(`${dir}/backup.json`));
    expect(f.vault.process).toHaveBeenCalledTimes(1);
  });
  it("Undo refuses later user edits, even edits returning to identical text with a newer mtime", async () => {
    for (const mode of ["content", "mtime"]) {
      const f = fixture(1), r = await f.apply(); if (mode === "content") f.content.set(f.files[0].path, "user edit"); else f.files[0].stat.mtime++;
      await expect(f.writer.reviewUndo(r.id, 0, "undo")).rejects.toThrow("conflict"); expect(f.vault.process).toHaveBeenCalledTimes(1);
    }
  });
  it("Undo rechecks exact source and evidence after confirmation and after writing its intent", async () => {
    for (const point of ["confirmation", "intent"]) {
      const f = fixture(1), r = await f.apply(), undo = await f.writer.reviewUndo(r.id, 0, "undo");
      if (point === "confirmation") f.content.set(f.files[0].path, "user edit");
      else {
        const write = vi.mocked(f.adapter.write).getMockImplementation()!;
        vi.mocked(f.adapter.write).mockImplementation(async (path, raw) => { await write(path, raw); if (path.endsWith("undo-intent.json")) f.content.set(f.files[0].path, "user edit"); });
      }
      await expect(f.writer.executeUndo(undo)).rejects.toThrow(); expect(f.vault.process).toHaveBeenCalledTimes(1); expect(f.content.get(f.files[0].path)).toBe("user edit");
    }
  });
  it("interrupted Undo is read-only on restart, then can confirm an already restored original", async () => {
    const f = fixture(1), r = await f.apply(), undo = await f.writer.reviewUndo(r.id, 0, "undo"), original = f.vault.process.getMockImplementation()!;
    f.vault.process.mockImplementationOnce(async (file, fn) => { await original(file, fn); throw Error("crash"); });
    await expect(f.writer.executeUndo(undo)).rejects.toThrow(); const restarted = f.restart();
    expect((await restarted.history())[0]).toMatchObject({ state: "unconfirmed", recovery: "undone" });
    await restarted.executeUndo(await restarted.reviewUndo(r.id, 0, "recover")); expect((await restarted.history())[0].state).toBe("undone");
    expect(f.vault.process).toHaveBeenCalledTimes(2); expect(f.complete).toHaveBeenCalledTimes(1);
  });
  it("lost review/generation after restart is interrupted and never triggers provider calls", async () => {
    const f = fixture(1); await f.generate(); expect((await f.journal.runs())[0].state).toBe("interrupted");
    expect(f.complete).toHaveBeenCalledTimes(1); expect(f.vault.process).not.toHaveBeenCalled();
  });
});
