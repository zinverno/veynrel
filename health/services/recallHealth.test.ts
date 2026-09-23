import { describe, expect, it, vi } from "vitest";
import type { RecallHealthSnapshot } from "../recallHealthPort";
import { aggregateHealth } from "./healthAggregator";
import { HealthService } from "./healthService";
import { FindingStore } from "../store/findingStore";
import { candidate, MemoryHealthStorage, scanRun } from "../store/testSupport";
import { LOCAL_HEALTH_ANALYZERS } from "../analyzers/local/registry";

const ready: RecallHealthSnapshot = { loadState: "ready", firstRun: false, active: 10, due: 3, new: 2 };
const local = scanRun({ analyzerVersions: Object.fromEntries(LOCAL_HEALTH_ANALYZERS.map(({ id, version }) => [id, version])) });

describe("Recall Health pure aggregation", () => {
  it.each([
    [{ ...ready, loadState: "uninitialized" }, "unknown", "not-enabled", false],
    [{ ...ready, loadState: "loading" }, "unknown", "not-enabled", false],
    [{ ...ready, firstRun: true }, "unknown", "not-enabled", false],
    [{ ...ready, active: 0, due: 0 }, "unknown", "basic", true],
    [{ ...ready, due: 0 }, "good", "basic", true],
    [ready, "review-recommended", "basic", true],
    [{ ...ready, loadState: "invalid" }, "unknown", "not-enabled", false],
    [{ ...ready, loadState: "unsupported" }, "unknown", "not-enabled", false],
    [{ ...ready, loadState: "unavailable" }, "unknown", "not-enabled", false],
  ] as const)("maps %j without changing the other dimensions", (recall, state, analysisDepth, analysisComplete) => {
    for (const lastLocalScan of [undefined, local, { ...local, status: "partial" as const }]) {
      for (const semanticStatus of [undefined, "completed", "partial", "failed"] as const) {
        const lastSemanticScan = semanticStatus ? scanRun({ type: "semantic", status: semanticStatus,
          analyzerVersions: { "semantic-duplicates": "1" }, reconciliationReceipts: { "semantic:semantic-duplicates": 200 } }) : undefined;
        const input = { findings: [], reconciled: true, lastLocalScan, lastSemanticScan, semanticReconciled: true };
        const before = aggregateHealth(input), after = aggregateHealth({ ...input, recall });
        expect(after.dimensions.recall).toEqual({ state, analysisDepth, analysisComplete, openFindings: 0, attentionFindings: 0, reviewFindings: 0 });
        for (const id of ["structure", "connections", "knowledge"] as const) expect(after.dimensions[id]).toEqual(before.dimensions[id]);
        expect(after.openFindings).toBe(before.openFindings); expect(after.newFindings).toBe(before.newFindings);
      }
    }
  });

  it("10 active / 3 due preserves real Finding bytes, counts, history and recommendation ranking", async () => {
    const storage = new MemoryHealthStorage(), store = new FindingStore(storage);
    const source = { capture: vi.fn(), captureRevision: vi.fn() };
    const service = new HealthService(store, source); await service.initialize();
    await store.reconcile({ scope: { source: "local", analyzerIds: ["broken-links"] },
      candidates: [candidate(), candidate({ notePaths: ["B.md"], impact: "review" })], complete: true, seenAt: 100 });
    await store.recordScanRun({ ...local, reconciliationReceipts: store.getReconciliationReceipts() });
    const bytes = [...storage.files], write = vi.spyOn(storage, "write"), before = service.getSnapshot("learning");
    const after = service.getSnapshot("learning", ready);
    expect(after.dimensions.recall.state).toBe("review-recommended"); expect(after.dimensions.recall.openFindings).toBe(0);
    expect(before.openFindings).toBe(2); expect(before.newFindings).toBe(2);
    expect(after.openFindings).toBe(before.openFindings); expect(after.newFindings).toBe(before.newFindings);
    expect(after.recommendation).toEqual(before.recommendation); expect(after.lastLocalScan).toEqual(before.lastLocalScan);
    expect(store.list().every((finding) => finding.source === "local")).toBe(true);
    expect(write).not.toHaveBeenCalled(); expect([...storage.files]).toEqual(bytes); expect(source.capture).not.toHaveBeenCalled();
    expect(after.recall).toEqual(ready); expect(after.recall).not.toBe(ready);
    Object.assign(after.recall!, { active: 99 }); expect(ready.active).toBe(10);
  });
});
