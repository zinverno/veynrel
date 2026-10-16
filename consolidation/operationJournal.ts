import type { DataAdapter } from "obsidian";
import { isRecord, hasOnlyKeys, isVaultPath, isIdentifier, isTimestamp } from "../health/domain/validation";
import { isCanonicalMarkdownPath } from "../chunking/reconstructChunks";
import type { ChangePlan } from "./changePlan";

export type OperationState = "prepared" | "applied" | "undo_pending" | "undone" | "conflict";
export type JournalMark = "applied" | "undo_pending" | "undone";
export interface OperationRecord {
  version: 1; state: "prepared"; id: string; createdAt: number; operation: "add_link" | "replace_with_embed";
  sourcePath: string; targetPath: string; sourceCreated: number; sourceModified: number;
  targetCreated: number; targetModified: number; targetHash: string;
  before: string; after: string; beforeHash: string; afterHash: string;
  selection: NonNullable<ChangePlan["selection"]>; edit: NonNullable<ChangePlan["edit"]>;
}
export interface JournalEntry { id: string; record?: OperationRecord; marks: JournalMark[]; damaged: boolean }
export class SafeApplyError extends Error {
  constructor(readonly reason: "stale" | "editor" | "storage" | "conflict" | "busy" | "used" | "cancelled" | "write") { super(reason); }
}
export function requireSafe(condition: unknown, reason: SafeApplyError["reason"]): asserts condition {
  if (!condition) throw new SafeApplyError(reason);
}
export async function checksum(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
const isHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const MAX_RECORD = 2_000_000;
const markdownPath = (value: unknown): value is string => isVaultPath(value) && isCanonicalMarkdownPath(value) && !value.split("/").some(p => p.startsWith("."));

/** Strict recovery boundary: a valid checksum alone cannot authorize an arbitrary file or edit. */
export async function validateOperation(value: unknown, id: string): Promise<OperationRecord> {
  requireSafe(isRecord(value) && hasOnlyKeys(value, ["version", "state", "id", "createdAt", "operation", "sourcePath", "targetPath", "sourceCreated", "sourceModified", "targetCreated", "targetModified", "targetHash", "before", "after", "beforeHash", "afterHash", "selection", "edit"]), "storage");
  const r = value as unknown as OperationRecord;
  requireSafe(r.version === 1 && r.state === "prepared" && isHash(id) && r.id === id && isTimestamp(r.createdAt) &&
    [r.sourceCreated, r.sourceModified, r.targetCreated, r.targetModified].every(isTimestamp) &&
    markdownPath(r.sourcePath) && markdownPath(r.targetPath) && r.sourcePath !== r.targetPath &&
    [r.beforeHash, r.afterHash, r.targetHash].every(isHash) &&
    typeof r.before === "string" && typeof r.after === "string" && r.before.length <= 200_000 && r.after.length <= 210_000 &&
    isRecord(r.selection) && hasOnlyKeys(r.selection, ["start", "end", "text"]) &&
    isRecord(r.edit) && hasOnlyKeys(r.edit, ["start", "end", "removed", "inserted"]), "storage");
  const s = r.selection, e = r.edit, token = r.targetPath.slice(0, -3);
  requireSafe(!/[[\]#|^\\]/u.test(token) && Number.isSafeInteger(s.start) && Number.isSafeInteger(s.end) && s.start >= 0 && s.end > s.start && s.end <= r.before.length &&
    typeof s.text === "string" && r.before.slice(s.start, s.end) === s.text &&
    ((r.operation === "add_link" && e.start === s.end && e.end === s.end && e.removed === "" && e.inserted === ` [[${token}]]`) ||
      (r.operation === "replace_with_embed" && e.start === s.start && e.end === s.end && e.removed === s.text && e.inserted === `![[${token}]]`)) &&
    r.after === r.before.slice(0, e.start) + e.inserted + r.before.slice(e.end) && r.before !== r.after &&
    await checksum(r.before) === r.beforeHash && await checksum(r.after) === r.afterHash &&
    await checksum(JSON.stringify({ ...r, id: "", createdAt: 0 })) === id, "storage");
  return r;
}

type JournalAdapter = Pick<DataAdapter, "exists" | "stat" | "mkdir" | "write" | "read" | "list" | "copy">;
/** One owner, immutable records/markers, acknowledged writes and exact read-back before any note write. */
export class OperationJournal {
  readonly root: string;
  constructor(private readonly adapter: JournalAdapter, configDir: string, pluginId: string) {
    requireSafe(isVaultPath(configDir) && isIdentifier(pluginId) && isVaultPath(pluginId), "storage");
    this.root = `${configDir}/plugins/${pluginId}/consolidation-operations`;
  }
  private path(id: string): string { requireSafe(isHash(id), "storage"); return `${this.root}/${id}`; }
  private async read(path: string): Promise<string> {
    const stat = await this.adapter.stat(path);
    requireSafe(stat?.type === "file" && stat.size <= MAX_RECORD, "storage");
    const raw = await this.adapter.read(path); requireSafe(raw.length <= MAX_RECORD, "storage"); return raw;
  }
  private async directory(path: string): Promise<void> {
    let parent = "";
    for (const part of path.split("/")) {
      parent = parent ? `${parent}/${part}` : part;
      if (!await this.adapter.exists(parent)) await this.adapter.mkdir(parent);
      requireSafe((await this.adapter.stat(parent))?.type === "folder", "storage");
    }
  }
  async has(id: string): Promise<boolean> { return this.adapter.exists(this.path(id)); }
  async prepare(record: OperationRecord): Promise<void> {
    await validateOperation(record, record.id);
    const path = this.path(record.id), raw = JSON.stringify(record);
    requireSafe(!await this.adapter.exists(path), "used");
    await this.directory(path);
    // Never overwrite recovery data, including a partial prior attempt. The second copy survives single-file damage.
    await this.adapter.write(`${path}/record.json`, raw);
    requireSafe(await this.read(`${path}/record.json`) === raw, "storage");
    await this.adapter.copy(`${path}/record.json`, `${path}/backup.json`);
    requireSafe(await this.read(`${path}/backup.json`) === raw, "storage");
  }
  async mark(record: OperationRecord, state: JournalMark): Promise<void> {
    const path = `${this.path(record.id)}/${state}.json`;
    const raw = JSON.stringify({ version: 1, id: record.id, state, checksum: await checksum(JSON.stringify(record)) });
    if (!await this.adapter.exists(path)) await this.adapter.write(path, raw);
    requireSafe(await this.read(path) === raw, "storage");
  }
  async entries(): Promise<JournalEntry[]> {
    if (!await this.adapter.exists(this.root)) return [];
    const listed = await this.adapter.list(this.root), result: JournalEntry[] = [];
    requireSafe(listed.files.length === 0, "storage");
    for (const path of listed.folders) {
      requireSafe(path.startsWith(`${this.root}/`) && isHash(path.slice(this.root.length + 1)), "storage");
      const id = path.slice(this.root.length + 1), entry: JournalEntry = { id, marks: [], damaged: false };
      const records: OperationRecord[] = [];
      for (const name of ["record.json", "backup.json"]) {
        try { records.push(await validateOperation(JSON.parse(await this.read(`${path}/${name}`)), id)); }
        catch { entry.damaged = true; }
      }
      entry.record = records[0];
      if (records.length === 2 && JSON.stringify(records[0]) !== JSON.stringify(records[1])) entry.damaged = true;
      for (const state of ["applied", "undo_pending", "undone"] as const) {
        if (!await this.adapter.exists(`${path}/${state}.json`)) continue;
        try {
          const expected = JSON.stringify({ version: 1, id, state, checksum: await checksum(JSON.stringify(entry.record)) });
          requireSafe(await this.read(`${path}/${state}.json`) === expected, "storage"); entry.marks.push(state);
        } catch { entry.damaged = true; }
      }
      if (entry.marks.includes("undone") && !entry.marks.includes("undo_pending")) entry.damaged = true;
      result.push(entry);
    }
    return result;
  }
}
