import type { ArchiveParentRead } from "./archivePlanV2";
import type { CachedMetadata, DataAdapter } from "obsidian";
import { isRecord, hasOnlyKeys, isVaultPath, isIdentifier, isTimestamp } from "../health/domain/validation";
import { checksum, requireSafe, SafeApplyError } from "./operationJournal";
import { validateGroupRecord } from "./groupJournal";
import { validateBundleRecord } from "./bundleJournal";
import { buildArchivePlanV2 } from "./archivePlanV2";
import type { ArchiveParent, ArchivePlanV2, ArchiveDependenciesV2 } from "./archivePlanV2";
import { structuralEvidence } from "./structuralArchiveEvidence";
import type { PlanPair } from "./changePlan";
import type { SavedNote } from "./savedNote";

export interface StructuralEnvironment {
  metadata: [CachedMetadata, CachedMetadata]; dependencies: ArchiveDependenciesV2[];
  consumers: { path: string; created: number; modified: number; bytes: number; metadata: CachedMetadata }[];
}
export interface StructuralArchiveRecord {
  version: 2; operation: "structural_archive_in_place"; state: "prepared"; id: string; createdAt: number;
  parent: ArchiveParent; plan: ArchivePlanV2; environment: string;
  hashes: { canonical: string; before: string; after: string; edit: string };
}
export type StructuralArchiveMark = "applied" | "undo_intent" | "undone";
export interface StructuralArchiveReceipt {
  version: 2; operation: StructuralArchiveRecord["operation"]; id: string; attempt: string;
  state: StructuralArchiveMark; recordHash: string; previous: string; evidenceHash: string; modified: number; bytes: number; hash: string;
}
export interface StructuralArchiveEntry {
  id: string; record?: StructuralArchiveRecord; damaged: boolean; scope: "none" | "local" | "global";
  receipts: StructuralArchiveReceipt[]; issues: string[];
}
const states: StructuralArchiveMark[] = ["applied", "undo_intent", "undone"];
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const bytes = (s: string) => new TextEncoder().encode(s).length;
const exact = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function references(value: unknown): boolean {
  return Array.isArray(value) && value.every(r => isRecord(r) && hasOnlyKeys(r, ["kind", "original", "target"]) &&
    ["link", "embed", "property"].includes(r.kind as string) && typeof r.original === "string" && r.original.length > 0 && isVaultPath(r.target));
}
function dependencies(value: unknown, paths: string[]): boolean {
  return Array.isArray(value) && value.length === 2 && value.every((d, i) => isRecord(d) &&
    hasOnlyKeys(d, ["path", "outgoing", "incoming", "issues", "targets"]) && d.path === paths[i] && references(d.outgoing) &&
    exact(d.issues, ["external_consumers_unverified"]) && Array.isArray(d.incoming) &&
    new Set(d.incoming.map(n => isRecord(n) ? n.path : null)).size === d.incoming.length && d.incoming.every(n => isRecord(n) &&
      hasOnlyKeys(n, ["path", "count", "metadataAvailable", "references"]) && isVaultPath(n.path) && Number.isSafeInteger(n.count) &&
      (n.count as number) > 0 && n.metadataAvailable === true && references(n.references) && (n.references as unknown[]).length === n.count &&
      (n.references as { target: string }[]).every(r => r.target === d.path)) && Array.isArray(d.targets) && d.targets.every(t => isRecord(t) &&
      hasOnlyKeys(t, ["from", "kind", "original", "target", "subpath"]) && isVaultPath(t.from) && isVaultPath(t.target) &&
      ["link", "embed", "property"].includes(t.kind as string) && typeof t.original === "string" && t.original.length > 0 &&
      typeof t.subpath === "string" && (t.subpath === "" || t.subpath.startsWith("#"))));
}
export const completeStructuralArchive = (e: StructuralArchiveEntry): boolean => !e.damaged && e.scope === "none" && e.receipts.length === 3 && e.receipts.every((m, i) => m.state === states[i]);

/** Rebuild stored evidence without granting synthetic TFile identities any native authority. */
export async function validateStructuralArchiveRecord(value: unknown, id: string): Promise<StructuralArchiveRecord> {
  try {
    requireSafe(isRecord(value) && hasOnlyKeys(value, ["version", "operation", "state", "id", "createdAt", "parent", "plan", "environment", "hashes"]), "storage");
    const r = value as unknown as StructuralArchiveRecord, p = r.plan;
    requireSafe(r.version === 2 && r.operation === "structural_archive_in_place" && r.state === "prepared" && hash(id) && r.id === id && isTimestamp(r.createdAt) &&
      isRecord(r.parent) && isRecord(p) && typeof r.environment === "string" && r.environment.length <= 6_000_000 &&
      isRecord(r.hashes) && hasOnlyKeys(r.hashes, ["canonical", "before", "after", "edit"]) && Object.values(r.hashes).every(hash), "storage");
    const parent = r.parent.operation === "copy_context_group" ? await validateGroupRecord(r.parent, r.parent.id) : await validateBundleRecord(r.parent, r.parent.id);
    requireSafe(isRecord(p.provenance) && exact(p.provenance.parent, parent) && p.provenance.recordHash === await checksum(JSON.stringify(parent)) &&
      isRecord(p.provenance.receipt) && hasOnlyKeys(p.provenance.receipt, ["state", "modified", "bytes", "hash"]) &&
      isTimestamp(p.provenance.receipt.modified) && p.provenance.receipt.state === "applied", "storage");
    const e = JSON.parse(r.environment) as StructuralEnvironment;
    requireSafe(isRecord(e) && hasOnlyKeys(e, ["metadata", "dependencies", "consumers"]) && structuralEvidence(e) === r.environment &&
      Array.isArray(e.metadata) && e.metadata.length === 2 && e.metadata.every(isRecord) && Array.isArray(e.dependencies) && e.dependencies.length === 2 &&
      exact(e.dependencies, JSON.parse(structuralEvidence(p.dependencies))) && Array.isArray(e.consumers) && e.consumers.every(c =>
        isRecord(c) && hasOnlyKeys(c, ["path", "created", "modified", "bytes", "metadata"]) && isVaultPath(c.path) &&
        isTimestamp(c.created) && isTimestamp(c.modified) && Number.isSafeInteger(c.bytes) && c.bytes >= 0 && isRecord(c.metadata)), "storage");
    const c = p.canonical, s = p.secondary;
    requireSafe(isRecord(c) && isRecord(s) && Array.isArray(p.preservation) && isRecord(p.confirmation), "storage");
    requireSafe(dependencies(e.dependencies, [c.path, s.path]) && new Set(e.consumers.map(c => c.path)).size === e.consumers.length &&
      e.consumers.every(n => n.path !== c.path && n.path !== s.path), "storage");
    const notes = [c, s].map((n, i) => ({ path: n.path, created: n.created, modified: n.modified, bytes: n.bytes,
      content: i ? s.before : c.content, file: { path: n.path, stat: { ctime: n.created, mtime: n.modified, size: n.bytes } },
      cache: e.metadata[i], references: e.dependencies[i].outgoing })) as unknown as PlanPair;
    const rebuilt = buildArchivePlanV2({ record: parent, recordHash: p.provenance.recordHash,
      entry: { id: parent.id, record: parent, damaged: false, scope: "none", issues: [], receipts: [p.provenance.receipt] } as ArchiveParentRead["entry"],
      notes, guard: () => {}, dependencies: p.dependencies }, { status: p.status, limitationsReviewed: p.confirmation.limitationsReviewed,
      unknownDependenciesAccepted: p.confirmation.unknownDependenciesAccepted, dispositions: p.preservation.map(f => ({ range: f.range, disposition: f.disposition })) });
    requireSafe(structuralEvidence(rebuilt) === structuralEvidence(p) && c.hash === await checksum(c.content) && s.beforeHash === await checksum(s.before) &&
      exact(r.hashes, { canonical: await checksum(c.content), before: await checksum(s.before), after: await checksum(s.after), edit: await checksum(JSON.stringify(p.edit)) }) &&
      await checksum(JSON.stringify({ ...r, id: "", createdAt: 0 })) === id, "storage");
    return r;
  } catch { throw new SafeApplyError("storage"); }
}
export async function structuralArchiveRecord(plan: ArchivePlanV2, environment: string): Promise<StructuralArchiveRecord> {
  const r: StructuralArchiveRecord = { version: 2, operation: "structural_archive_in_place", state: "prepared", id: "", createdAt: Date.now(),
    parent: JSON.parse(JSON.stringify(plan.provenance.parent)) as ArchiveParent, plan: JSON.parse(JSON.stringify(plan)) as ArchivePlanV2, environment,
    hashes: { canonical: await checksum(plan.canonical.content), before: await checksum(plan.secondary.before), after: await checksum(plan.secondary.after), edit: await checksum(JSON.stringify(plan.edit)) } };
  r.id = await checksum(JSON.stringify({ ...r, createdAt: 0 })); return validateStructuralArchiveRecord(r, r.id);
}
async function validateReceipt(m: unknown, r: StructuralArchiveRecord, attempt: string): Promise<StructuralArchiveReceipt> {
  requireSafe(isRecord(m) && hasOnlyKeys(m, ["version", "operation", "id", "attempt", "state", "recordHash", "previous", "evidenceHash", "modified", "bytes", "hash"]) &&
    m.version === 2 && m.operation === r.operation && m.id === r.id && m.attempt === attempt && states.includes(m.state as StructuralArchiveMark) &&
    m.recordHash === await checksum(JSON.stringify(r)) && hash(m.previous) && m.evidenceHash === await checksum(r.environment) && isTimestamp(m.modified) &&
    m.bytes === bytes(m.state === "undone" ? r.plan.secondary.before : r.plan.secondary.after) && m.hash === (m.state === "undone" ? r.hashes.before : r.hashes.after), "storage");
  return m as unknown as StructuralArchiveReceipt;
}
type Adapter = Pick<DataAdapter, "exists" | "stat" | "mkdir" | "write" | "read" | "list" | "copy">;
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}";
/** Append-only evidence in its own directory. No repair, deletion or startup writes. */
export class StructuralArchiveJournal {
  readonly root: string;
  constructor(private readonly adapter: Adapter, configDir: string, pluginId: string) {
    requireSafe(isVaultPath(configDir) && isIdentifier(pluginId) && isVaultPath(pluginId), "storage");
    this.root = `${configDir}/plugins/${pluginId}/consolidation-structural-archive-operations`;
  }
  private dir(id: string): string { requireSafe(hash(id), "storage"); return `${this.root}/${id}`; }
  private async read(path: string): Promise<string> {
    const stat = await this.adapter.stat(path); requireSafe(stat?.type === "file" && stat.size <= 12_000_000, "storage");
    const raw = await this.adapter.read(path); requireSafe(raw.length <= 12_000_000, "storage"); return raw;
  }
  has(id: string): Promise<boolean> { return this.adapter.exists(this.dir(id)); }
  async prepare(r: StructuralArchiveRecord): Promise<void> {
    await validateStructuralArchiveRecord(r, r.id); const dir = this.dir(r.id), raw = JSON.stringify(r);
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
  async mark(r: StructuralArchiveRecord, state: StructuralArchiveMark, note: SavedNote): Promise<void> {
    const entry = (await this.entries()).find(e => e.id === r.id);
    requireSafe(entry && !entry.damaged && exact(entry.record, r) && entry.receipts.length === states.indexOf(state), "storage");
    const previous = entry.receipts.length ? await checksum(JSON.stringify(entry.receipts[entry.receipts.length - 1])) : await checksum(JSON.stringify(r));
    const attempt = crypto.randomUUID(), path = `${this.dir(r.id)}/mark-${attempt}.json`;
    const raw = JSON.stringify({ version: 2, operation: r.operation, id: r.id, attempt, state, recordHash: await checksum(JSON.stringify(r)), previous, evidenceHash: await checksum(r.environment),
      modified: note.modified, bytes: note.bytes, hash: await checksum(note.content) });
    requireSafe(!await this.adapter.exists(path), "storage"); await this.adapter.write(path, raw); requireSafe(await this.read(path) === raw, "storage");
  }
  async entries(): Promise<StructuralArchiveEntry[]> {
    const unknown = (id: string): StructuralArchiveEntry => ({ id, damaged: true, scope: "global", receipts: [], issues: ["structure"] });
    let listing: { files: string[]; folders: string[] };
    try {
      if (!await this.adapter.exists(this.root)) return [];
      requireSafe((await this.adapter.stat(this.root))?.type === "folder", "storage"); listing = await this.adapter.list(this.root);
    } catch { return [unknown(this.root)]; }
    const rows = listing.files.map(unknown);
    for (const dir of listing.folders.sort()) {
      const id = dir.slice(this.root.length + 1);
      if (!hash(id) || dir !== `${this.root}/${id}`) { rows.push(unknown(dir)); continue; }
      const row: StructuralArchiveEntry = { id, damaged: false, scope: "none", receipts: [], issues: [] }, valid: StructuralArchiveRecord[] = [];
      for (const name of ["record.json", "backup.json"]) {
        try { valid.push(await validateStructuralArchiveRecord(JSON.parse(await this.read(`${dir}/${name}`)), id)); }
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
            requireSafe(r, "storage");
            row.receipts.push(await validateReceipt(m, r, match[1]));
          } catch { row.issues.push(file.slice(dir.length + 1)); }
        }
      } catch { row.scope = "global"; row.issues.push("structure"); }
      row.receipts.sort((a, b) => states.indexOf(a.state) - states.indexOf(b.state));
      for (const [i, m] of row.receipts.entries()) {
        if (m.state !== states[i] || m.previous !== await checksum(JSON.stringify(i ? row.receipts[i - 1] : row.record))) row.issues.push("receipt_chain");
      }
      const [applied, intent] = row.receipts;
      if (intent && applied && (applied.modified !== intent.modified || applied.bytes !== intent.bytes || applied.hash !== intent.hash)) row.issues.push("receipt_identity");
      row.damaged = row.issues.length > 0 || row.scope === "global";
      row.scope = !row.record || row.scope === "global" ? "global" : row.damaged ? "local" : "none";
      rows.push(row);
    }
    return rows;
  }
}
