import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("Connect product dependency boundaries", () => {
  it("owns no clients, service, index, proposal application or durable domain storage", () => {
    const allowed = new Set(["../../companionSync/errors", "../../companionSync/settings", "../../companionSync/types",
      "../../health/connectPort", "./companionSettingsPort", "./connectEnginePort"]);
    for (const file of readdirSync("connect/product").filter((name) => name.endsWith(".ts"))) {
      const text = readFileSync(`connect/product/${file}`, "utf8");
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node): void {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) expect(allowed.has(node.moduleSpecifier.text), file).toBe(true);
        if (ts.isCallExpression(node)) {
          expect(node.expression.kind).not.toBe(ts.SyntaxKind.ImportKeyword);
          expect(node.expression.getText(source)).not.toMatch(/\b(?:fetch|require|requestUrl|read|cachedRead|write|saveData|indexVault|rebuildIndex|callOpenRouter)\b/u);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
      expect(text).not.toMatch(/new (?:CompanionClient|CompanionSyncService|ProposalApplication|FindingStore|RecallStore|SemanticRuntime)\b/u);
    }
  });
  it("registers one Connect owner and retains the shared proposal command implementation", () => {
    const source = readFileSync("main.ts", "utf8");
    expect(source.match(/new ConnectController\(/gu)).toHaveLength(1);
    expect(source).toContain('id: "review-ai-change-proposals", name: "Review AI change proposals", callback: () => this.openProposalReview()');
    expect(source).toContain("openProposalReview: () => this.openProposalReview()");
    expect(source.match(/new ProposalApplication\(/gu)).toHaveLength(1);
    expect(source).toContain("rawTestCompanion(settings, signal, false)");
    expect(source).toContain("rawSyncCompanion(signal)");
    const semantic = readFileSync("semantic/obsidianSemanticController.ts", "utf8");
    expect(semantic.match(/new CompanionSyncService\(/gu)).toHaveLength(1);
    const healthState = readFileSync("health/domain/healthState.ts", "utf8");
    expect(healthState).not.toContain('"connect"');
  });
});
