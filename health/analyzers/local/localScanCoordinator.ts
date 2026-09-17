import { cloneCandidate, isFindingCandidate } from "../../domain/findingValidation";
import { compareStrings, isArrayOf, isIdentifier, isText, isVaultPath } from "../../domain/validation";
import type { AnalyzerDiagnostic, AnalyzerResult, HealthAnalyzer } from "../types";
import { checkpoint, isCancellation, LocalAnalysisCancelledError, throwIfAborted, withAbort } from "./cancellation";
import { boundedDiagnostics, diagnostic, MAX_LOCAL_DIAGNOSTICS } from "./diagnostics";
import { createLocalAnalysisContext } from "./localNoteGraph";
import type { LocalVaultSource } from "./localVaultSource";
import { LOCAL_HEALTH_ANALYZERS } from "./registry";
import type { LocalAnalysisContext, LocalScanAnalysis } from "./types";

function validDiagnostic(value: AnalyzerDiagnostic): boolean {
  return value !== null && typeof value === "object" && isIdentifier(value.code) && isText(value.message, 200) &&
    (value.path === undefined || isVaultPath(value.path));
}

/** Captures once and coordinates analysis only. Persistence and ScanRun orchestration belong to PR 3. */
export class LocalScanCoordinator {
  private readonly analyzers: readonly HealthAnalyzer<LocalAnalysisContext>[];

  constructor(private readonly source: LocalVaultSource, analyzers: readonly HealthAnalyzer<LocalAnalysisContext>[] = LOCAL_HEALTH_ANALYZERS) {
    const ids = new Set<string>();
    this.analyzers = [...analyzers].map((analyzer) => {
      if (!isIdentifier(analyzer.id) || !isText(analyzer.version, 128) || typeof analyzer.analyze !== "function" || ids.has(analyzer.id)) {
        throw new Error("Invalid or duplicate local analyzer ID/version");
      }
      ids.add(analyzer.id);
      return Object.freeze({ id: analyzer.id, version: analyzer.version, analyze: analyzer.analyze.bind(analyzer) });
    }).sort((a, b) => compareStrings(a.id, b.id));
  }

  async analyze(signal: AbortSignal): Promise<LocalScanAnalysis> {
    throwIfAborted(signal);
    const snapshot = await withAbort(this.source.capture(signal), signal);
    const context = await createLocalAnalysisContext(snapshot, signal);
    const results: AnalyzerResult[] = [];
    for (const analyzer of this.analyzers) {
      await checkpoint(signal, 0);
      try {
        const result = await withAbort(analyzer.analyze(context, signal), signal);
        throwIfAborted(signal);
        if (!result || result.analyzerId !== analyzer.id || result.analyzerVersion !== analyzer.version ||
            typeof result.complete !== "boolean" || typeof result.successful !== "boolean" || (!result.successful && result.complete) ||
            !isArrayOf(result.candidates, isFindingCandidate) || result.candidates.some((candidate) => candidate.source !== "local" || candidate.analyzerId !== analyzer.id) ||
            new Set(result.candidates.map((candidate) => candidate.fingerprint)).size !== result.candidates.length ||
            !Array.isArray(result.diagnostics) || result.diagnostics.length > MAX_LOCAL_DIAGNOSTICS || !result.diagnostics.every(validDiagnostic)) {
          throw new Error("Invalid local analyzer output");
        }
        results.push({ ...result, candidates: result.candidates.map(cloneCandidate).sort((a, b) => compareStrings(a.fingerprint, b.fingerprint)),
          diagnostics: boundedDiagnostics(result.diagnostics).diagnostics.map((item) => ({ ...item })),
        });
      } catch (error) {
        throwIfAborted(signal);
        if (isCancellation(error)) throw new LocalAnalysisCancelledError();
        results.push({ analyzerId: analyzer.id, analyzerVersion: analyzer.version, successful: false, complete: false,
          candidates: [], diagnostics: [diagnostic("analyzer-failed")],
        });
      }
    }
    throwIfAborted(signal);
    const summary = boundedDiagnostics(snapshot.diagnostics);
    return { notesSeen: context.snapshot.notes.length, analyzerVersions: Object.fromEntries(this.analyzers.map((analyzer) => [analyzer.id, analyzer.version])),
      results, diagnostics: summary.diagnostics.map((item) => ({ ...item })), diagnosticsTruncated: snapshot.diagnosticsTruncated + summary.diagnosticsTruncated,
    };
  }
}
