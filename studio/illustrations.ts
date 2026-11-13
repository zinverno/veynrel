import { l } from "./messages";

/** Static examples only; no vault access or model output. */
export function illustration(root: HTMLElement, kind: "format" | "training" | "nutrition"): void {
  const svg = root.createSvg("svg");
  svg.setAttribute("viewBox", "0 0 240 80"); svg.setAttribute("aria-hidden", "true");
  const element = (tag: "line" | "rect" | "text", attrs: Record<string, string>, text?: string) => {
    const e = svg.createSvg(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text) e.textContent = text;
  };
  const line = (x1: number, y1: number, x2: number, y2: number) => element("line", { x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2), stroke: "currentColor" });
  const box = (x: number, y: number, w: number, h: number, text: string) => {
    element("rect", { x: String(x), y: String(y), width: String(w), height: String(h), rx: "4", fill: "var(--background-primary)", stroke: "currentColor" });
    element("text", { x: String(x + w / 2), y: String(y + h / 2 + 4), "text-anchor": "middle", fill: "currentColor", "font-size": "11" }, text);
  };
  box(2, 20, 68, 40, l("Note", "Запись")); line(76, 40, 98, 40); line(92, 35, 98, 40); line(92, 45, 98, 40);
  if (kind === "format") {
    element("text", { x: "110", y: "20", fill: "currentColor", "font-size": "13", "font-weight": "600" }, l("Heading", "Заголовок"));
    for (const y of [36, 52, 68]) { box(110, y - 4, 4, 4, ""); line(122, y - 2, 226, y - 2); }
  } else {
    box(106, 6, 132, 68, ""); line(106, 27, 238, 27); line(106, 48, 238, 48); line(190, 6, 190, 74);
    for (const [x, y, text] of [[112, 20, kind === "training" ? l("Exercise", "Упражнение") : l("Food", "Продукт")], [194, 20, kind === "training" ? l("Sets", "Подх.") : l("Qty", "Кол-во")], [112, 42, kind === "training" ? l("Squat", "Присед") : l("Rice", "Рис")], [194, 42, "…"], [112, 63, "…"]] as const)
      element("text", { x: String(x), y: String(y), fill: "currentColor", "font-size": "10" }, text);
  }
}
