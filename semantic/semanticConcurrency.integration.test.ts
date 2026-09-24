import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type {
  DataAdapter,
  RequestUrlParam,
  RequestUrlResponse,
} from "obsidian";

const obsidianMocks = vi.hoisted(() => ({
  requestUrl: vi.fn<
    (request: RequestUrlParam) => Promise<RequestUrlResponse>
  >(),
}));

vi.mock("obsidian", () => ({
  App: class {},
  Plugin: class {},
  TFile: class {},
  Notice: class {
    hide(): void {}
  },
  Modal: class {
    app: unknown;
    titleEl = {};
    contentEl = {};
    constructor(app: unknown) {
      this.app = app;
    }
    open() {}
    close() {}
  },
  ButtonComponent: class {},
  MarkdownView: class {},
  parseLinktext: (path: string) => ({ path, subpath: "" }),
  normalizePath: (value: string) => value.replace(/\/{2,}/g, "/"),
  getLanguage: () => "ru",
  requestUrl: obsidianMocks.requestUrl,
}));

import { TFile } from "obsidian";
import type { EmbeddingSettings } from "../embeddings/types";
import { BaseEmbeddingProvider } from "../embeddings/shared";
import {
  decodeVectorBinary,
  LocalVectorStore,
  VECTOR_BINARY_FILE,
  VECTOR_MANIFEST_FILE,
} from "../vectorStore";
import type { VectorStoreManifest } from "../vectorStore";
import {
  SemanticCompatibilityError,
  SemanticNotReadyError,
} from "./errors";
import { ObsidianSemanticController } from "./obsidianSemanticController";
import {
  resetSemanticStorage,
  semanticIndexBasePath,
} from "./semanticStorageMaintenance";
import { SemanticStoreRegistry } from "./semanticStoreRegistry";
import type { SemanticRuntime } from "./types";
import { AsyncReadWriteBarrier } from "./asyncReadWriteBarrier";
import type { CompanionSyncPort } from "../companionSync";
import type { SemanticControllerDependencies } from "./obsidianSemanticController";
import { SemanticIntelligenceController } from "./product/semanticIntelligenceController";
import { SemanticHealthAnalysisAdapter } from "./health/semanticHealthAnalysisAdapter";
import { HealthPluginController } from "../health/obsidian/healthPluginController";
import { preferencesFixture } from "../health/obsidian/testSupport";
import { createObsidianRecallProduct } from "../recall/product/obsidianRecallProduct";
import { RecallHealthAdapter } from "../recall/product/recallHealthAdapter";
import { candidate as recallCandidate } from "../recall/testSupport";
import { HealthService } from "../health/services/healthService";
import { FindingStore } from "../health/store/findingStore";
import { MemoryHealthStorage } from "../health/store/testSupport";
import * as embeddingFactory from "../embeddings/factory";

const BASE_PATH = semanticIndexBasePath(".obsidian", "ai-knowledge-hub");

type StoredValue =
  | { kind: "text"; value: string }
  | { kind: "binary"; value: ArrayBuffer };

class MemoryDataAdapter {
  readonly files = new Map<string, StoredValue>();
  readonly directories = new Set<string>();

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.directories.has(path);
  }

  async stat(path: string) {
    const entry = this.files.get(path);
    return this.directories.has(path) ? { type: "folder", size: 0, mtime: 0, ctime: 0 }
      : entry ? { type: "file", size: entry.kind === "text" ? entry.value.length : entry.value.byteLength, mtime: 0, ctime: 0 } : null;
  }

  async read(path: string): Promise<string> {
    const stored = this.files.get(path);
    if (stored?.kind !== "text") throw new Error(`Missing text: ${path}`);
    return stored.value;
  }

  async readBinary(path: string): Promise<ArrayBuffer> {
    const stored = this.files.get(path);
    if (stored?.kind !== "binary") throw new Error(`Missing binary: ${path}`);
    return stored.value.slice(0);
  }

  async write(path: string, value: string): Promise<void> {
    this.files.set(path, { kind: "text", value });
  }

  writeBinary = async (path: string, value: ArrayBuffer): Promise<void> => {
    this.files.set(path, { kind: "binary", value: value.slice(0) });
  };

  async mkdir(path: string): Promise<void> {
    this.directories.add(path);
  }

  async remove(path: string): Promise<void> {
    if (!this.files.delete(path) && !this.directories.delete(path)) {
      throw new Error(`Missing path: ${path}`);
    }
  }

  async rename(fromPath: string, toPath: string): Promise<void> {
    const stored = this.files.get(fromPath);
    if (!stored) throw new Error(`Missing path: ${fromPath}`);
    this.files.set(toPath, stored);
    this.files.delete(fromPath);
  }
}

interface ManualGate {
  entered: Promise<void>;
  wait: Promise<void>;
  markEntered(): void;
  release(): void;
}

function manualGate(): ManualGate {
  let markEntered!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    markEntered = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { entered, wait, markEntered, release };
}

interface EmbeddingCall {
  url: string;
  authorization: string;
  texts: string[];
}

interface RequestBlocker {
  matches(call: EmbeddingCall): boolean;
  gate: ManualGate;
  used: boolean;
}

let embeddingCalls: EmbeddingCall[] = [];
let requestBlockers: RequestBlocker[] = [];

function vectorFor(text: string): number[] {
  const normalized = text.toLowerCase();
  if (normalized.includes("beta")) return [0, 1, 0];
  if (normalized.includes("gamma")) return [0, 0, 1];
  return [1, 0, 0];
}

function blockNext(
  matches: (call: EmbeddingCall) => boolean,
): ManualGate {
  const gate = manualGate();
  requestBlockers.push({ matches, gate, used: false });
  return gate;
}

function hasRequestText(text: string): boolean {
  return embeddingCalls.some((call) => call.texts.includes(text));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => typeof item === "string")
  );
}

function installEmbeddingEndpoint(): void {
  obsidianMocks.requestUrl.mockImplementation(async (request) => {
    if (typeof request.body !== "string") {
      throw new Error("Expected a JSON request body.");
    }
    const payload = JSON.parse(request.body) as unknown;
    if (!isObject(payload) || !isStringArray(payload.input)) {
      throw new Error("Expected an embedding input array.");
    }
    const call: EmbeddingCall = {
      url: request.url,
      authorization: request.headers?.Authorization ?? "",
      texts: [...payload.input],
    };
    embeddingCalls.push(call);
    const blocker = requestBlockers.find(
      (candidate) => !candidate.used && candidate.matches(call),
    );
    if (blocker) {
      blocker.used = true;
      blocker.gate.markEntered();
      await blocker.gate.wait;
    }
    const json = {
      data: call.texts.map((text, index) => ({
        index,
        embedding: vectorFor(text),
      })),
    };
    return {
      status: 200,
      headers: {},
      arrayBuffer: new ArrayBuffer(0),
      json,
      text: JSON.stringify(json),
    };
  });
}

function semantic(
  overrides: Partial<EmbeddingSettings> = {},
): EmbeddingSettings {
  return {
    enabled: true,
    embeddingProvider: "openai-compatible",
    embeddingModel: "model-a",
    embeddingBaseUrl: "https://example.test/v1",
    openRouterApiKey: "router-key",
    openAICompatibleApiKey: "key-a",
    ...overrides,
  };
}

interface ControllerSlot {
  runtime: SemanticRuntime;
  signature: string;
  epoch: number;
}

function activeSlot(controller: ObsidianSemanticController): ControllerSlot {
  const slot = (
    controller as unknown as { runtimeSlot: ControllerSlot | null }
  ).runtimeSlot;
  if (!slot) throw new Error("Expected an active runtime slot.");
  return slot;
}

function runtimeStore(runtime: SemanticRuntime): LocalVectorStore {
  const components = (
    runtime as unknown as {
      components: { vectorStore: LocalVectorStore } | null;
    }
  ).components;
  if (!components) throw new Error("Expected initialized runtime components.");
  return components.vectorStore;
}

function previewText(value: unknown): string {
  return JSON.stringify(value);
}

function durableSnapshot(adapter: MemoryDataAdapter): {
  manifest: VectorStoreManifest;
  binary: ReturnType<typeof decodeVectorBinary>;
} {
  const manifestValue = adapter.files.get(
    `${BASE_PATH}/${VECTOR_MANIFEST_FILE}`,
  );
  const binaryValue = adapter.files.get(`${BASE_PATH}/${VECTOR_BINARY_FILE}`);
  if (manifestValue?.kind !== "text" || binaryValue?.kind !== "binary") {
    throw new Error("Expected a complete durable semantic snapshot.");
  }
  return {
    manifest: JSON.parse(manifestValue.value) as VectorStoreManifest,
    binary: decodeVectorBinary(binaryValue.value.slice(0)),
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function flushTask(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  await flushMicrotasks();
}

function createHarness(
  initialSettings = semantic(),
  adapter = new MemoryDataAdapter(),
  autoSyncSuspended = false,
  dependencyOverrides: SemanticControllerDependencies = {},
) {
  const registry = new SemanticStoreRegistry();
  const notices: string[] = [];
  const resetEvents: string[] = [];
  let content = "# Alpha\n\nalpha old committed";
  const file = Object.assign(Object.create(TFile.prototype), {
    path: "Alpha.md",
    extension: "md",
  }) as TFile;
  const files = new Map<string, TFile>([[file.path, file]]);
  const contents = new Map<string, string>([[file.path, content]]);
  const vaultListeners = new Map<
    string,
    Array<(...args: unknown[]) => void>
  >();
  const layoutReadyCallbacks: Array<() => void> = [];
  let durableAutoSyncSuspended = autoSyncSuspended;
  const app = {
    vault: {
      configDir: ".obsidian",
      adapter,
      getMarkdownFiles: vi.fn(() => [...files.values()]),
      getAbstractFileByPath: vi.fn((path: string) => files.get(path) ?? null),
      cachedRead: vi.fn(async (target: TFile) => {
        const value = contents.get(target.path);
        if (value === undefined) throw new Error("missing file");
        return value;
      }),
      on: vi.fn((name: string, callback: (...args: unknown[]) => void) => {
        const callbacks = vaultListeners.get(name) ?? [];
        callbacks.push(callback);
        vaultListeners.set(name, callbacks);
        return { name, callback };
      }),
    },
    metadataCache: {
      getFileCache: vi.fn(() => null),
    },
    workspace: {
      getActiveFile: vi.fn(() => file),
      onLayoutReady: vi.fn((callback: () => void) => {
        layoutReadyCallbacks.push(callback);
      }),
    },
  };
  const pluginSettings = {
    semantic: initialSettings,
    semanticAutoSyncSuspended: autoSyncSuspended,
    companion: {
      enabled: false,
      endpoint: "http://127.0.0.1:27124",
      token: "",
      timeoutMs: 5000,
      vaultId: "11111111-1111-4111-8111-111111111111",
    },
  };
  const plugin = {
    app,
    manifest: { id: "ai-knowledge-hub" },
    settings: pluginSettings,
    addCommand: vi.fn(),
    registerEvent: vi.fn(),
    saveSettings: vi.fn(async () => {
      durableAutoSyncSuspended =
        pluginSettings.semanticAutoSyncSuspended === true;
    }),
  };
  const resetStorage = vi.fn(async (
    targetAdapter: DataAdapter,
    basePath: string,
  ) => {
    resetEvents.push("reset-start");
    await resetSemanticStorage(targetAdapter, basePath);
    resetEvents.push("reset-end");
  });
  const controller = new ObsidianSemanticController(plugin as never, {
    confirm: vi.fn(async () => true),
    notice: (message) => {
      notices.push(message);
      return { hide() {} };
    },
    resetStorage,
    storeRegistry: registry,
    autoSyncDebounceMs: 10,
    ...dependencyOverrides,
  });
  return {
    adapter,
    registry,
    notices,
    resetEvents,
    resetStorage,
    controller,
    plugin,
    durableAutoSyncSuspended() {
      return durableAutoSyncSuspended;
    },
    setContent(value: string) {
      content = value;
      contents.set(file.path, value);
    },
    registerAutomaticSync() {
      controller.registerAutomaticSync();
    },
    fireLayoutReady() {
      for (const callback of layoutReadyCallbacks) callback();
    },
    emit(name: string, ...args: unknown[]) {
      for (const callback of vaultListeners.get(name) ?? []) callback(...args);
    },
    createFile(path: string, value: string): TFile {
      const created = Object.assign(Object.create(TFile.prototype), {
        path,
        extension: path.split(".").at(-1) ?? "",
      }) as TFile;
      files.set(path, created);
      contents.set(path, value);
      for (const callback of vaultListeners.get("create") ?? []) {
        callback(created);
      }
      return created;
    },
    modifyFile(path: string, value: string): void {
      const target = files.get(path);
      if (!target) throw new Error("missing file");
      contents.set(path, value);
      if (target === file) content = value;
      for (const callback of vaultListeners.get("modify") ?? []) {
        callback(target);
      }
    },
    deleteFile(path: string): void {
      const target = files.get(path);
      if (!target) throw new Error("missing file");
      files.delete(path);
      contents.delete(path);
      for (const callback of vaultListeners.get("delete") ?? []) {
        callback(target);
      }
    },
    renameFile(oldPath: string, newPath: string): TFile {
      const target = files.get(oldPath);
      const value = contents.get(oldPath);
      if (!target || value === undefined) throw new Error("missing file");
      files.delete(oldPath);
      contents.delete(oldPath);
      target.path = newPath;
      target.extension = newPath.split(".").at(-1) ?? "";
      files.set(newPath, target);
      contents.set(newPath, value);
      for (const callback of vaultListeners.get("rename") ?? []) {
        callback(target, oldPath);
      }
      return target;
    },
  };
}

beforeAll(() => {
  vi.stubGlobal("window", {
    setTimeout: (callback: () => void, delayMs: number) =>
      setTimeout(callback, delayMs) as unknown as number,
    clearTimeout: (timer: number) => clearTimeout(timer),
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  embeddingCalls = [];
  requestBlockers = [];
  obsidianMocks.requestUrl.mockReset();
  installEmbeddingEndpoint();
});

describe("semantic read/write barrier with real services and store", () => {
  it("Semantic Health reuses real discovery with zero provider calls, Markdown reads/writes or preview persistence", async () => {
    const harness = createHarness();
    harness.setContent("# Alpha\n\nalpha synthetic PRIVATE_PREVIEW content with enough detail for duplicate discovery");
    harness.createFile("Near.md", "# Near\n\nalpha synthetic PRIVATE_PREVIEW content with enough detail for duplicate discovery");
    await harness.controller.indexVault(); // Fixture preparation uses the mocked provider; analysis below must not.
    const adapter = new SemanticHealthAnalysisAdapter(harness.controller);
    const storage = new MemoryHealthStorage();
    const source = { capture: vi.fn(), captureRevision: vi.fn() };
    const service = new HealthService(new FindingStore(storage), source, { semanticAnalysis: adapter }); await service.initialize();
    const mutations = { modify: vi.fn(), create: vi.fn(), delete: vi.fn(), rename: vi.fn() };
    Object.assign(harness.plugin.app.vault, mutations);
    const embed = vi.spyOn(BaseEmbeddingProvider.prototype, "embed");
    const dimensions = vi.spyOn(BaseEmbeddingProvider.prototype, "dimensions");
    const test = vi.spyOn(embeddingFactory, "testEmbeddingConnection");
    const discovery = vi.spyOn(activeSlot(harness.controller).runtime, "findPotentialDuplicates");
    const markdown = harness.plugin.app.vault.cachedRead; markdown.mockClear();
    harness.plugin.app.vault.getMarkdownFiles.mockClear(); obsidianMocks.requestUrl.mockClear(); embeddingCalls = [];
    const write = vi.spyOn(harness.adapter, "write"); const writeBinary = vi.spyOn(harness.adapter, "writeBinary");
    try {
      const outcome = await service.runSemanticScan(new AbortController().signal);
      expect(outcome).toMatchObject({ findingsCommitted: true, historyRecorded: true, scan: { status: "completed", notesSeen: 0, findingsCreated: 1 } });
      expect(discovery).toHaveBeenCalledExactlyOnceWith({ limit: 100, matchesPerDocument: 3 });
      expect(service.listFindings()[0]).toMatchObject({ source: "semantic", notePaths: ["Alpha.md", "Near.md"], evidence: [{ kind: "similarity-score", value: 1 }] });
      expect(obsidianMocks.requestUrl).not.toHaveBeenCalled(); expect(embed).not.toHaveBeenCalled(); expect(dimensions).not.toHaveBeenCalled(); expect(test).not.toHaveBeenCalled();
      expect(embeddingCalls).toEqual([]); expect(markdown).not.toHaveBeenCalled(); expect(harness.plugin.app.vault.getMarkdownFiles).not.toHaveBeenCalled();
      for (const mutation of Object.values(mutations)) expect(mutation).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled(); expect(writeBinary).not.toHaveBeenCalled(); expect(source.capture).not.toHaveBeenCalled();
      expect(storage.files.get("findings.json")).not.toMatch(/PRIVATE_PREVIEW|preview|content|vectors|embedding/iu);
    } finally { embed.mockRestore(); dimensions.mockRestore(); test.mockRestore(); }
  });

  it("cached semantic revisions reject settings/rebuilt runtime changes even when vector counters match", async () => {
    const harness = createHarness(); await harness.controller.indexVault();
    const adapter = new SemanticHealthAnalysisAdapter(harness.controller);
    const signal = new AbortController().signal;
    const before = (await adapter.analyzeDuplicates(signal)).revision;
    await harness.controller.rebuildIndex();
    const after = (await adapter.analyzeDuplicates(signal)).revision;
    expect(after.vectorCount).toBe(before.vectorCount); expect(after.vectorGeneration).toBe(before.vectorGeneration);
    expect(after.runtimeRevision).toBeGreaterThan(before.runtimeRevision);
    await expect(adapter.verifyCurrent(before, signal)).rejects.toMatchObject({ code: "semantic-index-changed" });
    obsidianMocks.requestUrl.mockClear();
    harness.plugin.settings.semantic.embeddingBaseUrl = "https://changed.example.test/v1";
    expect(harness.controller.getCachedIndexState().kind).not.toBe("ready");
    await expect(adapter.verifyCurrent(after, signal)).rejects.toMatchObject({ code: "semantic-index-changed" });
    harness.controller.notifySettingsChanged({ reconcile: false });
    expect(harness.controller.getCachedIndexState().configurationRevision).toBeGreaterThan(after.configurationRevision);
    expect(obsidianMocks.requestUrl).not.toHaveBeenCalled();
  });

  it("cached semantic revisions reject an ongoing reinspection of an already initialized runtime", async () => {
    const harness = createHarness(); await harness.controller.indexVault();
    const adapter = new SemanticHealthAnalysisAdapter(harness.controller); const signal = new AbortController().signal;
    const revision = (await adapter.analyzeDuplicates(signal)).revision;
    const hold = manualGate();
    const initialize = vi.spyOn(activeSlot(harness.controller).runtime, "initialize").mockImplementationOnce(async () => { hold.markEntered(); await hold.wait; });
    const checking = harness.controller.refreshSemanticStatus(); await hold.entered;
    try {
      expect(harness.controller.getSemanticStatus().kind).toBe("initializing");
      await expect(adapter.verifyCurrent(revision, signal)).rejects.toMatchObject({ code: "semantic-index-changed" });
    } finally { hold.release(); await checking; initialize.mockRestore(); }
    await expect(adapter.verifyCurrent(revision, signal)).resolves.toBeUndefined();
  });

  it("keeps duplicate discovery on one committed snapshot during indexing", async () => {
    const harness = createHarness();
    harness.setContent(
      "# Alpha\n\nalpha old committed semantic content with enough detail",
    );
    harness.createFile(
      "Near.md",
      "# Near\n\nalpha old committed semantic content with enough detail",
    );
    await harness.controller.indexVault();
    const store = harness.registry.peek(BASE_PATH)?.store as LocalVectorStore;
    expect(await harness.controller.findPotentialDuplicates()).toHaveLength(1);

    harness.modifyFile(
      "Near.md",
      "# Near\n\nbeta replacement semantic content with enough detail",
    );
    const pendingEmbedding = blockNext((call) =>
      call.texts.some((text) => text.includes("beta replacement semantic")),
    );
    const pendingIndex = harness.controller.indexVault();
    await pendingEmbedding.entered;

    const during = await harness.controller.findPotentialDuplicates();
    expect(during.map((pair) => [pair.leftPath, pair.rightPath])).toEqual([
      ["Alpha.md", "Near.md"],
    ]);
    expect(store.getStats().generation).toBe(1);

    pendingEmbedding.release();
    await pendingIndex;
    expect(await harness.controller.findPotentialDuplicates()).toEqual([]);
    expect(store.getStats().generation).toBe(2);
  });

  it("makes Clear wait for an active duplicate read lease", async () => {
    const harness = createHarness();
    await harness.controller.indexVault();
    const runtime = activeSlot(harness.controller).runtime;
    const store = runtimeStore(runtime);
    const clearSpy = vi.spyOn(store, "clear");
    const gate = manualGate();
    vi.spyOn(runtime, "findPotentialDuplicates").mockImplementationOnce(
      async () => {
        gate.markEntered();
        await gate.wait;
        return [];
      },
    );

    const discovery = harness.controller.findPotentialDuplicates();
    await gate.entered;
    const clear = harness.controller.clearIndex();
    await flushTask();
    expect(clearSpy).not.toHaveBeenCalled();

    gate.release();
    await discovery;
    await clear;
    expect(clearSpy).toHaveBeenCalledOnce();
  });

  it("makes Rebuild wait for an active Similar Notes read lease", async () => {
    const harness = createHarness();
    await harness.controller.indexVault();
    const runtime = activeSlot(harness.controller).runtime;
    const gate = manualGate();
    vi.spyOn(runtime, "findSimilarNotes").mockImplementationOnce(async () => {
      gate.markEntered();
      await gate.wait;
      return [];
    });

    const discovery = harness.controller.findSimilarNotes("Alpha.md");
    await gate.entered;
    const rebuild = harness.controller.rebuildIndex();
    await flushTask();
    expect(harness.resetStorage).not.toHaveBeenCalled();

    gate.release();
    await discovery;
    await rebuild;
    expect(harness.resetStorage).toHaveBeenCalledOnce();
    await expect(
      harness.controller.findSimilarNotes("Alpha.md"),
    ).resolves.toEqual([]);
  });

  it("lets ordinary indexing overlap search while exposing only committed generations", async () => {
    const harness = createHarness();
    await harness.controller.indexVault();
    const store = harness.registry.peek(BASE_PATH)?.store;
    expect(store).toBeInstanceOf(LocalVectorStore);
    expect(store?.getStats().generation).toBe(1);

    harness.setContent("# Alpha\n\nbeta pending generation two");
    const pendingEmbedding = blockNext((call) =>
      call.texts.some((text) => text.includes("beta pending generation two")),
    );
    const pendingIndex = harness.controller.indexVault();
    await pendingEmbedding.entered;

    const during = await harness.controller.search("alpha committed query");
    expect(previewText(during)).toContain("alpha old committed");
    expect(previewText(during)).not.toContain("beta pending generation two");
    expect(store?.getStats().generation).toBe(1);
    expect(durableSnapshot(harness.adapter).manifest.generation).toBe(1);

    pendingEmbedding.release();
    await pendingIndex;
    const after = await harness.controller.search("beta committed query");
    expect(previewText(after)).toContain("beta pending generation two");
    expect(store?.getStats().generation).toBe(2);
    const durable = durableSnapshot(harness.adapter);
    expect(durable.manifest.generation).toBe(2);
    expect(durable.binary.generation).toBe(2);
  });

  it("waits for an old search, gives clear priority, and makes queued search observe empty", async () => {
    const harness = createHarness();
    await harness.controller.indexVault();
    const store = harness.registry.peek(BASE_PATH)?.store as LocalVectorStore;
    const clearSpy = vi.spyOn(store, "clear");
    const oldSearchGate = blockNext((call) =>
      call.texts.includes("clear-old-search"),
    );

    const oldSearch = harness.controller.search("clear-old-search");
    await oldSearchGate.entered;
    const clear = harness.controller.clearIndex();
    await flushMicrotasks();
    expect(clearSpy).not.toHaveBeenCalled();

    const queuedSearch = harness.controller.search("clear-queued-search");
    await flushMicrotasks();
    expect(hasRequestText("clear-queued-search")).toBe(false);

    oldSearchGate.release();
    expect(previewText(await oldSearch)).toContain("alpha old committed");
    await clear;
    await expect(queuedSearch).rejects.toBeInstanceOf(SemanticNotReadyError);
    expect(clearSpy).toHaveBeenCalledOnce();
    expect(store.getStats()).toMatchObject({ count: 0, generation: 2 });
    expect(durableSnapshot(harness.adapter).manifest).toMatchObject({
      count: 0,
      generation: 2,
    });
    expect(harness.resetStorage).not.toHaveBeenCalled();

    await harness.controller.clearIndex();
    expect(store.getStats()).toMatchObject({ count: 0, generation: 3 });
    expect(harness.registry.peek(BASE_PATH)?.store).toBe(store);
  });

  it("waits for two searches, holds rebuild through reset and reconcile, then admits a third search", async () => {
    const harness = createHarness();
    await harness.controller.indexVault();
    const oldStore = harness.registry.peek(BASE_PATH)?.store;
    const firstGate = blockNext((call) =>
      call.texts.includes("rebuild-old-search-one"),
    );
    const secondGate = blockNext((call) =>
      call.texts.includes("rebuild-old-search-two"),
    );
    const firstSearch = harness.controller.search("rebuild-old-search-one");
    const secondSearch = harness.controller.search("rebuild-old-search-two");
    await Promise.all([firstGate.entered, secondGate.entered]);

    harness.setContent("# Alpha\n\nbeta rebuilt content");
    const rebuild = harness.controller.rebuildIndex();
    await flushMicrotasks();
    expect(harness.resetStorage).not.toHaveBeenCalled();

    const thirdSearch = harness.controller.search("beta-search-after-rebuild");
    await flushMicrotasks();
    expect(hasRequestText("beta-search-after-rebuild")).toBe(false);

    firstGate.release();
    expect(previewText(await firstSearch)).toContain("alpha old committed");
    await flushMicrotasks();
    expect(harness.resetStorage).not.toHaveBeenCalled();

    secondGate.release();
    expect(previewText(await secondSearch)).toContain("alpha old committed");
    await rebuild;
    const rebuiltResults = await thirdSearch;
    expect(previewText(rebuiltResults)).toContain("beta rebuilt content");
    expect(harness.resetEvents).toEqual(["reset-start", "reset-end"]);
    const newStore = harness.registry.peek(BASE_PATH)?.store;
    expect(newStore).toBeInstanceOf(LocalVectorStore);
    expect(newStore).not.toBe(oldStore);
    expect(newStore?.getStats()).toMatchObject({ count: 1, generation: 1 });
    expect(durableSnapshot(harness.adapter).manifest.generation).toBe(1);
  });

  it("evicts the stale registry entry and releases exclusive after a failed rebuild reset", async () => {
    const harness = createHarness();
    await harness.controller.indexVault();
    const oldStore = harness.registry.peek(BASE_PATH)?.store;
    harness.resetStorage.mockRejectedValueOnce(new Error("reset failed"));

    await harness.controller.rebuildIndex();
    expect(harness.controller.getSemanticStatus().kind).toBe("error");
    expect(harness.registry.size).toBe(0);

    const recovered = await harness.controller.search("after failed rebuild");
    expect(previewText(recovered)).toContain("alpha old committed");
    const recoveredStore = harness.registry.peek(BASE_PATH)?.store;
    expect(recoveredStore).toBeInstanceOf(LocalVectorStore);
    expect(recoveredStore).not.toBe(oldStore);
    expect(recoveredStore?.getStats()).toMatchObject({
      count: 1,
      generation: 1,
    });
  });

  it("releases exclusive and busy state after failed clear so the next mutation succeeds", async () => {
    const harness = createHarness();
    await harness.controller.indexVault();
    const store = harness.registry.peek(BASE_PATH)?.store as LocalVectorStore;
    const clearSpy = vi
      .spyOn(store, "clear")
      .mockRejectedValueOnce(new Error("clear failed"));

    await harness.controller.clearIndex();
    expect(harness.controller.getSemanticStatus().kind).toBe("error");
    expect(previewText(await harness.controller.search("after-failed-clear")))
      .toContain("alpha old committed");

    harness.setContent("# Alpha\n\nbeta mutation after failed clear");
    await harness.controller.indexCurrentNote();
    expect(store.getStats()).toMatchObject({ count: 1, generation: 2 });
    expect(harness.controller.getSemanticStatus().kind).toBe("ready");
    clearSpy.mockRestore();
    await store.clear();
  });
});

describe("one LocalVectorStore per basePath across settings epochs", () => {
  it("rotates only the API key while sharing one store through generations 0, 1, and 2", async () => {
    const harness = createHarness();
    const pendingEmbedding = blockNext(
      (call) =>
        call.authorization === "Bearer key-a" &&
        call.texts.some((text) => text.includes("alpha old committed")),
    );
    const oldIndex = harness.controller.indexVault();
    await pendingEmbedding.entered;
    const runtimeA = activeSlot(harness.controller).runtime;
    const storeA = runtimeStore(runtimeA);
    expect(storeA.getStats()).toMatchObject({ count: 0, generation: 0 });
    expect(harness.adapter.files.has(`${BASE_PATH}/${VECTOR_MANIFEST_FILE}`))
      .toBe(false);

    harness.plugin.settings.semantic.openAICompatibleApiKey = "key-b";
    harness.controller.notifySettingsChanged();
    await harness.controller.prepareSearch();
    const runtimeB = activeSlot(harness.controller).runtime;
    const storeB = runtimeStore(runtimeB);
    expect(runtimeB).not.toBe(runtimeA);
    expect(storeB).toBe(storeA);
    expect(harness.registry.size).toBe(1);
    expect(storeB.getStats().generation).toBe(0);

    pendingEmbedding.release();
    await oldIndex;
    expect(activeSlot(harness.controller).runtime).toBe(runtimeB);
    expect(storeB.getStats()).toMatchObject({ count: 1, generation: 1 });
    expect(previewText(await harness.controller.search("alpha through key b")))
      .toContain("alpha old committed");

    harness.setContent("# Alpha\n\nbeta written through key b");
    await harness.controller.indexCurrentNote();
    expect(storeB.getStats()).toMatchObject({ count: 1, generation: 2 });
    const durable = durableSnapshot(harness.adapter);
    expect(durable.manifest.generation).toBe(2);
    expect(durable.binary.generation).toBe(2);
    expect(harness.registry.size).toBe(1);
    expect(
      embeddingCalls.some(
        (call) =>
          call.authorization === "Bearer key-b" &&
          call.texts.some((text) => text.includes("beta written through key b")),
      ),
    ).toBe(true);
    expect(JSON.stringify(harness.notices)).not.toContain("key-a");
    expect(JSON.stringify(harness.notices)).not.toContain("key-b");
  });

  it.each([
    {
      name: "model",
      change: (settings: EmbeddingSettings) => {
        settings.embeddingModel = "model-b";
      },
    },
    {
      name: "base URL",
      change: (settings: EmbeddingSettings) => {
        settings.embeddingBaseUrl = "https://other.example.test/v1";
      },
    },
    {
      name: "provider",
      change: (settings: EmbeddingSettings) => {
        settings.embeddingProvider = "openrouter";
      },
    },
  ])("rejects a $name mismatch without constructing a second store", async ({ change }) => {
    const harness = createHarness();
    const pendingEmbedding = blockNext((call) =>
      call.texts.some((text) => text.includes("alpha old committed")),
    );
    const oldIndex = harness.controller.indexVault();
    await pendingEmbedding.entered;
    const oldStore = harness.registry.peek(BASE_PATH)?.store;
    const originalSettings = { ...harness.plugin.settings.semantic };

    change(harness.plugin.settings.semantic);
    harness.controller.notifySettingsChanged();
    await expect(harness.controller.prepareSearch()).rejects.toBeInstanceOf(
      SemanticCompatibilityError,
    );
    expect(harness.registry.size).toBe(1);
    expect(harness.registry.peek(BASE_PATH)?.store).toBe(oldStore);
    expect(oldStore?.getStats().generation).toBe(0);
    expect(harness.adapter.files.has(`${BASE_PATH}/${VECTOR_MANIFEST_FILE}`))
      .toBe(false);

    pendingEmbedding.release();
    await oldIndex;
    expect(oldStore?.getStats()).toMatchObject({ count: 1, generation: 1 });
    expect(durableSnapshot(harness.adapter).manifest.generation).toBe(1);

    harness.plugin.settings.semantic = originalSettings;
    harness.controller.notifySettingsChanged();
    await harness.controller.prepareSearch();
    expect(harness.registry.peek(BASE_PATH)?.store).toBe(oldStore);
    expect(previewText(await harness.controller.search("alpha restored")))
      .toContain("alpha old committed");
  });

  it("does no runtime I/O while disabled and reuses the compatible store after re-enable", async () => {
    const harness = createHarness();
    const pendingEmbedding = blockNext((call) =>
      call.texts.some((text) => text.includes("alpha old committed")),
    );
    const oldIndex = harness.controller.indexVault();
    await pendingEmbedding.entered;
    const oldRuntime = activeSlot(harness.controller).runtime;
    const oldStore = runtimeStore(oldRuntime);

    harness.plugin.settings.semantic.enabled = false;
    harness.controller.notifySettingsChanged();
    const callsBeforeDisabledOperation = embeddingCalls.length;
    await expect(harness.controller.prepareSearch()).rejects.toBeInstanceOf(
      SemanticNotReadyError,
    );
    expect(embeddingCalls).toHaveLength(callsBeforeDisabledOperation);
    expect(harness.registry.peek(BASE_PATH)?.store).toBe(oldStore);

    harness.plugin.settings.semantic.enabled = true;
    harness.controller.notifySettingsChanged();
    await harness.controller.prepareSearch();
    const currentRuntime = activeSlot(harness.controller).runtime;
    expect(currentRuntime).not.toBe(oldRuntime);
    expect(runtimeStore(currentRuntime)).toBe(oldStore);

    pendingEmbedding.release();
    await oldIndex;
    expect(activeSlot(harness.controller).runtime).toBe(currentRuntime);
    expect(oldStore.getStats()).toMatchObject({ count: 1, generation: 1 });
    expect(previewText(await harness.controller.search("alpha re-enabled")))
      .toContain("alpha old committed");
  });
});

describe("provider-free cold open and metadata status", () => {
  it("keeps missing-index search preparation and refresh provider-free", async () => {
    const dimensions = vi.spyOn(BaseEmbeddingProvider.prototype, "dimensions");
    const embed = vi.spyOn(BaseEmbeddingProvider.prototype, "embed");
    try {
      const harness = createHarness();
      const searchStats = await harness.controller.prepareSearch();
      expect(searchStats).toMatchObject({ initialized: false, vectorCount: 0 });
      expect(harness.controller.getSemanticStatus().kind).toBe(
        "not-initialized",
      );
      expect(dimensions).not.toHaveBeenCalled();
      expect(embed).not.toHaveBeenCalled();
      expect(harness.registry.size).toBe(0);
      expect(harness.plugin.app.vault.cachedRead).not.toHaveBeenCalled();

      const status = await harness.controller.refreshSemanticStatus();
      expect(status.kind).toBe("not-initialized");
      expect(dimensions).not.toHaveBeenCalled();
      expect(embed).not.toHaveBeenCalled();
    } finally {
      dimensions.mockRestore();
      embed.mockRestore();
    }
  });

  it("uses dimensions once for first explicit index and never for cold status", async () => {
    const dimensions = vi.spyOn(BaseEmbeddingProvider.prototype, "dimensions");
    const embed = vi.spyOn(BaseEmbeddingProvider.prototype, "embed");
    try {
      const first = createHarness();
      await first.controller.indexVault();
      expect(dimensions).toHaveBeenCalledOnce();
      expect(embed).toHaveBeenCalledTimes(2);
      expect(durableSnapshot(first.adapter).manifest).toMatchObject({
        count: 1,
        generation: 1,
      });

      dimensions.mockClear();
      embed.mockClear();
      const restarted = createHarness(semantic(), first.adapter);
      const status = await restarted.controller.refreshSemanticStatus();
      expect(status).toMatchObject({
        kind: "ready",
        vectorCount: 1,
        vectorGeneration: 1,
        dimensions: 3,
      });
      expect(dimensions).not.toHaveBeenCalled();
      expect(embed).not.toHaveBeenCalled();
    } finally {
      dimensions.mockRestore();
      embed.mockRestore();
    }
  });

  it("cold-opens an unchanged current note without provider or mutation", async () => {
    const first = createHarness();
    await first.controller.indexVault();
    const dimensions = vi.spyOn(BaseEmbeddingProvider.prototype, "dimensions");
    const embed = vi.spyOn(BaseEmbeddingProvider.prototype, "embed");
    const applyChanges = vi.spyOn(LocalVectorStore.prototype, "applyChanges");
    try {
      const restarted = createHarness(semantic(), first.adapter);
      await restarted.controller.indexCurrentNote();
      expect(dimensions).not.toHaveBeenCalled();
      expect(embed).not.toHaveBeenCalled();
      expect(applyChanges).not.toHaveBeenCalled();
      expect(restarted.registry.peek(BASE_PATH)?.store.getStats()).toMatchObject({
        count: 1,
        generation: 1,
      });
      expect(restarted.notices).toContain(
        "Заметка уже актуальна в семантическом индексе.",
      );
    } finally {
      dimensions.mockRestore();
      embed.mockRestore();
      applyChanges.mockRestore();
    }
  });

  it("does not create a new index for a current note with no chunks", async () => {
    const dimensions = vi.spyOn(BaseEmbeddingProvider.prototype, "dimensions");
    const embed = vi.spyOn(BaseEmbeddingProvider.prototype, "embed");
    try {
      const harness = createHarness();
      harness.setContent("   \n\n");
      await harness.controller.indexCurrentNote();
      expect(dimensions).not.toHaveBeenCalled();
      expect(embed).not.toHaveBeenCalled();
      expect(harness.registry.size).toBe(0);
      expect(harness.plugin.app.vault.cachedRead).toHaveBeenCalledOnce();
      expect(harness.controller.getSemanticStatus().kind).toBe(
        "not-initialized",
      );
    } finally {
      dimensions.mockRestore();
      embed.mockRestore();
    }
  });

  it("does not create a missing initial index from the current-note command", async () => {
    const dimensions = vi.spyOn(BaseEmbeddingProvider.prototype, "dimensions");
    const embed = vi.spyOn(BaseEmbeddingProvider.prototype, "embed");
    try {
      const harness = createHarness();
      await harness.controller.indexCurrentNote();
      expect(dimensions).not.toHaveBeenCalled();
      expect(embed).not.toHaveBeenCalled();
      expect(harness.registry.size).toBe(0);
      expect(harness.adapter.files.size).toBe(0);
      expect(harness.notices).toContain(
        "Семантический индекс пуст. Сначала обновите индекс Vault.",
      );
    } finally {
      dimensions.mockRestore();
      embed.mockRestore();
    }
  });

  it("cold-opens a valid empty index without provider calls", async () => {
    const first = createHarness();
    await first.controller.indexVault();
    const dimensions = vi.spyOn(BaseEmbeddingProvider.prototype, "dimensions");
    const embed = vi.spyOn(BaseEmbeddingProvider.prototype, "embed");
    try {
      const clearing = createHarness(semantic(), first.adapter);
      await clearing.controller.clearIndex();
      expect(clearing.registry.peek(BASE_PATH)?.store.getStats()).toMatchObject({
        count: 0,
        generation: 2,
      });
      expect(dimensions).not.toHaveBeenCalled();
      expect(embed).not.toHaveBeenCalled();

      const restarted = createHarness(semantic(), first.adapter);
      const stats = await restarted.controller.prepareSearch();
      expect(stats).toMatchObject({
        initialized: true,
        vectorCount: 0,
        vectorGeneration: 2,
        dimensions: 3,
      });
      expect(dimensions).not.toHaveBeenCalled();
      expect(embed).not.toHaveBeenCalled();
    } finally {
      dimensions.mockRestore();
      embed.mockRestore();
    }
  });

  it("detects incompatible cold settings without provider or storage reset", async () => {
    const first = createHarness();
    await first.controller.indexVault();
    const originalFiles = new Map(first.adapter.files);
    const dimensions = vi.spyOn(BaseEmbeddingProvider.prototype, "dimensions");
    const embed = vi.spyOn(BaseEmbeddingProvider.prototype, "embed");
    try {
      const incompatible = createHarness(
        semantic({ embeddingModel: "model-b" }),
        first.adapter,
      );
      const status = await incompatible.controller.refreshSemanticStatus();
      expect(status.kind).toBe("incompatible");
      expect(dimensions).not.toHaveBeenCalled();
      expect(embed).not.toHaveBeenCalled();
      expect(incompatible.resetStorage).not.toHaveBeenCalled();
      expect(incompatible.adapter.files).toEqual(originalFiles);

      incompatible.plugin.settings.semantic = semantic();
      incompatible.controller.notifySettingsChanged();
      const restored = await incompatible.controller.refreshSemanticStatus();
      expect(restored).toMatchObject({ kind: "ready", vectorCount: 1 });
      expect(dimensions).not.toHaveBeenCalled();
      expect(embed).not.toHaveBeenCalled();
    } finally {
      dimensions.mockRestore();
      embed.mockRestore();
    }
  });

  it("keeps full LocalVectorStore validation authoritative after the descriptor probe", async () => {
    const first = createHarness();
    await first.controller.indexVault();
    first.adapter.files.set(`${BASE_PATH}/${VECTOR_BINARY_FILE}`, {
      kind: "binary",
      value: new Uint8Array([1, 2, 3]).buffer,
    });
    const dimensions = vi.spyOn(BaseEmbeddingProvider.prototype, "dimensions");
    const embed = vi.spyOn(BaseEmbeddingProvider.prototype, "embed");
    try {
      const restarted = createHarness(semantic(), first.adapter);
      const status = await restarted.controller.refreshSemanticStatus();
      expect(status.kind).toBe("error");
      expect(dimensions).not.toHaveBeenCalled();
      expect(embed).not.toHaveBeenCalled();
      expect(restarted.registry.size).toBe(0);
      expect(restarted.notices.join(" ")).toContain(
        "Не удалось безопасно изменить файлы semantic index.",
      );
    } finally {
      dimensions.mockRestore();
      embed.mockRestore();
    }
  });

  it("rotates the API key and opens the persisted store without dimensions", async () => {
    const first = createHarness();
    await first.controller.indexVault();
    const dimensions = vi.spyOn(BaseEmbeddingProvider.prototype, "dimensions");
    const embed = vi.spyOn(BaseEmbeddingProvider.prototype, "embed");
    try {
      const restarted = createHarness(
        semantic({ openAICompatibleApiKey: "key-b" }),
        first.adapter,
      );
      await restarted.controller.refreshSemanticStatus();
      expect(dimensions).not.toHaveBeenCalled();
      expect(embed).not.toHaveBeenCalled();

      await restarted.controller.findSimilarNotes("Alpha.md");
      await restarted.controller.findPotentialDuplicates();
      expect(dimensions).not.toHaveBeenCalled();
      expect(embed).not.toHaveBeenCalled();

      await restarted.controller.search("alpha with rotated key");
      expect(dimensions).not.toHaveBeenCalled();
      expect(embed).toHaveBeenCalledOnce();
      expect(embeddingCalls.at(-1)?.authorization).toBe("Bearer key-b");
    } finally {
      dimensions.mockRestore();
      embed.mockRestore();
    }
  });
});

async function drainAutomaticSync(): Promise<void> {
  await vi.advanceTimersByTimeAsync(10);
  for (let index = 0; index < 40; index++) await Promise.resolve();
}

describe("automatic semantic index synchronization", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function product(harness: ReturnType<typeof createHarness>) {
    return new SemanticIntelligenceController({
      get: () => ({ ...harness.plugin.settings.semantic }),
      update: async (next) => {
        harness.plugin.settings.semantic = { ...next };
        harness.controller.notifySettingsChanged({ reconcile: false });
        return { ...next };
      },
    }, harness.controller);
  }

  it("MVP product subscribers observe legacy commands and automatic sync, and detach independently", async () => {
    const harness = createHarness(); harness.registerAutomaticSync();
    const setup = product(harness), first: string[] = [], second: string[] = [];
    const stopFirst = setup.subscribe(() => { first.push(setup.getSnapshot().state); });
    const stopSecond = setup.subscribe(() => { second.push(setup.getSnapshot().state); });
    const stopThrowing = setup.subscribe(() => { throw new Error("detached render"); });
    const gate = manualGate();
    const exists = vi.spyOn(harness.adapter, "exists").mockImplementationOnce(async () => { gate.markEntered(); await gate.wait; return false; });
    const check = harness.controller.refreshSemanticStatus(); await gate.entered; await flushMicrotasks();
    expect(setup.getSnapshot().busy).toBe(true); // A cached read cannot hide metadata inspection before its runtime exists.
    gate.release(); await check; exists.mockRestore(); first.length = 0; second.length = 0;
    await harness.controller.indexVault(); // Advanced command, outside the product controller.
    expect(first).toContain("busy"); expect(first.at(-1)).toBe("ready"); expect(second).toEqual(first);
    stopFirst(); const before = [...first]; second.length = 0;
    harness.modifyFile("Alpha.md", "# Alpha\n\nbeta automatic update"); await drainAutomaticSync();
    expect(second).toContain("busy"); expect(second.at(-1)).toBe("ready"); expect(first).toEqual(before);
    second.length = 0; harness.plugin.settings.semantic.enabled = false; harness.controller.notifySettingsChanged(); await flushMicrotasks();
    expect(second.at(-1)).toBe("disabled");
    stopSecond(); stopThrowing(); second.length = 0;
    harness.plugin.settings.semantic.enabled = true; harness.controller.notifySettingsChanged({ reconcile: false }); await flushMicrotasks();
    expect(second).toEqual([]); await harness.controller.dispose();
  });

  it.each(["local", "cloud", "custom"] as const)("Simple %s Connect never enumerates or reads notes and never creates an index", async (mode) => {
    const harness = createHarness(semantic({ enabled: false })); harness.registerAutomaticSync(); harness.fireLayoutReady();
    const read = harness.plugin.app.vault.cachedRead; const enumerate = harness.plugin.app.vault.getMarkdownFiles;
    if (mode === "local") obsidianMocks.requestUrl.mockResolvedValueOnce({ status: 200, text: '{"embeddings":[[1,0,0]]}' } as RequestUrlResponse);
    const setup = product(harness); expect((await setup.connect(setup.createDraft(mode))).ok).toBe(true);
    await drainAutomaticSync();
    expect(read).not.toHaveBeenCalled(); expect(enumerate).not.toHaveBeenCalled();
    expect(harness.adapter.files.size).toBe(0); expect(harness.resetStorage).not.toHaveBeenCalled();
    expect(setup.getSnapshot().state).toBe("configured");
    if (mode !== "local") expect(embeddingCalls.flatMap((call) => call.texts)).toEqual(["Vault Audit AI embedding test"]);
    await harness.controller.dispose();
  });

  it("reconnecting a compatible existing index inspects without scheduling indexing; future edits still sync", async () => {
    const harness = createHarness(); harness.registerAutomaticSync(); await harness.controller.indexVault(); await drainAutomaticSync();
    const read = harness.plugin.app.vault.cachedRead; const enumerate = harness.plugin.app.vault.getMarkdownFiles;
    read.mockClear(); enumerate.mockClear(); embeddingCalls = [];
    const setup = product(harness); const before = durableSnapshot(harness.adapter).manifest.generation;
    expect((await setup.connect(setup.createDraft("custom"))).ok).toBe(true); await drainAutomaticSync();
    expect(read).not.toHaveBeenCalled(); expect(enumerate).not.toHaveBeenCalled();
    expect(embeddingCalls.flatMap((call) => call.texts)).toEqual(["Vault Audit AI embedding test"]);
    expect(durableSnapshot(harness.adapter).manifest.generation).toBe(before);
    expect(setup.getSnapshot().state).toBe("ready");
    harness.modifyFile("Alpha.md", "beta explicit later Markdown edit"); await drainAutomaticSync();
    expect(read).toHaveBeenCalled(); expect(durableSnapshot(harness.adapter).manifest.generation).toBeGreaterThan(before);
    await harness.controller.dispose();
  });

  it.each([false, true])("Connect defers queued disabled-index edits, including late layout-ready (%s)", async (lateLayoutReady) => {
    const harness = createHarness(); harness.registerAutomaticSync(); await harness.controller.indexVault(); await drainAutomaticSync();
    harness.plugin.settings.semantic.enabled = false; harness.controller.notifySettingsChanged();
    harness.modifyFile("Alpha.md", "beta queued while disabled"); await drainAutomaticSync();
    const read = harness.plugin.app.vault.cachedRead; const enumerate = harness.plugin.app.vault.getMarkdownFiles;
    read.mockClear(); enumerate.mockClear(); embeddingCalls = [];
    const setup = product(harness); const before = durableSnapshot(harness.adapter).manifest.generation;
    expect((await setup.connect(setup.createDraft("custom"))).ok).toBe(true);
    if (lateLayoutReady) harness.fireLayoutReady();
    await drainAutomaticSync();
    expect(read).not.toHaveBeenCalled(); expect(enumerate).not.toHaveBeenCalled();
    expect(embeddingCalls.flatMap((call) => call.texts)).toEqual(["Vault Audit AI embedding test"]);
    expect(durableSnapshot(harness.adapter).manifest.generation).toBe(before);
    // Retained work joins the next real Markdown event, rather than being discarded by setup.
    harness.createFile("Later.md", "gamma subsequent edit"); await drainAutomaticSync();
    expect(embeddingCalls.some((call) => call.texts.some((text) => text.includes("beta queued while disabled")))).toBe(true);
    await harness.controller.dispose();
  });

  it("changed setup preserves the old index; only explicit rebuild reaches the existing destructive confirmation", async () => {
    const confirm = vi.fn<NonNullable<SemanticControllerDependencies["confirm"]>>(async () => true);
    const harness = createHarness(semantic(), undefined, false, { confirm });
    harness.registerAutomaticSync(); await harness.controller.indexVault(); await drainAutomaticSync(); confirm.mockClear();
    const setup = product(harness); const draft = setup.createDraft("custom"); draft.model = "new-model";
    const before = durableSnapshot(harness.adapter).manifest;
    expect((await setup.connect(draft)).ok).toBe(true); await drainAutomaticSync();
    expect(setup.getSnapshot().state).toBe("incompatible"); expect(harness.resetStorage).not.toHaveBeenCalled();
    expect(durableSnapshot(harness.adapter).manifest).toEqual(before); expect(confirm).not.toHaveBeenCalled();
    confirm.mockResolvedValueOnce(false); await setup.rebuildIndex();
    expect(confirm).toHaveBeenCalledTimes(1); expect(confirm.mock.calls[0][1].danger).toBe(true);
    expect(harness.resetStorage).not.toHaveBeenCalled(); expect(durableSnapshot(harness.adapter).manifest).toEqual(before);
    await harness.controller.dispose();
  });

  it("the separate Build action preserves remote indexing consent and cancellation", async () => {
    const confirm = vi.fn<NonNullable<SemanticControllerDependencies["confirm"]>>(async () => false);
    const harness = createHarness(semantic(), undefined, false, { confirm });
    const setup = product(harness); expect((await setup.connect(setup.createDraft("cloud"))).ok).toBe(true);
    expect(confirm).not.toHaveBeenCalled(); await setup.buildIndex();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][1].paragraphs.join(" ")).toContain("OpenRouter");
    expect(harness.plugin.app.vault.cachedRead).not.toHaveBeenCalled(); expect(harness.adapter.files.size).toBe(0);
    await harness.controller.dispose();
  });

  it("does no provider or storage work while semantic features are disabled", async () => {
    const harness = createHarness(semantic({ enabled: false }));
    harness.registerAutomaticSync();
    harness.createFile("Disabled.md", "disabled private body");
    harness.modifyFile("Alpha.md", "disabled modification");
    harness.fireLayoutReady();
    await drainAutomaticSync();
    expect(embeddingCalls).toEqual([]);
    expect(harness.adapter.files.size).toBe(0);
    expect(harness.registry.size).toBe(0);
  });

  it("does not create an initial index from Vault events", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    harness.createFile("Created.md", "created before initial index");
    await drainAutomaticSync();
    expect(embeddingCalls).toEqual([]);
    expect(harness.adapter.files.size).toBe(0);
    expect(harness.registry.size).toBe(0);
  });

  it("does not create an initial index during startup reconciliation", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    harness.fireLayoutReady();
    await drainAutomaticSync();
    expect(embeddingCalls).toEqual([]);
    expect(harness.adapter.files.size).toBe(0);
    expect(harness.controller.getSemanticStatus().kind).toBe(
      "not-initialized",
    );
  });

  it("MVP startup leaves an existing index untouched until explicit metadata inspection", async () => {
    const first = createHarness();
    await first.controller.indexVault();
    const generation = durableSnapshot(first.adapter).manifest.generation;
    embeddingCalls = [];

    const restarted = createHarness(semantic(), first.adapter);
    restarted.registerAutomaticSync();
    restarted.fireLayoutReady();
    await drainAutomaticSync();
    expect(embeddingCalls).toEqual([]);
    expect(durableSnapshot(first.adapter).manifest.generation).toBe(generation);
    expect(restarted.plugin.app.vault.cachedRead).not.toHaveBeenCalled();
    expect(restarted.plugin.app.vault.getMarkdownFiles).not.toHaveBeenCalled();
    expect(restarted.controller.getSemanticStatus().kind).toBe("not-initialized");
    const setup = product(restarted), observed: string[] = [];
    const unsubscribe = setup.subscribe(() => { observed.push(setup.getSnapshot().state); });
    await restarted.controller.refreshSemanticStatus(); await flushMicrotasks();
    expect(observed).toEqual(["busy", "ready"]); unsubscribe();
    expect(restarted.plugin.app.vault.cachedRead).not.toHaveBeenCalled();
    expect(restarted.controller.getSemanticStatus()).toMatchObject({
      kind: "ready",
      vectorCount: 1,
      vectorGeneration: generation,
    });
  });

  it("MVP startup defers offline changes until real Markdown activity", async () => {
    const first = createHarness();
    await first.controller.indexVault();
    embeddingCalls = [];
    const restarted = createHarness(semantic(), first.adapter);
    restarted.setContent("# Alpha\n\nbeta changed while closed");
    const bytes = [...first.adapter.files];
    restarted.registerAutomaticSync();
    restarted.fireLayoutReady();
    await drainAutomaticSync();
    expect(embeddingCalls).toEqual([]);
    expect(restarted.plugin.app.vault.cachedRead).not.toHaveBeenCalled();
    expect(restarted.plugin.app.vault.getMarkdownFiles).not.toHaveBeenCalled();
    expect([...first.adapter.files]).toEqual(bytes);
    restarted.createFile("Activity.md", "# Activity\n\nA real edit after startup");
    await drainAutomaticSync();
    expect(
      embeddingCalls.some((call) =>
        call.texts.some((text) => text.includes("beta changed while closed")),
      ),
    ).toBe(true);
    expect(
      previewText(await restarted.controller.search("beta startup query")),
    ).toContain("beta changed while closed");
  });

  it("automatically indexes a created Markdown note", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    await harness.controller.indexVault();
    embeddingCalls = [];
    const generation = durableSnapshot(harness.adapter).manifest.generation;
    harness.createFile("Created.md", "# Created\n\nbeta created body");
    await drainAutomaticSync();
    const store = harness.registry.peek(BASE_PATH)?.store;
    expect(store?.listMetadata().map((value) => value.path)).toEqual([
      "Alpha.md",
      "Created.md",
    ]);
    expect(store?.getStats().generation).toBe(generation + 1);
    expect(embeddingCalls).toHaveLength(1);
  });

  it("embeds only changed chunks and makes unchanged modify a no-op", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    await harness.controller.indexVault();
    const store = harness.registry.peek(BASE_PATH)?.store;
    const generation = store?.getStats().generation ?? 0;
    embeddingCalls = [];

    harness.modifyFile("Alpha.md", "# Alpha\n\nbeta changed chunk");
    await drainAutomaticSync();
    expect(embeddingCalls).toHaveLength(1);
    expect(store?.getStats().generation).toBe(generation + 1);

    embeddingCalls = [];
    harness.modifyFile("Alpha.md", "# Alpha\n\nbeta changed chunk");
    await drainAutomaticSync();
    expect(embeddingCalls).toEqual([]);
    expect(store?.getStats().generation).toBe(generation + 1);
  });

  it("deletes every chunk for a removed path without provider work", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    await harness.controller.indexVault();
    embeddingCalls = [];
    harness.deleteFile("Alpha.md");
    await drainAutomaticSync();
    expect(embeddingCalls).toEqual([]);
    expect(harness.registry.peek(BASE_PATH)?.store.listMetadata()).toEqual([]);
  });

  it("renames atomically with one generation and no stale old path", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    await harness.controller.indexVault();
    const store = harness.registry.peek(BASE_PATH)?.store;
    const generation = store?.getStats().generation ?? 0;
    embeddingCalls = [];
    harness.renameFile("Alpha.md", "Renamed.md");
    await drainAutomaticSync();
    expect(store?.listMetadata().map((value) => value.path)).toEqual([
      "Renamed.md",
    ]);
    expect(store?.getStats().generation).toBe(generation + 1);
    expect(embeddingCalls).toHaveLength(1);
  });

  it("search during pending auto indexing sees the last committed snapshot", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    await harness.controller.indexVault();
    const pendingEmbedding = blockNext((call) =>
      call.texts.some((text) => text.includes("beta pending automatic")),
    );
    harness.modifyFile(
      "Alpha.md",
      "# Alpha\n\nbeta pending automatic",
    );
    const timer = vi.advanceTimersByTimeAsync(10);
    await pendingEmbedding.entered;
    const during = await harness.controller.search("alpha committed auto");
    expect(previewText(during)).toContain("alpha old committed");
    expect(previewText(during)).not.toContain("beta pending automatic");
    pendingEmbedding.release();
    await timer;
    await drainAutomaticSync();
    expect(
      previewText(await harness.controller.search("beta committed auto")),
    ).toContain("beta pending automatic");
  });

  it("serializes manual and automatic indexing without duplicate embeddings", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    await harness.controller.indexVault();
    embeddingCalls = [];
    const pendingEmbedding = blockNext((call) =>
      call.texts.some((text) => text.includes("beta shared manual auto")),
    );
    harness.modifyFile("Alpha.md", "# Alpha\n\nbeta shared manual auto");
    const timer = vi.advanceTimersByTimeAsync(10);
    await pendingEmbedding.entered;
    const manual = harness.controller.indexVault();
    await flushMicrotasks();
    expect(
      embeddingCalls.filter((call) =>
        call.texts.some((text) => text.includes("beta shared manual auto")),
      ),
    ).toHaveLength(1);
    pendingEmbedding.release();
    await Promise.all([timer, manual]);
    expect(
      embeddingCalls.filter((call) =>
        call.texts.some((text) => text.includes("beta shared manual auto")),
      ),
    ).toHaveLength(1);
  });

  it("a pending modify cannot resurrect an index after clear", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    await harness.controller.indexVault();
    harness.modifyFile("Alpha.md", "# Alpha\n\nbeta queued before clear");
    await harness.controller.clearIndex();
    await drainAutomaticSync();
    const store = harness.registry.peek(BASE_PATH)?.store;
    expect(store?.getStats().count).toBe(0);
    harness.modifyFile("Alpha.md", "# Alpha\n\ngamma after clear");
    await drainAutomaticSync();
    expect(store?.getStats().count).toBe(0);
  });

  it("does not begin Clear when durable suppression cannot be saved", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    await harness.controller.indexVault();
    const store = harness.registry.peek(BASE_PATH)!.store;
    const generation = store.getStats().generation;
    const clear = vi.spyOn(store, "clear");
    harness.plugin.saveSettings.mockRejectedValueOnce(
      new Error("Authorization: secret settings persistence body"),
    );

    await harness.controller.clearIndex();

    expect(clear).not.toHaveBeenCalled();
    expect(store.getStats()).toMatchObject({
      count: 1,
      generation,
    });
    expect(harness.plugin.settings.semanticAutoSyncSuspended).toBe(false);
    expect(harness.durableAutoSyncSuspended()).toBe(false);
    expect(harness.notices.join(" ")).not.toContain("Authorization");
    expect(harness.notices.join(" ")).not.toContain("secret");
  });

  it("keeps durable suppression after Clear persistence rollback", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    await harness.controller.indexVault();
    const store = harness.registry.peek(BASE_PATH)!.store;
    const generation = store.getStats().generation;
    vi.spyOn(harness.adapter, "writeBinary").mockRejectedValueOnce(
      new Error("controlled clear persistence failure"),
    );

    await harness.controller.clearIndex();

    expect(harness.plugin.settings.semanticAutoSyncSuspended).toBe(true);
    expect(harness.durableAutoSyncSuspended()).toBe(true);
    expect(store.getStats()).toMatchObject({
      count: 1,
      generation,
    });
    const restarted = createHarness(
      semantic(),
      harness.adapter,
      harness.durableAutoSyncSuspended(),
    );
    restarted.registerAutomaticSync();
    restarted.fireLayoutReady();
    embeddingCalls = [];
    restarted.modifyFile("Alpha.md", "# Alpha\n\nbeta after failed clear");
    await drainAutomaticSync();
    expect(embeddingCalls).toEqual([]);
    expect(durableSnapshot(restarted.adapter).manifest.generation).toBe(
      generation,
    );
  });

  it("treats durable suppression plus an old non-empty index as crash-safe", async () => {
    const first = createHarness();
    await first.controller.indexVault();
    const generation = durableSnapshot(first.adapter).manifest.generation;

    const restarted = createHarness(semantic(), first.adapter, true);
    restarted.registerAutomaticSync();
    restarted.fireLayoutReady();
    embeddingCalls = [];
    await drainAutomaticSync();

    expect(embeddingCalls).toEqual([]);
    expect(restarted.registry.size).toBe(0);
    expect(durableSnapshot(restarted.adapter).manifest).toMatchObject({
      generation,
      count: 1,
    });
  });

  it("persists Clear suppression across restart until explicit indexing", async () => {
    const first = createHarness();
    first.registerAutomaticSync();
    await first.controller.indexVault();
    await first.controller.clearIndex();
    expect(first.plugin.settings.semanticAutoSyncSuspended).toBe(true);

    const restarted = createHarness(semantic(), first.adapter, true);
    restarted.registerAutomaticSync();
    restarted.fireLayoutReady();
    restarted.modifyFile("Alpha.md", "# Alpha\n\nbeta after cleared restart");
    await drainAutomaticSync();
    expect(embeddingCalls.at(-1)?.texts.join(" ")).not.toContain(
      "beta after cleared restart",
    );
    expect(
      restarted.registry.peek(BASE_PATH)?.store.getStats().count ?? 0,
    ).toBe(0);

    await restarted.controller.indexVault();
    expect(restarted.plugin.settings.semanticAutoSyncSuspended).toBe(false);
    expect(restarted.plugin.saveSettings).toHaveBeenCalled();
    expect(
      previewText(await restarted.controller.search("beta explicitly resumed")),
    ).toContain("beta after cleared restart");
    expect(restarted.durableAutoSyncSuspended()).toBe(false);
  });

  it("keeps manual-index resume suppressed when marker persistence fails", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    await harness.controller.indexVault();
    await harness.controller.clearIndex();
    harness.modifyFile("Alpha.md", "# Alpha\n\nbeta explicit index");
    harness.plugin.saveSettings.mockRejectedValueOnce(
      new Error("Authorization: secret resume persistence body"),
    );

    await harness.controller.indexVault();

    expect(harness.plugin.settings.semanticAutoSyncSuspended).toBe(true);
    expect(harness.durableAutoSyncSuspended()).toBe(true);
    embeddingCalls = [];
    harness.modifyFile("Alpha.md", "# Alpha\n\ngamma must remain queued");
    await drainAutomaticSync();
    expect(embeddingCalls).toEqual([]);
    expect(harness.notices.join(" ")).not.toContain("Authorization");
    expect(harness.notices.join(" ")).not.toContain("secret");

    const restarted = createHarness(semantic(), harness.adapter, true);
    restarted.registerAutomaticSync();
    restarted.fireLayoutReady();
    restarted.modifyFile("Alpha.md", "# Alpha\n\ngamma after restart");
    await drainAutomaticSync();
    expect(embeddingCalls).toEqual([]);
  });

  it("keeps rebuild resume suppressed when marker persistence fails", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    await harness.controller.indexVault();
    await harness.controller.clearIndex();
    harness.plugin.saveSettings.mockRejectedValueOnce(
      new Error("controlled rebuild resume persistence failure"),
    );

    await harness.controller.rebuildIndex();

    expect(harness.plugin.settings.semanticAutoSyncSuspended).toBe(true);
    expect(harness.durableAutoSyncSuspended()).toBe(true);
    embeddingCalls = [];
    harness.modifyFile("Alpha.md", "# Alpha\n\nbeta after failed rebuild resume");
    await drainAutomaticSync();
    expect(embeddingCalls).toEqual([]);
  });

  it("activates only after a later resume marker save succeeds", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    await harness.controller.indexVault();
    await harness.controller.clearIndex();
    harness.plugin.saveSettings.mockRejectedValueOnce(
      new Error("controlled first resume failure"),
    );
    await harness.controller.indexVault();
    expect(harness.plugin.settings.semanticAutoSyncSuspended).toBe(true);

    await harness.controller.indexVault();

    expect(harness.plugin.settings.semanticAutoSyncSuspended).toBe(false);
    expect(harness.durableAutoSyncSuspended()).toBe(false);
    embeddingCalls = [];
    harness.modifyFile("Alpha.md", "# Alpha\n\nbeta automatic after resume");
    await drainAutomaticSync();
    expect(embeddingCalls).toHaveLength(1);
    expect(
      harness.registry.peek(BASE_PATH)!.store.listMetadata()[0].preview,
    ).toContain("beta automatic after resume");
  });

  it("events during rebuild are applied after the exclusive rebuild snapshot", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    await harness.controller.indexVault();
    harness.setContent("# Alpha\n\nbeta content read by rebuild");
    const rebuildEmbedding = blockNext((call) =>
      call.texts.some((text) => text.includes("beta content read by rebuild")),
    );
    const rebuild = harness.controller.rebuildIndex();
    await rebuildEmbedding.entered;
    harness.modifyFile("Alpha.md", "# Alpha\n\ngamma latest during rebuild");
    const timer = vi.advanceTimersByTimeAsync(10);
    rebuildEmbedding.release();
    await rebuild;
    await timer;
    await drainAutomaticSync();
    expect(
      previewText(await harness.controller.search("gamma after rebuild")),
    ).toContain("gamma latest during rebuild");
  });

  it("a pending API-key epoch uses the new provider runtime and one store", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    await harness.controller.indexVault();
    const store = harness.registry.peek(BASE_PATH)?.store;
    embeddingCalls = [];
    harness.modifyFile("Alpha.md", "# Alpha\n\nbeta after key rotation");
    harness.plugin.settings.semantic.openAICompatibleApiKey = "key-b";
    harness.controller.notifySettingsChanged();
    await drainAutomaticSync();
    expect(harness.registry.size).toBe(1);
    expect(harness.registry.peek(BASE_PATH)?.store).toBe(store);
    expect(
      embeddingCalls.some(
        (call) =>
          call.authorization === "Bearer key-b" &&
          call.texts.some((text) => text.includes("beta after key rotation")),
      ),
    ).toBe(true);
    expect(
      embeddingCalls.some((call) => call.authorization === "Bearer key-a"),
    ).toBe(false);
  });

  it("an active API-key epoch is commit-guarded and replayed with the new key", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    await harness.controller.indexVault();
    const store = harness.registry.peek(BASE_PATH)?.store;
    const generation = store?.getStats().generation ?? 0;
    embeddingCalls = [];
    const oldProvider = blockNext(
      (call) =>
        call.authorization === "Bearer key-a" &&
        call.texts.some((text) => text.includes("beta active key rotation")),
    );
    harness.modifyFile("Alpha.md", "# Alpha\n\nbeta active key rotation");
    const firstTimer = vi.advanceTimersByTimeAsync(10);
    await oldProvider.entered;
    harness.plugin.settings.semantic.openAICompatibleApiKey = "key-b";
    harness.controller.notifySettingsChanged();
    const replacementTimer = vi.advanceTimersByTimeAsync(10);
    oldProvider.release();
    await Promise.all([firstTimer, replacementTimer]);
    await drainAutomaticSync();
    expect(store?.getStats().generation).toBe(generation + 1);
    expect(harness.registry.peek(BASE_PATH)?.store).toBe(store);
    expect(
      embeddingCalls.some(
        (call) =>
          call.authorization === "Bearer key-b" &&
          call.texts.some((text) => text.includes("beta active key rotation")),
      ),
    ).toBe(true);
    expect(store?.listMetadata()[0].preview).toContain(
      "beta active key rotation",
    );
  });

  it("a pending incompatible model change performs no mutation or rebuild", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    await harness.controller.indexVault();
    const store = harness.registry.peek(BASE_PATH)?.store;
    const generation = store?.getStats().generation;
    embeddingCalls = [];
    harness.modifyFile("Alpha.md", "# Alpha\n\nbeta incompatible pending");
    harness.plugin.settings.semantic.embeddingModel = "model-b";
    harness.controller.notifySettingsChanged();
    await drainAutomaticSync();
    expect(embeddingCalls).toEqual([]);
    expect(store?.getStats().generation).toBe(generation);
    expect(harness.registry.peek(BASE_PATH)?.store).toBe(store);
    expect(harness.resetStorage).not.toHaveBeenCalled();
    expect(harness.controller.getSemanticStatus().kind).toBe("incompatible");
  });

  it("recovers a failed batch on the next event without notice spam", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    await harness.controller.indexVault();
    obsidianMocks.requestUrl.mockRejectedValueOnce(
      new Error("Authorization secret response body"),
    );
    harness.modifyFile("Alpha.md", "# Alpha\n\nbeta provider failure");
    await drainAutomaticSync();
    expect(
      harness.registry.peek(BASE_PATH)?.store.listMetadata()[0].preview,
    ).toContain("alpha old committed");
    const noticesAfterFailure = harness.notices.length;

    harness.modifyFile("Alpha.md", "# Alpha\n\ngamma recovered event");
    await drainAutomaticSync();
    expect(
      harness.registry.peek(BASE_PATH)?.store.listMetadata()[0].preview,
    ).toContain("gamma recovered event");
    expect(harness.notices.length).toBe(noticesAfterFailure);
  });

  it("dispose invalidates an in-flight provider result before mutation", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    await harness.controller.indexVault();
    const store = harness.registry.peek(BASE_PATH)?.store;
    const generation = store?.getStats().generation;
    const pendingEmbedding = blockNext((call) =>
      call.texts.some((text) => text.includes("beta disposed pending")),
    );
    harness.modifyFile("Alpha.md", "# Alpha\n\nbeta disposed pending");
    const timer = vi.advanceTimersByTimeAsync(10);
    await pendingEmbedding.entered;
    const disposal = harness.controller.dispose();
    pendingEmbedding.release();
    await Promise.all([timer, disposal]);
    for (let index = 0; index < 40; index++) await Promise.resolve();
    expect(store?.getStats().generation).toBe(generation);
    expect(store?.listMetadata()[0].preview).toContain("alpha old committed");
  });

  it("drains an old writer before a new lifecycle can acquire the same path", async () => {
    const first = createHarness();
    first.registerAutomaticSync();
    await first.controller.indexVault();
    const persistenceGate = manualGate();
    const originalWriteBinary = first.adapter.writeBinary;
    let blockNextTempWrite = true;
    let activeWrites = 0;
    let maxConcurrentWrites = 0;
    vi.spyOn(first.adapter, "writeBinary").mockImplementation(
      async (path, value) => {
        activeWrites++;
        maxConcurrentWrites = Math.max(maxConcurrentWrites, activeWrites);
        try {
          if (blockNextTempWrite && path.endsWith(".tmp")) {
            blockNextTempWrite = false;
            persistenceGate.markEntered();
            await persistenceGate.wait;
          }
          await originalWriteBinary(path, value);
        } finally {
          activeWrites--;
        }
      },
    );
    first.modifyFile("Alpha.md", "# Alpha\n\nbeta old lifecycle");
    const oldTimer = vi.advanceTimersByTimeAsync(10);
    await persistenceGate.entered;

    let drainCompleted = false;
    const drain = first.controller.dispose().then(() => {
      drainCompleted = true;
    });
    const next = createHarness(semantic(), first.adapter);
    next.setContent("# Alpha\n\ngamma new lifecycle");
    const nextIndex = next.controller.indexVault();
    await flushMicrotasks();
    expect(drainCompleted).toBe(false);
    expect(
      embeddingCalls.some((call) =>
        call.texts.some((text) => text.includes("gamma new lifecycle")),
      ),
    ).toBe(false);

    persistenceGate.release();
    await Promise.all([oldTimer, drain, nextIndex]);

    expect(drainCompleted).toBe(true);
    expect(maxConcurrentWrites).toBe(1);
    expect(
      next.registry.peek(BASE_PATH)!.store.listMetadata()[0].preview,
    ).toContain("gamma new lifecycle");
    expect(durableSnapshot(first.adapter).manifest.generation).toBe(3);
  });

  it("ignores non-Markdown TFile events", async () => {
    const harness = createHarness();
    harness.registerAutomaticSync();
    await harness.controller.indexVault();
    const generation = harness.registry.peek(BASE_PATH)?.store.getStats()
      .generation;
    embeddingCalls = [];
    harness.createFile("image.png", "binary-like attachment");
    await drainAutomaticSync();
    expect(embeddingCalls).toEqual([]);
    expect(harness.registry.peek(BASE_PATH)?.store.getStats().generation).toBe(
      generation,
    );
  });

  it("a slow Companion never blocks AutoSync, search, discovery, Clear, or Rebuild", async () => {
    const slow = manualGate();
    const companion: CompanionSyncPort = {
      getStatus: vi.fn(() => ({ kind: "syncing" as const })),
      subscribeStatus: vi.fn(() => () => undefined),
      invalidateConfiguration: vi.fn(),
      testConnection: vi.fn(async () => undefined),
      reconcile: vi.fn(async () => { await slow.wait; }),
      enqueueIncremental: vi.fn(),
      dispose: vi.fn(async () => undefined),
    };
    const harness = createHarness(semantic(), new MemoryDataAdapter(), false, {
      companionService: companion,
    });
    harness.plugin.settings.companion.enabled = true;
    harness.plugin.settings.companion.token = "companion-secret";
    harness.registerAutomaticSync();

    await harness.controller.indexVault();
    expect(companion.reconcile).toHaveBeenCalledOnce();
    await expect(harness.controller.search("alpha")).resolves.toHaveLength(1);
    await expect(harness.controller.findSimilarNotes("Alpha.md")).resolves.toEqual([]);
    await expect(harness.controller.findPotentialDuplicates()).resolves.toEqual([]);

    harness.modifyFile("Alpha.md", "# Alpha\n\nbeta while companion is slow");
    await drainAutomaticSync();
    expect(companion.enqueueIncremental).toHaveBeenCalledOnce();
    await expect(harness.controller.search("beta")).resolves.toHaveLength(1);

    await expect(harness.controller.clearIndex()).resolves.toBeUndefined();
    await expect(harness.controller.rebuildIndex()).resolves.toBeUndefined();
    expect(companion.reconcile).toHaveBeenCalledTimes(3);
    slow.release();
  });

  it("starts every Companion network handoff after releasing the semantic barrier", async () => {
    class TrackingBarrier extends AsyncReadWriteBarrier {
      insideShared = false;

      override withShared<T>(operation: () => Promise<T>): Promise<T> {
        return super.withShared(async () => {
          this.insideShared = true;
          try {
            return await operation();
          } finally {
            this.insideShared = false;
          }
        });
      }
    }
    const barrier = new TrackingBarrier();
    const observed: boolean[] = [];
    const companion: CompanionSyncPort = {
      getStatus: vi.fn(() => ({ kind: "idle" as const })),
      subscribeStatus: vi.fn(() => () => undefined),
      invalidateConfiguration: vi.fn(),
      testConnection: vi.fn(async () => undefined),
      reconcile: vi.fn(async () => { observed.push(barrier.insideShared); }),
      enqueueIncremental: vi.fn(() => { observed.push(barrier.insideShared); }),
      dispose: vi.fn(async () => undefined),
    };
    const harness = createHarness(semantic(), new MemoryDataAdapter(), false, {
      barrier,
      companionService: companion,
    });
    harness.plugin.settings.companion.enabled = true;
    harness.registerAutomaticSync();

    await harness.controller.indexVault();
    harness.modifyFile("Alpha.md", "# Alpha\n\ngamma after local commit");
    await drainAutomaticSync();

    expect(observed).toEqual([false, false]);
  });

  it("MVP startup does not contact Companion even with an existing usable index", async () => {
    const first = createHarness();
    await first.controller.indexVault();
    const companion: CompanionSyncPort = {
      getStatus: vi.fn(() => ({ kind: "idle" as const })),
      subscribeStatus: vi.fn(() => () => undefined),
      invalidateConfiguration: vi.fn(),
      testConnection: vi.fn(async () => undefined),
      reconcile: vi.fn(async () => undefined),
      enqueueIncremental: vi.fn(),
      dispose: vi.fn(async () => undefined),
    };
    const restarted = createHarness(semantic(), first.adapter, false, {
      companionService: companion,
    });
    restarted.plugin.settings.companion.enabled = true;
    embeddingCalls = [];
    restarted.registerAutomaticSync();
    restarted.fireLayoutReady();
    await vi.advanceTimersByTimeAsync(20);
    await flushMicrotasks();

    expect(companion.reconcile).not.toHaveBeenCalled();
    expect(restarted.plugin.app.vault.cachedRead).not.toHaveBeenCalled();
    expect(embeddingCalls).toEqual([]);
  });

  it("does not build an absent semantic index merely because Companion is enabled", async () => {
    const companion: CompanionSyncPort = {
      getStatus: vi.fn(() => ({ kind: "idle" as const })),
      subscribeStatus: vi.fn(() => () => undefined),
      invalidateConfiguration: vi.fn(),
      testConnection: vi.fn(async () => undefined),
      reconcile: vi.fn(async () => undefined),
      enqueueIncremental: vi.fn(),
      dispose: vi.fn(async () => undefined),
    };
    const harness = createHarness(semantic(), new MemoryDataAdapter(), false, {
      companionService: companion,
    });
    harness.plugin.settings.companion.enabled = true;
    embeddingCalls = [];
    harness.registerAutomaticSync();
    harness.fireLayoutReady();
    await vi.advanceTimersByTimeAsync(20);
    await flushMicrotasks();

    expect(companion.reconcile).not.toHaveBeenCalled();
    expect(embeddingCalls).toEqual([]);
    expect(harness.registry.size).toBe(0);
  });
});


describe("MVP integrated durable domains", () => {
  const pluginRoot = ".obsidian/plugins/ai-knowledge-hub";
  const cardsPath = `${pluginRoot}/recall/cards.json`;
  const findingsPath = `${pluginRoot}/health/findings.json`;
  const historyPath = `${pluginRoot}/health/scan-runs.json`;
  const settingsPath = `${pluginRoot}/data.json`;
  const note = "# Alpha\n\nA synthetic concept with enough text for Health and semantic analysis.\n\n## Flashcards\nQuestion::PRIVATE RECALL ANSWER";
  function integrated(adapter = new MemoryDataAdapter()) {
    const h = createHarness(semantic(), adapter);
    h.setContent(note); h.createFile("Twin.md", note.replace("## Flashcards", "## Ordinary section"));
    for (const file of h.plugin.app.vault.getMarkdownFiles()) Object.assign(file, { basename: file.path.slice(0, -3), stat: { mtime: 1, size: note.length } });
    h.plugin.app.vault.getMarkdownFiles.mockClear();
    Object.assign(h.plugin.app.vault, { read: h.plugin.app.vault.cachedRead });
    Object.assign(h.plugin.app.metadataCache, { getFileCache: () => ({}), getFirstLinkpathDest: () => null });
    const app = h.plugin.app as unknown as import("obsidian").App;
    const prefs = preferencesFixture({ profileChosen: true, onboardingCompleted: true });
    const recall = createObsidianRecallProduct(app, "ai-knowledge-hub", async () => true);
    const health = new HealthPluginController(app, "ai-knowledge-hub", prefs.preferences,
      new SemanticHealthAnalysisAdapter(h.controller), new RecallHealthAdapter(recall));
    const read = vi.spyOn(adapter, "read").mockClear(), write = vi.spyOn(adapter, "write").mockClear();
    const bytes = (prefix: string) => structuredClone([...adapter.files].filter(([path]) => path.startsWith(prefix)));
    const passive = () => {
      expect(h.plugin.app.vault.cachedRead).not.toHaveBeenCalled();
      expect(h.plugin.app.vault.getMarkdownFiles).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled(); expect(embeddingCalls).toEqual([]);
    };
    const dispose = async () => { health.dispose(); recall.dispose(); await h.controller.dispose(); };
    return { ...h, health, recall, bytes, read, write, passive, dispose };
  }

  it("consolidates passive entry, explicit action IO, cross-domain bytes, lifecycle receipts and restart", async () => {
    const f = integrated(); f.adapter.files.set(settingsPath, { kind: "text", value: '{"language":"ru","legacySetting":"preserved"}' });
    f.registerAutomaticSync(); f.fireLayoutReady(); f.passive(); expect(f.read).not.toHaveBeenCalled();
    await f.health.getHealthService(); f.health.initializeRecall(); await f.recall.initialize();
    f.health.listFindings(); f.controller.getSemanticStatus(); f.recall.getSnapshot(); f.passive();
    expect(f.recall.getSnapshot().firstRun).toBe(true);
    const settings = f.bytes(settingsPath);
    await f.health.runLocalScan(); expect(f.health.getState().outcome?.scan.status).toBe("completed");
    expect(f.bytes(BASE_PATH)).toEqual([]); expect(f.bytes(cardsPath)).toEqual([]); expect(embeddingCalls).toEqual([]);
    const localBytes = f.bytes(`${pluginRoot}/health/`);
    await f.controller.indexVault(); expect(embeddingCalls.length).toBeGreaterThan(0);
    expect(f.bytes(`${pluginRoot}/health/`)).toEqual(localBytes); expect(f.bytes(cardsPath)).toEqual([]);
    const vectors = f.bytes(BASE_PATH); embeddingCalls = []; f.plugin.app.vault.cachedRead.mockClear();
    await f.health.runSemanticScan(); expect(f.health.getState().semanticOutcome?.scan.status).toBe("completed");
    expect(f.plugin.app.vault.cachedRead).not.toHaveBeenCalled(); expect(embeddingCalls).toEqual([]);
    expect(f.bytes(BASE_PATH)).toEqual(vectors); expect(f.bytes(cardsPath)).toEqual([]);
    const local = f.health.listFindings().find(finding => finding.source === "local")!;
    const semanticFinding = f.health.listFindings().find(finding => finding.source === "semantic")!;
    expect(local).toBeDefined(); expect(semanticFinding).toBeDefined();
    const history = f.bytes(historyPath);
    await f.health.dismissFinding(local.id); await f.health.snoozeFinding(semanticFinding.id, Date.now() + 86_400_000);
    expect(f.bytes(historyPath)).toEqual(history);
    const healthBytes = f.bytes(`${pluginRoot}/health/`), before = f.health.getState().snapshot!;
    await f.recall.refreshCards(); expect(f.recall.getSnapshot().summary?.active).toBe(1);
    expect(f.bytes(`${pluginRoot}/health/`)).toEqual(healthBytes); expect(f.bytes(BASE_PATH)).toEqual(vectors);
    f.plugin.app.vault.cachedRead.mockClear(); f.plugin.app.vault.getMarkdownFiles.mockClear(); f.write.mockClear();
    f.recall.startSession(); expect(JSON.stringify(f.recall.getSnapshot())).not.toContain("PRIVATE RECALL ANSWER");
    expect(JSON.stringify(f.health.getState())).not.toContain("PRIVATE RECALL ANSWER");
    f.recall.revealAnswer(); await f.recall.rate("again"); f.recall.endSession();
    expect(f.write.mock.calls.map(([path]) => path)).toEqual([cardsPath]);
    expect(f.plugin.app.vault.cachedRead).not.toHaveBeenCalled(); expect(embeddingCalls).toEqual([]);
    expect(f.health.getState().snapshot?.dimensions.recall.state).toBe("good");
    expect(f.health.getState().snapshot?.recommendation).toEqual(before.recommendation);
    expect(f.bytes(`${pluginRoot}/health/`)).toEqual(healthBytes); expect(f.bytes(BASE_PATH)).toEqual(vectors); expect(f.bytes(settingsPath)).toEqual(settings);
    const snapshot = f.health.getState().snapshot!, cards = f.recall.getSnapshot().summary, allBytes = f.bytes(pluginRoot);
    await f.dispose(); const next = integrated(f.adapter);
    next.registerAutomaticSync(); next.fireLayoutReady(); await next.health.getHealthService(); next.health.initializeRecall(); await next.recall.initialize();
    await next.controller.refreshSemanticStatus(); // Existing explicit Check; metadata only.
    expect(next.controller.getSemanticStatus().kind).toBe("ready");
    expect(next.health.getState().snapshot?.dimensions).toEqual(snapshot.dimensions);
    expect(next.health.listFindings().find(finding => finding.id === local.id)?.state).toBe("dismissed");
    expect(next.health.listFindings().find(finding => finding.id === semanticFinding.id)?.state).toBe("snoozed");
    expect(next.recall.getSnapshot().summary).toEqual(cards); expect(next.recall.getSnapshot().summary?.learning).toBe(1);
    expect(next.recall.getSnapshot().nextDueAt).toBeGreaterThan(Date.now()); next.passive(); expect(next.bytes(pluginRoot)).toEqual(allBytes);
    await next.dispose();
  });

  it.each(["findings", "history"] as const)("isolates simultaneous damaged Health %s and Recall, leaving semantic/settings bytes intact", async (damage) => {
    const f = integrated(); await f.controller.indexVault(); embeddingCalls = [];
    await f.adapter.write(settingsPath, '{"language":"ru"}');
    await f.adapter.write(findingsPath, damage === "findings" ? "{broken health" : '{"version":1,"updatedAt":0,"findings":{}}');
    await f.adapter.write(historyPath, damage === "history" ? "{broken history" : '{"version":1,"updatedAt":0,"runs":[]}');
    await f.adapter.write(cardsPath, "{broken recall");
    const vectors = f.bytes(BASE_PATH), settings = f.bytes(settingsPath), recallBytes = f.bytes(cardsPath);
    await f.health.getHealthService(); f.health.initializeRecall(); expect(f.recall.getSnapshot().loadState).toBe("uninitialized");
    expect(await f.health.recover(damage === "findings" ? "all" : "history")).toBe(true);
    expect(f.bytes(cardsPath)).toEqual(recallBytes); expect(f.bytes(BASE_PATH)).toEqual(vectors); expect(f.bytes(settingsPath)).toEqual(settings);
    f.health.initializeRecall(); await f.recall.initialize(); expect(f.recall.getSnapshot().loadState).toBe("invalid");
    await f.health.runLocalScan(); expect(f.health.getState().outcome?.scan.status).toBe("completed");
    const healthBytes = f.bytes(`${pluginRoot}/health/`); f.recall.requestRecovery(); await f.recall.recoverStorage();
    expect(f.recall.getSnapshot()).toMatchObject({ loadState: "ready", firstRun: true });
    expect(f.bytes(`${pluginRoot}/health/`)).toEqual(healthBytes); expect(f.bytes(BASE_PATH)).toEqual(vectors); expect(f.bytes(settingsPath)).toEqual(settings);
    expect(embeddingCalls).toEqual([]); await f.dispose();
  });

  it("reads supported Health v1 plus Recall v1 alongside an existing semantic index without migration writes", async () => {
    const first = integrated(); await first.controller.indexVault(); await first.dispose(); embeddingCalls = [];
    const card = recallCandidate();
    await first.adapter.write(findingsPath, '{"version":1,"updatedAt":0,"findings":{}}');
    await first.adapter.write(historyPath, '{"version":1,"updatedAt":0,"runs":[]}');
    await first.adapter.write(cardsPath, JSON.stringify({ version: 1, updatedAt: 100, cards: { [card.id]: { ...card, state: "active", firstSeenAt: 10, lastSeenAt: 100 } } }));
    const f = integrated(first.adapter), before = f.bytes(pluginRoot);
    await f.health.getHealthService(); f.health.initializeRecall(); await f.recall.initialize(); await f.controller.refreshSemanticStatus();
    expect(f.health.getState().snapshot?.initialization).toMatchObject({ findingsWritable: true, historyWritable: true });
    expect(f.health.getState().snapshot?.dimensions.recall.state).toBe("review-recommended");
    expect(f.recall.getSnapshot().summary?.new).toBe(1); expect(f.controller.getSemanticStatus().kind).toBe("ready");
    f.passive(); expect(f.bytes(pluginRoot)).toEqual(before); await f.dispose();
  });
});
