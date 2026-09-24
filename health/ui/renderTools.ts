import type { VeynrelToolAction } from "../toolsPort";
import { healthButton } from "./renderHealthHome";
import type { toolsViewModel } from "./toolsViewModel";

export function renderTools(parent: HTMLElement, model: ReturnType<typeof toolsViewModel>,
  launch: (action: VeynrelToolAction) => void, navigate: (page: "recall" | "discover" | "connect") => void): void {
  const home = parent.createEl("section", { cls: "veynrel-health-home veynrel-tools", attr: { "aria-label": model.title } });
  home.createEl("h1", { text: model.title, attr: { tabindex: "-1", "data-health-heading": "true" } });
  home.createEl("p", { text: model.description, cls: "veynrel-health-muted" });
  for (const group of model.groups) {
    const section = home.createEl("section", { cls: "veynrel-tools-group" });
    section.createEl("h2", { text: group.title });
    for (const tool of group.tools) {
      const row = section.createEl("article", { cls: "veynrel-tools-row" });
      const copy = row.createDiv();
      copy.createEl("h3", { text: tool.title });
      copy.createEl("p", { text: tool.description, cls: "veynrel-health-muted" });
      healthButton(row, tool.title, () => launch(tool.id), `tool-${tool.id}`);
    }
  }
  const editor = home.createEl("section", { cls: "veynrel-tools-group" });
  editor.createEl("h2", { text: model.editor.title });
  editor.createEl("p", { text: model.editor.description });
  const list = editor.createEl("dl", { cls: "veynrel-tools-editor" });
  for (const item of model.editor.items) {
    list.createEl("dt", { text: item.title });
    list.createEl("dd", { text: item.description, cls: "veynrel-health-muted" });
  }
  const references = home.createDiv({ cls: "veynrel-tools-references" });
  for (const reference of model.references) healthButton(references, reference.label,
    () => navigate(reference.page), `tools-${reference.page}`);
}
