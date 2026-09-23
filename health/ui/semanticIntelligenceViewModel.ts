import { t } from "../../i18n";
import type { SemanticIntelligenceSnapshot, SemanticSetupMode, SemanticSetupResult } from "../semanticIntelligencePort";

export type SemanticAction = "enable" | "change" | "check" | "build" | "rebuild" | "search";

export function semanticSetupCopy(mode: SemanticSetupMode): { title: string; provider: string; privacy: string } {
  return { title: t(`@semantic.mode.${mode}`), provider: t(`@semantic.provider.${mode}`), privacy: t(`@semantic.privacy.${mode}`) };
}

export function semanticSetupError(result: SemanticSetupResult | undefined, mode: SemanticSetupMode): string | undefined {
  if (!result || result.ok) return undefined;
  return t(result.reason === "connection" && mode === "local" ? "@semantic.local-failed" : `@semantic.error.${result.reason}`);
}

export function semanticIntelligenceViewModel(snapshot: SemanticIntelligenceSnapshot, connected = false) {
  const mode = snapshot.provider === "ollama" ? "local" : snapshot.provider === "openrouter" ? "cloud" : "custom";
  const indexRequired = snapshot.state === "configured" && (snapshot.indexRequired || connected);
  const state = indexRequired ? "index-required" : snapshot.state;
  const actions: SemanticAction[] = snapshot.state === "disabled" ? ["enable"]
    : snapshot.state === "ready" ? ["search", "change"]
    : snapshot.state === "incompatible" ? ["rebuild", "change"]
    : snapshot.state === "error" ? ["check", "change"]
    : snapshot.state === "configured" ? indexRequired ? ["build", "change"] : ["check", "build", "change"] : [];
  const working = snapshot.operation === "connect" ? "@semantic.connecting"
    : snapshot.operation === "build" || snapshot.operation === "rebuild" ? "@semantic.building" : "@semantic.working";
  return {
    title: t("@semantic.title"), status: t(snapshot.busy ? working : `@semantic.state.${state}`),
    description: t(`@semantic.description.${state}`),
    details: snapshot.enabled ? `${mode === "custom" ? t("@semantic.mode.custom") : snapshot.providerLabel} · ${snapshot.model}` : undefined,
    vectors: snapshot.state === "ready" ? t("@semantic.vectors", { n: snapshot.vectorCount }) : undefined,
    privacy: semanticSetupCopy(mode).privacy,
    actions: actions.map((action) => ({ id: action, label: t(`@semantic.action.${action}`) })),
  };
}
