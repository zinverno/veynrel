import { healthButton } from "./renderHealthHome";
import type { DiscoverAction, DiscoverViewModel } from "./discoverViewModel";

export function renderDiscover(parent: HTMLElement, model: DiscoverViewModel, action: (action: DiscoverAction) => void): void {
  const section = parent.createEl("section", { cls: "veynrel-health-home veynrel-discover",
    attr: { "aria-label": model.title, "aria-busy": String(model.busy) } });
  section.createEl("h1", { text: model.title, attr: { tabindex: "-1", "data-health-heading": "true" } });
  section.createEl("p", { text: model.introduction });
  if (model.workflows.length) {
    const workflows = section.createDiv({ cls: "veynrel-discover-workflows" });
    for (const workflow of model.workflows) {
      const button = healthButton(workflows, "", () => action(workflow.id), `discover-${workflow.id}`, model.busy);
      button.addClass("veynrel-health-profile-option");
      button.createSpan({ text: workflow.label, cls: "veynrel-health-profile-name" });
      button.createSpan({ text: workflow.description });
    }
  }
  section.createEl("h2", { text: model.capabilityTitle });
  section.createEl("p", { text: model.status, cls: "veynrel-health-state" });
  section.createEl("p", { text: model.description });
  if (model.details) section.createEl("p", { text: model.details, cls: "veynrel-health-muted" });
  if (model.vectors) section.createEl("p", { text: model.vectors });
  const actions = section.createDiv({ cls: "veynrel-semantic-actions" });
  for (const item of model.actions) healthButton(actions, item.label, () => action(item.id), `discover-${item.id}`, model.busy);
}
