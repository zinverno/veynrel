import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? productionFiles(`${directory}/${entry.name}`)
    : entry.name.endsWith(".ts") && !/\.test\.|testSupport|testFixtures/u.test(entry.name) ? [`${directory}/${entry.name}`] : []);
}

describe("Health production dependency boundary", () => {
  it("keeps persistent owners and explicit transient-session factories outside views and actions", () => {
    const owners: Record<string, string | string[]> = {
      HealthPluginController: "health/obsidian/registerHealth.ts",
      ConnectionComparisonController: "health/obsidian/registerHealth.ts",
      HealthService: "health/obsidian/healthPluginController.ts",
      FindingStore: "health/obsidian/healthPluginController.ts",
      ObsidianSemanticController: "main.ts",
      SemanticIntelligenceController: "main.ts",
      SemanticNeighborhoodController: ["main.ts", "semantic/product/semanticNeighborhoodController.ts"],
      DeepIntelligenceController: "main.ts",
      RecallProductController: "recall/product/obsidianRecallProduct.ts",
      RecallService: "recall/product/obsidianRecallProduct.ts",
      RecallStore: "recall/services/recallService.ts",
    };
    const files = ["main.ts", ...["health", "semantic", "recall", "deep"].flatMap(productionFiles)];
    for (const [owner, expected] of Object.entries(owners)) {
      const sites = files.flatMap((file) => [...readFileSync(file, "utf8").matchAll(new RegExp(`new ${owner}\\(`, "gu"))].map(() => file));
      expect(sites, owner).toEqual(Array.isArray(expected) ? expected : [expected]);
    }
  });
  it("permits the additional neighborhood owner only inside its same-engine session factory", () => {
    const text = readFileSync("semantic/product/semanticNeighborhoodController.ts", "utf8");
    const source = ts.createSourceFile("session.ts", text, ts.ScriptTarget.Latest, true);
    let count = 0;
    const visit = (node: ts.Node): void => {
      if (ts.isNewExpression(node) && node.expression.getText(source) === "SemanticNeighborhoodController") {
        count++;
        let owner: ts.Node | undefined = node.parent;
        while (owner && !ts.isMethodDeclaration(owner)) owner = owner.parent;
        expect(owner && ts.isMethodDeclaration(owner) && owner.name.getText(source)).toBe("createSession");
        expect(node.arguments?.map(arg => arg.getText(source))).toEqual(["this.engine"]);
      }
      ts.forEachChild(node, visit);
    };
    visit(source); expect(count).toBe(1);
  });
  it("has no AI/network/Companion dependencies or Markdown mutations, including transitive imports", () => {
    const queue = productionFiles("health").map((path) => resolve(path)); const visited = new Set<string>();
    while (queue.length) {
      const path = queue.pop()!; if (visited.has(path)) continue; visited.add(path);
      const name = relative(process.cwd(), path);
      expect(name.startsWith("health/") || name.startsWith("recall/") || name.startsWith("utils/") || name === "i18n.ts", name).toBe(true);
      const text = readFileSync(path, "utf8");
      expect(text, name).not.toMatch(/\b(?:fetch|callOpenRouter|streamOpenRouter|XMLHttpRequest|WebSocket)\s*\(/u);
      expect(text, name).not.toMatch(/\bvault\.(?:modify|create|delete|trash|process|rename)\s*\(/u);
      const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node): void {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const specifier = node.moduleSpecifier.text;
          if (specifier.startsWith(".")) queue.push(resolve(dirname(path), `${specifier}.ts`));
          else {
            expect(specifier, name).toBe("obsidian");
            expect(node.getText(source), name).not.toMatch(/\b(?:requestUrl|request)\b/u);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(visited.has(resolve("health/obsidian/registerHealth.ts"))).toBe(true);
    expect(visited.has(resolve("health/ui/VeynrelHealthView.ts"))).toBe(true);
    expect(visited.has(resolve("health/ui/renderFindingsInbox.ts"))).toBe(true);
    expect(visited.has(resolve("health/ui/findingsInboxViewModel.ts"))).toBe(true);
    expect(visited.has(resolve("health/ui/renderDiscover.ts"))).toBe(true);
    expect(visited.has(resolve("health/ui/discoverViewModel.ts"))).toBe(true);
    expect(visited.has(resolve("health/ui/renderRecall.ts"))).toBe(true);
    expect(visited.has(resolve("recall/product/obsidianRecallProduct.ts"))).toBe(true);
  });
  it("keeps both legacy batch/control command IDs and adds one Health registration", () => {
    const source = readFileSync("main.ts", "utf8");
    expect(source).toMatch(/id: "ai-hub-open-panel",\s*name: [^\n]+\s*callback: \(\) => new BatchProcessModal\(this.app, this\).open\(\)/u);
    expect(source).toContain('id: "ai-batch-process"');
    expect(source.match(/registerHealth\(this,/gu)).toHaveLength(1);
  });
  it("keeps Inbox, Discover and Recall rendering away from storage, scans and arbitrary persisted action execution", () => {
    for (const file of productionFiles("health/ui")) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/\b(?:FindingStore|HealthService|new HealthPluginController|RecallStore|ObsidianRecallSource|rateSchedule|previewRatings)\b/u);
      expect(source, file).not.toMatch(/\b(?:finding|selected|detail)\.actions\b|\baction\.kind\b/u);
      expect(source, file).not.toMatch(/\bvault\.(?:read|cachedRead|getMarkdownFiles)\s*\(/u);
      expect(source, file).not.toMatch(/\b(?:SemanticRuntime|VectorStore|SemanticDiscoveryService|ObsidianSemanticController)\b/u);
    }
    const controller = readFileSync("health/obsidian/healthPluginController.ts", "utf8");
    expect(controller.match(/new HealthService\(/gu)).toHaveLength(1);
  });
});
