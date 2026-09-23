import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("semantic product dependency boundary", () => {
  it("uses only the existing test/settings/controller APIs, without vault, vector or Companion access", () => {
    const allowed = new Set(["../../embeddings/factory", "../../embeddings/types", "../../health/semanticIntelligencePort",
      "../types", "./semanticSettingsPort"]);
    for (const file of readdirSync("semantic/product").filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
      const source = readFileSync(`semantic/product/${file}`, "utf8");
      const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node): void {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          expect(allowed.has(node.moduleSpecifier.text), `${file}: ${node.moduleSpecifier.text}`).toBe(true);
          if (node.moduleSpecifier.text === "../../embeddings/factory" && ts.isImportDeclaration(node)) {
            const bindings = node.importClause?.namedBindings;
            expect(bindings && ts.isNamedImports(bindings) ? bindings.elements.map((item) => item.name.text).sort() : [])
              .toEqual(["testEmbeddingConnection", "validateEmbeddingSettings"]);
          }
        }
        if (ts.isCallExpression(node)) {
          expect(node.expression.kind).not.toBe(ts.SyntaxKind.ImportKeyword);
          expect(node.expression.getText(parsed)).not.toMatch(/\b(?:require|fetch|requestUrl|XMLHttpRequest|WebSocket|read|cachedRead|readAll|readPaths|getMarkdownFiles|write|modify|remove|clearIndex|createEmbeddingProvider|embed)\b/u);
        }
        ts.forEachChild(node, visit);
      }
      visit(parsed);
      expect(source).not.toMatch(/\.runtime\b|\.vault\b|\.adapter\b|\.companion\b|new .*VectorStore/u);
    }
  });
  it("retains the existing semantic command IDs and Advanced embedding controls", () => {
    const controller = readFileSync("semantic/obsidianSemanticController.ts", "utf8");
    for (const id of ["ai-semantic-search", "ai-semantic-find-similar-notes", "ai-semantic-find-potential-duplicates",
      "ai-semantic-index-vault", "ai-semantic-index-current-note", "ai-semantic-clear-index", "ai-semantic-rebuild-index"]) {
      expect(controller).toContain(`id: "${id}"`);
    }
    const settings = readFileSync("settings.ts", "utf8");
    for (const key of ["enabled", "embeddingProvider", "embeddingModel", "embeddingBaseUrl", "openRouterApiKey", "openAICompatibleApiKey"]) {
      expect(settings).toContain(`semantic.${key}`);
    }
    for (const call of ["controller.indexVault()", "controller.clearIndex()", "controller.rebuildIndex()", "this.renderEmbeddingTest("]) expect(settings).toContain(call);
  });
});
