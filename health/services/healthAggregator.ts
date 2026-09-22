import type { HealthDimension } from "../domain/finding";
import type { DimensionHealth, HealthAggregationInput } from "./types";
import { LOCAL_HEALTH_ANALYZERS } from "../analyzers/local/registry";

export function aggregateHealth(input: HealthAggregationInput): {
  dimensions: Record<HealthDimension, DimensionHealth>; openFindings: number; newFindings: number;
} {
  const { lastLocalScan: scan, reconciled } = input;
  const open = input.findings.filter((finding) => finding.state === "open");
  // Unknown/subset/older analyzer registries cannot prove full basic absence.
  const complete = reconciled && scan?.status === "completed" &&
    LOCAL_HEALTH_ANALYZERS.every((analyzer) => scan.analyzerVersions[analyzer.id] === analyzer.version);
  const dimension = (id: HealthDimension): DimensionHealth => {
    const findings = open.filter((finding) => finding.dimension === id);
    const attentionFindings = findings.filter((finding) => finding.impact === "attention").length;
    const reviewFindings = findings.filter((finding) => finding.impact === "review").length;
    const enabled = id === "structure" || id === "connections";
    return {
      state: !enabled ? "unknown" : attentionFindings ? "needs-attention" : reviewFindings ? "review-recommended" : complete ? "good" : "unknown",
      analysisDepth: enabled && scan ? "basic" : "not-enabled",
      openFindings: findings.length, attentionFindings, reviewFindings,
      analysisComplete: enabled && complete,
    };
  };
  return { dimensions: { structure: dimension("structure"), connections: dimension("connections"), recall: dimension("recall"), knowledge: dimension("knowledge") },
    openFindings: open.length,
    newFindings: reconciled && scan && (scan.status === "completed" || scan.status === "partial")
      ? open.filter((finding) => finding.source === "local" && finding.firstSeenAt === scan.startedAt && finding.lastSeenAt === scan.startedAt).length : 0,
  };
}
