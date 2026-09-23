import type { FindingCandidate } from "../domain/finding";
import { createFindingFingerprint } from "../domain/identity";
import type { ScanRun } from "../domain/scanRun";
import type { HealthFile, HealthStoragePort } from "./types";

export class MemoryHealthStorage implements HealthStoragePort {
  readonly files = new Map<HealthFile, string>();
  async read(file: HealthFile): Promise<string | null> { return this.files.get(file) ?? null; }
  async write(file: HealthFile, contents: string): Promise<void> { this.files.set(file, contents); }
}

export function candidate(overrides: Partial<FindingCandidate> = {}): FindingCandidate {
  const data: FindingCandidate = {
    fingerprint: "placeholder", analyzerId: "broken-links", dimension: "structure", type: "broken-link", source: "local",
    impact: "attention", confidence: "deterministic", title: "Broken link", explanation: "The target does not exist.",
    notePaths: ["Notes/A.md"], evidence: [{ kind: "link", path: "Notes/A.md", relatedPath: "Notes/Missing.md", value: 1, snippet: "Small excerpt" }],
    actions: [{ kind: "open-note", path: "Notes/A.md" }], ...overrides,
  };
  return { ...data, fingerprint: overrides.fingerprint ?? createFindingFingerprint({ ...data, paths: data.notePaths }) };
}

export function scanRun(overrides: Partial<ScanRun> = {}): ScanRun {
  return { id: "scan-1", type: "local", startedAt: 100, completedAt: 200, notesSeen: 2,
    findingsCreated: 1, findingsUpdated: 0, findingsResolved: 0, analyzerVersions: { "broken-links": "1" }, reconciliationReceipts: {}, status: "completed", ...overrides };
}
