import { App, Modal, TFile, TFolder, normalizePath, setIcon } from "obsidian";
import type { ClusterRecord } from "./noteIndex";
import type { AIHubSettings } from "./settings";
import { languageModelSettingsSnapshot } from "./deep/product/languageModelSettingsPort";
import { currentLanguage, t } from "./i18n";
import { validateSettings } from "./api";
import { healthButton } from "./health/ui/renderHealthHome";

/** Read only: capture the inputs and existing destination files before asking permission. */
export async function prepareMocs(app: App, clusters: ClusterRecord[], settings: AIHubSettings) {
  const copied = clusters.map(c => ({ ...c, filePaths: [...(c.filePaths ?? [])] }));
  const folder = normalizePath(settings.mocFolder.replace(/\/+$/, "") || "MOCs");
  const model = languageModelSettingsSnapshot(settings);
  const requests = copied.filter(c => !(c.description ?? "").trim()).length;
  const root = copied.length ? app.vault.getAbstractFileByPath(folder) : null;
  const files = root instanceof TFolder ? root.children.filter((f): f is TFile => f instanceof TFile && f.extension === "md") : [];
  const destinations = await Promise.all(files.map(async f => ({ path: f.path, content: await app.vault.read(f),
    generated: app.metadataCache.getFileCache(f)?.frontmatter?.["type"] === "moc" })));
  destinations.sort((a, b) => a.path.localeCompare(b.path));
  const language = currentLanguage();
  const error = root && !(root instanceof TFolder) ? t("@processing.folder-error") : requests ? validateSettings(model) : null;
  return { clusters: copied, folder, model, requests, error, language,
    signature: JSON.stringify({ clusters: copied, folder, model: requests ? model : undefined, language, exists: !!root, destinations }) };
}
export type MocPreparation = Awaited<ReturnType<typeof prepareMocs>>;

export class MocPreparationModal extends Modal {
  private settled = false;
  constructor(app: App, private readonly prepared: MocPreparation, private readonly resolve: (result: "confirm" | "audit" | "cancel") => void) { super(app); }
  onOpen(): void {
    this.titleEl.setText(t("@processing.moc"));
    this.contentEl.addClass("veynrel-moc-confirmation");
    const p = this.prepared;
    if (!p.clusters.length) {
      this.contentEl.createEl("p", { text: t("@processing.no-clusters") });
    } else {
      const summary = this.contentEl.createDiv({ cls: "veynrel-moc-summary" });
      setIcon(summary.createSpan({ attr: { "aria-hidden": "true" } }), "network");
      summary.createEl("h3", { text: t("@processing.clusters", { n: p.clusters.length }) });
      const data = summary.createEl("dl");
      data.createEl("dt", { text: t("@processing.folder") }); data.createEl("dd", { text: p.folder });
      summary.createEl("p", { text: t("@processing.write-effect") });
      this.contentEl.createEl("p", { text: t(p.requests ? "@processing.requests" : "@processing.no-requests", { n: p.requests, provider: p.model.provider, model: p.model.model }) });
      if (p.requests) this.contentEl.createEl("p", { cls: "veynrel-moc-cost", text: t("@processing.cost") });
      if (p.error) this.contentEl.createEl("p", { attr: { role: "alert" }, text: p.error });
    }
    const buttons = this.contentEl.createDiv({ cls: "modal-button-container" });
    healthButton(buttons, t("Отмена"), () => this.finish("cancel"), "moc-cancel");
    if (!p.clusters.length) healthButton(buttons, t("@processing.audit-action"), () => this.finish("audit"), "moc-audit", false, true);
    else healthButton(buttons, t(p.requests ? "@processing.confirm-requests" : "@processing.confirm"), () => this.finish("confirm"), "moc-confirm", !!p.error, true);
  }
  onClose(): void { this.contentEl.empty(); if (!this.settled) { this.settled = true; this.resolve("cancel"); } }
  private finish(result: "confirm" | "audit" | "cancel"): void {
    if (this.settled || (result === "confirm" && this.prepared.error)) return;
    this.settled = true; this.resolve(result); this.close();
  }
}
