import type { DataAdapter } from "obsidian";
import { isIdentifier } from "../../health/domain/validation";
import { recallStorageRoot } from "../store/obsidianRecallStorage";
import type { RecallRecoveryPort } from "./types";

type RecoveryAdapter = Pick<DataAdapter, "exists" | "stat" | "mkdir" | "rename">;

/** Exact-byte move of one fixed Recall file; no parsing, deletes, writes or cross-domain paths. */
export class RecallRecovery implements RecallRecoveryPort {
  private readonly root: string;
  private readonly original: string;
  constructor(private readonly adapter: RecoveryAdapter, configDir: string, pluginId: string,
    private readonly recoveryId: () => string = () => `${Date.now()}-${crypto.randomUUID()}`) {
    this.root = recallStorageRoot(configDir, pluginId);
    this.original = `${this.root}/cards.json`;
  }

  async canRecover(): Promise<boolean> {
    try { return await this.adapter.exists(this.original) && (await this.adapter.stat(this.original))?.type === "file"; }
    catch { return false; }
  }

  async recover(): Promise<void> {
    let backup: string | undefined;
    let moveAttempted = false;
    try {
      const id = this.recoveryId();
      if (!isIdentifier(id) || !await this.canRecover()) throw new Error();
      const directory = `${this.root}/recovery`;
      backup = `${directory}/cards-${id}.recovery.json`;
      if (await this.adapter.exists(backup)) throw new Error();
      if (!await this.adapter.exists(directory)) await this.adapter.mkdir(directory);
      if ((await this.adapter.stat(directory))?.type !== "folder" || await this.adapter.exists(backup) || !await this.canRecover()) throw new Error();
      moveAttempted = true;
      await this.adapter.rename(this.original, backup);
      if (await this.adapter.exists(this.original) || (await this.adapter.stat(backup))?.type !== "file") throw new Error();
    } catch {
      // Some adapters may move successfully and then reject. Restore when possible; never delete the surviving backup.
      if (moveAttempted && backup) {
        try {
          if (!await this.adapter.exists(this.original) && await this.adapter.exists(backup)) await this.adapter.rename(backup, this.original);
        } catch { /* The backup remains if the adapter also refuses rollback; the owner stays blocked. */ }
      }
      throw new Error("Recall recovery could not finish. Existing data or its backup was preserved.");
    }
  }
}
