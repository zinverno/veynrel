import type { DataAdapter } from "obsidian";
import { isRecord, hasOnlyKeys, isVaultPath, isIdentifier, isTimestamp } from "../health/domain/validation";
import { checksum, requireSafe, SafeApplyError } from "./operationJournal";
import { validateContextBundlePlan } from "./contextBundlePlan";
import type { ContextBundlePlan } from "./contextBundlePlan";
import type { PlanPair } from "./changePlan";
import type { SavedNote } from "./savedNote";

/** Versioned structural-copy envelope; unknown operation/kind is always rejected in v1. */
export interface BundleRecord {
  version: 1; operation: "context_bundle_copy"; state: "prepared"; id: string; createdAt: number;
  plan: ContextBundlePlan; hashes: { before: string; after: string; secondary: string };
}
export type BundleMark = "applied" | "undo_intent" | "undone";
export interface BundleReceipt { state: BundleMark; modified: number; bytes: number; hash: string }
export interface BundleEntry {
  id: string; record?: BundleRecord; damaged: boolean; scope: "none" | "local" | "global";
  receipts: BundleReceipt[]; issues: string[];
}
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const bytes = (s: string) => new TextEncoder().encode(s).length;
const exact = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Rebuild the bundle contract from saved evidence; synthetic identities never reach a Vault port. */
export async function validateBundleRecord(value: unknown, id: string): Promise<BundleRecord> {
  try {
    requireSafe(isRecord(value) && hasOnlyKeys(value, ["version", "operation", "state", "id", "createdAt", "plan", "hashes"]), "storage");
    const r = value as unknown as BundleRecord, p = r.plan;
    requireSafe(r.version === 1 && r.operation === "context_bundle_copy" && r.state === "prepared" && hash(id) && r.id === id && isTimestamp(r.createdAt) &&
      isRecord(p) && hasOnlyKeys(p, ["version", "operation", "readOnly", "kind", "canonical", "secondary", "bundle", "insertion", "confirmations", "dependencies", "resolver", "provenance", "limitations"]) &&
      isRecord(r.hashes) && hasOnlyKeys(r.hashes, ["before", "after", "secondary"]) && Object.values(r.hashes).every(hash), "storage");
    const c=p.canonical,s=p.secondary;
    requireSafe(isRecord(c) && hasOnlyKeys(c,["path","identity","before","after"]) && isRecord(s) && hasOnlyKeys(s,["path","identity","content","unchanged"]) &&
      typeof c.before === "string" && c.before.length <= 200_000 && typeof c.after === "string" && c.after.length <= 600_000 &&
      typeof s.content === "string" && s.content.length <= 200_000 &&
      isRecord(p.confirmations) && hasOnlyKeys(p.confirmations,["operation","canonical","kind","core","context","boundariesConfirmed","contextConfirmed","dependencies","insertion","insertionConfirmed","distinctIntent"]) &&
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
    validateContextBundlePlan(p,{pair,provider:p.provenance.provider,model:p.provenance.model,result:p.provenance.analysis},pair,p.confirmations,p.resolver,
      [(p.dependencies as ContextBundlePlan["dependencies"])[0].incoming,(p.dependencies as ContextBundlePlan["dependencies"])[1].incoming]);
    requireSafe(await checksum(c.before)===r.hashes.before && await checksum(c.after)===r.hashes.after && await checksum(s.content)===r.hashes.secondary &&
      await checksum(JSON.stringify({...r,id:"",createdAt:0}))===id,"storage");
    return r;
  } catch { throw new SafeApplyError("storage"); }
}
export async function bundleRecord(plan: ContextBundlePlan): Promise<BundleRecord> {
  const r:BundleRecord={version:1,operation:"context_bundle_copy",state:"prepared",id:"",createdAt:Date.now(),
    plan:JSON.parse(JSON.stringify(plan)) as ContextBundlePlan,hashes:{before:await checksum(plan.canonical.before),after:await checksum(plan.canonical.after),secondary:await checksum(plan.secondary.content)}};
  r.id=await checksum(JSON.stringify({...r,createdAt:0}));return validateBundleRecord(r,r.id);
}
type Adapter = Pick<DataAdapter, "exists" | "stat" | "mkdir" | "write" | "read" | "list" | "copy">;
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}";
/** Append-only evidence in its own directory. No repair, deletion or startup writes. */
export class BundleJournal {
  readonly root: string;
  constructor(private readonly adapter: Adapter, configDir: string, pluginId: string) {
    requireSafe(isVaultPath(configDir) && isIdentifier(pluginId) && isVaultPath(pluginId), "storage");
    this.root = `${configDir}/plugins/${pluginId}/consolidation-bundle-operations`;
  }
  private dir(id: string): string { requireSafe(hash(id), "storage"); return `${this.root}/${id}`; }
  private async read(path: string): Promise<string> {
    const stat = await this.adapter.stat(path); requireSafe(stat?.type === "file" && stat.size <= 6_000_000, "storage");
    const raw = await this.adapter.read(path); requireSafe(raw.length <= 6_000_000, "storage"); return raw;
  }
  has(id: string): Promise<boolean> { return this.adapter.exists(this.dir(id)); }
  async prepare(r: BundleRecord): Promise<void> {
    await validateBundleRecord(r, r.id); const dir = this.dir(r.id), raw = JSON.stringify(r);
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
  async mark(r: BundleRecord, state: BundleMark, note: SavedNote): Promise<void> {
    const attempt = crypto.randomUUID(), path = `${this.dir(r.id)}/mark-${attempt}.json`;
    const raw = JSON.stringify({ version: 1, operation: r.operation, id: r.id, attempt, state, recordHash: await checksum(JSON.stringify(r)),
      modified: note.modified, bytes: note.bytes, hash: await checksum(note.content) });
    requireSafe(!await this.adapter.exists(path), "storage"); await this.adapter.write(path, raw); requireSafe(await this.read(path) === raw, "storage");
  }
  async entries(): Promise<BundleEntry[]> {
    const unknown = (id: string): BundleEntry => ({ id, damaged: true, scope: "global", receipts: [], issues: ["structure"] });
    let listing: { files: string[]; folders: string[] };
    try {
      if (!await this.adapter.exists(this.root)) return [];
      requireSafe((await this.adapter.stat(this.root))?.type === "folder", "storage"); listing = await this.adapter.list(this.root);
    } catch { return [unknown(this.root)]; }
    const rows = listing.files.map(unknown);
    for (const dir of listing.folders.sort()) {
      const id = dir.slice(this.root.length + 1);
      if (!hash(id) || dir !== `${this.root}/${id}`) { rows.push(unknown(dir)); continue; }
      const row: BundleEntry = { id, damaged: false, scope: "none", receipts: [], issues: [] }, valid: BundleRecord[] = [];
      for (const name of ["record.json", "backup.json"]) {
        try { valid.push(await validateBundleRecord(JSON.parse(await this.read(`${dir}/${name}`)), id)); }
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
            row.receipts.push({ state: m.state as BundleMark, modified: m.modified, bytes: m.bytes, hash: m.hash });
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
