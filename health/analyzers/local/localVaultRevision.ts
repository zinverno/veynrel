import { stableHash } from "../../../utils/stableHash";
import { compareStrings, isTimestamp, isVaultPath } from "../../domain/validation";

export interface LocalVaultRevision {
  readonly noteCount: number;
  readonly signature: string;
  /** Incomplete enumeration cannot establish freshness, even if two signatures match. */
  readonly complete: boolean;
}

export interface LocalVaultFreshnessProbe {
  captureRevision(signal: AbortSignal): Promise<LocalVaultRevision>;
}

export function createLocalVaultRevision(notes: readonly { path: string; mtime: number }[], complete = true): LocalVaultRevision {
  const inventory = notes.map(({ path, mtime }) => {
    if (!isVaultPath(path) || !isTimestamp(mtime)) throw new Error("Invalid local vault revision inventory");
    return [path, mtime] as const;
  }).sort(([a], [b]) => compareStrings(a, b));
  if (new Set(inventory.map(([path]) => path)).size !== inventory.length) throw new Error("Duplicate revision path");
  const encoded = JSON.stringify(inventory);
  return { noteCount: inventory.length, complete,
    signature: `v1:${encoded.length}:${stableHash(encoded)}:${stableHash(`veynrel-revision-v1:${encoded}`)}`,
  };
}

export function sameLocalVaultRevision(left: LocalVaultRevision, right: LocalVaultRevision): boolean {
  return left.complete === true && right.complete === true && left.noteCount === right.noteCount && left.signature === right.signature;
}
