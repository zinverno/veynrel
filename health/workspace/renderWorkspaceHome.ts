import { setIcon } from "obsidian";
import { t } from "../../i18n";
import { healthButton } from "../ui/renderHealthHome";
import type { HealthControllerState } from "../obsidian/healthPluginController";
import type { Finding } from "../domain/finding";
import { includesScope, scopeFindings, sceneFolders } from "./vaultScope";
import type { VaultScopeIndex } from "./vaultScope";

export function scopeName(index: VaultScopeIndex): string { return index.selection.kind === "all" ? t("@workspace.all") : index.selection.path; }
export function workspaceHeading(parent: HTMLElement, title: string, description?: string): void {
  const header = parent.createDiv({ cls: "veynrel-page-heading" });
  header.createEl("h1", { text: title, attr: { tabindex: "-1", "data-health-heading": "true" } });
  if (description) header.createEl("p", { text: description });
}

export function renderWorkspaceHome(parent: HTMLElement, index: VaultScopeIndex, vaultName: string, state: HealthControllerState,
  findings: readonly Finding[], motion: boolean, actions: { select: (path?: string) => void; open: () => void; recall: () => void;
    check: () => void; process: () => void; motion: () => void }): void {
  const home = parent.createEl("section", { cls: "veynrel-native-home" });
  home.createEl("p", { cls: "veynrel-page-index", text: `Veynrel / ${t("@workspace.home")}` });
  workspaceHeading(home, t("@workspace.headline"), t("@workspace.intro"));
  const grid = home.createDiv({ cls: "veynrel-home-grid" });
  const scene = grid.createEl("section", { cls: "veynrel-core-panel", attr: { "aria-label": t("@workspace.scope") } });
  const caption = scene.createDiv({ cls: "veynrel-core-caption" });
  caption.createEl("h2", { text: t("@workspace.your-vault"), cls: "veynrel-eyebrow" });
  caption.createEl("p", { text: `${t("@workspace.notes", { n: index.snapshot.paths.length })} · ${t("@workspace.areas", { n: index.snapshot.folders.length })}` });
  const universe = scene.createDiv({ cls: "veynrel-universe", attr: { "data-motion": String(motion) } });
  const svg = universe.createSvg("svg", { cls: "veynrel-core-svg", attr: { viewBox: "0 0 640 420", "aria-hidden": "true", fill: "none", preserveAspectRatio: "none" } });
  svg.createSvg("ellipse", { attr: { cx: "320", cy: "210", rx: "250", ry: "129", class: "veynrel-orbit" } });
  svg.createSvg("ellipse", { attr: { cx: "320", cy: "210", rx: "215", ry: "162", class: "veynrel-orbit", "stroke-dasharray": "2 9", transform: "rotate(-16 320 210)" } });
  const folders = sceneFolders(index.snapshot, index.selection);
  const slots = [[22, 27], [78, 27], [18, 59], [82, 59], [30, 82], [70, 82]];
  folders.forEach((folder, i) => {
    const selected = index.selection.kind === "folder" && !index.selection.missing && index.selection.path === folder.path;
    const [x, y] = slots[i];
    svg.createSvg("path", { attr: { d: `M320 210 Q${(320 + x * 6.4) / 2} 210 ${x * 6.4} ${y * 4.2}`, class: selected ? "veynrel-orbit is-selected" : "veynrel-orbit" } });
    const button = healthButton(universe, "", () => actions.select(folder.path), `scope-${i}`);
    button.addClass("veynrel-topic-node", `veynrel-topic-${i}`); button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("title", folder.path);
    button.createEl("strong", { text: folder.path }); button.createEl("small", { text: t("@workspace.notes", { n: folder.count }) });
  });
  const geometry = svg.createSvg("g", { cls: "veynrel-core-geometry" });
  // Fixed decorative geometry only; no note vectors or data-dependent layout.
  const points = Array.from({ length: 60 }, (_, i) => {
    const angle = i * 2.39996323, radius = 25 + Math.sqrt(i / 60) * 64;
    return [320 + Math.cos(angle) * radius, 210 + Math.sin(angle) * radius * .83];
  });
  points.forEach(([x, y], i) => {
    if (i > 3) { const [a, b] = points[i - 3]; geometry.createSvg("line", { attr: { x1: String(x), y1: String(y), x2: String(a), y2: String(b) } }); }
    geometry.createSvg("circle", { attr: { cx: String(x), cy: String(y), r: i % 7 ? "1.1" : "2" } });
  });
  const center = healthButton(universe, "", () => actions.select(), "scope-all"); center.addClass("veynrel-core-all");
  center.setAttribute("aria-pressed", String(index.selection.kind === "all"));
  center.createEl("strong", { text: t("@workspace.all") });
  center.createEl("small", { text: t("@workspace.notes", { n: index.snapshot.paths.length }) });
  const foot = scene.createDiv({ cls: "veynrel-core-foot" });
  foot.createSpan({ text: t("@workspace.order") });
  const toggle = healthButton(foot, t("@workspace.motion"), actions.motion, "workspace-motion"); toggle.setAttribute("aria-pressed", String(motion));
  const panel = grid.createEl("section", { cls: "veynrel-scope-card" });
  panel.createEl("p", { cls: "veynrel-eyebrow", text: t("@workspace.focus") });
  const icon = panel.createDiv({ cls: "veynrel-scope-icon", attr: { "aria-hidden": "true" } }); setIcon(icon, index.selection.kind === "all" ? "layers" : "folder");
  panel.createEl("h2", { text: scopeName(index) });
  const missing = index.selection.kind === "folder" && index.selection.missing;
  const selected = index.selection;
  const count = selected.kind === "all" ? index.snapshot.paths.length : index.snapshot.folders.find(folder => folder.path === selected.path)?.count ?? 0;
  panel.createEl("p", { cls: "veynrel-scope-source", text: missing ? t("@workspace.missing")
    : `${t("@workspace.notes", { n: count })} · ${index.selection.kind === "all" ? vaultName : t("@workspace.folder-source")}`,
    attr: missing ? { role: "alert" } : { title: t(index.selection.kind === "all" ? "@workspace.all-source" : "@workspace.folder-source") } });
  const metrics = panel.createDiv({ cls: "veynrel-scope-metrics" });
  const recall = state.snapshot?.recall;
  const metric = (value: string, label: string): void => { const cell = metrics.createDiv(); cell.createEl("strong", { text: value }); cell.createEl("small", { text: label }); };
  metric(index.selection.kind === "all" && recall?.loadState === "ready" && !recall.firstRun ? String(recall.due) : "—", t(index.selection.kind === "all" ? "@workspace.due" : "@workspace.folder-recall"));
  const stored = scopeFindings(findings, index.selection);
  const available = !missing && (state.snapshot?.initialization.storage.findings === "loaded" || findings.length > 0);
  metric(available ? String(stored.count) : "—", t("@workspace.observations"));
  panel.createEl("p", { cls: "veynrel-data-note", text: t(available ? "@workspace.not-checked" : "@workspace.unavailable") });
  if (stored.external) panel.createEl("p", { cls: "veynrel-data-note", text: t("@workspace.external", { n: stored.external }) });
  const bottom = panel.createDiv({ cls: "veynrel-scope-actions" });
  healthButton(bottom, t("@workspace.open"), actions.open, "open-scope", Boolean(missing), true);
  healthButton(bottom, t("@workspace.open-recall"), actions.recall, "home-recall");
  bottom.createEl("small", { text: t("@workspace.global-queue") });
  home.createEl("h2", { cls: "veynrel-home-section-title", text: t("@workspace.available") });
  const entries = home.createDiv({ cls: "veynrel-home-entries" });
  for (const [key, action] of [["check", actions.check], ["process", actions.process]] as const) {
    const card = entries.createEl("section"); card.createEl("h3", { text: t(`@workspace.${key}`) });
    card.createEl("p", { text: t(`@workspace.${key}-description`) }); healthButton(card, t(`@workspace.${key}`), action, `home-${key}`);
  }
  home.createEl("p", { cls: "veynrel-home-footnote", text: t("@workspace.decor") });
}

export function renderScopeNotes(parent: HTMLElement, index: VaultScopeIndex, query: string, limit: number,
  actions: { search: (query: string) => void; more: () => void; open: (path: string) => void }): void {
  workspaceHeading(parent, t("@workspace.map"), scopeName(index));
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
