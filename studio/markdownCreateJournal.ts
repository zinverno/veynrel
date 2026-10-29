import { checksum } from "../consolidation/operationJournal";
import { atomKey } from "../consolidation/atomizationPlan";
import { ensure, freeze, hash, integer, notePath, object, uuid } from "./recipe";
import { StudioStorage } from "./storage";
import type { StudioWritePlan } from "./writePlan";
import type { CreatedMarkdown } from "./markdownTarget";
import { parentPath } from "./markdownTarget";

export interface MarkdownCreateIntent {
  schemaVersion: 1; operation: "markdown-create"; id: string; createdAt: number;
  recipeId: string; recipeVersion: string; plan: StudioWritePlan; sources: readonly { path: string; content: string }[];
}
export interface MarkdownCreateMark {
  schemaVersion: 1; id: string; index: number; intentHash: string; kind: "dispatch" | "created" | "not-created";
  observed: { hash: string; created: number; modified: number; bytes: number } | null; manual: boolean;
}
export interface MarkdownCreateEntry { id: string; intent?: MarkdownCreateIntent; marks: MarkdownCreateMark[]; damaged: boolean }
const statNumber = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0;
export async function validateCreateIntent(raw: unknown, id: string): Promise<MarkdownCreateIntent> {
  ensure(object(raw, ["schemaVersion", "operation", "id", "createdAt", "recipeId", "recipeVersion", "plan", "sources"]) &&
    raw.schemaVersion === 1 && raw.operation === "markdown-create" && uuid(id) && raw.id === id && statNumber(raw.createdAt) &&
    typeof raw.recipeId === "string" && typeof raw.recipeVersion === "string", "storage");
  const p = raw.plan;
  ensure(object(p, ["schemaVersion", "id", "reviewId", "destination", "policyVersion", "checksVersion", "requiresAcknowledgement", "rows"]) &&
    p.schemaVersion === 1 && p.id === id && uuid(p.reviewId) && p.destination === "new-note" && p.policyVersion === 1 && p.checksVersion === 1 && p.requiresAcknowledgement === false &&
    Array.isArray(p.rows) && p.rows.length > 0 && p.rows.length <= 20 && Array.isArray(raw.sources) && raw.sources.length === p.rows.length, "storage");
  const targets = new Set<string>(), paths = new Set<string>();
  for (let i = 0; i < p.rows.length; i++) {
    const r: unknown = p.rows[i], source: unknown = raw.sources[i];
    ensure(object(r, ["source", "target", "output", "outputHash", "action"]) && object(r.source, ["path", "identity", "hash", "created", "modified", "bytes"]) &&
      notePath(r.source.path) && integer(r.source.identity, 1, Number.MAX_SAFE_INTEGER) && hash(r.source.hash) &&
      [r.source.created, r.source.modified, r.source.bytes].every(statNumber) && notePath(r.target) && !targets.has(atomKey(r.target)) && !paths.has(r.source.path) &&
      parentPath(r.source.path) === parentPath(r.target) && atomKey(r.source.path) !== atomKey(r.target) &&
      (r.action === "replace" || r.action === "append") && typeof r.output === "string" && r.output.length <= 80_000 && hash(r.outputHash) && await checksum(r.output) === r.outputHash &&
      r.output.startsWith(`Source / Источник: [[${r.source.path}]]\n\n`) &&
      object(source, ["path", "content"]) && source.path === r.source.path && typeof source.content === "string" && source.content.length <= 24_000 &&
      await checksum(source.content) === r.source.hash && new TextEncoder().encode(source.content).length === r.source.bytes, "storage");
    targets.add(atomKey(r.target)); paths.add(r.source.path);
  }
  return freeze(raw as unknown as MarkdownCreateIntent);
}

/** New namespace/version; existing Apply/Undo and diagram evidence are never migrated. */
export class MarkdownCreateJournal {
  readonly root: string;
  constructor(private readonly storage: StudioStorage) { this.root = `${storage.root}/markdown-create`; }
  private dir(id: string): string { ensure(uuid(id), "storage"); return `${this.root}/${id}`; }
  async prepare(intent: MarkdownCreateIntent): Promise<void> {
    await validateCreateIntent(intent, intent.id); const payload = JSON.stringify(intent);
    await this.storage.create(`${this.dir(intent.id)}/intent.json`, JSON.stringify({ payload, hash: await checksum(payload) }));
    await this.intact(intent);
  }
  async intact(intent: MarkdownCreateIntent): Promise<MarkdownCreateEntry> {
    const entry = await this.entry(intent.id);
    ensure(!entry.damaged && JSON.stringify(entry.intent) === JSON.stringify(intent), "storage"); return entry;
  }
  async mark(intent: MarkdownCreateIntent, index: number, kind: MarkdownCreateMark["kind"], note: CreatedMarkdown | null, manual = false): Promise<void> {
    await this.intact(intent);
    const mark: MarkdownCreateMark = { schemaVersion: 1, id: intent.id, index, intentHash: await checksum(JSON.stringify(intent)), kind, manual,
      observed: note ? { hash: await checksum(note.content), created: note.created, modified: note.modified, bytes: note.bytes } : null };
    await this.storage.create(`${this.dir(intent.id)}/${index}-${kind}.json`, JSON.stringify(mark)); await this.intact(intent);
  }
  async entry(id: string): Promise<MarkdownCreateEntry> {
    const row: MarkdownCreateEntry = { id, marks: [], damaged: false };
    try {
      const dir = this.dir(id), raw: unknown = JSON.parse(await this.storage.read(`${dir}/intent.json`, 3_000_000));
      ensure(object(raw, ["payload", "hash"]) && typeof raw.payload === "string" && hash(raw.hash) && await checksum(raw.payload) === raw.hash, "storage");
      const intent = await validateCreateIntent(JSON.parse(raw.payload), id); row.intent = intent;
      const list = await this.storage.adapter.list(dir); ensure(!list.folders.length, "storage");
      for (const path of list.files) {
        if (path === `${dir}/intent.json`) continue;
        const match = /^(\d+)-(dispatch|created|not-created)\.json$/u.exec(path.slice(dir.length + 1));
        ensure(match, "storage"); const index = Number(match[1]), kind = match[2], planned = intent.plan.rows[index];
        ensure(planned && path === `${dir}/${index}-${kind}.json`, "storage");
        const m: unknown = JSON.parse(await this.storage.read(path, 3000));
        ensure(object(m, ["schemaVersion", "id", "index", "intentHash", "kind", "observed", "manual"]) && m.schemaVersion === 1 && m.id === id && m.index === index && m.kind === kind &&
          m.intentHash === await checksum(JSON.stringify(intent)) && typeof m.manual === "boolean", "storage");
        if (kind === "created") ensure(object(m.observed, ["hash", "created", "modified", "bytes"]) && m.observed.hash === planned.outputHash &&
          [m.observed.created, m.observed.modified, m.observed.bytes].every(statNumber) && m.observed.bytes === new TextEncoder().encode(planned.output).length, "storage");
        else ensure(m.observed === null && (kind !== "dispatch" || !m.manual) && (kind !== "not-created" || m.manual), "storage");
        row.marks.push(m as unknown as MarkdownCreateMark);
      }
      for (let i = 0; i < intent.plan.rows.length; i++) {
        const marks = row.marks.filter(m => m.index === i), created = marks.find(m => m.kind === "created");
        ensure(!(created && marks.some(m => m.kind === "not-created")) && (!created || created.manual || marks.some(m => m.kind === "dispatch")), "storage");
      }
    } catch { row.damaged = true; }
    return row;
  }
  async entries(): Promise<MarkdownCreateEntry[]> {
    try {
      if (!await this.storage.adapter.exists(this.root)) return [];
      const list = await this.storage.adapter.list(this.root); ensure(list.files.length + list.folders.length <= 500, "storage");
      const rows: MarkdownCreateEntry[] = list.files.map(id => ({ id, marks: [], damaged: true }));
      for (const dir of list.folders) rows.push(await this.entry(dir.slice(this.root.length + 1)));
      return rows;
    } catch { return [{ id: this.root, marks: [], damaged: true }]; }
  }
}
