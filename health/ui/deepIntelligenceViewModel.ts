import { t } from "../../i18n";
import type { DeepIntelligenceSnapshot, DeepProvider, DeepSetupResult } from "../deepIntelligencePort";
import type { HealthControllerState } from "../obsidian/healthPluginController";

export type DeepAction = "setup" | "change" | "check" | "knowledge";

export function canCheckKnowledge(snapshot: DeepIntelligenceSnapshot): boolean {
  return !snapshot.busy && (snapshot.state === "configured" || snapshot.state === "ready");
}

export function knowledgeScanStatus(state: HealthControllerState): string | undefined {
  if (state.deepScanRunning) return t("@knowledge.checking");
  if (state.deepError) return t("@knowledge.failed");
  if (state.deepCancelled) return t("@knowledge.cancelled");
  const outcome = state.deepOutcome;
  if (!outcome) return undefined;
  if (outcome.findingsCommitted && !outcome.historyRecorded) return t("@health.history-unsaved");
  if (outcome.freshness === "stale") return t("@knowledge.stale");
  if (outcome.scan.status === "failed") return t("@knowledge.failed");
  if (outcome.scan.status === "partial") return t("@knowledge.partial");
  return t(outcome.scan.notesSeen === 0 ? "@knowledge.empty" : "@knowledge.completed");
}

export function deepProviderKind(provider: DeepProvider): "local" | "cloud" | "custom" {
  return provider === "ollama" ? "local" : provider === "custom" ? "custom" : "cloud";
}

export function deepSetupError(result?: DeepSetupResult): string | undefined {
  return result && !result.ok ? t(`@deep.error.${result.reason}`) : undefined;
}

export function deepIntelligenceViewModel(snapshot: DeepIntelligenceSnapshot) {
  const actions: DeepAction[] = snapshot.state === "unconfigured" ? ["setup"] : ["check", "change"];
  if (canCheckKnowledge(snapshot)) actions.push("knowledge");
  return {
    title: t("@deep.title"),
    status: t(snapshot.busy ? snapshot.operation === "connect" ? "@deep.connecting" : "@deep.checking" : `@deep.state.${snapshot.state}`),
    description: t("@deep.description"),
    details: snapshot.state === "unconfigured" ? undefined : `${snapshot.provider === "custom" ? t("@deep.custom") : snapshot.providerLabel} · ${snapshot.model}`,
    actions: actions.map((id) => ({ id, label: t(`@deep.action.${id}`) })),
  };
}
