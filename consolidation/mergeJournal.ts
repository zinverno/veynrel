import type { DataAdapter } from "obsidian";
import { isRecord, hasOnlyKeys, isVaultPath, isIdentifier, isTimestamp } from "../health/domain/validation";
import { isCanonicalMarkdownPath } from "../chunking/reconstructChunks";
import { checksum, requireSafe } from "./operationJournal";
import type { MergePlan } from "./mergePlan";
import type { PlanRange } from "./changePlan";
import type { SavedNote } from "./savedNote";

interface Identity { created: number; modified: number; bytes: number }
export interface MergeRecord {
  version: 1; operation: "merge_knowledge_copy"; state: "prepared"; id: string; createdAt: number;
  canonical: Identity & { path: string; before: string; after: string; beforeHash: string; afterHash: string };
  secondary: Identity & { path: string; content: string; hash: string; unchanged: true };
  transfers: MergePlan["transfers"]; insertion: MergePlan["insertion"];
}
export type MergeMark = "applied" | "undo_intent" | "undone";
export interface MergeReceipt { state: MergeMark; modified: number; bytes: number }
export interface MergeEntry {
  id: string; record?: MergeRecord; damaged: boolean; scope: "none" | "local" | "global";
  receipts: MergeReceipt[]; issues: string[];
}
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const path = (v: unknown): v is string => isVaultPath(v) && isCanonicalMarkdownPath(v) && !v.split("/").some(s => s.startsWith("."));
const bytes = (s: string) => new TextEncoder().encode(s).length;
function range(value: unknown, content: string): asserts value is PlanRange {
  requireSafe(isRecord(value) && hasOnlyKeys(value, ["start", "end", "text"]) && Number.isSafeInteger(value.start) &&
    Number.isSafeInteger(value.end) && (value.start as number) >= 0 && (value.end as number) > (value.start as number) &&
    (value.end as number) <= content.length && value.text === content.slice(value.start as number, value.end as number), "storage");
}
/** Separate discriminator and exact copy equation; v1/v2 link journals never accept these records. */
export async function validateMergeRecord(value: unknown, id: string): Promise<MergeRecord> {
  requireSafe(isRecord(value) && hasOnlyKeys(value, ["version", "operation", "state", "id", "createdAt", "canonical", "secondary", "transfers", "insertion"]), "storage");
  const r = value as unknown as MergeRecord, c = r.canonical, s = r.secondary;
  requireSafe(r.version === 1 && r.operation === "merge_knowledge_copy" && r.state === "prepared" && hash(id) && r.id === id && isTimestamp(r.createdAt) &&
    isRecord(c) && hasOnlyKeys(c, ["path", "created", "modified", "bytes", "before", "after", "beforeHash", "afterHash"]) &&
    isRecord(s) && hasOnlyKeys(s, ["path", "created", "modified", "bytes", "content", "hash", "unchanged"]) &&
    path(c.path) && path(s.path) && c.path !== s.path && [c, s].every(n => isTimestamp(n.created) && isTimestamp(n.modified) && Number.isSafeInteger(n.bytes) && n.bytes >= 0) &&
    typeof c.before === "string" && c.before.length <= 200_000 && typeof c.after === "string" && c.after.length <= 600_000 &&
    typeof s.content === "string" && s.content.length <= 200_000 && s.unchanged === true && c.bytes === bytes(c.before) && s.bytes === bytes(s.content) &&
    [c.beforeHash, c.afterHash, s.hash].every(hash) && Array.isArray(r.transfers) && r.transfers.length > 0 &&
    isRecord(r.insertion) && hasOnlyKeys(r.insertion, ["anchor", "confirmed", "edit"]) && r.insertion.confirmed === true &&
    isRecord(r.insertion.edit) && hasOnlyKeys(r.insertion.edit, ["start", "end", "removed", "inserted"]), "storage");
  range(r.insertion.anchor, c.before);
  let end = 0;
  for (const t of r.transfers) {
    requireSafe(isRecord(t) && hasOnlyKeys(t, ["range", "contextReviewed"]) && t.contextReviewed === true, "storage");
    range(t.range, s.content); requireSafe(t.range.start >= end, "storage"); end = t.range.end;
  }
  const e = r.insertion.edit, newline = c.before.includes("\r\n") ? "\r\n" : "\n";
  requireSafe(e.start === r.insertion.anchor.end && e.end === e.start && e.removed === "" &&
    e.inserted === newline.repeat(2) + r.transfers.map((t: MergeRecord["transfers"][number]) => t.range.text).join(newline.repeat(2)) &&
    c.after === c.before.slice(0, e.start) + e.inserted + c.before.slice(e.end) && c.before !== c.after &&
    await checksum(c.before) === c.beforeHash && await checksum(c.after) === c.afterHash && await checksum(s.content) === s.hash &&
    await checksum(JSON.stringify({ ...r, id: "", createdAt: 0 })) === id, "storage");
  return r;
}
export async function mergeRecord(plan: MergePlan): Promise<MergeRecord> {
  const c = plan.canonical, s = plan.secondary;
  const identity = (n: typeof c | typeof s): Identity => ({ created: n.identity.created, modified: n.identity.modified, bytes: n.identity.bytes });
  const r: MergeRecord = { version: 1, operation: "merge_knowledge_copy", state: "prepared", id: "", createdAt: Date.now(),
    canonical: { path: c.path, ...identity(c), before: c.before, after: c.after, beforeHash: await checksum(c.before), afterHash: await checksum(c.after) },
    secondary: { path: s.path, ...identity(s), content: s.content, hash: await checksum(s.content), unchanged: true },
    transfers: JSON.parse(JSON.stringify(plan.transfers)) as MergeRecord["transfers"],
    insertion: JSON.parse(JSON.stringify(plan.insertion)) as MergeRecord["insertion"] };
  r.id = await checksum(JSON.stringify({ ...r, createdAt: 0 })); return validateMergeRecord(r, r.id);
}
type Adapter = Pick<DataAdapter, "exists" | "stat" | "mkdir" | "write" | "read" | "list" | "copy">;
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}";
/** Acknowledged adapter writes and exact read-back, not a filesystem transaction. */
export class MergeJournal {
  readonly root: string;
  constructor(private readonly adapter: Adapter, configDir: string, pluginId: string) {
    requireSafe(isVaultPath(configDir) && isIdentifier(pluginId) && isVaultPath(pluginId), "storage");
    this.root = `${configDir}/plugins/${pluginId}/consolidation-merge-operations`;
  }
  private dir(id: string): string { requireSafe(hash(id), "storage"); return `${this.root}/${id}`; }
  private async read(path: string): Promise<string> {
    const stat = await this.adapter.stat(path); requireSafe(stat?.type === "file" && stat.size <= 6_000_000, "storage");
    const raw = await this.adapter.read(path); requireSafe(raw.length <= 6_000_000, "storage"); return raw;
  }
  has(id: string): Promise<boolean> { return this.adapter.exists(this.dir(id)); }
  async prepare(r: MergeRecord): Promise<void> {
    await validateMergeRecord(r, r.id); const dir = this.dir(r.id), raw = JSON.stringify(r);
    requireSafe(!await this.has(r.id), "used"); let parent = "";
    for (const part of dir.split("/")) {
      parent = parent ? `${parent}/${part}` : part;
      if (!await this.adapter.exists(parent)) await this.adapter.mkdir(parent);
      requireSafe((await this.adapter.stat(parent))?.type === "folder", "storage");
    }
    await this.adapter.write(`${dir}/record.json`, raw); requireSafe(await this.read(`${dir}/record.json`) === raw, "storage");
    await this.adapter.copy(`${dir}/record.json`, `${dir}/backup.json`); requireSafe(await this.read(`${dir}/backup.json`) === raw, "storage");
    requireSafe(await this.read(`${dir}/record.json`) === raw, "storage");
  }
  async mark(r: MergeRecord, state: MergeMark, note: SavedNote): Promise<void> {
    const attempt = crypto.randomUUID(), path = `${this.dir(r.id)}/mark-${attempt}.json`;
    const raw = JSON.stringify({ version: 1, operation: r.operation, id: r.id, attempt, state, recordHash: await checksum(JSON.stringify(r)), modified: note.modified, bytes: note.bytes });
    requireSafe(!await this.adapter.exists(path), "storage"); await this.adapter.write(path, raw); requireSafe(await this.read(path) === raw, "storage");
  }
  async entries(): Promise<MergeEntry[]> {
    const unknown = (id: string): MergeEntry => ({ id, damaged: true, scope: "global", receipts: [], issues: ["structure"] });
    let listing: { files: string[]; folders: string[] };
    try {
      if (!await this.adapter.exists(this.root)) return [];
      requireSafe((await this.adapter.stat(this.root))?.type === "folder", "storage"); listing = await this.adapter.list(this.root);
    } catch { return [unknown(this.root)]; }
    const rows = listing.files.map(unknown);
    for (const dir of listing.folders) {
      const id = dir.slice(this.root.length + 1);
      if (!hash(id) || dir !== `${this.root}/${id}`) { rows.push(unknown(dir)); continue; }
      const row: MergeEntry = { id, damaged: false, scope: "none", receipts: [], issues: [] }, valid: MergeRecord[] = [];
      for (const name of ["record.json", "backup.json"]) {
        try { valid.push(await validateMergeRecord(JSON.parse(await this.read(`${dir}/${name}`)), id)); }
        catch { row.issues.push(name); }
      }
      row.record = valid[0];
      if (valid.length === 2 && JSON.stringify(valid[0]) !== JSON.stringify(valid[1])) { row.record = undefined; row.issues.push("copies"); }
      try {
        const files = await this.adapter.list(dir);
        if (files.folders.length) row.scope = "global";
        for (const file of files.files) {
          if ([`${dir}/record.json`, `${dir}/backup.json`].includes(file)) continue;
          const match = new RegExp(`^mark-(${uuid})\\.json$`, "u").exec(file.slice(dir.length + 1));
          if (!match || file !== `${dir}/mark-${match[1]}.json`) { row.scope = "global"; row.issues.push("structure"); continue; }
          try {
            const m: unknown = JSON.parse(await this.read(file));
            requireSafe(row.record && isRecord(m) && hasOnlyKeys(m, ["version", "operation", "id", "attempt", "state", "recordHash", "modified", "bytes"]) &&
              m.version === 1 && m.operation === "merge_knowledge_copy" && m.id === id && m.attempt === match[1] &&
              ["applied", "undo_intent", "undone"].includes(m.state as string) && m.recordHash === await checksum(JSON.stringify(row.record)) &&
              isTimestamp(m.modified) && m.bytes === bytes(m.state === "undone" ? row.record.canonical.before : row.record.canonical.after), "storage");
            row.receipts.push({ state: m.state as MergeMark, modified: m.modified, bytes: m.bytes });
          } catch { row.issues.push(file.slice(dir.length + 1)); }
        }
      } catch { row.scope = "global"; row.issues.push("structure"); }
      for (const state of ["applied", "undo_intent", "undone"] as const) {
        const receipts = row.receipts.filter(m => m.state === state);
        if (receipts.some(m => JSON.stringify(m) !== JSON.stringify(receipts[0]))) row.issues.push("receipts_disagree");
      }
      if (row.receipts.some(m => m.state === "undone") && !row.receipts.some(m => m.state === "undo_intent")) row.issues.push("marker_order");
      row.damaged = row.issues.length > 0 || row.scope === "global";
      row.scope = !row.record || row.scope === "global" ? "global" : row.damaged ? "local" : "none";
      rows.push(row);
    }
    return rows;
  }
}
