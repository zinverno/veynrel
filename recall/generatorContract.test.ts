import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { parseMarkdownFlashcards } from "./parser/markdownFlashcards";
import { RecallService } from "./services/recallService";
import { memoryStorage, signal } from "./testSupport";

const main = readFileSync("main.ts", "utf8");
const ast = ts.createSourceFile("main.ts", main, ts.ScriptTarget.Latest, true);
const plugin = ast.statements.find((node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === "AIHubPlugin")!;
function method(name: string): string {
  return plugin.members.find((node) => ts.isMethodDeclaration(node) && node.name.getText(ast) === name)!.getText(ast);
}

describe("Recall consumes the unchanged legacy flashcard producer", () => {
  it("executes the real buildFlashcardsContent and its real helpers against the checked-in output fixture", async () => {
    // Extract unchanged source, mock only the LLM transport. No import of the host/plugin startup is needed.
    const helpers = ["extractFlashcards", "appendSection"].map((name) => ast.statements.find((node) =>
      ts.isFunctionDeclaration(node) && node.name?.text === name)!.getText(ast)).join("\n");
    const code = `${helpers}\nclass Producer { ${method("buildFlashcardsContent")} }\nnew Producer()`;
    const callOpenRouter = vi.fn(async () => "What is X::Y\nWhy Z::Because Q");
    const producer = runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText,
      { callOpenRouter, tr: (value: string) => value }) as { buildFlashcardsContent(content: string, prompt: string): Promise<{ newContent: string; cardCount: number }> };
    const body = "# Example note\n\nThis body is preserved by the legacy generator. Prose::not a card\n";
    const generated = await producer.buildFlashcardsContent(body, "existing prompt");
    expect(generated).toEqual({ newContent: readFileSync("tests/fixtures/recall-generated.md", "utf8"), cardCount: 2 });
    expect(callOpenRouter).toHaveBeenCalledExactlyOnceWith(undefined, "existing prompt", body);
    const extracted = await parseMarkdownFlashcards("Example.md", generated.newContent);
    expect(extracted.cards.map(({ question, answer }) => [question, answer])).toEqual([["What is X", "Y"], ["Why Z", "Because Q"]]);
    const service = new RecallService(memoryStorage(), {
      capture: async () => ({ ...extracted, revision: "fixture", coverage: { notesSeen: 1, notesRead: 1, noteListComplete: true } }),
      captureRevision: async () => "fixture",
    }, () => 100);
    await service.initialize(); await service.scan(signal());
    expect(service.listCards({ state: "active" })).toHaveLength(2);
  });

  it("protects the existing command, batch append action, context menu and prompt contract", () => {
    expect(method("onload")).toMatch(/id: "ai-flashcards-note",[\s\S]*?this\.generateFlashcardsForNote\(view\.file\)/u);
    const menu = plugin.members.find((node) => ts.isMethodDeclaration(node) && node.getText(ast).includes('.setTitle(tr("Флешкарты"))'))!.getText(ast);
    expect(menu).toMatch(/\.setTitle\(tr\("Флешкарты"\)\)[\s\S]*?this\.generateFlashcardsForNote\(file\)/u);
    expect(method("runBatchProcessing")).toMatch(/if \(append\)[\s\S]*?this\.buildFlashcardsContent\(content, query\)/u);
    expect(readFileSync("constants.ts", "utf8")).toMatch(/title: "Флешкарты",[\s\S]*?prompt: "@flashcards_prompt",\s*append: true/u);
    expect(main).toContain("this.plugin.runBatchProcessing(files, prompt, append)");
    expect(method("generateFlashcardsForNote")).toContain('tr("@flashcards_prompt")');
    expect(readFileSync("i18n.ts", "utf8")).toContain('question text::answer text');
    expect(main).not.toMatch(/from ["'][^"']*recall\//iu);
  });
});
