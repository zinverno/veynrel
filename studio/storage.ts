import type { DataAdapter } from "obsidian";
import { isVaultPath } from "../health/domain/validation";
import { ensure } from "./recipe";

export type StudioAdapter = Pick<DataAdapter, "exists" | "stat" | "read" | "write" | "mkdir" | "list" | "rename">;
export class StudioStorage {
  readonly root: string;
  constructor(readonly adapter: StudioAdapter, configDir: string, pluginId: string) {
    ensure(isVaultPath(configDir) && /^[a-z0-9-]+$/u.test(pluginId), "storage");
    this.root = `${configDir}/plugins/${pluginId}/studio`;
  }
  async read(path: string, max = 4_000_000): Promise<string> {
    const stat = await this.adapter.stat(path); ensure(stat?.type === "file" && stat.size <= max * 4, "storage");
    const raw = await this.adapter.read(path); ensure(raw.length <= max, "storage"); return raw;
  }
  async mkdir(path: string): Promise<void> {
    let parent = "";
    for (const part of path.split("/")) {
      parent = parent ? `${parent}/${part}` : part;
      if (!await this.adapter.exists(parent)) await this.adapter.mkdir(parent);
      ensure((await this.adapter.stat(parent))?.type === "folder", "storage");
    }
  }
  async create(path: string, raw: string): Promise<void> {
    ensure(!await this.adapter.exists(path), "storage");
    await this.mkdir(path.slice(0, path.lastIndexOf("/")));
    await this.adapter.write(path, raw); ensure(await this.read(path) === raw, "storage");
  }
}
