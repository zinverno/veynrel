import { t } from "../../i18n";
import { healthButton } from "../ui/renderHealthHome";
import type { FamilyProjection, SemanticFamily } from "./workbenchFamilies";

export interface FamilyBrowserState { open: boolean; query: string; selected?: string }
export function renderFamilies(parent: HTMLElement, projection: FamilyProjection | undefined, state: FamilyBrowserState,
  actions: { current(): boolean; select(family: SemanticFamily): void; note(path: string): void; back(): void }): void {
  const details = parent.createEl("details", { cls: "veynrel-families", attr: { "data-health-disclosure": "families" } });
  details.open = state.open;
  details.addEventListener("toggle", () => { if (actions.current()) state.open = details.open; });
  details.createEl("summary", { text: t("@r062.families", { count: projection?.families.length ?? 0 }), attr: { "data-health-action": "workbench-families" } });
  details.createEl("p", { text: t(projection ? "@r062.family-limits" : "@r062.family-unavailable") });
  if (!projection) return;
  details.createEl("p", { text: t("@r062.family-coverage", { represented: projection.represented, computed: projection.map.nodes.length, indexed: projection.map.indexedNoteCount }) });
  const selected = projection.families.find(f => f.id === state.selected);
  if (selected) {
    const context = details.createDiv({ attr: { "data-family-selected": selected.id } });
    context.createEl("h2", { text: t("@r062.family-name", { count: selected.paths.length }) });
    healthButton(context, t("@mapnav.overview"), () => { if (actions.current()) actions.back(); }, "workbench-family-back");
    const list = context.createEl("ul");
    for (const path of selected.paths) healthButton(list.createEl("li"), path, () => { if (actions.current()) actions.note(path); }, `family-note-${encodeURIComponent(path)}`);
    const basis = context.createEl("details"); basis.createEl("summary", { text: t("@r062.family-basis") });
    basis.createEl("p", { text: t("@r062.family-method") });
    for (const edge of selected.relationships) basis.createEl("p", { text: `${edge.left} ↔ ${edge.right} · ${edge.score.toFixed(4)}` });
    basis.createEl("pre", { text: JSON.stringify({ revision: projection.map.revision, scope: projection.map.scope && { id: projection.map.scope.id, revision: projection.map.scope.revision } }, null, 2) });
    return;
  }
  const input = details.createEl("input", { type: "search", attr: { "aria-label": t("@r062.family-search"), placeholder: t("@r062.family-search"), "data-health-action": "workbench-family-search" } });
  input.value = state.query;
  const status = details.createEl("p", { attr: { role: "status" } }), list = details.createEl("ul");
  const update = (): void => {
    if (!actions.current()) return;
    state.query = input.value; list.empty();
    const found = projection.families.filter(f => f.paths.some(path => path.toLocaleLowerCase().includes(state.query.trim().toLocaleLowerCase())));
    status.setText(found.length ? t("@r062.family-count", { shown: Math.min(20, found.length), total: found.length }) : t("@r062.family-empty"));
    for (const family of found.slice(0, 20)) {
      const row = list.createEl("li");
      const button = healthButton(row, t("@r062.family-name", { count: family.paths.length }), () => { if (actions.current()) actions.select(family); }, `family-${encodeURIComponent(family.id)}`);
      button.setAttribute("data-semantic-family", family.id); button.setAttribute("aria-pressed", String(state.selected === family.id));
      row.createEl("small", { text: family.paths.join(" · ") });
    }
  };
  input.addEventListener("input", update); update();
}
