import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {} }));
import { atomizationFixture } from "../tests/atomizationFixture";
import { ChangePlannerSession } from "./changePlannerSession";
import type { PlannerRead } from "./changePlannerSession";

function fixture() {
  const f = atomizationFixture(), read = vi.fn(async (): Promise<PlannerRead> => f.read), observe = vi.fn(async () => structuredClone(f.observation));
  const s = new ChangePlannerSession({ analysis: () => f.analysis, read, atomizationObservation: observe });
  return { ...f, readFn: read, observe, s };
}
describe("Atomization session read-only lifecycle", () => {
  it("checks sources and dependencies twice, then publishes only the independent plan", async () => {
    const f = fixture(); await f.s.prepare(); await f.s.buildAtomization(f.choice);
    expect(f.s.view.stage).toBe("ready"); expect(f.s.view.atomizationPlan).toBeDefined();
    expect(f.s.view.plan).toBeUndefined(); expect(f.s.view.groupPlan).toBeUndefined(); expect(f.s.view.mergePlan).toBeUndefined();
    expect(f.readFn).toHaveBeenCalledTimes(3); expect(f.observe).toHaveBeenCalledTimes(2);
  });
  it.each(["content", "ctime", "mtime", "cache", "references", "analysis", "provider"])("invalidates %s changed after selection", async key => {
    const f = fixture(); await f.s.prepare();
    if (key === "content") f.readFn.mockResolvedValue({ ...f.read, pair: [{ ...f.pair[0], content: f.pair[0].content + " Changed." }, f.pair[1]] });
    if (key === "ctime") f.pair[0].file.stat.ctime++;
    if (key === "mtime") f.pair[0].file.stat.mtime++;
    if (key === "cache") f.readFn.mockResolvedValue({ ...f.read, pair: [{ ...f.pair[0], cache: null }, f.pair[1]] });
    if (key === "references") f.readFn.mockResolvedValue({ ...f.read, pair: [{ ...f.pair[0], references: [{ kind: "link", original: "[[Other]]", target: null }] }, f.pair[1]] });
    if (key === "analysis") f.analysis.result.limitations.push("Changed.");
    if (key === "provider") f.analysis.provider = "changed";
    await f.s.buildAtomization(f.choice); expect(f.s.view.stage).toBe("stale"); expect(f.s.view.atomizationPlan).toBeUndefined();
  });
  it.each(["cancel", "close", "invalidate", "changeSelection"] as const)("%s during final read suppresses late publication", async action => {
    const f = fixture(); await f.s.prepare(); let finish!: (value: PlannerRead) => void;
    f.readFn.mockResolvedValueOnce(f.read).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.s.buildAtomization(f.choice); await vi.waitFor(() => expect(finish).toBeDefined());
    f.s[action](); finish(f.read); await pending; expect(f.s.view.atomizationPlan).toBeUndefined();
    expect(f.s.view.stage).toBe(action === "close" ? "idle" : action === "cancel" ? "cancelled" : "stale");
  });
  it("cancel and reopen cannot revive an earlier pending plan", async () => {
    const f = fixture(); await f.s.prepare(); let release!: (value: PlannerRead) => void;
    f.readFn.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const old = f.s.buildAtomization(f.choice); f.s.cancel(); await f.s.prepare(); release(f.read); await old;
    expect(f.s.view.stage).toBe("choosing"); expect(f.s.view.atomizationPlan).toBeUndefined();
    await f.s.buildAtomization(f.choice); expect(f.s.view.stage).toBe("ready");
  });
  it.each(["destination", "metadata", "dependencies", "analysis"])("refuses %s changing during verification", async key => {
    const f = fixture(); await f.s.prepare(); const before = structuredClone(f.observation);
    f.observe.mockResolvedValueOnce(before).mockImplementationOnce(async () => {
      if (key === "destination") f.observation.absent = false;
      if (key === "metadata") f.observation.inventory.push({ path: "Other.md", identity: 42, folder: false, metadataHash: "changed" });
      if (key === "dependencies") f.observation.dependencies.resolved = { "Other.md": { "Sources/Original.md": 1 } };
      if (key === "analysis") f.analysis.result.limitations.push("Changed.");
      return structuredClone(f.observation);
    });
    await f.s.buildAtomization(f.choice); expect(f.s.view.stage).toBe("stale"); expect(f.s.view.atomizationPlan).toBeUndefined();
  });
  it("missing metadata is an explicit refusal; no fallback path", async () => {
    const f = fixture(); f.pair[0].cache = null; await f.s.prepare(); await f.s.buildAtomization(f.choice);
    expect(f.s.view).toMatchObject({ stage: "error", atomizationError: "metadata" });
  });
});
