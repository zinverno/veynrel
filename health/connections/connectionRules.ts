import { taxonomyToken } from "../../utils/taxonomyToken";
import { hasOnlyKeys, isRecord, isTimestamp, isVaultPath } from "../domain/validation";
import type { WorkbenchTagSnapshot } from "../workbench/workbenchTags";
import type { ConnectionSelection, Participation } from "./connectionSelection";

export type ConnectionRuleMode = "within" | "exclude";
export interface ConnectionRuleSelector { readonly kind: "tag" | "folder"; readonly value: string }
export interface ConnectionRule {
  readonly id: string; readonly mode: ConnectionRuleMode; readonly selector: ConnectionRuleSelector;
  readonly enabled: boolean; readonly folderCreated?: number;
}
export interface ConnectionRulesPort {
  readonly state: "loading" | "ready" | "error";
  readonly revision: number;
  list(): readonly ConnectionRule[];
  load(): Promise<void>;
  refreshFolders(): Promise<void>;
  folderState(rule: ConnectionRule): "known" | "missing" | "unknown";
  subscribe(listener: () => void): () => void;
  add(mode: ConnectionRuleMode, selector: ConnectionRuleSelector): Promise<void>;
  enable(id: string, enabled: boolean): Promise<void>;
  remove(id: string): Promise<void>;
}
function validSelector(s: unknown): s is ConnectionRuleSelector {
  return isRecord(s) && hasOnlyKeys(s, ["kind", "value"]) &&
    (s.kind === "tag" ? taxonomyToken(s.value) : s.kind === "folder" && isVaultPath(s.value));
}
function decode(text: string): readonly ConnectionRule[] {
  const data: unknown = JSON.parse(text);
  if (!isRecord(data) || !hasOnlyKeys(data, ["version", "rules"]) || data.version !== 1 || !Array.isArray(data.rules) || data.rules.length > 200) throw Error("Invalid connection rules");
  const ids = new Set<string>();
  for (const r of data.rules) {
    if (!isRecord(r) || !hasOnlyKeys(r, ["id", "mode", "selector", "enabled", "folderCreated"]) ||
      typeof r.id !== "string" || !/^rule-[0-9]{1,10}$/u.test(r.id) || ids.has(r.id) || !["within", "exclude"].includes(r.mode as string) ||
      typeof r.enabled !== "boolean" || !validSelector(r.selector) ||
      (r.selector.kind === "folder" ? !isTimestamp(r.folderCreated) || r.folderCreated === 0 : r.folderCreated !== undefined)) throw Error("Invalid connection rule");
    ids.add(r.id);
  }
  const rules = data.rules as unknown as ConnectionRule[];
  return Object.freeze(rules.map(r => Object.freeze({ ...r, selector: Object.freeze({ ...r.selector }) })));
}

/** One plugin instance owns serialized durable policy changes, independent of pair decisions and file journals. */
export class ConnectionRules implements ConnectionRulesPort {
  state: "loading" | "ready" | "error" = "loading";
  revision = 0;
  private nextId = 1;
  private records: readonly ConnectionRule[] = [];
  private folders = new Map<string, number | null | undefined>();
  private loaded?: Promise<void>;
  private tail: Promise<unknown> = Promise.resolve();
  private folderEpoch = 0;
  private listeners = new Set<() => void>();
  constructor(private readonly storage: { read(): Promise<string | null>; write(text: string): Promise<void> },
    private readonly readFolder: (path: string) => Promise<number | null>) {}
  list(): readonly ConnectionRule[] { return this.records; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit(): void { this.revision++; for (const listener of this.listeners) { try { listener(); } catch { /* Views do not own policy. */ } } }
  load(): Promise<void> {
    return this.loaded ??= (async () => {
      try { const text = await this.storage.read(); if (text !== null) this.records = decode(text); this.nextId = Math.max(0, ...this.records.map(r => Number(r.id.slice(5)))) + 1; this.state = "ready"; await this.refreshFolders(); }
      catch (error) { this.state = "error"; throw error; }
      finally { this.emit(); }
    })();
  }
  invalidateFolders(): void { this.folderEpoch++; this.folders.clear(); this.emit(); }
  async refreshFolders(): Promise<void> {
    const epoch = ++this.folderEpoch;
    const values = await Promise.all([...new Set(this.records.filter(r => r.selector.kind === "folder").map(r => r.selector.value))].map(async path => {
      try { return [path, await this.readFolder(path)] as const; } catch { return [path, undefined] as const; }
    }));
    if (epoch !== this.folderEpoch) return;
    const next = new Map(values);
    if (values.some(([path, value]) => !this.folders.has(path) || this.folders.get(path) !== value) || next.size !== this.folders.size) { this.folders = next; this.emit(); }
  }
  folderState(rule: ConnectionRule): "known" | "missing" | "unknown" {
    const created = this.folders.get(rule.selector.value);
    return created === undefined ? "unknown" : created === rule.folderCreated ? "known" : "missing";
  }
  add(mode: ConnectionRuleMode, selector: ConnectionRuleSelector): Promise<void> {
    return this.update(async rows => {
      if (!["within", "exclude"].includes(mode) || !validSelector(selector)) throw Error("Invalid selector");
      const folderCreated = selector.kind === "folder" ? await this.readFolder(selector.value) : undefined;
      if (selector.kind === "folder" && (!isTimestamp(folderCreated) || !folderCreated)) throw Error("Folder unavailable");
      const n = this.nextId++;
      return [...rows, { id: `rule-${n}`, mode, selector: { ...selector }, enabled: true, ...(folderCreated ? { folderCreated } : {}) }];
    });
  }
  enable(id: string, enabled: boolean): Promise<void> { return this.update(async rows => rows.map(r => r.id === id ? { ...r, enabled } : r)); }
  remove(id: string): Promise<void> { return this.update(async rows => rows.filter(r => r.id !== id)); }
  private update(next: (rows: readonly ConnectionRule[]) => Promise<readonly ConnectionRule[]>): Promise<void> {
    const result = this.tail.then(async () => {
      await this.load();
      const text = JSON.stringify({ version: 1, rules: await next(this.records) }), rows = decode(text);
      await this.storage.write(text);
      this.records = rows; this.emit(); await this.refreshFolders();
    });
    this.tail = result.catch(() => {}); return result;
  }
}

export function ruleMembership(rule: ConnectionRule, path: string, notes: ReadonlyMap<string, WorkbenchTagSnapshot["notes"][number]>, folderState: string): boolean | undefined {
  if (rule.selector.kind === "folder") return !path.startsWith(`${rule.selector.value}/`) ? false : folderState === "known" ? true : undefined;
  const note = notes.get(path);
  return note?.state === "known" ? note.tags.includes(rule.selector.value) : undefined;
}
export function compileConnectionRules(store: ConnectionRulesPort, metadata: WorkbenchTagSnapshot): ConnectionSelection | undefined {
  if (store.state !== "ready") throw Error("Connection rules unavailable");
  const rules = store.list().filter(r => r.enabled).map(rule => ({ rule, folder: store.folderState(rule) }));
  if (!rules.length) return undefined;
  const notes = new Map(metadata.notes.map(n => [n.path, { ...n, tags: [...n.tags] }]));
  const membership = (r: typeof rules[number], path: string) => ruleMembership(r.rule, path, notes, r.folder);
  const combine = (values: Participation[]): Participation => values.includes("exclude") ? "exclude" : values.includes("unknown") ? "unknown" : "allow";
  return {
    revision: `${store.revision}:${metadata.revision}`,
    document: path => combine(rules.filter(r => r.rule.mode === "exclude").map(r => membership(r, path) === true ? "exclude" : membership(r, path) === undefined ? "unknown" : "allow")),
    pair: (a, b) => combine(rules.map(r => {
      const left = membership(r, a), right = membership(r, b);
      return r.rule.mode === "within" ? left === false || right === false ? "allow" : left === true && right === true ? "exclude" : "unknown" :
        left === true || right === true ? "exclude" : left === undefined || right === undefined ? "unknown" : "allow";
    })),
    unknown: path => rules.some(r => membership(r, path) === undefined),
  };
}
