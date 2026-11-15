import { LocalNoteApplyModal } from "./localNoteApplyModal";
import { FuzzySuggestModal, Modal } from "obsidian";
import type { App, TFile } from "obsidian";
import { t } from "../i18n";
import { orgText } from "./organizationView";
import { SafeApplyError } from "./operationJournal";
import { ObsidianLocalNote } from "./obsidianLocalNote";
import type { LocalPreparation } from "./obsidianLocalNote";
import { localTag, tagRanges, LocalNoteError } from "./localNotePlan";
import type { LocalChoice } from "./localNotePlan";
import { scanTaxonomy, taxonomyFileEligible } from "./taxonomyScan";
import type { TaxonomyInventory } from "./taxonomyScan";
import type { SafeApplyService } from "./safeApply";
import { focusStatus } from "./consolidationUx";

function button(root: HTMLElement, text: string, key: string, fn: () => void): HTMLButtonElement {
  const b = root.createEl("button", { text, attr: { type: "button", "data-local-note": key } }); b.addEventListener("click", fn); return b;
}
export class LocalNotePicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private readonly choose: (path: string) => void, private readonly exclusions: string[] = []) { super(app); this.setPlaceholder(t("@tagRec.select")); }
  getItems(): TFile[] { return this.app.vault.getMarkdownFiles().filter(f => taxonomyFileEligible(this.app, f, this.exclusions)); }
  getItemText(file: TFile): string { return file.path; }
  onChooseItem(file: TFile): void { this.choose(file.path); }
}
/** An explicit saved-file read, not permission to write or to infer a tag's meaning. */
export class LocalNoteModal extends Modal {
  private active = false;
  private abort = new AbortController();
  constructor(app: App, private readonly path: string, private readonly kind: LocalChoice["kind"], private readonly native: ObsidianLocalNote,
    private readonly service: SafeApplyService, private readonly history: () => void, private inventory?: TaxonomyInventory) { super(app); }
  onOpen(): void {
    this.active = true; this.modalEl.addClass("ai-pair-inspector-modal"); this.contentEl.addClass("ai-change-planner", "ai-local-note");
    this.titleEl.setText(t(this.kind === "add_inline_tag" ? "@localNote.tag" : "@localNote.repair"));
    this.contentEl.createEl("p", { text: t("@safeApply.checking"), attr: { role: "status" } }); void this.load();
  }
  private error(error: unknown): void {
    if (!this.active) return;
    this.contentEl.empty(); this.contentEl.createEl("p", { text: t(error instanceof LocalNoteError ? `@localNote.${error.reason}` : error instanceof SafeApplyError ? `@safeApply.error.${error.reason}` : "@localNote.unavailable"), attr: { role: "alert" } });
    this.contentEl.createEl("p", { text: t("@localNote.limits") }); focusStatus(this.contentEl);
  }
  private async load(): Promise<void> {
    try {
      const p = await this.native.prepare(this.path); if (!this.active) return;
      this.contentEl.empty(); this.contentEl.createEl("p", { text: this.path, cls: "ai-pair-path" });
      this.contentEl.createEl("p", { text: t("@localNote.limits") });
      if (this.kind === "add_inline_tag") this.tags(p); else this.links(p);
    } catch (e) { this.error(e); }
  }
  private async review(p: LocalPreparation, choice: LocalChoice): Promise<void> {
    try {
      const plan = await this.native.plan(p, choice); if (!this.active) return;
      this.close(); new LocalNoteApplyModal(this.app, this.service, current => this.service.localNote!.review(plan, current), this.history).open();
    } catch (e) { this.error(e); }
  }
  private select(label: string, key: string, parent: HTMLElement = this.contentEl): HTMLSelectElement {
    const select = parent.createEl("label", { text: label }).createEl("select", { attr: { "data-local-note": key } });
    select.createEl("option", { text: t("@localLink.choose"), value: "" }); return select;
  }
  private tags(p: LocalPreparation): void {
    const chosen = this.select(orgText("Tag and origin", "Тег и происхождение"), "tag-choice");
    chosen.createEl("option", { text: orgText("Enter a candidate manually", "Ввести кандидат вручную"), value: "manual" });
    const values = new Map<string, Set<string>>();
    const add = (tag: string, origin: string) => {
      if (!localTag(tag) || p.definitions?.tags.some(t => t.tag.toLowerCase() === tag.toLowerCase() && t.state !== "allowed")) return;
      const origins = values.get(tag) ?? new Set<string>(); origins.add(origin); values.set(tag, origins);
    };
    const allowed = orgText("confirmed rule (may be unused)", "подтверждённое правило (может не использоваться)");
    for (const tag of p.definitions?.tags ?? []) if (tag.state === "allowed") add(tag.tag, allowed);
    for (const c of p.profile?.categories ?? []) for (const tag of c.tags) add(tag, allowed);
    for (const row of this.inventory?.tags ?? []) add(row.tag, orgText("observed, suitability unverified", "наблюдался, применимость не проверена"));
    for (const [tag, origins] of [...values].slice(0, 500)) chosen.createEl("option", { text: `${tag} · ${[...origins].join("; ")}`, value: tag });
    this.contentEl.createEl("p", { text: orgText("Up to 500 choices. A prefix does not establish suitability. Excluded/deprecated and flashcards tags are not offered. Manual candidates do not change rules.",
      "До 500 вариантов. Префикс не доказывает применимость. Исключённые, устаревшие и flashcards-теги не предлагаются. Ручной кандидат не меняет правила.") });
    const manual = this.contentEl.createDiv({ cls: "ai-local-note-field", attr: { "data-local-note-block": "manual" } });
    const input = manual.createEl("label", { text: orgText("Manual candidate (without #)", "Ручной кандидат (без #)") }).createEl("input", { type: "text", attr: { "data-local-note": "tag" } }); input.disabled = true;
    const inventoryBlock = this.contentEl.createDiv({ cls: "ai-local-note-field", attr: { "data-local-note-block": "inventory" } });
    if (this.inventory) inventoryBlock.createEl("p", { text: `${t(`@taxonomy.scan.${this.inventory.state}`)} · ${this.inventory.processed}/${this.inventory.total} · ${orgText("metadata unavailable", "кеш недоступен")}: ${this.inventory.unavailable}` });
    if (!this.inventory) { const scan = button(inventoryBlock, orgText("Read local tag inventory (whole vault)", "Прочитать локальный инвентарь тегов (всё хранилище)"), "inventory", () => {
      scan.disabled = true;
      void scanTaxonomy(this.app, p.registryPath ? [p.registryPath] : [], this.abort.signal, () => {}, undefined, { kind: "all" }).then(inventory => { if (this.active) { this.inventory = inventory; void this.load(); } }).catch(e => this.error(e));
    }); }
    const paragraph = this.contentEl.createDiv({ cls: "ai-local-note-field", attr: { "data-local-note-block": "paragraph" } });
    const ranges = tagRanges(p.source, p.metadata), range = this.select(t("@planner.location"), "range", paragraph);
    ranges.forEach((r, i) => range.createEl("option", { text: `[${r.start}, ${r.end}) ${r.text.slice(0, 100)}`, value: String(i) }));
    const selected = paragraph.createEl("pre", { cls: "ai-pair-source", attr: { tabindex: "0" } });
    const actions = this.contentEl.createDiv({ cls: "ai-local-note-field", attr: { "data-local-note-block": "review" } });
    const review = button(actions, t("@safeApply.review"), "review", () => {
      if (!review.disabled) void this.review(p, { kind: "add_inline_tag", tag: chosen.value === "manual" ? input.value : chosen.value, range: ranges[Number(range.value)] });
    }); review.disabled = true;
    const hint = actions.createEl("p", { attr: { role: "status" } });
    const update = () => {
      input.disabled = chosen.value !== "manual";
      selected.setText(range.value === "" ? "" : ranges[Number(range.value)]?.text ?? "");
      review.disabled = range.value === "" || !localTag(chosen.value === "manual" ? input.value : chosen.value);
      hint.setText(review.disabled ? orgText("Choose a paragraph and a tag using letters, numbers, _ or - separated by /. Pure numbers and flashcards are unsupported.", "Выберите абзац и тег из букв, цифр, _ или -, с разделителем /. Только цифры и flashcards не поддерживаются.") : "");
    };
    chosen.addEventListener("change", update); input.addEventListener("input", update); range.addEventListener("change", update); update(); chosen.focus();
  }
  private links(p: LocalPreparation): void {
    const ranges = this.native.unresolved(p), occurrence = this.select(orgText("Choose one current unresolved occurrence", "Выберите одно актуальное неразрешённое вхождение"), "occurrence");
    ranges.forEach((r, i) => occurrence.createEl("option", { text: `[${r.start}, ${r.end}) ${p.source.content.slice(Math.max(0, r.start - 35), r.end + 35)}`, value: String(i) }));
    const destination = this.contentEl.createEl("p", { text: orgText("No target selected", "Цель не выбрана") }); let path: string | undefined;
    const review = button(this.contentEl, t("@safeApply.review"), "review", () => {
      if (!path || review.disabled) return;
      void this.native.target(path).then(target => this.review(p, { kind: "repair_wikilink", range: ranges[Number(occurrence.value)], target })).catch(e => this.error(e));
    }); review.disabled = true;
    button(this.contentEl, orgText("Choose existing target note", "Выбрать существующую целевую заметку"), "target", () => new LocalNotePicker(this.app, selected => {
      if (!this.active) return; path = selected; destination.setText(selected); review.disabled = occurrence.value === "";
    }).open());
    occurrence.addEventListener("change", () => { review.disabled = !path || occurrence.value === ""; });
    if (!ranges.length) this.contentEl.createEl("p", { text: t("@localNote.unavailable"), attr: { role: "status" } });
    this.contentEl.createEl("p", { text: orgText("Only the chosen occurrence changes. Other unresolved links remain. A new Health check must verify the Finding; writing does not resolve it automatically.",
      "Меняется только выбранное вхождение. Остальные ссылки остаются. Находку должен подтвердить новый Health-скан; запись не закрывает её автоматически.") }); occurrence.focus();
  }
  onClose(): void { this.active = false; this.abort.abort(); this.contentEl.empty(); }
}
