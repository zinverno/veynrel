import { setIcon } from "obsidian";
import { t } from "../../i18n";
import { workspaceHeading } from "../workspace/renderWorkspaceHome";
import { healthButton } from "./renderHealthHome";

export type ProcessingClusters = number | "loading" | "error";

export function renderProcessing(parent: HTMLElement, clusters: ProcessingClusters, actions: {
  atomization: () => void; batch: () => void; mocs: () => void; audit: () => void; refresh: () => void;
}): void {
  const page = parent.createEl("section", { cls: "veynrel-processing" });
  workspaceHeading(page, t("@workspace.process"), t("@processing.intro"));
  const workflow = page.createEl("ol", { cls: "veynrel-audit-steps" });
  for (const key of ["scope", "operation", "result"]) workflow.createEl("li", { text: t(`@overview.batch-${key}`) });
  const review = page.createEl("details");
  review.createEl("summary", { text: t("@overview.review-title") });
  review.createEl("p", { text: t("@overview.review-description") });
  const cards = page.createDiv({ cls: "veynrel-processing-rows" });
  const card = (key: string, icon: string): HTMLElement => {
    const item = cards.createEl("article", { cls: "veynrel-processing-row" });
    const heading = item.createDiv({ cls: "veynrel-processing-heading" });
    setIcon(heading.createSpan({ attr: { "aria-hidden": "true" } }), icon);
    heading.createEl("h2", { text: t(`@processing.${key}`) });
    item.createEl("p", { cls: "veynrel-processing-effect", text: t(`@processing.${key}-effect`) });
    return item;
  };
  healthButton(card("batch", "layers"), t("@processing.batch-action"), actions.batch, "tool-openBatchProcessing", false, true);
  healthButton(card("audit", "scan-text"), t("@processing.audit-action"), actions.audit, "process-deep-audit");
  healthButton(card("atomization", "git-fork"), t("@processing.atomization-action"), actions.atomization, "process-atomization");
  const moc = card("moc", "network");
  const status = moc.createDiv({ cls: "veynrel-processing-status" });
  status.createEl("p", { attr: { role: "status" }, text: t(typeof clusters === "number"
    ? clusters ? "@processing.clusters" : "@processing.no-clusters" : `@processing.${clusters}`, { n: clusters }) });
  if (typeof clusters === "number") healthButton(status, t("@processing.refresh"), actions.refresh, "process-refresh").addClass("veynrel-processing-refresh");
  if (clusters === 0) healthButton(moc, t("@processing.audit-action"), actions.audit, "tool-openDeepAudit");
  else if (clusters === "error") healthButton(moc, t("@processing.retry"), actions.refresh, "process-refresh");
  else healthButton(moc, t("@processing.moc-action"), actions.mocs, "tool-generateMocs", clusters === "loading");
}
