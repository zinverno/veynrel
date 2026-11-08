import { DEFAULT_GENERATION_OPTIONS, generateRecall } from "./authoring";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { parseMarkdownFlashcards } from "./parser/markdownFlashcards";
import { RecallService } from "./services/recallService";
import { memoryStorage, signal } from "./testSupport";
import { MAX_FLASHCARD_INPUT_LENGTH } from "../recallAuthoring";
import { t, setLanguage } from "../i18n";

vi.mock("obsidian", () => ({ MarkdownView: class {}, TFile: class {}, normalizePath: (path: string) => path, getLanguage: () => "en" }));

const main = readFileSync("main.ts", "utf8");
const ast = ts.createSourceFile("main.ts", main, ts.ScriptTarget.Latest, true);
const plugin = ast.statements.find((node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === "AIHubPlugin")!;
function method(name: string): string {
  return plugin.members.find((node) => ts.isMethodDeclaration(node) && node.name.getText(ast) === name)!.getText(ast);
}

describe("Recall consumes the unchanged legacy flashcard producer", () => {
  it.each(["en", "ru"] as const)("executes the real producer with the native Recall prompt in %s and consumes the unchanged fixture", async (language) => {
    setLanguage(language);
    const prompt = t("@flashcards_prompt");
    expect(prompt).toContain("Veynrel Recall");
    expect(prompt).not.toMatch(/st3v3nmw|Spaced Repetition/iu);
    expect(prompt).toContain(language === "en" ? "ON THE SAME LINE" : "НА ОДНОЙ СТРОКЕ");
    expect(prompt).toContain(language === "en" ? "are FORBIDDEN" : "писать ЗАПРЕЩЕНО");
    // Extract unchanged source, mock only the LLM transport. No import of the host/plugin startup is needed.
    const helpers = "";
    const code = `${helpers}\nclass Producer { ${method("buildFlashcardsContent")} }\nnew Producer()`;
    const callOpenRouter = vi.fn(async () => "What is X::Y\nWhy Z::Because Q");
    const producer = runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText,
      { callOpenRouter, DEFAULT_GENERATION_OPTIONS, generateRecall, MAX_FLASHCARD_INPUT_LENGTH, tr: (value: string) => value }) as { buildFlashcardsContent(content: string, prompt: string): Promise<{ newContent: string; cardCount: number }> };
    const body = "# Example note\n\nThis body is preserved by the legacy generator. Prose::not a card\n";
    const generated = await producer.buildFlashcardsContent(body, prompt);
    expect(generated).toEqual({ newContent: readFileSync("tests/fixtures/recall-generated.md", "utf8"), cardCount: 2 });
    expect(callOpenRouter).toHaveBeenCalledExactlyOnceWith(undefined, expect.stringContaining(prompt), body, { requireFinishReason: true });
    const extracted = await parseMarkdownFlashcards("Example.md", generated.newContent);
    expect(extracted.cards.map(({ question, answer }) => [question, answer])).toEqual([["What is X", "Y"], ["Why Z", "Because Q"]]);
    const service = new RecallService(memoryStorage(), {
      capture: async () => ({ ...extracted, revision: "fixture", coverage: { notesSeen: 1, notesRead: 1, noteListComplete: true } }),
      captureRevision: async () => "fixture",
      captureNote: async () => ({ cards: extracted.cards, isCurrent: () => true }),
    }, () => 100);
    await service.initialize(); await service.scan(signal());
    expect(service.listCards({ state: "active" })).toHaveLength(2);
  });

  it("protects the existing command, batch append action, context menu and prompt contract", () => {
    expect(method("onload")).toMatch(/id: "ai-flashcards-note",[\s\S]*?this\.generateFlashcardsForNote\(view\.file\)/u);
    const menu = plugin.members.find((node) => ts.isMethodDeclaration(node) && node.getText(ast).includes('.setTitle(tr("Флешкарты"))'))!.getText(ast);
    expect(menu).toMatch(/\.setTitle\(tr\("Флешкарты"\)\)[\s\S]*?this\.generateFlashcardsForNote\(file\)/u);
    expect(method("runBatchProcessing")).toMatch(/if \(append\)[\s\S]*?this\.buildFlashcardsContent\(content, generationPrompt, generationSettings\)/u);
    expect(readFileSync("constants.ts", "utf8")).toMatch(/title: "Флешкарты",[\s\S]*?prompt: "@flashcards_prompt",\s*append: true/u);
    expect(main).toContain("this.plugin.runBatchProcessing(files, prompt, append)");
    expect(method("generateFlashcardsForNote")).toContain('this.recallAuthoring?.generateForNote(file)');
    expect(method("onload")).toContain('this.buildFlashcardsContent(content, prompt ?? tr("@flashcards_prompt")');
    expect(method("runBatchProcessing")).toContain('this.recallAuthoring?.ingestNote(path)');
    expect(readFileSync("i18n.ts", "utf8")).toContain('question text::answer text');
    expect(main).not.toMatch(/from ["'][^"']*recall\//iu);
  });

  it("batch imports only successfully modified unique paths after all Markdown writes, retaining backups/report behavior", async () => {
    const files = ["A.md", "Failed.md", "B.md", "Opened.md", "LateOpened.md", "Unsaved.md"].map((path) => ({ path, name: path }));
    const order: string[] = [], reports: string[] = [];
    let lateOpened = false;
    const backupAndReplaceNote = vi.fn(async (_vault: unknown, file: { path: string }, _path: string, _content: string, _next: string, _backup: string, guard: () => void) => {
      guard(); order.push(`write:${file.path}`);
    });
    const build = vi.fn(async (content: string) => {
      if (content === "Failed.md") throw new Error("PRIVATE_PROVIDER_BODY");
      if (content === "LateOpened.md") lateOpened = true;
      return { newContent: "cards", cardCount: 1 };
    });
    const ingestNote = vi.fn(async (path: string) => { order.push(`ingest:${path}`); return path === "B.md" ? "failed" : "updated"; });
    class BatchProgressModal { isCancelled = false; open() {} close() {} logPending() {} logSuccess() {} update() {} logError() {} }
    const code = `class Producer { ${method("runBatchProcessing")} }\nnew Producer()`;
    const producer = runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText,
      { backupAndReplaceNote, resolveFlashcardNote: (_app: unknown, path: string) => files.find((file) => file.path === path),
        normalizePath: (path: string) => path, Notice: class {}, BatchProgressModal, BATCH_DELAY_MS: 0,
        window: { crypto: { randomUUID: () => "fixture" }, setTimeout: (callback: () => void) => { callback(); } },
        tr: (key: string, values: unknown) => `${key} ${JSON.stringify(values ?? {})}` }) as {
        app: unknown; settings: object; recallAuthoring: unknown; buildFlashcardsContent: typeof build; runBatchProcessing(files: unknown[], query: string, append: boolean): Promise<void>;
      };
    producer.settings = {};
    producer.app = { vault: { read: async (file: { path: string }) => file.path,
      create: async (_path: string, body: string) => { reports.push(body); return {}; } }, workspace: { getLeaf: () => ({ openFile: vi.fn() }) } };
    producer.recallAuthoring = { ingestNote, closedWriteGuard: (file: { path: string }) => () => {
      if (file.path === "LateOpened.md" && lateOpened) throw new Error("Editor opened");
    }, hasOpenEditor: (file: { path: string }) => ["Opened.md", "Unsaved.md"].includes(file.path),
      generateForNote: async (file: { path: string }) => {
        if (file.path === "Unsaved.md") return { status: "partial", reason: "editor-save-failed", cardCount: 1 };
        order.push(`editor:${file.path}`); return { status: "success", cardCount: 1 };
      } }; producer.buildFlashcardsContent = build;
    await producer.runBatchProcessing(files, "existing flashcards prompt", true);
    expect(order).toEqual(["write:A.md", "write:B.md", "editor:Opened.md", "ingest:A.md", "ingest:B.md"]);
    expect(backupAndReplaceNote).toHaveBeenCalledTimes(3); expect(build).toHaveBeenCalledTimes(4);
    expect(reports[0]).toContain('"ok":3,"err":3');
    expect(reports[0]).toContain("Unsaved.md: @recall.authoring.editor-save-failed");
    expect(reports[0]).toContain("@recall.authoring.recall-update-failed"); expect(reports[0]).not.toContain("PRIVATE_PROVIDER_BODY");
  });
});
