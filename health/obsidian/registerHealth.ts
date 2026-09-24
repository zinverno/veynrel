import { Notice } from "obsidian";
import type { Plugin } from "obsidian";
import { t } from "../../i18n";
import { HealthPluginController } from "./healthPluginController";
import { openHealthView, VEYNREL_HEALTH_VIEW_TYPE } from "./openHealthView";
import { VeynrelHealthView } from "../ui/VeynrelHealthView";
import type { HealthPreferencesPort } from "../preferences";
import type { SemanticIntelligencePort } from "../semanticIntelligencePort";
import type { SemanticHealthAnalysisPort } from "../semanticHealthAnalysisPort";
import type { DeepIntelligencePort } from "../deepIntelligencePort";
import type { DeepHealthAnalysisPort } from "../deepHealthAnalysisPort";
import { createObsidianRecallProduct } from "../../recall/product/obsidianRecallProduct";
import { RecallHealthAdapter } from "../../recall/product/recallHealthAdapter";
import { openHealthNote } from "./openHealthNote";
import type { RecallProductPort } from "../../recall/product/types";
import type { RecallAuthoringPort } from "../../recall/product/recallAuthoringPort";

export function registerHealth(plugin: Plugin, openTools: () => void, preferences: HealthPreferencesPort, semantic?: SemanticIntelligencePort,
  semanticAnalysis?: SemanticHealthAnalysisPort, deep?: DeepIntelligencePort, deepAnalysis?: DeepHealthAnalysisPort,
  createAuthoring?: (recall: RecallProductPort) => RecallAuthoringPort): void {
  const recall = createObsidianRecallProduct(plugin.app, plugin.manifest.id, (path) => openHealthNote(plugin.app, path));
  const authoring = createAuthoring?.(recall);
  const controller = new HealthPluginController(plugin.app, plugin.manifest.id, preferences, semanticAnalysis, new RecallHealthAdapter(recall), deepAnalysis);
  plugin.registerView(VEYNREL_HEALTH_VIEW_TYPE, (leaf) => new VeynrelHealthView(leaf, controller, openTools, semantic, recall, deep, authoring));
  plugin.register(() => controller.dispose());
  plugin.register(() => recall.dispose());
  let opening: Promise<void> | undefined;
  const open = (): void => {
    opening ??= openHealthView(plugin.app.workspace).catch(() => { new Notice(t("@health.open-failed")); }).finally(() => { opening = undefined; });
  };
  plugin.addRibbonIcon("activity", t("@health.title"), open);
  plugin.addCommand({ id: "veynrel-open-health", name: t("@health.command"), callback: open });
}
