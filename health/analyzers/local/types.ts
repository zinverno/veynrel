import type { AnalyzerDiagnostic, AnalyzerResult } from "../types";
import type { LocalVaultRevision } from "./localVaultRevision";

export interface LocalUnresolvedLink {
  readonly target: string;
  readonly count: number;
}

/** Transient data only; unavailable content/metadata is never evidence of absence. */
export interface LocalNoteSnapshot {
  readonly path: string;
  readonly basename: string;
  readonly mtime: number;
  readonly content?: string;
  readonly contentAvailable: boolean;
  readonly resolvedOutgoing: readonly string[];
  readonly unresolvedLinks: readonly LocalUnresolvedLink[];
  readonly linksAvailable: boolean;
}

export interface LocalVaultSnapshot {
  readonly notes: readonly LocalNoteSnapshot[];
  readonly coverage: {
    readonly noteListComplete: boolean;
    readonly contentComplete: boolean;
    readonly linksComplete: boolean;
  };
  readonly diagnostics: readonly AnalyzerDiagnostic[];
  readonly diagnosticsTruncated: number;
}

/** Frozen adjacency arrays; all graph users share the same edge/degree semantics. */
export interface LocalNoteGraph {
  readonly paths: readonly string[];
  readonly outgoing: Readonly<Record<string, readonly string[]>>;
  readonly incoming: Readonly<Record<string, readonly string[]>>;
  readonly complete: boolean;
}

export interface LocalAnalysisContext {
  readonly snapshot: LocalVaultSnapshot;
  readonly graph: LocalNoteGraph;
}

export interface LocalScanAnalysis {
  revision: LocalVaultRevision;
  notesSeen: number;
  analyzerVersions: Record<string, string>;
  results: AnalyzerResult[];
  diagnostics: AnalyzerDiagnostic[];
  diagnosticsTruncated: number;
}
