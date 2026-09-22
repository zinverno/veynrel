import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ parseLinktext: (link: string) => ({ path: link, subpath: "" }) }));
import { HealthPluginController } from "./healthPluginController";
import { HealthService } from "../services/healthService";
import { appFixture, flush, root, preferencesFixture } from "./testSupport";
import type { Finding } from "../domain/finding";
import { findingsInboxViewModel, findingsRoute, snoozeDeadline, SNOOZE_DAYS } from "../ui/findingsInboxViewModel";

function fixture() { const f = appFixture(); const p = preferencesFixture(); return { ...f, ...p, controller: new HealthPluginController(f.app, "ai-knowledge-hub", p.preferences) }; }

describe("plugin-owned lazy Health", () => {
  it("does no I/O on construction, initializes one service once and never scans on open", async () => {
    const f = fixture(); expect(f.adapter.exists).not.toHaveBeenCalled();
    const first = f.controller.getHealthService(); expect(f.controller.getHealthService()).toBe(first);
    const service = await first;
    expect(await f.controller.getHealthService()).toBe(service);
    expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled();
    expect(f.adapter.write).not.toHaveBeenCalled(); expect(f.adapter.mkdir).not.toHaveBeenCalled();
    expect(f.controller.getState().snapshot?.initialization.status).toBe("ready");
  });
  it("one manual scan updates the dashboard; overlapping clicks share the owned promise", async () => {
    const f = fixture(); await f.controller.getHealthService();
    let release!: (body: string) => void;
    f.vault.read.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const listener = vi.fn(); const unsubscribe = f.controller.subscribe(listener);
    const pending = f.controller.runLocalScan(); expect(f.controller.runLocalScan()).toBe(pending);
    await flush(); expect(f.controller.getState().busy).toBe(true);
    expect(f.vault.read).toHaveBeenCalledTimes(1);
    unsubscribe(); const calls = listener.mock.calls.length;
    release("Enough meaningful content to keep this note outside near empty detection."); await pending;
    expect(listener).toHaveBeenCalledTimes(calls); // Closing a view does not cancel its plugin's scan.
    expect(f.controller.getState()).toMatchObject({ busy: false, outcome: { findingsCommitted: true, historyRecorded: true, scan: { status: "completed" } } });
    expect(f.controller.getState().snapshot?.dimensions.structure.state).toBe("review-recommended");
    expect(f.controller.getRecommendationPath()).toBe("A.md");
    expect(f.adapter.write.mock.calls.map(([path]) => path)).toEqual([`${root}/findings.json`, `${root}/scan-runs.json`]);
  });
  it("permits a fresh initialization attempt after an unexpected initialization failure", async () => {
    const f = fixture();
    const initialize = vi.spyOn(HealthService.prototype, "initialize").mockRejectedValueOnce(new Error("private"));
    try {
      await expect(f.controller.getHealthService()).rejects.toThrow("Health storage could not be initialized");
      expect(f.controller.getState().error).toBe("load");
      const service = await f.controller.getHealthService();
      expect(service.getSnapshot().initialization.status).toBe("ready");
      expect(f.controller.getState().error).toBeUndefined(); expect(f.vault.read).not.toHaveBeenCalled();
    } finally { initialize.mockRestore(); }
  });
  it("consumes rejected scans without leaking private exceptions or replacing existing data", async () => {
    const f = fixture(); f.files.set(`${root}/findings.json`, "{bad");
    await f.controller.runLocalScan();
    expect(f.controller.getState()).toMatchObject({ busy: false, error: "scan" });
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.files.get(`${root}/findings.json`)).toBe("{bad");
  });
  it("all-state recovery replaces the poisoned owner with a fresh missing/writable service", async () => {
    const f = fixture(); f.files.set(`${root}/findings.json`, '{"version":99}'); f.files.set(`${root}/scan-runs.json`, "{bad");
    const old = await f.controller.getHealthService();
    expect(await f.controller.recover("history")).toBe(false);
    expect(await f.controller.recover("all")).toBe(true);
    const fresh = await f.controller.getHealthService(); expect(fresh).not.toBe(old);
    expect(fresh.getSnapshot().initialization).toMatchObject({ status: "ready", storage: { findings: "missing", scanRuns: "missing" } });
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
    expect([...f.files.keys()].every((path) => path.startsWith(`${root}/recovery/`))).toBe(true);
  });
  it("valid Findings with damaged history reset history only and remain conservative", async () => {
    const f = fixture(); await f.controller.runLocalScan(); f.controller.dispose();
    const preserved = f.files.get(`${root}/findings.json`);
    f.files.set(`${root}/scan-runs.json`, "{bad");
    const controller = new HealthPluginController(f.app, "ai-knowledge-hub", f.preferences); const old = await controller.getHealthService();
    expect(await controller.recover("all")).toBe(false);
    expect(await controller.recover("history")).toBe(true);
    expect(await controller.getHealthService()).not.toBe(old);
    expect(f.files.get(`${root}/findings.json`)).toBe(preserved);
    expect(controller.getState().snapshot?.dimensions.connections).toMatchObject({ state: "unknown", analysisComplete: false });
    expect(controller.getState().snapshot?.openFindings).toBe(1);
  });
  it("failed recovery retains the old blocked service and reports a safe error", async () => {
    const f = fixture(); f.files.set(`${root}/findings.json`, "{bad"); const old = await f.controller.getHealthService();
    f.adapter.rename.mockRejectedValue(new Error("secret"));
    expect(await f.controller.recover("all")).toBe(false);
    expect(await f.controller.getHealthService()).toBe(old);
    expect(f.controller.getState().error).toBe("recovery"); expect(f.files.get(`${root}/findings.json`)).toBe("{bad");
  });
  it("blocks scan/recovery overlap and consumes cancellation at plugin disposal", async () => {
    const f = fixture(); await f.controller.getHealthService(); f.vault.read.mockReturnValue(new Promise(() => {}));
    const pending = f.controller.runLocalScan(); await flush();
    expect(await f.controller.recover("all")).toBe(false);
    f.controller.dispose(); await pending;
    expect(f.controller.getState().busy).toBe(false); expect(f.adapter.write).not.toHaveBeenCalled();
  });
});

describe("profile intent without analysis side effects", () => {
  function duplicateVault() {
    const f = fixture();
    f.vault.getMarkdownFiles.mockReturnValue([f.note, { ...f.note, path: "B.md", basename: "B" },
      { ...f.note, path: "Private/Config/Excluded.md" }, { ...f.note, path: ".ai-backup/Excluded.md" }]);
    return f;
  }
  it("work -> research changes only the backend recommendation; findings, scan history and reads stay unchanged", async () => {
    const f = duplicateVault();
    await f.controller.updatePreferences({ profile: "work", profileChosen: true, onboardingCompleted: true });
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
    await f.controller.runLocalScan(); const service = await f.controller.getHealthService();
    const findings = service.listFindings(); const files = new Map(f.files); const scan = f.controller.getState().snapshot?.lastLocalScan;
    expect(f.controller.getState().recommendationFinding?.dimension).toBe("structure");
    f.vault.read.mockClear(); f.vault.getMarkdownFiles.mockClear(); f.adapter.write.mockClear();
    await f.controller.updatePreferences({ profile: "research" });
    expect(f.controller.getState().recommendationFinding?.dimension).toBe("connections");
    expect(service.listFindings()).toEqual(findings); expect(f.files).toEqual(files);
    expect(f.controller.getState().snapshot?.lastLocalScan).toEqual(scan);
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
    f.controller.dispose();
    const restarted = new HealthPluginController(f.app, "ai-knowledge-hub", f.preferences); await restarted.getHealthService();
    expect(restarted.getState().preferences.profile).toBe("research");
    expect(restarted.getState().recommendationFinding?.dimension).toBe("connections");
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
  });
  it("every profile runs identical detection over identical scope with identical Finding identities", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    let reference: Finding[] | undefined;
    try {
      for (const profile of ["learning", "research", "work", "personal", "mixed"] as const) {
        const f = duplicateVault();
        await f.controller.updatePreferences({ profile, profileChosen: true }); await f.controller.getHealthService();
        expect(f.vault.read).not.toHaveBeenCalled();
        await f.controller.runLocalScan(); const service = await f.controller.getHealthService();
        const findings = service.listFindings(); reference ??= findings;
        expect(findings).toEqual(reference);
        expect(f.vault.read).toHaveBeenCalledTimes(2);
        expect(f.controller.getState().snapshot?.lastLocalScan?.notesSeen).toBe(2);
        expect(Object.keys(f.controller.getState().snapshot!.lastLocalScan!.analyzerVersions).sort())
          .toEqual(["broken-links", "duplicate-titles", "exact-duplicates", "graph-components", "no-incoming-links", "no-outgoing-links", "note-shape", "orphans"]);
        expect(findings.every((finding) => finding.notePaths.every((path) => path === "A.md" || path === "B.md"))).toBe(true);
        f.controller.dispose();
      }
    } finally { clock.mockRestore(); }
  });
  it("preference failures keep the effective recommendation, and recovery preserves all preferences", async () => {
    const f = duplicateVault(); await f.controller.updatePreferences({ profile: "work", profileChosen: true, onboardingCompleted: true });
    await f.controller.runLocalScan(); const previous = f.controller.getState();
    f.save.mockRejectedValueOnce(new Error("private detail"));
    expect(await f.controller.updatePreferences({ profile: "research" })).toBe(false);
    const failed = f.controller.getState();
    expect(failed.preferences).toEqual(previous.preferences); expect(failed.snapshot?.recommendation).toEqual(previous.snapshot?.recommendation);
    expect(failed.preferencesError).toBe(true); expect(JSON.stringify(failed)).not.toContain("private detail");
    f.controller.dispose(); f.files.set(`${root}/findings.json`, "{bad");
    const restarted = new HealthPluginController(f.app, "ai-knowledge-hub", f.preferences); await restarted.getHealthService();
    const saves = f.save.mock.calls.length;
    expect(await restarted.recover("all")).toBe(true);
    expect(restarted.getState().preferences).toEqual(previous.preferences); expect(f.save).toHaveBeenCalledTimes(saves);
  });
});

describe("Finding lifecycle through the controller", () => {
  it("returns independent copies and immediately refreshes counts, recommendation and trustworthy Health after dismiss", async () => {
    const f = fixture(); await f.controller.runLocalScan();
    const item = f.controller.listFindings()[0]; const before = structuredClone(item);
    item.notePaths.push("Do not store.md"); item.evidence.length = 0;
    expect(f.controller.getFinding(item.id)).toEqual(before);
    f.vault.read.mockClear(); f.vault.getMarkdownFiles.mockClear(); f.adapter.write.mockClear();
    const listener = vi.fn(); f.controller.subscribe(listener);
    expect(await f.controller.dismissFinding(item.id)).toBe(true);
    expect(f.controller.listFindings({ state: "open" })).toEqual([]);
    expect(f.controller.listFindings({ state: "dismissed" })[0].id).toBe(item.id);
    expect(f.controller.getState().snapshot).toMatchObject({ openFindings: 0, recommendation: undefined, dimensions: { structure: { state: "good", analysisComplete: true } } });
    expect(listener).toHaveBeenCalled();
    expect(f.adapter.write.mock.calls.map(([path]) => path)).toEqual([`${root}/findings.json`]);
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
  });
  it("keeps committed rows while saving, rejects duplicate clicks and excludes concurrent scan/recovery", async () => {
    const f = fixture(); await f.controller.runLocalScan(); const item = f.controller.listFindings()[0];
    const write = f.adapter.write.getMockImplementation()!;
    let release!: () => void;
    f.adapter.write.mockImplementationOnce(async (...args) => { await new Promise<void>((resolve) => { release = resolve; }); await write(...args); });
    f.vault.read.mockClear(); f.vault.getMarkdownFiles.mockClear();
    const pending = f.controller.dismissFinding(item.id); await flush();
    expect(f.controller.getState().mutatingFindingId).toBe(item.id);
    expect(f.controller.getFinding(item.id)?.state).toBe("open");
    expect(await f.controller.dismissFinding(item.id)).toBe(false);
    expect(await f.controller.reopenFinding(item.id)).toBe(false);
    expect(await f.controller.recover("all")).toBe(false); await f.controller.runLocalScan();
    expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled(); release(); expect(await pending).toBe(true);
    expect(f.controller.getState().mutatingFindingId).toBeUndefined();
  });
  it.each(["dismiss", "snooze", "reopen"] as const)("%s write failure retains backend/UI state and exposes no private exception", async (action) => {
    const f = fixture(); await f.controller.runLocalScan(); const item = f.controller.listFindings()[0];
    if (action === "reopen") await f.controller.dismissFinding(item.id);
    const before = f.controller.getFinding(item.id)!; const bytes = f.files.get(`${root}/findings.json`);
    f.adapter.write.mockRejectedValueOnce(new Error("PRIVATE STORAGE ERROR"));
    const success = action === "dismiss" ? await f.controller.dismissFinding(item.id)
      : action === "snooze" ? await f.controller.snoozeFinding(item.id, snoozeDeadline(1)) : await f.controller.reopenFinding(item.id);
    expect(success).toBe(false); expect(f.controller.getFinding(item.id)).toEqual(before); expect(f.files.get(`${root}/findings.json`)).toBe(bytes);
    expect(f.controller.getState().mutatingFindingId).toBeUndefined(); expect(JSON.stringify(f.controller.getState())).not.toContain("PRIVATE");
    expect(f.controller.getState()).not.toHaveProperty("findingMutationError");
    expect(findingsInboxViewModel({ findings: f.controller.listFindings(), route: findingsRoute({ state: before.state }) }).rows[0].id).toBe(item.id);
  });
  it.each(SNOOZE_DAYS)("snoozes for %s days, updates recommendation without scan, and reopens", async (days) => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    try {
      const f = fixture(); await f.controller.runLocalScan(); const item = f.controller.getState().recommendationFinding!;
      f.vault.read.mockClear(); f.vault.getMarkdownFiles.mockClear();
      expect(await f.controller.snoozeFinding(item.id, snoozeDeadline(days, () => 1000))).toBe(true);
      expect(f.controller.getFinding(item.id)).toMatchObject({ state: "snoozed", snoozedUntil: 1000 + days * 86_400_000 });
      expect(f.controller.getState().snapshot?.recommendation).toBeUndefined(); expect(f.controller.getState().snapshot?.openFindings).toBe(0);
      clock.mockReturnValue(1000 + (days + 1) * 86_400_000);
      expect(f.controller.listFindings({ state: "snoozed" })).toHaveLength(1); // Passing time alone never reconciles.
      expect(await f.controller.reopenFinding(item.id)).toBe(true);
      expect(f.controller.getFinding(item.id)?.state).toBe("open");
      expect(f.controller.getFinding(item.id)).not.toHaveProperty("snoozedUntil");
      expect(f.controller.getState().snapshot?.recommendation?.findingId).toBe(item.id);
      expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
    } finally { clock.mockRestore(); }
  });
  it.each(["dismissed", "snoozed"] as const)("retains %s after owner restart, permits Reopen without scanning", async (state) => {
    const f = fixture(); await f.controller.runLocalScan(); const item = f.controller.listFindings()[0];
    if (state === "dismissed") await f.controller.dismissFinding(item.id);
    else await f.controller.snoozeFinding(item.id, snoozeDeadline(7));
    f.controller.dispose(); f.vault.read.mockClear(); f.vault.getMarkdownFiles.mockClear();
    const owner = new HealthPluginController(f.app, "ai-knowledge-hub", f.preferences); await owner.getHealthService();
    const model = findingsInboxViewModel({ findings: owner.listFindings(), route: findingsRoute({ state }) });
    expect(model.rows.map((row) => row.id)).toEqual([item.id]);
    expect(await owner.reopenFinding(item.id)).toBe(true); expect(owner.getFinding(item.id)?.state).toBe("open");
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
  });
  it("dismissal persists through identical scans, while snooze expiry reopens only on detection", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    try {
      const f = fixture(); await f.controller.runLocalScan(); const item = f.controller.listFindings()[0];
      await f.controller.dismissFinding(item.id); await f.controller.runLocalScan();
      expect(f.controller.getFinding(item.id)?.state).toBe("dismissed");
      await f.controller.reopenFinding(item.id); await f.controller.snoozeFinding(item.id, snoozeDeadline(1));
      await f.controller.runLocalScan(); expect(f.controller.getFinding(item.id)?.state).toBe("snoozed");
      clock.mockReturnValue(snoozeDeadline(1, () => 1001));
      expect(f.controller.getFinding(item.id)?.state).toBe("snoozed");
      await f.controller.runLocalScan(); expect(f.controller.getFinding(item.id)).toMatchObject({ state: "open", firstSeenAt: item.firstSeenAt });
    } finally { clock.mockRestore(); }
  });
  it("complete absence resolves into history; recurrence reopens the same ID and original firstSeenAt", async () => {
    const f = fixture(); await f.controller.runLocalScan(); const item = f.controller.listFindings()[0];
    f.vault.getMarkdownFiles.mockReturnValue([]); await f.controller.runLocalScan();
    expect(findingsInboxViewModel({ findings: f.controller.listFindings(), route: findingsRoute({ state: "resolved" }) }).rows[0].id).toBe(item.id);
    expect(await f.controller.reopenFinding(item.id)).toBe(false);
    expect(await f.controller.dismissFinding(item.id)).toBe(false);
    expect(await f.controller.snoozeFinding(item.id, snoozeDeadline(1))).toBe(false);
    f.vault.getMarkdownFiles.mockReturnValue([f.note]); await f.controller.runLocalScan();
    expect(f.controller.listFindings({ state: "resolved" })).toEqual([]);
    expect(f.controller.getFinding(item.id)).toMatchObject({ state: "open", firstSeenAt: item.firstSeenAt });
  });
  it("dismissal never turns partial analysis into Good", async () => {
    const f = fixture(); f.vault.read.mockRejectedValue(new Error("content unavailable")); await f.controller.runLocalScan();
    expect(f.controller.getState().outcome?.scan.status).toBe("partial");
    for (const item of f.controller.listFindings()) await f.controller.dismissFinding(item.id);
    expect(f.controller.getState().snapshot).toMatchObject({ openFindings: 0, dimensions: {
      structure: { state: "unknown", analysisComplete: false }, connections: { state: "unknown", analysisComplete: false } } });
  });
  it("rejects stale controls while scanning, unknown IDs, disposed owners and invalid storage", async () => {
    const f = fixture(); await f.controller.runLocalScan(); const item = f.controller.listFindings()[0];
    f.vault.read.mockReturnValue(new Promise(() => {})); const pending = f.controller.runLocalScan();
    expect(await f.controller.dismissFinding(item.id)).toBe(false); expect(f.controller.getFinding("bad id")).toBeUndefined();
    f.controller.dispose(); await pending;
    expect(await f.controller.dismissFinding(item.id)).toBe(false); expect(f.controller.listFindings()).toEqual([]);
    f.files.set(`${root}/findings.json`, '{"version":99}');
    const blocked = new HealthPluginController(f.app, "ai-knowledge-hub", f.preferences); await blocked.getHealthService();
    expect(blocked.listFindings()).toEqual([]); expect(await blocked.reopenFinding(item.id)).toBe(false);
  });
});
