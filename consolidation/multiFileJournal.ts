import type { DataAdapter } from "obsidian";
import { isRecord, hasOnlyKeys, isVaultPath, isIdentifier, isTimestamp } from "../health/domain/validation";
import { isCanonicalMarkdownPath } from "../chunking/reconstructChunks";
import { checksum, requireSafe } from "./operationJournal";
import type { MultiFilePlan } from "./multiFilePlan";

export interface MultiParticipant {
  path: string; created: number; modified: number; bytes: number;
  before: string; after: string; beforeHash: string; afterHash: string;
  selection: MultiFilePlan["files"][number]["userSelection"]["range"];
  edit: MultiFilePlan["files"][number]["edits"][0];
}
export interface MultiRecord {
  version: 2; id: string; createdAt: number; operation: "add_reciprocal_links";
  state: "prepared"; order: readonly [0, 1]; files: readonly [MultiParticipant, MultiParticipant];
}
export const multiMarks = ["apply_a", "apply_b", "applied", "undo_intent", "compensate_intent", "undo_b", "undo_a", "undone"] as const;
export type MultiMark = typeof multiMarks[number];
export interface MultiEntry {
  id: string; record?: MultiRecord; damaged: boolean; scope: "none" | "local" | "global";
  marks: MultiMark[]; issues: string[]; markerWarnings: boolean;
}
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const path = (v: unknown): v is string => isVaultPath(v) && isCanonicalMarkdownPath(v) && !v.split("/").some(s => s.startsWith(".")) &&
  !/[[\]#|^\\]/u.test(v) && [...v].every(char => char.charCodeAt(0) >= 32);
const MAX = 2_000_000;
export async function validateMultiRecord(value: unknown, id: string): Promise<MultiRecord> {
  requireSafe(isRecord(value) && hasOnlyKeys(value, ["version", "id", "createdAt", "operation", "state", "order", "files"]), "storage");
  const r = value as unknown as MultiRecord;
  requireSafe(r.version === 2 && hash(id) && r.id === id && isTimestamp(r.createdAt) && r.operation === "add_reciprocal_links" &&
    r.state === "prepared" && JSON.stringify(r.order) === "[0,1]" && Array.isArray(r.files) && r.files.length === 2, "storage");
  for (const f of r.files) requireSafe(isRecord(f) && hasOnlyKeys(f, ["path", "created", "modified", "bytes", "before", "after", "beforeHash", "afterHash", "selection", "edit"]) && path(f.path), "storage");
  requireSafe(r.files[0].path !== r.files[1].path, "storage");
  for (const [i, f] of r.files.entries()) {
    requireSafe(isTimestamp(f.created) && isTimestamp(f.modified) && Number.isSafeInteger(f.bytes) && f.bytes >= 0 &&
      typeof f.before === "string" && f.before.length <= 200_000 && typeof f.after === "string" && f.after.length <= 210_000 &&
      new TextEncoder().encode(f.before).length === f.bytes && isRecord(f.selection) && hasOnlyKeys(f.selection, ["start", "end", "text"]) &&
      isRecord(f.edit) && hasOnlyKeys(f.edit, ["start", "end", "removed", "inserted"]), "storage");
    const s = f.selection, e = f.edit;
    requireSafe(Number.isSafeInteger(s.start) && Number.isSafeInteger(s.end) && s.start >= 0 && s.end > s.start && s.end <= f.before.length &&
      f.before.slice(s.start, s.end) === s.text && e.start === s.end && e.end === s.end && e.removed === "" &&
      e.inserted === ` [[${r.files[i === 0 ? 1 : 0].path.slice(0, -3)}]]` &&
      f.after === f.before.slice(0, e.start) + e.inserted + f.before.slice(e.end) &&
      hash(f.beforeHash) && hash(f.afterHash) && await checksum(f.before) === f.beforeHash && await checksum(f.after) === f.afterHash, "storage");
  }
  requireSafe(await checksum(JSON.stringify({ ...r, id: "", createdAt: 0 })) === id, "storage");
  return r;
}
export async function multiRecord(plan: MultiFilePlan): Promise<MultiRecord> {
  const files = await Promise.all(plan.files.map(async f => ({ path: f.path, created: f.identity.created, modified: f.identity.modified,
    bytes: f.identity.bytes, before: f.before, after: f.after, beforeHash: await checksum(f.before), afterHash: await checksum(f.after),
    selection: { ...f.userSelection.range }, edit: { ...f.edits[0] } })));
  const r: MultiRecord = { version: 2, id: "", createdAt: Date.now(), operation: "add_reciprocal_links", state: "prepared", order: [0, 1], files: [files[0], files[1]] };
  r.id = await checksum(JSON.stringify({ ...r, createdAt: 0 })); return validateMultiRecord(r, r.id);
}
type Adapter = Pick<DataAdapter, "exists" | "stat" | "mkdir" | "write" | "read" | "list" | "copy">;
/** Separate protocol directory, shared executor/history. No fsync or cross-process exclusion is claimed. */
export class MultiFileJournal {
  readonly root: string;
  constructor(private readonly adapter: Adapter, configDir: string, pluginId: string) {
    requireSafe(isVaultPath(configDir) && isIdentifier(pluginId) && isVaultPath(pluginId), "storage");
    this.root = `${configDir}/plugins/${pluginId}/consolidation-multi-operations`;
  }
  private dir(id: string): string { requireSafe(hash(id), "storage"); return `${this.root}/${id}`; }
  private async read(path: string): Promise<string> {
    const stat = await this.adapter.stat(path); requireSafe(stat?.type === "file" && stat.size <= MAX, "storage");
    const raw = await this.adapter.read(path); requireSafe(raw.length <= MAX, "storage"); return raw;
  }
  async has(id: string): Promise<boolean> { return this.adapter.exists(this.dir(id)); }
  async prepare(r: MultiRecord): Promise<void> {
    await validateMultiRecord(r, r.id); const dir = this.dir(r.id), raw = JSON.stringify(r);
    requireSafe(!await this.has(r.id), "used"); let parent = "";
    for (const part of dir.split("/")) {
      parent = parent ? `${parent}/${part}` : part;
      if (!await this.adapter.exists(parent)) await this.adapter.mkdir(parent);
      requireSafe((await this.adapter.stat(parent))?.type === "folder", "storage");
    }
    // Each independent copy contains both participants before any Markdown is touched.
    await this.adapter.write(`${dir}/record.json`, raw); requireSafe(await this.read(`${dir}/record.json`) === raw, "storage");
    await this.adapter.copy(`${dir}/record.json`, `${dir}/backup.json`); requireSafe(await this.read(`${dir}/backup.json`) === raw, "storage");
    requireSafe(await this.read(`${dir}/record.json`) === raw, "storage");
  }
  async mark(r: MultiRecord, state: MultiMark): Promise<void> {
    const attempt = crypto.randomUUID(), path = `${this.dir(r.id)}/mark-${attempt}.json`;
    const raw = JSON.stringify({ version: 2, id: r.id, attempt, state, recordHash: await checksum(JSON.stringify(r)) });
    requireSafe(!await this.adapter.exists(path), "storage"); await this.adapter.write(path, raw);
    requireSafe(await this.read(path) === raw, "storage");
  }
  async entries(): Promise<MultiEntry[]> {
    const unknown = (id: string): MultiEntry => ({ id, damaged: true, scope: "global", marks: [], issues: ["structure"], markerWarnings: false });
    let listing: { files: string[]; folders: string[] };
    try {
      if (!await this.adapter.exists(this.root)) return [];
      requireSafe((await this.adapter.stat(this.root))?.type === "folder", "storage"); listing = await this.adapter.list(this.root);
    } catch { return [unknown(this.root)]; }
    const rows: MultiEntry[] = listing.files.map(unknown);
    for (const dir of listing.folders) {
      const id = dir.slice(this.root.length + 1);
      if (!hash(id) || dir !== `${this.root}/${id}`) { rows.push(unknown(dir)); continue; }
      const row: MultiEntry = { id, damaged: false, scope: "none", marks: [], issues: [], markerWarnings: false };
      const valid: MultiRecord[] = [];
      for (const name of ["record.json", "backup.json"]) {
        try { valid.push(await validateMultiRecord(JSON.parse(await this.read(`${dir}/${name}`)), id)); }
        catch { row.damaged = true; row.issues.push(name); }
      }
      if (valid.length) row.record = valid[0];
      if (valid.length === 2 && JSON.stringify(valid[0]) !== JSON.stringify(valid[1])) { row.damaged = true; row.record = undefined; row.issues.push("copies"); }
      row.scope = row.damaged ? row.record ? "local" : "global" : "none";
      try {
        const files = await this.adapter.list(dir);
        if (files.folders.length) { row.damaged = true; row.scope = "global"; row.issues.push("structure"); }
        for (const file of files.files) {
          if ([`${dir}/record.json`, `${dir}/backup.json`].includes(file)) continue;
          const match = /^mark-([a-f0-9-]{36})\.json$/u.exec(file.slice(dir.length + 1));
          if (!match || file !== `${dir}/mark-${match[1]}.json`) { row.damaged = true; row.scope = "global"; row.issues.push("structure"); continue; }
          try {
            const m: unknown = JSON.parse(await this.read(file));
            requireSafe(row.record && isRecord(m) && hasOnlyKeys(m, ["version", "id", "attempt", "state", "recordHash"]) && m.version === 2 && m.id === id &&
              m.attempt === match[1] && multiMarks.includes(m.state as MultiMark) && m.recordHash === await checksum(JSON.stringify(row.record)), "storage");
            row.marks.push(m.state as MultiMark);
          } catch { row.markerWarnings = true; row.issues.push(file.slice(dir.length + 1)); }
        }
      } catch { row.damaged = true; row.scope = "global"; row.issues.push("structure"); }
      rows.push(row);
    }
    return rows;
  }
}
