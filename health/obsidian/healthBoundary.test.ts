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
  it("has no AI/network/Companion dependencies or Markdown mutations, including transitive imports", () => {
    const queue = productionFiles("health").map((path) => resolve(path)); const visited = new Set<string>();
    while (queue.length) {
      const path = queue.pop()!; if (visited.has(path)) continue; visited.add(path);
      const name = relative(process.cwd(), path);
      expect(name.startsWith("health/") || name.startsWith("utils/") || name === "i18n.ts", name).toBe(true);
      const text = readFileSync(path, "utf8");
      expect(text, name).not.toMatch(/\b(?:fetch|callOpenRouter|streamOpenRouter|XMLHttpRequest|WebSocket)\s*\(/u);
      expect(text, name).not.toMatch(/\bvault\.(?:modify|create|delete|trash|process|rename)\s*\(/u);
      const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node): void {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const specifier = node.moduleSpecifier.text;
          if (specifier.startsWith(".")) queue.push(resolve(dirname(path), `${specifier}.ts`));
          else expect(specifier, name).toBe("obsidian");
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(visited.has(resolve("health/obsidian/registerHealth.ts"))).toBe(true);
    expect(visited.has(resolve("health/ui/VeynrelHealthView.ts"))).toBe(true);
    expect(visited.has(resolve("health/ui/renderFindingsInbox.ts"))).toBe(true);
    expect(visited.has(resolve("health/ui/findingsInboxViewModel.ts"))).toBe(true);
  });
  it("keeps both legacy batch/control command IDs and adds one Health registration", () => {
    const source = readFileSync("main.ts", "utf8");
    expect(source).toMatch(/id: "ai-hub-open-panel",\s*name: [^\n]+\s*callback: \(\) => new BatchProcessModal\(this.app, this\).open\(\)/u);
    expect(source).toContain('id: "ai-batch-process"');
    expect(source.match(/registerHealth\(this,/gu)).toHaveLength(1);
  });
  it("keeps Inbox rendering away from storage, scans and arbitrary persisted action execution", () => {
    for (const file of productionFiles("health/ui")) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/\b(?:FindingStore|HealthService|new HealthPluginController)\b/u);
      expect(source, file).not.toMatch(/\b(?:finding|selected|detail)\.actions\b|\baction\.kind\b/u);
      expect(source, file).not.toMatch(/\bvault\.(?:read|getMarkdownFiles)\s*\(/u);
    }
    const controller = readFileSync("health/obsidian/healthPluginController.ts", "utf8");
    expect(controller.match(/new HealthService\(/gu)).toHaveLength(1);
  });
});
