import { checksum } from "../consolidation/operationJournal";
import { ensure, freeze, hash, integer, notePath, object, STUDIO_LIMITS, text, uuid } from "./recipe";
import type { StudioSource, StudioState } from "./ports";
import { StudioStorage } from "./storage";

export interface StudioChange {
  path: string; created: number; modified: number; bytes: number; before: string; after: string;
  beforeHash: string; afterHash: string; action: "replace" | "append";
}
export interface SourceWriteConfirmation { id: string; policyVersion: 1; checksVersion: 1; acknowledged: boolean }
export interface StudioRecord {
  schemaVersion: 1 | 2; operation: "studio_transform"; id: string; createdAt: number; recipeId: string; recipeVersion: string;
  changes: readonly StudioChange[];
  confirmation?: SourceWriteConfirmation;
}
export type MarkKind = "apply-intent" | "applied" | "undo-intent" | "undone" | "skipped";
export interface StudioMark {
  schemaVersion: 1; operation: "studio_transform"; id: string; index: number; kind: MarkKind;
  recordHash: string; created: number; modified: number; bytes: number; contentHash: string;
}
export interface JournalEntry { id: string; record?: StudioRecord; marks: StudioMark[]; damaged: boolean; issues: string[] }
export interface RunReceipt { schemaVersion: 1; id: string; recipeId: string; provider: string; model: string; paths: readonly string[]; createdAt: number }
export interface RunHistory { start?: RunReceipt; id: string; state: StudioState; damaged: boolean }
const timestamp = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const bytes = (s: string) => new TextEncoder().encode(s).length;
export async function validateStudioRecord(value: unknown, id: string): Promise<StudioRecord> {
  const baseKeys = ["schemaVersion", "operation", "id", "createdAt", "recipeId", "recipeVersion", "changes"];
  ensure((object(value, baseKeys) && value.schemaVersion === 1 || object(value, [...baseKeys, "confirmation"]) && value.schemaVersion === 2) &&
    value.operation === "studio_transform" && uuid(id) && value.id === id && timestamp(value.createdAt) &&
    text(value.recipeId, 100) && text(value.recipeVersion, 30) && Array.isArray(value.changes) && value.changes.length > 0 && value.changes.length <= STUDIO_LIMITS.files, "storage");
  if (value.schemaVersion === 2) ensure(object(value.confirmation, ["id", "policyVersion", "checksVersion", "acknowledged"]) && uuid(value.confirmation.id) &&
    value.confirmation.policyVersion === 1 && value.confirmation.checksVersion === 1 && typeof value.confirmation.acknowledged === "boolean", "storage");
  const paths = new Set<string>();
  for (const c of value.changes) {
    ensure(object(c, ["path", "created", "modified", "bytes", "before", "after", "beforeHash", "afterHash", "action"]) && notePath(c.path) &&
      !paths.has(c.path) && timestamp(c.created) && timestamp(c.modified) && integer(c.bytes, 0, STUDIO_LIMITS.input * 4) &&
      typeof c.before === "string" && c.before.length <= STUDIO_LIMITS.input && text(c.after, STUDIO_LIMITS.input + STUDIO_LIMITS.output + 2) &&
      c.bytes === bytes(c.before) && c.after !== c.before && (c.action === "replace" || c.action === "append") &&
      (c.action !== "append" || c.after.startsWith(`${c.before}\n\n`)) &&
      hash(c.beforeHash) && hash(c.afterHash) && await checksum(c.before) === c.beforeHash && await checksum(c.after) === c.afterHash, "storage");
    paths.add(c.path);
  }
  return freeze(value as unknown as StudioRecord);
}

/** Immutable evidence and separate immutable markers; never overwrite a damaged record or receipt. */
export class StudioJournal {
  readonly root: string;
  constructor(readonly storage: StudioStorage) { this.root = `${storage.root}/operations`; }
  private dir(id: string): string { ensure(uuid(id), "storage"); return `${this.root}/${id}`; }
  async prepare(record: StudioRecord): Promise<void> {
    await validateStudioRecord(record, record.id); const dir = this.dir(record.id), raw = JSON.stringify(record);
    ensure(!await this.storage.adapter.exists(dir), "used");
    await this.storage.create(`${dir}/record.json`, raw);
    await this.storage.create(`${dir}/backup.json`, raw);
    await this.intact(record);
  }
  async intact(record: StudioRecord): Promise<JournalEntry> {
    const entry = (await this.entries()).find(e => e.id === record.id);
    ensure(entry && !entry.damaged && JSON.stringify(entry.record) === JSON.stringify(record), "storage"); return entry;
  }
  async mark(record: StudioRecord, index: number, kind: MarkKind, note: StudioSource): Promise<void> {
    const mark: StudioMark = { schemaVersion: 1, operation: "studio_transform", id: record.id, index, kind,
      recordHash: await checksum(JSON.stringify(record)), created: note.created, modified: note.modified, bytes: note.bytes, contentHash: await checksum(note.content) };
    await this.storage.create(`${this.dir(record.id)}/${index}-${kind}.json`, JSON.stringify(mark));
    await this.intact(record);
  }
  async entries(): Promise<JournalEntry[]> {
    const damaged = (id: string, issue: string): JournalEntry => ({ id, damaged: true, issues: [issue], marks: [] });
    let listing: { files: string[]; folders: string[] };
    try {
      if (!await this.storage.adapter.exists(this.root)) return [];
      listing = await this.storage.adapter.list(this.root);
    } catch { return [damaged(this.root, "unreadable")]; }
    const rows = listing.files.map(p => damaged(p, "unexpected-file"));
    for (const dir of listing.folders.sort()) {
      const id = dir.slice(this.root.length + 1);
      if (!uuid(id) || dir !== this.dir(id)) { rows.push(damaged(dir, "unexpected-directory")); continue; }
      const row: JournalEntry = { id, damaged: false, issues: [], marks: [] }; rows.push(row);
      const records: StudioRecord[] = [];
      for (const name of ["record", "backup"]) {
        try { records.push(await validateStudioRecord(JSON.parse(await this.storage.read(`${dir}/${name}.json`)), id)); }
        catch { row.issues.push(name); }
      }
      row.record = records[0];
      if (records.length === 2 && JSON.stringify(records[0]) !== JSON.stringify(records[1])) { row.issues.push("copies-disagree"); row.record = undefined; }
      try {
        const children = await this.storage.adapter.list(dir); ensure(children.folders.length === 0, "storage");
        for (const path of children.files.sort()) {
          if (path === `${dir}/record.json` || path === `${dir}/backup.json`) continue;
          const match = /^(\d+)-(apply-intent|applied|undo-intent|undone|skipped)\.json$/u.exec(path.slice(dir.length + 1));
          const r = row.record; ensure(match && r && path === `${dir}/${match[0]}`, "storage");
          const m: unknown = JSON.parse(await this.storage.read(path, 2000)), index = Number(match[1]), kind = match[2];
          ensure(path === `${dir}/${index}-${kind}.json`, "storage");
          const c = r.changes[index];
          ensure(c && object(m, ["schemaVersion", "operation", "id", "index", "kind", "recordHash", "created", "modified", "bytes", "contentHash"]) &&
            m.schemaVersion === 1 && m.operation === r.operation && m.id === id && m.index === index && m.kind === kind &&
            m.recordHash === await checksum(JSON.stringify(r)) && m.created === c.created && timestamp(m.modified) &&
            m.bytes === bytes(["apply-intent", "undone", "skipped"].includes(kind) ? c.before : c.after) &&
            m.contentHash === (["apply-intent", "undone", "skipped"].includes(kind) ? c.beforeHash : c.afterHash) &&
            (kind !== "apply-intent" && kind !== "skipped" || m.modified === c.modified), "storage");
          row.marks.push(m as unknown as StudioMark);
        }
        for (let i = 0; i < (row.record?.changes.length ?? 0); i++) {
          const mark = (kind: MarkKind) => row.marks.find(m => m.index === i && m.kind === kind);
          const applied = mark("applied"), undo = mark("undo-intent");
          ensure((!applied || mark("apply-intent")) && (!undo || applied) && (!mark("undone") || undo) &&
            (!mark("skipped") || !applied && !undo && !mark("undone")) &&
            (!undo || undo.modified === applied!.modified && undo.bytes === applied!.bytes), "storage");
        }
      } catch { row.issues.push("markers"); }
      row.damaged = row.issues.length > 0;
    }
    return rows;
  }
  async startRun(start: RunReceipt): Promise<void> {
    ensure(uuid(start.id), "storage");
    await this.storage.create(`${this.storage.root}/runs/${start.id}/start.json`, JSON.stringify(start));
  }
  async finishRun(id: string, state: "review" | "failed" | "cancelled"): Promise<void> {
    ensure(uuid(id), "storage");
    await this.storage.create(`${this.storage.root}/runs/${id}/finish.json`, JSON.stringify({ schemaVersion: 1, id, state }));
  }
  async runs(): Promise<RunHistory[]> {
    const root = `${this.storage.root}/runs`, s = this.storage;
    try {
      if (!await s.adapter.exists(root)) return [];
      const listing = await s.adapter.list(root), rows: RunHistory[] = listing.files.map(id => ({ id, state: "interrupted", damaged: true }));
      for (const dir of listing.folders) {
        const id = dir.slice(root.length + 1), row: RunHistory = { id, state: "interrupted", damaged: false }; rows.push(row);
        try {
          ensure(uuid(id) && dir === `${root}/${id}`, "storage");
          const start: unknown = JSON.parse(await s.read(`${dir}/start.json`, 30_000));
          ensure(object(start, ["schemaVersion", "id", "recipeId", "provider", "model", "paths", "createdAt"]) && start.schemaVersion === 1 && start.id === id &&
            text(start.recipeId, 100) && text(start.provider, 50) && text(start.model, 500) && timestamp(start.createdAt) && Array.isArray(start.paths) &&
            start.paths.length > 0 && start.paths.length <= STUDIO_LIMITS.files && start.paths.every(notePath) && new Set(start.paths).size === start.paths.length, "storage");
          row.start = start as unknown as RunReceipt;
          const files = await s.adapter.list(dir); ensure(!files.folders.length && files.files.every(p => p === `${dir}/start.json` || p === `${dir}/finish.json`), "storage");
          if (await s.adapter.exists(`${dir}/finish.json`)) {
            const finish: unknown = JSON.parse(await s.read(`${dir}/finish.json`, 2000));
            ensure(object(finish, ["schemaVersion", "id", "state"]) && finish.schemaVersion === 1 && finish.id === id && typeof finish.state === "string" && ["review", "cancelled", "failed"].includes(finish.state), "storage");
            row.state = finish.state === "review" ? "interrupted" : finish.state as "cancelled" | "failed";
          }
        } catch { row.damaged = true; }
      }
      return rows;
    } catch { return [{ id: root, state: "interrupted", damaged: true }]; }
  }
}
