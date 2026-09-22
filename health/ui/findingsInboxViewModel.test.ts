import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ getLanguage: () => "en" }));
import { setLanguage } from "../../i18n";
import { FINDING_DIMENSIONS, FINDING_STATES, findingsInboxViewModel, findingsRoute, snoozeDeadline, SNOOZE_DAYS } from "./findingsInboxViewModel";
import { inboxFinding } from "./testSupport";
import type { HealthDimension } from "../domain/finding";

beforeEach(() => setLanguage("en"));
const findings = FINDING_STATES.flatMap((state) => FINDING_DIMENSIONS.filter((d): d is HealthDimension => d !== "all").map((dimension) =>
  inboxFinding({ id: `${state}-${dimension}`, state, dimension })));

describe("derived Findings Inbox", () => {
  it("defaults to Open and All", () => expect(findingsRoute()).toEqual({ page: "findings", state: "open", dimension: "all" }));
  it.each(FINDING_STATES)("filters %s and all dimensions, with live dimension-scoped state counts", (state) => {
    for (const dimension of FINDING_DIMENSIONS) {
      const model = findingsInboxViewModel({ findings, route: findingsRoute({ state, dimension }) });
      const count = dimension === "all" ? 4 : 1;
      expect(model.rows).toHaveLength(count);
      expect(model.rows.every((row) => row.id.startsWith(`${state}-`) && (dimension === "all" || row.id.endsWith(dimension)))).toBe(true);
      expect(model.counts).toEqual({ open: count, snoozed: count, dismissed: count, resolved: count });
      expect(model.stateFilters.filter((filter) => filter.selected).map((filter) => filter.value)).toEqual([state]);
      expect(model.dimensionFilters.filter((filter) => filter.selected).map((filter) => filter.value)).toEqual([dimension]);
    }
  });
  it("sorts impact then recency then code-unit ID without mutating input or timestamps", () => {
    const input = [inboxFinding({ id: "info", impact: "info", lastSeenAt: 100 }), inboxFinding({ id: "review", impact: "review", lastSeenAt: 100 }),
      inboxFinding({ id: "b", lastSeenAt: 3 }), inboxFinding({ id: "a", lastSeenAt: 3 }), inboxFinding({ id: "old", lastSeenAt: 2 })];
    const before = structuredClone(input); const model = findingsInboxViewModel({ findings: Object.freeze(input), route: findingsRoute({ selectedFindingId: "a" }) });
    expect(model.rows.map((row) => row.id)).toEqual(["a", "b", "old", "review", "info"]);
    model.selected!.notes.push("Other.md"); model.rows.reverse(); expect(input).toEqual(before);
  });
  it("selects only visible Findings, handles unknown IDs and invalidates selection after a lifecycle change", () => {
    const finding = inboxFinding(); const route = findingsRoute({ selectedFindingId: finding.id });
    expect(findingsInboxViewModel({ findings: [finding], route }).selected?.id).toBe(finding.id);
    for (const state of ["dismissed", "snoozed", "resolved"] as const) {
      const model = findingsInboxViewModel({ findings: [{ ...finding, state }], route });
      expect(model.selected).toBeUndefined(); expect(model.selectionLeftFilter).toBe(true); expect(model.selectionResolved).toBe(state === "resolved");
    }
    const unknown = findingsInboxViewModel({ findings: [finding], route: findingsRoute({ selectedFindingId: "missing" }) });
    expect(unknown.selected).toBeUndefined(); expect(unknown.selectionResolved).toBe(false);
  });
  it.each(FINDING_STATES)("exposes only supported lifecycle controls for %s", (state) => {
    const item = inboxFinding({ state });
    const model = findingsInboxViewModel({ findings: [item], route: findingsRoute({ state, selectedFindingId: item.id }) });
    expect(model.selected).toMatchObject({ canDismiss: state === "open", canSnooze: state === "open", canReopen: state === "dismissed" || state === "snoozed", resolved: state === "resolved" });
    expect(findingsInboxViewModel({ findings: [item], route: findingsRoute({ state, selectedFindingId: item.id }), mutatingFindingId: item.id }).selected?.disabled).toBe(true);
  });
  it.each(["en", "ru"] as const)("uses localized prose, evidence, state and date in %s while preserving paths and fallback text", (language) => {
    setLanguage(language); const item = inboxFinding({ notePaths: ["Notes/RAG.md"], state: "snoozed", snoozedUntil: 1_790_000_000_000,
      evidence: [{ kind: "target", value: "English target" }] });
    const before = structuredClone(item);
    const model = findingsInboxViewModel({ findings: [item], route: findingsRoute({ state: "snoozed", selectedFindingId: item.id }) });
    expect(model.rows[0].noteSummary).toBe("Notes/RAG.md"); expect(model.selected?.facts[0]).toContain("English target");
    expect(model.selected?.snoozedUntil).toContain(new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(1_790_000_000_000));
    expect(model.selected?.state).toBe(language === "ru" ? "Отложенные" : "Snoozed");
    expect(JSON.stringify(model)).not.toMatch(/@findings\.|@health\.|fingerprint|deterministic/u); expect(item).toEqual(before);
    const future = inboxFinding({ type: "future", title: "Stored title", explanation: "Stored explanation" });
    expect(findingsInboxViewModel({ findings: [future], route: findingsRoute() }).rows[0]).toMatchObject({ title: future.title, explanation: future.explanation });
  });
  it("summarizes multiple paths and actual group size without joining path lists", () => {
    const item = inboxFinding({ type: "exact-duplicate-group", notePaths: ["A.md", "B.md"], evidence: [{ kind: "member-count", value: 105 }] });
    expect(findingsInboxViewModel({ findings: [item], route: findingsRoute() }).rows[0].noteSummary).toBe("105 notes");
    item.evidence = []; expect(findingsInboxViewModel({ findings: [item], route: findingsRoute() }).rows[0].noteSummary).toBe("2 notes");
  });
  it.each(FINDING_STATES)("empty %s is scoped to current filters and makes no vault-health claim", (state) => {
    const model = findingsInboxViewModel({ findings: [], route: findingsRoute({ state, dimension: "knowledge" }) });
    expect(model.empty.title.toLowerCase()).toContain(state); expect(model.empty.description).toContain("selected filters");
    expect(JSON.stringify(model.empty)).not.toMatch(/healthy|Good/u);
  });
  it.each(SNOOZE_DAYS)("calculates %s elapsed days from the injected clock without changing state on expiry", (days) => {
    const now = 1000; expect(snoozeDeadline(days, () => now)).toBe(now + days * 86_400_000);
    const item = inboxFinding({ state: "snoozed", snoozedUntil: 1 });
    expect(findingsInboxViewModel({ findings: [item], route: findingsRoute({ state: "snoozed" }) }).rows).toHaveLength(1);
  });
});
