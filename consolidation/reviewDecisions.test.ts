import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, getLanguage: () => "en" }));
import { ReviewDecisions, registerReviewDecisions, reviewDecisions } from "./reviewDecisions";
import { mergeFixture } from "../tests/mergeFixture";
import type { App } from "obsidian";

function fixture() {
  let text: string | null = null;
  const storage = { read: vi.fn(async () => text), write: vi.fn(async (next: string) => { text = next; }) };
  const store = new ReviewDecisions(storage);
  return { store, storage, restart: () => new ReviewDecisions(storage), pair: mergeFixture().pair };
}
describe("explicit pair decisions", () => {
  it("survives restart, reversed A/B and index/mtime refresh; exact paths disambiguate homonyms", async () => {
    const f = fixture(); const saved = await f.store.keep(f.pair);
    const restarted = f.restart();
    expect(await restarted.kept([f.pair[1], f.pair[0]])).toBe(true);
    expect(await restarted.kept([{ ...f.pair[0], modified: 300 }, f.pair[1]])).toBe(true);
    expect(await restarted.kept([{ ...f.pair[0], path: 'Elsewhere/' + f.pair[0].path.split('/').pop() }, f.pair[1]])).toBe(false);
    expect(restarted.list()[0].id).toBe(saved.id);
    expect(f.storage.write.mock.calls[0][0]).not.toContain(f.pair[0].content);
    await restarted.restore(saved.id);
    expect(await f.restart().kept(f.pair)).toBe(false);
  });
  it("content, rename and replacement identity invalidate suppression, not mere object recreation", async () => {
    const f = fixture(); await f.store.keep(f.pair);
    expect(await f.store.kept([{ ...f.pair[0], content: f.pair[0].content + '\n' }, f.pair[1]])).toBe(false);
    expect(await f.store.kept([{ ...f.pair[0], file: { ...f.pair[0].file } }, f.pair[1]])).toBe(true);
    expect(await f.store.kept([{ ...f.pair[0], file: { ...f.pair[0].file, stat: { ...f.pair[0].file.stat, ctime: 99 } } }, f.pair[1]])).toBe(false);
    expect(await f.store.kept([{ ...f.pair[0], path: 'Moved.md' }, f.pair[1]])).toBe(false);
  });
  it("failed save or restore never publishes optimistic success; later explicit retry works", async () => {
    const f = fixture(); await f.store.load(); const changed = vi.fn(); f.store.subscribe(changed);
    f.storage.write.mockRejectedValueOnce(Error('storage'));
    await expect(f.store.keep(f.pair)).rejects.toThrow();
    expect(changed).not.toHaveBeenCalled(); expect(await f.store.kept(f.pair)).toBe(false);
    const record = await f.store.keep(f.pair);
    f.storage.write.mockRejectedValueOnce(Error('storage'));
    await expect(f.store.restore(record.id)).rejects.toThrow();
    expect(await f.store.kept(f.pair)).toBe(true);
    await f.store.restore(record.id); expect(await f.store.kept(f.pair)).toBe(false);
  });
  it("serializes competing views and undo targets only its own version", async () => {
    const f = fixture(); const old = await f.store.keep(f.pair);
    const next = [{ ...f.pair[0], content: 'new saved text' }, f.pair[1]] as const;
    await Promise.all([f.store.keep(next), f.store.restore(old.id)]);
    expect(f.store.list()).toHaveLength(1); expect(await f.store.kept(next)).toBe(true);
    expect(await f.store.kept(f.pair)).toBe(false);
  });
  it("does not silently discard unreadable or malformed stored decisions", async () => {
    const f = fixture(); await f.store.keep(f.pair);
    const valid = await f.storage.read();
    for (const text of ['{', '{"version":2,"decisions":[]}', valid!.replace(/"hash":"[a-f0-9]+"/u, '"hash":"bad"')]) {
      f.storage.read.mockResolvedValueOnce(text); const store = f.restart();
      await expect(store.load()).rejects.toThrow(); expect(store.state).toBe('error'); expect(store.list()).toEqual([]);
      const count = f.storage.write.mock.calls.length;
      await expect(store.keep(f.pair)).rejects.toThrow(); expect(f.storage.write).toHaveBeenCalledTimes(count);
    }
  });
  it("source read failures and closing without a decision do not create state", async () => {
    const f = fixture(); await f.store.load(); expect(await f.store.kept(f.pair)).toBe(false);
    expect(f.storage.write).not.toHaveBeenCalled();
  });
  it("uses isolated plugin storage and ignores failed staging files after restart", async () => {
    const files = new Map<string, string>();
    const adapter = { exists: async (p: string) => files.has(p), read: async (p: string) => files.get(p)!,
      write: vi.fn(async (p: string, text: string) => { files.set(p, text); }),
      remove: vi.fn(async (p: string) => { files.delete(p); }),
      rename: vi.fn(async (from: string, to: string) => { if (files.has(to)) throw Error("Destination exists"); files.set(to, files.get(from)!); files.delete(from); }) };
    const app = { vault: { configDir: 'CustomConfig', adapter } } as unknown as App;
    let dispose = registerReviewDecisions(app, 'test-plugin'); const pair = mergeFixture().pair;
    const record = await reviewDecisions(app)!.keep(pair);
    adapter.write.mockImplementationOnce(async (p, text) => { files.set(p, text.slice(0, 10)); throw Error('disk'); });
    await expect(reviewDecisions(app)!.restore(record.id)).rejects.toThrow();
    dispose(); dispose = registerReviewDecisions(app, 'test-plugin');
    expect(await reviewDecisions(app)!.kept(pair)).toBe(true);
    expect([...files.keys()].every(p => p.startsWith('CustomConfig/plugins/test-plugin/review-decisions.json'))).toBe(true);
    const rename = adapter.rename.getMockImplementation()!;
    adapter.rename.mockImplementation(async (from, to) => { if (to.endsWith('.json')) throw Error('Replacement and rollback unavailable'); await rename(from, to); });
    await expect(reviewDecisions(app)!.restore(record.id)).rejects.toThrow();
    expect(files.has('CustomConfig/plugins/test-plugin/review-decisions.json')).toBe(false);
    dispose(); dispose = registerReviewDecisions(app, 'test-plugin');
    expect(await reviewDecisions(app)!.kept(pair)).toBe(true);
    adapter.rename.mockImplementation(rename);
    await reviewDecisions(app)!.restore(record.id); dispose();
    dispose = registerReviewDecisions(app, 'test-plugin'); expect(await reviewDecisions(app)!.kept(pair)).toBe(false);
    dispose(); expect(reviewDecisions(app)).toBeUndefined();
  });
});
