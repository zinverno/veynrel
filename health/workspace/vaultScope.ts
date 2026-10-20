import type { Vault } from "obsidian";
import type { Finding } from "../domain/finding";

export type WorkspaceScope = { kind: "all" } | { kind: "folder"; path: string; missing?: true };
export interface FolderScope { path: string; count: number }
export interface VaultScopeSnapshot { paths: readonly string[]; folders: readonly FolderScope[] }

/** Paths come from Vault metadata. A separator boundary excludes similarly named siblings. */
export function includesScope(scope: WorkspaceScope, path: string): boolean {
  return scope.kind === "all" || !scope.missing && path.startsWith(`${scope.path}/`);
}

export function scopeSnapshot(paths: readonly string[], folders: readonly string[]): VaultScopeSnapshot {
  const unique = [...new Set(paths)].sort();
  const counts = new Map(folders.filter(path => path && path !== "/").map(path => [path, 0]));
  for (const path of unique) {
    let slash = path.lastIndexOf("/");
    while (slash > 0) {
      const parent = path.slice(0, slash);
      if (counts.has(parent)) counts.set(parent, counts.get(parent)! + 1);
      slash = path.lastIndexOf("/", slash - 1);
    }
  }
  return { paths: unique, folders: [...counts].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, count]) => ({ path, count })) };
}

export function invalidateScope(scope: WorkspaceScope, removedPath: string): WorkspaceScope {
  return scope.kind === "folder" && (scope.path === removedPath || scope.path.startsWith(`${removedPath}/`))
    ? { ...scope, missing: true } : scope;
}

export function sceneFolders(snapshot: VaultScopeSnapshot, scope: WorkspaceScope): readonly FolderScope[] {
  const first = snapshot.folders.slice(0, 6);
  if (scope.kind === "all" || scope.missing || first.some(folder => folder.path === scope.path)) return first;
  const selected = snapshot.folders.find(folder => folder.path === scope.path);
  return selected ? [...first.slice(0, 5), selected] : first;
}

/** Count a stored finding once if any recorded note belongs; disclose cross-scope dependencies. */
export function scopeFindings(findings: readonly Finding[], scope: WorkspaceScope): { count: number; external: number } {
  const matching = new Map(findings.filter(f => f.state === "open" && f.notePaths.some(path => includesScope(scope, path))).map(f => [f.id, f]));
  return { count: matching.size, external: [...matching.values()].filter(f => f.notePaths.some(path => !includesScope(scope, path))).length };
}

/** One metadata enumeration on open and coalesced path events, never on render/hover. */
export class VaultScopeIndex {
  snapshot: VaultScopeSnapshot = { paths: [], folders: [] };
  selection: WorkspaceScope = { kind: "all" };
  private disposed = false;
  private queued = false;
  private readonly refs;
  constructor(private readonly vault: Vault, private readonly changed: () => void) {
    this.refresh();
    this.refs = [vault.on("create", () => this.queue()),
      vault.on("delete", file => { this.selection = invalidateScope(this.selection, file.path); this.queue(); }),
      vault.on("rename", (_file, oldPath) => { this.selection = invalidateScope(this.selection, oldPath); this.queue(); })];
  }
  select(path?: string): void {
    this.selection = path === undefined ? { kind: "all" } : {
      kind: "folder", path, ...(!this.snapshot.folders.some(folder => folder.path === path) ? { missing: true as const } : {}),
    };
  }
  dispose(): void { this.disposed = true; this.refs.forEach(ref => this.vault.offref(ref)); }
  private refresh(): void {
    this.snapshot = scopeSnapshot(this.vault.getMarkdownFiles().map(file => file.path), this.vault.getAllFolders().map(folder => folder.path));
    const selection = this.selection;
    if (selection.kind === "folder" && !this.snapshot.folders.some(folder => folder.path === selection.path)) this.selection = { ...selection, missing: true };
  }
  private queue(): void {
    if (this.queued || this.disposed) return;
    this.queued = true;
    queueMicrotask(() => { this.queued = false; if (!this.disposed) { this.refresh(); this.changed(); } });
  }
}
