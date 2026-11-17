import { t } from "../../i18n";
import type { VeynrelToolAction } from "../toolsPort";

export type CatalogPage = "recall" | "discover" | "connect" | "health" | "process" | "semantic";
interface CatalogItem { key: string; title: string; summary: string; description: string; effect: string; material: string; model?: string; icon: string; action?: VeynrelToolAction; page?: CatalogPage }
export function toolsViewModel() {
  const tool = (id: VeynrelToolAction, icon: string, effect: string): CatalogItem => ({ key: `tool-${id}`, action: id, icon, material: t(`@followup.material.${id}`),
    model: ["openAtomization", "openDeepAudit", "runLegacyVaultAudit"].includes(id) ? t("@followup.model.configured")
      : id === "generateMocs" ? t("@followup.model.mocs") : id === "openAskVault" ? t("@followup.model.ask")
      : id === "openTagTaxonomy" ? t("@followup.model.taxonomy") : undefined,
    title: t(`@tools.${id}`), summary: t(`@polish.tool.${id}`), description: t(`@tools.${id}.description`), effect: t(`@polish.effect.${effect}`) });
  const page = (id: CatalogPage, icon: string, effect: string): CatalogItem => ({ key: `tools-${id}`, page: id, icon, material: t(`@followup.material.${id}`),
    model: id === "process" ? t("@followup.model.batch") : id === "recall" ? t("@followup.model.recall") : undefined,
    title: t(`@polish.catalog.${id}`), summary: t(`@polish.catalog.${id}.summary`), description: t(`@polish.catalog.${id}.details`), effect: t(`@polish.effect.${effect}`) });
  return {
    title: t("@workspace.tools"), description: t("@polish.catalog.description"),
    groups: [
      { title: t("@polish.group.process"), tools: [page("process", "layers", "preview"), tool("openAtomization", "git-fork", "preview"), tool("generateMocs", "network", "write")] },
      { title: t("@polish.group.explore"), tools: [tool("openDeepAudit", "scan-text", "audit"), tool("openAskVault", "messages-square", "model"), page("discover", "search", "index")] },
      { title: t("@polish.group.check"), tools: [page("health", "list-checks", "local"), tool("runLegacyVaultAudit", "chart-no-axes-combined", "write")] },
      { title: t("@polish.group.organize"), tools: [tool("openTagTaxonomy", "tags", "local"), tool("openOperationHistory", "history", "journal"), page("connect", "plug", "proposals"), page("recall", "gallery-vertical-end", "cards")] },
    ],
    editor: { title: t("@tools.editor"), description: t("@tools.editor.description"),
      items: Object.entries({ write: "pen-line", selection: "text-select", "vault-write": "library", dataview: "table", atomize: "git-fork" }).map(([id, icon]) => ({
        id, icon, material: t("@followup.material.editor"), effect: t("@polish.effect.editor"), title: t(`@tools.editor.${id}`), description: t(`@tools.editor.${id}.description`), instructions: t(`@polish.editor.${id}`),
      })) },
  };
}
