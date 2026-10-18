import type { DataAdapter } from "obsidian";
import { isRecord, hasOnlyKeys, isVaultPath, isIdentifier, isTimestamp } from "../health/domain/validation";
import { checksum, requireSafe, SafeApplyError } from "./operationJournal";
import { validateGroupPlan } from "./groupPlan";
import type { GroupPlan } from "./groupPlan";
import type { PlanPair } from "./changePlan";
import type { SavedNote } from "./savedNote";

/** Versioned heading-group evidence; GroupPlan is rebuilt independently of all other protocols. */
export interface GroupRecord {
  version: 1; operation: "copy_context_group"; state: "prepared"; id: string; createdAt: number;
  plan: GroupPlan; hashes: { before: string; after: string; secondary: string };
}
export type GroupMark = "applied" | "undo_intent" | "undone";
export interface GroupReceipt { state: GroupMark; modified: number; bytes: number; hash: string }
export interface GroupEntry {
  id: string; record?: GroupRecord; damaged: boolean; scope: "none" | "local" | "global";
  receipts: GroupReceipt[]; issues: string[];
}
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const bytes = (s: string) => new TextEncoder().encode(s).length;
const exact = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Rebuild the group contract from saved evidence; synthetic identities never reach a Vault port. */
export async function validateGroupRecord(value: unknown, id: string): Promise<GroupRecord> {
  try {
    requireSafe(isRecord(value) && hasOnlyKeys(value, ["version", "operation", "state", "id", "createdAt", "plan", "hashes"]), "storage");
    const r = value as unknown as GroupRecord, p = r.plan;
    requireSafe(r.version === 1 && r.operation === "copy_context_group" && r.state === "prepared" && hash(id) && r.id === id && isTimestamp(r.createdAt) &&
      isRecord(p) && hasOnlyKeys(p, ["version", "operation", "readOnly", "canonical", "secondary", "hierarchy", "group", "insertion", "confirmations", "dependencies", "resolver", "refusals", "provenance", "limitations"]) &&
      isRecord(r.hashes) && hasOnlyKeys(r.hashes, ["before", "after", "secondary"]) && Object.values(r.hashes).every(hash), "storage");
    const c=p.canonical,s=p.secondary;
    requireSafe(isRecord(c) && hasOnlyKeys(c,["path","identity","before","after"]) && isRecord(s) && hasOnlyKeys(s,["path","identity","content","unchanged"]) &&
      typeof c.before === "string" && c.before.length <= 200_000 && typeof c.after === "string" && c.after.length <= 600_000 &&
      typeof s.content === "string" && s.content.length <= 200_000 &&
      isRecord(p.confirmations) && hasOnlyKeys(p.confirmations,["operation","canonical","group","representation","groupConfirmed","contextConfirmed","insertionConfirmed","dependencies","distinctIntent","insertion"]) &&
      (p.confirmations.canonical===0||p.confirmations.canonical===1) && typeof p.confirmations.distinctIntent === "boolean" &&
      Array.isArray(p.dependencies) && p.dependencies.length===2 && Array.isArray(p.resolver) && p.resolver.length===2 && p.resolver.every(t=>typeof t==="string") &&
      isRecord(p.provenance) && hasOnlyKeys(p.provenance,["origin","provider","model","analysis"]) && typeof p.provenance.provider==="string" && typeof p.provenance.model==="string", "storage");
    for(const n of [c,s]) requireSafe(isRecord(n.identity) && hasOnlyKeys(n.identity,["created","modified","bytes","contentHash"]) &&
      isTimestamp(n.identity.created) && isTimestamp(n.identity.modified) && Number.isSafeInteger(n.identity.bytes) && n.identity.bytes>=0 && isVaultPath(n.path), "storage");
    requireSafe(c.identity.bytes===bytes(c.before) && s.identity.bytes===bytes(s.content),"storage");
    const notes=p.confirmations.canonical===0?[c,s]:[s,c];
    const pair=notes.map((n,i)=>{
      const d=p.dependencies[i],text=n===c?c.before:s.content;
      requireSafe(isRecord(d) && hasOnlyKeys(d,["path","metadata","outgoing","incoming"]) && d.path===n.path && isRecord(d.metadata) && Array.isArray(d.outgoing),"storage");
      for(const ref of d.outgoing) requireSafe(isRecord(ref) && hasOnlyKeys(ref,["kind","original","target"]) &&
        ["link","embed","property"].includes(ref.kind) && typeof ref.original==="string" && (ref.target===null||isVaultPath(ref.target)),"storage");
      requireSafe(d.incoming===null||isRecord(d.incoming)&&hasOnlyKeys(d.incoming,["items","total"])&&Array.isArray(d.incoming.items)&&
        d.incoming.items.every(isVaultPath)&&Number.isSafeInteger(d.incoming.total)&&d.incoming.total>=d.incoming.items.length,"storage");
      const file={path:n.path,stat:{ctime:n.identity.created,mtime:n.identity.modified,size:n.identity.bytes}};
      return {path:n.path,file,created:n.identity.created,modified:n.identity.modified,bytes:n.identity.bytes,content:text,cache:d.metadata,references:d.outgoing};
    }) as unknown as PlanPair;
    validateGroupPlan(p,{pair,provider:p.provenance.provider,model:p.provenance.model,result:p.provenance.analysis},pair,p.confirmations,p.resolver,
      [(p.dependencies as GroupPlan["dependencies"])[0].incoming,(p.dependencies as GroupPlan["dependencies"])[1].incoming]);
    requireSafe(await checksum(c.before)===r.hashes.before && await checksum(c.after)===r.hashes.after && await checksum(s.content)===r.hashes.secondary &&
      await checksum(JSON.stringify({...r,id:"",createdAt:0}))===id,"storage");
    return r;
  } catch { throw new SafeApplyError("storage"); }
}
export async function groupRecord(plan: GroupPlan): Promise<GroupRecord> {
  const r:GroupRecord={version:1,operation:"copy_context_group",state:"prepared",id:"",createdAt:Date.now(),
    plan:JSON.parse(JSON.stringify(plan)) as GroupPlan,hashes:{before:await checksum(plan.canonical.before),after:await checksum(plan.canonical.after),secondary:await checksum(plan.secondary.content)}};
  r.id=await checksum(JSON.stringify({...r,createdAt:0}));return validateGroupRecord(r,r.id);
}
type Adapter = Pick<DataAdapter, "exists" | "stat" | "mkdir" | "write" | "read" | "list" | "copy">;
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}";
/** Append-only evidence in its own directory. No repair, deletion or startup writes. */
export class GroupJournal {
  readonly root: string;
  constructor(private readonly adapter: Adapter, configDir: string, pluginId: string) {
    requireSafe(isVaultPath(configDir) && isIdentifier(pluginId) && isVaultPath(pluginId), "storage");
    this.root = `${configDir}/plugins/${pluginId}/consolidation-group-operations`;
  }
  private dir(id: string): string { requireSafe(hash(id), "storage"); return `${this.root}/${id}`; }
  private async read(path: string): Promise<string> {
    const stat = await this.adapter.stat(path); requireSafe(stat?.type === "file" && stat.size <= 6_000_000, "storage");
    const raw = await this.adapter.read(path); requireSafe(raw.length <= 6_000_000, "storage"); return raw;
  }
  has(id: string): Promise<boolean> { return this.adapter.exists(this.dir(id)); }
  async prepare(r: GroupRecord): Promise<void> {
    await validateGroupRecord(r, r.id); const dir = this.dir(r.id), raw = JSON.stringify(r);
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
  async mark(r: GroupRecord, state: GroupMark, note: SavedNote): Promise<void> {
    const attempt = crypto.randomUUID(), path = `${this.dir(r.id)}/mark-${attempt}.json`;
    const raw = JSON.stringify({ version: 1, operation: r.operation, id: r.id, attempt, state, recordHash: await checksum(JSON.stringify(r)),
      modified: note.modified, bytes: note.bytes, hash: await checksum(note.content) });
    requireSafe(!await this.adapter.exists(path), "storage"); await this.adapter.write(path, raw); requireSafe(await this.read(path) === raw, "storage");
  }
  async entries(): Promise<GroupEntry[]> {
    const unknown = (id: string): GroupEntry => ({ id, damaged: true, scope: "global", receipts: [], issues: ["structure"] });
    let listing: { files: string[]; folders: string[] };
    try {
      if (!await this.adapter.exists(this.root)) return [];
      requireSafe((await this.adapter.stat(this.root))?.type === "folder", "storage"); listing = await this.adapter.list(this.root);
    } catch { return [unknown(this.root)]; }
    const rows = listing.files.map(unknown);
    for (const dir of listing.folders.sort()) {
      const id = dir.slice(this.root.length + 1);
      if (!hash(id) || dir !== `${this.root}/${id}`) { rows.push(unknown(dir)); continue; }
      const row: GroupEntry = { id, damaged: false, scope: "none", receipts: [], issues: [] }, valid: GroupRecord[] = [];
      for (const name of ["record.json", "backup.json"]) {
        try { valid.push(await validateGroupRecord(JSON.parse(await this.read(`${dir}/${name}`)), id)); }
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
              isTimestamp(m.modified) && m.bytes === bytes(m.state === "undone" ? r.plan.canonical.before : r.plan.canonical.after) &&
              m.hash === (m.state === "undone" ? r.hashes.before : r.hashes.after), "storage");
            row.receipts.push({ state: m.state as GroupMark, modified: m.modified, bytes: m.bytes, hash: m.hash });
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
