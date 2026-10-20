import { setIcon } from "obsidian";
import { t } from "../../i18n";
import type { VeynrelToolAction } from "../toolsPort";
import { healthButton, healthDetails } from "./renderHealthHome";
import type { CatalogPage, toolsViewModel } from "./toolsViewModel";

export function renderTools(parent: HTMLElement, model: ReturnType<typeof toolsViewModel>,
  launch: (action: VeynrelToolAction) => void, navigate: (page: CatalogPage) => void): void {
  const home = parent.createEl("section", { cls: "veynrel-tools", attr: { "aria-label": model.title } });
  home.createEl("h1", { text: model.title, attr: { tabindex: "-1", "data-health-heading": "true" } });
  home.createEl("p", { text: model.description, cls: "veynrel-health-muted" });
  const groups = home.createDiv({ cls: "veynrel-catalog-groups" });
  for (const group of model.groups) {
    const section = groups.createEl("section", { cls: "veynrel-tools-group" });
    section.createEl("h2", { text: group.title });
    for (const tool of group.tools) {
      const row = section.createEl("article", { cls: "veynrel-catalog-row" });
      const icon = row.createSpan({ cls: "veynrel-catalog-icon", attr: { "aria-hidden": "true" } }); setIcon(icon, tool.icon);
      const copy = row.createDiv();
      copy.createEl("h3", { text: tool.title });
      copy.createEl("p", { text: tool.summary });
      copy.createEl("small", { text: tool.effect, cls: "veynrel-catalog-effect" });
      healthDetails(copy, t("@polish.details"), `details-${tool.key}`).createEl("p", { text: tool.description });
      const label = t(tool.action === "generateMocs" || tool.action === "runLegacyVaultAudit" ? "@polish.create" : "@polish.open");
      const button = healthButton(row, label,
        () => { if (tool.action) launch(tool.action); else if (tool.page) navigate(tool.page); }, tool.key);
      button.setAttribute("aria-label", `${label}: ${tool.title}`);
    }
  }
  const editor = home.createEl("section", { cls: "veynrel-tools-group veynrel-editor-catalog" });
  editor.createEl("h2", { text: model.editor.title });
  editor.createEl("p", { text: model.editor.description });
  editor.createEl("small", { text: t("@polish.effect.editor"), cls: "veynrel-catalog-effect" });
  for (const item of model.editor.items) {
    const row = editor.createEl("article", { cls: "veynrel-catalog-row" });
    const icon = row.createSpan({ cls: "veynrel-catalog-icon", attr: { "aria-hidden": "true" } }); setIcon(icon, "text-cursor-input");
    const copy = row.createDiv();
    copy.createEl("h3", { text: item.title }); copy.createEl("p", { text: item.description });
    healthDetails(copy, t("@polish.editor.open"), `editor-${item.id}`).createEl("p", { text: item.instructions });
  }
}
