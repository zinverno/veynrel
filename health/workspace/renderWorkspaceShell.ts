import { setIcon } from "obsidian";
import { t } from "../../i18n";
import { healthButton } from "../ui/renderHealthHome";
import type { VeynrelHealthRoute } from "../ui/findingsInboxViewModel";
import type { VaultScopeIndex } from "./vaultScope";

export function workspaceSection(page: VeynrelHealthRoute["page"]): string {
  if (["health", "findings"].includes(page)) return "check";
  if (["discover", "topology", "semantic-neighborhood", "semantic-map", "connection-opportunities"].includes(page)) return "map";
  return page === "connect" ? "settings" : page;
}

export function renderWorkspaceShell(parent: HTMLElement, route: VeynrelHealthRoute, scope: VaultScopeIndex, vaultName: string,
  navigate: (route: VeynrelHealthRoute) => void, select: (path?: string) => void, state: { menuOpen: boolean }): HTMLElement {
  const shell = parent.createDiv({ cls: "veynrel-shell", attr: { "data-menu-open": String(state.menuOpen) } });
  const sidebar = shell.createEl("aside", { cls: "veynrel-sidebar" });
  sidebar.createDiv({ cls: "veynrel-brand" }).setText("Veynrel");
  const workspace = sidebar.createDiv({ cls: "veynrel-vault-name" });
  workspace.createEl("strong", { text: t("@workspace.workspace") });
  workspace.createEl("p", { text: vaultName });
  sidebar.createEl("p", { cls: "veynrel-nav-caption veynrel-eyebrow", text: t("@workspace.workspace") });
  const nav = sidebar.createEl("nav", { attr: { "aria-label": t("@workspace.navigation") } });
  const entries = [
    ["home", "home", "house"], ["discover", "map", "map"], ["health", "check", "clipboard-check"],
    ["process", "process", "sliders-horizontal"], ["recall", "recall", "history"],
    ["tools", "tools", "layout-grid"], ["history", "history", "history"], ["settings", "settings", "settings"],
  ] as const;
  for (const [page, section, icon] of entries) {
    const button = healthButton(nav, "", () => navigate({ page }), `nav-${page}`);
    const glyph = button.createSpan({ attr: { "aria-hidden": "true" } }); setIcon(glyph, icon);
    button.createSpan({ text: t(`@workspace.${section}`) });
    button.setAttribute("aria-pressed", String(workspaceSection(route.page) === section));
    if (workspaceSection(route.page) === section) button.setAttribute("aria-current", "page");
    if (page === "tools") button.addClass("veynrel-nav-secondary");
    if (page === "settings") button.addClass("veynrel-nav-settings");
  }
  const content = shell.createDiv({ cls: "veynrel-shell-content" });
  const top = content.createEl("header", { cls: "veynrel-topbar" });
  const menu = healthButton(top, t("@workspace.menu"), () => {
    const open = shell.getAttribute("data-menu-open") !== "true";
    state.menuOpen = open; shell.setAttribute("data-menu-open", String(open)); menu.setAttribute("aria-expanded", String(open));
  }, "workspace-menu");
  menu.addClass("veynrel-menu-toggle"); menu.setAttribute("aria-expanded", String(state.menuOpen));
  shell.addEventListener("keydown", event => {
    if (event.key === "Escape" && shell.getAttribute("data-menu-open") === "true") {
      state.menuOpen = false; shell.setAttribute("data-menu-open", "false"); menu.setAttribute("aria-expanded", "false"); menu.focus();
    }
  });
  top.createSpan({ cls: "veynrel-crumb", text: t(`@workspace.${workspaceSection(route.page)}`) });
  const label = top.createEl("label", { cls: "veynrel-scope-picker" });
  label.createSpan({ text: t("@workspace.scope") });
  const picker = label.createEl("select", { attr: { "aria-label": t("@workspace.folders"), "data-health-action": "scope-picker" } });
  picker.createEl("option", { text: t("@workspace.all"), attr: { value: "" } });
  for (const folder of scope.snapshot.folders) picker.createEl("option", { text: `${folder.path} (${folder.count})`, attr: { value: folder.path } });
  if (scope.selection.kind === "folder" && scope.selection.missing) picker.createEl("option", {
    text: scope.selection.path, attr: { value: scope.selection.path, disabled: "true" },
  });
  picker.value = scope.selection.kind === "all" ? "" : scope.selection.path;
  picker.addEventListener("change", () => select(picker.value || undefined));
  return content.createDiv({ cls: "veynrel-shell-main" });
}
