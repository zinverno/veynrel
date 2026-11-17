import { FuzzySuggestModal, setIcon, type App, type FuzzyMatch } from "obsidian";
import { t } from "../../i18n";
import type { VeynrelToolAction } from "../toolsPort";
import { healthButton } from "./renderHealthHome";
import type { CatalogPage, toolsViewModel } from "./toolsViewModel";

import { ToolExplanationModal } from "./toolExplanationModal";

let ringSequence = 0;

export function renderTools(parent: HTMLElement, model: ReturnType<typeof toolsViewModel>,
  launch: (action: VeynrelToolAction) => void, navigate: (page: CatalogPage) => void, state: { selected?: string }, app: App): void {
  const home = parent.createEl("section", { cls: "veynrel-tools" });
  home.createEl("h1", { text: model.title, attr: { tabindex: "-1", "data-health-heading": "true" } });
  const items = model.groups.flatMap(group => group.tools);
  const stage = home.createDiv({ cls: "veynrel-tools-stage" }), wheel = stage.createDiv({ cls: "veynrel-tool-wheel" });
  const ringId = `veynrel-ring-${++ringSequence}`;
  const svg = wheel.createSvg("svg", { attr: { viewBox: "0 0 460 460", "aria-labelledby": ringId } });
  svg.createSvg("title", { attr: { id: ringId } }).textContent = t("@overview.tool-ring");
  for (const [r, cls] of [[178, "veynrel-ring-base"], [210, "veynrel-ring-edge"], [146, "veynrel-ring-edge"]] as const) {
    svg.createSvg("circle", { cls, attr: { cx: "230", cy: "230", r: String(r) } });
  }
  const highlight = svg.createSvg("path", { cls: "veynrel-ring-highlight" });
  const outline = svg.createSvg("path", { cls: "veynrel-ring-focus" });
  const center = wheel.createDiv({ cls: "veynrel-tool-center", attr: { "aria-live": "polite" } });
  const glyph = center.createSpan({ attr: { "aria-hidden": "true" } });
  const title = center.createEl("h2"), description = center.createEl("p");
  let explanation: ToolExplanationModal | undefined;
  const open = (index: number, origin: HTMLElement | SVGElement): void => {
    const tool = items[index];
    explanation = new ToolExplanationModal(app, tool, origin, () => { if (tool.action) launch(tool.action); else if (tool.page) navigate(tool.page); });
    explanation.open();
  };
  const button = healthButton(center, t("@followup.details") + " →", () => { const i = items.findIndex(tool => tool.key === state.selected); if (i >= 0) open(i, button); }, "tool-open-selected");
  const point = (angle: number, r: number): string => `${230 + r * Math.cos(angle)},${230 + r * Math.sin(angle)}`;
  const angle = (i: number): number => i * Math.PI * 2 / items.length - Math.PI / 2;
  const arc = (i: number, r: number): string => `M${point(angle(i), r)} A${r},${r} 0 ${items.length === 1 ? 1 : 0} 1 ${point(angle(i + 1), r)}`;
  let touch = false;
  const show = (i: number, focused = false): void => {
    state.selected = items[i]?.key;
    highlight.setAttribute("visibility", i < 0 ? "hidden" : "visible");
    outline.setAttribute("visibility", i >= 0 && focused ? "visible" : "hidden");
    button.hidden = i < 0;
    setIcon(glyph, items[i]?.icon ?? "wrench");
    title.textContent = items[i]?.title ?? t("@visual.choose-tool");
    description.textContent = items[i]?.summary ?? t("@visual.ring-hint");
    if (i >= 0) { highlight.setAttribute("d", arc(i, 178)); outline.setAttribute("d", arc(i, 215)); button.title = items[i].effect; }
  };
  const hits: SVGElement[] = [];
  for (const [i, tool] of items.entries()) {
    const start = angle(i), end = angle(i + 1);
    const hit = svg.createSvg("path", { cls: "veynrel-tool-hit", attr: {
      d: `M${point(start,210)} A210,210 0 0 1 ${point(end,210)} L${point(end,146)} A146,146 0 0 0 ${point(start,146)} Z`,
      role: "button", tabindex: i === 0 ? "0" : "-1", "aria-labelledby": `${ringId}-${i}`, "data-tool-segment": tool.key,
    } });
    // Obsidian's aria-label tooltip assumes HTMLElement.isShown; SVG uses a title instead.
    hit.createSvg("title", { attr: { id: `${ringId}-${i}` } }).textContent = `${tool.title}. ${tool.summary}. ${tool.effect}`;
    hits.push(hit);
    hit.addEventListener("pointerenter", event => { if (event.pointerType !== "touch") { touch = false; show(i); } });
    hit.addEventListener("pointerdown", event => { touch = event.pointerType === "touch"; if (touch) show(i); });
    hit.addEventListener("focus", () => show(i, true));
    hit.addEventListener("click", event => { if (touch || (event as PointerEvent).pointerType === "touch") { show(i); return; } open(i, hit); });
    hit.addEventListener("keydown", event => {
      const key = event;
      let next = i;
      if (["ArrowRight", "ArrowDown"].includes(key.key)) next = (i + 1) % items.length;
      else if (["ArrowLeft", "ArrowUp"].includes(key.key)) next = (i + items.length - 1) % items.length;
      else if (key.key === "Home") next = 0;
      else if (key.key === "End") next = items.length - 1;
      else if (key.key === "Enter" || key.key === " ") { key.preventDefault(); open(i, hit); return; }
      else return;
      key.preventDefault(); hits.forEach((el, j) => el.setAttribute("tabindex", j === next ? "0" : "-1")); hits[next].focus();
    });
  }
  const aux = stage.createDiv({ cls: "veynrel-ring-aux" });
  const chooser = healthButton(aux, t("@visual.choose-name"), () => {
    const choices = items.map((tool, i) => ({ title: tool.title, icon: tool.icon, open: () => open(i, chooser) }));
    for (const item of model.editor.items) choices.push({ title: item.title, icon: item.icon,
      open: () => new ToolExplanationModal(app, item, chooser).open() });
    new class extends FuzzySuggestModal<typeof choices[number]> {
      private chosen = false;
      getItems() { return choices; }
      getItemText(item: typeof choices[number]) { return item.title; }
      renderSuggestion(match: FuzzyMatch<typeof choices[number]>, el: HTMLElement): void {
        el.addClass("veynrel-tool-choice");
        setIcon(el.createSpan({ attr: { "aria-hidden": "true" } }), match.item.icon);
        super.renderSuggestion(match, el.createSpan());
      }
      onChooseItem(item: typeof choices[number]) { this.chosen = true; item.open(); }
      onClose(): void { super.onClose(); queueMicrotask(() => { if (!this.chosen && chooser.isConnected) chooser.focus(); }); }
    }(app).open();
  }, "tool-chooser");
  const help = stage.createEl("p", { cls: "veynrel-ring-keys", text: t("@visual.ring-keys") }); help.hidden = true;
  healthButton(aux, t("@visual.keyboard"), () => { help.hidden = !help.hidden; }, "tool-keyboard");
  wheel.addEventListener("pointerleave", () => { if (!touch && !explanation?.isShowing && !wheel.contains(parent.ownerDocument.activeElement)) show(-1); });
  wheel.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); show(-1); chooser.focus(); } });
  show(items.findIndex(tool => tool.key === state.selected));
}
