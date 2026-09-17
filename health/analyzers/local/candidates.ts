import type { FindingCandidate } from "../../domain/finding";
import { createFindingFingerprint } from "../../domain/identity";
import { compareStrings } from "../../domain/validation";
import type { AnalyzerDiagnostic, AnalyzerResult } from "../types";

/** All built-ins route identity through the existing domain fingerprint helper. */
export function localCandidate(
  details: Omit<FindingCandidate, "source" | "confidence" | "fingerprint">,
  identity: { paths: readonly string[]; key?: string },
): FindingCandidate {
  return { ...details, source: "local", confidence: "deterministic",
    fingerprint: createFindingFingerprint({ source: "local", analyzerId: details.analyzerId, dimension: details.dimension, type: details.type, ...identity }),
  };
}

export function analyzerResult(analyzerId: string, analyzerVersion: string, candidates: FindingCandidate[], complete: boolean, diagnostics: AnalyzerDiagnostic[] = []): AnalyzerResult {
  candidates.sort((a, b) => compareStrings(a.fingerprint, b.fingerprint));
  return { analyzerId, analyzerVersion, successful: true, complete, candidates, diagnostics };
}

export const MAX_REPRESENTED_PATHS = 100;
export function representedPaths(paths: readonly string[]): string[] {
  return [...paths].sort(compareStrings).slice(0, MAX_REPRESENTED_PATHS);
}
