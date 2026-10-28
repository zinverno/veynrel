export function button(root: HTMLElement, name: string, action: string, click: () => void): HTMLButtonElement {
  const b = root.createEl("button", { text: name, attr: { type: "button", "data-studio-action": action } }); b.addEventListener("click", click); return b;
}
export function literal(root: HTMLElement, name: string, value: string): void {
  const d = root.createEl("details"); d.createEl("summary", { text: name });
  d.createEl("pre", { text: value, cls: "veynrel-studio-literal", attr: { tabindex: "0", "aria-label": name } });
}
export function field(root: HTMLElement, name: string, value: string, multi = false): HTMLInputElement | HTMLTextAreaElement {
  const label = root.createEl("label", { cls: "veynrel-studio-field" }); label.createSpan({ text: name });
  const input = multi ? label.createEl("textarea") : label.createEl("input", { type: "text" }); input.value = value; return input;
}
export function select(root: HTMLElement, name: string, options: readonly [string, string][], value: string): HTMLSelectElement {
  const label = root.createEl("label", { cls: "veynrel-studio-field" }); label.createSpan({ text: name }); const input = label.createEl("select");
  for (const [v, text] of options) input.createEl("option", { value: v, text }); input.value = value; return input;
}
