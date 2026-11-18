import { t } from "../../i18n";
import { workspaceHeading } from "../workspace/renderWorkspaceHome";
import { healthButton } from "./renderHealthHome";
import { renderActionPanel } from "./renderActionPanel";

export type ProcessingClusters = number | "loading" | "error";

export function renderProcessing(parent: HTMLElement, clusters: ProcessingClusters, actions: {
  atomization: () => void; batch: () => void; mocs: () => void; audit: () => void; refresh: () => void;
}): void {
  const page = parent.createEl("section", { cls: "veynrel-processing" });
  workspaceHeading(page, t("@workspace.process"));
  const cards = page.createDiv({ cls: "veynrel-processing-grid" });
  const card = (key: string, icon: string, id: string, label: string, open: () => void, disabled = false) =>
    renderActionPanel(cards, id, t(`@followup.bulk.${key}`), icon, t(`@followup.bulk.${key}-description`), label, open, disabled);
  card("batch", "layers", "tool-openBatchProcessing", t("@processing.batch-action"), actions.batch).addClass("veynrel-panel-primary");
  card("audit", "scan-text", "process-deep-audit", t("@followup.bulk.audit-action"), actions.audit);
  card("atomization", "git-fork", "process-atomization", t("@processing.atomization-action"), actions.atomization);
  const moc = card("moc", "network", clusters === 0 ? "tool-openDeepAudit" : clusters === "error" ? "process-refresh" : "tool-generateMocs",
    t(clusters === 0 ? "@processing.audit-action" : clusters === "error" ? "@processing.retry" : "@processing.moc-action"),
    clusters === 0 ? actions.audit : clusters === "error" ? actions.refresh : actions.mocs, clusters === "loading");
  moc.createEl("p", { cls: "veynrel-panel-status", attr: { role: "status" }, text: t(typeof clusters === "number"
    ? clusters ? "@processing.clusters" : "@processing.no-clusters" : `@processing.${clusters}`, { n: clusters }) });
  const footer = page.createDiv({ cls: "veynrel-processing-footer" });
  footer.createEl("small", { text: t("@followup.bulk.recovery") });
  if (typeof clusters === "number") healthButton(footer, t("@processing.refresh"), actions.refresh, "process-refresh").addClass("veynrel-quiet");
}
