import { t } from "../../i18n";
import type { VaultPulseModel, VaultPulseState } from "./healthDashboardModel";

// Code-owned discrete shapes. Neither geometry nor timing depends on a count.
const paths: Record<VaultPulseState, string> = {
  unknown: "M0 48 H150 Q170 48 180 44 T210 48 H430 Q450 48 460 44 T490 48 H640",
  good: "M0 48 H120 C145 48 145 34 165 34 S185 62 205 62 S225 48 250 48 H390 C415 48 415 34 435 34 S455 62 475 62 S495 48 520 48 H640",
  review: "M0 48 H120 C145 48 145 24 165 24 S185 72 205 72 S225 48 250 48 H390 C415 48 415 24 435 24 S455 72 475 72 S495 48 520 48 H640",
  attention: "M0 48 H120 C145 48 145 12 165 12 S185 84 205 84 S225 48 250 48 H390 C415 48 415 12 435 12 S455 84 475 84 S495 48 520 48 H640",
  scanning: "M0 48 H120 C145 48 145 24 165 24 S185 72 205 72 S225 48 250 48 H390 C415 48 415 24 435 24 S455 72 475 72 S495 48 520 48 H640",
};

export function renderVaultPulse(parent: HTMLElement, model: VaultPulseModel): HTMLElement {
  const hero = parent.createEl("section", { cls: "veynrel-vault-pulse", attr: { "data-pulse-state": model.state } });
  hero.createEl("h2", { text: t("@dashboard.pulse"), cls: "veynrel-dashboard-eyebrow" });
  const svg = hero.createSvg("svg", { cls: "veynrel-vault-pulse-wave", attr: { viewBox: "0 0 640 96", "aria-hidden": "true", focusable: "false", preserveAspectRatio: "none" } });
  for (const layer of ["base", "accent"]) {
    svg.createSvg("path", { cls: `veynrel-vault-pulse-${layer}`, attr: { d: paths[model.state], pathLength: "100", "vector-effect": "non-scaling-stroke" } });
  }
  hero.createEl("p", { text: model.label, cls: "veynrel-vault-pulse-state" });
  const facts = hero.createDiv({ cls: "veynrel-vault-pulse-facts" });
  facts.createSpan({ text: model.findingsLabel });
  facts.createSpan({ text: model.coverageLabel, cls: "veynrel-dashboard-badge", attr: { "data-coverage": model.coverage } });
  hero.createEl("p", { text: model.lastCheckedLabel, cls: "veynrel-health-muted" });
  return hero;
}
