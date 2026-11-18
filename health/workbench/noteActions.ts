import { t } from "../../i18n";
import { healthButton, healthDetails } from "../ui/renderHealthHome";

/** Launchers only. Preparation, consent and writes belong to the existing operation owners. */
export interface NoteActions {
  open(path: string): void;
  tag?(path: string): void;
  link?(paths: readonly [string, string]): void;
  atomize?(path: string): void;
  studio?(path: string): void;
}
export function renderNoteActions(parent: HTMLElement, paths: readonly string[], actions: NoteActions, current: () => boolean): void {
  const bar = parent.createDiv({ cls: "veynrel-note-actions", attr: { "aria-label": t("@uxb.actions") } });
  const button = (label: string, id: string, action: () => void) => healthButton(bar, label, () => { if (current()) action(); }, id);
  if (paths.length === 1) {
    button(t("@uxb.open"), "note-open", () => actions.open(paths[0]));
    if (actions.tag) button(t("@uxb.tag"), "note-tag", () => actions.tag!(paths[0]));
    const more = healthDetails(bar, t("@ux.more"), "note-more");
    if (actions.studio) healthButton(more, "Veynrel Studio…", () => { if (current()) actions.studio!(paths[0]); }, "note-studio");
    if (actions.atomize) healthButton(more, t("@processing.atomization"), () => { if (current()) actions.atomize!(paths[0]); }, "note-atomize");
  }
  if (paths.length === 2 && actions.link) button(t("@uxb.link"), "note-link", () => actions.link!([paths[0], paths[1]]));
}
