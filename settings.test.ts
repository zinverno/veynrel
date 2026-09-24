import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import type AIHubPlugin from "./main";

vi.mock("obsidian", () => ({
  PluginSettingTab: class {}, Setting: class {}, Notice: class {},
  requireApiVersion: vi.fn(() => false), setIcon: vi.fn(), requestUrl: vi.fn(),
}));
vi.mock("./api", () => ({ testConnection: vi.fn(), fetchOllamaModels: vi.fn(), fetchOpenRouterFreeModels: vi.fn() }));
import { AIHubSettingTab, DEFAULT_SETTINGS } from "./settings";

const exposedKeys = [
  "provider", "apiKey", "model", "baseUrl", "temperature", "language", "showContextMenu", "notifyOnCopy",
  "defaultInsertion", "newNoteFolder", "filenameTemplate", "mocFolder", "atomsLocation", "atomsFolder",
  "deepAudit.batchSize", "deepAudit.maxConcurrent", "deepAudit.delayMs",
  "semantic.enabled", "semantic.embeddingProvider", "semantic.embeddingModel", "semantic.embeddingBaseUrl",
  "semantic.openRouterApiKey", "semantic.openAICompatibleApiKey", "companion.enabled", "companion.endpoint", "companion.token", "companion.timeoutMs",
].sort();

function fixture() {
  const settings = structuredClone(DEFAULT_SETTINGS);
  const saveSettings = vi.fn(async () => undefined);
  const getSemanticController = vi.fn(() => { throw new Error("Definition discovery must not initialize runtime services"); });
  const plugin = { settings, saveSettings, getSemanticController };
  const tab = new AIHubSettingTab({} as App, plugin as unknown as AIHubPlugin);
  return { tab, ...plugin };
}

describe("shared legacy and declarative settings inventory", () => {
  it("covers every existing durable UI binding without registration-time side effects", () => {
    const f = fixture(); const snapshot = structuredClone(f.settings);
    const rows = f.tab.getSettingDefinitions().flatMap((section) => section.items);
    expect(rows).toHaveLength(35);
    expect(rows.flatMap((row) => row.keys).sort()).toEqual(exposedKeys);
    expect(f.settings).toEqual(snapshot);
    expect(f.saveSettings).not.toHaveBeenCalled(); expect(f.getSemanticController).not.toHaveBeenCalled();
    for (const row of rows.filter((row) => row.keys.length)) {
      expect(row.name.length).toBeGreaterThan(0);
      expect(row.render !== undefined || row.control !== undefined).toBe(true);
    }
    expect(rows.filter((row) => row.control).map((row) => row.control?.type).sort()).toEqual(["text", "toggle"]);
  });

  it.each(["openrouter", "openai", "groq", "ollama", "custom"] as const)("retains conditional credentials and searchable choices for %s", (provider) => {
    const f = fixture(); f.settings.provider = provider;
    const rows = f.tab.getSettingDefinitions().flatMap((section) => section.items);
    const key = rows.find((row) => row.keys.includes("apiKey"))!;
    // Obsidian keys custom rows by name, so duplicate names break reconciliation.
    const renderKeys = rows.map((row) => row.control ? `key:${row.control.key}` : `name:${row.name}`);
    expect(new Set(renderKeys).size).toBe(renderKeys.length);
    const modelName = rows.find((row) => row.keys.includes("model"))!.name;
    expect(rows.find((row) => row.name.startsWith(`${modelName} — `))?.visible).toBe(provider !== "custom");
    expect(typeof key.visible === "function" && key.visible()).toBe(provider !== "ollama");
    expect(rows.find((row) => row.keys.includes("provider"))?.aliases).toEqual(expect.arrayContaining(["OpenAI", "OpenRouter", "Groq", "Ollama"]));
  });

  it.each(["openrouter", "openai-compatible", "ollama"] as const)("retains independent embedding credentials for %s", (provider) => {
    const f = fixture(); f.settings.semantic.embeddingProvider = provider;
    const row = f.tab.getSettingDefinitions().flatMap((section) => section.items)
      .find((row) => row.keys.includes("semantic.openRouterApiKey"))!;
    expect(typeof row.visible === "function" && row.visible()).toBe(provider !== "ollama");
    expect(row.keys).toContain("semantic.openAICompatibleApiKey");
  });

  it("routes simple declarative writes through the same save method without resetting other values", async () => {
    const f = fixture(); const before = structuredClone(f.settings);
    await f.tab.setControlValue("filenameTemplate", "  {{topic}} {{date}}  ");
    await f.tab.setControlValue("notifyOnCopy", false);
    expect(f.settings).toEqual({ ...before, filenameTemplate: "  {{topic}} {{date}}  ", notifyOnCopy: false });
    expect(f.saveSettings).toHaveBeenCalledTimes(2);
    await expect(f.tab.setControlValue("notifyOnCopy", "false")).rejects.toThrow("Unsupported setting control");
    expect(f.saveSettings).toHaveBeenCalledTimes(2);
  });

  it("keeps the legacy path generic and rejects unindexed durable bindings", () => {
    const source = readFileSync(new URL("./settings.ts", import.meta.url), "utf8");
    const file = ts.createSourceFile("settings.ts", source, ts.ScriptTarget.Latest, true);
    const classNode = file.statements.find((node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === "AIHubSettingTab")!;
    const display = classNode.members.find((node): node is ts.MethodDeclaration => ts.isMethodDeclaration(node) && node.name.getText(file) === "display")!;
    let constructors = 0, sharedReads = 0;
    const writes = new Set<string>();
    const visitDisplay = (node: ts.Node): void => {
      if (ts.isNewExpression(node) && node.expression.getText(file) === "Setting") constructors++;
      if (ts.isCallExpression(node) && node.expression.getText(file) === "this.getSettingDefinitions") sharedReads++;
      ts.forEachChild(node, visitDisplay);
    };
    const visitWrites = (node: ts.Node): void => {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const left = node.left.getText(file);
        if (left.startsWith("this.plugin.settings.")) writes.add(left.slice("this.plugin.settings.".length));
        else if (left.startsWith("semantic.") || left.startsWith("companion.")) writes.add(left);
      }
      ts.forEachChild(node, visitWrites);
    };
    visitDisplay(display); visitWrites(classNode);
    expect(constructors).toBe(1); expect(sharedReads).toBe(1);
    expect([...writes].sort()).toEqual(exposedKeys);
  });
});
