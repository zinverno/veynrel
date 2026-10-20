import { t } from "../../i18n";
import type { VeynrelToolAction } from "../toolsPort";

export type CatalogPage = "recall" | "discover" | "connect" | "health";
interface CatalogItem { key: string; title: string; summary: string; description: string; effect: string; icon: string; action?: VeynrelToolAction; page?: CatalogPage }
export function toolsViewModel() {
  const tool = (id: VeynrelToolAction, icon: string, effect: string): CatalogItem => ({ key: `tool-${id}`, action: id, icon,
    title: t(`@tools.${id}`), summary: t(`@polish.tool.${id}`), description: t(`@tools.${id}.description`), effect: t(`@polish.effect.${effect}`) });
  const page = (id: CatalogPage, icon: string, effect: string): CatalogItem => ({ key: `tools-${id}`, page: id, icon,
    title: t(`@polish.catalog.${id}`), summary: t(`@polish.catalog.${id}.summary`), description: t(`@polish.catalog.${id}.details`), effect: t(`@polish.effect.${effect}`) });
  return {
    title: t("@workspace.tools"), description: t("@polish.catalog.description"),
    groups: [
      { title: t("@polish.group.explore"), tools: [page("discover", "search", "index"), tool("openAskVault", "messages-square", "model")] },
      { title: t("@polish.group.check"), tools: [page("health", "list-checks", "local"), tool("openDeepAudit", "scan-text", "audit"), tool("runLegacyVaultAudit", "chart-no-axes-combined", "write")] },
      { title: t("@polish.group.process"), tools: [tool("openBatchProcessing", "layers", "preview"), page("recall", "gallery-vertical-end", "cards")] },
      { title: t("@polish.group.organize"), tools: [tool("openTagTaxonomy", "tags", "local"), tool("generateMocs", "network", "write"), tool("openOperationHistory", "history", "journal"), page("connect", "plug", "proposals")] },
    ],
    editor: { title: t("@tools.editor"), description: t("@tools.editor.description"),
      items: ["write", "selection", "vault-write", "dataview", "atomize"].map(id => ({
        id, title: t(`@tools.editor.${id}`), description: t(`@tools.editor.${id}.description`), instructions: t(`@polish.editor.${id}`),
      })) },
  };
}
