import { t } from "../../i18n";
import { healthButton } from "../ui/renderHealthHome";
import { includesScope } from "./vaultScope";
import type { VaultScopeIndex } from "./vaultScope";

export function scopeName(index: VaultScopeIndex): string { return index.selection.kind === "all" ? t("@workspace.all") : index.selection.path; }
export function workspaceHeading(parent: HTMLElement, title: string, description?: string): void {
  const header = parent.createDiv({ cls: "veynrel-page-heading" });
  header.createEl("h1", { text: title, attr: { tabindex: "-1", "data-health-heading": "true" } });
  if (description) header.createEl("p", { text: description });
}

export function renderScopeNotes(parent: HTMLElement, index: VaultScopeIndex, query: string, limit: number,
  actions: { search: (query: string) => void; more: () => void; open: (path: string) => void }): void {
  parent.createEl("h2", { text: t("@workspace.note-list"), cls: "veynrel-home-section-title" });
  parent.createEl("p", { cls: "veynrel-data-note", text: t(index.selection.kind === "all" ? "@workspace.all-source" : "@workspace.folder-source") });
  if (index.selection.kind === "folder" && index.selection.missing) { parent.createEl("p", { text: t("@workspace.missing"), attr: { role: "alert" } }); return; }
  const search = parent.createEl("input", { cls: "veynrel-note-search", attr: { type: "search", "aria-label": t("@workspace.search"), placeholder: t("@workspace.search"), "data-health-action": "scope-search" } });
  search.value = query; search.addEventListener("input", () => actions.search(search.value));
  const paths = index.snapshot.paths.filter(path => includesScope(index.selection, path));
  const visible = paths.filter(path => path.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  parent.createEl("p", { text: t("@workspace.notes", { n: visible.length }), cls: "veynrel-data-note" });
  const list = parent.createEl("ul", { cls: "veynrel-scope-notes" });
  for (const [i, path] of visible.slice(0, limit).entries()) healthButton(list.createEl("li"), path, () => actions.open(path), `scope-note-${i}`);
  if (!visible.length) parent.createEl("p", { text: t(paths.length ? "@workspace.no-match" : "@workspace.no-notes") });
  if (visible.length > limit) healthButton(parent, t("@workspace.more"), actions.more, "scope-more");
}
