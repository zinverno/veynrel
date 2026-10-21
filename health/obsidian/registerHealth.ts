import { WorkbenchData } from "../workbench/workbenchData";
import type { PairReviewPort } from "../workbench/workbenchData";
import { ConnectionComparisonController } from "../connections/connectionComparisonController";
import type { SemanticGlobalMapPort } from "../semanticGlobalMapPort";
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
import type { ConnectPort } from "../connectPort";
import type { RecallAuthoringPort } from "../../recall/product/recallAuthoringPort";
import type { VeynrelToolsPort } from "../toolsPort";
import { createObsidianVaultTopology } from "../topology/obsidianVaultTopology";

import type { SemanticNeighborhoodPort } from "../semanticNeighborhoodPort";

export function registerHealth(plugin: Plugin, tools: VeynrelToolsPort, preferences: HealthPreferencesPort, semantic?: SemanticIntelligencePort,
  semanticAnalysis?: SemanticHealthAnalysisPort, deep?: DeepIntelligencePort, deepAnalysis?: DeepHealthAnalysisPort,
  createAuthoring?: (recall: RecallProductPort) => RecallAuthoringPort, connect?: ConnectPort, neighborhood?: SemanticNeighborhoodPort, globalMap?: SemanticGlobalMapPort, pairReview?: PairReviewPort): void {
  const recall = createObsidianRecallProduct(plugin.app, plugin.manifest.id, (path) => openHealthNote(plugin.app, path));
  const authoring = createAuthoring?.(recall);
  const topology = createObsidianVaultTopology(plugin.app);
  const createComparison = (map: SemanticGlobalMapPort): ConnectionComparisonController => new ConnectionComparisonController(map, topology);
  const comparison = globalMap ? createComparison(globalMap) : undefined;
  const controller = new HealthPluginController(plugin.app, plugin.manifest.id, preferences, semanticAnalysis, new RecallHealthAdapter(recall), deepAnalysis);
  plugin.registerView(VEYNREL_HEALTH_VIEW_TYPE, (leaf) => new VeynrelHealthView(leaf, controller, tools, semantic, recall, deep, authoring, connect, topology, neighborhood, globalMap, comparison, pairReview ? { pair: pairReview, create: scope => new WorkbenchData(scope, {
    topology, createSemantic: globalMap?.createScoped ? scope => globalMap.createScoped!(scope) : undefined, createComparison, duplicates: semanticAnalysis,
  }) } : undefined));
  plugin.register(() => comparison?.dispose());
  plugin.register(() => globalMap?.dispose());
  plugin.register(() => neighborhood?.dispose());
  plugin.register(() => topology.dispose());
  plugin.register(() => controller.dispose());
  plugin.register(() => recall.dispose());
  let opening: Promise<void> | undefined;
  const open = (): void => {
    opening ??= openHealthView(plugin.app.workspace).catch(() => { new Notice(t("@health.open-failed")); }).finally(() => { opening = undefined; });
  };
  plugin.addRibbonIcon("activity", t("@health.title"), open);
  plugin.addCommand({ id: "veynrel-open-health", name: t("@health.command"), callback: open });
}
