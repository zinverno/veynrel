import { t } from "../../i18n";
import type { HealthDimension } from "../domain/finding";
import type { HealthControllerState } from "../obsidian/healthPluginController";
import type { HealthRecoveryScope } from "../obsidian/healthRecovery";
import type { VaultProfile } from "../domain/profile";
import { findingPresentation } from "./findingPresentation";

export interface HealthCardModel {
  id: HealthDimension; title: string; state: string; count: string; depth: string; icon: string; actionable: boolean;
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
}

const dimensions: HealthDimension[] = ["structure", "connections", "recall", "knowledge"];
const icons = { structure: "network", connections: "link", recall: "history", knowledge: "book-open" };

export function healthHomeViewModel(state: HealthControllerState, canOpenNote = false): HealthHomeViewModel {
  const { snapshot, outcome } = state;
  const initial = !snapshot?.lastLocalScan;
  const limited = outcome?.scan.status === "partial" || outcome?.scan.status === "failed" || state.error === "scan";
  const cards = snapshot ? dimensions.map((id): HealthCardModel => {
    const card = snapshot.dimensions[id];
    const enabled = id === "structure" || id === "connections";
    const complete = card.analysisComplete && !limited;
    const healthState = card.state === "good" && !complete ? "unknown" : card.state;
    return { id, title: t(`@health.${id}`), state: t(enabled ? `@health.state.${healthState}` : "@health.not-enabled"),
      count: enabled ? t("@health.findings", { n: card.openFindings }) : "",
      depth: enabled && (card.analysisDepth === "basic" || card.analysisDepth === "semantic")
        ? t(`@health.${card.analysisDepth}${complete ? "" : "-incomplete"}`) : "",
      icon: icons[id], actionable: enabled || card.openFindings > 0 };
  }) : [];
  let status: string | undefined;
  if (state.recovering) status = t("@health.recovering");
  else if (state.semanticScanRunning) status = t("@semantic-health.checking");
  else if (state.busy) status = t("@health.checking");
  else if (state.error) status = t(`@health.error.${state.error}`);
  else if (outcome?.findingsCommitted && !outcome.historyRecorded) status = t("@health.history-unsaved");
  else if (outcome?.freshness === "stale") status = t("@health.stale");
  else if (outcome) status = t(`@health.outcome.${outcome.scan.status}`);
  const load = snapshot?.initialization;
  const scope = load && (!load.findingsWritable ? "all" : !load.historyWritable ? "history" : undefined);
  const inaccessible = load?.storage.findings === "unavailable" || load?.storage.scanRuns === "unavailable";
  return { initial, scanLabel: t(state.busy && !state.semanticScanRunning && !state.recovering && !state.mutatingFindingId ? "@health.checking" : state.error === "scan" || outcome?.scan.status === "failed"
    ? "@health.try-again" : initial ? "@health.scan" : "@health.scan-again"),
    scanDisabled: state.busy || !snapshot || !load?.findingsWritable,
    recoveryDisabled: state.busy,
    status, statusError: Boolean(state.error) || outcome?.scan.status === "failed",
    cards, count: t("@health.open-findings", { n: snapshot?.openFindings ?? 0 }),
    recommendation: snapshot?.recommendation ? { ...(state.recommendationFinding ? findingPresentation(state.recommendationFinding)
      : { title: snapshot.recommendation.title, explanation: snapshot.recommendation.explanation }), canOpenNote,
      ...(snapshot.recommendation.findingId ? { findingId: snapshot.recommendation.findingId } : {}) } : undefined,
    profile: state.preferences.onboardingCompleted ? { value: state.preferences.profile, saving: state.savingPreferences } : undefined,
    recovery: scope ? { scope, blocking: scope === "all", title: t(scope === "all" ? "@health.recovery-title" : "@health.history-title"),
      description: t(inaccessible ? "@health.inaccessible" : "@health.damaged") } : undefined,
  };
}
