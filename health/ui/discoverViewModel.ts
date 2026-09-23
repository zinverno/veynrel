import { t } from "../../i18n";
import type { SemanticIntelligenceSnapshot } from "../semanticIntelligencePort";
import { semanticIntelligenceViewModel } from "./semanticIntelligenceViewModel";
import type { SemanticAction } from "./semanticIntelligenceViewModel";
import type { HealthControllerState } from "../obsidian/healthPluginController";

export type DiscoverAction = SemanticAction | "related" | "duplicates" | "semantic-duplicates";

/** Cached capability presentation only. The semantic port remains authoritative for readiness. */
export function discoverViewModel(snapshot?: SemanticIntelligenceSnapshot, health?: HealthControllerState) {
  const capability = snapshot && semanticIntelligenceViewModel(snapshot);
  const state = snapshot?.state ?? "disabled";
  const workflows = state === "ready" ? (["search", "related", "duplicates"] as const).map((id) => ({
    id, label: t(`@discover.${id}`), description: t(`@discover.${id}-description`),
  })) : [];
  const outcome = health?.semanticOutcome;
  const healthStatus = health?.semanticScanRunning ? t("@semantic-health.checking")
    : health?.semanticError || outcome?.scan.status === "failed" ? t("@semantic-health.failed")
    : outcome?.findingsCommitted && !outcome.historyRecorded ? t("@health.history-unsaved")
    : outcome ? t(outcome.scan.status === "partial" ? "@semantic-health.partial" : "@semantic-health.completed") : undefined;
  return {
    state, busy: snapshot?.busy ?? false, title: t("@discover.title"), introduction: t("@discover.introduction"),
    capabilityTitle: t("@semantic.title"),
    status: state === "disabled" ? t("@discover.required") : capability!.status,
    description: state === "disabled" ? t("@discover.disabled") : capability!.description,
    details: capability?.details, vectors: capability?.vectors, workflows,
    exploreTitle: t("@discover.explore"), healthStatus,
    healthAnalysis: state === "ready" ? { title: t("@semantic-health.title"), description: t("@semantic-health.description"),
      label: t(health?.semanticScanRunning ? "@semantic-health.checking" : "@semantic-health.check"),
      disabled: Boolean(health?.busy) || !health?.snapshot?.initialization.findingsWritable } : undefined,
    actions: state === "ready" ? [] : capability?.actions ?? [{ id: "enable" as const, label: t("@semantic.action.enable") }],
  };
}

export type DiscoverViewModel = ReturnType<typeof discoverViewModel>;
