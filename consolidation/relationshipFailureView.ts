import { t as tr } from "../i18n";
import type { RelationshipSession } from "./relationshipSession";
import { reviewIcon } from "./reviewPresentation";

export function renderRelationshipFailure(body: HTMLElement, session: RelationshipSession, sources?: () => void): void {
  const view = session.view, report = session.errorReport;
  if (!view.error || !report) return;
  const panel = body.createEl("section", { cls: "ai-review-notice is-error", attr: { role: "alert" } });
  reviewIcon(panel, "circle-alert");
  const content = panel.createDiv();
  content.createEl("h3", { text: tr("@final.failedHeading") });
  content.createEl("p", { text: tr(`@relationship.error.${view.error}`) });
  content.createEl("p", { text: tr("@final.rejected") });
  const open = content.createEl("button", { text: tr("@final.errorReport"), cls: "mod-cta", attr: { type: "button", "data-relationship-action": "report" } });
  content.createEl("small", { text: tr("@final.noWrite") });
  const diagnostics = body.createEl("section", { cls: "ai-review-panel", attr: { "data-error-report": "", tabindex: "-1" } });
  diagnostics.hidden = true;
  open.addEventListener("click", () => { diagnostics.hidden = !diagnostics.hidden; if (!diagnostics.hidden) diagnostics.focus(); });
  diagnostics.createEl("h3", { text: tr("@final.errorReport") });
  const table = diagnostics.createEl("dl", { cls: "ai-review-keyval" });
  const row = (key: string, value: string) => { table.createEl("dt", { text: tr(`@final.${key}`) }); table.createEl("dd", { text: value }); };
  row("stage", tr(`@final.stage.${report.stage}`)); row("code", report.code);
  row("dispatch", tr(report.dispatchAttempted ? "@final.dispatchAttempted" : "@final.notDispatched"));
  row("completion", report.finishReason === "unknown" ? tr("@final.unknown") : report.finishReason);
  for (const issue of report.issues) {
    row("field", issue.field); row("code", issue.code);
    row("expected", tr(`@final.rule.${issue.code}`));
    row("received", issue.relation || issue.action ? `relation: ${issue.relation ?? tr("@final.unknown")} · action: ${issue.action ?? tr("@final.unknown")}` : issue.receivedType ?? tr("@final.unknown"));
  }
  diagnostics.createEl("p", { text: tr("@final.notPerformed") });
  const copy = diagnostics.createEl("button", { text: tr("@final.copyReport"), attr: { type: "button", "data-relationship-action": "copy-report" } });
  const copied = diagnostics.createEl("p", { text: tr("@final.reportPrivacy"), attr: { role: "status" } });
  copy.addEventListener("click", () => {
    const clipboard = body.ownerDocument.defaultView?.navigator.clipboard;
    void (clipboard ? clipboard.writeText(JSON.stringify(report, null, 2)) : Promise.reject(new Error("Clipboard unavailable"))).then(
      () => copied.setText(tr("@final.copied")), () => copied.setText(tr("@final.copyUnavailable")));
  });
  if (report.dispatchAttempted) body.createEl("p", { text: tr("@relationship.billingUnknown"), cls: "ai-review-caption" });
  const actions = body.createDiv({ cls: "ai-consolidation-actions" });
  const retry = actions.createEl("button", { text: tr("@final.newAnalysis"), attr: { type: "button", "data-relationship-action": "retry" } });
  retry.addEventListener("click", () => { if (session.view === view && body.contains(retry)) void session.prepare(); });
  if (sources) {
    const inspect = actions.createEl("button", { text: tr("@final.sources"), attr: { type: "button" } }); inspect.addEventListener("click", sources);
  }
}
