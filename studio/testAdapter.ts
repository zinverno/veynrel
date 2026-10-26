import { vi } from "vitest";
import type { StudioAdapter } from "./storage";

/** Mutable disk and hooks intentionally permit torn writes, disk failures and external changes. */
export function testAdapter() {
  const files = new Map<string, string>(), folders = new Set<string>();
  const adapter: StudioAdapter = {
    exists: vi.fn(async (path: string) => files.has(path) || folders.has(path)),
    stat: vi.fn(async (path: string) => files.has(path) ? { type: "file" as const, size: new TextEncoder().encode(files.get(path)).length, ctime: 1, mtime: 1 } :
      folders.has(path) ? { type: "folder" as const, size: 0, ctime: 1, mtime: 1 } : null),
    read: vi.fn(async (path: string) => { if (!files.has(path)) throw Error("missing"); return files.get(path)!; }),
    write: vi.fn(async (path: string, raw: string) => { files.set(path, raw); }),
    mkdir: vi.fn(async (path: string) => { folders.add(path); }),
    list: vi.fn(async (path: string) => ({ files: [...files.keys()].filter(p => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes("/")),
      folders: [...folders].filter(p => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes("/")) })),
    rename: vi.fn(async (from: string, to: string) => { if (!files.has(from) || files.has(to)) throw Error("rename"); files.set(to, files.get(from)!); files.delete(from); }),
  };
  return { files, folders, adapter };
}
