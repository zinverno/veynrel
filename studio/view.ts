import { ItemView, Modal, setIcon } from "obsidian";
import type { App, WorkspaceLeaf } from "obsidian";
import { currentLanguage } from "../i18n";
import { renderPlanDiff } from "../consolidation/planDiffView";
import { BUILTIN_RECIPES } from "./builtins";
import { ensure, parseRecipe, validateRecipe } from "./recipe";
import type { Recipe } from "./recipe";
import type { StudioWorkspace } from "./registerStudio";
import type { StudioHistoryRow, UndoReview } from "./apply";
import { errorMessage, l, status } from "./messages";
import { CommunityPanel, categoryName, communityLink } from "./community/view";
import { CATEGORIES, COMMUNITY_CONTRIBUTE } from "./community/schema";
import type { CatalogEntry } from "./community/schema";
import { publicationPackage } from "./community/publication";

export const STUDIO_VIEW_TYPE = "veynrel-studio";
const title = "Veynrel Studio";
import { button, literal, field, select, disclosure, toolbar, notePicker, connectionSummary } from "./ui";
import { illustration } from "./illustrations";
import { DiagramPanel } from "./diagram/view";
import { diagramMessage } from "./diagram/messages";
import { suggestedTarget, parentPath } from "./markdownTarget";
import type { MarkdownDestination, StudioWritePlan } from "./writePlan";
import { linkContextFindings } from "./preservationChecks";
import type { MarkdownCreateHistory } from "./markdownCreate";
function message(e: unknown): string { return diagramMessage(e); }

class StudioDialog extends Modal {
  active = false;
  pending = false;
  private error!: HTMLElement;
  private dirty = false;
  protectDraft(): void {
    this.contentEl.addEventListener("input", () => { this.dirty = true; });
    this.contentEl.addEventListener("change", () => { this.dirty = true; });
  }
  close(): void {
    if (this.dirty && this.active) {
      this.error.empty(); this.error.createEl("p", { text: l("Discard unsaved changes?", "Отбросить несохранённые изменения?") });
      button(this.error, l("Keep editing", "Продолжить редактирование"), "keep-draft", () => { this.error.empty(); this.contentEl.querySelector<HTMLElement>("input, textarea")?.focus(); }).focus();
      button(this.error, l("Discard and close", "Отбросить и закрыть"), "discard-draft", () => { this.dirty = false; this.close(); }); return;
    }
    super.close();
  }
  dispose(): void { this.dirty = false; this.close(); }
  constructor(app: App, private readonly build: (dialog: StudioDialog, root: HTMLElement) => void, private readonly closed: () => void = () => {}) { super(app); }
  onOpen(): void { this.active = true; this.contentEl.addClass("veynrel-studio-dialog"); this.error = this.contentEl.createDiv({ attr: { role: "alert" } }); this.build(this, this.contentEl); }
  onClose(): void { this.active = false; this.closed(); this.contentEl.empty(); }
  run(work: () => Promise<unknown>): void {
    if (!this.active || this.pending) return; this.pending = true;
    void work().then(() => { if (this.active) { this.dirty = false; this.close(); } }).catch(e => { if (this.active) this.error.setText(message(e)); })
      .finally(() => { this.pending = false; });
  }
}

export class VeynrelStudioView extends ItemView {
  private route: "library" | "community" | "details" | "setup" | "workflow" | "history" | "diagram" = "library";
  private community?: CommunityPanel;
  private diagram?: DiagramPanel;
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
  private reviewPath = "";
  private destination: MarkdownDestination = "new-note";
  private targetNames = new Map<string, string>();
  private setupDrafts = new Map<string, { chosen: Set<string>; query: string; mode: string; folder: string; language: string; instructions: string; context: string }>();
  private renderedRoute = "";
  private routeScroll = new Map<string, number>();
  constructor(leaf: WorkspaceLeaf, readonly owner: StudioWorkspace) { super(leaf); }
  getViewType(): string { return STUDIO_VIEW_TYPE; }
  getDisplayText(): string { return title; }
  getIcon(): string { return "wand-sparkles"; }
  async onOpen(): Promise<void> {
    this.alive = true; this.contentEl.empty(); this.contentEl.addClass("veynrel-studio");
    const header = this.contentEl.createEl("header"); header.createEl("h1", { text: title });
    header.createEl("p", { text: l("Transform notes · create diagrams", "Преобразуйте заметки · создавайте схемы") });
    const nav = this.contentEl.createEl("nav", { cls: "veynrel-studio-actions", attr: { "aria-label": title } });
    for (const [route, name] of [["library", l("Library", "Библиотека")], ["community", l("Community", "Сообщество")], ["diagram", l("Create diagram", "Создать схему")], ["history", l("History", "История")]] as const) {
      button(nav, name, route, () => { this.navigate(route); });
    }
    const operation = toolbar(this.contentEl); operation.addClass("veynrel-studio-operation");
    button(operation, l("Run & review", "Запуск и проверка"), "workflow", () => this.navigate(this.stateEl.dataset.route === "diagram" ? "diagram" : "workflow"));
    this.stateEl = operation.createDiv({ cls: "veynrel-studio-status", attr: { role: "status", "aria-live": "polite" } });
    this.errorEl = this.contentEl.createDiv({ attr: { role: "alert" } }); this.body = this.contentEl.createDiv({ cls: "veynrel-studio-body" });
    this.diagram = new DiagramPanel(this.owner, () => { if (this.alive && this.route === "diagram") this.render(); }, work => this.run(work),
      (title, description, action, work, closed) => this.dialog((d, root) => {
        root.createEl("h2", { text: title }); root.createEl("p", { text: description });
        button(root, l("Confirm", "Подтвердить"), action, () => d.run(work));
      }, closed));
    this.stop.push(this.owner.diagrams.subscribe(() => { this.updateStatus(); if (this.route === "diagram") this.render(); }));
    this.stop.push(this.owner.operations.subscribe(() => this.updateStatus()));
    this.stop.push(this.owner.runner.subscribe(() => { this.updateStatus(); if (this.route === "workflow") this.render(); }));
    this.stop.push(this.owner.registry.subscribe(() => { if (this.route === "library" || this.route === "details") this.render(); }));
    this.community = new CommunityPanel(this.owner.community, this.owner.installer, () => { if (this.alive && this.route === "community") this.render(); }, r => {
      if (!this.alive) return; this.selected = r; this.navigate("details");
    });
    this.stop.push(this.owner.community.subscribe(() => { if (this.route === "community") this.render(); }));
    await this.owner.installer.load();
    await this.owner.registry.load(); if (this.alive) this.render();
  }
  async onClose(): Promise<void> {
    this.alive = false; this.historyEpoch++; this.stop.splice(0).forEach(f => f());
    for (const dialog of this.dialogs) dialog.dispose(); this.dialogs.clear(); this.diagram?.dispose(); this.contentEl.empty();
  }
  private updateStatus(): void {
    const diagram = this.owner.diagrams, runner = this.owner.runner;
    const useDiagram = diagram.running || diagram.state !== "idle" && (runner.state === "idle" || this.route === "diagram");
    const state = useDiagram ? diagram.state : runner.state;
    this.stateEl.dataset.route = useDiagram ? "diagram" : "workflow";
    this.stateEl.parentElement!.hidden = state === "idle";
    this.stateEl.setText(state === "idle" ? "" : status(state));
    this.body.setAttribute("aria-busy", String(this.owner.operations.busy));
  }

  private run(work: () => Promise<unknown>): void {
    this.errorEl.empty(); void work().catch(e => { if (this.alive) this.errorEl.setText(message(e)); });
  }
  private dialog(build: (dialog: StudioDialog, root: HTMLElement) => void, closed?: () => void): void {
    const d = new StudioDialog(this.app, build, () => { this.dialogs.delete(d); closed?.(); }); this.dialogs.add(d); d.open();
  }
  private navigate(route: typeof this.route): void {
    this.routeScroll.set(this.route, this.contentEl.scrollTop);
    this.route = route; this.render();
    this.contentEl.scrollTop = this.routeScroll.get(route) ?? 0;
    this.body.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }
  private render(): void {
    if (!this.alive) return;
    const scroll = this.contentEl.scrollTop;
    const active = this.body.ownerDocument.activeElement as HTMLElement | null;
    const focused = active && this.body.contains(active) ? active : null;
    const focusKey = focused?.dataset.studioKey;
    const selection = focused && "selectionStart" in focused ? { start: (focused as HTMLInputElement).selectionStart, end: (focused as HTMLInputElement).selectionEnd } : undefined;
    const openDetails = new Set(Array.from(this.body.querySelectorAll("details[open]")).map(d => d.querySelector("summary")?.textContent));
    const previewFrame = this.body.querySelector(".veynrel-diagram-preview"), viewport = previewFrame ? { top: previewFrame.scrollTop, left: previewFrame.scrollLeft } : undefined;
    const sameRoute = this.renderedRoute === this.route;
    this.renderedRoute = this.route;
    this.contentEl.querySelectorAll<HTMLElement>("nav button").forEach(b => b.setAttribute("aria-current", String(b.dataset.studioAction === (this.route === "details" || this.route === "setup" ? "library" : this.route))));
    this.historyEpoch++; this.body.empty(); this.body.removeClass("veynrel-community"); this.errorEl.empty(); this.updateStatus();
    if (this.route === "library") this.library();
    if (this.route === "community") this.community?.render(this.body);
    if (this.route === "details") this.details();
    if (this.route === "setup") this.setup();
    if (this.route === "workflow") this.workflow();
    if (this.route === "history") this.history();
    if (this.route === "diagram") this.diagram?.render(this.body);
    this.body.querySelectorAll("h2").forEach(h => h.setAttribute("tabindex", "-1"));
    if (sameRoute) {
      this.body.querySelectorAll<HTMLDetailsElement>("details").forEach(d => { if (openDetails.has(d.querySelector("summary")?.textContent)) d.open = true; });
      const next = focused?.isConnected ? focused : focusKey ? Array.from(this.body.querySelectorAll<HTMLElement>("[data-studio-key]")).find(e => e.dataset.studioKey === focusKey) : undefined;
      next?.focus({ preventScroll: true });
      if (selection?.start != null && selection.end != null && next && "setSelectionRange" in next) (next as HTMLInputElement).setSelectionRange(selection.start, selection.end);
      if (viewport && previewFrame?.isConnected) { previewFrame.scrollTop = viewport.top; previewFrame.scrollLeft = viewport.left; }
      this.contentEl.scrollTop = scroll;
    }
  }
  private library(): void {
    const registry = this.owner.registry;
    this.body.createEl("h2", { text: l("What would you like to do with a note?", "Что сделать с заметкой?") });
    if (registry.state === "damaged") {
      this.body.createEl("p", { text: errorMessage("storage"), attr: { role: "alert" } });
      button(this.body, l("Inspect library backups", "Проверить копии библиотеки"), "registry-recover", () => this.recoverLibrary());
    }
    const actions = this.body.createDiv({ cls: "veynrel-studio-actions" });
    button(actions, l("New recipe", "Новый сценарий"), "new", () => this.edit(registry.duplicate(BUILTIN_RECIPES[0]))).disabled = registry.state !== "ready";
    button(actions, l("Import JSON", "Импорт JSON"), "import", () => this.importRecipe()).disabled = registry.state !== "ready";
    const filters = this.body.createDiv({ cls: "veynrel-studio-search-row" });
    const search = field(filters, l("Search recipes", "Поиск сценариев"), this.search); search.setAttribute("data-studio-field", "search");
    const category = select(filters, l("Category", "Категория"), [["all", l("All recipes", "Все сценарии")], ["builtin", l("Built-in", "Встроенные")], ["user", l("My recipes", "Мои сценарии")], ["installed", l("Installed", "Установленные")]], this.category);
    const cards = this.body.createDiv({ cls: "veynrel-studio-grid" });
    const renderCards = () => {
      cards.empty(); const lang = currentLanguage();
      const rows = registry.list().filter(r => (this.category === "all" || (this.owner.installer.provenance(r.id) ? "installed" : r.source) === this.category) && `${r.name[lang]} ${r.description[lang]}`.toLocaleLowerCase().includes(this.search.toLocaleLowerCase()));
      if (!rows.length) cards.createEl("p", { text: l("No recipes found.", "Сценарии не найдены.") });
      for (const r of rows) {
        const card = cards.createEl("article", { cls: "veynrel-studio-card" });
        const origin = this.owner.installer.provenance(r.id) ? l("Installed", "Установленный") : r.source === "builtin" ? l("Built-in", "Встроенный") : l("My recipe", "Мой сценарий");
        if (this.category === "all") card.createSpan({ text: origin, cls: "veynrel-studio-eyebrow" });
        card.setAttribute("aria-label", `${r.name[lang]} · ${origin}`);
        const heading = card.createEl("h2");
        const kind = r.source === "builtin" ? ({ "builtin.smart-format": "format", "builtin.training-journal": "training", "builtin.nutrition-journal": "nutrition" } as const)[r.id as "builtin.smart-format"] : undefined;
        setIcon(heading.createSpan(), kind === "format" ? "list" : kind === "training" ? "dumbbell" : kind === "nutrition" ? "utensils" : "file-text");
        heading.createSpan({ text: r.name[lang] });
        card.createEl("p", { text: r.description[lang] });
        card.createSpan({ text: l("Save separately after Review · changing the source is optional", "После проверки — отдельная заметка; изменение исходника по выбору"), cls: "veynrel-studio-eyebrow" });
        if (kind) { const example = card.createEl("figure", { cls: "veynrel-studio-example" }); illustration(example, kind); example.createEl("figcaption", { text: l("Result illustration · not model output", "Пример структуры · не ответ модели") }); }
        button(card, l("View recipe", "Открыть сценарий"), `recipe-${r.id}`, () => { this.selected = r; this.navigate("details"); });
      }
    };
    search.addEventListener("input", () => { this.search = search.value; renderCards(); }); category.addEventListener("change", () => { this.category = category.value; renderCards(); }); renderCards();
  }
  private details(): void {
    const r = this.selected; if (!r) { this.route = "library"; this.render(); return; }
    button(this.body, l("← Library", "← Библиотека"), "back-library", () => this.navigate("library"));
    this.body.createEl("h2", { text: r.name[currentLanguage()] }); this.body.createEl("p", { text: r.description[currentLanguage()] });
    button(this.body, l("Choose notes", "Выбрать заметки"), "choose-notes", () => this.navigate("setup")).disabled = this.owner.runner.running;
    const origin = this.owner.installer.provenance(r.id);
    if (origin) literal(this.body, l("Community origin", "Происхождение Community"), `${origin.entry.id} · ${origin.entry.author.name} · ${origin.entry.version}\n${origin.entry.recipeUrl}\nSHA-256: ${origin.entry.sha256}\n${origin.modified ? l("Locally modified", "Изменён локально") : l("Unmodified", "Без изменений")}`);
    this.body.createEl("p", { text: `${status(r.output.action)} · Markdown · ${l("one note per request", "одна заметка на запрос")} · v${r.version}` });
    literal(this.body, l("Model instruction & constraints", "Инструкция модели и ограничения"), `${r.steps[0].prompt}\n\n${r.constraints.join("\n")}`);
    this.body.createEl("p", { text: `${l("Limits: input characters / output characters / output tokens", "Лимиты: символы входа / символы выхода / токены выхода")}: ${r.limits.maxInputCharacters} / ${r.limits.maxOutputCharacters} / ${r.limits.maxOutputTokens}` });
    const actions = toolbar(disclosure(this.body, l("Recipe actions", "Действия со сценарием")));
    button(actions, l("Duplicate", "Дублировать"), "duplicate", () => this.edit(this.owner.registry.duplicate(r))).disabled = this.owner.registry.state !== "ready";
    button(actions, l("Export JSON", "Экспорт JSON"), "export", () => this.dialog((_d, root) => {
      root.createEl("h2", { text: l("Export recipe", "Экспорт сценария") }); const input = field(root, l("JSON — copy to a local file", "JSON — скопируйте в локальный файл"), this.owner.registry.export(r), true); input.readOnly = true;
      button(root, l("Select JSON", "Выделить JSON"), "select-json", () => { input.focus(); input.select(); });
    }));
    if (r.source === "user") {
      button(actions, l("Prepare community submission", "Подготовить публикацию в Community"), "publish", () => this.publishRecipe(r));
      button(actions, l("Edit", "Изменить"), "edit", () => this.edit(r, r));
      button(actions, l("Delete", "Удалить"), "delete", () => this.dialog((d, root) => {
        root.createEl("p", { text: `${l("Delete local recipe", "Удалить локальный сценарий")}: ${r.name[currentLanguage()]}?` });
        button(root, l("Confirm deletion", "Подтвердить удаление"), "confirm-delete", () => d.run(async () => { await this.owner.registry.remove(r); this.route = "library"; this.render(); }));
      }));
    }
  }
  private publishRecipe(recipe: Recipe): void {
    this.dialog((_dialog, root) => {
      _dialog.protectDraft();
      root.createEl("h2", { text: l("Prepare a public recipe package", "Подготовить публичный пакет сценария") });
      root.createEl("p", { text: l("Inspect the recipe for private information. Write fictional examples yourself. No notes, reviews, keys or history are collected. Default additional instructions are removed. Nothing is uploaded.", "Проверьте сценарий на личные данные. Напишите вымышленные примеры самостоятельно. Заметки, Review, ключи и история не собираются. Дополнительные инструкции по умолчанию удаляются. Ничего не отправляется.") });
      literal(root, l("Recipe to publish", "Сценарий для публикации"), this.owner.registry.export(recipe));
      const id = field(root, l("Public ID (lowercase slug)", "Публичный ID (латиница, дефисы)"), ""), author = field(root, l("Author name", "Имя автора"), ""), url = field(root, l("Author GitHub profile URL", "URL профиля автора на GitHub"), "");
      const category = select(root, l("Category", "Категория"), CATEGORIES.map(c => [c, categoryName(c)] as [string, string]), "learning");
      const tags = field(root, l("Tags (comma separated)", "Теги (через запятую)"), "");
      const purposeEn = field(root, "Purpose (EN)", "", true), purposeRu = field(root, "Назначение (RU)", "", true);
      const limitsEn = field(root, "Known risks and limitations (EN)", "", true), limitsRu = field(root, "Риски и ограничения (RU)", "", true);
      const inputEn = field(root, "Fictional input (EN)", "", true), inputRu = field(root, "Вымышленный вход (RU)", "", true);
      const outputEn = field(root, "Illustrative output (EN)", "", true), outputRu = field(root, "Пример результата (RU)", "", true);
      const metadata = root.createEl("fieldset"); metadata.createEl("legend", { text: l("Author & category", "Автор и категория") });
      for (const input of [id, author, url, category, tags]) metadata.append(input.parentElement!);
      const publicFields = root.createEl("fieldset"); publicFields.createEl("legend", { text: l("Public purpose & risks", "Публичное назначение и риски") });
      for (const input of currentLanguage() === "ru" ? [purposeRu, limitsRu, purposeEn, limitsEn] : [purposeEn, limitsEn, purposeRu, limitsRu]) publicFields.append(input.parentElement!);
      const examples = root.createEl("fieldset"); examples.createEl("legend", { text: l("Fictional public examples", "Вымышленные публичные примеры") });
      for (const input of currentLanguage() === "ru" ? [inputRu, outputRu, inputEn, outputEn] : [inputEn, outputEn, inputRu, outputRu]) examples.append(input.parentElement!);
      const confirmation = root.createEl("label", { cls: "veynrel-studio-check" }), checked = confirmation.createEl("input", { type: "checkbox" });
      confirmation.createSpan({ text: l("I inspected the recipe and explicitly authored these public examples.", "Я проверил сценарий и явно создал эти примеры для публикации.") });
      const result = root.createDiv(), error = root.createDiv({ attr: { role: "alert" } });
      button(root, l("Validate & export package", "Проверить и экспортировать пакет"), "export-publication", () => {
        error.empty(); result.empty();
        if (!checked.checked) { error.setText(l("Confirm your review first.", "Сначала подтвердите проверку.")); return; }
        void publicationPackage(recipe, { id: id.value, author: { name: author.value, url: url.value }, category: category.value as CatalogEntry["category"], tags: tags.value.split(",").map(t => t.trim()),
          purpose: { en: purposeEn.value, ru: purposeRu.value }, limitations: { en: limitsEn.value, ru: limitsRu.value }, examples: { input: { en: inputEn.value, ru: inputRu.value }, output: { en: outputEn.value, ru: outputRu.value } } })
          .then(raw => { const output = field(result, l("Save this JSON as submission.json", "Сохраните этот JSON как submission.json"), raw, true); output.readOnly = true;
            button(result, l("Select package JSON", "Выделить JSON пакета"), "select-publication", () => { output.focus(); output.select(); });
            communityLink(result, l("Submit through a GitHub pull request ↗", "Предложить через GitHub pull request ↗"), COMMUNITY_CONTRIBUTE);
          }).catch(() => error.setText(l("Invalid metadata or examples. Complete every RU/EN field and check the public ID and GitHub URL.", "Неверные метаданные или примеры. Заполните все поля RU/EN, проверьте ID и URL GitHub.")));
      });
    });
  }
  private edit(recipe: Recipe, expected?: Recipe): void {
    this.dialog((d, root) => {
      d.protectDraft();
      root.createEl("h2", { text: expected ? l("Edit recipe", "Редактировать сценарий") : l("New local recipe", "Новый локальный сценарий") });
      const en = field(root, l("Name (English)", "Название (английский)"), recipe.name.en), ru = field(root, l("Name (Russian)", "Название (русский)"), recipe.name.ru);
      const den = field(root, l("Description (English)", "Описание (английский)"), recipe.description.en, true), dru = field(root, l("Description (Russian)", "Описание (русский)"), recipe.description.ru, true);
      en.dataset.studioField = "name-en"; ru.dataset.studioField = "name-ru";
      const translations = disclosure(root, l("Translation · required", "Перевод · обязателен"));
      const activeFields = currentLanguage() === "ru" ? [ru, dru] : [en, den];
      const translatedFields = currentLanguage() === "ru" ? [en, den] : [ru, dru];
      for (const input of activeFields) root.insertBefore(input.parentElement!, translations);
      for (const input of translatedFields) translations.append(input.parentElement!);
      const version = field(root, l("Recipe version", "Версия сценария"), recipe.version);
      const prompt = field(root, l("Instruction to the model", "Инструкция модели"), recipe.steps[0].prompt, true); prompt.setAttribute("data-studio-field", "prompt");
      const constraints = field(root, l("Constraints (one per line)", "Ограничения (по одному на строку)"), recipe.constraints.join("\n"), true);
      const action = select(root, l("Output action", "Действие с результатом"), [["replace", status("replace")], ["append", status("append")]], recipe.output.action);
      literal(root, l("Stable ID and processing limits", "Стабильный ID и лимиты обработки"), `${recipe.id}\n${JSON.stringify(recipe.limits, null, 2)}`);
      root.createEl("p", { text: l("Saving does not grant access to notes or send a request. JSON import supports stricter processing limits.", "Сохранение не даёт доступа к заметкам и не отправляет запрос. Через импорт JSON можно задать более строгие лимиты.") });
      for (const input of [en, ru, den, dru, prompt, version, constraints]) {
        input.required = true;
        input.addEventListener("input", () => {
          const id = input.getAttribute("aria-describedby"); if (id) input.ownerDocument.getElementById(id)?.remove();
          input.removeAttribute("aria-invalid"); input.removeAttribute("aria-describedby");
        });
        input.maxLength = input === prompt ? 8000 : input === en || input === ru ? 120 : input === den || input === dru ? 1200 : input === version ? 20 : 6012;
      }
      button(root, l("Save recipe", "Сохранить сценарий"), "save-recipe", () => {
        for (const input of [en, ru, den, dru, prompt, version, constraints]) if (!input.value.trim() || input.value.length > input.maxLength || input === version && !/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/u.test(input.value) || input === constraints && (input.value.split("\n").length > 12 || input.value.split("\n").some(line => !line.trim() || line.length > 500))) {
          const previous = input.getAttribute("aria-describedby"); if (previous) input.ownerDocument.getElementById(previous)?.remove();
          input.setAttribute("aria-invalid", "true");
          const help = input.parentElement!.createSpan({ text: l("Check this required field, its length and format (version: 1.0.0; constraints: 1–12 nonempty lines, up to 500 characters each).", "Проверьте обязательное поле, длину и формат (версия: 1.0.0; ограничения: 1–12 непустых строк до 500 символов)."), attr: { id: `studio-field-${crypto.randomUUID()}` } });
          input.setAttribute("aria-describedby", help.id); translations.open = translatedFields.includes(input) || translations.open; input.focus(); return;
        }
        d.run(async () => {
        const next = validateRecipe({ ...recipe, name: { en: en.value, ru: ru.value }, description: { en: den.value, ru: dru.value }, version: version.value,
          steps: [{ type: "llm_transform", prompt: prompt.value }], constraints: constraints.value.split("\n"), output: { format: "markdown", action: action.value } });
        if (expected) await this.owner.registry.edit(next, expected); else await this.owner.registry.add(next);
        this.selected = next; this.route = "details"; this.render();
      }); });
    });
  }
  private importRecipe(): void {
    this.dialog((d, root) => {
      d.protectDraft();
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
    button(this.body, l("← Recipe", "← Сценарий"), "back-recipe", () => this.navigate("details"));
    let draft = this.setupDrafts.get(recipe.id);
    if (!draft) { draft = { chosen: new Set(), query: "", mode: "files", folder: "", language: recipe.parameters.language, instructions: recipe.parameters.instructions, context: "32768" }; this.setupDrafts.set(recipe.id, draft); }
    connectionSummary(this.body, this.owner.connection());
    const state = draft, paths = this.owner.inventory(), chosen = state.chosen;
    const mode = select(this.body, l("Selection", "Выбор"), [["files", l("Choose individual notes", "Выбрать отдельные заметки")], ["folder", l("Choose a folder including subfolders", "Выбрать папку с подпапками")]], state.mode);
    const picker = this.body.createDiv();
    notePicker(picker, paths, state, 20);
    const folderBox = this.body.createDiv(); folderBox.hidden = state.mode !== "folder"; picker.hidden = state.mode !== "files";
    const folders = new Set<string>();
    for (const path of paths) { const parts = path.split("/"); for (let n = 1; n < parts.length; n++) folders.add(parts.slice(0, n).join("/")); }
    const folder = select(folderBox, l("Folder", "Папка"), [["", l("Choose a folder…", "Выберите папку…")], ["/", l("Vault root (all Markdown)", "Корень хранилища (весь Markdown)")], ...[...folders].sort().map(p => [p, p] as [string, string])], state.folder);
    const folderCount = folderBox.createDiv({ attr: { role: "status" } });
    const folderSelection = () => { const selected = paths.filter(p => folder.value === "/" || folder.value && p.startsWith(`${folder.value}/`)); folderCount.setText(`${selected.length} / 20\n${selected.join("\n")}`); };
    folder.addEventListener("change", () => { state.folder = folder.value; folderSelection(); }); folderSelection();
    mode.addEventListener("change", () => { state.mode = mode.value; picker.hidden = mode.value !== "files"; folderBox.hidden = mode.value !== "folder"; });
    const language = select(this.body, l("Output language", "Язык результата"), [["source", l("Source language", "Язык исходника")], ["en", "English"], ["ru", "Русский"]], state.language);
    language.addEventListener("change", () => { state.language = language.value; });
    const instructions = field(this.body, l("Additional instructions (optional, up to 2,000 characters)", "Дополнительные инструкции (необязательно, до 2 000 символов)"), state.instructions, true);
    instructions.addEventListener("input", () => { state.instructions = instructions.value; });
    const advanced = disclosure(this.body, l("Advanced · context budget", "Дополнительно · бюджет контекста"));
    const context = field(advanced, l("Context budget you verified for this model (tokens)", "Проверенный вами бюджет контекста модели (токены)"), state.context); context.setAttribute("type", "number");
    context.addEventListener("input", () => { state.context = context.value; });
    advanced.createEl("p", { text: l("Studio cannot discover model capacity. It reserves UTF-8 bytes + 128 plus the output limit. No silent truncation.", "Studio не определяет ёмкость модели: резерв UTF-8 байты + 128 и лимит выхода. Скрытой обрезки нет.") });
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
      this.body.createEl("p", { text: l("Closing a Studio tab keeps this run available in another tab. Stop prevents subsequent requests/writes; it cannot recall an issued request, which may still be charged.", "Закрытие вкладки Studio сохраняет запуск для другой вкладки. Остановка запрещает следующие запросы/записи, но не отзывает отправленный запрос; он всё ещё может быть оплачен.") });
      button(this.body, l("Stop after the current operation", "Остановить после текущей операции"), "cancel", () => runner.cancel()); return;
    }
    if (prepared && runner.state === "prepared") {
      this.body.createEl("h2", { text: l("Consent to send data", "Согласие на передачу данных") });
      this.body.createEl("p", { text: l("Properties policy: source YAML stays exact when changing the source; separate notes omit properties. Proposed model YAML is excluded and shown for comparison. Property editing is not supported. Generation does not authorize writing.", "Политика свойств: при изменении исходника его YAML сохраняется точно; отдельная заметка создаётся без свойств. YAML модели исключается и показывается для сравнения. Изменение свойств не поддерживается. Генерация не разрешает запись.") });
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
    if (this.reviewId !== review.id) { this.reviewId = review.id; this.selectedRows.clear(); this.destination = "new-note"; this.targetNames.clear(); }
    this.body.createEl("h2", { text: l("Review changes", "Проверка изменений") });
    this.body.createEl("p", { text: l("Meaning is not automatically verified. Inspect the final literal Markdown and diff; select the files to write.", "Смысл автоматически не проверен. Проверьте итоговый Markdown и diff; выберите файлы для записи.") });
    const destination = select(this.body, l("Save result to", "Куда сохранить результат"), [["new-note", l("Separate note — source unchanged", "Отдельная заметка — исходник без изменений")], ["source", l("Source note — replace body / append section", "Исходная заметка — заменить тело / добавить раздел")]], this.destination);
    destination.dataset.studioDestination = "true"; destination.disabled = !runner.canApply;
    destination.addEventListener("change", () => { this.destination = destination.value as MarkdownDestination; runner.discardWritePlan(); this.render(); });
    this.body.createEl("p", { text: this.destination === "new-note" ? l("Same folder only. Source properties are not copied; a source link is added. Links can still change context. Results open separately in source mode.", "Только папка исходника. Его свойства не копируются; добавляется ссылка на источник. Контекст ссылок всё ещё может измениться. Открытие результата — отдельно, в исходном режиме.") : l("Original YAML is preserved exactly. The recipe replaces the body or appends a section; it cannot change properties.", "Исходный YAML сохраняется точно. Сценарий заменяет тело или добавляет раздел; свойства он не изменяет.") });
    const targetFor = (path: string) => {
      if (this.destination === "source") return path;
      if (!this.targetNames.has(path)) this.targetNames.set(path, suggestedTarget(path, this.owner.creator.targets.paths()));
      return this.targetNames.get(path)!;
    };
    const count = this.body.createDiv({ attr: { role: "status" } }); let writeButton: HTMLButtonElement | undefined;
    const updateCount = () => {
      count.setText(`${this.selectedRows.size} / ${review.rows.length} · ${this.destination === "new-note" ? l("new notes; sources unchanged", "новых заметок; исходники не изменятся") : l("source changes", "изменений исходников")}`);
      writeButton?.setText(`${this.destination === "new-note" ? l("Create notes", "Создать заметки") : l("Change sources", "Изменить исходники")}: ${this.selectedRows.size}`);
    };
    updateCount();
    const applyActions = toolbar(this.body);
    const workspace = this.body.createDiv({ cls: "veynrel-studio-review" }), files = workspace.createDiv({ cls: "veynrel-studio-review-files" }), detail = workspace.createDiv({ cls: "veynrel-studio-review-detail" });
    if (!review.rows.some(r => r.path === this.reviewPath)) this.reviewPath = review.rows[0]?.path ?? "";
    const show = () => {
      detail.empty(); const row = review.rows.find(r => r.path === this.reviewPath); if (!row) return;
      detail.createEl("h3", { text: row.path });
      const result = runner.results?.find(r => r.path === row.path);
      detail.createEl("p", { text: `${status(row.action)} · ${status(result?.outcome ?? row.status)}` });
      if (row.reason || result?.reason) detail.createEl("p", { text: errorMessage(result?.reason ?? row.reason!), attr: { role: "alert" } });
      literal(detail, l("Original saved Markdown", "Исходный сохранённый Markdown"), row.before);
      if (row.rawResponse !== undefined) literal(detail, l("Raw model response", "Сырой ответ модели"), row.rawResponse);
      if (row.document?.proposedPrefix) {
        detail.createEl("p", { text: l("Proposed property changes are not applied.", "Предложенные изменения свойств не применяются.") });
        literal(detail, l("Source properties / excluded model properties", "Свойства исходника / исключённые свойства модели"), `${row.document.sourcePrefix}\n→\n${row.document.proposedPrefix}`);
      }
      if (row.after !== null) {
        const target = targetFor(row.path), pair = detail.createEl("p", { text: `${row.path} → ${target}` });
        if (this.destination === "new-note" && runner.canApply) {
          const name = field(detail, l("Result filename (.md), in the same folder", "Имя результата (.md), в той же папке"), target.slice(parentPath(target).length + (parentPath(target) ? 1 : 0)));
          name.dataset.studioTarget = row.path;
          name.addEventListener("input", () => { this.targetNames.set(row.path, `${parentPath(row.path) ? parentPath(row.path) + "/" : ""}${name.value}`); runner.discardWritePlan(); pair.setText(`${row.path} → ${targetFor(row.path)}`); });
        }
        try {
          const output = runner.previewOutput(row, this.destination, target);
          detail.createEl("h4", { text: l("Exact document to write", "Точный документ для записи") });
          detail.createEl("pre", { text: output, cls: "veynrel-studio-literal", attr: { tabindex: "0", "data-studio-final": row.path } });
          const diff = disclosure(detail, l("Source → final document diff", "Diff: исходник → итоговый документ"));
          renderPlanDiff(diff, row.before, output);
          const observations = [...(row.checks?.findings ?? []), ...(this.destination === "new-note" ? linkContextFindings(row.document?.separateBody ?? "", row.path) : [])];
          const findings = disclosure(detail, `${l("Local observations", "Локальные замечания")}: ${Math.min(observations.length, 60)} · ${row.checks?.coverage === "partial" || observations.length >= 60 ? l("incomplete", "неполная проверка") : l("limited patterns", "ограниченные шаблоны")}`);
          findings.createEl("p", { text: l("No findings does not prove meaning was preserved. Checks cover only documented text patterns.", "Отсутствие замечаний не доказывает сохранение смысла. Проверяются только описанные текстовые шаблоны.") });
          for (const finding of observations.slice(0, 60)) {
            const kind = { code: l("Code", "Код"), link: l("Link", "Ссылка"), number: l("Number", "Число"), qualifier: l("Qualifier", "Приблизительность"), time: l("Time", "Время"), attribution: l("Attribution", "Атрибуция"), "link-context": l("Link context", "Контекст ссылки") }[finding.kind];
            const item = findings.createDiv(); item.createEl("p", { text: `${kind} · ${l("body line", "строка тела")} ${finding.before.line} → ${finding.after?.line ?? "—"}: ${finding.kind === "link-context" ? l("Check the link context in the new note", "Проверьте контекст ссылки в новой заметке") : l("Source fragment not found in the result", "Исходный фрагмент не найден в результате")}` });
            item.createEl("pre", { text: `${finding.before.text}\n→\n${finding.after?.text ?? l("No matching fragment", "Нет соответствующего фрагмента")}`, cls: "veynrel-studio-literal" });
            button(item, l("Go to diff", "Перейти к diff"), "finding-diff", () => { diff.open = true; diff.scrollIntoView({ block: "start" }); });
          }
        } catch (e) { detail.createEl("p", { text: message(e), attr: { role: "alert" } }); }
      }
      if (result?.outcome === "created" && result.target) button(detail, l("Open result in source mode", "Открыть результат в исходном режиме"), "markdown-open", () => this.run(() => this.owner.creator.targets.open(result.target!)));
      files.querySelectorAll<HTMLElement>("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.path === this.reviewPath)));
    };
    for (const row of review.rows) {
      const item = files.createDiv({ cls: "veynrel-studio-review-file" });
      const choose = button(item, row.path, "review-file", () => { this.reviewPath = row.path; show(); }); choose.dataset.path = row.path;
      item.createSpan({ text: status(runner.results?.find(r => r.path === row.path)?.outcome ?? row.status), cls: "veynrel-studio-eyebrow" });
      if (row.after !== null && runner.canApply) {
        const label = item.createEl("label", { cls: "veynrel-studio-check" }), input = label.createEl("input", { type: "checkbox", attr: { "data-studio-select": row.path } });
        label.createSpan({ text: l("Include in writing", "Включить в запись") }); input.checked = this.selectedRows.has(row.path);
        input.addEventListener("change", () => { if (input.checked) this.selectedRows.add(row.path); else this.selectedRows.delete(row.path); runner.discardWritePlan(); updateCount(); });
      }
    }
    show();
    if (runner.canApply) writeButton = button(applyActions, "", "review-apply", () => {
      const selected = [...this.selectedRows]; if (!selected.length) { this.errorEl.setText(errorMessage("scope")); return; }
      this.run(async () => {
        const plan = await runner.reviewWrite(review, this.destination, selected.map(path => ({ path, target: targetFor(path) })));
        if (!this.alive) { runner.discardWritePlan(plan); return; } this.writeDialog(plan);
      });
    });
    updateCount();
  }
  private writeDialog(plan: StudioWritePlan): void {
    const runner = this.owner.runner;
    this.dialog((d, root) => {
      const create = plan.destination === "new-note";
      root.createEl("h2", { text: `${create ? l("Create notes", "Создать заметки") : l("Change source notes", "Изменить исходники")}: ${plan.rows.length}` });
      root.createEl("p", { text: create ? l("Sources stay unchanged. No automatic Undo/delete for created notes. Opening is a separate action.", "Исходники останутся без изменений. Автоматической отмены/удаления созданных заметок нет. Открытие — отдельное действие.") : errorMessage("editor") });
      root.createEl("p", { text: l("Sequential writes, possible partial completion. Exact paths only: no overwrite, suffix or rename after consent. Meaning is not automatically verified.", "Последовательная запись, возможно частичное выполнение. Только точные пути: без перезаписи, suffix и переименования после согласия. Смысл автоматически не проверен.") });
      for (const row of plan.rows) { root.createEl("p", { text: `${row.source.path} → ${row.target}` }); literal(root, l("Exact final Markdown", "Точный итоговый Markdown"), row.output); }
      let ack: HTMLInputElement | undefined;
      if (plan.requiresAcknowledgement) {
        const label = root.createEl("label", { cls: "veynrel-studio-check" }); ack = label.createEl("input", { type: "checkbox", attr: { "data-studio-ack": "true" } });
        label.createSpan({ text: l("I reviewed the local observations and excluded property changes for this exact plan and choose to change the sources.", "Я просмотрел локальные замечания и исключённые изменения свойств этого плана и выбираю изменение исходников.") });
      }
      const stop = button(root, l("Stop after the current file", "Остановить после текущего файла"), "cancel-apply", () => { if (d.pending) runner.cancel(); }); stop.disabled = true;
      const confirm = button(root, `${create ? l("Create", "Создать") : l("Change sources", "Изменить исходники")}: ${plan.rows.length}`, "confirm-apply", () => {
        if (d.pending || !d.active) return; stop.disabled = false;
        d.run(() => runner.confirmWrite(plan, ack?.checked ?? false));
      });
      if (ack) { confirm.disabled = true; ack.addEventListener("change", () => { confirm.disabled = !ack!.checked; }); }
    }, () => runner.discardWritePlan(plan));
  }
  private history(): void {
    const epoch = this.historyEpoch; this.body.createEl("h2", { text: l("Studio operation history", "История операций Studio") });
    button(this.body, l("Refresh history", "Обновить историю"), "refresh-history", () => this.render());
    const list = this.body.createDiv(); list.createEl("p", { text: l("Checking…", "Проверка…") });
    this.run(async () => {
      const rows = await this.owner.writer.history(), runs = await this.owner.writer.journal.runs(), created = await this.owner.creator.history();
      if (!this.alive || epoch !== this.historyEpoch) return; list.empty();

      for (const run of runs.filter(r => !rows.some(row => row.entry.id === r.id) && !created.some(row => row.entry.intent?.plan.reviewId === r.id))) {
        const card = list.createEl("article", { cls: "veynrel-studio-card" }); card.createEl("h3", { text: run.start?.recipeId ?? run.id });
        card.createEl("p", { text: status(run.damaged ? "damaged" : this.owner.runner.prepared?.id === run.id ? this.owner.runner.state : run.state) });
        if (run.start) card.createEl("p", { text: `${new Date(run.start.createdAt).toLocaleString()} · ${run.start.paths.join(", ")}` });
        literal(card, l("Operation details", "Подробности операции"), JSON.stringify(run, null, 2));
      }
      for (const row of rows) this.historyRow(list, row);
      for (const row of created) this.createHistoryRow(list, row);
      const diagrams = await this.diagram?.history(list, () => this.alive && epoch === this.historyEpoch);
      if (!this.alive || epoch !== this.historyEpoch) return;
      if (rows.length || runs.length || diagrams || created.length) list.createEl("p", { text: l("Recovery requires separate confirmation; inspection never repeats a request or write.", "Восстановление требует отдельного подтверждения; просмотр не повторяет запрос или запись.") });
      if (!rows.length && !runs.length && !diagrams && !created.length) {
        const empty = list.createDiv({ cls: "veynrel-studio-empty" }); setIcon(empty.createSpan(), "history");
        empty.createEl("h3", { text: l("No operations yet", "Пока нет операций") });
        empty.createEl("p", { text: l("Choose a note task or create a diagram. Results will appear here.", "Выберите действие с заметкой или создайте схему. Результаты появятся здесь.") });
        const actions = toolbar(empty);
        button(actions, l("Process a note", "Обработать заметку"), "history-library", () => this.navigate("library"));
        button(actions, l("Create diagram", "Создать схему"), "history-diagram", () => this.navigate("diagram"));
      }
    });
  }
  private createHistoryRow(root: HTMLElement, row: MarkdownCreateHistory): void {
    const card = root.createEl("article", { cls: "veynrel-studio-card" }); card.createEl("h3", { text: `${row.source} → ${row.target || row.entry.id}` });
    card.createEl("p", { text: `${l("Separate Markdown note", "Отдельная Markdown-заметка")} · ${status(row.state)}` });
    card.createEl("p", { text: l("Source unchanged by this operation. No automatic Undo or deletion.", "Эта операция не изменяет исходник. Автоматической отмены или удаления нет.") });
    literal(card, l("Creation evidence", "Данные создания"), JSON.stringify({ id: row.entry.id, plan: row.entry.intent?.plan.id, index: row.index,
      marks: row.entry.marks.filter(m => m.index === row.index), damaged: row.entry.damaged }, null, 2));
    if (row.state === "created" || row.state === "modified") button(card, l("Open result in source mode", "Открыть результат в исходном режиме"), "markdown-open", () => this.run(() => this.owner.creator.targets.open(row.target)));
    if (row.observed) button(card, l("Review observed outcome", "Проверить наблюдаемый исход"), "markdown-recover", () => this.run(async () => {
      const ticket = await this.owner.creator.reviewRecovery(row.entry.id, row.index);
      if (!this.alive) { this.owner.creator.discard(ticket); return; }
      this.dialog((d, body) => {
        body.createEl("h2", { text: l("Record observed state only", "Записать только наблюдаемое состояние") });
        body.createEl("p", { text: `${ticket.target} · ${status(ticket.state)}` });
        body.createEl("p", { text: l("This creates only a receipt. It never creates, rewrites or deletes the note, or calls the model.", "Будет создана только квитанция. Заметка не создаётся, не переписывается и не удаляется; запроса к модели нет.") });
        literal(body, l("Observed Markdown", "Наблюдаемый Markdown"), ticket.output);
        button(body, l("Confirm observation", "Подтвердить наблюдение"), "markdown-confirm-recovery", () => d.run(async () => { await this.owner.creator.executeRecovery(ticket); this.render(); }));
      }, () => this.owner.creator.discard(ticket));
    }));
  }
  private historyRow(root: HTMLElement, row: StudioHistoryRow): void {
    const card = root.createEl("article", { cls: "veynrel-studio-card" }); card.createEl("h3", { text: row.path || row.entry.id }); card.createEl("p", { text: `${status(row.state)} · ${row.entry.record ? status(row.entry.record.changes[row.index]?.action ?? "") : ""} · ${row.entry.record ? new Date(row.entry.record.createdAt).toLocaleString() : l("Unknown time", "Время неизвестно")}` });
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
