import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, getLanguage: () => "en" }));
import { mergeFixture } from "../tests/mergeFixture";
import { RecommendationPreflight } from "./recommendationPreflight";
import { changeRangeOptions, recommendationIntent } from "./recommendationIntent";
import { refreshReviewFacts, subscribeReviewRefresh } from "./reviewRefresh";
import type { App } from "obsidian";

describe("recommendation preflight", () => {
  it("reads saved identity, refuses source changes and missing metadata; creates no authority", async () => {
    const f = mergeFixture(), read = vi.fn(async () => f.read), changed = vi.fn();
    const p = new RecommendationPreflight(read, changed);
    await p.check(f.analysis, () => true); expect(p.view.state).toBe("ready");
    read.mockResolvedValueOnce({ ...f.read, pair: [{ ...f.pair[0], content: "modified" }, f.pair[1]] });
    await p.check(f.analysis, () => true); expect(p.view).toEqual({ state: "stale" });
    read.mockResolvedValueOnce({ ...f.read, pair: [{ ...f.pair[0], cache: null }, f.pair[1]] });
    await p.check(f.analysis, () => true); expect(p.view).toEqual({ state: "metadata" });
    p.close(); await p.check(f.analysis, () => true); expect(read).toHaveBeenCalledTimes(3);
  });
  it.each(["invalidate", "close"] as const)("%s revokes late completion", async method => {
    const f = mergeFixture(); let resolve!: (v: typeof f.read) => void;
    const p = new RecommendationPreflight(() => new Promise(r => { resolve = r; }), () => {});
    const checking = p.check(f.analysis, () => true); p[method](); resolve(f.read); await checking;
    expect(p.view.state).toBe("checking"); expect(p.view.pair).toBeUndefined();
  });
  it("prioritizes existing links over a protected first paragraph and checks alternatives separately", () => {
    const f = mergeFixture(); f.pair[0].references.push({ kind: "link", original: "B", target: f.pair[1].path });
    expect(changeRangeOptions(f.analysis, f.pair, "replace_with_embed", 0).reason).toBe("@planner.error.existing");
    expect(changeRangeOptions(f.analysis, f.pair, "add_link", 0).ranges).toEqual([]);
    expect(changeRangeOptions(f.analysis, f.pair, "add_link", 1).ranges.length).toBeGreaterThan(0);
    f.pair[1].references.push({ kind: "link", original: "A", target: f.pair[0].path });
    expect(recommendationIntent(f.analysis, { origin: "user", action: "add_link" }, f.pair).status).toBe("unavailable");
  });
  it("refresh notifications isolate windows and listener failures, and unsubscribe", () => {
    const app = {} as App, other = {} as App, a = vi.fn(), b = vi.fn();
    const remove = subscribeReviewRefresh(app, a); subscribeReviewRefresh(app, () => { throw Error(); });
    subscribeReviewRefresh(other, b); refreshReviewFacts(app); expect(a).toHaveBeenCalledOnce(); expect(b).not.toHaveBeenCalled();
    remove(); refreshReviewFacts(app); expect(a).toHaveBeenCalledOnce();
  });
});

it("an explicit keep decision is reversible and bound to identities and source versions, not candidate removal", async () => {
  const { keepReviewSeparate, reviewKeptSeparate, reopenReview } = await import("./reviewDecisions");
  const f = mergeFixture(), app = {} as App;
  keepReviewSeparate(app, f.pair); expect(reviewKeptSeparate(app, f.pair)).toBe(true);
  expect(reviewKeptSeparate(app, [{ ...f.pair[0], modified: 3 }, f.pair[1]])).toBe(false);
  expect(reviewKeptSeparate(app, [{ ...f.pair[0], content: "changed" }, f.pair[1]])).toBe(false);
  expect(reviewKeptSeparate(app, [{ ...f.pair[0], file: { ...f.pair[0].file } }, f.pair[1]])).toBe(false);
  reopenReview(app, f.pair.map(n => n.path)); expect(reviewKeptSeparate(app, f.pair)).toBe(false);
});

it("uses verified resolver linktexts instead of assuming a canonical-looking path resolves", async () => {
  const f = mergeFixture();
  const p = new RecommendationPreflight(async () => ({ ...f.read, linktexts: ["", ""] }), () => {});
  await p.check(f.analysis, () => true);
  const intent = recommendationIntent(f.analysis, { origin: "user", action: "add_link" }, p.view.pair, p.view.linktexts);
  expect(intent.status).toBe("unavailable"); expect(intent.limitations).toContain("@planner.error.link");
});

it("background refresh is bounded presentation data and never acquires a writer/history lock", async () => {
  const { reviewOutcomeSnapshot } = await import("./reviewRefresh");
  const app = {} as App;
  expect(reviewOutcomeSnapshot(app)).toEqual([]);
  refreshReviewFacts(app, { id: "one", paths: ["A.md", "B.md"], operation: "add_link", state: "applied", created: 1 });
  expect(reviewOutcomeSnapshot(app)[0].state).toBe("applied");
  refreshReviewFacts(app, { id: "one", paths: ["A.md", "B.md"], operation: "add_link", state: "undone", created: 2 });
  expect(reviewOutcomeSnapshot(app)).toHaveLength(1); expect(reviewOutcomeSnapshot(app)[0].state).toBe("undone");
});

it("history arriving newest-first retains the newest 128 outcomes, including a recently undone older operation", async () => {
  const { checkedReviewHistory, reviewOutcomeSnapshot } = await import("./reviewRefresh");
  const app = {} as App;
  const rows = Array.from({ length: 129 }, (_, i) => ({ state: "applied", record: {
    id: String(129 - i), createdAt: 129 - i, sourcePath: "A.md", targetPath: "B.md", operation: "add_link",
  } as import("./operationJournal").OperationRecord }));
  checkedReviewHistory(app, rows);
  expect(reviewOutcomeSnapshot(app)).toHaveLength(128);
  expect(reviewOutcomeSnapshot(app).some(o => o.id === "129")).toBe(true);
  expect(reviewOutcomeSnapshot(app).some(o => o.id === "1")).toBe(false);
  refreshReviewFacts(app, { id: "2", created: 300, state: "undone", paths: ["A.md", "B.md"], operation: "add_link" });
  checkedReviewHistory(app, [{ ...rows[127], state: "undone" }]);
  expect(reviewOutcomeSnapshot(app).find(o => o.id === "2")).toMatchObject({ state: "undone", created: 300 });
});
