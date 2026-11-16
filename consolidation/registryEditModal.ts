import { Modal } from "obsidian";
import type { App } from "obsidian";
import { t } from "../i18n";
import { orgText } from "./organizationView";
import { OrganizationError, parseOrganizationDocument } from "./organizationProfile";
import type { OrganizationDefinitions } from "./organizationProfile";
import { registryKey, RegistryUnchangedError } from "./registryPlan";
import type { RegistryChoice, RegistryKind } from "./registryPlan";
import { RegistryApplyModal } from "./registryApplyModal";
import { SafeApplyError } from "./operationJournal";
import type { SafeApplyService } from "./safeApply";
import type { ObsidianRegistry } from "./obsidianRegistry";
import type { SavedNote } from "./savedNote";
import { TAXONOMY_PURPOSES } from "./taxonomyProfile";

/** One chosen definition, in-memory draft only; the connected file remains authoritative. */
export class RegistryEditModal extends Modal {
  private active = false; private busy = false; private source?: SavedNote; private definitions?: OrganizationDefinitions;
  private kind: RegistryKind = "tag"; private key: string | null = null; private value: NonNullable<RegistryChoice["value"]> = { tag: "", state: "allowed", description: "" };
  private removing = false; private alert?: HTMLElement;
  constructor(app: App, private readonly native: ObsidianRegistry, private readonly service: SafeApplyService, private readonly history: () => void) { super(app); }
  onOpen(): void {
    this.active = true; this.modalEl.addClass("ai-taxonomy-modal"); this.contentEl.addClass("ai-taxonomy", "ai-registry-editor");
    this.titleEl.setText(orgText("Edit registry definitions", "Изменить определения реестра"));
    this.contentEl.createEl("p", { text: t("@safeApply.checking"), attr: { role: "status" } });
    void this.load();
  }
  private async load(): Promise<void> {
    try { const source = await this.native.read(); if (!this.active) return; this.source = source; this.definitions = parseOrganizationDocument(source.content); this.render(); }
    catch (error) { if (this.active) { this.contentEl.empty(); this.alert = this.contentEl.createEl("p", { attr: { role: "alert" } }); this.error(error); } }
  }
  private error(error: unknown): void {
    this.alert?.setText(error instanceof RegistryUnchangedError ? orgText("No definition changes. Nothing was written.", "Определения не изменены. Записи не было.") :
      error instanceof OrganizationError ? orgText("Invalid or unsupported definitions. Nothing was overwritten; preserve the original registry.", "Определения повреждены или не поддерживаются. Перезаписи нет; сохраните исходный реестр.") :
        t(`@safeApply.error.${error instanceof SafeApplyError ? error.reason : "stale"}`));
    this.alert?.focus();
  }
  private options(root: HTMLElement, key: string, label: string, value: string, options: [string, string][], change: (value: string) => void): void {
    const row = root.createEl("label", { text: label, cls: "ai-taxonomy-field" });
    const select = row.createEl("select", { attr: { "data-registry-field": key } });
    for (const [id, text] of options) select.createEl("option", { value: id, text }); select.value = value;
    select.addEventListener("change", () => change(select.value));
  }
  private text(root: HTMLElement, key: string, label: string, value: string, change: (value: string) => void, multiline = false): void {
    const row = root.createEl("label", { text: label, cls: "ai-taxonomy-field" });
    const input = multiline ? row.createEl("textarea", { attr: { rows: "3", "data-registry-field": key } }) : row.createEl("input", { type: "text", attr: { "data-registry-field": key } });
    input.readOnly = this.key !== null && (key === "tag" || key === "id");
    input.value = value; input.addEventListener("input", () => change(input.value));
  }
  private entries(): NonNullable<RegistryChoice["value"]>[] {
    return this.kind === "tag" ? this.definitions!.tags : this.kind === "convention" ? this.definitions!.conventions : this.definitions!.profile.categories;
  }
  private select(key: string | null): void {
    this.key = key; this.removing = false;
    this.value = key !== null ? structuredClone(this.entries().find(entry => registryKey(this.kind, entry) === key)!) :
      this.kind === "tag" ? { tag: "", state: "allowed", description: "" } : this.kind === "convention" ? { subject: "folder", value: "", description: "" } :
        { id: "", name: "", purpose: "other", multiplicity: "multiple", interpretation: "global", prefixes: [], tags: [] };
    this.render();
  }
  private render(): void {
    this.contentEl.empty(); this.contentEl.createEl("p", { text: this.source!.path, cls: "ai-pair-path" });
    this.contentEl.createEl("p", { text: orgText("Edit one definition. The full Markdown and diff follow before a separate confirmation. Notes and the settings profile are unchanged; existing unused and flashcards tags are preserved.", "Измените одно определение. Полный Markdown и diff будут показаны до отдельного подтверждения. Заметки и профиль настроек не меняются; неиспользуемые и flashcards-теги сохраняются.") });
    const form = this.contentEl.createEl("fieldset"); form.disabled = this.busy;
    this.options(form, "kind", orgText("Definition", "Определение"), this.kind, [["tag", orgText("Tag", "Тег")], ["convention", orgText("Convention", "Соглашение")], ["category", orgText("Profile category", "Категория профиля")]], value => { this.kind = value as RegistryKind; this.select(null); });
    this.options(form, "entry", orgText("Select an existing entry or add one", "Выберите существующее или добавьте новое"), this.key ?? "", [["", orgText("New definition", "Новое определение")], ...this.entries().map(entry => [registryKey(this.kind, entry), registryKey(this.kind, entry)] as [string, string])], value => this.select(value || null));
    if (this.kind === "tag") {
      const value = this.value as OrganizationDefinitions["tags"][number];
      this.text(form, "tag", orgText("Literal tag (without #)", "Тег без # (точное написание)"), value.tag, text => { value.tag = text; });
      this.options(form, "state", orgText("Status", "Статус"), value.state, [["allowed", orgText("Allowed (including unused)", "Разрешён (включая неиспользуемые)")], ["excluded", orgText("Excluded", "Исключён")], ["deprecated", orgText("Deprecated", "Устарел")]], text => { value.state = text as typeof value.state; });
      this.text(form, "description", orgText("Description", "Описание"), value.description, text => { value.description = text; }, true);
    } else if (this.kind === "convention") {
      const value = this.value as OrganizationDefinitions["conventions"][number];
      this.options(form, "subject", orgText("Applies to", "Относится к"), value.subject, [["folder", orgText("Folder", "Папка")], ["property", orgText("Property", "Свойство")], ["type", orgText("Type", "Тип")]], text => { value.subject = text as typeof value.subject; });
      this.text(form, "value", orgText("Literal value", "Точное значение"), value.value, text => { value.value = text; });
      this.text(form, "description", orgText("Meaning / description", "Значение / описание"), value.description, text => { value.description = text; }, true);
    } else {
      const value = this.value as OrganizationDefinitions["profile"]["categories"][number];
      this.text(form, "id", orgText("Category ID", "ID категории"), value.id, text => { value.id = text; });
      this.text(form, "name", t("@taxonomy.name"), value.name, text => { value.name = text; });
      this.options(form, "purpose", t("@taxonomy.purpose"), value.purpose, TAXONOMY_PURPOSES.map(p => [p, t(`@taxonomy.purpose.${p}`)]), text => { value.purpose = text as typeof value.purpose; });
      this.options(form, "multiplicity", t("@taxonomy.multiplicity"), value.multiplicity, ["one_primary", "multiple"].map(p => [p, t(`@taxonomy.multiplicity.${p}`)]), text => { value.multiplicity = text as typeof value.multiplicity; });
      this.options(form, "interpretation", t("@taxonomy.interpretation"), value.interpretation, ["global", "domain"].map(p => [p, t(`@taxonomy.interpretation.${p}`)]), text => { value.interpretation = text as typeof value.interpretation; });
      this.text(form, "prefixes", t("@taxonomy.prefixes"), value.prefixes.join("\n"), text => { value.prefixes = text.split("\n").filter(Boolean); }, true);
      this.text(form, "tags", t("@taxonomy.flatTags"), value.tags.join("\n"), text => { value.tags = text.split("\n").filter(Boolean); }, true);
    }
    if (this.key !== null) {
      const remove = form.createEl("label", { cls: "ai-planner-confirm" });
      const input = remove.createEl("input", { type: "checkbox", attr: { "data-registry-field": "remove" } }); input.checked = this.removing;
      remove.createSpan({ text: orgText("Remove this selected definition instead of editing it", "Удалить выбранное определение вместо редактирования") }); input.addEventListener("change", () => { this.removing = input.checked; });
      form.createEl("p", { text: orgText("Removal changes rules only. It does not remove usages from notes or other category assignments. The full definitions diff shows what remains; no vault-wide usage check is implied.", "Удаление меняет только правила. Теги и свойства заметок, назначения других категорий сохраняются. Полный diff покажет оставшиеся определения; проверка всех использований в хранилище не выполняется.") });
    }
    this.alert = this.contentEl.createEl("p", { attr: { role: "alert", tabindex: "-1" } });
    const review = form.createEl("button", { text: t("@safeApply.review"), attr: { type: "button", "data-registry-action": "review" } }); review.addEventListener("click", () => { void this.review(); });
  }
  private async review(): Promise<void> {
    if (this.busy || !this.active || !this.source) return; this.busy = true;
    try {
      const choice = { kind: this.kind, key: this.key, value: this.removing ? null : structuredClone(this.value) } as RegistryChoice;
      const plan = await this.native.plan(this.source, choice);
      if (!this.active) return; this.close();
      new RegistryApplyModal(this.app, this.service, current => this.service.registry!.review(plan, current), this.history).open();
    } catch (error) { if (this.active) this.error(error); } finally { this.busy = false; }
  }
  onClose(): void { this.active = false; this.contentEl.empty(); }
}
