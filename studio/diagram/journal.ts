import { checksum } from "../../consolidation/operationJournal";
import { ensure, freeze, hash, notePath, object, uuid } from "../recipe";
import type { StudioStorage } from "../storage";
import { validateScene } from "./adapter";
import type { DiagramScene } from "./adapter";

export interface DiagramIntent {
  schemaVersion: 1; operation: "diagram-create"; id: string; createdAt: number; target: string; excalidrawVersion: string;
  source: { path: string; content: string; hash: string; created: number; modified: number; bytes: number };
  scene: DiagramScene;
}
export interface DiagramReceipt { schemaVersion: 1; id: string; state: "created" | "not-created"; observedHash: string | null; manual: boolean }
export interface DiagramEntry { id: string; intent?: DiagramIntent; receipt?: DiagramReceipt; damaged: boolean }
export class DiagramJournal {
  readonly root: string;
  constructor(private readonly storage: StudioStorage) { this.root = `${storage.root}/diagrams`; }
  private dir(id: string): string { ensure(uuid(id), "storage"); return `${this.root}/${id}`; }
  async prepare(intent: DiagramIntent): Promise<void> {
    const payload = JSON.stringify(intent);
    await this.storage.create(`${this.dir(intent.id)}/intent.json`, JSON.stringify({ payload, hash: await checksum(payload) }));
    await this.intact(intent);
  }
  async intact(intent: DiagramIntent): Promise<void> {
    const entry = await this.entry(intent.id);
    ensure(!entry.damaged && JSON.stringify(entry.intent) === JSON.stringify(intent) && !entry.receipt, "storage");
  }
  async mark(intent: DiagramIntent, state: DiagramReceipt["state"], raw: string | null, manual = false, active: () => void = () => {}): Promise<void> {
    await this.intact(intent);
    const receipt: DiagramReceipt = { schemaVersion: 1, id: intent.id, state, observedHash: raw === null ? null : await checksum(raw), manual };
    active(); await this.storage.create(`${this.dir(intent.id)}/receipt.json`, JSON.stringify(receipt), active);
  }
  private async entry(id: string): Promise<DiagramEntry> {
    const row: DiagramEntry = { id, damaged: false };
    try {
      const dir = this.dir(id), raw: unknown = JSON.parse(await this.storage.read(`${dir}/intent.json`, 2_000_000));
      ensure(object(raw, ["payload", "hash"]) && typeof raw.payload === "string" && hash(raw.hash) && await checksum(raw.payload) === raw.hash, "storage");
      const intent: unknown = JSON.parse(raw.payload);
      ensure(object(intent, ["schemaVersion", "operation", "id", "createdAt", "target", "excalidrawVersion", "source", "scene"]) && intent.schemaVersion === 1 && intent.operation === "diagram-create" && intent.id === id &&
        typeof intent.createdAt === "number" && Number.isSafeInteger(intent.createdAt) && notePath(intent.target) && intent.target.endsWith(".excalidraw.md") && typeof intent.excalidrawVersion === "string" &&
        object(intent.source, ["path", "content", "hash", "created", "modified", "bytes"]) && notePath(intent.source.path) && typeof intent.source.content === "string" && intent.source.content.length <= 24_000 &&
        await checksum(intent.source.content) === intent.source.hash && [intent.source.created, intent.source.modified, intent.source.bytes].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0), "storage");
      const parsed = intent as unknown as DiagramIntent; validateScene(parsed.scene);
      ensure(parsed.scene.sourcePath === parsed.source.path, "storage"); row.intent = freeze(parsed);
      const listing = await this.storage.adapter.list(dir);
      ensure(!listing.folders.length && listing.files.every(p => p === `${dir}/intent.json` || p === `${dir}/receipt.json`), "storage");
      if (await this.storage.adapter.exists(`${dir}/receipt.json`)) {
        const receipt: unknown = JSON.parse(await this.storage.read(`${dir}/receipt.json`, 2000));
        ensure(object(receipt, ["schemaVersion", "id", "state", "observedHash", "manual"]) && receipt.schemaVersion === 1 && receipt.id === id &&
          (receipt.state === "created" && hash(receipt.observedHash) || receipt.state === "not-created" && receipt.observedHash === null) && typeof receipt.manual === "boolean", "storage");
        row.receipt = receipt as unknown as DiagramReceipt;
      }
    } catch { row.damaged = true; }
    return row;
  }
  async entries(): Promise<DiagramEntry[]> {
    try {
      if (!await this.storage.adapter.exists(this.root)) return [];
      const listing = await this.storage.adapter.list(this.root);
      const result: DiagramEntry[] = listing.files.map(id => ({ id, damaged: true }));
      for (const folder of listing.folders) result.push(await this.entry(folder.slice(this.root.length + 1)));
      return result;
    } catch { return [{ id: this.root, damaged: true }]; }
  }
}
