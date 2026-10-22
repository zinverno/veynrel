import { describe, it, expect, vi } from "vitest";
import { ConnectionRules, compileConnectionRules } from "./connectionRules";

const tag = { kind: "tag" as const, value: "practice/task" };
const notes = [
  { path: "Tasks/A.md", state: "known" as const, tags: ["topic/sql", "practice/task"] },
  { path: "Tasks/B.md", state: "known" as const, tags: ["practice/task"] },
  { path: "Theory/A.md", state: "known" as const, tags: ["practice/task/child"] },
  { path: "Tasks-old/A.md", state: "known" as const, tags: ["practice/taskish"] },
  { path: "Unknown.md", state: "unknown" as const, tags: [] },
];
function fixture() {
  let disk: string | null = null, created: number | null = 10;
  const storage = { read: vi.fn(async () => disk), write: vi.fn(async (s: string) => { disk = s; }) };
  const store = new ConnectionRules(storage, async () => created);
  return { store, storage, setDisk: (s: string) => { disk = s; }, folder: (n: number | null) => { created = n; } };
}
const snapshot = { notes, revision: 1, categories: [] };
describe("connection participation policy", () => {
  it("is exact, symmetric, multi-tag and three-state; empty policy changes nothing", async () => {
    const f = fixture(); await f.store.load();
    expect(compileConnectionRules(f.store, snapshot)).toBeUndefined();
    await f.store.add("within", tag);
    const p = compileConnectionRules(f.store, snapshot)!;
    expect(p.pair(notes[0].path, notes[1].path)).toBe("exclude");
    expect(p.pair(notes[1].path, notes[0].path)).toBe("exclude");
    for (const n of notes.slice(2, 4)) expect(p.pair(notes[0].path, n.path)).toBe("allow");
    expect(p.pair(notes[0].path, "Unknown.md")).toBe("unknown");
    expect(p.pair(notes[2].path, "Unknown.md")).toBe("allow");
    expect(p.document(notes[0].path)).toBe("allow");
    await f.store.add("exclude", tag);
    const exclude = compileConnectionRules(f.store, snapshot)!;
    expect(exclude.document(notes[0].path)).toBe("exclude");
    expect(exclude.pair(notes[0].path, "Unknown.md")).toBe("exclude");
  });
  it("uses folder boundaries and creation identity, never basename or redirected missing targets", async () => {
    const f = fixture(); await f.store.load(); await f.store.add("within", { kind: "folder", value: "Tasks" });
    expect(compileConnectionRules(f.store, snapshot)!.pair("Tasks/A.md", "Tasks/nested/B.md")).toBe("exclude");
    expect(compileConnectionRules(f.store, snapshot)!.pair("Tasks/A.md", "Tasks-old/A.md")).toBe("allow");
    f.folder(null); await f.store.refreshFolders();
    expect(f.store.folderState(f.store.list()[0])).toBe("missing");
    expect(compileConnectionRules(f.store, snapshot)!.pair("Tasks/A.md", "Tasks/B.md")).toBe("unknown");
    f.folder(11); await f.store.refreshFolders();
    expect(f.store.folderState(f.store.list()[0])).toBe("missing");
    expect(compileConnectionRules(f.store, snapshot)!.pair("Theory/A.md", "Unknown.md")).toBe("allow");
  });
  it("persists enable/delete across owners; publishes only durable changes and refuses corruption", async () => {
    const f = fixture(); await f.store.load(); await f.store.add("within", tag);
    const id = f.store.list()[0].id;
    const second = new ConnectionRules(f.storage, async () => 10); await second.load();
    expect(second.list()).toEqual(f.store.list());
    await second.enable(id, false); expect(compileConnectionRules(second, snapshot)).toBeUndefined();
    await second.remove(id); expect(second.list()).toEqual([]);
    const prior = f.store.list(), revision = f.store.revision;
    f.storage.write.mockRejectedValueOnce(Error("disk"));
    await expect(f.store.enable(id, false)).rejects.toThrow();
    expect(f.store.list()).toBe(prior); expect(f.store.revision).toBe(revision);
    f.setDisk('{"version":99,"rules":[]}'); const bad = new ConnectionRules(f.storage, async () => 10);
    await expect(bad.load()).rejects.toThrow(); expect(bad.state).toBe("error");
    await expect(bad.add("within", tag)).rejects.toThrow();
    expect(() => compileConnectionRules(bad, snapshot)).toThrow();
  });
  it("does not interpret stale cache as absence, and freezes membership for a calculation", async () => {
    const f = fixture(); await f.store.load(); await f.store.add("within", tag);
    const stale = { ...snapshot, notes: notes.map(n => ({ ...n, state: "stale" as const })) };
    expect(compileConnectionRules(f.store, stale)!.pair("Tasks/A.md", "Tasks/B.md")).toBe("unknown");
    const p = compileConnectionRules(f.store, snapshot)!;
    await f.store.enable(f.store.list()[0].id, false);
    expect(p.pair("Tasks/A.md", "Tasks/B.md")).toBe("exclude");
  });
});

it("serializes concurrent view edits, combines bans and rejects unreadable storage without defaults", async () => {
  const f = fixture(); await f.store.load();
  await Promise.all([f.store.add("within", tag), f.store.add("exclude", { kind: "folder", value: "Tasks-old" })]);
  expect(new Set(f.store.list().map(r => r.id)).size).toBe(2);
  const p = compileConnectionRules(f.store, snapshot)!;
  expect(p.pair("Tasks/A.md", "Tasks-old/A.md")).toBe("exclude");
  const id = f.store.list()[0].id; await f.store.remove(id); await f.store.add("within", tag);
  expect(f.store.list().some(r => r.id === id)).toBe(false);
  f.storage.read.mockRejectedValueOnce(Error("read"));
  const bad = new ConnectionRules(f.storage, async () => null); await expect(bad.load()).rejects.toThrow();
  expect(bad.state).toBe("error");
});
