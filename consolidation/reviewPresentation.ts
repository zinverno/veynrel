import { setIcon } from "obsidian";
import { t as tr } from "../i18n";

export const reviewName = (path: string): string => path.split("/").pop()!.replace(/\.md$/iu, "");
export function reviewIcon(parent: HTMLElement, name: string): void {
  const icon = parent.createSpan({ cls: "ai-review-icon", attr: { "aria-hidden": "true" } }); setIcon(icon, name);
}
export function reviewPair(parent: HTMLElement, paths: readonly string[]): void {
  const pair = parent.createDiv({ cls: "ai-review-pair" });
  for (const [i, path] of paths.entries()) {
    const note = pair.createDiv({ cls: "ai-review-note", attr: { title: path } }); reviewIcon(note, "file-text");
    const text = note.createSpan(); text.createEl("strong", { text: `${i === 0 ? "A" : "B"} · ${reviewName(path)}` });
    text.createEl("small", { text: path.split("/").slice(0, -1).join(" / ") || "/" });
  }
}
export function reviewNoteChoices(parent: HTMLElement, paths: readonly string[], selected: number | null,
  field: string, label: string, change: (side: 0 | 1) => void, disabled: readonly boolean[] = []): void {
  const group = parent.createEl("fieldset", { cls: "ai-review-choices" }); group.createEl("legend", { text: label });
  const name = `review-${field}-${crypto.randomUUID()}`;
  for (const [i, path] of paths.entries()) {
    const card = group.createEl("label", { cls: "ai-review-choice" });
    const input = card.createEl("input", { type: "radio", attr: { name, value: String(i), "data-planner-field": field } });
    input.value = String(i); input.checked = selected === i; input.disabled = !!disabled[i];
    const text = card.createSpan(); text.createEl("strong", { text: reviewName(path) }); text.createEl("small", { text: path });
    if (input.disabled) text.createEl("small", { text: tr("@final.directionUnavailable") });
    input.addEventListener("change", () => { if (!input.disabled) change(input.value === "1" ? 1 : 0); });
  }
}
