import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import type { App, PluginManifest } from "obsidian";
import ts from "typescript";
import { LocalVectorStore } from "./vectorStore/localVectorStore";
import { semanticIndexBasePath } from "./semantic/semanticStorageMaintenance";
import type { VectorStorePersistence } from "./vectorStore/types";
import type { AIHubSettings } from "./settings";
import currentManifest from "./manifest.json";
import oldManifest from "./tests/fixtures/upgrade-1.7.0/manifest.json";
import oldCommands from "./tests/fixtures/upgrade-1.7.0/commands.json";
import descriptor from "./tests/fixtures/upgrade-1.7.0/semantic-index/vector-manifest.json";
import publishedCommands from "./tests/fixtures/upgrade-1.8.0/commands.json";

vi.mock("obsidian", () => ({
  Plugin: class { constructor(public app: App, public manifest: PluginManifest) {} },
  Notice: class {}, Modal: class {}, PluginSettingTab: class {}, Component: class {},
  TFile: class {}, TFolder: class {}, getLanguage: () => "en",
}));
afterEach(() => vi.unstubAllGlobals());

it.each(["data.json", "merged-data.json"])("loads retained 1.7.0 settings from %s without clearing existing values", async (name) => {
  vi.stubGlobal("window", { crypto: { randomUUID: () => "22222222-2222-4222-8222-222222222222" } });
  const stored = JSON.parse(readFileSync(new URL(`./tests/fixtures/upgrade-1.7.0/${name}`, import.meta.url), "utf8")) as Partial<AIHubSettings>;
  const { default: Plugin } = await vi.importActual<typeof import("./main")>("./main.ts");
  const plugin = new Plugin({} as App, currentManifest);
  plugin.loadData = vi.fn(async () => structuredClone(stored));
  const saveData = vi.fn(async () => undefined);
  plugin.saveData = saveData;
  await plugin.loadSettings();
  expect(plugin.settings).toMatchObject(stored);
  if (stored.companion) expect(saveData).not.toHaveBeenCalled();
  else {
    // Companion was added after published 1.7.0: only default opt-out state is added.
    expect(plugin.settings.companion.enabled).toBe(false);
    expect(saveData).toHaveBeenCalledWith(expect.objectContaining(stored));
  }
});

it("opens and searches bytes written by published 1.7.0 without rewriting the index", async () => {
  expect(currentManifest.id).toBe(oldManifest.id);
  expect(currentManifest.id).toBe("ai-knowledge-hub");
  const basePath = semanticIndexBasePath(".obsidian", currentManifest.id);
  expect(basePath).toBe(".obsidian/plugins/ai-knowledge-hub/semantic-index");
  const files = new Map([
    [`${basePath}/vector-manifest.json`, readFileSync(new URL("./tests/fixtures/upgrade-1.7.0/semantic-index/vector-manifest.json", import.meta.url))],
    [`${basePath}/vector-index.bin`, readFileSync(new URL("./tests/fixtures/upgrade-1.7.0/semantic-index/vector-index.bin", import.meta.url))],
  ]);
  const mutate = vi.fn(async () => { throw new Error("An upgrade must not rewrite a healthy existing index"); });
  const persistence: VectorStorePersistence = {
    exists: async (path) => files.has(path),
    readText: async (path) => files.get(path)!.toString("utf8"),
    readBinary: async (path) => Uint8Array.from(files.get(path)!).buffer,
    writeText: mutate, writeBinary: mutate, createDirectory: mutate, rename: mutate,
    // Existing recovery also attempts to remove absent .tmp/.bak files.
    remove: async (path) => { files.delete(path); },
  };
  const store = new LocalVectorStore({ basePath, persistence, dimensions: descriptor.dimensions, embeddingSpaceId: descriptor.embeddingSpaceId });
  await store.initialize();
  expect(store.getStats()).toMatchObject({ initialized: true, count: 2, generation: 1, dimensions: 3 });
  expect(store.listMetadata()).toEqual(descriptor.records);
  expect((await store.search(new Float32Array([1, 0, 0]), { limit: 10 })).map(({ path }) => path).sort())
    .toEqual(["Projects/Alpha.md", "Projects/Бета.md"]);
  expect(mutate).not.toHaveBeenCalled();
  expect(files.size).toBe(2);
});

it("retains every published command ID used by hotkeys and automation", () => {
  const commands: string[] = [];
  for (const name of ["main.ts", "semantic/obsidianSemanticController.ts", "health/obsidian/registerHealth.ts"]) {
    const source = ts.createSourceFile(name, readFileSync(new URL(name, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "addCommand") {
        const arg = node.arguments[0];
        if (ts.isObjectLiteralExpression(arg)) {
          const id = arg.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText(source) === "id");
          if (id && ts.isStringLiteral(id.initializer)) commands.push(`${currentManifest.id}:${id.initializer.text}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(commands).toEqual(expect.arrayContaining(oldCommands));
  expect(commands).toEqual(expect.arrayContaining(publishedCommands));
  expect(commands).toContain("ai-knowledge-hub:review-ai-change-proposals");
  expect(commands).toContain("ai-knowledge-hub:veynrel-open-health");
  expect(new Set(commands).size).toBe(commands.length);
});

it("loads the actual published 1.8.0 fixture without rewriting settings or a compatible index", async () => {
  const fixture = new URL("./tests/fixtures/upgrade-1.8.0/", import.meta.url);
  const stored = JSON.parse(readFileSync(new URL("data.json", fixture), "utf8")) as AIHubSettings;
  const { default: Plugin } = await vi.importActual<typeof import("./main")>("./main.ts");
  const plugin = new Plugin({} as App, currentManifest);
  plugin.loadData = vi.fn(async () => structuredClone(stored));
  const saveData = vi.fn(async () => { throw new Error("Passive upgrade must not save settings"); });
  plugin.saveData = saveData;
  await plugin.loadSettings();
  expect(plugin.settings).toMatchObject(stored);
  expect(plugin.settings.health).toMatchObject({ profileChosen: false, onboardingCompleted: false });
  expect(saveData).not.toHaveBeenCalled();

  const basePath = semanticIndexBasePath(".obsidian", currentManifest.id);
  const manifest = JSON.parse(readFileSync(new URL("semantic-index/vector-manifest.json", fixture), "utf8")) as typeof descriptor;
  const files = new Map(["vector-manifest.json", "vector-index.bin"].map((name) =>
    [`${basePath}/${name}`, readFileSync(new URL(`semantic-index/${name}`, fixture))]));
  const unchanged = new Map([...files].map(([path, bytes]) => [path, Buffer.from(bytes)]));
  const mutate = vi.fn(async () => { throw new Error("Published index must not be rewritten"); });
  const store = new LocalVectorStore({ basePath, dimensions: manifest.dimensions, embeddingSpaceId: manifest.embeddingSpaceId,
    persistence: { exists: async (path) => files.has(path), readText: async (path) => files.get(path)!.toString("utf8"),
      readBinary: async (path) => Uint8Array.from(files.get(path)!).buffer,
      writeText: mutate, writeBinary: mutate, createDirectory: mutate, rename: mutate,
      remove: async (path) => { expect(files.has(path)).toBe(false); } } });
  await store.initialize();
  expect(store.listMetadata()).toEqual(manifest.records);
  expect((await store.search(new Float32Array([1, 0, 0]), { limit: 10 })).map(({ path }) => path)).toContain("Source.md");
  expect(files).toEqual(unchanged); expect(mutate).not.toHaveBeenCalled();
});

it("prepares a consistent 1.9.0 candidate with the existing plugin identity and minimum", () => {
  const pkg = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8")) as { version: string };
  const versions = JSON.parse(readFileSync(new URL("versions.json", import.meta.url), "utf8")) as Record<string, string>;
  expect(pkg.version).toBe("1.9.0"); expect(currentManifest.version).toBe(pkg.version);
  expect(versions[pkg.version]).toBe("1.8.7"); expect(currentManifest.minAppVersion).toBe("1.8.7");
  expect(currentManifest).toMatchObject({ id: "ai-knowledge-hub", name: "Veynrel", isDesktopOnly: false });
});
