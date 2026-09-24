import { vi } from "vitest";
import type { App, TFile } from "obsidian";
import { DeepHealthAnalysisAdapter, deepKnowledgeSettingsSnapshot } from "./health/deepHealthAnalysisAdapter";
import { DEFAULT_SETTINGS } from "../settings";

export function deepFixture(paths = ["A.md", "B.md", "C.md"]) {
  const configDir = "Private/Config";
  const files = paths.map((path) => ({ path, basename: path.split("/").pop()!.slice(0, -3), extension: "md",
    stat: { mtime: 1, size: 42, ctime: 1 } }));
  const disk = new Map([[`${configDir}/plugins/ai-knowledge-hub/note-index.json`, '{ "version": 1, "sentinel": "exact bytes" }'],
    ...paths.map((path) => [path, "SENTINEL_NOTE_BODY ".repeat(400)] as [string, string])]);
  const vault = { configDir, getMarkdownFiles: vi.fn(() => [...files]),
    cachedRead: vi.fn(async (file: TFile) => disk.get(file.path)!), read: vi.fn(),
    modify: vi.fn(), create: vi.fn(), delete: vi.fn(), rename: vi.fn(), process: vi.fn(),
    adapter: { write: vi.fn(), read: vi.fn(async (path: string) => disk.get(path)) } };
  const app = { vault, metadataCache: { getFileCache: vi.fn(() => ({ tags: [], links: [] })), resolvedLinks: {} } } as unknown as App;
  const config = { revision: 1, current: true, settings: deepKnowledgeSettingsSnapshot({ ...DEFAULT_SETTINGS, provider: "ollama", model: "model-a", apiKey: "SENTINEL_KEY",
    baseUrl: "http://localhost:11434/v1", deepAudit: { batchSize: 1, maxConcurrent: 1, delayMs: 0 } }) };
  const adapter = new DeepHealthAnalysisAdapter(app, () => config);
  return { app, vault, files, disk, config, adapter };
}

export function gate<T = void>() {
  let release!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { release = resolve; });
  return { promise, release };
}
