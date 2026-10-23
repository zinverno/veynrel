import { describe, expect, it, vi } from "vitest";
import { ReviewFacts } from "./reviewFacts";
import type { ReviewOperation } from "./reviewFacts";
const pair = ["A.md", "B.md"] as const, other = ["C.md", "D.md"] as const;
function fixture() {
  let emit: (paths?: readonly string[]) => void = () => {};
  const remove = vi.fn(), changed = vi.fn();
  let signatures = ["a", "b"], links: [boolean, boolean] | undefined = [false, false], missing = false;
  let rows: ReviewOperation[] = [];
  const read = vi.fn(async (paths: readonly string[]) => paths[0] === "A.md" ? ({ signatures, links, missing }) : ({ signatures: ["c", "d"], links: [false, false] as const }));
  const history = vi.fn(async () => rows);
  const facts = new ReviewFacts({ read, history, subscribe: f => { emit = f; return remove; } }, changed);
  return { facts, read, history, changed, remove, emit: (paths?: readonly string[]) => emit(paths),
    data: (s: string[], l?: [boolean, boolean], m = false) => { signatures = s; links = l; missing = m; },
    operation: (state: string) => { rows = [{ id: "op", paths: pair, operation: "add_link", state, created: 1 }]; } };
}
async function ready(f: ReturnType<typeof fixture>, state = "ready") { await vi.waitFor(() => expect(f.facts.get(pair)?.state).toBe(state)); }
describe("local review facts do not resolve semantic observations", () => {
  it("confirmed history + current links after Apply, Undo and restart; no optimistic result", async () => {
    const f = fixture(); f.facts.track([pair]); await ready(f);
    expect(f.facts.get(pair)?.operation).toBeUndefined();
    f.data(["a-link", "b"]); f.emit(["A.md"]); await ready(f, "unknown");
    expect(f.facts.get(pair)?.links).toBeUndefined(); expect(f.facts.get(pair)?.changed).toBe(true);
    f.operation("applied"); f.data(["a-link", "b"], [true, false]); f.emit(); await ready(f);
    expect(f.facts.get(pair)).toMatchObject({ links: [true, false], changed: true, operation: { state: "applied" } });
    f.operation("undone"); f.data(["a", "b"], [false, false]); f.emit(); await ready(f);
    expect(f.facts.get(pair)).toMatchObject({ links: [false, false], operation: { state: "undone" } });
    const restart = fixture(); restart.operation("undone"); restart.facts.track([pair]); await ready(restart);
    expect(restart.facts.get(pair)?.operation?.state).toBe("undone");
    f.facts.dispose(); restart.facts.dispose();
  });
  it("touches only affected pairs; rename/delete does not retarget identity", async () => {
    const f = fixture(); f.facts.track([pair, other]); await ready(f);
    f.read.mockClear(); f.data([], undefined, true); f.emit(["A.md", "Renamed.md"]); await ready(f, "missing");
    expect(f.read.mock.calls).toEqual([[pair]]); expect(f.facts.get(other)?.changed).toBeFalsy();
    f.facts.dispose(); expect(f.remove).toHaveBeenCalledOnce();
  });
  it("a failed local recheck cannot erase confirmed history or assert missing links", async () => {
    const f = fixture(); f.operation("applied"); f.facts.track([pair]); await ready(f);
    f.read.mockRejectedValueOnce(Error("unavailable")); f.emit(); await ready(f, "unknown");
    expect(f.facts.get(pair)?.operation?.state).toBe("applied"); expect(f.facts.get(pair)?.links).toBeUndefined();
    expect(f.facts.get(pair)?.changed).toBe(false);
    f.history.mockRejectedValueOnce(Error("busy")); f.emit(); await ready(f);
    expect(f.facts.get(pair)?.historyUnknown).toBe(true); expect(f.facts.get(pair)?.operation?.state).toBe("applied");
    f.facts.dispose();
  });
  it("late completions cannot revive a disposed or replaced scope", async () => {
    const f = fixture(); let resolve!: (v: Awaited<ReturnType<typeof f.read>>) => void;
    f.read.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    f.facts.track([pair]); await vi.waitFor(() => expect(f.read).toHaveBeenCalled()); f.facts.dispose();
    const count = f.changed.mock.calls.length; resolve({ signatures: ["old", "old"], links: [true, true], missing: false });
    await Promise.resolve(); expect(f.facts.get(pair)).toBeUndefined(); expect(f.changed).toHaveBeenCalledTimes(count);
  });
  it("an older observation cannot replace a newer refresh", async () => {
    const f = fixture(); f.facts.track([pair]); await ready(f);
    let resolve!: (v: Awaited<ReturnType<typeof f.read>>) => void;
    f.read.mockImplementationOnce(() => new Promise(r => { resolve = r; })); f.emit();
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    const seen: unknown[] = []; f.changed.mockImplementation(() => { seen.push(f.facts.get(pair)?.links); });
    f.data(['new', 'b'], [true, false]); f.emit();
    resolve({ signatures: ['old', 'old'], links: [false, true], missing: false });
    await ready(f);
    expect(f.facts.get(pair)).toMatchObject({ links: [true, false], changed: true });
    expect(seen).not.toContainEqual([false, true]); f.facts.dispose();
  });
});
