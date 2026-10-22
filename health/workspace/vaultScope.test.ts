import { describe, expect, it, vi } from "vitest";
import type { Vault } from "obsidian";
import { sceneFolders, includesScope, invalidateScope, scopeFindings, scopeSnapshot, VaultScopeIndex } from "./vaultScope";
import { inboxFinding } from "../ui/testSupport";
import { workspaceSection } from "./renderWorkspaceShell";
vi.mock("obsidian", () => ({ setIcon: vi.fn(), getLanguage: () => "en" }));

describe("view-local metadata scopes", () => {
  it("counts unique Markdown paths, nested folders, empty folders and root notes", () => {
    const snapshot = scopeSnapshot(["Root.md", "SQL/A.md", "SQL/nested/B.md", "SQL-old/C.md", "SQL/A.md"], ["SQL", "SQL/nested", "SQL-old", "Empty"]);
    expect(snapshot.paths).toHaveLength(4);
    expect(snapshot.folders).toEqual([{ path: "Empty", count: 0 }, { path: "SQL", count: 2 }, { path: "SQL-old", count: 1 }, { path: "SQL/nested", count: 1 }]);
    expect(includesScope({ kind: "folder", path: "SQL" }, "SQL-old/C.md")).toBe(false);
    expect(includesScope({ kind: "all" }, "Root.md")).toBe(true);
  });
  it.each([0, 1, 2, 6, 80, 1000])("has deterministic bounded scene candidates from %s folders", count => {
    const folders = Array.from({ length: count }, (_, i) => `Area ${i}`);
    const model = scopeSnapshot(folders.map(path => `${path}/Note.md`), folders.reverse());
    expect(model.folders).toHaveLength(count);
    expect(sceneFolders(model, { kind: "all" })).toHaveLength(Math.min(count, 6));
    expect(model.folders.every(folder => folder.count === 1)).toBe(true);
    expect(model).toEqual(scopeSnapshot([...model.paths].reverse(), [...folders].reverse()));
  });
  it("keeps an explicitly selected rare folder visible without hiding it behind the first six", () => {
    const snapshot = scopeSnapshot([], Array.from({ length: 20 }, (_, i) => `Folder ${i}`));
    const scene = sceneFolders(snapshot, { kind: "folder", path: "Folder 9" });
    expect(scene).toHaveLength(6);
    expect(scene[5].path).toBe("Folder 9");
    expect(scene.slice(0, 5)).toEqual(snapshot.folders.slice(0, 5));
  });
  it("shows top-level folders even when one diary has hundreds of nested paths", () => {
    const roots = ["Diary", "Projects", "Reading", "Research", "Work", "Z Empty", "Z More"];
    const nested = Array.from({ length: 300 }, (_, i) => `Diary/2026/${i}`);
    const snapshot = scopeSnapshot(["Diary/2026/0/A.md", "Diary/2026/0/A.md", "Reading/B.md", "Root.md"], [...roots, "Diary/2026", ...nested]);
    expect(sceneFolders(snapshot, { kind: "all" }).map(folder => folder.path)).toEqual(roots.slice(0, 6));
    const chosen = sceneFolders(snapshot, { kind: "folder", path: "Diary/2026/299" });
    expect(chosen.map(folder => folder.path)).toEqual([...roots.slice(0, 5), "Diary/2026/299"]);
    expect(chosen[5].count).toBe(0);
    expect(snapshot.folders.find(folder => folder.path === "Diary")?.count).toBe(1);
    expect(sceneFolders(snapshot, { kind: "folder", path: "Diary/2026", missing: true })).toEqual(sceneFolders(snapshot, { kind: "all" }));
  });
  it("does not fill sparse overviews with descendants, but adds a chosen nested folder", () => {
    const snapshot = scopeSnapshot([], ["A", "A/nested", "A/nested/empty", "B", "B/nested"]);
    expect(sceneFolders(snapshot, { kind: "all" }).map(folder => folder.path)).toEqual(["A", "B"]);
    expect(sceneFolders(snapshot, { kind: "folder", path: "B/nested" }).map(folder => folder.path)).toEqual(["A", "B", "B/nested"]);
  });
  it("never identifies folders by basename or treats literal names as selectors", () => {
    const folders = ['A/日本語 [x] "long"', 'B/日本語 [x] "long"'];
    const model = scopeSnapshot(folders.map(path => `${path}/<note>.md`), folders);
    expect(model.folders).toEqual(folders.map(path => ({ path, count: 1 })));
    expect(includesScope({ kind: "folder", path: folders[0] }, model.paths[1])).toBe(false);
  });
  it("invalidates renamed/deleted ancestors without silently widening scope", () => {
    const scope = { kind: "folder" as const, path: "SQL/nested" };
    expect(invalidateScope(scope, "SQL-old")).toBe(scope);
    const removed = invalidateScope(scope, "SQL");
    expect(removed).toEqual({ ...scope, missing: true });
    expect(includesScope(removed, "SQL/nested/A.md")).toBe(false);
    expect(includesScope(removed, "Root.md")).toBe(false);
  });
  it("counts multi-note findings once, discloses external dependencies and excludes closed findings", () => {
    const pair = inboxFinding({ notePaths: ["SQL/A.md", "SQL/B.md", "Other/C.md"] });
    const outside = inboxFinding({ id: "outside", notePaths: ["Other/C.md"] });
    const closed = inboxFinding({ id: "closed", state: "dismissed", notePaths: ["SQL/A.md"] });
    expect(scopeFindings([pair, pair, outside, closed], { kind: "folder", path: "SQL" })).toEqual({ count: 1, external: 1 });
    expect(scopeFindings([pair, outside, closed], { kind: "all" })).toEqual({ count: 2, external: 0 });
  });
  it("caches metadata, coalesces path events, isolates views and discards queued work on close", async () => {
    const listeners = new Map<string, Array<(file: { path: string }, old?: string) => void>>();
    const vault = { getMarkdownFiles: vi.fn(() => [{ path: "SQL/A.md" }]), getAllFolders: vi.fn(() => [{ path: "SQL" }]),
      on: vi.fn((name: string, fn: (file: { path: string }, old?: string) => void) => { listeners.set(name, [...listeners.get(name) ?? [], fn]); return fn; }), offref: vi.fn() };
    const changed = vi.fn(), otherChanged = vi.fn();
    const first = new VaultScopeIndex(vault as unknown as Vault, changed), other = new VaultScopeIndex(vault as unknown as Vault, otherChanged);
    first.select("SQL");
    for (let i = 0; i < 1000; i++) expect(first.snapshot.paths.length).toBe(1);
    expect(vault.getMarkdownFiles).toHaveBeenCalledTimes(2);
    expect(other.selection).toEqual({ kind: "all" });
    for (let i = 0; i < 20; i++) for (const fn of listeners.get("rename")!) fn({ path: "Renamed" }, "SQL");
    other.dispose(); await Promise.resolve();
    expect(first.selection).toEqual({ kind: "folder", path: "SQL", missing: true });
    expect(changed).toHaveBeenCalledTimes(1); expect(otherChanged).not.toHaveBeenCalled();
    expect(vault.getMarkdownFiles).toHaveBeenCalledTimes(3);
    first.dispose(); expect(vault.offref).toHaveBeenCalledTimes(6);
  });
  it("keeps existing child routes under the correct single navigation entry", () => {
    expect(["health", "findings"].map(page => workspaceSection(page as "health"))).toEqual(["check", "check"]);
    expect(["discover", "topology", "semantic-neighborhood", "semantic-map", "connection-opportunities"].map(page => workspaceSection(page as "discover"))).toEqual(["map", "map", "map", "map", "map"]);
    expect(workspaceSection("connect")).toBe("settings");
  });
});
