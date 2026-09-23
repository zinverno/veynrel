import { t } from "../../i18n";
import type { SemanticIntelligenceSnapshot } from "../semanticIntelligencePort";
import { semanticIntelligenceViewModel } from "./semanticIntelligenceViewModel";
import type { SemanticAction } from "./semanticIntelligenceViewModel";

export type DiscoverAction = SemanticAction | "related" | "duplicates";

/** Cached capability presentation only. The semantic port remains authoritative for readiness. */
export function discoverViewModel(snapshot?: SemanticIntelligenceSnapshot) {
  const capability = snapshot && semanticIntelligenceViewModel(snapshot);
  const state = snapshot?.state ?? "disabled";
  const workflows = state === "ready" ? (["search", "related", "duplicates"] as const).map((id) => ({
    id, label: t(`@discover.${id}`), description: t(`@discover.${id}-description`),
  })) : [];
  return {
    state, busy: snapshot?.busy ?? false, title: t("@discover.title"), introduction: t("@discover.introduction"),
    capabilityTitle: t("@semantic.title"),
    status: state === "disabled" ? t("@discover.required") : capability!.status,
    description: state === "disabled" ? t("@discover.disabled") : capability!.description,
    details: capability?.details, vectors: capability?.vectors, workflows,
    actions: state === "ready" ? [] : capability?.actions ?? [{ id: "enable" as const, label: t("@semantic.action.enable") }],
  };
}

export type DiscoverViewModel = ReturnType<typeof discoverViewModel>;
