import type { HealthDimension } from "../domain/finding";
import type { DimensionHealth, HealthAggregationInput } from "./types";
import { LOCAL_HEALTH_ANALYZERS } from "../analyzers/local/registry";
import { SEMANTIC_DUPLICATES_ANALYZER } from "../semanticHealthAnalysisPort";
import { reconciliationOwnerKey } from "../domain/reconciliation";

export function aggregateHealth(input: HealthAggregationInput): {
  dimensions: Record<HealthDimension, DimensionHealth>; openFindings: number; newFindings: number;
} {
  const { lastLocalScan: scan, reconciled } = input;
  const open = input.findings.filter((finding) => finding.state === "open");
  // Unknown/subset/older analyzer registries cannot prove full basic absence.
  const complete = reconciled && scan?.status === "completed" &&
    LOCAL_HEALTH_ANALYZERS.every((analyzer) => scan.analyzerVersions[analyzer.id] === analyzer.version);
  const semanticScan = input.lastSemanticScan;
  const semanticAnalyzed = input.semanticReconciled && semanticScan?.type === "semantic" &&
    (semanticScan.status === "completed" || semanticScan.status === "partial") &&
    semanticScan.analyzerVersions[SEMANTIC_DUPLICATES_ANALYZER.id] === SEMANTIC_DUPLICATES_ANALYZER.version &&
    semanticScan.reconciliationReceipts[reconciliationOwnerKey("semantic", SEMANTIC_DUPLICATES_ANALYZER.id)] !== undefined;
  const dimension = (id: HealthDimension): DimensionHealth => {
    const findings = open.filter((finding) => finding.dimension === id);
    const attentionFindings = findings.filter((finding) => finding.impact === "attention").length;
    const reviewFindings = findings.filter((finding) => finding.impact === "review").length;
    const enabled = id === "structure" || id === "connections";
    const semantic = id === "connections" && semanticAnalyzed;
    const dimensionComplete = complete && (!semantic || semanticScan?.status === "completed");
    return {
      state: !enabled ? "unknown" : attentionFindings ? "needs-attention" : reviewFindings ? "review-recommended" : dimensionComplete ? "good" : "unknown",
      analysisDepth: semantic ? "semantic" : enabled && scan ? "basic" : "not-enabled",
      openFindings: findings.length, attentionFindings, reviewFindings,
      analysisComplete: enabled && dimensionComplete,
    };
  };
  return { dimensions: { structure: dimension("structure"), connections: dimension("connections"), recall: dimension("recall"), knowledge: dimension("knowledge") },
    openFindings: open.length,
    newFindings: reconciled && scan && (scan.status === "completed" || scan.status === "partial")
      ? open.filter((finding) => finding.source === "local" && finding.firstSeenAt === scan.startedAt && finding.lastSeenAt === scan.startedAt).length : 0,
  };
}
