import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import type AIHubPlugin from "./main";

vi.mock("obsidian", () => ({
  PluginSettingTab: class {}, Setting: class { setName() { return this; } setDesc() { return this; } setHeading() { return this; } }, Notice: class {},
  requireApiVersion: vi.fn(() => false), setIcon: vi.fn(), requestUrl: vi.fn(),
}));
vi.mock("./api", () => ({ testConnection: vi.fn(), fetchOllamaModels: vi.fn(), fetchOpenRouterFreeModels: vi.fn() }));
import { AIHubSettingTab, DEFAULT_SETTINGS } from "./settings";
import baseline from "./tests/fixtures/settings-ia-baseline.json";
import releaseSafety from "./tests/fixtures/settings-1.9-safety.json";
import { setLanguage } from "./i18n";

const exposedKeys = [
  "provider", "apiKey", "model", "baseUrl", "temperature", "language", "showContextMenu", "notifyOnCopy",
  "defaultInsertion", "newNoteFolder", "filenameTemplate", "mocFolder", "atomsLocation", "atomsFolder",
  "deepAudit.batchSize", "deepAudit.maxConcurrent", "deepAudit.delayMs",
  "decisions.enabled", "decisions.model", "decisions.apiKey",
  "rerank.enabled", "rerank.triggerMode", "rerank.model", "rerank.apiKey",
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
    expect(rows).toHaveLength(baseline.rowCount + 11);
    expect(rows.flatMap((row) => row.keys).filter(key => !key.startsWith("rerank.") && !key.startsWith("decisions.")).sort()).toEqual(baseline.keys);
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
    setLanguage("en");
    const f = fixture(); f.settings.provider = provider;
    const rows = f.tab.getSettingDefinitions().flatMap((section) => section.items);
    expect(rows.map((row) => `${row.name} ${row.desc ?? ""}`).join("\n")).not.toMatch(/[А-Яа-яЁё]/u);
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
        else if (left.startsWith("semantic.") || left.startsWith("companion.") || left.startsWith("rerank.") || left.startsWith("decisions.")) writes.add(left);
      }
      ts.forEachChild(node, visitWrites);
    };
    visitDisplay(display); visitWrites(classNode);
    expect(constructors).toBe(1); expect(sharedReads).toBe(1);
    expect([...writes].sort()).toEqual(exposedKeys);
  });
});

it.each(["en", "ru"] as const)("keeps product and technical search aliases and both renderer inventories in %s", (language) => {
  setLanguage(language); const f = fixture(); const groups = f.tab.getSettingDefinitions();
  const aliases = new Map([
    ["cpu", ["Deep Intelligence", "Language model", "LLM"]],
    ["binary", ["Semantic Intelligence", "Embeddings", "Semantic"]],
    ["server", ["Veynrel Connect", "Connect", "Companion", "endpoint", "token", "timeout", "MCP"]],
    ["microscope", ["Deep Analysis", "Deep Audit"]],
    ["arrow-down-to-line", ["Writing & Output", "MOC", "Atoms", "Insertion"]],
  ]);
  expect(groups.map((group) => group.icon)).toEqual(["brain", "cpu", "binary", "server", "microscope", "arrow-down-to-line", "layout-dashboard"]);
  expect(groups.map((group) => group.heading).join(" ")).not.toMatch(/@settings|AI Hub|Vault Audit AI/u);
  for (const group of groups) for (const row of group.items) expect(row.aliases).toEqual(expect.arrayContaining(aliases.get(group.icon) ?? []));
  const output = groups.find((group) => group.icon === "arrow-down-to-line")!;
  expect(output.items.flatMap((row) => row.keys).sort()).toEqual(["atomsFolder", "atomsLocation", "defaultInsertion", "filenameTemplate", "mocFolder", "newNoteFolder"]);
  expect(groups.find((group) => group.icon === "microscope")!.items[0].desc).toContain(language === "en" ? "not Knowledge Health thresholds" : "Не задают пороги");
  const settingsBefore = structuredClone(f.settings);
  // Run legacy display with recording host controls: it must forward the same visible definitions.
  const rendered: string[] = [];
  const visible = groups.flatMap((group) => group.items).filter((row) => row.visible !== false && (typeof row.visible !== "function" || row.visible()));
  const definitions = groups.map((group) => ({ ...group, items: group.items.map((row) => ({ ...row,
    control: undefined, render: () => { rendered.push(row.name); } })) }));
  vi.spyOn(f.tab, "getSettingDefinitions").mockReturnValue(definitions);
  const element = { createDiv: () => element, createSpan: () => element, createEl: () => element, empty: vi.fn() };
  Object.assign(f.tab, { containerEl: element });
  f.tab.display();
  expect(rendered).toEqual(visible.map((row) => row.name));
  expect(f.settings).toEqual(settingsBefore); expect(f.saveSettings).not.toHaveBeenCalled();
  setLanguage("en");
});

// Freeze the baseline behavior, not the visible labels. Regrouping must not change
// any existing control callback, helper, default or durable schema. Release fixes
// localize the custom key placeholder and defer semantic reconciliation until persistence; the latter has
// separate pending/failure regressions in releaseSettingsDurability.test.ts.
it("preserves baseline controls except the verified release and native markup fixes", () => {
  const source = ts.createSourceFile("settings.ts", readFileSync("settings.ts", "utf8"), ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter({ removeComments: true });
  // Keep the frozen legacy schema/default contract; the independent rerank and Decisions properties are additive.
  const hash = (node: ts.Node) => {
    const transformed = ts.transform(node, [context => root => {
      const visit: ts.Visitor = item => {
        if ((ts.isPropertyAssignment(item) || ts.isPropertySignature(item)) && ["rerank", "decisions"].includes(item.name.getText(source))) return undefined;
        return ts.visitEachChild(item, visit, context);
      };
      return ts.visitNode(root, visit) as typeof root;
    }]);
    const value = createHash("sha256").update(printer.printNode(ts.EmitHint.Unspecified, transformed.transformed[0], source)).digest("hex");
    transformed.dispose();
    return value;
  };
  const callbacks: Record<string, string> = {};
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "row" && ts.isArrayLiteralExpression(node.arguments[0]) && node.arguments[0].elements.length) {
      const keys = node.arguments[0].elements.map((key) => ts.isStringLiteral(key) ? key.text : "invalid");
      callbacks[keys.join(",")] = hash(node.arguments[3]);
    }
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "DEFAULT_SETTINGS") callbacks.DEFAULT_SETTINGS = hash(node.initializer!);
    if (ts.isInterfaceDeclaration(node) && node.name.text === "AIHubSettings") callbacks.AIHubSettings = hash(node);
    if (ts.isMethodDeclaration(node) && node.name.getText(source) !== "getSettingDefinitions") callbacks[`method:${node.name.getText(source)}`] = hash(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  expect(Object.fromEntries(Object.entries(callbacks).filter(([key]) => !key.startsWith("rerank.") && !key.startsWith("decisions.") && !["method:hide", "method:rerankSettingsChanged", "method:decisionsSettingsChanged"].includes(key)))).toEqual({ ...baseline.controlCallbacks, ...releaseSafety,
    // UI consolidation: native headings/buttons and the existing free-model translation; durable callbacks stay frozen.
    "method:addHeading": "df027728a56e192c246af36f41a110d960275b1b72843329a5be90cff14e8e0c",
    "method:renderModelOptions": "f40d324dcb6ecf783cec2013b750afae4acb38adade1a9a7cffd46ffa1379466",
    "method:renderProviderCards": "3b19426d826726e3317259123552832846115a9e20c38e61418cf8e7a059a0e5",
  });
});
