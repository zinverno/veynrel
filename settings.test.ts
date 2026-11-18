import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import type AIHubPlugin from "./main";

vi.mock("obsidian", () => ({
  PluginSettingTab: class { update = vi.fn(); }, Setting: class { setName() { return this; } setDesc() { return this; } setHeading() { return this; } }, Notice: class {},
  requireApiVersion: vi.fn(() => false), setIcon: vi.fn(), requestUrl: vi.fn(),
}));
vi.mock("./api", () => ({ testConnection: vi.fn(), fetchOllamaModels: vi.fn(), fetchOpenRouterFreeModels: vi.fn() }));
import { AIHubSettingTab, DEFAULT_SETTINGS } from "./settings";
import baseline from "./tests/fixtures/settings-ia-baseline.json";
import releaseSafety from "./tests/fixtures/settings-1.9-safety.json";
import { setLanguage } from "./i18n";

const exposedKeys = [
  "provider", "apiKey", "model", "baseUrl", "temperature", "language", "showContextMenu", "notifyOnCopy", "floatingActions.enabled",
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

describe("declarative settings inventory", () => {
  it("covers every existing durable UI binding without registration-time side effects", () => {
    const f = fixture(); const snapshot = structuredClone(f.settings);
    const rows = f.tab.getSettingDefinitions().flatMap((section) => section.items);
    expect(rows).toHaveLength(baseline.rowCount + 13);
    expect(rows.flatMap((row) => row.keys).filter(key => !key.startsWith("rerank.") && !key.startsWith("decisions.") && !key.startsWith("floatingActions.")).sort()).toEqual(baseline.keys);
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

  it("uses the host renderer and rejects unindexed durable bindings", () => {
    const source = readFileSync(new URL("./settings.ts", import.meta.url), "utf8");
    const file = ts.createSourceFile("settings.ts", source, ts.ScriptTarget.Latest, true);
    const classNode = file.statements.find((node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === "AIHubSettingTab")!;
    expect(Object.prototype.hasOwnProperty.call(AIHubSettingTab.prototype, "display")).toBe(false);
    const writes = new Set<string>();
    const visitWrites = (node: ts.Node): void => {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const left = node.left.getText(file);
        if (left.startsWith("this.plugin.settings.")) writes.add(left.slice("this.plugin.settings.".length));
        else if (left.startsWith("semantic.") || left.startsWith("companion.") || left.startsWith("rerank.") || left.startsWith("decisions.")) writes.add(left);
      }
      ts.forEachChild(node, visitWrites);
    };
    visitWrites(classNode);
    expect([...writes].sort()).toEqual(exposedKeys.filter(key => key !== "floatingActions.enabled"));
    expect(source).toContain('this.plugin.setFloatingPreferences({ enabled: value })');
  });
});

it.each(["en", "ru"] as const)("keeps product and technical search aliases and the native renderer inventory in %s", (language) => {
  setLanguage(language); const f = fixture(); const groups = f.tab.getSettingDefinitions();
  const aliases = new Map([
    ["cpu", ["Deep Intelligence", "Language model", "LLM"]],
    ["binary", ["Semantic Intelligence", "Embeddings", "Semantic"]],
    ["server", ["Veynrel Connect", "Connect", "Companion", "endpoint", "token", "timeout", "MCP"]],
    ["microscope", ["Deep Analysis", "Deep Audit"]],
    ["arrow-down-to-line", ["Writing & Output", "MOC", "Atoms", "Insertion"]],
  ]);
  expect(groups.map((group) => group.icon)).toEqual(["brain", "mouse-pointer", "cpu", "binary", "server", "microscope", "arrow-down-to-line", "layout-dashboard"]);
  expect(groups.map((group) => group.heading).join(" ")).not.toMatch(/@settings|AI Hub|Vault Audit AI/u);
  for (const group of groups) for (const row of group.items) expect(row.aliases).toEqual(expect.arrayContaining(aliases.get(group.icon) ?? []));
  const output = groups.find((group) => group.icon === "arrow-down-to-line")!;
  expect(output.items.flatMap((row) => row.keys).sort()).toEqual(["atomsFolder", "atomsLocation", "defaultInsertion", "filenameTemplate", "mocFolder", "newNoteFolder"]);
  expect(groups.find((group) => group.icon === "microscope")!.items[0].desc).toContain(language === "en" ? "not Knowledge Health thresholds" : "Не задают пороги");
  const settingsBefore = structuredClone(f.settings);
  const visible = groups.flatMap(group => group.items).filter(row => row.visible !== false && (typeof row.visible !== "function" || row.visible()));
  expect(visible.map(row => row.name)).toContain(output.items[0].name);
  expect(visible.filter(row => row.keys.length).every(row => row.render || row.control)).toBe(true);
  const update = vi.spyOn(f.tab, "update");
  f.tab["refreshSettings"]();
  expect(update).toHaveBeenCalledOnce();
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
  // Keep legacy controls/defaults frozen; independent rerank, Decisions and Recall prompt properties are additive.
  const hash = (node: ts.Node) => {
    const transformed = ts.transform(node, [context => root => {
      const visit: ts.Visitor = item => {
        if ((ts.isPropertyAssignment(item) || ts.isPropertySignature(item)) && ["rerank", "decisions", "recallPrompt", "floatingActions"].includes(item.name.getText(source))) return undefined;
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
  // The published 2.3.1 fixture retains its legacy renderer; the 1.13.7 host owns these two methods now.
  const sharedCallbacks: Record<string, string> = { ...baseline.controlCallbacks };
  delete sharedCallbacks["method:addHeading"];
  delete sharedCallbacks["method:display"];
  expect(Object.fromEntries(Object.entries(callbacks).filter(([key]) => !key.startsWith("rerank.") && !key.startsWith("decisions.") && !key.startsWith("floatingActions.") && !["method:hide", "method:rerankSettingsChanged", "method:decisionsSettingsChanged"].includes(key)))).toEqual({ ...sharedCallbacks, ...releaseSafety,
    // Optional confirmed taxonomy profile and R04 registry selection/decisions; defaults and controls stay frozen.
    AIHubSettings: "d2e24668e6b8a545c943777229348d367d4745a952b48178cfaaa00a8f5b8870",
    // UI consolidation: native headings/buttons and the existing free-model translation; durable callbacks stay frozen.
    // Obsidian 1.13 displays slider values inline and uses setDestructive for the existing index actions.
    "temperature": "f216296bbba91c0b894ab03bfd0f57af817a48a4b0823ff941604855f44b02a7",
    "deepAudit.batchSize": "2a26fa12598b646bce88f069b483903ed24b9a41645bf0685adef1a2b97ae3f6",
    "deepAudit.delayMs": "aca538e90617d7199755b70e4d3dcfae3bcb8d8126d5a159707d1b32695b1ab9",
    "deepAudit.maxConcurrent": "ca8cb2edcb1110b25dc147c6567e2664b0e47d7f0ad8a5b5f61142a64b22013f",
    "method:renderSemanticIndexControls": "2657e9ccd98a864e350811e7826fa7ac5ad65b4f42e779d18b7838ed1afadc4d",
    "method:refreshSettings": "9747ef5c49468581535ae0437255dbdd9e96a6f113709a602713bd52fba496eb",
    "method:renderModelOptions": "f40d324dcb6ecf783cec2013b750afae4acb38adade1a9a7cffd46ffa1379466",
    "method:renderProviderCards": "3b19426d826726e3317259123552832846115a9e20c38e61418cf8e7a059a0e5",
  });
});

it("keeps the Recall prompt optional and does not impose an override at startup", () => {
  const source = ts.createSourceFile("settings.ts", readFileSync("settings.ts", "utf8"), ts.ScriptTarget.Latest, true);
  const settings = source.statements.find((node): node is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(node) && node.name.text === "AIHubSettings")!;
  const prompt = settings.members.find(member => member.name?.getText(source) === "recallPrompt") as ts.PropertySignature;
  expect(prompt.questionToken).toBeDefined(); expect(prompt.type?.kind).toBe(ts.SyntaxKind.StringKeyword);
  expect(DEFAULT_SETTINGS).not.toHaveProperty("recallPrompt");
});
