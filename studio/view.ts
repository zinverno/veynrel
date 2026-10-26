import { ItemView, Modal } from "obsidian";
import type { App, WorkspaceLeaf } from "obsidian";
import { currentLanguage } from "../i18n";
import { renderPlanDiff } from "../consolidation/planDiffView";
import { BUILTIN_RECIPES } from "./builtins";
import { ensure, parseRecipe, StudioError, validateRecipe } from "./recipe";
import type { Recipe } from "./recipe";
import type { StudioWorkspace } from "./registerStudio";
import type { StudioHistoryRow, UndoReview } from "./apply";
import { errorMessage, l, status } from "./messages";

export const STUDIO_VIEW_TYPE = "veynrel-studio";
const title = "Veynrel Studio";
function button(root: HTMLElement, name: string, action: string, click: () => void): HTMLButtonElement {
  const b = root.createEl("button", { text: name, attr: { type: "button", "data-studio-action": action } }); b.addEventListener("click", click); return b;
}
function literal(root: HTMLElement, name: string, value: string): void {
  const d = root.createEl("details"); d.createEl("summary", { text: name });
  d.createEl("pre", { text: value, cls: "veynrel-studio-literal", attr: { tabindex: "0", "aria-label": name } });
}
function field(root: HTMLElement, name: string, value: string, multi = false): HTMLInputElement | HTMLTextAreaElement {
  const label = root.createEl("label", { cls: "veynrel-studio-field" }); label.createSpan({ text: name });
  const input = multi ? label.createEl("textarea") : label.createEl("input", { type: "text" }); input.value = value; return input;
}
function select(root: HTMLElement, name: string, options: readonly [string, string][], value: string): HTMLSelectElement {
  const label = root.createEl("label", { cls: "veynrel-studio-field" }); label.createSpan({ text: name }); const input = label.createEl("select");
  for (const [v, text] of options) input.createEl("option", { value: v, text }); input.value = value; return input;
}
function message(e: unknown): string { return errorMessage(e instanceof StudioError ? e.code : "storage"); }

class StudioDialog extends Modal {
  active = false;
  pending = false;
  private error!: HTMLElement;
  constructor(app: App, private readonly build: (dialog: StudioDialog, root: HTMLElement) => void, private readonly closed: () => void = () => {}) { super(app); }
  onOpen(): void { this.active = true; this.contentEl.addClass("veynrel-studio-dialog"); this.error = this.contentEl.createDiv({ attr: { role: "alert" } }); this.build(this, this.contentEl); }
  onClose(): void { this.active = false; this.closed(); this.contentEl.empty(); }
  run(work: () => Promise<unknown>): void {
    if (!this.active || this.pending) return; this.pending = true;
    void work().then(() => { if (this.active) this.close(); }).catch(e => { if (this.active) this.error.setText(message(e)); })
      .finally(() => { this.pending = false; });
  }
}

export class VeynrelStudioView extends ItemView {
  private route: "library" | "details" | "setup" | "workflow" | "history" = "library";
  private selected?: Recipe;
  private search = "";
  private category = "all";
  private body!: HTMLElement;
  private stateEl!: HTMLElement;
  private errorEl!: HTMLElement;
  private stop: (() => void)[] = [];
  private dialogs = new Set<StudioDialog>();
  private alive = false;
  private historyEpoch = 0;
  private selectedRows = new Set<string>();
  private reviewId?: string;
  constructor(leaf: WorkspaceLeaf, readonly owner: StudioWorkspace) { super(leaf); }
  getViewType(): string { return STUDIO_VIEW_TYPE; }
  getDisplayText(): string { return title; }
  getIcon(): string { return "wand-sparkles"; }
  async onOpen(): Promise<void> {
    this.alive = true; this.contentEl.empty(); this.contentEl.addClass("veynrel-studio");
    const header = this.contentEl.createEl("header"); header.createEl("h1", { text: title });
    header.createEl("p", { text: l("Local recipes. Deliberate changes.", "Локальные сценарии. Осознанные изменения.") });
    const nav = this.contentEl.createEl("nav", { cls: "veynrel-studio-actions", attr: { "aria-label": title } });
    for (const [route, name] of [["library", l("Library", "Библиотека")], ["workflow", l("Run & review", "Запуск и проверка")], ["history", l("History", "История")]] as const) {
      button(nav, name, route, () => { this.route = route; this.render(); });
    }
    this.stateEl = this.contentEl.createDiv({ cls: "veynrel-studio-status", attr: { role: "status", "aria-live": "polite" } });
    this.errorEl = this.contentEl.createDiv({ attr: { role: "alert" } }); this.body = this.contentEl.createDiv({ cls: "veynrel-studio-body" });
    this.stop.push(this.owner.runner.subscribe(() => { this.updateStatus(); if (this.route === "workflow") this.render(); }));
    this.stop.push(this.owner.registry.subscribe(() => { if (this.route === "library" || this.route === "details") this.render(); }));
    await this.owner.registry.load(); if (this.alive) this.render();
  }
  async onClose(): Promise<void> {
    this.alive = false; this.historyEpoch++; this.stop.splice(0).forEach(f => f());
    for (const dialog of this.dialogs) dialog.close(); this.dialogs.clear(); this.contentEl.empty();
  }
  private updateStatus(): void { this.stateEl.setText(status(this.owner.runner.state)); this.body.setAttribute("aria-busy", String(this.owner.runner.running)); }
  private run(work: () => Promise<unknown>): void {
    this.errorEl.empty(); void work().catch(e => { if (this.alive) this.errorEl.setText(message(e)); });
  }
  private dialog(build: (dialog: StudioDialog, root: HTMLElement) => void, closed?: () => void): void {
    const d = new StudioDialog(this.app, build, () => { this.dialogs.delete(d); closed?.(); }); this.dialogs.add(d); d.open();
  }
  private render(): void {
    if (!this.alive) return; this.historyEpoch++; this.body.empty(); this.errorEl.empty(); this.updateStatus();
    if (this.route === "library") this.library();
    if (this.route === "details") this.details();
    if (this.route === "setup") this.setup();
    if (this.route === "workflow") this.workflow();
    if (this.route === "history") this.history();
  }
  private library(): void {
    const registry = this.owner.registry;
    this.body.createEl("p", { text: l("Browsing recipes does not read notes or contact a model.", "Просмотр сценариев не читает заметки и не обращается к модели.") });
    if (registry.state === "damaged") {
      this.body.createEl("p", { text: errorMessage("storage"), attr: { role: "alert" } });
      button(this.body, l("Inspect library backups", "Проверить копии библиотеки"), "registry-recover", () => this.recoverLibrary());
    }
    const actions = this.body.createDiv({ cls: "veynrel-studio-actions" });
    button(actions, l("New recipe", "Новый сценарий"), "new", () => this.edit(registry.duplicate(BUILTIN_RECIPES[0]))).disabled = registry.state !== "ready";
    button(actions, l("Import JSON", "Импорт JSON"), "import", () => this.importRecipe()).disabled = registry.state !== "ready";
    const search = field(this.body, l("Search recipes", "Поиск сценариев"), this.search); search.setAttribute("data-studio-field", "search");
    const category = select(this.body, l("Category", "Категория"), [["all", l("All recipes", "Все сценарии")], ["builtin", l("Built-in", "Встроенные")], ["user", l("My recipes", "Мои сценарии")]], this.category);
    const cards = this.body.createDiv({ cls: "veynrel-studio-grid" });
    const renderCards = () => {
      cards.empty(); const lang = currentLanguage();
      const rows = registry.list().filter(r => (this.category === "all" || r.source === this.category) && `${r.name[lang]} ${r.description[lang]}`.toLocaleLowerCase().includes(this.search.toLocaleLowerCase()));
      if (!rows.length) cards.createEl("p", { text: l("No recipes found.", "Сценарии не найдены.") });
      for (const r of rows) {
        const card = cards.createEl("article", { cls: "veynrel-studio-card" }); card.createSpan({ text: r.source === "builtin" ? l("Built-in", "Встроенный") : l("My recipe", "Мой сценарий"), cls: "veynrel-studio-eyebrow" });
        card.createEl("h2", { text: r.name[lang] }); card.createEl("p", { text: r.description[lang] });
        button(card, l("View recipe", "Открыть сценарий"), `recipe-${r.id}`, () => { this.selected = r; this.route = "details"; this.render(); });
      }
    };
    search.addEventListener("input", () => { this.search = search.value; renderCards(); }); category.addEventListener("change", () => { this.category = category.value; renderCards(); }); renderCards();
  }
  private details(): void {
    const r = this.selected; if (!r) { this.route = "library"; this.render(); return; }
    this.body.createEl("h2", { text: r.name[currentLanguage()] }); this.body.createEl("p", { text: r.description[currentLanguage()] });
    this.body.createEl("p", { text: `${status(r.output.action)} · Markdown · ${l("one note per request", "одна заметка на запрос")} · v${r.version}` });
    literal(this.body, l("Model instruction & constraints", "Инструкция модели и ограничения"), `${r.steps[0].prompt}\n\n${r.constraints.join("\n")}`);
    this.body.createEl("p", { text: `${l("Limits: input characters / output characters / output tokens", "Лимиты: символы входа / символы выхода / токены выхода")}: ${r.limits.maxInputCharacters} / ${r.limits.maxOutputCharacters} / ${r.limits.maxOutputTokens}` });
    const actions = this.body.createDiv({ cls: "veynrel-studio-actions" });
    button(actions, l("Choose notes", "Выбрать заметки"), "choose-notes", () => { this.route = "setup"; this.render(); }).disabled = this.owner.runner.running;
    button(actions, l("Duplicate", "Дублировать"), "duplicate", () => this.edit(this.owner.registry.duplicate(r))).disabled = this.owner.registry.state !== "ready";
    button(actions, l("Export JSON", "Экспорт JSON"), "export", () => this.dialog((_d, root) => {
      root.createEl("h2", { text: l("Export recipe", "Экспорт сценария") }); const input = field(root, l("JSON — copy to a local file", "JSON — скопируйте в локальный файл"), this.owner.registry.export(r), true); input.readOnly = true;
      button(root, l("Select JSON", "Выделить JSON"), "select-json", () => { input.focus(); input.select(); });
    }));
    if (r.source === "user") {
      button(actions, l("Edit", "Изменить"), "edit", () => this.edit(r, r));
      button(actions, l("Delete", "Удалить"), "delete", () => this.dialog((d, root) => {
        root.createEl("p", { text: `${l("Delete local recipe", "Удалить локальный сценарий")}: ${r.name[currentLanguage()]}?` });
        button(root, l("Confirm deletion", "Подтвердить удаление"), "confirm-delete", () => d.run(async () => { await this.owner.registry.remove(r); this.route = "library"; this.render(); }));
      }));
    }
  }
  private edit(recipe: Recipe, expected?: Recipe): void {
    this.dialog((d, root) => {
      root.createEl("h2", { text: expected ? l("Edit recipe", "Редактировать сценарий") : l("New local recipe", "Новый локальный сценарий") });
      const en = field(root, l("Name (English)", "Название (английский)"), recipe.name.en), ru = field(root, l("Name (Russian)", "Название (русский)"), recipe.name.ru);
      const den = field(root, l("Description (English)", "Описание (английский)"), recipe.description.en, true), dru = field(root, l("Description (Russian)", "Описание (русский)"), recipe.description.ru, true);
      const version = field(root, l("Recipe version", "Версия сценария"), recipe.version);
      const prompt = field(root, l("Instruction to the model", "Инструкция модели"), recipe.steps[0].prompt, true); prompt.setAttribute("data-studio-field", "prompt");
      const constraints = field(root, l("Constraints (one per line)", "Ограничения (по одному на строку)"), recipe.constraints.join("\n"), true);
      const action = select(root, l("Output action", "Действие с результатом"), [["replace", status("replace")], ["append", status("append")]], recipe.output.action);
      literal(root, l("Stable ID and processing limits", "Стабильный ID и лимиты обработки"), `${recipe.id}\n${JSON.stringify(recipe.limits, null, 2)}`);
      root.createEl("p", { text: l("Saving does not grant access to notes or send a request. JSON import supports stricter processing limits.", "Сохранение не даёт доступа к заметкам и не отправляет запрос. Через импорт JSON можно задать более строгие лимиты.") });
      button(root, l("Save recipe", "Сохранить сценарий"), "save-recipe", () => d.run(async () => {
        const next = validateRecipe({ ...recipe, name: { en: en.value, ru: ru.value }, description: { en: den.value, ru: dru.value }, version: version.value,
          steps: [{ type: "llm_transform", prompt: prompt.value }], constraints: constraints.value.split("\n"), output: { format: "markdown", action: action.value } });
        if (expected) await this.owner.registry.edit(next, expected); else await this.owner.registry.add(next);
        this.selected = next; this.route = "details"; this.render();
      }));
    });
  }
  private importRecipe(): void {
    this.dialog((d, root) => {
      root.createEl("h2", { text: l("Import local recipe JSON", "Импорт локального сценария JSON") });
      const raw = field(root, l("Recipe JSON (user.* ID required)", "JSON сценария (нужен ID user.*)"), "", true);
      button(root, l("Validate and import", "Проверить и импортировать"), "confirm-import", () => d.run(async () => { const recipe = parseRecipe(raw.value); await this.owner.registry.add(recipe); this.selected = recipe; this.route = "details"; this.render(); }));
    });
  }
  private recoverLibrary(): void {
    this.run(async () => {
      const backups = await this.owner.registry.backups();
      this.dialog((d, root) => {
        root.createEl("h2", { text: l("Restore a library backup", "Восстановить копию библиотеки") });
        root.createEl("p", { text: l("The damaged original is retained. Choose a verified backup; this does not change notes.", "Повреждённый оригинал сохраняется. Выберите проверенную копию; заметки не изменяются.") });
        if (!backups.length) root.createEl("p", { text: l("No valid backup. Preserve the Studio folder for manual repair; no empty overwrite is offered.", "Валидных копий нет. Сохраните папку Studio для ручного восстановления; пустая библиотека не записывается.") });
        for (const b of backups) {
          literal(root, b.path, b.recipes.map(r => `${r.name[currentLanguage()]} · ${r.version}`).join("\n"));
          button(root, `${l("Restore", "Восстановить")} (${b.recipes.length})`, "restore-library", () => d.run(() => this.owner.registry.recover(b.path)));
        }
      });
    });
  }
  private setup(): void {
    const recipe = this.selected; if (!recipe) return;
    this.body.createEl("h2", { text: recipe.name[currentLanguage()] });
    this.body.createEl("p", { text: l("Save selected notes before preparing. Saved notes can stay open during generation and review. Close their editors only before Apply; unsaved changes must be saved before sending.", "Сохраните выбранные заметки перед подготовкой. Во время генерации и просмотра сохранённые заметки могут оставаться открытыми. Закрыть редакторы нужно только перед Apply; несохранённые изменения нужно сохранить до отправки.") });
    const paths = this.owner.inventory(), chosen = new Set<string>();
    const mode = select(this.body, l("Selection", "Выбор"), [["files", l("Choose individual notes", "Выбрать отдельные заметки")], ["folder", l("Choose a folder including subfolders", "Выбрать папку с подпапками")]], "files");
    const picker = this.body.createDiv(), query = field(picker, l("Search full paths", "Поиск по полному пути"), ""), list = picker.createDiv({ cls: "veynrel-studio-picker" });
    const picked = picker.createDiv({ attr: { role: "status" } });
    const renderFiles = () => {
      list.empty(); const matches = paths.filter(p => p.toLocaleLowerCase().includes(query.value.toLocaleLowerCase()));
      for (const path of matches.slice(0, 100)) {
        const label = list.createEl("label", { cls: "veynrel-studio-check" }), input = label.createEl("input", { type: "checkbox" }); input.checked = chosen.has(path); label.createSpan({ text: path });
        input.addEventListener("change", () => { if (input.checked) chosen.add(path); else chosen.delete(path); picked.setText([...chosen].join("\n")); });
      }
      if (matches.length > 100) list.createEl("p", { text: l("First 100 matches. Narrow the search; the run still has a 20-file limit.", "Первые 100 совпадений. Уточните поиск; лимит запуска — 20 файлов.") });
    };
    query.addEventListener("input", renderFiles); renderFiles();
    const folderBox = this.body.createDiv(); folderBox.hidden = true; const folders = new Set<string>();
    for (const path of paths) { const parts = path.split("/"); for (let n = 1; n < parts.length; n++) folders.add(parts.slice(0, n).join("/")); }
    const folder = select(folderBox, l("Folder", "Папка"), [["", l("Choose a folder…", "Выберите папку…")], ["/", l("Vault root (all Markdown)", "Корень хранилища (весь Markdown)")], ...[...folders].sort().map(p => [p, p] as [string, string])], "");
    const folderCount = folderBox.createDiv({ attr: { role: "status" } });
    folder.addEventListener("change", () => { folderCount.setText(paths.filter(p => folder.value === "/" || folder.value && p.startsWith(`${folder.value}/`)).join("\n")); });
    mode.addEventListener("change", () => { picker.hidden = mode.value !== "files"; folderBox.hidden = mode.value !== "folder"; });
    const language = select(this.body, l("Output language", "Язык результата"), [["source", l("Source language", "Язык исходника")], ["en", "English"], ["ru", "Русский"]], recipe.parameters.language);
    const instructions = field(this.body, l("Additional instructions (optional, up to 2,000 characters)", "Дополнительные инструкции (необязательно, до 2 000 символов)"), recipe.parameters.instructions, true);
    const context = field(this.body, l("Context budget you verified for this model (tokens)", "Проверенный вами бюджет контекста модели (токены)"), "32768"); context.setAttribute("type", "number");
    this.body.createEl("p", { text: l("Studio cannot discover model capacity. It reserves UTF-8 bytes + 128 as a conservative input-token allowance plus the recipe's output limit. No silent truncation.", "Studio не определяет ёмкость модели. Для входа резервируются UTF-8 байты + 128 как консервативная оценка токенов, плюс лимит выхода сценария. Скрытой обрезки нет.") });
    button(this.body, l("Read selected notes & review request", "Прочитать выбранные заметки и проверить запрос"), "prepare", () => {
      const selection = mode.value === "folder" ? { folder: folder.value } : { paths: [...chosen] };
      this.route = "workflow";
      this.run(() => this.owner.runner.prepare(recipe, { language: language.value as "source" | "en" | "ru", instructions: instructions.value }, selection, Number(context.value)));
    }).disabled = this.owner.runner.running;
  }
  private workflow(): void {
    const runner = this.owner.runner, prepared = runner.prepared, review = runner.review;
    if (runner.error) this.body.createEl("p", { text: errorMessage(runner.error), attr: { role: "alert" } });
    if (runner.running) {
      this.body.createEl("p", { text: l("Closing a Studio tab keeps this run available in another tab. Stop prevents subsequent requests/writes; it cannot recall an issued request.", "Закрытие вкладки Studio сохраняет запуск для другой вкладки. Остановка запрещает следующие запросы/записи, но не отзывает отправленный запрос.") });
      button(this.body, l("Stop after the current operation", "Остановить после текущей операции"), "cancel", () => runner.cancel()); return;
    }
    if (prepared && runner.state === "prepared") {
      this.body.createEl("h2", { text: l("Consent to send data", "Согласие на передачу данных") });
      this.body.createEl("p", { text: `${prepared.provider} · ${prepared.model} · ${prepared.endpoint}` });
      this.body.createEl("p", { text: `${l("Notes", "Заметки")}: ${prepared.requests.length} · ${l("Context budget", "Бюджет контекста")}: ${prepared.contextTokens}` });
      this.body.createEl("p", { cls: "veynrel-studio-warning", text: l("Each request sends the full saved note plus the displayed recipe instructions to the configured endpoint. A cloud provider receives this data and may charge for it. Exact cost is unknown. Nothing is sent until you confirm below.", "Каждый запрос передаёт полный сохранённый текст заметки и показанные инструкции на настроенный адрес. Облачный провайдер получает эти данные и может взимать плату. Точная стоимость неизвестна. Передача начнётся только после подтверждения ниже.") });
      for (const request of prepared.requests) {
        const card = this.body.createEl("article", { cls: "veynrel-studio-card" }); card.createEl("h3", { text: request.path });
        card.createEl("p", { text: `${l("Conservative token allowance", "Консервативный резерв токенов")}: ${request.conservativeTokens}` });
        literal(card, l("Exact outgoing JSON body", "Точное отправляемое тело JSON"), request.body);
      }
      const actions = this.body.createDiv({ cls: "veynrel-studio-actions" });
      button(actions, l("I agree — generate proposals", "Согласен — сгенерировать предложения"), "generate", () => this.run(() => runner.generate(prepared))).addClass("mod-cta");
      button(actions, l("Cancel without sending", "Отменить без отправки"), "cancel", () => runner.cancel()); return;
    }
    if (!review) {
      this.body.createEl("p", { text: l("Choose a recipe in the library to start. Interrupted requests are never retried automatically.", "Для запуска выберите сценарий в библиотеке. Прерванные запросы автоматически не повторяются.") }); return;
    }
    if (this.reviewId !== review.id) { this.reviewId = review.id; this.selectedRows.clear(); }
    this.body.createEl("h2", { text: l("Review changes", "Проверка изменений") });
    this.body.createEl("p", { text: l("Generated text may contain errors. Read the literal Markdown and diff. Check only the files you want to apply; the snapshot cannot be edited here.", "Сгенерированный текст может содержать ошибки. Проверьте исходный Markdown и diff. Отметьте файлы для применения; снимок здесь не редактируется.") });
    for (const row of review.rows) {
      const card = this.body.createEl("article", { cls: "veynrel-studio-card" }); card.createEl("h3", { text: row.path });
      const result = runner.results?.find(r => r.path === row.path); card.createEl("p", { text: `${status(row.action)} · ${status(result?.outcome ?? row.status)}` });
      if (row.reason || result?.reason) card.createEl("p", { text: errorMessage(result?.reason ?? row.reason!) });
      literal(card, l("Original saved Markdown", "Исходный сохранённый Markdown"), row.before);
      if (row.after !== null) {
        literal(card, l("Proposed Markdown", "Предлагаемый Markdown"), row.after); renderPlanDiff(card, row.before, row.after);
        if (runner.canApply) {
          const label = card.createEl("label", { cls: "veynrel-studio-check" }), input = label.createEl("input", { type: "checkbox", attr: { "data-studio-select": row.path } });
          label.createSpan({ text: l("Include in Apply", "Включить в применение") }); input.checked = this.selectedRows.has(row.path);
          input.addEventListener("change", () => { if (input.checked) this.selectedRows.add(row.path); else this.selectedRows.delete(row.path); });
        }
      }
    }
    if (runner.canApply) button(this.body, l("Review selected writes", "Проверить выбранные записи"), "review-apply", () => {
      const selected = [...this.selectedRows]; if (!selected.length) { this.errorEl.setText(errorMessage("scope")); return; }
      this.dialog((d, root) => {
        root.createEl("h2", { text: l("Confirm writing selected notes", "Подтвердите запись выбранных заметок") });
        root.createEl("p", { text: errorMessage("editor") });
        root.createEl("p", { text: l("Files are written sequentially, not as one transaction. Partial completion is possible. Undo requires the exact recorded result to remain unchanged.", "Файлы записываются последовательно, без общей транзакции. Возможно частичное выполнение. Undo требует неизменённого записанного результата.") });
        for (const path of selected) root.createEl("p", { text: path });
        const stop = button(root, l("Stop after the current file", "Остановить после текущего файла"), "cancel-apply", () => { if (d.pending) runner.cancel(); }); stop.disabled = true;
        const confirm = button(root, l("Apply these changes", "Применить эти изменения"), "confirm-apply", () => {
          if (d.pending || !d.active) return;
          stop.disabled = false; confirm.disabled = true; d.run(() => runner.apply(review, selected));
        }); confirm.addClass("mod-cta");
      });
    });
  }
  private history(): void {
    const epoch = this.historyEpoch; this.body.createEl("h2", { text: l("Studio operation history", "История операций Studio") });
    this.body.createEl("p", { text: l("Inspection reads only journal participants and never repeats generation or writes. Recovery actions require separate confirmation.", "Проверка читает только участников журнала и не повторяет генерацию или запись. Восстановление требует отдельного подтверждения.") });
    button(this.body, l("Refresh history", "Обновить историю"), "refresh-history", () => this.render());
    const list = this.body.createDiv(); list.createEl("p", { text: l("Checking…", "Проверка…") });
    this.run(async () => {
      const rows = await this.owner.writer.history(), runs = await this.owner.writer.journal.runs();
      if (!this.alive || epoch !== this.historyEpoch) return; list.empty();
      if (!rows.length && !runs.length) list.createEl("p", { text: l("No Studio operations yet.", "Операций Studio пока нет.") });
      for (const run of runs.filter(r => !rows.some(row => row.entry.id === r.id))) {
        const card = list.createEl("article", { cls: "veynrel-studio-card" }); card.createEl("h3", { text: run.start?.recipeId ?? run.id });
        card.createEl("p", { text: status(run.damaged ? "damaged" : this.owner.runner.prepared?.id === run.id ? this.owner.runner.state : run.state) });
        literal(card, l("Operation details", "Подробности операции"), JSON.stringify(run, null, 2));
      }
      for (const row of rows) this.historyRow(list, row);
    });
  }
  private historyRow(root: HTMLElement, row: StudioHistoryRow): void {
    const card = root.createEl("article", { cls: "veynrel-studio-card" }); card.createEl("h3", { text: row.path || row.entry.id }); card.createEl("p", { text: status(row.state) });
    if (row.reason) card.createEl("p", { text: errorMessage(row.reason) });
    literal(card, l("Journal diagnostics", "Диагностика журнала"), JSON.stringify({ id: row.entry.id, preparedAt: row.entry.record?.createdAt, issues: row.entry.issues,
      storage: this.owner.writer.journal.root, recipe: row.entry.record?.recipeId }, null, 2));
    if (row.canUndo || row.recovery) button(card, row.canUndo ? l("Review Undo", "Проверить отмену") : l("Review verified recovery", "Проверить восстановление"), row.canUndo ? "undo" : "recover", () => this.run(async () => {
      const review = await this.owner.writer.reviewUndo(row.entry.id, row.index, row.canUndo ? "undo" : "recover");
      if (!this.alive) { this.owner.writer.discard(review); return; } this.undoDialog(review);
    }));
  }
  private undoDialog(review: UndoReview): void {
    this.dialog((d, root) => {
      root.createEl("h2", { text: review.action === "undo" ? l("Confirm Undo", "Подтвердите отмену") : l("Confirm observed state", "Подтвердите проверенное состояние") });
      root.createEl("p", { text: review.path });
      root.createEl("p", { text: review.action === "undo" ? errorMessage("editor") : l("This records the verified current state only. It does not modify the note or retry a request.", "Это фиксирует только проверенное текущее состояние. Заметка не изменяется, запрос не повторяется.") });
      literal(root, l("Current saved Markdown", "Текущий сохранённый Markdown"), review.before);
      literal(root, l("Result", "Результат"), review.after); renderPlanDiff(root, review.before, review.after);
      button(root, l("Confirm", "Подтвердить"), "confirm-undo", () => d.run(async () => { ensure(!this.owner.runner.running, "busy"); await this.owner.writer.executeUndo(review); this.route = "history"; this.render(); }));
    }, () => this.owner.writer.discard(review));
  }
}
