import { setIcon } from "obsidian";
import { t } from "../../i18n";
import type { VeynrelToolAction } from "../toolsPort";
import { healthButton, healthDetails } from "./renderHealthHome";
import type { CatalogPage, toolsViewModel } from "./toolsViewModel";

export function renderTools(parent: HTMLElement, model: ReturnType<typeof toolsViewModel>,
  launch: (action: VeynrelToolAction) => void, navigate: (page: CatalogPage) => void, state: { selected?: string }): void {
  const home = parent.createEl("section", { cls: "veynrel-tools", attr: { "aria-label": model.title } });
  home.createEl("h1", { text: model.title, attr: { tabindex: "-1", "data-health-heading": "true" } });
  home.createEl("p", { text: model.description, cls: "veynrel-health-muted" });
  const catalog = home.createDiv({ cls: "veynrel-tool-catalog" });
  const items = model.groups.flatMap(group => group.tools);
  const wheel = catalog.createDiv({ cls: "veynrel-tool-wheel" });
  const svg = wheel.createSvg("svg");
  svg.setAttribute("viewBox", "0 0 360 360"); svg.setAttribute("aria-label", t("@overview.tool-ring"));
  const center = wheel.createDiv({ cls: "veynrel-tool-center", attr: { "aria-live": "polite" } });
  const show = (tool: typeof items[number]): void => {
    center.empty(); center.createEl("strong", { text: tool.title });
    center.createEl("p", { text: tool.summary }); center.createEl("small", { text: tool.effect });
  };
  const detail = home.createEl("section", { cls: "veynrel-tool-detail" }); detail.hidden = true;
  const open = (tool: typeof items[number], origin: Element, focus = true): void => {
    if (tool.page === "process") { navigate("process"); return; }
    state.selected = tool.key;
    catalog.hidden = true; detail.hidden = false; detail.empty();
    healthButton(detail, t("@overview.back-tools"), () => {
      state.selected = undefined;
      detail.hidden = true; catalog.hidden = false; (origin as HTMLElement).focus();
    }, "tool-back");
    const title = detail.createEl("h2", { text: tool.title, attr: { tabindex: "-1" } });
    detail.createEl("p", { text: tool.description }); detail.createEl("p", { text: tool.effect });
    healthButton(detail, t("@polish.open"), () => { if (tool.action) launch(tool.action); else if (tool.page) navigate(tool.page); }, tool.key, false, true);
    if (focus) title.focus();
  };
  show(items[0]);
  const point = (angle: number, r: number): string => `${180 + r * Math.cos(angle)},${180 + r * Math.sin(angle)}`;
  for (const [i, tool] of items.entries()) {
    const start = i * Math.PI * 2 / items.length - Math.PI / 2 + .025;
    const end = (i + 1) * Math.PI * 2 / items.length - Math.PI / 2 - .025;
    const group = svg.createSvg("g");
    group.setAttribute("role", "button"); group.setAttribute("tabindex", "0");
    group.setAttribute("aria-label", `${tool.title}. ${tool.summary}. ${tool.effect}`);
    group.setAttribute("data-tool-segment", tool.key);
    const path = group.createSvg("path");
    path.setAttribute("d", `M${point(start,170)} A170,170 0 0 1 ${point(end,170)} L${point(end,105)} A105,105 0 0 0 ${point(start,105)} Z`);
    const label = group.createSvg("text");
    const [x,y] = point((start+end)/2,137).split(","); label.setAttribute("x",x);label.setAttribute("y",y);
    label.setAttribute("aria-hidden","true");label.textContent=String(i+1);
    group.addEventListener("mouseenter", () => show(tool)); group.addEventListener("focus", () => show(tool));
    group.addEventListener("click", () => open(tool, group));
    group.addEventListener("keydown", (event: Event) => {
      const key = event as KeyboardEvent;
      if (key.key === "Enter" || key.key === " ") { key.preventDefault(); open(tool, group); }
    });
  }
  const groups = catalog.createDiv({ cls: "veynrel-tool-list" });
  for (const [i, tool] of items.entries()) {
    const row = groups.createEl("article", { cls: "veynrel-tool-list-row" });
    const button = healthButton(row, `${i + 1}. ${tool.title}`, () => open(tool, button), `catalog-${tool.key}`);
    button.addEventListener("focus", () => show(tool)); button.addEventListener("mouseenter", () => show(tool));
    row.createEl("small", { text: tool.summary });
  }
  if (state.selected) {
    const selected = items.find(tool => tool.key === state.selected);
    const origin = groups.querySelector(`[data-health-action="catalog-${state.selected}"]`);
    if (selected && origin) open(selected, origin, false);
  }
  const editor = catalog.createEl("section", { cls: "veynrel-tools-group veynrel-editor-catalog" });
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
