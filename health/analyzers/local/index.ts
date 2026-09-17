export type { HealthAnalyzer, AnalyzerResult, AnalyzerDiagnostic } from "../types";
export type { LocalNoteSnapshot, LocalUnresolvedLink, LocalVaultSnapshot, LocalNoteGraph, LocalAnalysisContext, LocalScanAnalysis } from "./types";
export type { LocalVaultSource, LocalVaultScope } from "./localVaultSource";
export { defaultLocalVaultScope } from "./localVaultSource";
// Import the Obsidian adapter directly; this entrypoint stays runnable without Obsidian.
export type { ObsidianLocalVaultApp } from "./obsidianLocalVaultSource";
export { LocalScanCoordinator } from "./localScanCoordinator";
export { LOCAL_HEALTH_ANALYZERS } from "./registry";
export { createLocalAnalysisContext } from "./localNoteGraph";
export { LocalAnalysisCancelledError } from "./cancellation";
export { NEAR_EMPTY_MEANINGFUL_CHARACTERS } from "./content";
