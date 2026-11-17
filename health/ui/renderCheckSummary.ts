import { dateLocale, t } from "../../i18n";
import type { HealthControllerState } from "../obsidian/healthPluginController";
import { healthHomeViewModel } from "./healthHomeViewModel";
import { healthButton, healthDetails } from "./renderHealthHome";

/** Presents the existing global local-check receipt; no inference from a missing index. */
export function renderCheckSummary(parent: HTMLElement, state: HealthControllerState, noteCount: number,
  scan: () => void, openNote: (path: string) => void): void {
  const model = healthHomeViewModel(state), outcome = state.outcome;
  const run = outcome?.scan ?? state.snapshot?.lastLocalScan;
  parent.createEl("h1", { text: t("@ux.check"), attr: { tabindex: "-1", "data-health-heading": "true" } });
  const section = parent.createEl("section", { cls: "veynrel-check-status", attr: { "aria-label": t("@ux.check") } });
  const headline = section.createDiv({ cls: "veynrel-check-headline" });
  headline.createEl("strong", { text: run ? model.count : t("@workspace.notes", { n: noteCount }), cls: "veynrel-check-count" });
  if (run) {
    const receipt = outcome?.coverage;
    headline.createEl("p", { text: receipt ? t("@ux.checked", { n: receipt.fullyAvailable, total: receipt.listed }) : t("@ux.seen", { n: run.notesSeen }), attr: { "data-workspace-check-receipt": "true" } });
    if (run.completedAt) headline.createEl("time", { text: new Intl.DateTimeFormat(dateLocale(), { dateStyle: "short", timeStyle: "short" }).format(run.completedAt), attr: { datetime: new Date(run.completedAt).toISOString() } });
    if (!outcome) section.createEl("p", { text: t("@ux.not-current") });
    if (receipt?.linksUnavailable) {
      const reasons = receipt.linkLimitations;
      if (!reasons) section.createEl("p", { text: t("@ux.links-missing", { n: receipt.linksUnavailable }) });
      else for (const key of ["missing", "unsupported", "changed", "unknown"] as const) {
        if (reasons[key]) section.createEl("p", { text: t(`@ux.link-reason.${key}`, { n: reasons[key] }) });
      }
    }
    if (receipt?.contentUnavailable) section.createEl("p", { text: t("@ux.content-missing", { n: receipt.contentUnavailable }) });
    if (receipt && !receipt.noteListComplete) section.createEl("p", { text: t("@ux.inventory-partial") });
    if (run.status !== "completed" && !receipt) section.createEl("p", { text: t("@ux.unknown-coverage") });
    const details = healthDetails(section, t("@ux.coverage-details"), "check-coverage");
    details.createEl("p", { text: t("@ux.global-check") });
    details.createEl("p", { text: t("@ux.excluded-unknown") });
    if (receipt?.diagnostics.length) {
      const files = healthDetails(details, t("@ux.files"), "check-files");
      for (const diagnostic of receipt.diagnostics) {
        const row = files.createDiv(); row.createSpan({ text: t(["links-unavailable", "metadata-missing"].includes(diagnostic.code) ? "@ux.links-unavailable" : diagnostic.code === "unsupported-target" ? "@ux.target-unsupported" : diagnostic.code === "content-unavailable" ? "@ux.content-unavailable" : "@ux.diagnostic-unknown") });
        if (diagnostic.path) healthButton(row, diagnostic.path, () => openNote(diagnostic.path!), `coverage-${diagnostic.code}-${diagnostic.path}`);
      }
    }
    if (receipt?.diagnosticsTruncated) details.createEl("p", { text: t("@ux.diagnostics-truncated", { n: receipt.diagnosticsTruncated }) });
  }
  healthButton(headline, !run && !state.busy ? t("@ux.start-check") : model.scanLabel, scan, "scan", model.scanDisabled || state.savingPreferences, true);
  section.createEl("p", { cls: "veynrel-health-muted", text: t("@ux.local") });
  if (model.status) section.createEl("p", { text: model.status, attr: { role: model.statusError ? "alert" : "status" } });
}
