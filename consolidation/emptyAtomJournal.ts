import type { DataAdapter } from "obsidian";
import { isRecord, hasOnlyKeys, isVaultPath, isIdentifier, isTimestamp } from "../health/domain/validation";
import { checksum, requireSafe, SafeApplyError } from "./operationJournal";
import { validateEmptyAtomPlan } from "./emptyAtomPlan";
import type { AtomizationPlanV2, AtomNoteEvidence } from "./emptyAtomPlan";
import type { PlanNote, PlanPair } from "./changePlan";
import type { SavedNote } from "./savedNote";
export interface EmptyAtomRecord {
  version: 1; operation: "write_atom_to_empty_note"; state: "prepared"; id: string; createdAt: number;
  plan: AtomizationPlanV2; hashes: { before: string; after: string; sources: [string, string] };
}
export type EmptyAtomMark = "applied" | "undo_intent" | "undone";
export interface EmptyAtomReceipt { state: EmptyAtomMark; created: number; modified: number; bytes: number; hash: string }
export interface EmptyAtomEntry {
  id: string; record?: EmptyAtomRecord; damaged: boolean; scope: "none" | "local" | "global";
  receipts: EmptyAtomReceipt[]; issues: string[];
}
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const bytes = (s: string) => new TextEncoder().encode(s).length;
const exact = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Structural reconstruction validates serialized facts; it never manufactures a runtime identity token. */
export async function validateEmptyAtomRecord(value: unknown, id: string): Promise<EmptyAtomRecord> {
  try {
    requireSafe(isRecord(value) && hasOnlyKeys(value,["version","operation","state","id","createdAt","plan","hashes"]),"storage");
    const r=value as unknown as EmptyAtomRecord,p=r.plan;
    requireSafe(r.version===1 && r.operation==="write_atom_to_empty_note" && r.state==="prepared" && hash(id) && r.id===id && isTimestamp(r.createdAt) &&
      isRecord(p) && p.version===2 && p.operation===r.operation && Array.isArray(p.sources) && p.sources.length===2 &&
      isRecord(p.observation) && hasOnlyKeys(p.observation,["configDir","sourceLink","dependencyHash"]) && isVaultPath(p.observation.configDir) && hash(p.observation.dependencyHash) &&
      isRecord(p.provenance) && typeof p.provenance.provider==="string" && typeof p.provenance.model==="string" &&
      isRecord(r.hashes) && hasOnlyKeys(r.hashes,["before","after","sources"]) && hash(r.hashes.before) && hash(r.hashes.after) &&
      Array.isArray(r.hashes.sources) && r.hashes.sources.length===2 && r.hashes.sources.every(hash),"storage");
    const note=(n:AtomNoteEvidence,target=false):PlanNote=>{
      requireSafe(isRecord(n) && hasOnlyKeys(n,["path","created","modified","bytes","markdown","metadata","references",...(target?["before","after"]:[])]) &&
        isVaultPath(n.path) && isTimestamp(n.created) && isTimestamp(n.modified) && Number.isSafeInteger(n.bytes) && n.bytes>=0 &&
        typeof n.markdown==="string" && n.markdown.length<=200_000 && n.bytes===bytes(n.markdown) && isRecord(n.metadata) && Array.isArray(n.references),"storage");
      for(const ref of n.references) requireSafe(isRecord(ref) && hasOnlyKeys(ref,["kind","original","target"]) &&
        ["link","embed","property"].includes(ref.kind) && typeof ref.original==="string" && (ref.target===null||isVaultPath(ref.target)),"storage");
      return {path:n.path,content:n.markdown,created:n.created,modified:n.modified,bytes:n.bytes,cache:n.metadata,references:n.references,
        file:{path:n.path,stat:{ctime:n.created,mtime:n.modified,size:n.bytes}}} as unknown as PlanNote;
    };
    const pair=p.sources.map(n=>note(n)) as unknown as PlanPair,target=note(p.target,true);
    requireSafe(p.target.before==="" && p.target.markdown==="" && typeof p.target.after==="string" && p.target.after.length<=600_000,"storage");
    validateEmptyAtomPlan(p,{pair,provider:p.provenance.provider,model:p.provenance.model,result:p.provenance.analysis},pair,target,p.confirmations,p.observation);
    requireSafe(await checksum("")===r.hashes.before && await checksum(p.target.after)===r.hashes.after &&
      await checksum(p.sources[0].markdown)===r.hashes.sources[0] && await checksum(p.sources[1].markdown)===r.hashes.sources[1] &&
      await checksum(JSON.stringify({...r,id:"",createdAt:0}))===id,"storage");
    return r;
  } catch { throw new SafeApplyError("storage"); }
}
export async function emptyAtomRecord(plan:AtomizationPlanV2):Promise<EmptyAtomRecord> {
  const r:EmptyAtomRecord={version:1,operation:"write_atom_to_empty_note",state:"prepared",id:"",createdAt:Date.now(),
    plan:JSON.parse(JSON.stringify(plan)) as AtomizationPlanV2,
    hashes:{before:await checksum(""),after:await checksum(plan.target.after),sources:[await checksum(plan.sources[0].markdown),await checksum(plan.sources[1].markdown)]}};
  r.id=await checksum(JSON.stringify({...r,createdAt:0}));return validateEmptyAtomRecord(r,r.id);
}
type Adapter = Pick<DataAdapter, "exists" | "stat" | "mkdir" | "write" | "read" | "list" | "copy">;
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}";
/** Append-only evidence in its own directory. No repair, deletion or startup writes. */
export class EmptyAtomJournal {
  readonly root: string;
  constructor(private readonly adapter: Adapter, configDir: string, pluginId: string) {
    requireSafe(isVaultPath(configDir) && isIdentifier(pluginId) && isVaultPath(pluginId), "storage");
    this.root = `${configDir}/plugins/${pluginId}/consolidation-empty-atom-operations`;
  }
  private dir(id: string): string { requireSafe(hash(id), "storage"); return `${this.root}/${id}`; }
  private async read(path: string): Promise<string> {
    const stat = await this.adapter.stat(path); requireSafe(stat?.type === "file" && stat.size <= 6_000_000, "storage");
    const raw = await this.adapter.read(path); requireSafe(raw.length <= 6_000_000, "storage"); return raw;
  }
  has(id: string): Promise<boolean> { return this.adapter.exists(this.dir(id)); }
  async prepare(r: EmptyAtomRecord): Promise<void> {
    await validateEmptyAtomRecord(r, r.id); const dir = this.dir(r.id), raw = JSON.stringify(r);
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
  async mark(r: EmptyAtomRecord, state: EmptyAtomMark, note: SavedNote): Promise<void> {
    const attempt = crypto.randomUUID(), path = `${this.dir(r.id)}/mark-${attempt}.json`;
    const raw = JSON.stringify({ version: 1, operation: r.operation, id: r.id, attempt, state, recordHash: await checksum(JSON.stringify(r)),
      created: note.file.stat.ctime, modified: note.modified, bytes: note.bytes, hash: await checksum(note.content) });
    requireSafe(!await this.adapter.exists(path), "storage"); await this.adapter.write(path, raw); requireSafe(await this.read(path) === raw, "storage");
  }
  async entries(): Promise<EmptyAtomEntry[]> {
    const unknown = (id: string): EmptyAtomEntry => ({ id, damaged: true, scope: "global", receipts: [], issues: ["structure"] });
    let listing: { files: string[]; folders: string[] };
    try {
      if (!await this.adapter.exists(this.root)) return [];
      requireSafe((await this.adapter.stat(this.root))?.type === "folder", "storage"); listing = await this.adapter.list(this.root);
    } catch { return [unknown(this.root)]; }
    const rows = listing.files.map(unknown);
    for (const dir of listing.folders.sort()) {
      const id = dir.slice(this.root.length + 1);
      if (!hash(id) || dir !== `${this.root}/${id}`) { rows.push(unknown(dir)); continue; }
      const row: EmptyAtomEntry = { id, damaged: false, scope: "none", receipts: [], issues: [] }, valid: EmptyAtomRecord[] = [];
      for (const name of ["record.json", "backup.json"]) {
        try { valid.push(await validateEmptyAtomRecord(JSON.parse(await this.read(`${dir}/${name}`)), id)); }
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
            requireSafe(r && isRecord(m) && hasOnlyKeys(m, ["version", "operation", "id", "attempt", "state", "recordHash", "created", "modified", "bytes", "hash"]) &&
              m.version === 1 && m.operation === r.operation && m.id === id && m.attempt === match[1] &&
              ["applied", "undo_intent", "undone"].includes(m.state as string) && m.recordHash === await checksum(JSON.stringify(r)) &&
              m.created === r.plan.target.created && isTimestamp(m.modified) && m.bytes === bytes(m.state === "undone" ? r.plan.target.before : r.plan.target.after) &&
              m.hash === (m.state === "undone" ? r.hashes.before : r.hashes.after), "storage");
            row.receipts.push({ state: m.state as EmptyAtomMark, created: m.created, modified: m.modified, bytes: m.bytes, hash: m.hash });
          } catch { row.issues.push(file.slice(dir.length + 1)); }
        }
      } catch { row.scope = "global"; row.issues.push("structure"); }
      for (const state of ["applied", "undo_intent", "undone"] as const) {
        const receipts = row.receipts.filter(m => m.state === state);
        if (receipts.some(m => !exact(m, receipts[0]))) row.issues.push("receipts_disagree");
      }
      const applied = row.receipts.find(m => m.state === "applied"), intent = row.receipts.find(m => m.state === "undo_intent");
      if (applied && intent && (applied.modified !== intent.modified || applied.bytes !== intent.bytes || applied.hash !== intent.hash)) row.issues.push("receipt_identity");
      if ((intent && !applied) || (row.receipts.some(m => m.state === "undone") && !intent)) row.issues.push("marker_order");
      row.receipts.sort((a, b) => a.state.localeCompare(b.state));
      row.damaged = row.issues.length > 0 || row.scope === "global";
      row.scope = !row.record || row.scope === "global" ? "global" : row.damaged ? "local" : "none";
      rows.push(row);
    }
    return rows;
  }
}
