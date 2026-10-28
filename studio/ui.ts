import { l } from "./messages";
export function button(root: HTMLElement, name: string, action: string, click: () => void): HTMLButtonElement {
  const b = root.createEl("button", { text: name, attr: { type: "button", "data-studio-action": action } }); b.addEventListener("click", click);
  if (["choose-notes", "prepare", "generate", "review-apply", "confirm-apply", "save-recipe", "diagram-prepare", "diagram-generate", "diagram-create-review", "diagram-confirm-create", "diagram-open"].includes(action)) b.addClass("mod-cta");
  return b;
}
export function literal(root: HTMLElement, name: string, value: string): void {
  const d = root.createEl("details"); d.createEl("summary", { text: name });
  d.createEl("pre", { text: value, cls: "veynrel-studio-literal", attr: { tabindex: "0", "aria-label": name } });
}
export function field(root: HTMLElement, name: string, value: string, multi = false): HTMLInputElement | HTMLTextAreaElement {
  const label = root.createEl("label", { cls: "veynrel-studio-field" }); label.createSpan({ text: name });
  const input = multi ? label.createEl("textarea") : label.createEl("input", { type: "text" }); input.value = value; input.dataset.studioKey = name; return input;
}
export function select(root: HTMLElement, name: string, options: readonly [string, string][], value: string): HTMLSelectElement {
  const label = root.createEl("label", { cls: "veynrel-studio-field" }); label.createSpan({ text: name }); const input = label.createEl("select");
  for (const [v, text] of options) input.createEl("option", { value: v, text }); input.value = value; input.dataset.studioKey = name; return input;
}

export function disclosure(root: HTMLElement, name: string): HTMLDetailsElement {
  const d = root.createEl("details", { cls: "veynrel-studio-disclosure" }); d.createEl("summary", { text: name }); return d;
}
export function toolbar(root: HTMLElement): HTMLElement { return root.createDiv({ cls: "veynrel-studio-actions" }); }

/** Metadata-only picker; the engine still validates the explicit scope at preparation. */
export function notePicker(root: HTMLElement, paths: readonly string[], state: { chosen: Set<string>; query: string }, limit: number, changed: () => void = () => {}, compact = false): void {
  const query = field(root, l("Search full paths", "Поиск по полному пути"), state.query); query.setAttribute("type", "search");
  const picked = root.createDiv({ cls: "veynrel-studio-picked" }), count = picked.createDiv({ attr: { role: "status" } });
  const selected = picked.createDiv(), list = root.createDiv({ cls: "veynrel-studio-picker" });
  const error = root.createDiv({ attr: { role: "alert" } });
  const drawSelected = () => {
    count.setText(`${l("Selected notes", "Выбрано заметок")}: ${state.chosen.size} / ${limit}`); selected.empty();
    for (const path of state.chosen) {
      const row = selected.createDiv({ cls: "veynrel-studio-picked-row" }); row.createSpan({ text: path });
      button(row, l("Remove", "Убрать"), "remove-note", () => { state.chosen.delete(path); changed(); draw(); drawSelected(); query.focus(); }).setAttribute("aria-label", `${l("Remove", "Убрать")}: ${path}`);
    }
  };
  const draw = () => {
    list.empty(); if (compact && !state.query.trim()) return; const matches = paths.filter(p => p.toLocaleLowerCase().includes(state.query.toLocaleLowerCase()));
    if (!matches.length) list.createEl("p", { text: l("No matching notes.", "Заметки не найдены.") });
    for (const path of matches.slice(0, 100)) {
      const label = list.createEl("label", { cls: "veynrel-studio-check" }), input = label.createEl("input", { type: "checkbox" }); input.checked = state.chosen.has(path); label.createSpan({ text: path });
      input.addEventListener("change", () => {
        error.empty();
        if (input.checked && state.chosen.size >= limit && limit > 1) { input.checked = false; error.setText(l("20 notes maximum. Remove a selected note first.", "Не более 20 заметок. Сначала уберите выбранную заметку.")); return; }
        if (input.checked) { if (limit === 1) { state.chosen.clear(); list.querySelectorAll<HTMLInputElement>("input").forEach(i => { if (i !== input) i.checked = false; }); } state.chosen.add(path); }
        else state.chosen.delete(path);
        changed(); if (compact) { state.query = ""; query.value = ""; draw(); query.focus(); } drawSelected();
      });
    }
    if (matches.length > 100) list.createEl("p", { text: l("First 100 matches. Narrow your search.", "Первые 100 совпадений. Уточните поиск.") });
  };
  query.addEventListener("input", () => { state.query = query.value; draw(); }); draw(); drawSelected();
}

export function connectionSummary(root: HTMLElement, connection: { provider: string; model: string; baseUrl: string }): void {
  let location = l("Remote endpoint · text leaves this device", "Удалённый адрес · текст покидает устройство");
  try { if (["localhost", "127.0.0.1", "[::1]"].includes(new URL(connection.baseUrl).hostname)) location = l("Local endpoint on this device", "Локальный адрес на этом устройстве"); } catch { location = l("Endpoint not configured", "Адрес не настроен"); }
  root.createEl("p", { cls: "veynrel-studio-connection", text: `${connection.provider} · ${connection.model || l("No model selected", "Модель не выбрана")} · ${location}` });
}
