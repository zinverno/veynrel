import type { DataAdapter } from "obsidian";
import { isIdentifier, isVaultPath } from "../domain/validation";
import type { HealthFile, HealthStoragePort } from "./types";

type HealthAdapter = Pick<DataAdapter, "exists" | "read" | "write" | "mkdir" | "stat">;

/** Pass app.vault.configDir and plugin.manifest.id; no default config directory or plugin ID. */
export function healthStorageRoot(configDir: string, pluginId: string): string {
  if (!isVaultPath(configDir) || !isIdentifier(pluginId) || !isVaultPath(pluginId)) throw new Error("Invalid health storage root");
  return `${configDir}/plugins/${pluginId}/health`;
}

/** Obsidian filesystem only; never reads/writes Markdown or executes finding actions. */
export class ObsidianHealthStorage implements HealthStoragePort {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly adapter: HealthAdapter, private readonly root: string) {
    if (!isVaultPath(root)) throw new Error("Invalid health storage root");
  }

  read(file: HealthFile): Promise<string | null> {
    return this.enqueue(async () => {
      const path = this.path(file);
      return await this.adapter.exists(path) ? this.adapter.read(path) : null;
    });
  }

  write(file: HealthFile, contents: string): Promise<void> {
    return this.enqueue(async () => {
      const path = this.path(file);
      await this.ensureDirectory();
      // ponytail: serialized single-file writes; add journal/backup recovery if crash durability is required.
      await this.adapter.write(path, contents);
    });
  }

  private path(file: HealthFile): string {
    if (file !== "findings.json" && file !== "scan-runs.json") throw new Error("Invalid health storage file");
    return `${this.root}/${file}`;
  }

  private async ensureDirectory(): Promise<void> {
    let path = "";
    for (const segment of this.root.split("/")) {
      path = path ? `${path}/${segment}` : segment;
      if (!(await this.adapter.exists(path))) {
        try { await this.adapter.mkdir(path); } catch (error) {
          if (!(await this.adapter.exists(path))) throw error;
        }
      }
      if ((await this.adapter.stat(path))?.type !== "folder") throw new Error("Health storage parent is not a directory");
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}
