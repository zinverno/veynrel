import type { App } from "obsidian";
import { currentLanguage } from "../i18n";
import { organizationSuggestions } from "./organizationAudit";
import type { OrganizationFact } from "./organizationAudit";
import { organizationDocument, organizationTagState, OrganizationError } from "./organizationProfile";
import type { OrganizationRegistry, RegistryReview } from "./organizationRegistry";
import type { TagTaxonomyProfile } from "./taxonomyProfile";
import type { TaxonomyInventory } from "./taxonomyScan";

export const orgText = (en: string, ru: string): string => currentLanguage() === "ru" ? ru : en;
function button(parent: HTMLElement, text: string, key: string, action: () => void, disabled = false): HTMLButtonElement {
  const element = parent.createEl("button", { text, attr: { type: "button", "data-org-action": key, "data-taxonomy-focus": "org-" + key } });
  element.disabled = disabled; element.addEventListener("click", action); return element;
}
function detail(parent: HTMLElement, title: string): HTMLDetailsElement { const el = parent.createEl("details"); el.createEl("summary", { text: title }); return el; }
const states = {
  complete: ["Snapshot complete", "Снимок собран"], partial: ["Partial snapshot", "Неполный снимок"], stale: ["Sources changed — scan again", "Источники изменились — повторите аудит"],
  cancelled: ["Audit cancelled — not a complete result", "Аудит отменён — результат неполный"], failed: ["Audit failed", "Аудит не выполнен"],
} as const;
function examples(parent: HTMLElement, paths: string[], app: App): void {
  for (const path of paths) button(parent, path, "source", () => { const file = app.vault.getFileByPath(path); if (file) void app.workspace.getLeaf(false).openFile(file); });
}
export function renderOrganizationSummary(parent: HTMLElement, inventory: TaxonomyInventory, profile: TagTaxonomyProfile | null,
  registry: OrganizationRegistry, app: App, dismiss: (id: string) => void, usePrefix: (prefix: string) => void): void {
  const snapshot = inventory.organization!;
  const state = states[snapshot.state];
  parent.createEl("h3", { text: orgText(state[0], state[1]), attr: { "data-org-state": snapshot.state } });
  parent.createEl("p", { text: orgText("Area: ", "Область: ") + (snapshot.scope.kind === "all" ? orgText("whole vault", "всё хранилище") : snapshot.scope.path) });
  parent.createEl("p", { text: orgText("Examined / in scope: ", "Рассмотрено / в области: ") + inventory.processed + " / " + inventory.total +
    orgText(" · excluded: ", " · исключено: ") + inventory.excluded + orgText(" · metadata unavailable: ", " · кеш недоступен: ") + inventory.unavailable +
    orgText(" · not examined: ", " · не рассмотрено: ") + (inventory.total - inventory.processed - inventory.excluded) });
  parent.createEl("p", { text: orgText("Local cached observations, not a reading of saved note contents. Cache freshness is not verifiable through this API; absence in the cache is not proof of absence in the note.",
    "Локальные наблюдения по кешу, без чтения содержимого заметок. API не подтверждает свежесть кеша; отсутствие в кеше не доказывает отсутствие в заметке.") });
  if (!inventory.total && snapshot.state === "complete") parent.createEl("p", { text: orgText("This area has no Markdown notes. No organization problem is inferred.", "В этой области нет Markdown-заметок. Это не проблема организации.") });
  const suggestions = registry.path && !registry.definitions ? [] : organizationSuggestions(inventory, profile, registry.definitions, registry.preferences.get().dismissed);
  if (registry.path && !registry.definitions) parent.createEl("p", { text: orgText("Read and review the selected registry before making suggestions under its rules. Local observations remain available.", "Прочитайте и проверьте выбранный реестр, чтобы предложения учитывали его правила. Локальные наблюдения доступны независимо.") });
  const advice = parent.createEl("section"); advice.createEl("h4", { text: orgText("Consider, if useful", "Можно рассмотреть") });
  if (!suggestions.length) advice.createEl("p", { text: orgText("Not enough evidence to suggest a structure yet, or unchanged suggestions were left as they are. Keeping the current organization is valid.", "Пока недостаточно данных, чтобы предложить структуру, либо неизменные предложения уже отклонены. Сохранить нынешнюю организацию — нормальное решение.") });
  for (const suggestion of suggestions) {
    const card = advice.createEl("article", { attr: { "data-org-suggestion": suggestion.id } });
    card.createEl("p", { text: (suggestion.origin === "rule" ? orgText("Confirmed rule", "Подтверждённое правило") : orgText("Hypothesis", "Гипотеза")) + " · " +
      (suggestion.kind === "prefix" ? "#" + suggestion.value + "/…" : "type: " + suggestion.value) });
    card.createEl("p", { text: orgText("Observed in ", "Наблюдается в ") + suggestion.notes + " / " + suggestion.denominator + orgText(" notes with available metadata in this area.", " заметок с доступным кешем в этой области.") });
    card.createEl("p", { text: suggestion.kind === "prefix" ? orgText("Reusing this existing prefix for suitable new material may make related categories easier to find. Its meaning and suitability remain unverified; similar names are not synonyms.",
      "Этот существующий префикс можно использовать для подходящих новых материалов: так категории легче находить. Значение и применимость не проверены; похожие имена не означают синонимы.") :
      orgText("This material type already occurs locally. Consider keeping that convention for suitable new material; the contents and meaning of these notes were not analyzed.",
        "Такой тип материала уже встречается. Можно сохранить это соглашение для подходящих новых заметок; содержимое и смысл заметок не анализировались.") });
    examples(card, suggestion.examples, app);
    if (suggestion.kind === "prefix" && !registry.path && !profile?.categories.some(category => category.prefixes.includes(suggestion.value)))
      button(card, orgText("Review as a draft rule", "Рассмотреть как черновик правила"), "draft-rule", () => usePrefix(suggestion.value));
    button(card, orgText("Leave as is", "Оставить как есть"), "dismiss", () => dismiss(suggestion.id));
  }
  const facts = detail(parent, orgText("Observations and note examples", "Наблюдения и примеры заметок"));
  const known = inventory.processed - inventory.unavailable;
  for (const [title, rows, denominator] of [
    [orgText("Folders (direct children)", "Папки (непосредственно внутри)"), snapshot.folders, inventory.processed],
    [orgText("Literal tag prefixes", "Буквальные префиксы тегов"), snapshot.prefixes, known],
    [orgText("Cached YAML properties", "YAML-свойства в кеше"), snapshot.properties, known],
    [orgText("Observed type values", "Наблюдаемые значения type"), snapshot.types, known],
  ] as [string, OrganizationFact[], number][]) {
    const group = detail(facts, title + " (" + rows.length + ")"); let offset = 0;
    const more = button(group, orgText("Show next 50", "Показать следующие 50"), "more-facts", () => append());
    const append = () => { for (const fact of rows.slice(offset, offset + 50)) { const row = group.createEl("p", { text: fact.value + ": " + fact.notes + " / " + denominator }); examples(row, fact.examples, app); } offset += 50; more.hidden = offset >= rows.length; };
    append();
  }
  facts.createEl("p", { text: orgText("Cached without tags / properties / type: ", "В кеше без тегов / свойств / type: ") + inventory.empty + " / " + snapshot.noPropertiesCount + " / " + snapshot.noTypeCount +
    orgText("; denominator for each: ", "; знаменатель для каждого: ") + known + orgText(". These are not problems by themselves.", ". Само по себе это не проблема.") });
  examples(facts, [...new Set([...snapshot.noTags, ...snapshot.noProperties])].slice(0, 5), app);
  const technical = detail(parent, orgText("Snapshot details and limitations", "Подробности снимка и ограничения"));
  technical.createEl("p", { text: new Date(snapshot.finishedAt).toISOString() + " · " + snapshot.revision });
  technical.createEl("pre", { text: JSON.stringify({ scope: snapshot.scope, exclusions: snapshot.exclusions, reasons: snapshot.reasons, sourceCount: snapshot.sources.length }, null, 2) });
  const definitions = registry.definitions ?? { version: 1 as const, profile: profile ?? { version: 1 as const, categories: [] }, tags: [], conventions: [] };
  const ruleTags = [...new Set([...definitions.tags.map(entry => entry.tag), ...definitions.profile.categories.flatMap(category => category.tags)])];
  if (ruleTags.length) {
    const rules = detail(parent, orgText("Declared tags (including unused)", "Объявленные теги (включая неиспользуемые)"));
    const observed = new Set(inventory.tags.map(entry => entry.tag));
    const labels = { observed: orgText("observed", "наблюдался"), "allowed-unused": orgText("allowed; not observed in this snapshot", "разрешён; не наблюдался в этом снимке"), excluded: orgText("excluded by user", "исключён пользователем"), deprecated: orgText("deprecated by user", "устаревший по решению пользователя"), candidate: orgText("unconfirmed candidate", "неподтверждённый кандидат"), unknown: orgText("unknown", "неизвестный") };
    let offset = 0; const more = button(rules, orgText("Show next 50", "Показать следующие 50"), "more-rules", () => append());
    const append = () => { for (const tag of ruleTags.slice(offset, offset + 50)) rules.createEl("p", { text: "#" + tag + " · " + labels[organizationTagState(tag, observed, definitions)] }); offset += 50; more.hidden = offset >= ruleTags.length; }; append();
  }
}

export class OrganizationRulesView {
  path: string;
  content: string;
  review?: RegistryReview;
  error = "";
  busy = false;
  private closed = false;
  private contentEdited = false;
  private operation?: AbortController;
  constructor(private readonly registry: OrganizationRegistry, profile: TagTaxonomyProfile | null, private readonly changed: () => void, private readonly reload: () => void) {
    this.path = registry.path ?? "Organization rules.md"; this.content = organizationDocument(profile);
  }
  close(): void { this.closed = true; this.operation?.abort(); }
  render(parent: HTMLElement, disabled: boolean): void {
    if (!this.contentEdited && !this.review && !this.busy) this.content = organizationDocument(this.registry.profile, this.registry.definitions ?? undefined);
    const root = detail(parent, orgText("Optional Markdown registry", "Необязательный Markdown-реестр"));
    root.open = !!this.review || !!this.error;
    root.createEl("p", { text: this.registry.path ? orgText("Active source: ", "Активный источник: ") + this.registry.path + orgText(". The settings profile is retained but dormant. A missing or changed file never silently falls back to it.", ". Профиль настроек сохранён, но не используется. При ошибке файла скрытого возврата к нему нет.") :
      orgText("Rules can stay in plugin settings. A Markdown registry is optional.", "Правила могут оставаться в настройках плагина. Markdown-реестр необязателен.") });
    root.createEl("p", { text: orgText("Registry state: ", "Состояние реестра: ") + this.stateLabel(), attr: { role: "status", "data-org-registry": this.registry.state } });
    if (this.error) root.createEl("p", { text: this.error, attr: { role: "alert" } });
    if (this.review) {
      const review = this.review;
      root.createEl("p", { text: review.kind === "disconnect" ? orgText("Disconnect and reactivate the unchanged profile in settings? The file stays untouched.", "Отключить реестр и вернуть неизменённый профиль настроек? Файл сохранится.") :
        (review.kind === "create" ? orgText("Create a new file at ", "Создать новый файл по пути ") : orgText("Use saved definitions from ", "Использовать сохранённые правила из ")) + review.path });
      root.createEl("pre", { text: review.content });
      root.createEl("p", { text: orgText("Review the complete content. Existing files are never overwritten. Connecting replaces the active rule source and discards this dialog's unsaved rule draft. Creating does not connect automatically.",
        "Проверьте всё содержимое. Существующие файлы не перезаписываются. Подключение сменит источник правил и отбросит несохранённый черновик правил этого окна. Создание не подключает файл автоматически.") });
      button(root, orgText("Confirm", "Подтвердить"), "registry-confirm", () => { void this.confirm(); }, this.busy || disabled);
      button(root, orgText("Back without saving", "Назад без сохранения"), "registry-back", () => { this.review = undefined; this.changed(); }, this.busy);
      return;
    }
    const field = root.createEl("label", { text: orgText("Vault-relative Markdown path", "Vault-relative путь Markdown") });
    const input = field.createEl("input", { type: "text", attr: { "data-org-field": "registry-path", "data-taxonomy-focus": "org-path" } }); input.value = this.path;
    input.addEventListener("input", () => { this.path = input.value; }); input.disabled = this.busy || disabled;
    button(root, orgText("Read and review existing file", "Прочитать и проверить файл"), "registry-connect", () => { void this.prepare("connect"); }, this.busy || disabled);
    if (this.registry.path) button(root, orgText("Review disconnection", "Рассмотреть отключение"), "registry-disconnect", () => { void this.prepare("disconnect"); }, this.busy || disabled);
    const create = detail(root, orgText("Create a new registry", "Создать новый реестр"));
    const label = create.createEl("label", { text: orgText("Complete new document (editable)", "Полный новый документ (можно изменить)") });
    const textarea = label.createEl("textarea", { attr: { rows: "12", "data-org-field": "registry-content", "data-taxonomy-focus": "org-content" } }); textarea.value = this.content;
    textarea.addEventListener("input", () => { this.content = textarea.value; this.contentEdited = true; }); textarea.disabled = this.busy || disabled;
    button(create, orgText("Preview creation", "Посмотреть перед созданием"), "registry-create", () => { void this.prepare("create"); }, this.busy || disabled);
  }
  private stateLabel(): string {
    const labels = { unloaded: orgText("not loaded; explicitly read the selected file", "не загружен; прочитайте выбранный файл явно"), ready: orgText("validated", "проверен"), created: orgText("created; connect separately if wanted", "создан; подключение отдельно по желанию"),
      missing: orgText("file missing", "файл отсутствует"), unsupported: orgText("unsupported version", "версия не поддерживается"), invalid: orgText("invalid path or document format", "неверный путь или формат документа"),
      changed: orgText("file changed; read and review again", "файл изменился; прочитайте и проверьте снова"), conflict: orgText("file or settings conflict; nothing overwritten", "конфликт файла или настроек; перезаписи нет"),
      save: orgText("save failed; inspect the destination before retrying", "ошибка сохранения; проверьте назначение перед повтором"), cancelled: orgText("cancelled", "отменено"), limit: orgText("document exceeds supported limits", "документ превышает ограничения") };
    return labels[this.registry.state];
  }
  private async prepare(kind: RegistryReview["kind"]): Promise<void> {
    if (this.busy || this.closed) return; this.busy = true; this.error = ""; this.changed();
    try { const review = await this.registry.prepare(kind, this.path, this.content); if (!this.closed) this.review = review; }
    catch { if (!this.closed) this.error = this.stateLabel(); }
    finally { this.busy = false; if (!this.closed) this.changed(); }
  }
  private async confirm(): Promise<void> {
    if (this.busy || this.closed || !this.review) return;
    const review = this.review; this.busy = true; this.operation = new AbortController(); this.changed();
    try { await this.registry.confirm(review, this.operation.signal); if (!this.closed) { this.review = undefined; if (review.kind !== "create") this.reload(); } }
    catch (error) { if (!this.closed) { this.error = error instanceof OrganizationError ? this.stateLabel() : orgText("Registry operation failed", "Операция с реестром не выполнена"); this.review = undefined; } }
    finally { this.busy = false; if (!this.closed) this.changed(); }
  }
}
