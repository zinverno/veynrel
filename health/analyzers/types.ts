import type { FindingCandidate } from "../domain/finding";

export interface AnalyzerDiagnostic {
  code: string;
  message: string;
  path?: string;
}

export interface AnalyzerResult {
  analyzerId: string;
  analyzerVersion: string;
  successful: boolean;
  complete: boolean;
  candidates: FindingCandidate[];
  diagnostics: AnalyzerDiagnostic[];
}

/** IDs and versions are compatibility contracts, never constructor names or UI text. */
export interface HealthAnalyzer<TContext> {
  readonly id: string;
  readonly version: string;
  analyze(context: TContext, signal: AbortSignal): Promise<AnalyzerResult>;
}
