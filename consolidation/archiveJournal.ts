import { parseYaml } from "obsidian";
import type { CachedMetadata, DataAdapter } from "obsidian";
import { isRecord, hasOnlyKeys, isVaultPath, isIdentifier, isTimestamp } from "../health/domain/validation";
import { checksum, requireSafe } from "./operationJournal";
import { validateMergeRecord } from "./mergeJournal";
import type { MergeRecord } from "./mergeJournal";
import { ARCHIVE_LIMITATIONS, archiveMark } from "./archivePlan";
import type { ArchivePlan } from "./archivePlan";
import type { SavedNote } from "./savedNote";
import type { PlanRange } from "./changePlan";

export interface ArchiveRecord {
  version: 1; operation: "archive_in_place"; state: "prepared"; id: string; createdAt: number;
  parent: MergeRecord; plan: ArchivePlan; afterHash: string;
}
export type ArchiveMark = "applied" | "undo_intent" | "undone";
export interface ArchiveReceipt { state: ArchiveMark; modified: number; bytes: number; hash: string }
export interface ArchiveEntry {
  id: string; record?: ArchiveRecord; damaged: boolean; scope: "none" | "local" | "global";
  receipts: ArchiveReceipt[]; issues: string[];
}
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const bytes = (s: string) => new TextEncoder().encode(s).length;
const exact = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function range(v: unknown, text: string): asserts v is PlanRange {
  requireSafe(isRecord(v) && hasOnlyKeys(v, ["start", "end", "text"]) && Number.isSafeInteger(v.start) && Number.isSafeInteger(v.end) &&
    (v.start as number) >= 0 && (v.end as number) > (v.start as number) && (v.end as number) <= text.length &&
    v.text === text.slice(v.start as number, v.end as number), "storage");
}
/** Reconstruct only YAML cache evidence for the existing literal insertion validator. */
function storedYaml(text: string): Pick<CachedMetadata, "frontmatter" | "frontmatterPosition"> {
  const opening = /^---\r?\n/u.exec(text); if (!opening) return {};
  const close = /^---(?:\r?\n|$)/gmu; close.lastIndex = opening[0].length;
  const end = close.exec(text); requireSafe(end, "storage");
  const parsed: unknown = parseYaml(text.slice(opening[0].length, end.index));
  requireSafe(parsed == null || isRecord(parsed), "storage");
  return { frontmatter: parsed ?? {}, frontmatterPosition: {
    start: { offset: 0, line: 0, col: 0 }, end: { offset: end.index + 3, line: text.slice(0, end.index).split("\n").length - 1, col: 3 },
  } };
}
/** Independent discriminator; valid hashes cannot authorize any edit except the two literal archive properties. */
export async function validateArchiveRecord(value: unknown, id: string): Promise<ArchiveRecord> {
  requireSafe(isRecord(value) && hasOnlyKeys(value, ["version", "operation", "state", "id", "createdAt", "parent", "plan", "afterHash"]), "storage");
  const r = value as unknown as ArchiveRecord, p = r.plan;
  requireSafe(r.version === 1 && r.operation === "archive_in_place" && r.state === "prepared" && hash(id) && r.id === id && isTimestamp(r.createdAt) &&
    isRecord(r.parent) && typeof r.parent.id === "string" && isRecord(p) &&
    hasOnlyKeys(p, ["version", "operation", "status", "secondary", "canonical", "provenance", "copied", "preservation", "dependencies", "confirmation", "limitations", "edit"]), "storage");
  const parent = await validateMergeRecord(r.parent, r.parent.id), c = p.canonical, s = p.secondary, v = p.provenance;
  requireSafe(p.version === 1 && p.operation === "archive_in_place_plan" && p.status === "archived" &&
    isRecord(c) && hasOnlyKeys(c, ["path", "created", "modified", "bytes", "content", "hash"]) &&
    c.path === parent.canonical.path && c.created === parent.canonical.created && c.content === parent.canonical.after && c.hash === parent.canonical.afterHash &&
    isTimestamp(c.modified) && c.bytes === bytes(c.content) &&
    isRecord(s) && hasOnlyKeys(s, ["path", "created", "modified", "bytes", "before", "after", "beforeHash"]) &&
    s.path === parent.secondary.path && s.created === parent.secondary.created && s.modified === parent.secondary.modified &&
    s.bytes === parent.secondary.bytes && s.before === parent.secondary.content && s.beforeHash === parent.secondary.hash && typeof s.after === "string" && s.after.length <= 210_000 &&
    isRecord(v) && hasOnlyKeys(v, ["operation", "id", "createdAt", "recordHash", "receipt"]) && v.operation === parent.operation && v.id === parent.id &&
    v.createdAt === parent.createdAt && v.recordHash === await checksum(JSON.stringify(parent)) &&
    isRecord(v.receipt) && hasOnlyKeys(v.receipt, ["state", "modified", "bytes"]) && v.receipt.state === "applied" &&
    v.receipt.modified === c.modified && v.receipt.bytes === c.bytes && exact(p.copied, parent.transfers) &&
    exact(p.confirmation, { limitationsReviewed: true }) && exact(p.limitations, ARCHIVE_LIMITATIONS) &&
    isRecord(p.edit) && hasOnlyKeys(p.edit, ["start", "end", "removed", "inserted"]) && Array.isArray(p.preservation), "storage");
  const edit = archiveMark({ content: s.before, cache: storedYaml(s.before) }, c.path);
  requireSafe(exact(p.edit, edit) && s.after === s.before.slice(0, edit.start) + edit.inserted + s.before.slice(edit.end), "storage");
  let previous = 0;
  for (const f of p.preservation) {
    requireSafe(isRecord(f) && hasOnlyKeys(f, ["range", "context", "disposition"]) && ["represented", "retained"].includes(f.disposition), "storage");
    range(f.range, s.before); range(f.context, s.before);
    requireSafe(f.range.start >= previous && f.context.start <= f.range.start && f.context.end >= f.range.end, "storage"); previous = f.range.end;
  }
  previous = 0;
  for (const span of [...p.copied.map(t => t.range), ...p.preservation.map(f => f.range)].sort((a, b) => a.start - b.start)) {
    requireSafe(span.start >= previous && !s.before.slice(previous, span.start).trim(), "storage"); previous = span.end;
  }
  requireSafe(!s.before.slice(previous).trim() && Array.isArray(p.dependencies) && p.dependencies.length === 2, "storage");
  const references = (refs: unknown) => Array.isArray(refs) && refs.every(ref => isRecord(ref) && hasOnlyKeys(ref, ["kind", "original", "target"]) &&
    ["link", "embed", "property"].includes(ref.kind as string) && typeof ref.original === "string" && (ref.target === null || isVaultPath(ref.target)));
  for (const [i, d] of p.dependencies.entries()) requireSafe(isRecord(d) && hasOnlyKeys(d, ["path", "outgoing", "incoming"]) &&
    d.path === [c.path, s.path][i] && references(d.outgoing) && (d.incoming === null || Array.isArray(d.incoming) && d.incoming.every(n =>
      isRecord(n) && hasOnlyKeys(n, ["path", "count", "references", "metadataAvailable"]) && isVaultPath(n.path) &&
      Number.isSafeInteger(n.count) && n.count > 0 && typeof n.metadataAvailable === "boolean" && references(n.references))), "storage");
  requireSafe(await checksum(s.after) === r.afterHash && await checksum(JSON.stringify({ ...r, id: "", createdAt: 0 })) === id, "storage");
  return r;
}
export async function archiveRecord(plan: ArchivePlan, parent: MergeRecord): Promise<ArchiveRecord> {
  const r: ArchiveRecord = { version: 1, operation: "archive_in_place", state: "prepared", id: "", createdAt: Date.now(),
    parent: JSON.parse(JSON.stringify(parent)) as MergeRecord, plan: JSON.parse(JSON.stringify(plan)) as ArchivePlan, afterHash: await checksum(plan.secondary.after) };
  r.id = await checksum(JSON.stringify({ ...r, createdAt: 0 })); return validateArchiveRecord(r, r.id);
}
type Adapter = Pick<DataAdapter, "exists" | "stat" | "mkdir" | "write" | "read" | "list" | "copy">;
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}";
/** Append-only evidence in its own directory. No repair, deletion or startup writes. */
export class ArchiveJournal {
  readonly root: string;
  constructor(private readonly adapter: Adapter, configDir: string, pluginId: string) {
    requireSafe(isVaultPath(configDir) && isIdentifier(pluginId) && isVaultPath(pluginId), "storage");
    this.root = `${configDir}/plugins/${pluginId}/consolidation-archive-operations`;
  }
  private dir(id: string): string { requireSafe(hash(id), "storage"); return `${this.root}/${id}`; }
  private async read(path: string): Promise<string> {
    const stat = await this.adapter.stat(path); requireSafe(stat?.type === "file" && stat.size <= 6_000_000, "storage");
    const raw = await this.adapter.read(path); requireSafe(raw.length <= 6_000_000, "storage"); return raw;
  }
  has(id: string): Promise<boolean> { return this.adapter.exists(this.dir(id)); }
  async prepare(r: ArchiveRecord): Promise<void> {
    await validateArchiveRecord(r, r.id); const dir = this.dir(r.id), raw = JSON.stringify(r);
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
  async mark(r: ArchiveRecord, state: ArchiveMark, note: SavedNote): Promise<void> {
    const attempt = crypto.randomUUID(), path = `${this.dir(r.id)}/mark-${attempt}.json`;
    const raw = JSON.stringify({ version: 1, operation: r.operation, id: r.id, attempt, state, recordHash: await checksum(JSON.stringify(r)),
      modified: note.modified, bytes: note.bytes, hash: await checksum(note.content) });
    requireSafe(!await this.adapter.exists(path), "storage"); await this.adapter.write(path, raw); requireSafe(await this.read(path) === raw, "storage");
  }
  async entries(): Promise<ArchiveEntry[]> {
    const unknown = (id: string): ArchiveEntry => ({ id, damaged: true, scope: "global", receipts: [], issues: ["structure"] });
    let listing: { files: string[]; folders: string[] };
    try {
      if (!await this.adapter.exists(this.root)) return [];
      requireSafe((await this.adapter.stat(this.root))?.type === "folder", "storage"); listing = await this.adapter.list(this.root);
    } catch { return [unknown(this.root)]; }
    const rows = listing.files.map(unknown);
    for (const dir of listing.folders.sort()) {
      const id = dir.slice(this.root.length + 1);
      if (!hash(id) || dir !== `${this.root}/${id}`) { rows.push(unknown(dir)); continue; }
      const row: ArchiveEntry = { id, damaged: false, scope: "none", receipts: [], issues: [] }, valid: ArchiveRecord[] = [];
      for (const name of ["record.json", "backup.json"]) {
        try { valid.push(await validateArchiveRecord(JSON.parse(await this.read(`${dir}/${name}`)), id)); }
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
              isTimestamp(m.modified) && m.bytes === bytes(m.state === "undone" ? r.plan.secondary.before : r.plan.secondary.after) &&
              m.hash === (m.state === "undone" ? r.plan.secondary.beforeHash : r.afterHash), "storage");
            row.receipts.push({ state: m.state as ArchiveMark, modified: m.modified, bytes: m.bytes, hash: m.hash });
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
