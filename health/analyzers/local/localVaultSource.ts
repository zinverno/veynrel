import { isVaultPath } from "../../domain/validation";
import type { LocalVaultSnapshot } from "./types";

export interface LocalVaultSource {
  capture(signal: AbortSignal): Promise<LocalVaultSnapshot>;
}

/** Additional policies may narrow the mandatory config/backup exclusions. */
export interface LocalVaultScope {
  includes(path: string): boolean;
}

export function defaultLocalVaultScope(configDir: string): LocalVaultScope {
  if (!isVaultPath(configDir)) throw new Error("Invalid vault configuration directory");
  const config = configDir.toLowerCase();
  return {
    includes(path) {
      const lower = path.toLowerCase();
      const root = lower.split("/")[0];
      return lower !== config && !lower.startsWith(`${config}/`) &&
        !(lower.includes("/") && (root === ".ai-backup" || root.startsWith(".ai-backup-")));
    },
  };
}
