import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("semantic Health adapter dependency boundary", () => {
  it("uses only Health contracts/helpers and the existing controller result API", () => {
    const allowed = new Set(["../../health/domain/identity", "../../health/domain/finding", "../../health/analyzers/local/cancellation",
      "../../health/semanticHealthAnalysisPort", "../types"]);
    for (const file of readdirSync("semantic/health").filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
      const source = readFileSync(`semantic/health/${file}`, "utf8");
      const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node): void {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          expect(allowed.has(node.moduleSpecifier.text), `${file}: ${node.moduleSpecifier.text}`).toBe(true);
        }
        if (ts.isCallExpression(node)) {
          expect(node.expression.kind).not.toBe(ts.SyntaxKind.ImportKeyword);
          expect(node.expression.getText(parsed)).not.toMatch(/\b(?:require|fetch|requestUrl|request|XMLHttpRequest|WebSocket|embed|dimensions|testEmbeddingConnection|read|cachedRead|write|modify|create|delete|rename|rebuildIndex|indexVault|refreshSemanticStatus)\b/u);
        }
        ts.forEachChild(node, visit);
      }
      visit(parsed);
      expect(source).not.toMatch(/\b(?:FindingStore|VectorStore|SemanticRuntime|SemanticDiscoveryService|cosine|centroid|embeddingSpaceId)\b/u);
    }
  });
});
