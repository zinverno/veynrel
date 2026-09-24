import { healthButton } from "./renderHealthHome";
import type { ProductSettingsAction, settingsViewModel } from "./settingsViewModel";

export function renderProductSettings(parent: HTMLElement, model: ReturnType<typeof settingsViewModel>, action: (action: ProductSettingsAction) => void): void {
  const home = parent.createEl("section", { cls: "veynrel-health-home veynrel-product-settings", attr: { "aria-label": model.title } });
  home.createEl("h1", { text: model.title, attr: { tabindex: "-1", "data-health-heading": "true" } });
  home.createEl("p", { text: model.description, cls: "veynrel-health-muted" });
  for (const summary of model.summaries) {
    const section = home.createEl("section");
    section.createEl("h2", { text: summary.title });
    section.createEl("p", { text: summary.status, cls: "veynrel-health-state" });
    if (summary.details) section.createEl("p", { text: summary.details, cls: "veynrel-health-muted" });
    if (summary.vectors) section.createEl("p", { text: summary.vectors });
    healthButton(section, summary.label, () => action(summary.id), `settings-${summary.id}`, summary.disabled);
  }
  const recall = home.createEl("section");
  recall.createEl("h2", { text: model.recall.title });
  recall.createEl("p", { text: model.recall.status, cls: "veynrel-health-state" });
  recall.createEl("p", { text: model.recall.description });
  const advanced = home.createEl("section");
  advanced.createEl("h2", { text: model.advanced.title });
  advanced.createEl("p", { text: model.advanced.description, cls: "veynrel-health-muted" });
  advanced.createEl("p", { text: model.advanced.instructions });
}
