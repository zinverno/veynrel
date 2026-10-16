import { App, Modal } from "obsidian";
import { dateLocale, t as tr } from "../i18n";
import { openDiscoveryResult } from "../semantic/semanticDiscoveryModal";
import { readPairNote } from "./pairSnapshot";
import type { InspectorList, PairNoteSnapshot } from "./pairSnapshot";

/** One disposable view: listeners only invalidate; reading requires open or refresh. */
export class PairInspectorModal extends Modal {
  private openState = false;
  private generation = 0;
  private readonly cleanup: (() => void)[] = [];

  constructor(app: App, private readonly paths: readonly [string, string]) { super(app); }

  onOpen(): void {
    this.openState = true;
    this.modalEl.addClass("ai-pair-inspector-modal");
    this.titleEl.setText(tr("@consolidation.title"));
    this.contentEl.empty();
    this.contentEl.addClass("ai-pair-inspector");
    this.contentEl.createEl("p", { text: tr("@consolidation.scope") });
    this.contentEl.createEl("p", { text: tr("@consolidation.sourceScope") });
    const controls = this.contentEl.createDiv({ cls: "ai-semantic-search-controls" });
    const refresh = controls.createEl("button", { text: tr("@consolidation.refresh"), attr: { type: "button" } });
    const status = this.contentEl.createDiv({ attr: { role: "status", "aria-live": "polite" } });
    const notes = this.contentEl.createDiv({ cls: "ai-pair-notes" });
    const invalidate = () => {
      if (!this.openState) return;
      this.generation++;
      notes.setAttribute("aria-busy", "false");
      status.setAttribute("data-state", "stale");
      status.setText(tr("@consolidation.stale"));
    };
    // Any vault change can affect incoming references; do no work until Refresh.
    for (const ref of [this.app.vault.on("create", invalidate), this.app.vault.on("modify", invalidate),
      this.app.vault.on("delete", invalidate), this.app.vault.on("rename", invalidate)]) {
      this.cleanup.push(() => this.app.vault.offref(ref));
    }
    if (this.app.metadataCache) {
      for (const ref of [this.app.metadataCache.on("changed", invalidate), this.app.metadataCache.on("resolved", invalidate)]) {
        this.cleanup.push(() => this.app.metadataCache.offref(ref));
      }
    }
    const load = async () => {
      if (!this.openState) return;
      const generation = ++this.generation;
      notes.empty();
      notes.setAttribute("aria-busy", "true");
      status.setAttribute("data-state", "loading");
      status.setText(tr("@consolidation.loading"));
      const snapshots = await Promise.all(this.paths.map(path => readPairNote(this.app, path)));
      if (!this.openState || generation !== this.generation) return;
      notes.setAttribute("aria-busy", "false");
      status.setAttribute("data-state", "ready");
      status.setText(tr("@consolidation.loaded"));
      for (const snapshot of snapshots) this.renderNote(notes, snapshot);
    };
    refresh.addEventListener("click", () => { void load(); });
    void load();
  }

  onClose(): void {
    this.openState = false;
    this.generation++;
    for (const remove of this.cleanup.splice(0)) remove();
    this.contentEl.empty();
  }

  private renderNote(container: HTMLElement, note: PairNoteSnapshot): void {
    const card = container.createDiv({ cls: "ai-semantic-result-card ai-pair-note" });
    card.createEl("h3", { text: note.name ?? note.path });
    card.createDiv({ cls: "ai-semantic-result-path", text: note.path });
    if (note.state !== "ready") {
      card.createEl("p", { text: tr(`@consolidation.${note.state}`) });
      return;
    }
    const open = card.createEl("button", { text: tr("@consolidation.open"), attr: {
      type: "button", "aria-label": tr("Открыть заметку {path}", { path: note.path }),
    } });
    open.addEventListener("click", () => { void openDiscoveryResult(this.app, note.path, undefined, () => {}); });
    card.createEl("p", { text: tr("@consolidation.size", { bytes: note.bytes!, characters: note.characters! }) });
    card.createEl("p", { text: tr("@consolidation.modified", { time: new Date(note.modified!).toLocaleString(dateLocale()) }) });
    card.createEl("h4", { text: tr("@consolidation.source") });
    if (note.preview!.length < note.characters!) card.createEl("p", { text: tr("@consolidation.truncated", { shown: note.preview!.length, total: note.characters! }) });
    if (note.characters === 0) card.createEl("p", { text: tr("@consolidation.empty") });
    card.createEl("pre", { cls: "ai-pair-source", text: note.preview, attr: { tabindex: "0", "aria-label": tr("@consolidation.source") } });
    card.createEl("h4", { text: tr("@consolidation.metadata") });
    card.createEl("p", { text: tr("@consolidation.cacheScope") });
    if (note.metadata) {
      for (const [key, values] of Object.entries(note.metadata)) this.renderList(card, key, values);
    } else card.createEl("p", { text: tr("@consolidation.unavailable") });
    this.renderList(card, "incoming", note.incoming);
  }

  private renderList(card: HTMLElement, key: string, values?: InspectorList): void {
    const details = card.createEl("details");
    details.createEl("summary", { text: `${tr(`@consolidation.${key}`)}${values ? ` (${values.total})` : ""}` });
    if (!values) { details.createEl("p", { text: tr("@consolidation.unavailable") }); return; }
    if (values.total === 0) details.createEl("p", { text: tr("@consolidation.noCachedEntries") });
    if (values.items.length < values.total) details.createEl("p", { text: tr("@consolidation.listTruncated", { shown: values.items.length, total: values.total }) });
    const list = details.createEl("ul");
    for (const text of values.items) list.createEl("li", {
      text: text.length > 500 ? `${text.slice(0, 500)}${tr("@consolidation.entryTruncated")}` : text,
    });
  }
}
