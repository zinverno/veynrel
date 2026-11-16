import type { DataAdapter } from "obsidian";
import { isRecord, hasOnlyKeys, isVaultPath, isIdentifier, isTimestamp } from "../health/domain/validation";
import { checksum, requireSafe, SafeApplyError } from "./operationJournal";
import { validateRegistryPlan } from "./registryPlan";
import { localBytes as registryBytes } from "./localNotePlan";
import type { RegistryPlan } from "./registryPlan";
import type { SavedNote } from "./savedNote";

/** Strict registry-edit family, separate from unchanged OperationJournal v1. */
export interface RegistryRecord {
  version: 1; operation: "edit_organization_registry"; state: "prepared"; id: string; createdAt: number;
  plan: RegistryPlan; hashes: { before: string; after: string };
}
export type RegistryMark = "applied" | "undo_intent" | "undone";
export interface RegistryReceipt { state: RegistryMark; modified: number; bytes: number; hash: string }
export interface RegistryEntry {
  id: string; record?: RegistryRecord; damaged: boolean; scope: "none" | "local" | "global";
  receipts: RegistryReceipt[]; issues: string[];
}
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const bytes = registryBytes;
const exact = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export async function validateRegistryRecord(value: unknown, id: string): Promise<RegistryRecord> {
  try {
    requireSafe(isRecord(value) && hasOnlyKeys(value, ["version", "operation", "state", "id", "createdAt", "plan", "hashes"]), "storage");
    const r = value as unknown as RegistryRecord;
    validateRegistryPlan(r.plan);
    requireSafe(r.version === 1 && r.operation === "edit_organization_registry" && r.state === "prepared" && hash(id) && r.id === id && isTimestamp(r.createdAt) &&
      isRecord(r.hashes) && hasOnlyKeys(r.hashes, ["before", "after"]) && Object.values(r.hashes).every(hash) &&
      await checksum(r.plan.source.content) === r.hashes.before && await checksum(r.plan.after) === r.hashes.after &&
      await checksum(JSON.stringify({ ...r, id: "", createdAt: 0 })) === id, "storage");
    return r;
  } catch { throw new SafeApplyError("storage"); }
}
export async function registryRecord(plan: RegistryPlan): Promise<RegistryRecord> {
  const r: RegistryRecord = { version: 1, operation: "edit_organization_registry", state: "prepared", id: "", createdAt: Date.now(),
    plan: JSON.parse(JSON.stringify(plan)) as RegistryPlan, hashes: { before: await checksum(plan.source.content), after: await checksum(plan.after) } };
  r.id = await checksum(JSON.stringify({ ...r, createdAt: 0 })); return validateRegistryRecord(r, r.id);
}
type Adapter = Pick<DataAdapter, "exists" | "stat" | "mkdir" | "write" | "read" | "list" | "copy">;
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}";
/** Append-only evidence in its own directory. No repair, deletion or startup writes. */
export class RegistryJournal {
  readonly root: string;
  constructor(private readonly adapter: Adapter, configDir: string, pluginId: string) {
    requireSafe(isVaultPath(configDir) && isIdentifier(pluginId) && isVaultPath(pluginId), "storage");
    this.root = `${configDir}/plugins/${pluginId}/consolidation-registry-operations`;
  }
  private dir(id: string): string { requireSafe(hash(id), "storage"); return `${this.root}/${id}`; }
  private async read(path: string): Promise<string> {
    const stat = await this.adapter.stat(path); requireSafe(stat?.type === "file" && stat.size <= 6_000_000, "storage");
    const raw = await this.adapter.read(path); requireSafe(raw.length <= 6_000_000, "storage"); return raw;
  }
  has(id: string): Promise<boolean> { return this.adapter.exists(this.dir(id)); }
  async prepare(r: RegistryRecord): Promise<void> {
    await validateRegistryRecord(r, r.id); const dir = this.dir(r.id), raw = JSON.stringify(r);
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
  async mark(r: RegistryRecord, state: RegistryMark, note: SavedNote): Promise<void> {
    const attempt = crypto.randomUUID(), path = `${this.dir(r.id)}/mark-${attempt}.json`;
    const raw = JSON.stringify({ version: 1, operation: r.operation, id: r.id, attempt, state, recordHash: await checksum(JSON.stringify(r)),
      modified: note.modified, bytes: note.bytes, hash: await checksum(note.content) });
    requireSafe(!await this.adapter.exists(path), "storage"); await this.adapter.write(path, raw); requireSafe(await this.read(path) === raw, "storage");
  }
  async entries(): Promise<RegistryEntry[]> {
    const unknown = (id: string): RegistryEntry => ({ id, damaged: true, scope: "global", receipts: [], issues: ["structure"] });
    let listing: { files: string[]; folders: string[] };
    try {
      if (!await this.adapter.exists(this.root)) return [];
      requireSafe((await this.adapter.stat(this.root))?.type === "folder", "storage"); listing = await this.adapter.list(this.root);
    } catch { return [unknown(this.root)]; }
    const rows = listing.files.map(unknown);
    for (const dir of listing.folders.sort()) {
      const id = dir.slice(this.root.length + 1);
      if (!hash(id) || dir !== `${this.root}/${id}`) { rows.push(unknown(dir)); continue; }
      const row: RegistryEntry = { id, damaged: false, scope: "none", receipts: [], issues: [] }, valid: RegistryRecord[] = [];
      for (const name of ["record.json", "backup.json"]) {
        try { valid.push(await validateRegistryRecord(JSON.parse(await this.read(`${dir}/${name}`)), id)); }
        catch { row.issues.push(name); }
      }
      row.record = valid[0];
      if (valid.length === 2 && !exact(valid[0], valid[1])) { row.record = undefined; row.issues.push("copies"); }
      try {
        const files = await this.adapter.list(dir);
        if (files.folders.length) row.scope = "global";
        for (const file of files.files.sort()) {
          if ([`${dir}/record.json`, `${dir}/backup.json`].includes(file)) continue;
          const match = new RegExp(`^mark-(${uuid})\\.json$`, "u").exec(file.slice(dir.length + 1));
          if (!match || file !== `${dir}/mark-${match[1]}.json`) { row.scope = "global"; row.issues.push("structure"); continue; }
          try {
            const m: unknown = JSON.parse(await this.read(file)), r = row.record;
            requireSafe(r && isRecord(m) && hasOnlyKeys(m, ["version", "operation", "id", "attempt", "state", "recordHash", "modified", "bytes", "hash"]) &&
              m.version === 1 && m.operation === r.operation && m.id === id && m.attempt === match[1] &&
              ["applied", "undo_intent", "undone"].includes(m.state as string) && m.recordHash === await checksum(JSON.stringify(r)) &&
              isTimestamp(m.modified) && m.bytes === bytes(m.state === "undone" ? r.plan.source.content : r.plan.after) &&
              m.hash === (m.state === "undone" ? r.hashes.before : r.hashes.after), "storage");
            row.receipts.push({ state: m.state as RegistryMark, modified: m.modified, bytes: m.bytes, hash: m.hash });
          } catch { row.issues.push(file.slice(dir.length + 1)); }
        }
      } catch { row.scope = "global"; row.issues.push("structure"); }
      for (const state of ["applied", "undo_intent", "undone"] as const) {
        const receipts = row.receipts.filter(m => m.state === state);
        if (receipts.some(m => !exact(m, receipts[0]))) row.issues.push("receipts_disagree");
      }
      const applied = row.receipts.find(m => m.state === "applied"), intent = row.receipts.find(m => m.state === "undo_intent");
      if (applied && intent && (applied.modified !== intent.modified || applied.bytes !== intent.bytes || applied.hash !== intent.hash)) row.issues.push("receipt_identity");
      if (row.receipts.some(m => m.state === "undone") && !intent) row.issues.push("marker_order");
      row.receipts.sort((a, b) => a.state.localeCompare(b.state));
      row.damaged = row.issues.length > 0 || row.scope === "global";
      row.scope = !row.record || row.scope === "global" ? "global" : row.damaged ? "local" : "none";
      rows.push(row);
    }
    return rows;
  }
}
