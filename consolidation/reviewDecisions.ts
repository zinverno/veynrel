import type { App } from "obsidian";
import type { RelationshipPair } from "./relationshipSession";
import { checksum } from "./operationJournal";
import { isCanonicalMarkdownPath } from "../chunking/reconstructChunks";
import { hasOnlyKeys, isRecord, isTimestamp } from "../health/domain/validation";
import { healthStorageRoot } from "../health/store/healthStorage";
import { refreshReviewFacts } from "./reviewRefresh";

import type { DecisionNote, ReviewDecision, ReviewDecisionsPort } from "../health/workbench/reviewDecisionsPort";
export type { ReviewDecision } from "../health/workbench/reviewDecisionsPort";
interface Storage { read(): Promise<string | null>; write(text: string): Promise<void> }
const pairKey = (paths: readonly string[]) => JSON.stringify([...paths].sort());
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);

/** Canonical paths + creation identity + complete Markdown. Index revisions and mtime are not decisions. */
export async function reviewDecision(pair: RelationshipPair): Promise<ReviewDecision> {
  const notes = await Promise.all(pair.map(async n => ({ path: n.path, created: n.file.stat.ctime, hash: await checksum(n.content) })));
  notes.sort((a, b) => a.path < b.path ? -1 : 1);
  if (notes[0].path === notes[1].path || notes.some(n => !isCanonicalMarkdownPath(n.path) || !isTimestamp(n.created))) throw Error("Invalid pair identity");
  return { id: await checksum(JSON.stringify(notes)), notes: notes as [DecisionNote, DecisionNote] };
}

/** Separate from findings, settings and Markdown-operation history. Commit memory only after storage succeeds. */
export class ReviewDecisions implements ReviewDecisionsPort {
  state: "loading" | "ready" | "error" = "loading";
  private records: readonly ReviewDecision[] = [];
  private loaded?: Promise<void>;
  private tail: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  constructor(private readonly storage: Storage, private readonly changed: () => void = () => {}) {}
  list(): readonly ReviewDecision[] { return this.records; }
  hasPaths(paths: readonly string[]): boolean { return this.records.some(r => pairKey(r.notes.map(n => n.path)) === pairKey(paths)); }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit(): void {
    for (const listener of [this.changed, ...this.listeners]) { try { listener(); } catch { /* Presentation cannot undo a saved decision. */ } }
  }
  load(): Promise<void> {
    if (!this.loaded) this.loaded = (async () => {
      try {
        const text = await this.storage.read();
        if (text !== null) {
          const value: unknown = JSON.parse(text);
          if (!isRecord(value) || !hasOnlyKeys(value, ["version", "decisions"]) || value.version !== 1 || !Array.isArray(value.decisions)) throw Error("Invalid decisions");
          const ids = new Set<string>();
          for (const r of value.decisions) {
            if (!isRecord(r) || !hasOnlyKeys(r, ["id", "notes"]) || !hash(r.id) || ids.has(r.id) || !Array.isArray(r.notes) || r.notes.length !== 2 ||
              r.notes.some(n => !isRecord(n) || !hasOnlyKeys(n, ["path", "created", "hash"]) || typeof n.path !== "string" || !isCanonicalMarkdownPath(n.path) || !isTimestamp(n.created) || !hash(n.hash))) throw Error("Invalid decision");
            const notes = r.notes as DecisionNote[];
            if (notes[0].path >= notes[1].path || await checksum(JSON.stringify(notes)) !== r.id) throw Error("Invalid decision");
            ids.add(r.id);
          }
          this.records = value.decisions as ReviewDecision[];
        }
        this.state = "ready";
      } catch (error) { this.state = "error"; throw error; }
      finally { this.emit(); }
    })();
    return this.loaded;
  }
  async kept(pair: RelationshipPair): Promise<boolean> {
    await this.load();
    if (!this.hasPaths(pair.map(n => n.path))) return false;
    const decision = await reviewDecision(pair);
    return this.records.some(r => r.id === decision.id);
  }
  async keep(pair: RelationshipPair): Promise<ReviewDecision> {
    const record = await reviewDecision(pair);
    await this.update(rows => [...rows.filter(r => pairKey(r.notes.map(n => n.path)) !== pairKey(record.notes.map(n => n.path))), record]);
    return record;
  }
  restore(id: string): Promise<void> { return this.update(rows => rows.filter(r => r.id !== id)); }
  private update(next: (rows: readonly ReviewDecision[]) => readonly ReviewDecision[]): Promise<void> {
    const result = this.tail.then(async () => {
      await this.load();
      const rows = next(this.records);
      await this.storage.write(JSON.stringify({ version: 1, decisions: rows }));
      this.records = rows; this.emit();
    });
    this.tail = result.catch(() => {}); return result;
  }
}

const stores = new WeakMap<App, ReviewDecisions>();
export function reviewDecisions(app: App): ReviewDecisions | undefined { return stores.get(app); }
export function registerReviewDecisions(app: App, pluginId: string): () => void {
  const path = healthStorageRoot(app.vault.configDir, pluginId).replace(/\/health$/u, "/review-decisions.json");
  const adapter = app.vault.adapter;
  const store = new ReviewDecisions({
    read: async () => await adapter.exists(path) ? adapter.read(path) : await adapter.exists(`${path}.bak`) ? adapter.read(`${path}.bak`) : null,
    // Obsidian rename refuses an existing destination; retain the previous state until replacement commits.
    write: async text => {
      await adapter.write(`${path}.tmp`, text);
      if (await adapter.exists(path)) {
        if (await adapter.exists(`${path}.bak`)) await adapter.remove(`${path}.bak`);
        await adapter.rename(path, `${path}.bak`);
      }
      try { await adapter.rename(`${path}.tmp`, path); }
      catch (error) {
        try { if (!await adapter.exists(path) && await adapter.exists(`${path}.bak`)) await adapter.rename(`${path}.bak`, path); }
        catch { /* The loader can still read the previous backup; never load the incomplete staging file. */ }
        throw error;
      }
    },
  }, () => refreshReviewFacts(app));
  stores.set(app, store);
  return () => { if (stores.get(app) === store) stores.delete(app); };
}
