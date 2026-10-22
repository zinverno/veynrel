import { dateLocale, t as tr } from "../i18n";
import type { MergePlan } from "./mergePlan";

/** Presentation only: callers pass paths from their checked plan/record, never inferred edits. */
export function reviewSummary(root: HTMLElement, changed: readonly string[], preserved: readonly string[], undo = false): void {
  const panel = root.createEl("section", { cls: "ai-consolidation-summary", attr: { "aria-label": tr("@ux.reviewSummary") } });
  panel.createEl("strong", { text: tr(undo ? "@ux.undoStep" : "@ux.reviewStep") });
  for (const [key, paths] of [["changed", changed], ["preserved", preserved]] as const) {
    if (!paths.length) continue;
    panel.createEl("p", { text: `${tr(`@ux.${key}`)} ${paths.join(" · ")}` });
  }
  panel.createEl("p", { text: tr("@ux.undoConditions") });
}

export function diagnosticPanel(root: HTMLElement, id?: string): HTMLDetailsElement {
  const details = root.createEl("details", { cls: "ai-consolidation-diagnostics" });
  details.createEl("summary", { text: tr("@final.technical") });
  if (id) details.createEl("p", { text: id, cls: "ai-pair-path" });
  return details;
}

export function historyHeading(root: HTMLElement, title: string, paths: readonly string[], createdAt?: number): void {
  root.createEl("h3", { text: title });
  for (const path of paths) root.createEl("p", { text: path, cls: "ai-pair-path" });
  if (createdAt !== undefined && Number.isFinite(createdAt)) root.createEl("p", {
    text: tr("@ux.preparedAt", { time: new Date(createdAt).toLocaleString(dateLocale()) }), cls: "ai-consolidation-time",
  });
}

export function historyUnavailable(root: HTMLElement, available: boolean, state: string, specific: boolean): void {
  if (!available && !specific && state !== "undone" && state !== "resolved") root.createEl("p", {
    text: tr("@ux.undoUnavailable"), attr: { role: "status" },
  });
}

export function workflowStep(root: HTMLElement, step: "pair" | "analysis" | "action" | "parameters" | "preview" | "previewOnly"): void {
  root.createEl("p", { cls: "ai-consolidation-step", text: tr(`@ux.step.${step}`) });
}

export function focusStatus(root: HTMLElement): void {
  const modal = root.closest(".modal");
  const modals = modal ? root.ownerDocument.querySelectorAll(".modal") : undefined;
  if (modals && modal !== modals[modals.length - 1]) return;
  const status = root.querySelector<HTMLElement>('[role="alert"], [role="status"], h3');
  if (status) { status.setAttribute("tabindex", "-1"); status.focus(); }
}

export function copyDependencies(root: HTMLElement, dependencies: MergePlan["dependencies"]): void {
  const panel = root.createEl("details"); panel.createEl("summary", { text: tr("@merge.dependencies") });
  panel.createEl("p", { text: tr("@merge.dependencyScope") });
  for (const dep of dependencies) {
    panel.createEl("h4", { text: dep.path });
    if (!dep.metadata) panel.createEl("p", { text: tr("@consolidation.unavailable") });
    for (const ref of dep.outgoing) panel.createEl("p", { text: `${tr(`@merge.reference.${ref.kind}`)}: ${ref.original} → ${ref.target ?? tr("@merge.unresolved")}` });
    panel.createEl("p", { text: dep.incoming ? tr("@merge.incoming", { shown: dep.incoming.items.length, total: dep.incoming.total }) : tr("@consolidation.unavailable") });
    for (const path of dep.incoming?.items ?? []) panel.createEl("p", { text: path });
  }
}
