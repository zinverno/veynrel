import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App, RequestUrlParam } from "obsidian";
const native = vi.hoisted(() => {
  class TFile { extension = "md"; stat = { mtime: 1, size: 1, ctime: 1 }; constructor(public path: string) {} }
  class TFolder { constructor(public path: string) {} }
  class MarkdownView { constructor(public file: TFile, private text: string) {} getViewData() { return this.text; } }
  return { TFile, TFolder, MarkdownView, requestUrl: vi.fn() };
});
vi.mock("obsidian", () => ({ ...native, getLanguage: () => "en", normalizePath: (s: string) => s, Modal: class {}, FuzzySuggestModal: class {}, Component: class {}, PluginSettingTab: class {} }));
import { GenerativeAtomization } from "./generativeSession";
import { DEFAULT_SETTINGS } from "../settings";
import { setLanguage } from "../i18n";
const transport = (content = JSON.stringify({ atoms: [{ title: "First", body: "First proposal." }, { title: "Second", body: "Second proposal." }] }), finish = "stop") => ({ status: 200, text: JSON.stringify({ choices: [{ finish_reason: finish, message: { role: "assistant", content } }] }) });
function fixture() {
  const settings = { ...structuredClone(DEFAULT_SETTINGS), provider: "ollama" as const, baseUrl: "http://127.0.0.1:11434/v1", model: "synthetic", atomsLocation: "folder" as const, atomsFolder: "Atoms" };
  const file = new native.TFile("Source.md"), original = "# Source\r\n\r\nKeep trailing spaces  \r\n";
  const entries = new Map<string, InstanceType<typeof native.TFile> | InstanceType<typeof native.TFolder>>([[file.path, file]]);
  const texts = new Map([[file.path, original]]); let editor = false, editorText = original;
  const vault = {
    configDir: ".obsidian", getFileByPath: (p: string) => entries.get(p), getAbstractFileByPath: (p: string) => entries.get(p) ?? null,
    getAllLoadedFiles: () => [...entries.values()], adapter: { exists: vi.fn(async (p: string) => entries.has(p)) },
    read: vi.fn(async (f: { path: string }) => texts.get(f.path)!),
    createFolder: vi.fn(async (p: string) => { const folder = new native.TFolder(p); entries.set(p, folder); return folder; }),
    create: vi.fn(async (p: string, content: string) => { if (entries.has(p)) throw Error("occupied"); const f = new native.TFile(p); entries.set(p, f); texts.set(p, content); return f; }),
    process: vi.fn(async (f: { path: string }, fn: (s: string) => string) => { texts.set(f.path, fn(texts.get(f.path)!)); }),
  };
  const app = { vault, workspace: { iterateAllLeaves: (fn: (leaf: unknown) => void) => { if (editor) { fn({ getViewState: () => ({ type: "backlink", state: { file: file.path } }), view: { file }, detach: () => { throw Error("Must not close backlinks"); } }); fn({ getViewState: () => ({ state: { file: file.path } }), view: new native.MarkdownView(file, editorText), detach: () => { editor = false; } }); } } } } as unknown as App;
  return { settings, file, original, texts, entries, vault, app, setEditor: (v: boolean, text = original) => { editor = v; editorText = text; },
    writes: () => vault.create.mock.calls.length + vault.createFolder.mock.calls.length + vault.process.mock.calls.length,
    prepare: () => GenerativeAtomization.prepare(app, () => settings, file as never) };
}
beforeEach(() => { setLanguage("en"); vi.stubGlobal("window", { setTimeout, clearTimeout }); native.requestUrl.mockReset().mockResolvedValue(transport()); });
afterEach(() => vi.unstubAllGlobals());
describe("generative atomization through the product transport parser", () => {
  it("preparation/cancel are read-only; consent and sent text are identical; proposals and review never write", async () => {
    const f = fixture(); const cancelled = await f.prepare(); cancelled.cancel(); await expect(cancelled.generate()).rejects.toMatchObject({ reason: "cancelled" });
    expect(native.requestUrl).not.toHaveBeenCalled(); expect(f.writes()).toBe(0);
    const s = await f.prepare(), proposals = await s.generate();
    const body = JSON.parse((native.requestUrl.mock.calls[0][0] as RequestUrlParam).body as string) as { messages: unknown };
    expect(body.messages).toEqual([{ role: "system", content: s.system }, { role: "user", content: s.user }]);
    expect(proposals).toHaveLength(2); expect(Object.isFrozen(proposals[0])).toBe(true);
    const plan = await s.review([1]); expect(plan.proposals.map(p => p.path)).toEqual(["Atoms/Second.md"]);
    expect(plan.after).toBe(f.original + plan.addition); expect(f.writes()).toBe(0);
    s.cancel(); await expect(s.apply(plan)).rejects.toMatchObject({ reason: "cancelled" }); expect(f.texts.get(filePath(f))).toBe(f.original);
  });
  it("creates only explicitly selected files and exact source addition after separate apply", async () => {
    const f = fixture(), s = await f.prepare(); await s.generate(); const plan = await s.review([0]);
    await s.apply(plan); expect(f.texts.get("Source.md")).toBe(plan.after); expect(f.texts.get("Atoms/First.md")).toBe(plan.proposals[0].content);
    expect(f.entries.has("Atoms/Second.md")).toBe(false); expect(s.done).toBe(true); expect(native.requestUrl).toHaveBeenCalledOnce();
    await expect(s.apply(plan)).rejects.toMatchObject({ reason: "stale" });
  });
  it.each(["text", "identity", "rename", "settings", "parent"])("refuses stale %s with zero writes", async change => {
    const f = fixture(), s = await f.prepare(); await s.generate(); const plan = await s.review([0]);
    if (change === "text") f.texts.set("Source.md", "Changed with the same mtime");
    if (change === "identity") f.entries.set("Source.md", new native.TFile("Source.md"));
    if (change === "rename") f.file.path = "Renamed.md";
    if (change === "settings") f.settings.model = "another";
    if (change === "parent") f.entries.set("Atoms", new native.TFolder("Atoms"));
    await expect(s.apply(plan)).rejects.toMatchObject({ reason: "stale" }); expect(f.writes()).toBe(0);
  });
  it("keeps legacy suffix names and refuses new case-folded collisions without renaming the approved target", async () => {
    const f = fixture(); f.entries.set("Atoms", new native.TFolder("Atoms")); f.entries.set("Atoms/FIRST.md", new native.TFile("Atoms/FIRST.md"));
    const s = await f.prepare(); const props = await s.generate(); expect(props[0].path).toBe("Atoms/First-2.md");
    const plan = await s.review([0]); f.entries.set("Atoms/first-2.md", new native.TFile("Atoms/first-2.md"));
    await expect(s.apply(plan)).rejects.toMatchObject({ reason: "occupied" }); expect(f.writes()).toBe(0);
  });
  it("requires affected editor tabs closed and allows review again without another request", async () => {
    const f = fixture(), s = await f.prepare(); await s.generate(); f.setEditor(true);
    await expect(s.review([0])).rejects.toMatchObject({ reason: "editor" }); f.setEditor(false); const plan = await s.review([0]);
    f.setEditor(true); await expect(s.apply(plan)).rejects.toMatchObject({ reason: "editor" }); expect(f.writes()).toBe(0);
    f.setEditor(false); await s.apply(await s.retryReview(plan)); expect(native.requestUrl).toHaveBeenCalledOnce();
  });
  it("closes only explicitly confirmed saved tabs and refuses unsaved buffers without discarding them", async () => {
    const f = fixture(), s = await f.prepare(); await s.generate(); f.setEditor(true, "Unsaved edits");
    await expect(s.closeSavedTabs()).rejects.toMatchObject({ reason: "unsaved" });
    await expect(s.review([0])).rejects.toMatchObject({ reason: "editor" }); expect(f.writes()).toBe(0);
    f.setEditor(true); await s.closeSavedTabs(); await s.review([0]); expect(native.requestUrl).toHaveBeenCalledOnce(); expect(f.writes()).toBe(0);
  });
  it("rejects edited created files before continuing a partial operation", async () => {
    const f = fixture(), s = await f.prepare(); await s.generate(); const plan = await s.review([0, 1]);
    const create = f.vault.create.getMockImplementation()!; f.vault.create.mockImplementationOnce(create).mockRejectedValueOnce(Error("disk"));
    await expect(s.apply(plan)).rejects.toThrow(); f.texts.set("Atoms/First.md", "User edited proposal");
    await expect(s.retryReview(plan)).rejects.toMatchObject({ reason: "stale" }); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it.each(["../Outside", ".obsidian", "Nested/../Other", "Bad|folder"])("refuses unsafe destination %s before requests", async folder => {
    const f = fixture(); f.settings.atomsFolder = folder; await expect(f.prepare()).rejects.toMatchObject({ reason: "path" });
    expect(native.requestUrl).not.toHaveBeenCalled(); expect(f.writes()).toBe(0);
  });
  it("sends the exact section-shortened saved text and rejects repeated atomization", async () => {
    const f = fixture(); f.texts.set("Source.md", "# A\n\n" + "Long paragraph. ".repeat(5000)); const s = await f.prepare();
    expect(s.user).not.toBe(s.source.content); await s.generate();
    const body = JSON.parse((native.requestUrl.mock.calls[0][0] as RequestUrlParam).body as string) as { messages: { content: string }[] };
    expect(body.messages[1].content).toBe(s.user); expect(f.writes()).toBe(0);
    f.texts.set("Source.md", "## Атомарные заметки\n"); await expect(f.prepare()).rejects.toMatchObject({ reason: "already" });
  });
  it("reports partial writes and retries only absent destinations after a new review, without a request", async () => {
    const f = fixture(), s = await f.prepare(); await s.generate(); const plan = await s.review([0, 1]);
    const create = f.vault.create.getMockImplementation()!;
    f.vault.create.mockImplementationOnce(create).mockRejectedValueOnce(Error("disk"));
    await expect(s.apply(plan)).rejects.toThrow("disk");
    expect(s.createdPaths).toEqual(["Atoms/First.md"]); expect(s.uncertainPath).toBe("Atoms/Second.md"); expect(s.done).toBe(false);
    expect(f.texts.get("Source.md")).toBe(f.original); const retry = await s.retryReview(plan); await s.apply(retry);
    expect(s.createdPaths).toEqual(["Atoms/First.md", "Atoms/Second.md"]); expect(f.vault.create.mock.calls.map(c => c[0])).toEqual(["Atoms/First.md", "Atoms/Second.md", "Atoms/Second.md"]);
    expect(native.requestUrl).toHaveBeenCalledOnce(); expect(f.texts.get("Source.md")).toBe(plan.after);
  });
  it("does not retry an ambiguous create", async () => {
    const f = fixture(), s = await f.prepare(); await s.generate(); const plan = await s.review([0, 1]);
    const create = f.vault.create.getMockImplementation()!;
    f.vault.create.mockImplementationOnce(create).mockImplementationOnce(async (p, text) => { await create(p, text); throw Error("ack lost"); });
    await expect(s.apply(plan)).rejects.toThrow(); await expect(s.retryReview(plan)).rejects.toMatchObject({ reason: "write" });
    expect(f.vault.process).not.toHaveBeenCalled(); expect(f.vault.create).toHaveBeenCalledTimes(2);
  });
  it("guards exact source again inside Vault.process after all creates", async () => {
    const f = fixture(), s = await f.prepare(); await s.generate(); const plan = await s.review([0]);
    f.vault.process.mockImplementationOnce(async (file, fn) => { f.texts.set(file.path, "External edit"); fn("External edit"); });
    await expect(s.apply(plan)).rejects.toThrow(); expect(f.texts.get("Source.md")).toBe("External edit"); expect(s.createdPaths).toEqual(["Atoms/First.md"]); expect(s.uncertainPath).toBe("Source.md");
  });
  it.each(["length", "content_filter", ""])("rejects transport completion %s and never retries", async finish => {
    native.requestUrl.mockResolvedValue(transport(undefined, finish)); const f = fixture(), s = await f.prepare();
    await expect(s.generate()).rejects.toThrow(); await expect(s.generate()).rejects.toMatchObject({ reason: "settings" }); expect(native.requestUrl).toHaveBeenCalledOnce(); expect(f.writes()).toBe(0);
  });
  it.each(['{"atoms":[{"title":42,"body":"text"}]}', '{"atoms":{}}', '{"atoms":[{"title":"Title","body":""}]}'])("rejects malformed proposals without writes", async body => {
    native.requestUrl.mockResolvedValue(transport(body)); const f = fixture(), s = await f.prepare(); await expect(s.generate()).rejects.toMatchObject({ reason: "response" }); expect(f.writes()).toBe(0);
  });
  it("ignores late transport success after cancellation", async () => {
    let finish!: (v: ReturnType<typeof transport>) => void; native.requestUrl.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const f = fixture(), s = await f.prepare(); const pending = s.generate();
    for (let i = 0; i < 20; i++) await Promise.resolve(); s.cancel(); await expect(pending).rejects.toThrow(); finish(transport());
    expect(f.writes()).toBe(0); await expect(s.review([0])).rejects.toThrow();
  });
  it("serializes own concurrent writes", async () => {
    const f = fixture(), a = await f.prepare(), b = await f.prepare(); await a.generate(); await b.generate(); const pa = await a.review([0]), pb = await b.review([0]);
    let release!: () => void; const create = f.vault.create.getMockImplementation()!;
    f.vault.create.mockImplementationOnce(async (p, text) => { await new Promise<void>(r => { release = r; }); return create(p, text); });
    const writing = a.apply(pa); for (let i = 0; i < 100; i++) await Promise.resolve();
    await expect(b.apply(pb)).rejects.toMatchObject({ reason: "stale" }); release(); await writing;
  });
});
function filePath(f: ReturnType<typeof fixture>) { return f.file.path; }
