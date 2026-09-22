import { t } from "../../i18n";
import type { HealthControllerState } from "../obsidian/healthPluginController";
import type { HealthHomeViewModel } from "./healthHomeViewModel";
import { healthHomeViewModel } from "./healthHomeViewModel";

export type HealthOnboardingViewModel =
  | { step: "recovery" | "profile" | "complete" }
  | { step: "scan"; scanLabel: string; status?: string }
  | { step: "result"; kind: "baseline" | "finding" | "review" | "limited"; title: string; explanation?: string;
    finding?: HealthHomeViewModel["recommendation"]; scanAgain: boolean };

/** Durable intent plus the backend's existing receipt/coverage semantics; no transient persistence. */
export function healthOnboardingViewModel(state: HealthControllerState, home = healthHomeViewModel(state)): HealthOnboardingViewModel {
  const { preferences, snapshot, outcome } = state;
  if (home.recovery || state.recovering) return { step: "recovery" };
  if (preferences.onboardingCompleted) return { step: "complete" };
  if (!preferences.profileChosen) return { step: "profile" };
  const scan = snapshot?.lastLocalScan;
  const usable = snapshot?.lastLocalScanReconciled && (scan?.status === "completed" || scan?.status === "partial") &&
    (!outcome || (outcome.scan.id === scan?.id && outcome.freshness === "verified" && outcome.findingsCommitted && outcome.scan.status !== "failed"));
  if (state.busy || state.error || !usable) return { step: "scan",
    scanLabel: t(state.busy ? "@health.checking" : scan || state.error || outcome ? "@health.scan-again" : "@health.scan"),
    status: home.status ?? (scan ? t(scan.status === "failed" ? "@health.outcome.failed" : "@health.onboarding.untrusted") : undefined),
  };
  const { structure, connections } = snapshot.dimensions;
  const complete = structure.analysisComplete && connections.analysisComplete && scan.status === "completed" &&
    (!outcome || outcome.scan.status === "completed");
  if (!complete) return { step: "result", kind: "limited", title: t("@health.onboarding.limited-title"),
    explanation: t("@health.onboarding.limited-description"), finding: home.recommendation, scanAgain: true };
  const reviewCount = Object.values(snapshot.dimensions).reduce((n, dimension) => n + dimension.attentionFindings + dimension.reviewFindings, 0);
  if (structure.state === "good" && connections.state === "good" && reviewCount === 0) {
    return { step: "result", kind: "baseline", title: t("@health.onboarding.baseline-title"),
      explanation: t("@health.onboarding.baseline-description"), scanAgain: false };
  }
  if (home.recommendation?.canOpenNote) return { step: "result", kind: "finding", title: t("@health.onboarding.found"),
    finding: home.recommendation, scanAgain: false };
  return { step: "result", kind: "review", title: t("@health.onboarding.review", { n: snapshot.openFindings }), scanAgain: false };
}
