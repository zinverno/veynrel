import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("Deep product architecture and legacy contracts", () => {
  it("has no vault, analyzer, storage, embedding, Recall or HTTP capabilities", () => {
    const allowed = new Set(["../../i18n", "../../constants", "../../health/deepIntelligencePort",
      "./languageModelSettingsPort", "./languageModelConnectionPort", "./validateLanguageModelSettings"]);
    for (const file of readdirSync("deep/product").filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
      const text = readFileSync(`deep/product/${file}`, "utf8");
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node): void {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
          expect(allowed.has(node.moduleSpecifier.text), file).toBe(true);
        }
        if (ts.isCallExpression(node)) {
          expect(node.expression.kind).not.toBe(ts.SyntaxKind.ImportKeyword);
          expect(node.expression.getText(source)).not.toMatch(/\b(?:require|fetch|requestUrl|read|cachedRead|getMarkdownFiles|write|saveData|callOpenRouter|fetchOllamaModels|fetchOpenRouterFreeModels)\b/u);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
      expect(text).not.toMatch(/\b(?:AIHubSettings|DeepAuditEngine|SingleAuditEngine|SemanticRuntime|RecallStore|FindingStore)\b/u);
    }
  });
  it("retains command IDs and shared settings at every existing LLM entry point", () => {
    const main = readFileSync("main.ts", "utf8"); const semantic = readFileSync("semantic/obsidianSemanticController.ts", "utf8");
    for (const id of ["ai-deep-vault-audit", "ai-simple-append", "ai-vault-append", "ai-selection", "ai-dataview-generate",
      "ai-flashcards-note", "ai-batch-process", "ai-generate-mocs", "ai-atomize-note"]) expect(main).toContain(`id: "${id}"`);
    expect(semantic.includes('id: "ai-rag-ask-vault"')).toBe(true);
    expect(main).toContain("await testConnection({ ...this.settings, ...settings })");
    expect(main).toContain("new DeepAuditEngine(this.app, this.settings");
    expect(/new SingleAuditEngine\(\s*this.app,\s*this.settings/u.test(main)).toBe(true);
    expect(main).toContain("callOpenRouter(\n");
    expect(semantic).toContain("this.plugin.settings");
    const settings = readFileSync("settings.ts", "utf8");
    for (const key of ["provider", "model", "apiKey", "baseUrl", "temperature", "deepAudit"]) expect(settings.includes(`this.plugin.settings.${key}`), key).toBe(true);
    expect(settings.includes("topK: number")).toBe(true);
  });
});
