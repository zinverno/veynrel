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
export type EvidenceStatus = "valid" | "missing" | "unreadable" | "invalid_json" | "invalid_record" | "integrity" | "invalid_marker" | "unknown";
export interface JournalEvidence { name: string; status: EvidenceStatus; sha256: string | null }
export interface JournalIssue { file: string; code: EvidenceStatus | "copies_disagree" | "marker_order" | "resolution_uncommitted" | "resolution_stale" }
export interface ResolutionRecord {
  version: 1; operationId: string; attempt: string; decision: "acknowledge_verified_state"; confirmedAt: number;
  recordHash: string; evidence: JournalEvidence[]; evidenceHash: string;
  source: { path: string; created: number; modified: number; bytes: number; hash: string; state: "before" | "after" };
}
export interface JournalEntry {
  id: string; record?: OperationRecord; copies: { name: string; record: OperationRecord }[];
  marks: JournalMark[]; damaged: boolean; issues: JournalIssue[]; evidence: JournalEvidence[];
  scope: "none" | "local" | "global"; evidenceHash: string; resolution?: ResolutionRecord;
  resolutionAttempts: JournalEvidence[];
}
class JournalValidationError extends Error { constructor(readonly code: "invalid_record" | "integrity") { super(code); } }
function validRecord(condition: unknown, code: "invalid_record" | "integrity" = "invalid_record"): asserts condition {
  if (!condition) throw new JournalValidationError(code);
}
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
  validRecord(isRecord(value) && hasOnlyKeys(value, ["version", "state", "id", "createdAt", "operation", "sourcePath", "targetPath", "sourceCreated", "sourceModified", "targetCreated", "targetModified", "targetHash", "before", "after", "beforeHash", "afterHash", "selection", "edit"]));
  const r = value as unknown as OperationRecord;
  validRecord(r.version === 1 && r.state === "prepared" && isHash(id) && isTimestamp(r.createdAt) &&
    [r.sourceCreated, r.sourceModified, r.targetCreated, r.targetModified].every(isTimestamp) &&
    markdownPath(r.sourcePath) && markdownPath(r.targetPath) && r.sourcePath !== r.targetPath &&
    [r.beforeHash, r.afterHash, r.targetHash].every(isHash) &&
    typeof r.before === "string" && typeof r.after === "string" && r.before.length <= 200_000 && r.after.length <= 210_000 &&
    isRecord(r.selection) && hasOnlyKeys(r.selection, ["start", "end", "text"]) &&
    isRecord(r.edit) && hasOnlyKeys(r.edit, ["start", "end", "removed", "inserted"]));
  const s = r.selection, e = r.edit, token = r.targetPath.slice(0, -3);
  validRecord(!/[[\]#|^\\]/u.test(token) && Number.isSafeInteger(s.start) && Number.isSafeInteger(s.end) && s.start >= 0 && s.end > s.start && s.end <= r.before.length &&
    typeof s.text === "string" && r.before.slice(s.start, s.end) === s.text &&
    ((r.operation === "add_link" && e.start === s.end && e.end === s.end && e.removed === "" && e.inserted === ` [[${token}]]`) ||
      (r.operation === "replace_with_embed" && e.start === s.start && e.end === s.end && e.removed === s.text && e.inserted === `![[${token}]]`)) &&
    r.after === r.before.slice(0, e.start) + e.inserted + r.before.slice(e.end) && r.before !== r.after,
  );
  validRecord(r.id === id && await checksum(r.before) === r.beforeHash && await checksum(r.after) === r.afterHash &&
    await checksum(JSON.stringify({ ...r, id: "", createdAt: 0 })) === id, "integrity");
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
  private async evidence(path: string, name: string): Promise<{ item: JournalEvidence; raw?: string }> {
    try {
      if (!await this.adapter.exists(path)) return { item: { name, status: "missing", sha256: null } };
      const raw = await this.read(path);
      return { item: { name, status: "valid", sha256: await checksum(raw) }, raw };
    } catch { return { item: { name, status: "unreadable", sha256: null } }; }
  }
  private empty(id: string): JournalEntry {
    return { id, copies: [], marks: [], damaged: false, issues: [], evidence: [], scope: "none", evidenceHash: "", resolutionAttempts: [] };
  }
  private unknown(path: string): JournalEntry {
    const entry = this.empty(path); entry.damaged = true; entry.scope = "global";
    entry.issues.push({ file: path, code: "unknown" }); return entry;
  }
  /** Isolate individual failures: untrusted names are displayed, never followed or used as source paths. */
  async entries(): Promise<JournalEntry[]> {
    let listed: { files: string[]; folders: string[] };
    try {
      if (!await this.adapter.exists(this.root)) return [];
      requireSafe((await this.adapter.stat(this.root))?.type === "folder", "storage");
      listed = await this.adapter.list(this.root);
    } catch {
      const entry = this.unknown(this.root); entry.issues = [{ file: this.root, code: "unreadable" }]; return [entry];
    }
    const result = listed.files.map(path => this.unknown(path));
    for (const path of listed.folders.sort()) {
      const id = path.slice(this.root.length + 1);
      if (!path.startsWith(`${this.root}/`) || !isHash(id)) { result.push(this.unknown(path)); continue; }
      const entry = this.empty(id);
      for (const name of ["record.json", "backup.json"]) {
        const { item, raw } = await this.evidence(`${path}/${name}`, name);
        if (raw !== undefined) {
          let parsed: unknown;
          try { parsed = JSON.parse(raw); } catch { item.status = "invalid_json"; }
          if (item.status === "valid") {
            try { entry.copies.push({ name, record: await validateOperation(parsed, id) }); }
            catch (error) { item.status = error instanceof JournalValidationError ? error.code : "invalid_record"; }
          }
        }
        entry.evidence.push(item);
        if (item.status !== "valid") entry.issues.push({ file: name, code: item.status });
      }
      entry.record = entry.copies[0]?.record;
      const disagree = entry.copies.length === 2 && JSON.stringify(entry.copies[0].record) !== JSON.stringify(entry.copies[1].record);
      if (disagree) entry.issues.push({ file: "record.json / backup.json", code: "copies_disagree" });
      for (const state of ["applied", "undo_pending", "undone"] as const) {
        const name = `${state}.json`, { item, raw } = await this.evidence(`${path}/${name}`, name);
        if (raw !== undefined) {
          const expected = JSON.stringify({ version: 1, id, state, checksum: await checksum(JSON.stringify(entry.record) ?? "") });
          if (!entry.record || raw !== expected) item.status = "invalid_marker";
          else entry.marks.push(state);
        }
        entry.evidence.push(item);
        if (item.status !== "valid" && item.status !== "missing") entry.issues.push({ file: name, code: item.status });
      }
      if (entry.marks.includes("undone") && !entry.marks.includes("undo_pending")) entry.issues.push({ file: "undone.json", code: "marker_order" });
      let files: string[] = [], layoutKnown = true;
      try {
        const children = await this.adapter.list(path); files = children.files;
        for (const child of [...children.files, ...children.folders]) {
          const name = child.slice(path.length + 1);
          if (!child.startsWith(`${path}/`) || child.includes("/", path.length + 1) || children.folders.includes(child) ||
            !["record.json", "backup.json", "applied.json", "undo_pending.json", "undone.json"].includes(name) && !resolutionName.test(name)) {
            entry.issues.push({ file: child, code: "unknown" });
            entry.evidence.push({ name: child, status: "unknown", sha256: null }); layoutKnown = false;
          }
        }
      } catch { entry.issues.push({ file: id, code: "unreadable" }); layoutKnown = false; }
      entry.evidenceHash = await checksum(JSON.stringify(entry.evidence));
      if (entry.record && !disagree && layoutKnown) await this.resolutions(entry, path, files);
      else for (const file of files.filter(file => file.startsWith(`${path}/`) && resolutionName.test(file.slice(path.length + 1)))) {
        const { item } = await this.evidence(file, file.slice(path.length + 1));
        if (item.status === "valid") item.status = "unknown";
        entry.resolutionAttempts.push(item);
      }
      entry.damaged = entry.issues.length > 0;
      entry.scope = !entry.record || disagree ? "global" : entry.damaged ? "local" : "none";
      result.push(entry);
    }
    return result;
  }
  private async resolutions(entry: JournalEntry, path: string, files: string[]): Promise<void> {
    const attempts = new Set(files.filter(file => resolutionName.test(file.slice(path.length + 1))).map(file => file.slice(path.length + 1).split(".")[0]));
    for (const name of [...attempts].sort()) {
      const data = await this.evidence(`${path}/${name}.json`, `${name}.json`);
      const commit = await this.evidence(`${path}/${name}.commit.json`, `${name}.commit.json`);
      let receipt: ResolutionRecord | undefined;
      if (data.raw !== undefined) {
        try {
          receipt = await validateResolution(JSON.parse(data.raw), entry, name.slice("resolution-".length));
        } catch { data.item.status = "invalid_record"; }
      }
      if (commit.raw !== undefined) {
        const expected = JSON.stringify({ version: 1, operationId: entry.id, attempt: name.slice("resolution-".length), sha256: data.item.sha256 });
        if (!receipt || commit.raw !== expected) commit.item.status = "invalid_marker";
      }
      entry.resolutionAttempts.push(data.item, commit.item);
      if (receipt && commit.item.status === "valid") {
        if (receipt.evidenceHash === entry.evidenceHash) entry.resolution = receipt;
        else entry.issues.push({ file: name, code: "resolution_stale" });
      } else entry.issues.push({ file: name, code: "resolution_uncommitted" });
    }
  }
  /** A unique intent and a separate commit: a torn attempt never reserves the next attempt's filename. */
  async resolve(receipt: ResolutionRecord, recheck: () => Promise<void>, guard: () => void): Promise<void> {
    const path = `${this.path(receipt.operationId)}/resolution-${receipt.attempt}`;
    requireSafe(uuid.test(receipt.attempt), "storage");
    requireSafe(!await this.adapter.exists(`${path}.json`) && !await this.adapter.exists(`${path}.commit.json`), "used");
    const raw = JSON.stringify(receipt);
    guard(); await this.adapter.write(`${path}.json`, raw);
    requireSafe(await this.read(`${path}.json`) === raw, "storage");
    await recheck();
    const committed = JSON.stringify({ version: 1, operationId: receipt.operationId, attempt: receipt.attempt, sha256: await checksum(raw) });
    requireSafe(!await this.adapter.exists(`${path}.commit.json`), "used");
    guard(); await this.adapter.write(`${path}.commit.json`, committed);
    requireSafe(await this.read(`${path}.commit.json`) === committed, "storage");
  }
}

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const resolutionName = /^resolution-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}(?:\.commit)?\.json$/u;
export async function validateResolution(value: unknown, entry: JournalEntry, attempt: string): Promise<ResolutionRecord> {
  requireSafe(isRecord(value) && hasOnlyKeys(value, ["version", "operationId", "attempt", "decision", "confirmedAt", "recordHash", "evidence", "evidenceHash", "source"]), "storage");
  const r = value as unknown as ResolutionRecord, original = entry.record;
  requireSafe(original && r.version === 1 && r.operationId === entry.id && uuid.test(attempt) && r.attempt === attempt &&
    r.decision === "acknowledge_verified_state" && isTimestamp(r.confirmedAt) && r.recordHash === await checksum(JSON.stringify(original)) &&
    Array.isArray(r.evidence) && r.evidence.length === 5 && r.evidence.every((item, i) => isRecord(item) && hasOnlyKeys(item, ["name", "status", "sha256"]) &&
      item.name === ["record.json", "backup.json", "applied.json", "undo_pending.json", "undone.json"][i] &&
      ["valid", "missing", "invalid_json", "invalid_record", "integrity", "invalid_marker"].includes(item.status) &&
      (item.status === "missing" ? item.sha256 === null : isHash(item.sha256))) &&
    r.evidence.slice(0, 2).some(item => item.status === "valid") &&
    r.evidenceHash === await checksum(JSON.stringify(r.evidence)) && isRecord(r.source) && hasOnlyKeys(r.source, ["path", "created", "modified", "bytes", "hash", "state"]) &&
    r.source.path === original.sourcePath && r.source.created === original.sourceCreated && isTimestamp(r.source.modified) &&
    Number.isSafeInteger(r.source.bytes) && r.source.bytes >= 0 &&
    (r.source.state === "before" && r.source.hash === original.beforeHash || r.source.state === "after" && r.source.hash === original.afterHash), "storage");
  return r;
}
