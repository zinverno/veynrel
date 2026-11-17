import { setIcon } from "obsidian";
import { t } from "../../i18n";
import { healthButton } from "../ui/renderHealthHome";
import type { VeynrelHealthRoute } from "../ui/findingsInboxViewModel";
import type { VaultScopeIndex } from "./vaultScope";

export function workspaceSection(page: VeynrelHealthRoute["page"]): string {
  if (page === "home") return "home";
  if (["health", "findings"].includes(page)) return "check";
  if (page === "semantic") return "semantic";
  if (page === "process") return "tools";
  if (["discover", "topology", "semantic-neighborhood", "semantic-map", "connection-opportunities"].includes(page)) return "semantic";
  return page === "connect" ? "settings" : page;
}

export function renderWorkspaceShell(parent: HTMLElement, route: VeynrelHealthRoute, scope: VaultScopeIndex, _vaultName: string,
  navigate: (route: VeynrelHealthRoute) => void, select: (path?: string) => void, state: { menuOpen: boolean }, audit?: () => void, tag?: () => void, settings?: () => void, history?: () => void): HTMLElement {
  const shell = parent.createDiv({ cls: "veynrel-shell", attr: { "data-menu-open": String(state.menuOpen) } });
  const content = shell.createDiv({ cls: "veynrel-shell-content" });
  const top = content.createEl("header", { cls: "veynrel-topbar" });
  const nav = top.createEl("nav", { cls: "veynrel-tabs", attr: { "aria-label": t("@workspace.navigation") } });
  for (const [page, section] of [["home", "home"], ["health", "check"], ["semantic", "semantic"], ["tools", "tools"], ["recall", "recall"]] as const) {
    const button = healthButton(nav, t(section === "home" || section === "tools" ? `@workspace.${section}` : `@ux.${section}`), () => navigate({ page }), `nav-${page}`);
    button.setAttribute("aria-pressed", String(workspaceSection(route.page) === section));
    if (workspaceSection(route.page) === section) button.setAttribute("aria-current", "page");
  }
  const extra = top.createEl("details", { cls: "veynrel-workspace-more", attr: { "data-health-disclosure": "workspace-more" } });
  const summary = extra.createEl("summary", { attr: { "aria-label": t("@ux.more"), "data-health-action": "workspace-menu" } });
  setIcon(summary, "ellipsis");
  const menu = extra.createDiv({ cls: "veynrel-workspace-menu" });
  for (const page of ["history", "settings"] as const) {
    const button = healthButton(menu, t(`@workspace.${page}`), () => { extra.open = false; if (page === "settings" && settings) settings(); else if (page === "history" && history) history(); else navigate({ page }); }, `nav-${page}`);
    if (workspaceSection(route.page) === page) button.setAttribute("aria-current", "page");
  }
  if (audit) healthButton(menu, t("@workspace.organization-audit"), audit, "organization-audit");
  if (tag) healthButton(menu, t("@localNote.tag"), tag, "tag-note");
  extra.addEventListener("toggle", () => { state.menuOpen = extra.open; shell.setAttribute("data-menu-open", String(extra.open)); });
  shell.addEventListener("keydown", event => {
    if (event.key === "Escape" && extra.open) { extra.open = false; state.menuOpen = false; shell.setAttribute("data-menu-open", "false"); summary.focus(); }
  });
  const label = content.createEl("label", { cls: "veynrel-scope-picker" });
  label.createSpan({ text: t("@workspace.scope") });
  const picker = label.createEl("select", { attr: { "aria-label": t("@workspace.folders"), "data-health-action": "scope-picker" } });
  picker.createEl("option", { text: t("@workspace.all"), attr: { value: "" } });
  for (const folder of scope.snapshot.folders) picker.createEl("option", { text: `${folder.path} (${folder.count})`, attr: { value: folder.path } });
  if (scope.selection.kind === "folder" && scope.selection.missing) picker.createEl("option", { text: scope.selection.path, attr: { value: scope.selection.path, disabled: "true" } });
  picker.value = scope.selection.kind === "all" ? "" : scope.selection.path;
  picker.addEventListener("change", () => select(picker.value || undefined));
  return content.createDiv({ cls: "veynrel-shell-main" });
}
