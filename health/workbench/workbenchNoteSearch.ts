import { t } from "../../i18n";
import { healthButton } from "../ui/renderHealthHome";
import type { ConnectionSelection } from "../connections/connectionSelection";

export const NOTE_SEARCH_LIMIT = 20;
export function searchPairNotes(paths: readonly string[], source: string, query: string, policy?: ConnectionSelection): { paths: string[]; total: number; blocked: number } {
  const result: string[] = [], needle = query.trim().toLocaleLowerCase();
  let total = 0, blocked = 0;
  if (!paths.includes(source)) return { paths: result, total, blocked };
  for (const path of paths) {
    if (path === source || !path.toLocaleLowerCase().includes(needle)) continue;
    if (policy && (policy.document(source) !== "allow" || policy.document(path) !== "allow" || policy.pair(source, path) !== "allow")) { blocked++; continue; }
    total++; if (result.length < NOTE_SEARCH_LIMIT) result.push(path);
  }
  return { paths: result, total, blocked };
}

/** Native controls, bounded results; search never reads Markdown or creates an index. */
export function renderPairNoteSearch(parent: HTMLElement, options: {
  query: string; changed(query: string): void;
  search(query: string): ReturnType<typeof searchPairNotes> | undefined;
  select(path: string): void;
  current(): boolean;
}): void {
  const section = parent.createDiv({ cls: "veynrel-pair-search" });
  const label = section.createEl("label", { text: t("@workbench.second-note") });
  const input = label.createEl("input", { type: "search", attr: { "data-health-action": "workbench-second", "aria-label": t("@workbench.second-note") } });
  input.value = options.query;
  const status = section.createEl("p", { attr: { role: "status", "aria-live": "polite" } });
  const list = section.createEl("ul", { attr: { "aria-label": t("@workbench.second-note") } });
  const update = (): void => {
    if (!options.current()) return;
    options.changed(input.value); list.empty();
    const result = options.search(input.value);
    status.setText(result ? t("@r062.search-count", { shown: result.paths.length, total: result.total, blocked: result.blocked }) : t("@r062.search-unavailable"));
    for (const path of result?.paths ?? []) {
      const button = healthButton(list.createEl("li"), path, () => { if (options.current()) options.select(path); }, `workbench-second-${encodeURIComponent(path)}`);
      button.setAttribute("data-note-choice", path);
    }
  };
  input.addEventListener("input", update);
  section.addEventListener("keydown", event => {
    if (!options.current()) return;
    const buttons = Array.from(list.querySelectorAll<HTMLButtonElement>("button")), active = parent.ownerDocument.activeElement;
    const index = buttons.findIndex(button => button === active);
    if (event.key === "ArrowDown") { (buttons[Math.min(index + 1, buttons.length - 1)] ?? input).focus(); event.preventDefault(); }
    if (event.key === "ArrowUp") { (buttons[index - 1] ?? input).focus(); event.preventDefault(); }
    if (event.key === "Escape" && active !== input) { input.focus(); event.preventDefault(); event.stopPropagation(); }
  });
  update();
}
