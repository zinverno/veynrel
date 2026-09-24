import { t } from "../../i18n";
import type { DeepIntelligenceSnapshot } from "../deepIntelligencePort";
import type { SemanticIntelligenceSnapshot } from "../semanticIntelligencePort";
import type { ConnectSnapshot } from "../connectPort";
import { deepIntelligenceViewModel } from "./deepIntelligenceViewModel";
import { semanticIntelligenceViewModel } from "./semanticIntelligenceViewModel";
import { connectViewModel } from "./connectViewModel";

export type ProductSettingsAction = "deep" | "semantic" | "connect";
interface SettingsSummary { id: ProductSettingsAction; title: string; status: string; details?: string; vectors?: string; label: string; disabled: boolean }

/** Project only safe display fields; never carry settings objects or setup drafts into the overview. */
export function settingsViewModel(deep?: DeepIntelligenceSnapshot, semantic?: SemanticIntelligenceSnapshot, connect?: ConnectSnapshot) {
  const summaries: SettingsSummary[] = [];
  if (deep) {
    const model = deepIntelligenceViewModel(deep);
    summaries.push({ id: "deep", title: model.title, status: model.status, details: model.details,
      label: t(deep.state === "unconfigured" ? "@settings.configure" : "@settings.change"), disabled: deep.busy });
  }
  if (semantic) {
    const model = semanticIntelligenceViewModel(semantic);
    summaries.push({ id: "semantic", title: model.title, status: model.status, details: model.details, vectors: model.vectors,
      label: t(semantic.enabled ? "@settings.change" : "@settings.configure"), disabled: semantic.busy });
  }
  if (connect) summaries.push({ id: "connect", title: t("@connect.title"), status: connectViewModel(connect).status,
    label: t("@settings.open-connect"), disabled: false });
  return { title: t("@settings.title"), description: t("@settings.description"), summaries,
    recall: { title: t("@recall.title"), status: t("@settings.recall.status"), description: t("@settings.recall.description") },
    advanced: { title: t("@settings.advanced"), description: t("@settings.advanced.description"), instructions: t("@settings.advanced.instructions") },
  };
}
