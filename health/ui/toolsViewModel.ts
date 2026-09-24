import { t } from "../../i18n";
import type { VeynrelToolAction } from "../toolsPort";

export function toolsViewModel() {
  const tool = (id: VeynrelToolAction) => ({ id, title: t(`@tools.${id}`), description: t(`@tools.${id}.description`) });
  return {
    title: t("@health.tools"), description: t("@tools.description"),
    groups: [
      { title: t("@tools.intelligence"), tools: [tool("openAskVault"), tool("openDeepAudit"), tool("generateMocs")] },
      { title: t("@tools.batch"), tools: [tool("openBatchProcessing")] },
      { title: t("@tools.legacy"), tools: [tool("runLegacyVaultAudit")] },
    ],
    editor: { title: t("@tools.editor"), description: t("@tools.editor.description"),
      items: ["write", "selection", "vault-write", "dataview", "atomize"].map((id) => ({
        title: t(`@tools.editor.${id}`), description: t(`@tools.editor.${id}.description`),
      })) },
    references: (["recall", "discover", "connect"] as const).map((page) => ({ page, label: t(`@tools.reference.${page}`) })),
  };
}
