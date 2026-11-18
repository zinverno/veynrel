import { FuzzySuggestModal, setIcon, type App } from "obsidian";
import { t } from "../../i18n";
import { healthButton } from "../ui/renderHealthHome";
import type { VeynrelHealthRoute } from "../ui/findingsInboxViewModel";
import type { VaultScopeIndex } from "./vaultScope";

export function workspaceSection(page: VeynrelHealthRoute["page"]): string {
  if (page === "home") return "home";
  if (["health", "findings"].includes(page)) return "check";
  if (page === "semantic" || page === "semantic-scenario") return "semantic";
  if (page === "process") return "tools";
  if (["discover", "topology", "semantic-neighborhood", "semantic-map", "connection-opportunities"].includes(page)) return "semantic";
  return page === "connect" ? "settings" : page;
}

export function renderWorkspaceShell(parent: HTMLElement, route: VeynrelHealthRoute, scope: VaultScopeIndex, _vaultName: string,
  navigate: (route: VeynrelHealthRoute) => void, select: (path?: string) => void, state: { menuOpen: boolean }, audit?: () => void, tag?: () => void, settings?: () => void, history?: () => void, app?: App): HTMLElement {
  const shell = parent.createDiv({ cls: "veynrel-shell", attr: { "data-menu-open": String(state.menuOpen) } });
  const content = shell.createDiv({ cls: "veynrel-shell-content" });
  const top = content.createEl("header", { cls: "veynrel-topbar" });
  if (route.page !== "home") healthButton(content, "← " + t("@workspace.home"), () => navigate({ page: "home" }), "nav-home").addClass("veynrel-overview-back");
  const extra = top.createEl("details", { cls: "veynrel-workspace-more", attr: { "data-health-disclosure": "workspace-more" } });
  const summary = extra.createEl("summary", { attr: { "aria-label": t("@ux.more"), "data-health-action": "workspace-menu" } });
  setIcon(summary, "settings");
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
  if (route.page === "discover" || route.page === "semantic-scenario" && ["map", "families", "pair"].includes(route.entry.intent)) {
    const label = content.createDiv({ cls: "veynrel-scope-picker" });
    const picker = healthButton(label, scope.selection.kind === "all" ? t("@workspace.all") : scope.selection.path, () => {
      if (!app) return;
      const folders = [{ path: "", count: scope.snapshot.paths.length }, ...scope.snapshot.folders];
      new class extends FuzzySuggestModal<typeof folders[number]> {
        getItems() { return folders; }
        getItemText(folder: typeof folders[number]) { return folder.path ? `${folder.path} (${folder.count})` : t("@workspace.all"); }
        onChooseItem(folder: typeof folders[number]) { select(folder.path || undefined); }
      }(app).open();
    }, "scope-picker");
    picker.setAttribute("aria-label", t("@workspace.folders"));
  }
  return content.createDiv({ cls: "veynrel-shell-main" });
}
