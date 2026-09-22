import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ parseLinktext: (link: string) => ({ path: link, subpath: "" }) }));
import { HealthPluginController } from "./healthPluginController";
import { HealthService } from "../services/healthService";
import { appFixture, flush, root, preferencesFixture } from "./testSupport";
import type { Finding } from "../domain/finding";

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
