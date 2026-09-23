import { describe, expect, it } from "vitest";
import { decodeHealth, isFindingsSnapshot, isFindingsSnapshotV1, isScanRunsSnapshot, isScanRunsSnapshotV1, isSupportedFindingsSnapshot, isSupportedScanRunsSnapshot, serializeHealth } from "./codec";
import { scanRun } from "./testSupport";
import type { FindingsSnapshot, ScanRunsSnapshot, ScanRunsSnapshotV1 } from "./types";

const findings: FindingsSnapshot = { version: 2, updatedAt: 200, reconciliationReceipts: { "local:a": 100, "semantic:b": 200 }, findings: {} };
const history: ScanRunsSnapshot = { version: 2, updatedAt: 200,
  runs: [scanRun({ reconciliationReceipts: { "local:broken-links": 200 } })] };

describe("Health schema codecs", () => {
  it("decodes valid v2 findings and history without changing receipts", () => {
    expect(decodeHealth(serializeHealth(findings), isSupportedFindingsSnapshot)).toEqual({ status: "loaded", data: findings });
    expect(decodeHealth(serializeHealth(history), isSupportedScanRunsSnapshot)).toEqual({ status: "loaded", data: history });
    expect(isFindingsSnapshotV1(findings)).toBe(false);
    expect(isScanRunsSnapshotV1(history)).toBe(false);
  });

  it("explicitly decodes v1, without interpreting it as v2 or fabricating run receipts", () => {
    const legacyFindings = { version: 1 as const, updatedAt: 200, findings: {} };
    const { reconciliationReceipts: _receipts, ...run } = scanRun();
    const legacyHistory: ScanRunsSnapshotV1 = { version: 1, updatedAt: 200, runs: [run] };
    expect(decodeHealth(serializeHealth(legacyFindings), isSupportedFindingsSnapshot)).toEqual({ status: "loaded", data: legacyFindings });
    expect(decodeHealth(serializeHealth(legacyHistory), isSupportedScanRunsSnapshot)).toEqual({ status: "loaded", data: legacyHistory });
    expect(isFindingsSnapshot(legacyFindings)).toBe(false);
    expect(isScanRunsSnapshot(legacyHistory)).toBe(false);
    expect(isScanRunsSnapshotV1({ ...legacyHistory, runs: [scanRun()] })).toBe(false);
  });

  it.each([undefined, null, [], { "local:a:b": 100 }, { "provider:a": 100 }, { "local:a": -1 }, { "local:a": 1.5 }, { "local:a": "100" }])("rejects invalid v2 receipts in both files: %j", (reconciliationReceipts) => {
    expect(isFindingsSnapshot({ ...findings, reconciliationReceipts })).toBe(false);
    expect(isScanRunsSnapshot({ ...history, runs: [{ ...history.runs[0], reconciliationReceipts }] })).toBe(false);
  });

  it("rejects receipts newer than the global write marker, preventing backwards reconciliation", () => {
    expect(isFindingsSnapshot({ ...findings, updatedAt: 199 })).toBe(false);
  });

  it.each([3, 99, "2", 0])("keeps unknown version %j unsupported", (version) => {
    expect(decodeHealth(JSON.stringify({ ...findings, version }), isSupportedFindingsSnapshot).status).toBe("unsupported");
    expect(decodeHealth(JSON.stringify({ ...history, version }), isSupportedScanRunsSnapshot).status).toBe("unsupported");
  });

  it("requires empty receipts on failed and running v2 runs", () => {
    expect(isScanRunsSnapshot({ ...history, runs: [{ ...history.runs[0], status: "failed" }] })).toBe(false);
    expect(isScanRunsSnapshot({ ...history, runs: [{ ...history.runs[0], status: "running", completedAt: undefined }] })).toBe(false);
  });

  it("serializes receipt maps deterministically in findings and history", () => {
    const reversed = { "semantic:b": 200, "local:a": 100 };
    expect(serializeHealth({ ...findings, reconciliationReceipts: reversed })).toBe(serializeHealth(findings));
    expect(serializeHealth({ ...history, runs: [scanRun({ reconciliationReceipts: reversed })] }))
      .toBe(serializeHealth({ ...history, runs: [scanRun({ reconciliationReceipts: findings.reconciliationReceipts })] }));
  });
});
