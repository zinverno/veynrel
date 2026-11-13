import { DEFAULT_GENERATION_OPTIONS, generateRecall } from "./authoring";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TFile } from "obsidian";
const editorWrite = vi.hoisted(() => vi.fn());
vi.mock("../recallEditor", () => ({ insertRecallInEditor: editorWrite }));
const host = vi.hoisted(() => ({ TFile: class {}, MarkdownView: class { getMode() { return "source"; } } }));
vi.mock("obsidian", () => ({ ...host, getLanguage: () => "en", normalizePath: (path: string) => path }));
import { MAX_FLASHCARD_INPUT_LENGTH, RecallAuthoringAdapter } from "../recallAuthoring";
import { setLanguage, t } from "../i18n";
import { productFixture, cardsPath } from "./product/testSupport";
import { gate } from "./testSupport";
import { RecallHealthAdapter } from "./product/recallHealthAdapter";
import { HealthPluginController } from "../health/obsidian/healthPluginController";
import { preferencesFixture } from "../health/obsidian/testSupport";
import type { LanguageModelSettingsSnapshot } from "../deep/product/languageModelSettingsPort";

const main = ts.createSourceFile("main.ts", readFileSync("main.ts", "utf8"), ts.ScriptTarget.Latest, true);
const plugin = main.statements.find((node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === "AIHubPlugin")!;
const buildMethod = plugin.members.find((node) => ts.isMethodDeclaration(node) && node.name.getText(main) === "buildFlashcardsContent")!.getText(main);
const helpers = "";

function fixture(raw?: string, body = "# Source\nPRIVATE_SELECTED_BODY") {
  const f = productFixture(raw);
  Object.setPrototypeOf(f.note, host.TFile.prototype);
  f.files.set(f.note.path, body); Object.assign(f.note.stat, { size: body.length });
  f.vault.read.mockImplementation(async () => f.files.get(f.note.path)!);
  f.vault.getFileByPath.mockImplementation((path) => path === f.note.path && f.files.has(path) ? f.note : null);
  f.vault.getAbstractFileByPath.mockImplementation((path) => f.vault.getFileByPath(path));
  const processNote = vi.fn(async (file: TFile, transform: (content: string) => string) => {
    const content = f.files.get(file.path); if (content === undefined) throw new Error("PRIVATE missing");
    const next = transform(content); f.files.set(file.path, next); file.stat.mtime++; file.stat.size = next.length; return next;
  });
  Object.assign(f.vault, { process: processNote });
  let current: typeof f.note | null = f.note, open = true;
  const view = Object.assign(new host.MarkdownView(), { file: f.note });
  const events = new Map<string, () => void>();
  Object.assign(f.workspace, { getActiveFile: () => current, getLeavesOfType: () => open ? [{ view }] : [],
    on: (event: string, callback: () => void) => { events.set(event, callback); return { event }; }, offref: vi.fn() });
  const settings: LanguageModelSettingsSnapshot = { provider: "ollama", apiKey: "PRIVATE_KEY", model: "synthetic",
    baseUrl: "http://127.0.0.1:54329/v1", temperature: 0.5, topK: 5 };
  let changed!: () => void;
  const settingsPort = { get: () => ({ ...settings }), update: vi.fn(), subscribe: (listener: () => void) => { changed = listener; return vi.fn(); } };
  const provider = vi.fn(async (_settings: unknown, _prompt: string, _content: string) => "Question::Answer\nSecond::Answer two");
  // Execute the authoritative producer and cleanup, replacing only transport.
  const producer = runInNewContext(ts.transpileModule(`${helpers}\nclass Producer { ${buildMethod} }\nnew Producer()`,
    { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, { callOpenRouter: provider, DEFAULT_GENERATION_OPTIONS, generateRecall, MAX_FLASHCARD_INPUT_LENGTH, tr: t }) as {
    buildFlashcardsContent(content: string, prompt: string, settings: LanguageModelSettingsSnapshot, options?: import("./authoring").RecallGenerationOptions): Promise<{ newContent: string; cardCount: number }>;
  };
  const author = new RecallAuthoringAdapter(f.app, settingsPort, f.product,
    (content, config, options) => producer.buildFlashcardsContent(content, t("@flashcards_prompt"), config, options));
  const health = new HealthPluginController(f.app, "ai-knowledge-hub", preferencesFixture({ onboardingCompleted: true }).preferences,
    undefined, new RecallHealthAdapter(f.product));
  return { ...f, author, provider, settings, health, processNote, view, changed: () => changed(),
    clearCurrent: () => { current = null; }, closeNote: () => { open = false; events.get("layout-change")?.(); },
    switchNote: () => {
      const other = Object.assign(new host.TFile(), { ...f.note, path: "B.md" });
      current = other; view.file = other; f.files.set(other.path, "UNRELATED_NOTE");
      const previous = f.vault.getFileByPath.getMockImplementation()!;
      f.vault.getFileByPath.mockImplementation((path) => path === other.path ? other : previous(path));
      events.get("file-open")?.();
    },
    generate: async () => { author.requestGeneration(); return author.generate(); } };
}
beforeEach(() => { setLanguage("en"); editorWrite.mockReset(); });

describe("native Recall authoring bridge", () => {
  it.each(["editor", "model", "unload", "rename"])("invalidates a closed-note write guard after %s changes", (change) => {
    const f = fixture();
    const guard = f.author.closedWriteGuard(f.note as TFile);
    expect(guard).not.toThrow();
    if (change === "editor") Object.assign(f.view, { editor: { getValue: () => f.files.get(f.note.path) } });
    if (change === "model") f.settings.model = "changed";
    if (change === "unload") f.author.dispose();
    if (change === "rename") f.note.path = "renamed.md";
    expect(guard).toThrow("note changed");
    expect(f.provider).not.toHaveBeenCalled();
    expect(f.processNote).not.toHaveBeenCalled();
  });

  it.each(["before-completion", "after-completion"])("never attributes a completed result to a different selected note (%s)", async (when) => {
    const f = fixture(), entered = gate(), hold = gate();
    f.provider.mockImplementationOnce(async () => { entered.release(); await hold.promise; return "Question::Answer"; });
    const pending = f.generate(); await entered.promise;
    if (when === "before-completion") f.switchNote();
    hold.release(); expect(await pending).toEqual({ status: "success", cardCount: 1 });
    if (when === "after-completion") f.switchNote();
    expect(f.author.getSnapshot()).toMatchObject({ state: "idle", sourcePath: "B.md", result: undefined });
    expect(f.files.get("B.md")).toBe("UNRELATED_NOTE");
  });

  it("keeps snapshots, confirmation, cancellation and unavailable setup completely passive", async () => {
    const f = fixture();
    expect(f.author.getSnapshot()).toMatchObject({ state: "idle", configured: true, sourcePath: "A.md" });
    f.author.requestGeneration(); expect(f.author.getSnapshot().state).toBe("confirming");
    f.author.cancelConfirmation(); await f.author.generate();
    f.settings.model = ""; f.changed(); f.author.requestGeneration();
    expect(await f.author.generateForNote(f.note as TFile)).toEqual({ status: "error", reason: "unconfigured" });
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.provider).not.toHaveBeenCalled();
    expect(f.processNote).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled(); expect(f.factory).not.toHaveBeenCalled();
    expect(JSON.stringify(f.author.getSnapshot())).not.toMatch(/PRIVATE|127\.0\.0|prompt|Authorization/u);
  });

  it("uses only the selected bounded content, original prompt, one generator read and one targeted read; updates Health", async () => {
    const f = fixture(undefined, "# Source\n" + "X".repeat(100) + "PRIVATE_TAIL");
    await f.health.getHealthService();
    const healthBefore = f.health.getState().snapshot!;
    f.files.set("Private/Config/plugins/ai-knowledge-hub/health/sentinel.json", "EXACT_HEALTH_BYTES");
    f.files.set("Other.md", "UNRELATED_NOTE");
    const states: string[] = []; f.author.subscribe(() => states.push(f.author.getSnapshot().state));
    expect(await f.generate()).toEqual({ status: "success", cardCount: 2 });
    expect(f.provider).toHaveBeenCalledExactlyOnceWith(f.settings, expect.stringContaining(t("@flashcards_prompt")), f.provider.mock.calls[0][2], { requireFinishReason: true });
    expect(f.provider.mock.calls[0][2]).toBe("# Source\n" + "X".repeat(100) + "PRIVATE_TAIL");
    expect(f.provider.mock.calls[0][2]).not.toMatch(/UNRELATED_NOTE|PRIVATE_KEY|EXACT_HEALTH_BYTES/u);
    expect(f.files.get("A.md")).toContain("PRIVATE_TAIL\n\n## Flashcards\n#flashcards\n\nQuestion::Answer\nSecond::Answer two\n");
    expect(f.vault.read).toHaveBeenCalledTimes(3); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
    expect(f.processNote).toHaveBeenCalledTimes(1); expect(f.factory).toHaveBeenCalledTimes(1);
    expect(f.product.getSnapshot()).toMatchObject({ firstRun: false, inventoryEstablished: false, summary: { active: 2, due: 2, new: 2 } });
    expect(states).toContain("generating"); expect(states).toContain("ingesting"); expect(states.at(-1)).toBe("success");
    const after = f.health.getState().snapshot!;
    expect(after.dimensions.recall.state).toBe("review-recommended");
    for (const dimension of ["structure", "connections", "knowledge"] as const) expect(after.dimensions[dimension]).toEqual(healthBefore.dimensions[dimension]);
    expect(after.lastDeepScan).toBeUndefined(); expect(after.lastSemanticScan).toBeUndefined(); expect(after.lastLocalScan).toBeUndefined();
    expect(f.files.get("Private/Config/plugins/ai-knowledge-hub/health/sentinel.json")).toBe("EXACT_HEALTH_BYTES");
    expect(f.adapter.write.mock.calls.map(([path]) => path)).toEqual([cardsPath]);
    await f.product.startSession(); expect(f.product.getSnapshot().session?.card).toBeDefined();
    f.author.requestGeneration(); expect(f.author.getSnapshot().state).toBe("success");
  });

  it.each(["edit", "rename", "delete", "replace"])("preserves a source %s while the provider is pending, without ingestion", async (change) => {
    const f = fixture(), entered = gate(), hold = gate();
    f.provider.mockImplementationOnce(async () => { entered.release(); await hold.promise; return "Generated::Answer"; });
    const pending = f.generate(); await entered.promise;
    if (change === "edit") f.files.set("A.md", "NEW USER EDIT");
    if (change === "rename") { f.files.set("Renamed.md", f.files.get("A.md")!); f.files.delete("A.md"); f.note.path = "Renamed.md"; }
    if (change === "delete") f.files.delete("A.md");
    if (change === "replace") f.vault.getAbstractFileByPath.mockReturnValue(Object.assign(new host.TFile(), f.note));
    const before = [...f.files]; hold.release();
    expect(await pending).toEqual({ status: "error", reason: "conflict" }); expect([...f.files]).toEqual(before);
    expect(f.factory).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
    expect(f.vault.read).toHaveBeenCalledTimes(change === "edit" || change === "replace" ? 2 : 1);
  });

  it.each(["provider", "invalid-output", "save"])("does not ingest or reveal raw text after %s failure", async (failure) => {
    const f = fixture();
    if (failure === "provider") f.provider.mockRejectedValueOnce(new Error("PRIVATE_PROVIDER_BODY PRIVATE_KEY"));
    if (failure === "invalid-output") f.provider.mockResolvedValueOnce("PRIVATE_PROVIDER_BODY with no cards");
    if (failure === "save") f.processNote.mockRejectedValueOnce(new Error("PRIVATE_DISK_ERROR"));
    const before = [...f.files];
    expect(await f.generate()).toEqual({ status: "error", reason: failure === "save" ? "markdown-save-failed" : failure === "invalid-output" ? "invalid-output" : "generation-failed" });
    expect([...f.files]).toEqual(before); expect(f.factory).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
    expect(JSON.stringify(f.author.getSnapshot())).not.toMatch(/PRIVATE|stack|Authorization/u);
    if (failure !== "save") expect(f.processNote).not.toHaveBeenCalled();
  });

  it("retains Markdown and old published schedules on Recall persistence failure, recoverable through explicit Refresh", async () => {
    const f = fixture(undefined, "Source material.\n\n## Flashcards\nOld::Answer"); await f.product.initialize(); await f.product.refreshCards();
    const cards = f.service().listCards(), bytes = f.files.get(cardsPath);
    f.adapter.write.mockRejectedValueOnce(new Error("PRIVATE_RECALL_FAILURE"));
    expect(await f.generate()).toEqual({ status: "partial", cardCount: 2, reason: "recall-update-failed", needsRecovery: false });
    expect(f.files.get("A.md")).toContain("Question::Answer"); expect(f.files.get(cardsPath)).toBe(bytes);
    expect(f.service().listCards()).toEqual(cards); expect(f.product.getSnapshot().loadState).toBe("unavailable");
    await f.product.retryLoad(); await f.product.refreshCards();
    expect(f.product.getSnapshot()).toMatchObject({ inventoryEstablished: true, summary: { active: 3 } });
  });

  it.each(["{corrupt", '{"version":99}'])("allows explicit Markdown generation but never overwrites blocked Recall %s", async (raw) => {
    const f = fixture(raw);
    expect(await f.generate()).toEqual({ status: "partial", cardCount: 2, reason: "recall-update-failed", needsRecovery: true });
    expect(f.files.get("A.md")).toContain("Question::Answer"); expect(f.files.get(cardsPath)).toBe(raw);
    expect(f.adapter.write).not.toHaveBeenCalled(); expect(f.vault.read).toHaveBeenCalledTimes(2);
  });

  it("preserves review usability during generation and merges duplicate/recurring identities with existing schedules", async () => {
    const f = fixture(undefined, "Source material.\n\n## Flashcards\nQuestion::Answer"); await f.product.initialize(); await f.product.refreshCards();
    const original = f.service().listCards()[0], entered = gate(), hold = gate();
    f.provider.mockImplementationOnce(async () => { entered.release(); await hold.promise; return "Question::Answer\nNew::B"; });
    const pending = f.generate(); await entered.promise;
    await f.product.startSession(); f.time(200); f.product.revealAnswer(); await f.product.rate("easy"); f.product.endSession();
    const reviewed = f.service().getCard(original.id)!; expect(reviewed.schedule.reviewCount).toBe(1);
    hold.release(); expect(await pending).toEqual({ status: "success", cardCount: 2 });
    expect(f.service().listCards()).toHaveLength(2); expect(f.service().getCard(original.id)?.schedule).toEqual(reviewed.schedule);
    expect(f.files.get("A.md")!.match(/## Flashcards/gu)).toHaveLength(1);
    f.files.set("A.md", "No cards"); f.time(300); await f.product.refreshCards();
    expect(f.service().getCard(original.id)?.state).toBe("retired");
    f.provider.mockResolvedValue("Question::Answer"); f.time(400); await f.generate();
    expect(f.service().getCard(original.id)).toMatchObject({ state: "active", firstSeenAt: original.firstSeenAt, schedule: reviewed.schedule });
    expect(f.product.getSnapshot().inventoryEstablished).toBe(true);
  });

  it("does not use a cached closed note, a different source after confirmation, or changed provider consent", async () => {
    const f = fixture(); f.author.requestGeneration(); f.closeNote();
    expect(f.author.getSnapshot()).toMatchObject({ state: "idle", sourcePath: undefined }); await f.author.generate();
    const g = fixture(); g.author.requestGeneration(); g.clearCurrent();
    expect(await g.author.generate()).toEqual({ status: "error", reason: "source-unavailable" });
    const h = fixture(); h.author.requestGeneration(); h.settings.provider = "custom";
    expect(await h.author.generate()).toEqual({ status: "error", reason: "unconfigured" });
    for (const item of [f, g, h]) { expect(item.vault.read).not.toHaveBeenCalled(); expect(item.provider).not.toHaveBeenCalled(); }
  });

  it("rejects unknown providers and oversized sources before any note read or model call", async () => {
    const f = fixture(); Object.assign(f.settings, { provider: "__proto__" });
    expect(f.author.getSnapshot().configured).toBe(false);
    expect(await f.author.generateForNote(f.note as TFile)).toEqual({ status: "error", reason: "unconfigured" });
    const g = fixture(); Object.assign(g.note.stat, { size: 2 * 1024 * 1024 + 1 });
    expect(await g.generate()).toEqual({ status: "error", reason: "source-unavailable" });
    for (const item of [f, g]) { expect(item.vault.read).not.toHaveBeenCalled(); expect(item.provider).not.toHaveBeenCalled(); }
  });

  it.each(["../Escape.md", "/absolute.md", "Private/Config/plugins/hidden.md", "Nested/.ai-backup-1/A.md", "A.canvas"])("rejects unsafe source %s before reads", async (path) => {
    const f = fixture(); f.note.path = path; f.files.set(path, "PRIVATE");
    expect(await f.author.generateForNote(f.note as TFile)).toEqual({ status: "error", reason: "source-unavailable" });
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.provider).not.toHaveBeenCalled(); expect(f.processNote).not.toHaveBeenCalled();
  });

  it("uses the active split editor's selection and inserts only into its history", async () => {
    const f = fixture(); const content = f.files.get("A.md")!;
    const firstEditor = { getValue: () => content, getSelection: () => "PRIVATE_SELECTED_BODY" };
    let secondContent = content;
    const secondEditor = { getValue: () => secondContent, getSelection: () => "# Source" };
    Object.assign(f.view, { editor: firstEditor });
    const second = Object.assign(new host.MarkdownView(), { file: f.note, editor: secondEditor, save: vi.fn(async () => {
      f.files.set("A.md", secondContent); Object.assign(f.note.stat, { size: secondContent.length, mtime: f.note.stat.mtime + 1 });
    }) });
    Object.assign(f.workspace, { activeEditor: { file: f.note, editor: secondEditor }, getLeavesOfType: () => [{ view: f.view }, { view: second }] });
    editorWrite.mockImplementation((editor: unknown, _original: string, replacement: string) => { expect(editor).toBe(secondEditor); secondContent = replacement; });
    expect(await f.generate()).toMatchObject({ status: "success" });
    expect(f.provider.mock.calls[0][2]).toBe("# Source"); expect(editorWrite).toHaveBeenCalledTimes(1);
    expect(f.processNote).not.toHaveBeenCalled(); expect(second.save).toHaveBeenCalledTimes(1);
  });

  it("activates the source editor before inserting into a reading view and persists the questions", async () => {
    const f = fixture(); const original = f.files.get("A.md")!;
    let content = original, mode = "preview";
    const editor = { getValue: () => content, getSelection: () => "" };
    const setState = vi.fn(async (state: { mode: string }) => { mode = state.mode; content = f.files.get("A.md")!; });
    Object.assign(f.view, { editor, getMode: () => mode, getState: () => ({ file: "A.md", mode, source: true }), setState,
      save: vi.fn(async () => { f.files.set("A.md", mode === "source" ? content : original); }) });
    editorWrite.mockImplementation((_editor: unknown, _original: string, replacement: string) => { content = replacement; });
    expect(await f.generate()).toEqual({ status: "success", cardCount: 2 });
    expect(f.files.get("A.md")).toContain("Question::Answer");
    expect(mode).toBe("source");
    expect(f.product.getSnapshot().summary?.active).toBe(2);
    expect(editorWrite).toHaveBeenCalledTimes(1);
  });

  it("does not claim saved questions when the editor save resolves without persisting them", async () => {
    const f = fixture(); const original = f.files.get("A.md")!; let content = original;
    Object.assign(f.view, { editor: { getValue: () => content, getSelection: () => "" }, save: vi.fn(async () => {}) });
    editorWrite.mockImplementation((_editor: unknown, _original: string, replacement: string) => { content = replacement; });
    expect(await f.generate()).toEqual({ status: "partial", cardCount: 2, reason: "editor-save-failed", needsRecovery: false });
    expect(f.files.get("A.md")).toBe(original);
    expect(f.factory).not.toHaveBeenCalled();
  });

  it.each(["source", "settings", "closed", "disposed"])("rechecks %s changes while activating a reading view", async (change) => {
    const f = fixture(); const original = f.files.get("A.md")!;
    Object.assign(f.view, {
      editor: { getValue: () => original, getSelection: () => "" }, getMode: () => "preview",
      getState: () => ({ file: "A.md", mode: "preview" }),
      setState: vi.fn(async () => {
        if (change === "source") f.files.set("A.md", "Manual edit");
        if (change === "settings") f.settings.model = "changed";
        if (change === "closed") f.closeNote();
        if (change === "disposed") f.author.dispose();
      }),
    });
    expect(await f.generate()).toEqual({ status: "error", reason: "conflict" });
    expect(f.files.get("A.md")).toBe(change === "source" ? "Manual edit" : original);
    expect(editorWrite).not.toHaveBeenCalled(); expect(f.processNote).not.toHaveBeenCalled();
  });

  it("reports inserted-but-unsaved editor output without retrying transport or writing Recall", async () => {
    const f = fixture(); let content = f.files.get("A.md")!;
    const editor = { getValue: () => content, getSelection: () => "" };
    Object.assign(f.view, { editor, save: vi.fn(async () => { throw new Error("disk full"); }) });
    editorWrite.mockImplementation((_editor: unknown, _original: string, replacement: string) => { content = replacement; });
    expect(await f.generate()).toEqual({ status: "partial", cardCount: 2, reason: "editor-save-failed", needsRecovery: false });
    expect(content).toContain("Question::Answer"); expect(f.provider).toHaveBeenCalledTimes(1);
    expect(f.processNote).not.toHaveBeenCalled(); expect(f.factory).not.toHaveBeenCalled();
  });

  it("blocks divergent split buffers before transport and after transport", async () => {
    for (const when of ["before", "after"]) {
      const f = fixture(), body = f.files.get("A.md")!, entered = gate(), hold = gate(); let other = body;
      const editor = { getValue: () => body, getSelection: () => "" };
      Object.assign(f.view, { editor }); const second = Object.assign(new host.MarkdownView(), { file: f.note,
        editor: { getValue: () => other, getSelection: () => "" } });
      Object.assign(f.workspace, { activeEditor: { editor, file: f.note }, getLeavesOfType: () => [{ view: f.view }, { view: second }] });
      if (when === "before") other = "unsaved";
      else f.provider.mockImplementationOnce(async () => { entered.release(); await hold.promise; return "Q::A"; });
      const pending = f.generate(); if (when === "after") { await entered.promise; other = "unsaved"; hold.release(); }
      expect(await pending).toEqual({ status: "error", reason: when === "before" ? "source-unsaved" : "conflict" });
      expect(editorWrite).not.toHaveBeenCalled(); expect(f.processNote).not.toHaveBeenCalled();
      expect(f.provider).toHaveBeenCalledTimes(when === "before" ? 0 : 1);
    }
  });

  it.each(["unload", "model"])("does not apply after %s during the final saved-source read", async change => {
    const f = fixture(), entered = gate(), hold = gate();
    f.vault.read.mockResolvedValueOnce("# Source\nPRIVATE_SELECTED_BODY").mockImplementationOnce(async () => {
      entered.release(); await hold.promise; return "# Source\nPRIVATE_SELECTED_BODY";
    });
    const pending = f.generate(); await entered.promise;
    if (change === "unload") f.author.dispose(); else f.settings.model = "changed";
    hold.release(); expect(await pending).toEqual({ status: "error", reason: "conflict" });
    expect(f.processNote).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
  });

  it.each(["unload", "model", "editor"])("does not apply closed-note authoring after %s while Vault.process waits", async change => {
    const f = fixture(), entered = gate(), hold = gate(), before = f.files.get("A.md");
    f.processNote.mockImplementationOnce(async (_file, transform) => {
      entered.release(); await hold.promise;
      const next = transform(before!); f.files.set("A.md", next); return next;
    });
    const pending = f.author.generateForNote(f.note as TFile); await entered.promise;
    if (change === "unload") f.author.dispose();
    if (change === "model") f.settings.model = "changed";
    if (change === "editor") Object.assign(f.view, { editor: { getValue: () => before } });
    hold.release(); expect(await pending).toEqual({ status: "error", reason: "conflict" });
    expect(f.files.get("A.md")).toBe(before);
    expect(f.provider).toHaveBeenCalledTimes(1); expect(f.adapter.write).not.toHaveBeenCalled();
  });

  it("single-flights product/command generation and does not write after disposal during the provider request", async () => {
    const f = fixture(), entered = gate(), hold = gate();
    f.provider.mockImplementationOnce(async () => { entered.release(); await hold.promise; return "Question::Answer"; });
    const pending = f.generate(); await entered.promise;
    expect(await f.author.generateForNote(f.note as TFile)).toBeUndefined(); f.author.dispose(); hold.release(); await pending;
    expect(f.provider).toHaveBeenCalledTimes(1); expect(f.processNote).not.toHaveBeenCalled(); expect(f.factory).not.toHaveBeenCalled();
  });
});
