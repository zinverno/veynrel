import type { App } from "obsidian";
import { isCanonicalMarkdownPath } from "../chunking/reconstructChunks";
import { readPlannerPair } from "./changePlannerSession";
import type { PlannerRead } from "./changePlannerSession";
import { requireSafe } from "./operationJournal";
import { ChangePlanError } from "./changePlan";

/** Snapshot ctime before the full saved read, including same-path replacement during that read. */
export async function readLocalLinkPair(app: App, paths: readonly [string, string], protectedPaths: readonly string[] = []): Promise<PlannerRead> {
  requireSafe(paths[0] !== paths[1] && paths.every(path => isCanonicalMarkdownPath(path) &&
    !path.split("/").some(part => part.startsWith(".") || part === "node_modules") &&
    !protectedPaths.some(excluded => path === excluded || path.startsWith(`${excluded}/`))), "stale");
  const files = paths.map(path => app.vault.getFileByPath(path));
  requireSafe(files.every(file => file && file.stat.size <= 800000), "stale");
  const created = files.map(file => file!.stat.ctime);
  const read = await readPlannerPair(app, paths);
  requireSafe(read.pair.every((note, i) => note.file === files[i] && note.created === created[i] && note.content.length <= 200000), "stale");
  // Obsidian can strip a BOM on read while process receives it. Refuse before making a journal.
  if (read.pair.some(note => new TextEncoder().encode(note.content).byteLength !== note.bytes)) throw new ChangePlanError("source");
  return read;
}
