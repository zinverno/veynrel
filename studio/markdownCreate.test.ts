import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", async () => {
  const yaml = await vi.importActual<{ load(s: string): unknown }>("js-yaml");
  class FileView {} class EditableFileView extends FileView {}
  return { TFile: class {}, TFolder: class {}, FileView, EditableFileView, MarkdownView: class extends EditableFileView {},
    getLanguage: () => "en", parseYaml: (s: string) => yaml.load(s), requestUrl: vi.fn() };
});
import { TFile, TFolder, MarkdownView } from "obsidian";
import type { App } from "obsidian";
import { testAdapter } from "./testAdapter";
import { StudioStorage } from "./storage";
import { StudioOperations } from "./operations";
import { studioNotePort } from "./obsidianNotes";
import { markdownTargetPort, suggestedTarget } from "./markdownTarget";
import { MarkdownCreateJournal } from "./markdownCreateJournal";
import { StudioMarkdownCreate } from "./markdownCreate";
import { StudioApply } from "./apply";
import { StudioJournal } from "./journal";
import { RecipeRunner } from "./runner";
import { BUILTIN_RECIPES } from "./builtins";

function fixture(count = 2) {
  const disk = testAdapter(), objects = new Map<string, TFile | TFolder>(), leaves: { view: MarkdownView; getViewState(): unknown }[] = [];
  objects.set("/", Object.assign(new TFolder(), { path: "/" }));
  const addFolder = (path: string) => { disk.folders.add(path); objects.set(path, Object.assign(new TFolder(), { path })); };
  const add = (path: string, content: string) => {
    disk.files.set(path, content); const file = Object.assign(new TFile(), { path, stat: { ctime: 1, mtime: 2, size: new TextEncoder().encode(content).length } }); objects.set(path, file); return file;
  };
  const paths = Array.from({ length: count }, (_, i) => `Folder${i}/same.md`);
  for (let i = 0; i < count; i++) { addFolder(`Folder${i}`); add(paths[i], '---\n# retained\nid: "stable"\naliases: [One]\n---\nAbout 53 kg by Tuesday.'); }
  const originals = paths.map(path => disk.files.get(path)!);
  const vault = {
    configDir: ".custom", adapter: disk.adapter,
    getFileByPath: (p: string) => objects.get(p) instanceof TFile ? objects.get(p) as TFile : null,
    getAbstractFileByPath: (p: string) => objects.get(p) ?? null,
    getAllLoadedFiles: () => [...objects.values()], getMarkdownFiles: () => [...objects.values()].filter(x => x instanceof TFile),
    read: vi.fn(async (f: TFile) => { if (!disk.files.has(f.path)) throw Error("missing"); return disk.files.get(f.path)!; }),
    create: vi.fn(async (p: string, raw: string) => { if (disk.files.has(p) || disk.folders.has(p)) throw Error("occupied"); return add(p, raw); }),
    process: vi.fn(async (f: TFile, fn: (s: string) => string) => { const raw = fn(disk.files.get(f.path)!); disk.files.set(f.path, raw); f.stat.mtime++; f.stat.size = new TextEncoder().encode(raw).length; return raw; }),
  };
  const app = { vault, workspace: { iterateAllLeaves: (f: (l: unknown) => void) => leaves.forEach(f) },
    metadataCache: { getFirstLinkpathDest: (path: string) => vault.getFileByPath(path) } } as unknown as App;
  const storage = new StudioStorage(disk.adapter, ".custom", "ai-knowledge-hub"), operations = new StudioOperations(), notes = studioNotePort(app);
  const targets = markdownTargetPort(app), journal = new MarkdownCreateJournal(storage), creator = new StudioMarkdownCreate(journal, targets, notes, operations);
  const writer = new StudioApply(new StudioJournal(storage), notes, operations), complete = vi.fn(async () => "---\nid: model\n---\n53 kg.");
  const runner = new RecipeRunner({ notes, inventory: () => paths, complete, settings: {
    get: () => ({ provider: "ollama", model: "synthetic", baseUrl: "http://127.0.0.1:1234/v1", apiKey: "", temperature: .2, topK: 5 }), update: async x => x, subscribe: () => () => {} } }, writer, creator);
  const generate = async (append = false) => {
    const recipe = append ? { ...BUILTIN_RECIPES[0], output: { format: "markdown" as const, action: "append" as const } } : BUILTIN_RECIPES[0];
    return runner.generate(await runner.prepare(recipe, recipe.parameters, { paths }, 32768));
  };
  const plan = async (source = false, selected = paths) => runner.reviewWrite(runner.review!, source ? "source" : "new-note", selected.map(path => ({ path, target: source ? path : suggestedTarget(path, targets.paths()) })));
  const editor = (path: string, raw = disk.files.get(path)!) => {
    const view = Object.assign(new MarkdownView({} as never), { file: vault.getFileByPath(path), getViewData: () => raw, getViewType: () => "markdown" });
    leaves.push({ view, getViewState: () => ({ state: { file: path } }) }); return view;
  };
  return { ...disk, objects, paths, originals, add, addFolder, leaves, vault, app, operations, notes, targets, journal, creator, writer, runner, complete, generate, plan, editor,
    restart: () => new StudioMarkdownCreate(new MarkdownCreateJournal(storage), targets, notes, new StudioOperations()) };
}

describe("immutable Markdown destination and create-only operations", () => {
  it("creates only selected rows next to each source, exact preview bytes, no copied properties or model retries", async () => {
    const f = fixture(3), review = await f.generate(); const calls = f.complete.mock.calls.length;
    f.editor(f.paths[0]); const plan = await f.plan(false, [f.paths[0], f.paths[2]]);
    expect(Object.isFrozen(plan.rows[0])).toBe(true);
    for (const row of plan.rows) {
      expect(row.output).toBe(f.runner.previewOutput(review.rows.find(x => x.path === row.source.path)!, "new-note", row.target));
      expect(row.output).toBe(`Source / Источник: [[${row.source.path}]]\n\n53 kg.`);
    }
    const result = await f.runner.confirmWrite(plan);
    expect(result.map(x => x.outcome)).toEqual(["created", "skipped", "created"]);
    expect(f.paths.map(p => f.files.get(p))).toEqual(f.originals); expect(f.vault.process).not.toHaveBeenCalled();
    for (const row of plan.rows) expect(f.files.get(row.target)).toBe(row.output);
    expect(await f.runner.confirmWrite(plan)).toBe(result); expect(f.vault.create).toHaveBeenCalledTimes(2); expect(f.complete).toHaveBeenCalledTimes(calls);
    const writes = vi.mocked(f.adapter.write).mock.calls.length;
    expect((await f.restart().history()).map(x => x.state)).toEqual(["created", "created"]); expect(vi.mocked(f.adapter.write).mock.calls).toHaveLength(writes);
  });
  it("preserves native UTF-8 BOM/CRLF bytes with normalized saved buffers and guarded Apply/Undo", async () => {
    const f = fixture(1), path = f.paths[0], raw = '\uFEFF---\r\n# literal\r\nid: source\r\n---\r\nAbout 53 kg.\r\n';
    f.add(path, raw); f.vault.read.mockImplementation(async file => f.files.get(file.path)!.replace(/^\uFEFF/u, ""));
    Object.assign(f.vault, { readBinary: vi.fn(async (file: TFile) => new TextEncoder().encode(f.files.get(file.path)).buffer) });
    f.editor(path, raw.slice(1).replace(/\r\n/gu, "\n"));
    const review = await f.generate(); expect(review.rows[0].before).toBe(raw);
    expect(review.rows[0].after).toBe('\uFEFF---\r\n# literal\r\nid: source\r\n---\r\n53 kg.');
    await expect(f.plan()).resolves.toBeDefined(); f.leaves.length = 0;
    const plan = await f.plan(true); await f.runner.confirmWrite(plan, true); expect(f.files.get(path)).toBe(plan.rows[0].output);
    const history = await f.writer.history(); expect(history[0].canUndo).toBe(true);
    await f.writer.executeUndo(await f.writer.reviewUndo(history[0].entry.id, 0, "undo")); expect(f.files.get(path)).toBe(raw);
    f.vault.read.mockResolvedValue("different encoding"); expect(await f.notes.read(path)).toBeNull();
  });
  it("supports append as source body + separator + response in a separate note", async () => {
    const f = fixture(1); await f.generate(true); const p = await f.plan();
    expect(p.rows[0].output).toBe(`Source / Источник: [[${f.paths[0]}]]\n\nAbout 53 kg by Tuesday.\n\n53 kg.`);
    await f.runner.confirmWrite(p); expect(f.files.get(f.paths[0])).toBe(f.originals[0]);
  });
  it("requires acknowledgement tied to the source plan, preserves YAML and old Undo", async () => {
    const f = fixture(1); await f.generate(); const p = await f.plan(true);
    expect(p.requiresAcknowledgement).toBe(true); expect(() => f.runner.confirmWrite(p)).toThrow("acknowledgement");
    expect(f.vault.process).not.toHaveBeenCalled(); await f.runner.confirmWrite(p, true);
    expect(f.files.get(f.paths[0])).toBe(p.rows[0].output); expect(f.files.get(f.paths[0])).toMatch(/^---\n# retained\nid: "stable"\naliases: \[One\]\n---\n/u);
    const rows = await f.writer.history(); expect(rows[0].entry.record?.schemaVersion).toBe(2); expect(rows[0].canUndo).toBe(true);
    await f.writer.executeUndo(await f.writer.reviewUndo(rows[0].entry.id, 0, "undo")); expect(f.files.get(f.paths[0])).toBe(f.originals[0]);
  });
  it("invalidates old consent on selection/name/destination changes, without model calls", async () => {
    const f = fixture(); await f.generate(); const a = await f.plan(); f.runner.discardWritePlan();
    expect(() => f.runner.confirmWrite(a)).toThrow("stale");
    const b = await f.plan(true, [f.paths[0]]), c = await f.plan(false, [f.paths[1]]);
    expect(() => f.runner.confirmWrite(b, true)).toThrow("stale"); await f.runner.confirmWrite(c);
    expect(f.complete).toHaveBeenCalledTimes(2); expect(f.vault.create).toHaveBeenCalledTimes(1);
  });
  it("invalidates a plan when local choices change during asynchronous preflight", async () => {
    const f = fixture(1); await f.generate();
    const check = f.targets.check.bind(f.targets); f.targets.check = async (...args) => { await check(...args); f.runner.discardWritePlan(); };
    await expect(f.plan()).rejects.toThrow("stale"); expect(f.runner.writePlan).toBeUndefined();
    f.targets.check = check; const plan = await f.plan();
    f.targets.check = async (...args) => { await check(...args); f.runner.discardWritePlan(); };
    expect((await f.runner.confirmWrite(plan))[0]).toMatchObject({ outcome: "conflict", reason: "stale" });
    expect(f.vault.create).not.toHaveBeenCalled(); expect(await f.journal.entries()).toEqual([]);
  });
  it("blocks unsafe buffers but permits open saved source and retains the Review for a fresh plan", async () => {
    const f = fixture(1); await f.generate(); const review = f.runner.review; f.editor(f.paths[0], "unsaved");
    const notifications: boolean[] = []; f.runner.subscribe(() => notifications.push(f.runner.canApply));
    await expect(f.plan()).rejects.toThrow("unsaved"); expect(f.runner.review).toBe(review); expect(await f.journal.entries()).toEqual([]);
    expect(notifications.at(-1)).toBe(true);
    f.leaves.length = 0; f.editor(f.paths[0]); await f.runner.confirmWrite(await f.plan()); expect(f.complete).toHaveBeenCalledTimes(1);
  });
  it.each(["changed", "deleted", "renamed", "replaced", "unsafe"])("rechecks %s sources after confirmation preparation", async mode => {
    const f = fixture(1); await f.generate(); const p = await f.plan(), file = f.vault.getFileByPath(f.paths[0])!;
    if (mode === "changed") { f.files.set(file.path, "Other"); file.stat.mtime++; }
    if (mode === "deleted") { f.objects.delete(file.path); f.files.delete(file.path); }
    if (mode === "renamed") file.path = "renamed.md";
    if (mode === "replaced") f.add(file.path, f.originals[0]);
    if (mode === "unsafe") f.editor(file.path, "unsafe");
    expect((await f.runner.confirmWrite(p))[0].outcome).toBe("conflict"); expect(f.vault.create).not.toHaveBeenCalled(); expect(await f.journal.entries()).toEqual([]);
  });
  it.each(["Folder0/same.md", "Folder0/../evil.md", "Other/new.md", "Folder0/.hidden.md", "Folder0/new.txt", ".custom/new.md", "Folder0/CON.md"])("rejects unsafe or nonadjacent target %s", async target => {
    const f = fixture(1); await f.generate();
    await expect(f.runner.reviewWrite(f.runner.review!, "new-note", [{ path: f.paths[0], target }])).rejects.toThrow(); expect(f.vault.create).not.toHaveBeenCalled();
  });
  it("checks case/Unicode/disk-only collisions and occupied folders, never suffixes after consent", async () => {
    const f = fixture(1); await f.generate(); f.add("Folder0/SAME — STUDIO.md", "keep");
    expect(suggestedTarget(f.paths[0], f.targets.paths())).toBe("Folder0/same — Studio 2.md");
    const plan = await f.plan(), target = plan.rows[0].target; f.files.set(target.toUpperCase().replace("FOLDER0", "Folder0"), "external");
    expect((await f.runner.confirmWrite(plan))[0].outcome).toBe("conflict"); expect(f.vault.create).not.toHaveBeenCalled();
    await expect(f.targets.check(f.paths[0], "Folder0/Ａ.md")).resolves.toBeUndefined(); f.add("Folder0/A.md", "keep");
    await expect(f.targets.check(f.paths[0], "Folder0/Ａ.md")).rejects.toThrow("target");
    f.addFolder("Folder0/occupied.md"); await expect(f.targets.check(f.paths[0], "Folder0/occupied.md")).rejects.toThrow("target");
  });
  it("rejects duplicate targets in a batch and changing paths after the plan was frozen", async () => {
    const f = fixture(); await f.generate(); await expect(f.runner.reviewWrite(f.runner.review!, "new-note", f.paths.map(path => ({ path, target: "Folder0/result.md" })))).rejects.toThrow("scope");
    const p = await f.plan(); expect(() => { (p.rows[0] as { target: string }).target = "evil.md"; }).toThrow();
  });
  it.each(["intent", "create", "readback", "receipt"])("stops the batch on %s failure and never automatically retries after restart", async phase => {
    const f = fixture(); await f.generate(); const p = await f.plan();
    if (phase === "intent" || phase === "receipt") {
      const write = vi.mocked(f.adapter.write).getMockImplementation()!;
      vi.mocked(f.adapter.write).mockImplementation(async (path, raw) => { if (path.endsWith(phase === "intent" ? "/intent.json" : "0-created.json")) throw Error("disk"); return write(path, raw); });
    }
    if (phase === "create") f.vault.create.mockRejectedValueOnce(Error("disk"));
    if (phase === "readback") vi.spyOn(f.targets, "read").mockRejectedValueOnce(Error("readback"));
    const result = await f.runner.confirmWrite(p); expect(result[0].outcome).toBe(phase === "intent" ? "failed" : "unconfirmed");
    expect(result[1].outcome).toBe(phase === "intent" ? "failed" : "skipped"); expect(f.vault.create.mock.calls.length).toBeLessThanOrEqual(1);
    const calls = f.vault.create.mock.calls.length; await f.restart().history(); await f.runner.confirmWrite(p); expect(f.vault.create).toHaveBeenCalledTimes(calls);
    expect(f.paths.map(path => f.files.get(path))).toEqual(f.originals);
  });
  it("records manual observation after a receipt failure, with no create, rewrite or delete", async () => {
    const f = fixture(1); await f.generate(); const p = await f.plan();
    const write = vi.mocked(f.adapter.write).getMockImplementation()!;
    vi.mocked(f.adapter.write).mockImplementationOnce(async (...args) => write(...args));
    const mark = vi.spyOn(f.journal, "mark"); mark.mockImplementation(async (...args) => { if (args[2] === "created") throw Error("receipt"); return MarkdownCreateJournal.prototype.mark.call(f.journal, ...args); });
    await f.runner.confirmWrite(p); const restarted = f.restart(), history = await restarted.history(); expect(history[0]).toMatchObject({ state: "unconfirmed", observed: "created" });
    const ticket = await restarted.reviewRecovery(p.id, 0); await restarted.executeRecovery(ticket);
    expect((await restarted.history())[0].state).toBe("created"); expect(f.vault.create).toHaveBeenCalledTimes(1); expect(f.vault.process).not.toHaveBeenCalled();
    expect(() => restarted.executeRecovery(ticket)).toThrow("used");
  });
  it("cancellation after dispatch observes the current file and stops subsequent writes; gate blocks other owners", async () => {
    const f = fixture(); await f.generate(); const p = await f.plan();
    const create = f.vault.create.getMockImplementation()!;
    f.vault.create.mockImplementationOnce(async (path, raw) => {
      await expect(f.operations.run({}, async () => {})).rejects.toThrow("busy");
      expect(() => f.runner.confirmWrite(p)).toThrow("stale"); f.runner.cancel(); return create(path, raw);
    });
    expect((await f.runner.confirmWrite(p)).map(r => r.outcome)).toEqual(["created", "skipped"]); expect(f.vault.create).toHaveBeenCalledTimes(1);
    expect((await f.creator.history())[1]).toMatchObject({ state: "unconfirmed", observed: "not-created" });
  });
  it("read-only preview and destination planning do not write journals or notes", async () => {
    const f = fixture(1), review = await f.generate(); const writes = vi.mocked(f.adapter.write).mock.calls.length;
    f.runner.previewOutput(review.rows[0], "new-note", suggestedTarget(f.paths[0], [])); await f.plan(); await f.plan(true); f.runner.discardWritePlan();
    expect(vi.mocked(f.adapter.write).mock.calls).toHaveLength(writes); expect(f.vault.create).not.toHaveBeenCalled(); expect(f.vault.process).not.toHaveBeenCalled(); expect(f.complete).toHaveBeenCalledTimes(1);
  });
  it("stops before dispatch when cancelled during admission, keeping all note bytes", async () => {
    const f = fixture(); await f.generate(); const p = await f.plan(), check = f.targets.check.bind(f.targets);
    vi.spyOn(f.targets, "check").mockImplementationOnce(async (...args) => { f.runner.cancel(); return check(...args); });
    expect((await f.runner.confirmWrite(p)).every(r => r.outcome === "skipped")).toBe(true);
    expect(f.vault.create).not.toHaveBeenCalled(); expect(await f.journal.entries()).toEqual([]);
  });
  it("refuses a late target collision without overwriting or choosing another name", async () => {
    const f = fixture(1); await f.generate(); const p = await f.plan(), create = f.targets.create.bind(f.targets);
    vi.spyOn(f.targets, "create").mockImplementationOnce(async (...args) => { f.add(args[1], "external content"); return create(...args); });
    expect((await f.runner.confirmWrite(p))[0].outcome).toBe("unconfirmed");
    expect(f.files.get(p.rows[0].target)).toBe("external content"); expect(f.vault.create).not.toHaveBeenCalled();
  });
  it("rechecks the saved source after intent and does not create from a stale snapshot", async () => {
    const f = fixture(1); await f.generate(); const p = await f.plan(), mark = f.journal.mark.bind(f.journal);
    vi.spyOn(f.journal, "mark").mockImplementation(async (...args) => {
      await mark(...args); if (args[2] === "dispatch") { f.files.set(f.paths[0], "Changed after intent"); f.vault.getFileByPath(f.paths[0])!.stat.mtime++; }
    });
    expect((await f.runner.confirmWrite(p))[0].outcome).toBe("conflict"); expect(f.vault.create).not.toHaveBeenCalled();
  });
  it("treats damaged intent/receipt evidence as damaged and blocks subsequent creates", async () => {
    const f = fixture(1); await f.generate(); const p = await f.plan(); await f.runner.confirmWrite(p);
    f.files.set(`${f.journal.root}/${p.id}/0-created.json`, "{}");
    expect((await f.restart().history())[0].state).toBe("damaged");
    await f.generate(); const next = await f.plan(); expect((await f.runner.confirmWrite(next))[0].reason).toBe("storage"); expect(f.vault.create).toHaveBeenCalledTimes(1);
  });
  it("refuses stale manual recovery and never deletes an edited derivative", async () => {
    const f = fixture(1); await f.generate(); const p = await f.plan();
    const originalMark = f.journal.mark.bind(f.journal);
    vi.spyOn(f.journal, "mark").mockImplementation(async (...args) => { if (args[2] === "created") throw Error("receipt"); return originalMark(...args); });
    await f.runner.confirmWrite(p); const recovered = f.restart(), ticket = await recovered.reviewRecovery(p.id, 0);
    f.files.set(p.rows[0].target, "User edit");
    await expect(recovered.executeRecovery(ticket)).rejects.toThrow("stale"); expect(f.files.get(p.rows[0].target)).toBe("User edit"); expect(f.vault.create).toHaveBeenCalledTimes(1);
  });
  it("supports the existing twenty-result limit and rejects twenty-one without generation", async () => {
    const f = fixture(20); await f.generate(); await f.runner.confirmWrite(await f.plan()); expect(f.vault.create).toHaveBeenCalledTimes(20);
    const tooMany = fixture(21); await expect(tooMany.generate()).rejects.toThrow("scope"); expect(tooMany.complete).not.toHaveBeenCalled();
  });
});
