import type { DataAdapter } from "obsidian";
import { isIdentifier, isVaultPath } from "../../health/domain/validation";
import type { RecallStoragePort } from "./types";
import { MAX_RECALL_STORAGE_LENGTH } from "./types";

type RecallAdapter = Pick<DataAdapter, "exists" | "read" | "write" | "mkdir" | "stat">;

/** Pass vault.configDir and plugin.manifest.id. No third-party plugin root is consulted. */
export function recallStorageRoot(configDir: string, pluginId: string): string {
  if (!isVaultPath(configDir) || !isIdentifier(pluginId) || !isVaultPath(pluginId)) throw new Error("Invalid Recall storage root.");
  return `${configDir}/plugins/${pluginId}/recall`;
}

/** Single fixed metadata target. The owning RecallStore serializes all operations. */
export class ObsidianRecallStorage implements RecallStoragePort {
  private readonly root: string;
  private readonly path: string;

  constructor(private readonly adapter: RecallAdapter, configDir: string, pluginId: string) {
    this.root = recallStorageRoot(configDir, pluginId);
    this.path = `${this.root}/cards.json`;
  }

  async read(): Promise<string | null> {
    if (!(await this.adapter.exists(this.path))) return null;
    const stat = await this.adapter.stat(this.path);
    if (!stat || stat.type !== "file" || stat.size > MAX_RECALL_STORAGE_LENGTH * 3) throw new Error("Recall metadata is unavailable.");
    return this.adapter.read(this.path);
  }

  async write(contents: string): Promise<void> {
    let path = "";
    for (const segment of this.root.split("/")) {
      path = path ? `${path}/${segment}` : segment;
      if (!(await this.adapter.exists(path))) {
        try { await this.adapter.mkdir(path); }
        catch (error) { if (!(await this.adapter.exists(path))) throw error; }
      }
      if ((await this.adapter.stat(path))?.type !== "folder") throw new Error("Recall storage parent is not a directory.");
    }
    // ponytail: one serialized DataAdapter write; add journaling if power-loss atomicity becomes a requirement.
    await this.adapter.write(this.path, contents);
  }
}
