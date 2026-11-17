import { setIcon } from "obsidian";

export function renderActionPanel(parent: HTMLElement, key: string, title: string, icon: string, description: string,
  action: string, open: () => void, disabled = false): HTMLAnchorElement {
  const panel = parent.createEl("a", { cls: "veynrel-action-panel", href: `#${key}`,
    attr: { "data-health-action": key, "aria-disabled": String(disabled) } });
  panel.addEventListener("click", event => { event.preventDefault(); if (!disabled) open(); });
  const heading = panel.createDiv({ cls: "veynrel-panel-heading" });
  heading.createEl("h2", { text: title }); setIcon(heading.createSpan({ attr: { "aria-hidden": "true" } }), icon);
  panel.createEl("p", { text: description });
  const footer = panel.createDiv({ cls: "veynrel-panel-action" }); footer.createSpan({ text: action });
  setIcon(footer.createSpan({ attr: { "aria-hidden": "true" } }), "arrow-right");
  return panel;
}
