import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ getLanguage: () => "en" }));
import { findingPair, nextActionFindings } from "./recommendationService";
import { inboxFinding } from "../ui/testSupport";
import { findingsInboxViewModel, findingsRoute } from "../ui/findingsInboxViewModel";
import { setLanguage } from "../../i18n";

describe("bounded actionable findings", () => {
  const pair = () => inboxFinding({ id: "pair", impact: "review", notePaths: ["a/Same.md", "b/Same.md"],
    evidence: [{ kind: "basename", value: "Same" }], actions: [{ kind: "compare-notes", path: "a/Same.md", relatedPath: "b/Same.md" }] });
  it("keeps at most three evidence-backed actions and does not make an isolated diary a task", () => {
    const candidates = [pair(), ...Array.from({ length: 5 }, (_, i) => ({ ...pair(), id: `pair-${i}` })),
      { ...pair(), id: "diary", impact: "info" as const }, { ...pair(), id: "unsupported", actions: [] }];
    expect(nextActionFindings(candidates).map(f => f.id)).toEqual(["pair", "pair-0", "pair-1"]);
    expect(nextActionFindings([{ ...pair(), evidence: [] }])).toEqual([]);
    expect(nextActionFindings([inboxFinding({ type: "orphan-note", impact: "attention", notePaths: ["Diary.md"],
      evidence: [{ kind: "incoming-count", value: 0 }], actions: [{ kind: "open-note", path: "Diary.md" }] })])).toEqual([]);
  });
  it("does not prioritize age, frequency or unrelated rescans; lifecycle decisions remain separate", () => {
    const a = pair(), b = { ...pair(), id: "b", lastSeenAt: 9e12 };
    expect(nextActionFindings([a, b]).map(f => f.id)).toEqual(["b", "pair"]);
    a.lastSeenAt = 9e13; expect(nextActionFindings([a, b]).map(f => f.id)).toEqual(["b", "pair"]);
    for (const state of ["dismissed", "snoozed", "resolved"] as const) expect(nextActionFindings([{ ...a, state }])).toEqual([]);
  });
  it("requires both distinct paths to belong to the finding and never invents a broken-link target", () => {
    const a = pair(); expect(findingPair(a)).toEqual(a.notePaths);
    a.notePaths.pop(); expect(findingPair(a)).toBeUndefined();
    a.actions = [{ kind: "open-note", path: a.notePaths[0] }]; expect(findingPair(a)).toBeUndefined();
  });
  it("routes an existing semantic pair without rerunning a model or treating a group as a pair", () => {
    const a = { ...pair(), source: "semantic" as const, type: "semantic-duplicate", actions: [{ kind: "open-note", path: "a/Same.md" }] };
    expect(findingPair(a)).toEqual(a.notePaths); a.notePaths.push("third.md"); expect(findingPair(a)).toBeUndefined();
  });
  it.each(["ru", "en"] as const)("presents recorded evidence and a precise pair in %s, without a semantic assertion", language => {
    setLanguage(language); const a = pair();
    const selected = findingsInboxViewModel({ findings: [a], route: findingsRoute({ selectedFindingId: a.id }) }).selected!;
    expect(selected.pair).toEqual(a.notePaths); expect(selected.recorded).not.toContain("@actions.");
    expect(selected.origin).toContain(language === "en" ? "local observation" : "локальное наблюдение");
    expect(selected.canDismiss && selected.canSnooze).toBe(true);
  });
});
