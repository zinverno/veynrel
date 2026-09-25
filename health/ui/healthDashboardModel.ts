import { dateLocale, t } from "../../i18n";
import type { HealthDimension } from "../domain/finding";
import type { ScanRun } from "../domain/scanRun";
import type { HealthControllerState } from "../obsidian/healthPluginController";
import type { LocalHealthScanOutcome } from "../services/types";

export type VaultPulseState = "unknown" | "good" | "review" | "attention" | "scanning";
export type HealthCoverage = "unknown" | "limited" | "complete" | "mixed";
export interface VaultPulseModel {
  state: VaultPulseState;
  label: string;
  coverage: HealthCoverage;
  coverageLabel: string;
  openFindings: number;
  findingsLabel: string;
  lastCheckedAt?: number;
  lastCheckedLabel: string;
}
export interface FindingsAreaModel {
  id: HealthDimension;
  label: string;
  total: number;
  attention: number;
  review: number;
  info: number;
  /** Relative to the largest current area. No minimum width or nonzero floor. */
  ratio: number;
  segments: Array<{ impact: "attention" | "review" | "info"; ratio: number }>;
  breakdownLabel: string;
}
export interface DashboardMetric { value: number; label: string }
export interface DashboardPanelModel { metrics: DashboardMetric[]; detail: string; note?: string }
export interface HealthDashboardModel {
  pulse: VaultPulseModel;
  findingsBreakdown: FindingsAreaModel[];
  localScan: DashboardPanelModel;
  recall: DashboardPanelModel;
  knowledge: DashboardPanelModel;
}

export const HEALTH_AREAS: readonly HealthDimension[] = ["structure", "connections", "recall", "knowledge"];

function localDateTime(at: number): string {
  return new Intl.DateTimeFormat(dateLocale(), { dateStyle: "medium", timeStyle: "short" }).format(at);
}
function committed(scan?: ScanRun, reconciled = false): boolean {
  return reconciled && (scan?.status === "completed" || scan?.status === "partial");
}
function limitedOutcome(outcome?: LocalHealthScanOutcome): boolean {
  return Boolean(outcome && (outcome.scan.status !== "completed" || !outcome.findingsCommitted || outcome.freshness !== "verified"));
}
function metric(value: number, key: string): DashboardMetric { return { value, label: t(`@dashboard.${key}`) }; }

/** Cached product data only. This projection neither measures the vault nor changes Health aggregation. */
export function healthDashboardModel(state: HealthControllerState): HealthDashboardModel {
  const snapshot = state.snapshot;
  const local = snapshot?.lastLocalScan;
  const semantic = snapshot?.lastSemanticScan;
  const deep = snapshot?.lastDeepScan;
  const recall = snapshot?.recall;
  const localTrusted = committed(local, snapshot?.lastLocalScanReconciled);
  const semanticTrusted = committed(semantic, snapshot?.lastSemanticScanReconciled);
  const deepTrusted = committed(deep, snapshot?.lastDeepScanReconciled);
  const recallReady = recall?.loadState === "ready" && !recall.firstRun;
  const dimensions = HEALTH_AREAS.map((id) => {
    const dimension = snapshot?.dimensions[id];
    const enabled = id === "structure" || id === "connections" || (id === "recall"
      ? Boolean(recallReady || recall && ["invalid", "unsupported", "unavailable"].includes(recall.loadState))
      : dimension?.analysisDepth === "deep" || Boolean(dimension?.openFindings));
    const established = id === "recall" ? recallReady : id === "knowledge" ? deepTrusted
      : localTrusted && (id !== "connections" || dimension?.analysisDepth !== "semantic" || semanticTrusted);
    const limited = id === "recall" ? false : id === "knowledge" ? limitedOutcome(state.deepOutcome) || state.deepError
      : limitedOutcome(state.outcome) || state.error === "scan" || (id === "connections" && (limitedOutcome(state.semanticOutcome) || state.semanticError));
    return { enabled, established, state: dimension?.state ?? "unknown",
      complete: Boolean(established && dimension?.analysisComplete && !limited) };
  });
  const enabled = dimensions.filter((dimension) => dimension.enabled);
  const complete = enabled.filter((dimension) => dimension.complete).length;
  const coverage: HealthCoverage = complete === enabled.length && complete > 0 ? "complete" : complete > 0 ? "mixed"
    : enabled.some((dimension) => dimension.established) ? "limited" : "unknown";
  const running = snapshot?.localScanRunning || snapshot?.semanticScanRunning || snapshot?.deepScanRunning ||
    state.semanticScanRunning || state.deepScanRunning;
  const pulseState: VaultPulseState = running ? "scanning" : dimensions.some((d) => d.state === "needs-attention") ? "attention"
    : dimensions.some((d) => d.state === "review-recommended") ? "review"
      : enabled.length > 0 && enabled.every((d) => d.complete && d.state === "good") ? "good" : "unknown";
  const checked = [[local, localTrusted], [semantic, semanticTrusted], [deep, deepTrusted]] as const;
  const times = checked.flatMap(([scan, trusted]) => trusted && scan?.completedAt !== undefined ? [scan.completedAt] : []);
  const lastCheckedAt = times.length ? Math.max(...times) : undefined;
  const openFindings = snapshot?.openFindings ?? 0;
  const maximum = Math.max(0, ...HEALTH_AREAS.map((id) => snapshot?.dimensions[id].openFindings ?? 0));
  const findingsBreakdown = HEALTH_AREAS.map((id): FindingsAreaModel => {
    const dimension = snapshot?.dimensions[id];
    const total = dimension?.openFindings ?? 0;
    const attention = dimension?.attentionFindings ?? 0;
    const review = dimension?.reviewFindings ?? 0;
    const info = Math.max(0, total - attention - review);
    return { id, label: t(`@health.${id}`), total, attention, review, info,
      ratio: maximum ? total / maximum : 0,
      segments: (["attention", "review", "info"] as const).map((impact) => ({ impact,
        ratio: maximum ? ({ attention, review, info })[impact] / maximum : 0 })),
      breakdownLabel: t("@dashboard.breakdown", { attention, review, info }) };
  });
  const knowledge = snapshot?.dimensions.knowledge;
  const knowledgeMetrics = deepTrusted && deep ? [metric(deep.notesSeen, "notes-analyzed")] : [];
  if (knowledge && (deepTrusted || knowledge.openFindings > 0)) knowledgeMetrics.push(metric(knowledge.openFindings, "needs-review"));
  return {
    pulse: { state: pulseState, label: t(`@dashboard.pulse.${pulseState}`), coverage, coverageLabel: t(`@dashboard.coverage.${coverage}`),
      openFindings, findingsLabel: openFindings ? t("@health.open-findings", { n: openFindings }) : t("@dashboard.no-findings"),
      lastCheckedAt, lastCheckedLabel: lastCheckedAt === undefined ? t("@dashboard.no-check")
        : t("@dashboard.last-checked", { time: localDateTime(lastCheckedAt) }) },
    findingsBreakdown,
    localScan: { metrics: local ? [metric(local.notesSeen, "notes-checked"), metric(local.findingsCreated, "new"),
      metric(local.findingsUpdated, "updated"), metric(local.findingsResolved, "resolved")] : [],
      detail: local ? [t(`@dashboard.scan.${local.status}`), local.completedAt === undefined ? "" : localDateTime(local.completedAt)].filter(Boolean).join(" · ") : t("@dashboard.no-check"),
      note: t("@dashboard.local-private") },
    recall: { metrics: recallReady && recall ? [metric(recall.due, "due"), metric(recall.active, "active"), metric(recall.new, "new")] : [],
      detail: recallReady && recall ? recall.nextDueAt === undefined ? t("@dashboard.no-next-review")
        : t("@dashboard.next-review", { time: localDateTime(recall.nextDueAt) })
        : t(recall?.loadState === "unavailable" ? "@health.recall-unavailable"
          : recall?.loadState === "invalid" || recall?.loadState === "unsupported" ? "@recall.recovery-title" : "@dashboard.recall-disabled"),
      note: recallReady ? t("@health.recall-tracked") : undefined },
    knowledge: { metrics: knowledgeMetrics, detail: deepTrusted ? `${t("@health.deep")} · ${t(knowledge?.analysisComplete ? "@dashboard.complete" : "@dashboard.incomplete")}`
      : t("@dashboard.knowledge-unchecked") },
  };
}
