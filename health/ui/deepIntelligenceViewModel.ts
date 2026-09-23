import { t } from "../../i18n";
import type { DeepIntelligenceSnapshot, DeepProvider, DeepSetupResult } from "../deepIntelligencePort";

export type DeepAction = "setup" | "change" | "check";

export function deepProviderKind(provider: DeepProvider): "local" | "cloud" | "custom" {
  return provider === "ollama" ? "local" : provider === "custom" ? "custom" : "cloud";
}

export function deepSetupError(result?: DeepSetupResult): string | undefined {
  return result && !result.ok ? t(`@deep.error.${result.reason}`) : undefined;
}

export function deepIntelligenceViewModel(snapshot: DeepIntelligenceSnapshot) {
  const actions: DeepAction[] = snapshot.state === "unconfigured" ? ["setup"] : ["check", "change"];
  return {
    title: t("@deep.title"),
    status: t(snapshot.busy ? snapshot.operation === "connect" ? "@deep.connecting" : "@deep.checking" : `@deep.state.${snapshot.state}`),
    description: t("@deep.description"),
    details: snapshot.state === "unconfigured" ? undefined : `${snapshot.provider === "custom" ? t("@deep.custom") : snapshot.providerLabel} · ${snapshot.model}`,
    actions: actions.map((id) => ({ id, label: t(`@deep.action.${id}`) })),
  };
}
