import { vi } from "vitest";
import type { App } from "obsidian";
import { healthStorageRoot } from "../store/healthStorage";
import { HealthPreferencesController, mergeHealthPreferences } from "../preferences";
import type { HealthPreferences } from "../preferences";

export function preferencesFixture(initial?: Partial<HealthPreferences>) {
  let persisted = mergeHealthPreferences(initial);
  const save = vi.fn(async (next: HealthPreferences) => { persisted = { ...next }; });
  const preferences = new HealthPreferencesController(() => persisted, save);
  return { preferences, save };
}

export const root = healthStorageRoot("Private/Config", "ai-knowledge-hub");
export function adapterFixture() {
  const files = new Map<string, string>();
  const folders = new Set<string>([root]);
  const adapter = {
    exists: vi.fn(async (path: string) => files.has(path) || folders.has(path)),
    read: vi.fn(async (path: string) => { const value = files.get(path); if (value === undefined) throw new Error("Missing"); return value; }),
    write: vi.fn(async (path: string, content: string) => { files.set(path, content); }),
    mkdir: vi.fn(async (path: string) => { folders.add(path); }),
    stat: vi.fn(async (path: string) => folders.has(path) ? { type: "folder" as const, mtime: 0, ctime: 0, size: 0 } : files.has(path) ? { type: "file" as const, mtime: 0, ctime: 0, size: 0 } : null),
    rename: vi.fn(async (from: string, to: string) => {
      const data = files.get(from); if (data === undefined || files.has(to)) throw new Error("Cannot rename");
      files.set(to, data); files.delete(from);
    }),
  };
  return { files, folders, adapter };
}
export function appFixture() {
  const f = adapterFixture();
  // Minimal Vault fake: no Obsidian runtime is needed for controller tests.
  const note = { path: "A.md", basename: "A", extension: "md", stat: { mtime: 1 } };
  const vault = { adapter: f.adapter, configDir: "Private/Config",
    getMarkdownFiles: vi.fn(() => [note]),
    read: vi.fn(async () => "A sufficiently long note for testing the local health check."),
    getAbstractFileByPath: vi.fn((path: string) => path === note.path ? note : null),
    getFileByPath: vi.fn((path: string) => path === note.path ? note : null),
  };
  const metadataCache = { getFileCache: vi.fn(() => ({})), getFirstLinkpathDest: vi.fn(() => null) };
  const openFile = vi.fn(async () => undefined);
  const workspace = { getLeaf: vi.fn(() => ({ openFile })) };
  return { ...f, note, vault, metadataCache, openFile, workspace, app: { vault, metadataCache, workspace } as unknown as App };
}
export async function flush(): Promise<void> { for (let i = 0; i < 30; i++) await Promise.resolve(); }
