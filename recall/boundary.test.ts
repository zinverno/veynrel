import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? productionFiles(join(directory, entry.name))
    : entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && entry.name !== "testSupport.ts" ? [join(directory, entry.name)] : []);
}

describe("Recall local-only domain boundary", () => {
  it("audits every production module and its runtime imports for network, semantic, external-plugin or Markdown-write dependencies", () => {
    const allowed = new Set([...productionFiles("recall"), "utils/stableHash.ts", "health/domain/validation.ts", "health/recallHealthPort.ts"]);
    const writes: string[] = [];
    const recoveryMoves: string[] = [];
    for (const file of allowed) {
      const raw = readFileSync(file, "utf8"), ast = ts.createSourceFile(file, raw, ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node): void {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const target = node.moduleSpecifier.text;
          if (target === "obsidian") expect(ts.isImportDeclaration(node) && node.importClause?.isTypeOnly).toBe(true);
          else expect(allowed.has(normalize(join(dirname(file), `${target}.ts`))), `${file}: unexpected dependency ${target}`).toBe(true);
          if (file.startsWith("recall/scheduler/")) {
            expect(normalize(join(dirname(file), `${target}.ts`))).toMatch(/^(?:recall\/scheduler\/|health\/domain\/validation\.ts$)/u);
          }
        }
        if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
          expect(node.expression.kind).not.toBe(ts.SyntaxKind.ImportKeyword);
          const call = node.expression.getText(ast);
          const callee = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : call;
          expect(call, file).not.toBe("Math.random");
          if (file.startsWith("recall/scheduler/")) expect(call, file).not.toMatch(/(?:Date|performance|document|window|localStorage)/u);
          if (file === "recall/product/recallRecovery.ts" && call === "this.adapter.rename") recoveryMoves.push(call);
          else if (!(file === "recall/product/recallProductController.ts" && call === "this.listeners.delete")) {
            expect(callee, file).not.toMatch(/^(?:require|fetch|requestUrl|request|callOpenRouter|XMLHttpRequest|WebSocket|embed|embeddings|modify|create|delete|rename|process|cachedRead|loadData|saveData)$/u);
          }
          if (/\.write$/u.test(call)) writes.push(`${file}:${call}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(ast);
    }
    expect(writes.sort()).toEqual(["recall/store/obsidianRecallStorage.ts:this.adapter.write", "recall/store/recallStore.ts:this.storage.write"]);
    expect(recoveryMoves).toHaveLength(2); // Dedicated backup move and best-effort rollback only; tested against fixed Recall paths.
    const storage = readFileSync("recall/store/obsidianRecallStorage.ts", "utf8");
    expect(storage).toContain('this.path = `${this.root}/cards.json`');
    expect(storage).toContain('return `${configDir}/plugins/${pluginId}/recall`');
  });

  it("keeps Health scheduling behind its own port and Recall UI behind the product port", () => {
    const main = readFileSync("main.ts", "utf8");
    expect(main).not.toMatch(/(?:from|import\()\s*["'][^"']*recall/iu);
    const aggregation = readFileSync("health/services/healthAggregator.ts", "utf8");
    expect(aggregation).not.toMatch(/from ["'][^"']*recall\//u);
    for (const file of ["health/recallHealthPort.ts", "health/services/healthService.ts", "health/obsidian/healthPluginController.ts", "health/ui/healthHomeViewModel.ts"]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/from ["'][^"']*recall\//u);
    }
    const view = readFileSync("health/ui/VeynrelHealthView.ts", "utf8");
    expect(view).toContain("RecallProductPort");
    expect(view).not.toMatch(/RecallStore|ObsidianRecallSource/u);
  });
});
