import type { DataAdapter } from "obsidian";
import { isIdentifier, isVaultPath } from "../domain/validation";
import type { HealthFile } from "../store/types";

export type HealthRecoveryScope = "all" | "history";
type RecoveryAdapter = Pick<DataAdapter, "exists" | "stat" | "mkdir" | "rename">;
export interface HealthRecoveryResult { backups: string[] }

export class HealthRecoveryError extends Error {
  constructor() { super("Health recovery could not finish. Existing data or recovery backups were preserved."); this.name = "HealthRecoveryError"; }
}

/** Only moves Health files. No parsing, schema guessing, note access, or destructive overwrite. */
export class HealthRecovery {
  constructor(private readonly adapter: RecoveryAdapter, private readonly root: string,
    private readonly recoveryId: () => string = () => `${Date.now()}-${crypto.randomUUID()}`) {
    if (!isVaultPath(root)) throw new Error("Invalid Health recovery root");
  }

  async recover(scope: HealthRecoveryScope): Promise<HealthRecoveryResult> {
    if (scope !== "all" && scope !== "history") throw new HealthRecoveryError();
    const planned: { original: string; backup: string }[] = [];
    try {
      const id = this.recoveryId();
      if (!isIdentifier(id)) throw new HealthRecoveryError();
      const files: HealthFile[] = scope === "all" ? ["findings.json", "scan-runs.json"] : ["scan-runs.json"];
      for (const file of files) {
        const original = `${this.root}/${file}`;
        if (!await this.adapter.exists(original)) continue;
        if ((await this.adapter.stat(original))?.type !== "file") throw new HealthRecoveryError();
        const backup = `${this.root}/recovery/${file.slice(0, -5)}.${id}.recovery.json`;
        if (await this.adapter.exists(backup)) throw new HealthRecoveryError();
        planned.push({ original, backup });
      }
      if (!planned.length) return { backups: [] };
      const directory = `${this.root}/recovery`;
      if (!await this.adapter.exists(directory)) await this.adapter.mkdir(directory);
      if ((await this.adapter.stat(directory))?.type !== "folder") throw new HealthRecoveryError();
      for (const { original, backup } of planned) {
        // Recheck immediately before moving; never overwrite an earlier recovery backup.
        if (await this.adapter.exists(backup)) throw new HealthRecoveryError();
        await this.adapter.rename(original, backup);
      }
      return { backups: planned.map(({ backup }) => backup) };
    } catch {
      for (const { original, backup } of [...planned].reverse()) {
        try {
          if (!await this.adapter.exists(original) && await this.adapter.exists(backup)) await this.adapter.rename(backup, original);
        } catch { /* Keep the backup if restoration is unavailable; never delete the surviving copy. */ }
      }
      throw new HealthRecoveryError();
    }
  }
}
