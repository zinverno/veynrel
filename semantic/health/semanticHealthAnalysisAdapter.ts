import { canonicalFindingPaths, createFindingFingerprint } from "../../health/domain/identity";
import type { FindingCandidate } from "../../health/domain/finding";
import { isCancellation, throwIfAborted, withAbort } from "../../health/analyzers/local/cancellation";
import { SEMANTIC_DUPLICATES_ANALYZER, SemanticHealthAnalysisError } from "../../health/semanticHealthAnalysisPort";
import type { SemanticDuplicateAnalysis, SemanticHealthAnalysisPort, SemanticIndexRevision } from "../../health/semanticHealthAnalysisPort";
import type { SemanticDuplicatePair, SemanticIndexState } from "../types";

/** Mirrors the existing controller API limit, not a new discovery setting. */
const DISCOVERY_LIMIT = 100;
/** Structural subset of ObsidianSemanticController; no plugin-host dependency. */
interface DuplicateEngine {
  getCachedIndexState(): SemanticIndexState;
  findPotentialDuplicates(): Promise<SemanticDuplicatePair[]>;
}

function candidate(pair: SemanticDuplicatePair): FindingCandidate {
  if (!pair || !Number.isFinite(pair.score) || pair.score < -1 || pair.score > 1) {
    throw new SemanticHealthAnalysisError("semantic-analysis-failed");
  }
  const paths = canonicalFindingPaths([pair.leftPath, pair.rightPath]);
  if (paths.length !== 2) throw new SemanticHealthAnalysisError("semantic-analysis-failed");
  const identity = { source: "semantic", analyzerId: SEMANTIC_DUPLICATES_ANALYZER.id,
    dimension: "connections", type: "semantic-duplicate" } as const;
  return { ...identity, fingerprint: createFindingFingerprint({ ...identity, paths }), notePaths: paths,
    impact: "review", confidence: "high", title: "Possible semantic duplicate",
    explanation: "These notes are unusually similar in meaning.",
    evidence: [{ kind: "similarity-score", value: pair.score }], actions: [{ kind: "open-note", path: paths[0] }] };
}

/** No provider, vector-store or modal dependencies. No preview crosses this boundary. */
export class SemanticHealthAnalysisAdapter implements SemanticHealthAnalysisPort {
  constructor(private readonly engine: DuplicateEngine) {}

  async analyzeDuplicates(signal: AbortSignal): Promise<SemanticDuplicateAnalysis> {
    throwIfAborted(signal);
    try {
      const revision = this.captureReadyRevision();
      const pairs = await withAbort(this.engine.findPotentialDuplicates(), signal);
      await this.verifyCurrent(revision, signal);
      if (!Array.isArray(pairs) || pairs.length > DISCOVERY_LIMIT) throw new SemanticHealthAnalysisError("semantic-analysis-failed");
      const candidates = Array.from(pairs, candidate);
      // Reject the entire result, not a filtered subset that could falsely resolve absence.
      if (new Set(candidates.map((item) => item.fingerprint)).size !== candidates.length) {
        throw new SemanticHealthAnalysisError("semantic-analysis-failed");
      }
      return { revision, candidates, complete: pairs.length < DISCOVERY_LIMIT };
    } catch (error) {
      throwIfAborted(signal);
      if (isCancellation(error) || error instanceof SemanticHealthAnalysisError) throw error;
      throw new SemanticHealthAnalysisError("semantic-analysis-failed");
    }
  }

  async verifyCurrent(revision: SemanticIndexRevision, signal: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    let current: SemanticIndexRevision;
    try { current = this.captureReadyRevision(); }
    catch { throw new SemanticHealthAnalysisError("semantic-index-changed"); }
    if (current.vectorGeneration !== revision.vectorGeneration || current.vectorCount !== revision.vectorCount ||
        current.dimensions !== revision.dimensions || current.provider !== revision.provider || current.model !== revision.model ||
        current.configurationRevision !== revision.configurationRevision || current.runtimeRevision !== revision.runtimeRevision) {
      throw new SemanticHealthAnalysisError("semantic-index-changed");
    }
  }

  private captureReadyRevision(): SemanticIndexRevision {
    const state = this.engine.getCachedIndexState();
    if (state.kind !== "ready" || !Number.isSafeInteger(state.vectorCount) || state.vectorCount <= 0 ||
        !Number.isSafeInteger(state.dimensions) || state.dimensions <= 0 ||
        ![state.vectorGeneration, state.configurationRevision, state.runtimeRevision].every((n) => Number.isSafeInteger(n) && n >= 0) ||
        typeof state.provider !== "string" || !state.provider || typeof state.model !== "string" || !state.model) {
      throw new SemanticHealthAnalysisError("semantic-unavailable");
    }
    return { vectorGeneration: state.vectorGeneration, vectorCount: state.vectorCount, dimensions: state.dimensions,
      provider: state.provider, model: state.model, configurationRevision: state.configurationRevision, runtimeRevision: state.runtimeRevision };
  }
}
