import { currentLanguage, t } from "../../i18n";
import type { HealthDimension } from "../domain/finding";
import type { HealthControllerState } from "../obsidian/healthPluginController";
import type { HealthRecoveryScope } from "../obsidian/healthRecovery";
import type { VaultProfile } from "../domain/profile";
import { findingPresentation } from "./findingPresentation";
import { healthDashboardModel } from "./healthDashboardModel";
import type { HealthDashboardModel } from "./healthDashboardModel";
import type { HealthState } from "../domain/healthState";

export interface HealthCardModel {
  id: HealthDimension; title: string; state: string; count: string; depth: string; icon: string;
  action: "findings" | "recall" | "none";
  description?: string;
  signal: HealthState;
  complete: boolean;
  metric?: { value: number; label: string };
}
export interface HealthHomeViewModel {
  initial: boolean;
  scanLabel: string;
  scanDisabled: boolean;
  recoveryDisabled: boolean;
  status?: string;
  statusError: boolean;
  cards: HealthCardModel[];
  count: string;
  recommendation?: { title: string; explanation: string; canOpenNote: boolean; findingId?: string };
  recovery?: { scope: HealthRecoveryScope; title: string; description: string; blocking: boolean };
  profile?: { value: VaultProfile; saving: boolean };
  dashboard: HealthDashboardModel;
}

const dimensions: HealthDimension[] = ["structure", "connections", "recall", "knowledge"];
const icons = { structure: "network", connections: "link", recall: "history", knowledge: "book-open" };

export function healthHomeViewModel(state: HealthControllerState, canOpenNote = false): HealthHomeViewModel {
  const { snapshot, outcome } = state;
  const initial = !snapshot?.lastLocalScan;
  const limited = outcome?.scan.status === "partial" || outcome?.scan.status === "failed" || state.error === "scan";
  const cards = snapshot ? dimensions.map((id): HealthCardModel => {
    const card = snapshot.dimensions[id];
    const recall = snapshot.recall;
    if (id === "recall" && recall) {
      const ready = card.analysisComplete;
      const blocked = recall.loadState === "invalid" || recall.loadState === "unsupported" || recall.loadState === "unavailable";
      const active = t(`@health.recall-active.${new Intl.PluralRules(currentLanguage()).select(recall.active)}`, { n: recall.active });
      return { id, title: t("@health.recall"), icon: icons.recall, action: "recall",
        signal: card.state, complete: ready,
        metric: ready ? { value: recall.due, label: t("@dashboard.due") } : undefined,
        state: blocked ? t(recall.loadState === "unavailable" ? "@health.recall-unavailable" : "@recall.recovery-title")
          : !ready ? t("@health.not-enabled") : recall.active === 0 ? t("@health.recall-empty")
            : t(card.state === "review-recommended" ? "@health.recall-review" : `@health.state.${card.state}`),
        count: ready ? `${t("@health.recall-due", { n: recall.due })} · ${active}` : "",
        depth: ready ? t("@health.recall-native") : "",
        description: blocked ? t("@health.recall-open") : ready ? t("@health.recall-tracked") : t("@health.recall-setup"),
      };
    }
    const knowledge = id === "knowledge";
    const enabled = id === "structure" || id === "connections" || knowledge && (card.analysisDepth === "deep" || card.openFindings > 0);
    const complete = card.analysisComplete && (knowledge || !limited);
    const healthState = card.state === "good" && !complete ? "unknown" : card.state;
    const emptyKnowledge = knowledge && complete && snapshot.lastDeepScan?.notesSeen === 0;
    return { id, title: t(`@health.${id}`), state: t(emptyKnowledge ? "@knowledge.empty" : enabled ? `@health.state.${healthState}` : "@health.not-enabled"),
      signal: healthState, complete,
      metric: enabled ? { value: card.openFindings, label: t("@dashboard.findings") } : undefined,
      count: enabled ? t("@health.findings", { n: card.openFindings }) : "",
      depth: enabled && (card.analysisDepth === "basic" || card.analysisDepth === "semantic" || card.analysisDepth === "deep")
        ? t(`@health.${card.analysisDepth}${complete ? "" : "-incomplete"}`) : "",
      icon: icons[id], action: enabled || card.openFindings > 0 ? "findings" : "none" };
  }) : [];
  let status: string | undefined;
  if (state.recovering) status = t("@health.recovering");
  else if (state.deepScanRunning) status = t("@knowledge.checking");
  else if (state.semanticScanRunning) status = t("@semantic-health.checking");
  else if (state.busy) status = t("@health.checking");
  else if (state.error) status = t(`@health.error.${state.error}`);
  else if (outcome?.findingsCommitted && !outcome.historyRecorded) status = t("@health.history-unsaved");
  else if (outcome?.freshness === "stale") status = t("@health.stale");
  else if (outcome) status = t(`@health.outcome.${outcome.scan.status}`);
  const load = snapshot?.initialization;
  const scope = load && (!load.findingsWritable ? "all" : !load.historyWritable ? "history" : undefined);
  const inaccessible = load?.storage.findings === "unavailable" || load?.storage.scanRuns === "unavailable";
  return { initial, scanLabel: t(state.busy && !state.semanticScanRunning && !state.deepScanRunning && !state.recovering && !state.mutatingFindingId ? "@health.checking" : state.error === "scan" || outcome?.scan.status === "failed"
    ? "@health.try-again" : initial ? "@health.scan" : "@health.scan-again"),
    scanDisabled: state.busy || !snapshot || !load?.findingsWritable,
    recoveryDisabled: state.busy,
    status, statusError: Boolean(state.error) || outcome?.scan.status === "failed",
    cards, count: t("@health.open-findings", { n: snapshot?.openFindings ?? 0 }), dashboard: healthDashboardModel(state),
    recommendation: snapshot?.recommendation ? { ...(state.recommendationFinding ? findingPresentation(state.recommendationFinding)
      : { title: snapshot.recommendation.title, explanation: snapshot.recommendation.explanation }), canOpenNote,
      ...(snapshot.recommendation.findingId ? { findingId: snapshot.recommendation.findingId } : {}) } : undefined,
    profile: state.preferences.onboardingCompleted ? { value: state.preferences.profile, saving: state.savingPreferences } : undefined,
    recovery: scope ? { scope, blocking: scope === "all", title: t(scope === "all" ? "@health.recovery-title" : "@health.history-title"),
      description: t(inaccessible ? "@health.inaccessible" : "@health.damaged") } : undefined,
  };
}
